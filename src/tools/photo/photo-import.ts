import { detectRawSource, RAW_EXTENSION } from './codecs/raw-decoder';

export const PHOTO_FILE_ACCEPT = 'image/*,.tif,.tiff,.dng,.cr2,.cr3,.nef,.arw,.raf,.orf,.rw2,.pef,.srw';

export type PhotoImportSource = 'file-input' | 'drop' | 'clipboard';

export type PhotoImportErrorCode =
  | 'no-image'
  | 'clipboard-unavailable'
  | 'clipboard-denied'
  | 'clipboard-failed';

export interface PhotoImportCandidate {
  file: File;
  source: PhotoImportSource;
}

export interface PhotoImportRaster {
  blob: Blob;
  notice?: string;
}

const rasterCache = new WeakMap<Blob, Promise<PhotoImportRaster>>();

export function releasePhotoRaster(file: Blob): void {
  rasterCache.delete(file);
}

/** Preserve the source; all consumers share one lazy codec raster. */
export function preparePhotoRaster(file: Blob): Promise<PhotoImportRaster> {
  const existing = rasterCache.get(file);
  if (existing) return existing;
  const task = (async () => {
    if (await detectRawSource(file)) {
      const { prepareRawSource } = await import('./codecs/raw-source');
      return prepareRawSource(file);
    }
    const signature = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    const hasTiffSignature = signature.length === 4 && (
      (signature[0] === 73 && signature[1] === 73 && [42, 43].includes(signature[2]) && signature[3] === 0)
      || (signature[0] === 77 && signature[1] === 77 && signature[2] === 0 && [42, 43].includes(signature[3]))
    );
    const name = 'name' in file ? String(file.name) : '';
    const type = file.type.trim().toLowerCase();
    if (hasTiffSignature || /^image\/(?:x-)?tiff$/i.test(type)
      || ((!type || type === 'application/octet-stream') && /\.tiff?$/i.test(name))) {
      const { prepareTiffSource } = await import('./codecs/tiff-source');
      return prepareTiffSource(file);
    }
    return { blob: file };
  })();
  rasterCache.set(file, task);
  void task.catch(() => rasterCache.delete(file));
  return task;
}

export interface PhotoClipboardItemLike {
  readonly types: readonly string[];
  getType(type: string): Promise<Blob>;
}

export interface PhotoClipboardReader {
  read(): Promise<readonly PhotoClipboardItemLike[]>;
}

export class PhotoImportError extends Error {
  readonly code: PhotoImportErrorCode;
  readonly source: PhotoImportSource;

  constructor(code: PhotoImportErrorCode, source: PhotoImportSource, message: string) {
    super(message);
    this.name = 'PhotoImportError';
    this.code = code;
    this.source = source;
  }
}

const IMAGE_EXTENSION = /\.(?:avif|bmp|gif|heic|heif|jpe?g|jfif|png|tiff?|webp)$/i;

export function isPhotoImportFile(file: Pick<File, 'name' | 'type'>): boolean {
  const explicitType = file.type.trim().toLowerCase();
  return explicitType
    ? explicitType.startsWith('image/') || (explicitType === 'application/octet-stream' && (/\.tiff?$/i.test(file.name) || RAW_EXTENSION.test(file.name)))
    : IMAGE_EXTENSION.test(file.name) || RAW_EXTENSION.test(file.name);
}

function noImageError(source: PhotoImportSource): PhotoImportError {
  if (source === 'drop') {
    return new PhotoImportError(
      'no-image',
      source,
      'No browser-readable image was dropped. Drop a still image, or use Open photo.',
    );
  }
  if (source === 'clipboard') {
    return new PhotoImportError(
      'no-image',
      source,
      'The clipboard does not contain a browser-readable image. Copy an image, or use Open photo or drag-and-drop.',
    );
  }
  return new PhotoImportError(
    'no-image',
    source,
    'That selection does not contain a browser-readable image. Choose a JPEG, PNG, WebP, or another still image your browser supports.',
  );
}

export function normalizePhotoImport(
  files: Iterable<File> | ArrayLike<File>,
  source: PhotoImportSource,
): PhotoImportCandidate {
  const file = Array.from(files).find(isPhotoImportFile);
  if (!file) throw noImageError(source);
  return { file, source };
}

function clipboardFilename(mime: string): string {
  const extension = mime === 'image/jpeg'
    ? 'jpg'
    : mime.slice('image/'.length).toLowerCase().replace(/[^a-z0-9]+/g, '') || 'image';
  return `clipboard-image.${extension}`;
}

function clipboardReadError(error: unknown): PhotoImportError {
  const name = typeof error === 'object' && error && 'name' in error ? String(error.name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return new PhotoImportError(
      'clipboard-denied',
      'clipboard',
      'Clipboard access was denied. Allow image clipboard access and try again; Open photo and drag-and-drop remain available.',
    );
  }
  return new PhotoImportError(
    'clipboard-failed',
    'clipboard',
    `Could not read an image from the clipboard${error instanceof Error && error.message ? `: ${error.message}` : '.'}`,
  );
}

export async function readPhotoClipboard(
  clipboard: PhotoClipboardReader | undefined,
): Promise<PhotoImportCandidate> {
  if (!clipboard?.read) {
    throw new PhotoImportError(
      'clipboard-unavailable',
      'clipboard',
      'Direct clipboard image reading is unavailable in this browser. Use Open photo, drag-and-drop, or press Ctrl+V with an image.',
    );
  }

  let items: readonly PhotoClipboardItemLike[];
  try {
    items = await clipboard.read();
  } catch (error) {
    throw clipboardReadError(error);
  }

  for (const item of items) {
    const mime = item.types.find((type) => type.toLowerCase().startsWith('image/'));
    if (!mime) continue;
    let blob: Blob;
    try {
      blob = await item.getType(mime);
    } catch (error) {
      throw clipboardReadError(error);
    }
    const type = blob.type || mime;
    return normalizePhotoImport([
      new File([blob], clipboardFilename(type), { type }),
    ], 'clipboard');
  }

  throw noImageError('clipboard');
}

export function photoImportErrorMessage(error: unknown): string {
  if (error instanceof PhotoImportError) return error.message;
  return `Could not import that photo${error instanceof Error && error.message ? `: ${error.message}` : '.'}`;
}

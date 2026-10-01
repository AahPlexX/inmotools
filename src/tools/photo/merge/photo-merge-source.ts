import { preparePhotoRaster, releasePhotoRaster } from '../photo-import';
import type { PhotoMergeRaster } from './photo-merge-types';

/** What the merge panel knows about a chosen photo before any full-resolution pixels are held:
 * its decoded dimensions (after TIFF/RAW development and orientation) plus the capture facts a
 * merge can use. Pixels are decoded only when the merge actually runs. */
export interface PhotoMergeSourceInfo {
  id: string;
  file: File;
  name: string;
  width: number;
  height: number;
  /** Shutter time in seconds from EXIF, when the file reports one. */
  exposureTime: number | null;
  /** 35 mm-equivalent focal length from EXIF, used to suggest a panorama field of view. */
  focalLength35: number | null;
}

interface ExifTagLike { value?: unknown }

function rational(tag: ExifTagLike | undefined): number | null {
  const value = tag?.value;
  if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'number' && value[1] !== 0) {
    const result = value[0] / value[1];
    return Number.isFinite(result) && result > 0 ? result : null;
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  return null;
}

/** Reads the two capture facts merges use. EXIF is optional: any parse failure simply means the
 * user enters the value, so this never throws. The parser is loaded only when a merge needs it. */
export async function readMergeExif(file: File): Promise<Pick<PhotoMergeSourceInfo, 'exposureTime' | 'focalLength35'>> {
  try {
    const { default: ExifReader } = await import('exifreader');
    const tags = await ExifReader.load(file) as Record<string, ExifTagLike | undefined>;
    return { exposureTime: rational(tags.ExposureTime), focalLength35: rational(tags.FocalLengthIn35mmFilm) };
  } catch {
    return { exposureTime: null, focalLength35: null };
  }
}

let nextSourceId = 0;

export async function inspectMergeSource(file: File): Promise<PhotoMergeSourceInfo> {
  try {
    const raster = await preparePhotoRaster(file);
    const bitmap = await createImageBitmap(raster.blob, { imageOrientation: 'from-image' });
    const { width, height } = bitmap;
    bitmap.close();
    const exif = await readMergeExif(file);
    nextSourceId += 1;
    return { id: `merge-source-${nextSourceId}`, file, name: file.name, width, height, ...exif };
  } finally {
    // Only dimensions are kept; a TIFF/RAW development is redone at merge time.
    releasePhotoRaster(file);
  }
}

function drawingContext(width: number, height: number) {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('This browser could not create a drawing surface for merging.');
    return { canvas, context };
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser could not create a drawing surface for merging.');
  return { canvas, context };
}

/** Decodes one photo to an RGBA8 raster the size reported by `inspectMergeSource`. */
export async function decodeMergeRaster(source: Pick<PhotoMergeSourceInfo, 'file' | 'width' | 'height' | 'name'>): Promise<PhotoMergeRaster> {
  try {
    const raster = await preparePhotoRaster(source.file);
    const bitmap = await createImageBitmap(raster.blob, { imageOrientation: 'from-image' });
    try {
      if (bitmap.width !== source.width || bitmap.height !== source.height) {
        throw new Error(`${source.name} changed since it was chosen. Remove it and add it again.`);
      }
      const { context } = drawingContext(bitmap.width, bitmap.height);
      context.drawImage(bitmap, 0, 0);
      const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
      return { width: pixels.width, height: pixels.height, buffer: pixels.data.buffer as ArrayBuffer };
    } finally {
      bitmap.close();
    }
  } finally {
    releasePhotoRaster(source.file);
  }
}

/** Encodes a merged raster as a lossless PNG file so it opens through the ordinary import path and
 * every editing, project, and export feature treats it like any other photo. */
export async function mergeResultToFile(raster: PhotoMergeRaster, name: string): Promise<File> {
  const { canvas, context } = drawingContext(raster.width, raster.height);
  context.putImageData(new ImageData(new Uint8ClampedArray(raster.buffer, 0, raster.width * raster.height * 4), raster.width, raster.height), 0, 0);
  const blob = canvas instanceof HTMLCanvasElement
    ? await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('PNG encoding failed.'))), 'image/png'))
    : await canvas.convertToBlob({ type: 'image/png' });
  if (blob.type !== 'image/png') throw new Error('This browser could not encode the merged photo as PNG.');
  return new File([blob], name, { type: 'image/png', lastModified: Date.now() });
}

/** File name for a merge result: the first source's stem plus the operation, e.g. "IMG_2041-hdr.png". */
export function mergeResultName(firstSourceName: string, operation: string): string {
  const stem = firstSourceName.replace(/\.[^.]+$/, '').replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'photo';
  return `${stem}-${operation}.png`;
}

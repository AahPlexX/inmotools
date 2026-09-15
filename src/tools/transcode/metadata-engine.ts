// Metadata editing at export (F34 image, F35 audio helpers).
// PNG metadata uses deterministic tEXt chunks (pure JS, unit-testable);
// JPEG EXIF uses piexifjs and XMP uses direct packet surgery.

export interface ImageMetadata {
  title?: string;
  artist?: string;
  description?: string;
  copyright?: string;
  software?: string;
  creationTime?: string;
  stripExisting?: boolean;
}

export function hasImageMetadata(meta: ImageMetadata | undefined): boolean {
  if (!meta) return false;
  return Boolean(meta.title || meta.artist || meta.description || meta.copyright || meta.software || meta.creationTime || meta.stripExisting);
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) crc = crcTable[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const TEXT_KEYWORDS: Array<[keyof ImageMetadata, string]> = [
  ['title', 'Title'],
  ['artist', 'Author'],
  ['description', 'Description'],
  ['copyright', 'Copyright'],
  ['software', 'Software'],
  ['creationTime', 'Creation Time'],
];

function buildTextChunk(keyword: string, value: string): Uint8Array {
  const keywordBytes = new TextEncoder().encode(keyword);
  const valueBytes = new TextEncoder().encode(value);
  const length = keywordBytes.length + 1 + valueBytes.length;
  const chunk = new Uint8Array(12 + length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, length);
  chunk.set([0x74, 0x45, 0x58, 0x74], 4); // tEXt
  chunk.set(keywordBytes, 8);
  chunk[8 + keywordBytes.length] = 0;
  chunk.set(valueBytes, 9 + keywordBytes.length);
  view.setUint32(8 + length, crc32(chunk.subarray(4, 8 + length)));
  return chunk;
}

/** Insert tEXt chunks into a PNG stream right after IHDR. */
export function writePngMetadata(png: Uint8Array, meta: ImageMetadata): Uint8Array {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  // PNG signature (8) + IHDR chunk (25) is where text chunks get inserted.
  let insertAt = 8;
  const firstType = String.fromCharCode(png[12], png[13], png[14], png[15]);
  if (firstType === 'IHDR') insertAt = 8 + 8 + view.getUint32(8) + 4;

  let stripped = png;
  if (meta.stripExisting) stripped = stripPngTextChunks(png);

  const chunks: Uint8Array[] = [];
  for (const [key, keyword] of TEXT_KEYWORDS) {
    const value = meta[key];
    if (typeof value === 'string' && value.length > 0) chunks.push(buildTextChunk(keyword, value));
  }
  if (chunks.length === 0) return stripped;

  const insertPos = meta.stripExisting ? findInsertPosition(stripped) : insertAt;
  const totalExtra = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(stripped.length + totalExtra);
  out.set(stripped.subarray(0, insertPos), 0);
  let cursor = insertPos;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  out.set(stripped.subarray(insertPos), cursor);
  return out;
}

function findInsertPosition(png: Uint8Array): number {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let position = 8;
  while (position + 8 <= png.length) {
    const length = view.getUint32(position);
    const type = String.fromCharCode(png[position + 4], png[position + 5], png[position + 6], png[position + 7]);
    if (type === 'IHDR') return position + 8 + length + 4;
    position += 8 + length + 4;
  }
  return 33;
}

/** Remove tEXt/iTXt/zTXt chunks (optionally also all ancillary metadata). */
export function stripPngTextChunks(png: Uint8Array): Uint8Array {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const kept: Uint8Array[] = [png.slice(0, 8)];
  let position = 8;
  while (position + 8 <= png.length) {
    const length = view.getUint32(position);
    const type = String.fromCharCode(png[position + 4], png[position + 5], png[position + 6], png[position + 7]);
    const chunkSize = 8 + length + 4;
    if (type !== 'tEXt' && type !== 'iTXt' && type !== 'zTXt') {
      kept.push(png.slice(position, position + chunkSize));
    }
    position += chunkSize;
    if (type === 'IEND') break;
  }
  const total = kept.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of kept) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
}

export function readPngTextChunks(png: Uint8Array): Record<string, string> {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const result: Record<string, string> = {};
  let position = 8;
  while (position + 8 <= png.length) {
    const length = view.getUint32(position);
    const type = String.fromCharCode(png[position + 4], png[position + 5], png[position + 6], png[position + 7]);
    if (type === 'tEXt') {
      const payload = png.subarray(position + 8, position + 8 + length);
      const separator = payload.indexOf(0);
      if (separator > 0) {
        const keyword = new TextDecoder('latin1').decode(payload.subarray(0, separator));
        const value = new TextDecoder('latin1').decode(payload.subarray(separator + 1));
        result[keyword] = value;
      }
    }
    position += 8 + length + 4;
    if (type === 'IEND') break;
  }
  return result;
}

// ---------------------------------------------------------------------------
// JPEG: EXIF via piexifjs, XMP via packet replacement
// ---------------------------------------------------------------------------

export async function writeJpegMetadata(jpeg: Uint8Array, meta: ImageMetadata): Promise<Uint8Array> {
  const piexif = (await import('piexifjs')).default;
  // piexifjs operates on latin-1 binary strings (or data URIs).
  let binary = binaryToString(jpeg);
  if (meta.stripExisting) binary = piexif.remove(binary);

  type ExifDict = Parameters<typeof piexif.dump>[0];
  let exif: ExifDict = { '0th': {}, Exif: {}, GPS: {}, '1st': {}, Interop: {} };
  try {
    exif = piexif.load(binary);
  } catch {
    // No existing EXIF: start from a clean dict.
  }
  if (meta.title) exif['0th'][piexif.ImageIFD.ImageDescription] = meta.title;
  if (meta.artist) exif['0th'][piexif.ImageIFD.Artist] = meta.artist;
  if (meta.copyright) exif['0th'][piexif.ImageIFD.Copyright] = meta.copyright;
  if (meta.software) exif['0th'][piexif.ImageIFD.Software] = meta.software;
  if (meta.creationTime) exif['0th'][piexif.ImageIFD.DateTime] = meta.creationTime;
  if (meta.description) exif.Exif[piexif.ExifIFD.UserComment] = meta.description;

  const hasEntries = Object.values(exif['0th'] ?? {}).length > 0 || Object.values(exif.Exif ?? {}).length > 0;
  if (hasEntries || meta.stripExisting) {
    const exifBytes = piexif.dump(exif);
    binary = piexif.insert(exifBytes, binary);
  }
  return stringToBinary(binary);
}

export async function stripJpegMetadata(jpeg: Uint8Array): Promise<Uint8Array> {
  const piexif = (await import('piexifjs')).default;
  return stringToBinary(piexif.remove(binaryToString(jpeg)));
}

function binaryToString(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return binary;
}

function stringToBinary(binary: string): Uint8Array {
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i) & 0xff;
  return out;
}

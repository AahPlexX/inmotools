import type { PhotoOutputMime } from './photo-types';

const encoder = new TextEncoder();
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const JPEG_XMP_IDENTIFIER = encoder.encode('http://ns.adobe.com/xap/1.0/\0');
const PNG_XMP_KEYWORD = encoder.encode('XML:com.adobe.xmp');

export interface PhotoMetadataEmbeddingOptions {
  width: number;
  height: number;
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  const length = parts.reduce((sum, part) => sum + part.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

function bytesEqualAt(bytes: Uint8Array, expected: Uint8Array, offset: number): boolean {
  if (offset < 0 || offset + expected.length > bytes.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected[index]) return false;
  }
  return true;
}

function readUint32Be(bytes: Uint8Array, offset: number): number {
  return (((bytes[offset] << 24) >>> 0)
    | (bytes[offset + 1] << 16)
    | (bytes[offset + 2] << 8)
    | bytes[offset + 3]) >>> 0;
}

function readUint32Le(bytes: Uint8Array, offset: number): number {
  return (bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | ((bytes[offset + 3] << 24) >>> 0)) >>> 0;
}

function uint32Be(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function uint32Le(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function writeUint24Le(bytes: Uint8Array, offset: number, value: number): void {
  bytes[offset] = value & 0xff;
  bytes[offset + 1] = (value >>> 8) & 0xff;
  bytes[offset + 2] = (value >>> 16) & 0xff;
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let value = '';
  for (let index = 0; index < length; index += 1) value += String.fromCharCode(bytes[offset + index]);
  return value;
}

function jpegWithoutStandardXmp(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('JPEG metadata embedding received invalid JPEG data.');
  const parts: Uint8Array[] = [bytes.slice(0, 2)];
  let offset = 2;

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff || offset + 1 >= bytes.length) {
      parts.push(bytes.slice(offset));
      break;
    }
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) {
      parts.push(bytes.slice(offset));
      break;
    }
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(bytes.slice(offset, offset + 2));
      offset += 2;
      continue;
    }
    if (offset + 4 > bytes.length) throw new Error('JPEG metadata embedding found a truncated segment header.');
    const segmentLength = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (segmentLength < 2 || offset + 2 + segmentLength > bytes.length) throw new Error('JPEG metadata embedding found a truncated segment.');
    const segmentEnd = offset + 2 + segmentLength;
    const isStandardXmp = marker === 0xe1 && bytesEqualAt(bytes, JPEG_XMP_IDENTIFIER, offset + 4);
    if (!isStandardXmp) parts.push(bytes.slice(offset, segmentEnd));
    offset = segmentEnd;
  }

  return concatBytes(parts);
}

function embedJpegXmp(bytes: Uint8Array, xmp: Uint8Array): Uint8Array {
  const source = jpegWithoutStandardXmp(bytes);
  const payload = concatBytes([JPEG_XMP_IDENTIFIER, xmp]);
  const segmentLength = payload.length + 2;
  if (segmentLength > 0xffff) {
    throw new Error('XMP is too large for a standard JPEG APP1 segment. Download the XMP sidecar instead.');
  }
  const segment = concatBytes([
    new Uint8Array([0xff, 0xe1, (segmentLength >>> 8) & 0xff, segmentLength & 0xff]),
    payload,
  ]);
  return concatBytes([source.slice(0, 2), segment, source.slice(2)]);
}

let crcTable: Uint32Array | null = null;

function pngCrc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let index = 0; index < 256; index += 1) {
      let value = index;
      for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
      crcTable[index] = value >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  if (type.length !== 4) throw new Error('PNG chunk type must be four characters.');
  const typeBytes = encoder.encode(type);
  return concatBytes([
    uint32Be(data.length),
    typeBytes,
    data,
    uint32Be(pngCrc32(concatBytes([typeBytes, data]))),
  ]);
}

function isPngXmpITxt(data: Uint8Array): boolean {
  return bytesEqualAt(data, PNG_XMP_KEYWORD, 0) && data[PNG_XMP_KEYWORD.length] === 0;
}

function embedPngXmp(bytes: Uint8Array, xmp: Uint8Array): Uint8Array {
  if (!bytesEqualAt(bytes, PNG_SIGNATURE, 0)) throw new Error('PNG metadata embedding received invalid PNG data.');
  const xmpData = concatBytes([
    PNG_XMP_KEYWORD,
    new Uint8Array([0, 0, 0, 0, 0]),
    xmp,
  ]);
  const xmpChunk = pngChunk('iTXt', xmpData);
  const parts: Uint8Array[] = [PNG_SIGNATURE];
  let offset = PNG_SIGNATURE.length;
  let foundIend = false;

  while (offset + 12 <= bytes.length) {
    const length = readUint32Be(bytes, offset);
    const end = offset + 12 + length;
    if (end > bytes.length) throw new Error('PNG metadata embedding found a truncated chunk.');
    const type = ascii(bytes, offset + 4, 4);
    const data = bytes.slice(offset + 8, offset + 8 + length);
    if (type === 'IEND') {
      parts.push(xmpChunk);
      parts.push(bytes.slice(offset, end));
      foundIend = true;
      offset = end;
      break;
    }
    if (!(type === 'iTXt' && isPngXmpITxt(data))) parts.push(bytes.slice(offset, end));
    offset = end;
  }

  if (!foundIend) throw new Error('PNG metadata embedding could not find IEND.');
  if (offset < bytes.length) parts.push(bytes.slice(offset));
  return concatBytes(parts);
}

interface WebpChunk {
  type: string;
  data: Uint8Array;
}

function parseWebpChunks(bytes: Uint8Array): WebpChunk[] {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') {
    throw new Error('WebP metadata embedding received invalid RIFF/WebP data.');
  }
  const declaredSize = readUint32Le(bytes, 4) + 8;
  if (declaredSize > bytes.length) throw new Error('WebP metadata embedding found a truncated RIFF container.');
  const chunks: WebpChunk[] = [];
  let offset = 12;
  while (offset + 8 <= declaredSize) {
    const type = ascii(bytes, offset, 4);
    const length = readUint32Le(bytes, offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd > declaredSize) throw new Error('WebP metadata embedding found a truncated chunk.');
    chunks.push({ type, data: bytes.slice(dataStart, dataEnd) });
    offset = dataEnd + (length & 1);
  }
  return chunks;
}

function webpChunk(type: string, data: Uint8Array): Uint8Array {
  if (type.length !== 4) throw new Error('WebP chunk FourCC must be four characters.');
  const padding = data.length & 1 ? new Uint8Array([0]) : new Uint8Array();
  return concatBytes([encoder.encode(type), uint32Le(data.length), data, padding]);
}

function vp8lUsesAlpha(chunks: readonly WebpChunk[]): boolean {
  const lossless = chunks.find((chunk) => chunk.type === 'VP8L');
  if (!lossless || lossless.data.length < 5 || lossless.data[0] !== 0x2f) return false;
  const bits = readUint32Le(lossless.data, 1);
  return Boolean(bits & (1 << 28));
}

function makeVp8x(chunks: readonly WebpChunk[], width: number, height: number): WebpChunk {
  const safeWidth = Math.round(width);
  const safeHeight = Math.round(height);
  if (!Number.isFinite(safeWidth) || !Number.isFinite(safeHeight) || safeWidth < 1 || safeHeight < 1 || safeWidth > 0x1000000 || safeHeight > 0x1000000) {
    throw new Error('WebP metadata embedding received unsupported canvas dimensions.');
  }
  const data = new Uint8Array(10);
  let flags = 0x04;
  if (chunks.some((chunk) => chunk.type === 'ICCP')) flags |= 0x20;
  if (chunks.some((chunk) => chunk.type === 'ALPH') || vp8lUsesAlpha(chunks)) flags |= 0x10;
  if (chunks.some((chunk) => chunk.type === 'EXIF')) flags |= 0x08;
  if (chunks.some((chunk) => chunk.type === 'ANIM' || chunk.type === 'ANMF')) flags |= 0x02;
  data[0] = flags;
  writeUint24Le(data, 4, safeWidth - 1);
  writeUint24Le(data, 7, safeHeight - 1);
  return { type: 'VP8X', data };
}

function embedWebpXmp(bytes: Uint8Array, xmp: Uint8Array, options: PhotoMetadataEmbeddingOptions): Uint8Array {
  let chunks = parseWebpChunks(bytes).filter((chunk) => chunk.type !== 'XMP ');
  const vp8xIndex = chunks.findIndex((chunk) => chunk.type === 'VP8X');
  if (vp8xIndex >= 0) {
    if (chunks[vp8xIndex].data.length < 10) throw new Error('WebP metadata embedding found an invalid VP8X chunk.');
    const data = new Uint8Array(chunks[vp8xIndex].data);
    data[0] |= 0x04;
    chunks = chunks.map((chunk, index) => index === vp8xIndex ? { type: 'VP8X', data } : chunk);
  } else {
    chunks = [makeVp8x(chunks, options.width, options.height), ...chunks];
  }
  chunks.push({ type: 'XMP ', data: xmp });

  const body = concatBytes(chunks.map((chunk) => webpChunk(chunk.type, chunk.data)));
  return concatBytes([encoder.encode('RIFF'), uint32Le(body.length + 4), encoder.encode('WEBP'), body]);
}

export function embedPhotoXmpBytes(
  source: Uint8Array,
  mime: PhotoOutputMime,
  xmp: string,
  options: PhotoMetadataEmbeddingOptions,
): Uint8Array {
  const xmpBytes = encoder.encode(xmp);
  if (mime === 'image/jpeg') return embedJpegXmp(source, xmpBytes);
  if (mime === 'image/png') return embedPngXmp(source, xmpBytes);
  if (mime === 'image/webp') return embedWebpXmp(source, xmpBytes, options);
  const unsupported: never = mime;
  throw new Error(`Unsupported metadata container: ${String(unsupported)}`);
}

export async function embedPhotoXmp(
  source: Blob,
  mime: PhotoOutputMime,
  xmp: string,
  options: PhotoMetadataEmbeddingOptions,
): Promise<Blob> {
  const input = new Uint8Array(await source.arrayBuffer());
  const embedded = embedPhotoXmpBytes(input, mime, xmp, options);
  const owned = new Uint8Array(embedded.length);
  owned.set(embedded);
  return new Blob([owned.buffer], { type: mime });
}

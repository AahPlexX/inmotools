const SENSITIVE_RULES: Array<{ risk: MetadataRisk; pattern: RegExp }> = [
  { risk: 'location', pattern: /^GPS/i },
  { risk: 'location', pattern: /latitude|longitude|altitude/i },
  { risk: 'location', pattern: /^(city|province|state|country|location|sublocation|world region)/i },
  { risk: 'device', pattern: /serial/i },
  { risk: 'device', pattern: /^(make|model|lens|software|host ?computer|unique ?camera ?model)/i },
  { risk: 'identity', pattern: /artist|author|owner|by-?line|creator|credit|copyright|xpauthor|xpcomment|usercomment|imagedescription|document ?id|instance ?id|person|keywords/i },
  { risk: 'time', pattern: /datetime|create ?date|modify ?date|offset ?time|subsec|date ?stamp|^time$/i },
];

// ExifReader's names for ICC colour-profile tags. They describe the colour profile, not the photo or its author.
const ICC_PROFILE_TAGS = new Set([
  'Preferred CMM type', 'Profile Version', 'Profile/Device class', 'Color Space', 'Connection Space', 'ICC Profile Date',
  'ICC Signature', 'Primary Platform', 'Device Manufacturer', 'Device Model Number', 'Rendering Intent', 'Profile Creator',
  'ICC Copyright', 'ICC Description', 'ICC Device Manufacturer for Display', 'ICC Device Model Description', 'ICC Viewing Conditions Description',
]);

export type MetadataRisk = 'location' | 'device' | 'identity' | 'time' | 'setting';
export interface MetadataTag { description?: string | number; value?: unknown }
export interface SensitiveMetadata { key: string; value: string }
export interface ClassifiedMetadata extends SensitiveMetadata { risk: MetadataRisk }

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME', 'caBX']);

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length));
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

function concat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  parts.forEach((part) => {
    out.set(part, offset);
    offset += part.length;
  });
  return out;
}

function payloadStartsWith(payload: Uint8Array, text: string): boolean {
  if (payload.length < text.length) return false;
  return ascii(payload, 0, text.length) === text;
}

export function isAnimatedImage(bytes: Uint8Array, mimeType: string): boolean {
  if (mimeType === 'image/png') {
    if (bytes.length < 20 || ascii(bytes, 1, 3) !== 'PNG') return false;
    let offset = 8;
    while (offset + 12 <= bytes.length) {
      const chunkLength = readUint32Be(bytes, offset);
      const chunkType = ascii(bytes, offset + 4, 4);
      if (chunkType === 'acTL') return true;
      if (chunkType === 'IDAT') return false;
      const nextOffset = offset + 12 + chunkLength;
      if (nextOffset <= offset || nextOffset > bytes.length) return false;
      offset = nextOffset;
    }
    return false;
  }

  if (mimeType === 'image/webp') {
    if (bytes.length < 20 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return false;
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const chunkType = ascii(bytes, offset, 4);
      const chunkLength = readUint32Le(bytes, offset + 4);
      const dataOffset = offset + 8;
      if (chunkType === 'ANIM' || chunkType === 'ANMF') return true;
      if (chunkType === 'VP8X' && chunkLength >= 1 && dataOffset < bytes.length && (bytes[dataOffset] & 0x02) !== 0) return true;
      const nextOffset = dataOffset + chunkLength + (chunkLength & 1);
      if (nextOffset <= offset || nextOffset > bytes.length) return false;
      offset = nextOffset;
    }
  }

  return false;
}

export function formatTagValue(raw: unknown): string {
  const tag = raw as MetadataTag;
  const value = tag && typeof tag === 'object' && ('description' in tag || 'value' in tag)
    ? tag.description ?? tag.value ?? raw
    : raw;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function classifyMetadata(tags: Record<string, MetadataTag | unknown>): ClassifiedMetadata[] {
  return Object.entries(tags)
    .filter(([key]) => key !== 'Thumbnail' && !key.startsWith('__'))
    .map(([key, raw]) => {
      const rule = ICC_PROFILE_TAGS.has(key) ? undefined : SENSITIVE_RULES.find((candidate) => candidate.pattern.test(key));
      return { key, value: formatTagValue(raw), risk: rule?.risk ?? 'setting' };
    })
    .sort((left, right) => Number(left.risk === 'setting') - Number(right.risk === 'setting') || left.key.localeCompare(right.key));
}

export function listSensitiveMetadata(tags: Record<string, MetadataTag | unknown>): SensitiveMetadata[] {
  return classifyMetadata(tags)
    .filter((item) => item.risk !== 'setting')
    .map(({ key, value }) => ({ key, value }));
}

export function buildSanitizedFilename(filename: string, mimeType: string): string {
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : mimeType === 'image/heic' || mimeType === 'image/heif' ? 'heic' : 'jpg';
  const stem = filename.replace(/\.[^.]+$/, '');
  return `${stem}-sanitized.${extension}`;
}

export function buildSanitizedFilenameFromBlob(filename: string, blob: Pick<Blob, 'type'>): string {
  return buildSanitizedFilename(filename, blob.type);
}

export function stripJpegMetadata(bytes: Uint8Array, keepColorProfile = true): Uint8Array {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Not a JPEG file.');
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) throw new Error('JPEG marker structure is not readable, so metadata was not stripped.');
    let markerIndex = offset + 1;
    while (markerIndex < bytes.length && bytes[markerIndex] === 0xff) markerIndex += 1;
    if (markerIndex >= bytes.length) throw new Error('JPEG marker structure is not readable, so metadata was not stripped.');
    const marker = bytes[markerIndex];
    const markerStart = markerIndex - 1;
    if (marker === 0xd9) {
      parts.push(bytes.subarray(markerStart, markerIndex + 1));
      break;
    }
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(bytes.subarray(markerStart, markerIndex + 1));
      offset = markerIndex + 1;
      continue;
    }
    if (markerIndex + 2 >= bytes.length) throw new Error('JPEG segment is truncated, so metadata was not stripped.');
    const length = (bytes[markerIndex + 1] << 8) | bytes[markerIndex + 2];
    if (length < 2 || markerIndex + 1 + length > bytes.length) throw new Error('JPEG segment is truncated, so metadata was not stripped.');
    const segmentEnd = markerIndex + 1 + length;
    const payload = bytes.subarray(markerIndex + 3, segmentEnd);
    if (marker === 0xda) {
      parts.push(bytes.subarray(markerStart, segmentEnd));
      let scan = segmentEnd;
      while (scan + 1 < bytes.length) {
        const stuffed = bytes[scan] === 0xff && (bytes[scan + 1] === 0x00 || (bytes[scan + 1] >= 0xd0 && bytes[scan + 1] <= 0xd7));
        if (bytes[scan] === 0xff && !stuffed) break;
        scan += 1;
      }
      parts.push(bytes.subarray(segmentEnd, scan));
      offset = scan;
      continue;
    }
    const structural = (marker >= 0xc0 && marker <= 0xcf) || marker === 0xdc || marker === 0xdd || marker === 0xdf;
    const jfif = marker === 0xe0;
    const adobe = marker === 0xee;
    const icc = marker === 0xe2 && keepColorProfile && payloadStartsWith(payload, 'ICC_PROFILE');
    if (structural || jfif || adobe || icc) parts.push(bytes.subarray(markerStart, segmentEnd));
    offset = segmentEnd;
  }
  return concat(parts);
}

export function stripPngMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 8 || !PNG_SIGNATURE.every((value, index) => bytes[index] === value)) throw new Error('Not a PNG file.');
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  let offset = 8;
  while (offset + 12 <= bytes.length) {
    const length = readUint32Be(bytes, offset);
    const type = ascii(bytes, offset + 4, 4);
    const next = offset + 12 + length;
    if (next <= offset || next > bytes.length) throw new Error('PNG chunk is truncated, so metadata was not stripped.');
    if (!PNG_DROP.has(type)) parts.push(bytes.subarray(offset, next));
    offset = next;
    if (type === 'IEND') break;
  }
  return concat(parts);
}

export function stripWebpMetadata(bytes: Uint8Array): Uint8Array {
  if (bytes.length < 12 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') throw new Error('Not a WebP file.');
  const chunks: Uint8Array[] = [];
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, 4);
    const length = readUint32Le(bytes, offset + 4);
    const next = offset + 8 + length + (length & 1);
    if (next <= offset || next > bytes.length) throw new Error('WebP chunk is truncated, so metadata was not stripped.');
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = bytes.slice(offset, next);
      if (type === 'VP8X' && chunk.length >= 9) {
        chunk[8] &= ~0x0c;
      }
      chunks.push(chunk);
    }
    offset = next;
  }
  const payload = concat(chunks);
  const out = new Uint8Array(12 + payload.length);
  out.set(bytes.subarray(0, 4), 0);
  out[4] = (payload.length + 4) & 0xff;
  out[5] = ((payload.length + 4) >> 8) & 0xff;
  out[6] = ((payload.length + 4) >> 16) & 0xff;
  out[7] = ((payload.length + 4) >> 24) & 0xff;
  out.set(bytes.subarray(8, 12), 8);
  out.set(payload, 12);
  return out;
}

export function canStripInPlace(mimeType: string): boolean {
  return mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'image/webp';
}

export function stripEmbeddedMetadata(bytes: Uint8Array, mimeType: string, keepColorProfile = true): Uint8Array {
  if (mimeType === 'image/jpeg') return stripJpegMetadata(bytes, keepColorProfile);
  if (mimeType === 'image/png') return stripPngMetadata(bytes);
  if (mimeType === 'image/webp') return stripWebpMetadata(bytes);
  throw new Error('This format cannot be stripped in place. Rebuild the pixels instead.');
}

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
  /** Replace (or create) the XMP packet with these Dublin Core fields. */
  xmp?: boolean;
  /** Replace (or create) the IPTC-IIM APP13 block with these fields. */
  iptc?: boolean;
  stripExisting?: boolean;
}

export function hasImageMetadata(meta: ImageMetadata | undefined): boolean {
  if (!meta) return false;
  return Boolean(meta.title || meta.artist || meta.description || meta.copyright || meta.software || meta.creationTime || meta.xmp || meta.iptc || meta.stripExisting);
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
// JPEG segment surgery (XMP APP1 packets, IPTC APP13 stripping) — pure JS
// ---------------------------------------------------------------------------

const XMP_NAMESPACE = 'http://ns.adobe.com/xap/1.0/';

interface JpegSegment {
  marker: number;
  payload: Uint8Array;
}

function splitJpegSegments(jpeg: Uint8Array): { segments: JpegSegment[]; tailStart: number } {
  if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) throw new Error('Input is not a JPEG.');
  const segments: JpegSegment[] = [];
  let position = 2;
  while (position + 4 <= jpeg.length) {
    if (jpeg[position] !== 0xff) break;
    const marker = jpeg[position + 1];
    // Standalone markers (RSTn, SOI, EOI, TEM) carry no payload.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      position += 2;
      continue;
    }
    // SOS starts the entropy-coded scan data; keep it and everything after
    // it (including the trailing EOI) as an opaque tail.
    if (marker === 0xda) break;
    const length = (jpeg[position + 2] << 8) | jpeg[position + 3];
    if (position + 2 + length > jpeg.length) break;
    segments.push({ marker, payload: jpeg.subarray(position + 4, position + 2 + length) });
    position += 2 + length;
  }
  return { segments, tailStart: position };
}

const startsWithAscii = (bytes: Uint8Array, text: string): boolean => {
  if (bytes.length < text.length) return false;
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[i] !== text.charCodeAt(i)) return false;
  }
  return true;
};

const isXmpSegment = (segment: JpegSegment): boolean =>
  segment.marker === 0xe1 && startsWithAscii(segment.payload, XMP_NAMESPACE);

const isIptcSegment = (segment: JpegSegment): boolean =>
  segment.marker === 0xed;

/** Remove XMP APP1 packets (and optionally IPTC APP13 records) from a JPEG. */
export function stripJpegSidecarSegments(jpeg: Uint8Array, options: { xmp?: boolean; iptc?: boolean }): Uint8Array {
  const { segments, tailStart } = splitJpegSegments(jpeg);
  const parts: Uint8Array[] = [jpeg.subarray(0, 2)];
  for (const segment of segments) {
    const drop = (options.xmp && isXmpSegment(segment)) || (options.iptc && isIptcSegment(segment));
    if (drop) continue;
    const chunk = new Uint8Array(4 + segment.payload.length);
    chunk[0] = 0xff;
    chunk[1] = segment.marker;
    chunk[2] = (segment.payload.length + 2) >> 8;
    chunk[3] = (segment.payload.length + 2) & 0xff;
    chunk.set(segment.payload, 4);
    parts.push(chunk);
  }
  parts.push(jpeg.subarray(tailStart));
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

const xmlEscapeValue = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Build a Dublin-Core XMP packet from the supplied metadata fields. */
export function buildXmpPacket(meta: ImageMetadata): string {
  const parts: string[] = [];
  if (meta.title) parts.push(`<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscapeValue(meta.title)}</rdf:li></rdf:Alt></dc:title>`);
  if (meta.artist) parts.push(`<dc:creator><rdf:Seq><rdf:li>${xmlEscapeValue(meta.artist)}</rdf:li></rdf:Seq></dc:creator>`);
  if (meta.copyright) parts.push(`<dc:rights><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscapeValue(meta.copyright)}</rdf:li></rdf:Alt></dc:rights>`);
  if (meta.description) parts.push(`<dc:description><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscapeValue(meta.description)}</rdf:li></rdf:Alt></dc:description>`);
  return [
    '<?xpacket begin="\u{feff}" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/"',
    '  xmlns:xmp="http://ns.adobe.com/xap/1.0/">',
    parts.join('\n'),
    meta.software ? `<xmp:CreatorTool>${xmlEscapeValue(meta.software)}</xmp:CreatorTool>` : '',
    '</rdf:Description>',
    '</rdf:RDF>',
    '</x:xmpmeta>',
    '<?xpacket end="w"?>',
  ].filter(Boolean).join('\n');
}

/** Insert (or replace) the XMP APP1 packet immediately after SOI. */
export function insertJpegXmp(jpeg: Uint8Array, meta: ImageMetadata): Uint8Array {
  const stripped = stripJpegSidecarSegments(jpeg, { xmp: true });
  const namespaceBytes = new TextEncoder().encode(`${XMP_NAMESPACE}\0`);
  const packetBytes = new TextEncoder().encode(buildXmpPacket(meta));
  const payloadLength = namespaceBytes.length + packetBytes.length;
  if (payloadLength + 2 > 0xffff) throw new Error('XMP packet is too large for a JPEG APP1 segment.');
  const { segments, tailStart } = splitJpegSegments(stripped);

  let total = 2 + 4 + payloadLength;
  const kept: JpegSegment[] = [];
  for (const segment of segments) {
    kept.push(segment);
    total += 4 + segment.payload.length;
  }
  total += stripped.length - tailStart;

  const out = new Uint8Array(total);
  out[0] = 0xff;
  out[1] = 0xd8;
  out[2] = 0xff;
  out[3] = 0xe1;
  out[4] = (payloadLength + 2) >> 8;
  out[5] = (payloadLength + 2) & 0xff;
  out.set(namespaceBytes, 6);
  out.set(packetBytes, 6 + namespaceBytes.length);
  let cursor = 6 + payloadLength;
  for (const segment of kept) {
    out[cursor] = 0xff;
    out[cursor + 1] = segment.marker;
    out[cursor + 2] = (segment.payload.length + 2) >> 8;
    out[cursor + 3] = (segment.payload.length + 2) & 0xff;
    out.set(segment.payload, cursor + 4);
    cursor += 4 + segment.payload.length;
  }
  out.set(stripped.subarray(tailStart), cursor);
  return out;
}

/** Extract the XMP packet text from a JPEG, if present. */
export function readJpegXmp(jpeg: Uint8Array): string | null {
  const { segments } = splitJpegSegments(jpeg);
  for (const segment of segments) {
    if (isXmpSegment(segment)) {
      return new TextDecoder().decode(segment.payload.subarray(XMP_NAMESPACE.length + 1));
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// IPTC-IIM writer (APP13 Photoshop IRB)
// ---------------------------------------------------------------------------

function buildIptcDatasets(meta: ImageMetadata): Uint8Array {
  const parts: Uint8Array[] = [];
  const dataset = (record: number, number: number, data: Uint8Array) => {
    const header = new Uint8Array(5);
    header[0] = 0x1c;
    header[1] = record;
    header[2] = number;
    header[3] = data.length >> 8;
    header[4] = data.length & 0xff;
    parts.push(header, data);
  };
  // UTF-8 coded character set declaration (required for non-ASCII text).
  dataset(1, 90, Uint8Array.from([0x1b, 0x25, 0x47]));
  const encoder = new TextEncoder();
  if (meta.title) dataset(2, 5, encoder.encode(meta.title));
  if (meta.artist) dataset(2, 80, encoder.encode(meta.artist));
  if (meta.copyright) dataset(2, 116, encoder.encode(meta.copyright));
  if (meta.description) dataset(2, 120, encoder.encode(meta.description));
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    out.set(part, cursor);
    cursor += part.length;
  }
  return out;
}

/** Insert (or replace) an IPTC-IIM APP13 segment immediately after SOI. */
export function insertJpegIptc(jpeg: Uint8Array, meta: ImageMetadata): Uint8Array {
  const stripped = stripJpegSidecarSegments(jpeg, { iptc: true });
  const iptc = buildIptcDatasets(meta);
  // 8BIM resource: ID 0x0404 (IPTC-NAA), empty Pascal name, u32 size, data.
  const resourceName = Uint8Array.from([0x00, 0x00]); // length 0 + padding byte
  // '8BIM'(4) + resource ID(2) + Pascal name block(2) + size(4) + data.
  const resourceSize = 4 + 2 + resourceName.length + 4 + iptc.length + (iptc.length % 2);
  const payload = new Uint8Array('Photoshop 3.0'.length + 1 + resourceSize);
  const encoder = new TextEncoder();
  payload.set(encoder.encode('Photoshop 3.0'), 0);
  payload[13] = 0;
  let cursor = 14;
  payload.set(encoder.encode('8BIM'), cursor);
  cursor += 4;
  payload[cursor] = 0x04;
  payload[cursor + 1] = 0x04;
  cursor += 2;
  payload.set(resourceName, cursor);
  cursor += resourceName.length;
  payload[cursor] = (iptc.length >>> 24) & 0xff;
  payload[cursor + 1] = (iptc.length >>> 16) & 0xff;
  payload[cursor + 2] = (iptc.length >>> 8) & 0xff;
  payload[cursor + 3] = iptc.length & 0xff;
  cursor += 4;
  payload.set(iptc, cursor);
  cursor += iptc.length;
  if (iptc.length % 2 === 1) cursor += 1; // already zero-filled

  const { segments, tailStart } = splitJpegSegments(stripped);
  let total = 2 + 4 + payload.length;
  for (const segment of segments) total += 4 + segment.payload.length;
  total += stripped.length - tailStart;

  const out = new Uint8Array(total);
  out[0] = 0xff;
  out[1] = 0xd8;
  out[2] = 0xff;
  out[3] = 0xed;
  out[4] = (payload.length + 2) >> 8;
  out[5] = (payload.length + 2) & 0xff;
  out.set(payload, 6);
  let position = 6 + payload.length;
  for (const segment of segments) {
    out[position] = 0xff;
    out[position + 1] = segment.marker;
    out[position + 2] = (segment.payload.length + 2) >> 8;
    out[position + 3] = (segment.payload.length + 2) & 0xff;
    out.set(segment.payload, position + 4);
    position += 4 + segment.payload.length;
  }
  out.set(stripped.subarray(tailStart), position);
  return out;
}

/** Read IPTC-IIM datasets back out of a JPEG (dataset number -> value). */
export function readJpegIptc(jpeg: Uint8Array): Record<number, string> {
  const { segments } = splitJpegSegments(jpeg);
  const decoder = new TextDecoder('utf-8');
  const result: Record<number, string> = {};
  for (const segment of segments) {
    if (!isIptcSegment(segment)) continue;
    const payload = segment.payload;
    // Skip "Photoshop 3.0\0", then walk 8BIM resources to find 0x0404.
    let cursor = 14;
    while (cursor + 10 <= payload.length) {
      if (String.fromCharCode(payload[cursor], payload[cursor + 1], payload[cursor + 2], payload[cursor + 3]) !== '8BIM') break;
      const resourceId = (payload[cursor + 4] << 8) | payload[cursor + 5];
      const nameLength = payload[cursor + 6];
      // Pascal string: length byte + name, padded to an even total.
      const nameBlock = 1 + nameLength + ((1 + nameLength) % 2);
      const sizeOffset = cursor + 6 + nameBlock;
      if (sizeOffset + 4 > payload.length) break;
      const size = ((payload[sizeOffset] << 24) | (payload[sizeOffset + 1] << 16) | (payload[sizeOffset + 2] << 8) | payload[sizeOffset + 3]) >>> 0;
      const dataStart = sizeOffset + 4;
      if (resourceId === 0x0404) {
        let i = dataStart;
        while (i + 5 <= dataStart + size) {
          if (payload[i] !== 0x1c) break;
          const datasetNumber = payload[i + 2];
          const datasetSize = (payload[i + 3] << 8) | payload[i + 4];
          result[datasetNumber] = decoder.decode(payload.subarray(i + 5, i + 5 + datasetSize));
          i += 5 + datasetSize;
        }
        return result;
      }
      cursor = dataStart + size + (size % 2);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// JPEG: EXIF via piexifjs
// ---------------------------------------------------------------------------

export async function writeJpegMetadata(jpeg: Uint8Array, meta: ImageMetadata): Promise<Uint8Array> {
  const piexif = (await import('piexifjs')).default;
  // piexifjs operates on latin-1 binary strings (or data URIs). XMP and IPTC
  // live in sidecar APP1/APP13 segments handled by the segment surgery above.
  let stripped = jpeg;
  if (meta.stripExisting) stripped = stripJpegSidecarSegments(jpeg, { xmp: true, iptc: true });
  let binary = binaryToString(stripped);
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
  let result = stringToBinary(binary);
  if (meta.xmp) result = insertJpegXmp(result, meta);
  if (meta.iptc) result = insertJpegIptc(result, meta);
  return result;
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

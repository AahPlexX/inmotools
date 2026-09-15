/**
 * Character-encoding detection for the raw text and legacy RTF paths.
 *
 * The order of tests matters and is deliberate: byte-order marks are
 * authoritative, UTF-16 is recognisable from its null-byte spacing, a strict
 * UTF-8 validation pass identifies multi-byte UTF-8, pure ASCII is reported
 * separately for information, and everything else falls back to Windows-1252,
 * which decodes every byte sequence without throwing and is the most common
 * legacy encoding for the Western European documents this path receives.
 */

export type DetectedEncoding =
  | 'utf-8'
  | 'utf-16le'
  | 'utf-16be'
  | 'ascii'
  | 'windows-1252';

export interface EncodingDetection {
  readonly encoding: DetectedEncoding;
  /** Number of leading bytes consumed by a byte-order mark. */
  readonly bomLength: number;
  /** Human-readable reason, surfaced in the ingestion report. */
  readonly reason: string;
}

export const ENCODING_LABELS: Record<DetectedEncoding, string> = {
  'utf-8': 'UTF-8',
  'utf-16le': 'UTF-16 LE',
  'utf-16be': 'UTF-16 BE',
  ascii: 'ASCII (UTF-8 compatible)',
  'windows-1252': 'Windows-1252',
};

/** Strict UTF-8 validation: rejects overlong forms, surrogates, and out-of-range code points. */
export const isValidUtf8 = (bytes: Uint8Array<ArrayBufferLike>): boolean => {
  let index = 0;
  while (index < bytes.length) {
    const first = bytes[index]!;
    if (first < 0x80) {
      index += 1;
      continue;
    }
    let extra = 0;
    let codePoint = 0;
    if (first >= 0xc2 && first <= 0xdf) {
      extra = 1;
      codePoint = first & 0x1f;
    } else if (first >= 0xe0 && first <= 0xef) {
      extra = 2;
      codePoint = first & 0x0f;
    } else if (first >= 0xf0 && first <= 0xf4) {
      extra = 3;
      codePoint = first & 0x07;
    } else {
      return false;
    }
    if (index + extra >= bytes.length) return false;
    for (let offset = 1; offset <= extra; offset += 1) {
      const next = bytes[index + offset]!;
      if (next < 0x80 || next > 0xbf) return false;
      codePoint = (codePoint << 6) | (next & 0x3f);
    }
    // Reject overlong encodings, UTF-16 surrogate halves, and > U+10FFFF.
    if (extra === 1 && codePoint < 0x80) return false;
    if (extra === 2 && codePoint < 0x800) return false;
    if (extra === 3 && codePoint < 0x10000) return false;
    if (codePoint >= 0xd800 && codePoint <= 0xdfff) return false;
    if (codePoint > 0x10ffff) return false;
    index += extra + 1;
  }
  return true;
};

const hasUtf16Pattern = (
  bytes: Uint8Array<ArrayBufferLike>,
  leadIsNull: boolean,
  sampleLength = 512,
): boolean => {
  const limit = Math.min(bytes.length, sampleLength);
  if (limit < 4) return false;
  let hits = 0;
  let pairs = 0;
  for (let index = 0; index + 1 < limit; index += 2) {
    pairs += 1;
    // Text in UTF-16 places nulls consistently in the high byte of a Latin run.
    if (leadIsNull ? bytes[index] === 0 : bytes[index + 1] === 0) hits += 1;
  }
  return pairs > 0 && hits / pairs > 0.7;
};

export const detectEncoding = (bytes: Uint8Array<ArrayBufferLike>): EncodingDetection => {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: 'utf-8', bomLength: 3, reason: 'UTF-8 byte-order mark' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: 'utf-16le', bomLength: 2, reason: 'UTF-16 LE byte-order mark' };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { encoding: 'utf-16be', bomLength: 2, reason: 'UTF-16 BE byte-order mark' };
  }
  if (hasUtf16Pattern(bytes, false)) {
    return { encoding: 'utf-16le', bomLength: 0, reason: 'UTF-16 LE null-byte pattern' };
  }
  if (hasUtf16Pattern(bytes, true)) {
    return { encoding: 'utf-16be', bomLength: 0, reason: 'UTF-16 BE null-byte pattern' };
  }
  if (isValidUtf8(bytes)) {
    const multiByte = bytes.some((byte) => byte >= 0x80);
    return multiByte
      ? { encoding: 'utf-8', bomLength: 0, reason: 'valid multi-byte UTF-8' }
      : { encoding: 'ascii', bomLength: 0, reason: 'single-byte ASCII range' };
  }
  return {
    encoding: 'windows-1252',
    bomLength: 0,
    reason: 'not valid UTF-8; decoded as Windows-1252 (every byte maps to a character)',
  };
};

/**
 * Decode bytes to text. UTF-16 is decoded from code units directly so the
 * result does not depend on the host having a UTF-16 TextDecoder, and
 * Windows-1252 is decoded through TextDecoder when the platform supports the
 * label, with a table-driven decode as the fallback.
 */
export const decodeBytes = (
  bytes: Uint8Array<ArrayBufferLike>,
  detection: EncodingDetection = detectEncoding(bytes),
): string => {
  const body = detection.bomLength > 0 ? bytes.subarray(detection.bomLength) : bytes;
  if (detection.encoding === 'utf-16le' || detection.encoding === 'utf-16be') {
    return decodeUtf16(body, detection.encoding === 'utf-16le');
  }
  return decodeSingleOrMultiByte(body, detection.encoding);
};

const decodeUtf16 = (bytes: Uint8Array<ArrayBufferLike>, littleEndian: boolean): string => {
  const units = new Uint16Array(Math.floor(bytes.length / 2));
  for (let index = 0; index < units.length; index += 1) {
    const low = bytes[index * 2]!;
    const high = bytes[index * 2 + 1]!;
    units[index] = littleEndian ? low | (high << 8) : (low << 8) | high;
  }
  // Chunked to keep the argument count bounded on very large documents.
  let result = '';
  const chunkSize = 4096;
  for (let index = 0; index < units.length; index += chunkSize) {
    result += String.fromCharCode(...units.subarray(index, index + chunkSize));
  }
  return result;
};

const WINDOWS_1252_CONTROLS: Record<number, string> = {
  0x80: '\u20ac',
  0x82: '\u201a',
  0x83: '\u0192',
  0x84: '\u201e',
  0x85: '\u2026',
  0x86: '\u2020',
  0x87: '\u2021',
  0x88: '\u02c6',
  0x89: '\u2030',
  0x8a: '\u0160',
  0x8b: '\u2039',
  0x8c: '\u0152',
  0x8e: '\u017d',
  0x91: '\u2018',
  0x92: '\u2019',
  0x93: '\u201c',
  0x94: '\u201d',
  0x95: '\u2022',
  0x96: '\u2013',
  0x97: '\u2014',
  0x98: '\u02dc',
  0x99: '\u2122',
  0x9a: '\u0161',
  0x9b: '\u203a',
  0x9c: '\u0153',
  0x9e: '\u017e',
  0x9f: '\u0178',
};

export const decodeWindows1252 = (bytes: Uint8Array<ArrayBufferLike>): string => {
  let result = '';
  for (const byte of bytes) {
    if (byte < 0x80 || (byte >= 0xa0 && byte <= 0xff)) {
      result += String.fromCharCode(byte);
      continue;
    }
    result += WINDOWS_1252_CONTROLS[byte] ?? String.fromCharCode(byte);
  }
  return result;
};

const decodeSingleOrMultiByte = (
  bytes: Uint8Array<ArrayBufferLike>,
  encoding: DetectedEncoding,
): string => {
  const label = encoding === 'windows-1252' ? 'windows-1252' : 'utf-8';
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes);
  } catch {
    return encoding === 'windows-1252' ? decodeWindows1252(bytes) : decodeWindows1252(bytes);
  }
};

/** Decode a buffer that may or may not carry a byte-order mark, reporting both. */
export const decodeBuffer = (
  buffer: Uint8Array<ArrayBufferLike>,
): { text: string; detection: EncodingDetection } => {
  const detection = detectEncoding(buffer);
  return { text: decodeBytes(buffer, detection), detection };
};

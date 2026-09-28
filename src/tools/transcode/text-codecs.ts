// Plain-text encoding transcoding (F19) and binary encodings (F30).

export interface DecodedText {
  text: string;
  encoding: string;
  bom: boolean;
  hadReplacement: boolean;
}

/** WHATWG labels the workspace offers for decoding. TextDecoder covers all of them. */
export const DECODE_ENCODINGS: Array<{ id: string; label: string; note: string }> = [
  { id: 'utf-8', label: 'UTF-8', note: 'Auto-detected default' },
  { id: 'utf-16le', label: 'UTF-16 LE', note: 'Common Windows Unicode' },
  { id: 'utf-16be', label: 'UTF-16 BE', note: '' },
  { id: 'windows-1252', label: 'Windows-1252', note: 'Legacy Western' },
  { id: 'iso-8859-1', label: 'ISO-8859-1 (Latin-1)', note: '' },
  { id: 'shift_jis', label: 'Shift-JIS', note: 'Japanese' },
  { id: 'euc-jp', label: 'EUC-JP', note: 'Japanese' },
  { id: 'gb18030', label: 'GB18030', note: 'Chinese' },
  { id: 'big5', label: 'Big5', note: 'Traditional Chinese' },
  { id: 'euc-kr', label: 'EUC-KR', note: 'Korean' },
  { id: 'koi8-r', label: 'KOI8-R', note: 'Russian' },
  { id: 'iso-8859-2', label: 'ISO-8859-2', note: 'Central European' },
  { id: 'iso-8859-7', label: 'ISO-8859-7', note: 'Greek' },
  { id: 'windows-874', label: 'Windows-874', note: 'Thai' },
  { id: 'windows-1251', label: 'Windows-1251', note: 'Cyrillic' },
  { id: 'windows-1256', label: 'Windows-1256', note: 'Arabic' },
];

export const ENCODE_ENCODINGS = ['utf-8', 'utf-16le', 'utf-16be', 'ascii', 'windows-1252'] as const;
export type EncodeEncoding = (typeof ENCODE_ENCODINGS)[number];

/** Heuristic BOM + validity detection. Returns the best-guess WHATWG label. */
export function sniffEncoding(bytes: Uint8Array): { encoding: string; bom: boolean } {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return { encoding: 'utf-8', bom: true };
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return { encoding: 'utf-16le', bom: true };
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return { encoding: 'utf-16be', bom: true };

  // UTF-16 without BOM: lots of zero bytes alternating.
  if (bytes.length >= 8) {
    let evenZeros = 0;
    let oddZeros = 0;
    const probe = Math.min(bytes.length, 512);
    for (let i = 0; i < probe; i += 2) {
      if (bytes[i] === 0) evenZeros += 1;
      if (bytes[i + 1] === 0) oddZeros += 1;
    }
    const pairs = probe / 2;
    if (oddZeros > pairs * 0.4 && evenZeros < pairs * 0.1) return { encoding: 'utf-16le', bom: false };
    if (evenZeros > pairs * 0.4 && oddZeros < pairs * 0.1) return { encoding: 'utf-16be', bom: false };
  }

  // Strict UTF-8 validation.
  const strict = new TextDecoder('utf-8', { fatal: true });
  try {
    strict.decode(bytes);
    return { encoding: 'utf-8', bom: false };
  } catch {
    // fall through
  }
  return { encoding: 'windows-1252', bom: false };
}

export function decodeText(bytes: Uint8Array, encoding?: string): DecodedText {
  const sniffed = sniffEncoding(bytes);
  const label = encoding || sniffed.encoding;
  let bom = sniffed.bom;
  let payload = bytes;
  if (sniffed.bom && label === sniffed.encoding) {
    const bomLength = label === 'utf-8' ? 3 : 2;
    payload = bytes.subarray(bomLength);
  }
  const decoder = new TextDecoder(label, { fatal: false });
  const text = decoder.decode(payload);
  return { text, encoding: label, bom, hadReplacement: text.includes('\uFFFD') };
}

// Windows-1252 emit table: the 0x80-0x9F range is the only part that differs
// from identity-over-Unicode for the characters we can map.
const WIN1252_FROM_UNICODE: Record<number, number> = {
  0x20ac: 0x80, 0x201a: 0x82, 0x0192: 0x83, 0x201e: 0x84, 0x2026: 0x85, 0x2020: 0x86, 0x2021: 0x87,
  0x02c6: 0x88, 0x2030: 0x89, 0x0160: 0x8a, 0x2039: 0x8b, 0x0152: 0x8c, 0x017d: 0x8e, 0x2018: 0x91,
  0x2019: 0x92, 0x201c: 0x93, 0x201d: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97, 0x02dc: 0x98,
  0x2122: 0x99, 0x0161: 0x9a, 0x203a: 0x9b, 0x0153: 0x9c, 0x017e: 0x9e, 0x0178: 0x9f,
};

export interface EncodeOptions {
  encoding: EncodeEncoding;
  bom?: boolean;
  /** Replacement character for characters the target encoding cannot represent. */
  replacement?: string;
}

export function encodeText(text: string, options: EncodeOptions): Uint8Array {
  const replacement = options.replacement ?? '?';
  const withBom = options.bom ?? false;
  switch (options.encoding) {
    case 'utf-8': {
      const body = new TextEncoder().encode(text);
      if (!withBom) return body;
      const out = new Uint8Array(body.length + 3);
      out.set([0xef, 0xbb, 0xbf], 0);
      out.set(body, 3);
      return out;
    }
    case 'utf-16le':
    case 'utf-16be': {
      const little = options.encoding === 'utf-16le';
      const units: number[] = [];
      for (const char of text) {
        for (const unit of Array.from(char).length > 1 ? toUtf16Units(char) : [char.charCodeAt(0)]) units.push(unit);
      }
      const out = new Uint8Array(units.length * 2 + (withBom ? 2 : 0));
      let offset = 0;
      if (withBom) {
        if (little) { out[0] = 0xff; out[1] = 0xfe; } else { out[0] = 0xfe; out[1] = 0xff; }
        offset = 2;
      }
      units.forEach((unit, index) => {
        if (little) { out[offset + index * 2] = unit & 0xff; out[offset + index * 2 + 1] = unit >>> 8; }
        else { out[offset + index * 2] = unit >>> 8; out[offset + index * 2 + 1] = unit & 0xff; }
      });
      return out;
    }
    case 'ascii': {
      const out = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i += 1) {
        const code = text.charCodeAt(i);
        out[i] = code < 128 ? code : replacement.charCodeAt(0);
      }
      return out;
    }
    case 'windows-1252': {
      const out = new Uint8Array(text.length);
      for (let i = 0; i < text.length; i += 1) {
        const code = text.codePointAt(i) ?? 0;
        if (code > 0xffff) { out[i] = replacement.charCodeAt(0); i += 1; continue; }
        if (code < 0x80 || (code >= 0xa0 && code <= 0xff)) { out[i] = code; continue; }
        out[i] = WIN1252_FROM_UNICODE[code] ?? replacement.charCodeAt(0);
      }
      return out;
    }
    default:
      throw new Error(`Unsupported encode target: ${options.encoding}`);
  }
}

function toUtf16Units(char: string): number[] {
  const point = char.codePointAt(0) ?? 0;
  if (point <= 0xffff) return [point];
  const offset = point - 0x10000;
  return [0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff)];
}

// ---------------------------------------------------------------------------
// Base64, hex, data URIs (F30)
// ---------------------------------------------------------------------------

export function bytesToBase64(bytes: Uint8Array, lineWrap = 0): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  const encoded = btoa(binary);
  if (lineWrap <= 0) return encoded;
  return encoded.replace(new RegExp(`(.{${lineWrap}})`, 'g'), '$1\n').trimEnd();
}

export function base64ToBytes(text: string): Uint8Array {
  const cleaned = text.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) throw new Error('Input is not valid Base64.');
  const binary = atob(cleaned);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

const HEX_DIGITS = '0123456789abcdef';

export function bytesToHexDump(bytes: Uint8Array): string {
  const lines: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const slice = bytes.subarray(offset, offset + 16);
    let hex = '';
    for (let i = 0; i < 16; i += 1) {
      if (i < slice.length) {
        hex += HEX_DIGITS[slice[i] >> 4] + HEX_DIGITS[slice[i] & 0x0f];
      } else {
        hex += '  ';
      }
      if (i === 7) hex += '  ';
      else if (i < 15) hex += ' ';
    }
    const ascii = Array.from(slice).map((b) => (b >= 0x20 && b <= 0x7e ? String.fromCharCode(b) : '.')).join('');
    lines.push(`${offset.toString(16).padStart(8, '0')}  ${hex}  |${ascii}|`);
  }
  lines.push(`${bytes.length.toString(16).padStart(8, '0')}`);
  return `${lines.join('\n')}\n`;
}

export function hexToBytes(text: string): Uint8Array {
  const cleaned = text.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
  if (cleaned.length % 2 !== 0) throw new Error('Hex input has an odd number of digits.');
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    const value = Number.parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(value)) throw new Error('Hex input contains invalid digits.');
    out[i] = value;
  }
  return out;
}

export function toDataUri(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
}

export function parseDataUri(text: string): { mime: string; bytes: Uint8Array; isText: boolean } {
  const match = /^data:([^,]*),([\s\S]*)$/.exec(text.trim());
  if (!match) throw new Error('Input is not a data: URI.');
  const meta = match[1];
  const payload = match[2];
  const isBase64 = /;base64$/i.test(meta);
  const mime = (isBase64 ? meta.slice(0, -7) : meta.split(';')[0]) || 'text/plain';
  if (isBase64) return { mime, bytes: base64ToBytes(payload), isText: false };
  return { mime, bytes: new TextEncoder().encode(decodeURIComponent(payload)), isText: true };
}

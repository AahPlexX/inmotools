// Registry wiring for the Base64 / hex / data-URI suite (F30) and the text
// re-encoding target used by the encoding transcoder (F19).

import {
  base64ToBytes, bytesToBase64, bytesToHexDump, decodeText, encodeText, parseDataUri, toDataUri,
  type EncodeEncoding,
} from './text-codecs';
import { baseName, bytesArtifact, registerConverter, textArtifact, type ConversionInput, type ConversionOptions } from './transcode-engine';
import { FORMATS, type FormatId } from './formats';

const mimeForText = 'text/plain;charset=utf-8';

function guessMime(fileName: string): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'text/html';
  return 'application/octet-stream';
}

const strOpt = (options: ConversionOptions, key: string, fallback: string): string =>
  typeof options[key] === 'string' ? (options[key] as string) : fallback;

export function registerEncodingConverters(): void {
  // --- Base64 text sources -------------------------------------------------
  registerConverter('base64', 'binary', 'Decode Base64 into the original binary file', async (input) => {
    const bytes = base64ToBytes(input.text());
    return [bytesArtifact(`${baseName(input.fileName)}.bin`, bytes, 'application/octet-stream')];
  });
  registerConverter('base64', 'txt', 'Decode Base64 into plain text (UTF-8)', async (input) => {
    const bytes = base64ToBytes(input.text());
    const { text } = decodeText(bytes);
    return [textArtifact(`${baseName(input.fileName)}.txt`, text, mimeForText)];
  });
  registerConverter('base64', 'data-uri', 'Wrap decoded Base64 as a data: URI', async (input) => {
    const bytes = base64ToBytes(input.text());
    return [textArtifact(`${baseName(input.fileName)}.txt`, toDataUri(bytes, guessMime(input.fileName)), mimeForText)];
  });

  // --- Raw binary sources --------------------------------------------------
  registerConverter('binary', 'base64', 'Encode binary as Base64 text', async (input, options) => {
    const wrap = Number(options.lineWrap ?? 0) || 0;
    return [textArtifact(`${baseName(input.fileName)}.b64.txt`, bytesToBase64(input.bytes, wrap), mimeForText)];
  });
  registerConverter('binary', 'hex', 'Render a canonical hex + ASCII dump', async (input) => {
    return [textArtifact(`${baseName(input.fileName)}.hex.txt`, bytesToHexDump(input.bytes), mimeForText)];
  });
  registerConverter('binary', 'data-uri', 'Encode binary as a data: URI', async (input) => {
    const mime = guessMime(input.fileName);
    return [textArtifact(`${baseName(input.fileName)}.uri.txt`, toDataUri(input.bytes, mime), mimeForText)];
  });

  // --- Data-URI text typed as base64/txt also works through sniffing -------
  const dataUriToBinary = async (input: ConversionInput) => {
    const parsed = parseDataUri(input.text());
    const extension = parsed.mime.split('/')[1]?.split('+')[0] || 'bin';
    return [bytesArtifact(`${baseName(input.fileName)}.${extension}`, parsed.bytes, parsed.mime)];
  };

  // --- Plain text sources ---------------------------------------------------
  registerConverter('txt', 'base64', 'Encode text as Base64 (UTF-8 bytes)', async (input, options) => {
    const wrap = Number(options.lineWrap ?? 0) || 0;
    return [textArtifact(`${baseName(input.fileName)}.b64.txt`, bytesToBase64(new TextEncoder().encode(input.text()), wrap), mimeForText)];
  });
  registerConverter('txt', 'data-uri', 'Encode text as a data: URI', async (input) => {
    return [textArtifact(`${baseName(input.fileName)}.uri.txt`, toDataUri(new TextEncoder().encode(input.text()), 'text/plain'), mimeForText)];
  });
  // F19 re-encode target: same container, new charset.
  registerConverter('txt', 'txt', 'Re-encode into another character set', async (input, options) => {
    const targetEncoding = strOpt(options, 'targetEncoding', 'utf-8') as EncodeEncoding;
    const bom = Boolean(options.bom ?? false);
    const replacement = strOpt(options, 'replacement', '?');
    const bytes = encodeText(input.text(), { encoding: targetEncoding, bom, replacement });
    const label = FORMATS.txt.label;
    void label;
    return [bytesArtifact(`${baseName(input.fileName)}.${targetEncoding === 'utf-8' ? 'utf8' : targetEncoding}.txt`, bytes, 'application/octet-stream')];
  });

  // Any text-like source can also be treated as data URI input when it is one.
  registerConverter('txt', 'binary', 'Interpret a data: URI as its binary payload', async (input) => {
    return dataUriToBinary(input);
  });
}

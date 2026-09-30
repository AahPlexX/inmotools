// Archive & compression suite (F28-F30).
// ZIP and TAR handling is pure JavaScript (fflate + a hand-rolled ustar
// parser/builder) so it runs in unit tests; bz2 and 7z fall back to the
// libarchive.js WebAssembly worker in the browser.

import { gunzipSync, gzipSync, unzipSync, zipSync } from 'fflate';
import type { FormatId } from './formats';

export interface ArchiveEntry {
  name: string;
  data: Uint8Array;
}

// ---------------------------------------------------------------------------
// Extraction (F28)
// ---------------------------------------------------------------------------

export function unzipEntries(bytes: Uint8Array): ArchiveEntry[] {
  const entries = unzipSync(bytes);
  return Object.entries(entries)
    .filter(([name, data]) => !name.endsWith('/') && data.byteLength >= 0)
    .map(([name, data]) => ({ name, data }));
}

const TAR_BLOCK = 512;

const octalField = (block: Uint8Array, offset: number, length: number): number => {
  const raw = String.fromCharCode(...block.subarray(offset, offset + length)).replace(/\0/g, '').trim();
  if (!raw) return 0;
  return Number.parseInt(raw, 8);
};

const stringField = (block: Uint8Array, offset: number, length: number): string => {
  const raw = block.subarray(offset, offset + length);
  const end = raw.indexOf(0);
  return String.fromCharCode(...raw.subarray(0, end === -1 ? length : end));
};

/** Parse a POSIX/ustar TAR stream. Handles regular files, directories (skipped),
 *  and GNU long-name ('L') entries. */
export function parseTar(bytes: Uint8Array): ArchiveEntry[] {
  const entries: ArchiveEntry[] = [];
  let pendingLongName: string | null = null;
  let offset = 0;
  while (offset + TAR_BLOCK <= bytes.length) {
    const block = bytes.subarray(offset, offset + TAR_BLOCK);
    if (block.every((byte) => byte === 0)) {
      // Two consecutive zero blocks mark the end of the archive.
      const next = bytes.subarray(offset + TAR_BLOCK, offset + TAR_BLOCK * 2);
      if (next.length < TAR_BLOCK || next.every((byte) => byte === 0)) break;
      offset += TAR_BLOCK;
      continue;
    }
    const name = stringField(block, 0, 100);
    const typeFlag = String.fromCharCode(block[156]);
    const size = octalField(block, 124, 12);
    const prefix = stringField(block, 345, 155);
    offset += TAR_BLOCK;

    if (typeFlag === 'L') {
      // GNU long name: payload holds the real name of the next entry.
      pendingLongName = String.fromCharCode(...bytes.subarray(offset, offset + size)).replace(/\0+$/, '');
      offset += Math.ceil(size / TAR_BLOCK) * TAR_BLOCK;
      continue;
    }

    const fullName = pendingLongName ?? (prefix ? `${prefix}/${name}` : name);
    pendingLongName = null;
    const payload = bytes.subarray(offset, offset + size);
    offset += Math.ceil(size / TAR_BLOCK) * TAR_BLOCK;

    const isFile = typeFlag === '0' || typeFlag === '\0' || typeFlag === '';
    if (isFile && fullName && !fullName.endsWith('/')) {
      entries.push({ name: fullName, data: payload.slice() });
    }
  }
  return entries;
}

/** Browser-only extraction for bz2/7z via libarchive.js (WASM worker). */
async function extractWithLibarchive(bytes: Uint8Array): Promise<ArchiveEntry[]> {
  const module = await import('libarchive.js');
  const ArchiveClass = (module as unknown as { Archive: { init: (options: { workerUrl: string }) => void; open: (file: File | Blob) => Promise<LibarchiveHandle> } }).Archive;
  const base = (import.meta.env?.BASE_URL as string | undefined) ?? '/';
  ArchiveClass.init({ workerUrl: `${base}libarchive.js/dist/worker-bundle.js` });
  const archive = await ArchiveClass.open(new Blob([bytes.slice().buffer as ArrayBuffer]));
  const handle = archive as LibarchiveHandle;
  await handle.extractFiles();
  const files = handle.getFilesArray();
  const entries: ArchiveEntry[] = [];
  for (const item of files) {
    if (!item.file) continue;
    entries.push({ name: item.path, data: new Uint8Array(await item.file.arrayBuffer()) });
  }
  return entries;
}

interface LibarchiveHandle {
  extractFiles: () => Promise<unknown>;
  getFilesArray: () => Array<{ path: string; file?: File }>;
}

export async function extractArchive(bytes: Uint8Array, format: FormatId): Promise<ArchiveEntry[]> {
  switch (format) {
    case 'zip':
      return unzipEntries(bytes);
    case 'tar':
      return parseTar(bytes);
    case 'tar-gz':
      return parseTar(gunzipSync(bytes));
    case 'tar-bz2':
    case 'seven-zip':
      if (typeof Blob === 'undefined') throw new Error(`${format} extraction requires a browser environment.`);
      return extractWithLibarchive(bytes);
    default:
      throw new Error(`Unsupported archive format: ${format}`);
  }
}

// ---------------------------------------------------------------------------
// Building (F29)
// ---------------------------------------------------------------------------

export function buildZipBytes(entries: ArchiveEntry[]): Uint8Array {
  const record: Record<string, Uint8Array> = {};
  for (const entry of entries) record[entry.name] = entry.data;
  return new Uint8Array(zipSync(record, { level: 6 }));
}

const octalString = (value: number, width: number): string =>
  `${value.toString(8).padStart(width - 1, '0')}\0`;

/** Build a POSIX ustar TAR stream from entries. */
export function buildTarBytes(entries: ArchiveEntry[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  for (const entry of entries) {
    const header = new Uint8Array(TAR_BLOCK);
    const name = entry.name.length > 100 ? entry.name.slice(-100) : entry.name;
    header.set(new TextEncoder().encode(name), 0);
    header.set(new TextEncoder().encode(octalString(0o644, 8)), 100); // mode
    header.set(new TextEncoder().encode(octalString(0, 8)), 108); // uid
    header.set(new TextEncoder().encode(octalString(0, 8)), 116); // gid
    header.set(new TextEncoder().encode(octalString(entry.data.length, 12)), 124); // size
    header.set(new TextEncoder().encode(octalString(Math.floor(Date.now() / 1000) % 0o100000000, 12)), 136); // mtime
    header.fill(0x20, 148, 156); // checksum placeholder
    header[156] = 0x30; // typeflag '0'
    header.set(new TextEncoder().encode('ustar'), 257);
    header.set(new TextEncoder().encode('00'), 263);
    let checksum = 0;
    for (let i = 0; i < TAR_BLOCK; i += 1) checksum += header[i];
    header.set(new TextEncoder().encode(octalString(checksum, 7).slice(0, 7)), 148);
    chunks.push(header);
    chunks.push(entry.data);
    const padding = (TAR_BLOCK - (entry.data.length % TAR_BLOCK)) % TAR_BLOCK;
    if (padding > 0) chunks.push(new Uint8Array(padding));
  }
  chunks.push(new Uint8Array(TAR_BLOCK * 2)); // end-of-archive marker
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

export function buildTarGzBytes(entries: ArchiveEntry[]): Uint8Array {
  return new Uint8Array(gzipSync(buildTarBytes(entries)));
}

export async function gzipBytes(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(gzipSync(bytes));
}

// ---------------------------------------------------------------------------
// Base64 / hex / data-URI (F30)
// ---------------------------------------------------------------------------

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
};

export function hexDump(bytes: Uint8Array): string {
  const lines: string[] = [];
  for (let offset = 0; offset < bytes.length; offset += 16) {
    const row = bytes.subarray(offset, offset + 16);
    const hex = Array.from(row)
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join(' ')
      .padEnd(47, ' ');
    const ascii = Array.from(row)
      .map((byte) => (byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.'))
      .join('');
    lines.push(`${offset.toString(16).padStart(8, '0')}  ${hex}  |${ascii}|`);
  }
  lines.push(`${bytes.length.toString(16).padStart(8, '0')}  (${bytes.length} bytes)`);
  return `${lines.join('\n')}\n`;
}

export function guessMime(fileName: string, bytes: Uint8Array): string {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.svg')) return 'image/svg+xml';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.txt') || lower.endsWith('.md') || lower.endsWith('.csv')) return 'text/plain';
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  return 'application/octet-stream';
}

export { bytesToBase64 as archiveBytesToBase64 };

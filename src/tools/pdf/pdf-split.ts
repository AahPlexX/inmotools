import { createPdfSplitWriter, inspectPdf, parsePageSelection, type PdfMetadataEdits, type PdfAttachmentDefinition } from './pdf-engine';

export const MAX_SPLIT_PARTS = 1_000;
export const MAX_SPLIT_BYTES = 128 * 1024 * 1024;
const MAX_CANDIDATES = 5_000;
export type PdfSplitRequest = { mode: 'ranges'; ranges: string } | { mode: 'burst' } | { mode: 'size'; maxBytes: number; preserveOrder: boolean };
export type PdfSplitPart = { pages: number[]; bytes: Uint8Array; filename: string };
export type PdfSplitOptions = {
  filename: string; metadata?: PdfMetadataEdits; attachments?: PdfAttachmentDefinition[];
  signal?: AbortSignal; onProgress?: (completed: number, total: number) => void;
};

export function parsePdfSplitRanges(value: string, pageCount: number): number[][] {
  if (!value.trim()) throw new Error('Enter at least one page or range to split.');
  const tokens = value.split(',');
  if (tokens.length > MAX_SPLIT_PARTS) throw new Error(`Prepare at most ${MAX_SPLIT_PARTS} split files at a time.`);
  return tokens.map(token => {
    if (!token.trim()) throw new Error('Remove empty items from the split range list.');
    return parsePageSelection(token, pageCount);
  });
}

export function pdfSplitByteCeiling(value: string): number {
  const match = /^(\d+)(?:\.(\d{0,6}))?$/.exec(value.trim());
  if (!match) throw new Error('Enter a positive MB value with at most six decimal places (1 MB = 1,000,000 bytes).');
  const bytes = Number(match[1]) * 1_000_000 + Number((match[2] ?? '').padEnd(6, '0'));
  if (!Number.isSafeInteger(bytes) || bytes < 1 || bytes > MAX_SPLIT_BYTES) throw new Error('The ceiling must be between 1 byte and 128 MiB.');
  return bytes;
}

export function pdfSplitPrefix(filename: string): string {
  const clean = filename.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-').replace(/^\.+|[.\s]+$/g, '').trim();
  let result = '';
  for (const character of clean) {
    if (new TextEncoder().encode(result + character).byteLength > 160) break;
    result += character;
  }
  return result || 'split';
}

export async function splitPreparedPdf(bytes: Uint8Array, request: PdfSplitRequest, options: PdfSplitOptions): Promise<PdfSplitPart[]> {
  const check = () => options.signal?.throwIfAborted();
  check();
  if (bytes.byteLength > MAX_SPLIT_BYTES) throw new Error('Prepared input exceeds the 128 MiB split limit; reduce the output selection.');
  if (request.mode === 'size' && (!Number.isSafeInteger(request.maxBytes) || request.maxBytes < 1 || request.maxBytes > MAX_SPLIT_BYTES)) {
    throw new Error('The size ceiling must be a positive whole-byte value at most 128 MiB.');
  }
  const writer = await createPdfSplitWriter(bytes, options, options.signal);
  if (!writer.pageCount) throw new Error('Add at least one output page before splitting.');
  const parts: PdfSplitPart[] = [];
  let attempts = 0;
  let totalBytes = 0;
  const write = async (pages: number[]) => {
    check();
    if (++attempts > MAX_CANDIDATES) throw new Error('Split preparation exceeded 5,000 candidates. Use ordered packing or smaller page selections.');
    const result = await writer.write(pages);
    check();
    // Let Cancel and source edits run between native serialization calls.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    check();
    return result;
  };
  const add = (pages: number[], data: Uint8Array) => {
    if (parts.length >= MAX_SPLIT_PARTS) throw new Error(`Prepare at most ${MAX_SPLIT_PARTS} split files at a time.`);
    totalBytes += data.byteLength;
    if (totalBytes > MAX_SPLIT_BYTES) throw new Error('Split files exceed the 128 MiB total preparation limit; reduce the selection.');
    parts.push({ pages, bytes: data, filename: '' });
  };
  if (request.mode !== 'size') {
    if (request.mode === 'burst' && writer.pageCount > MAX_SPLIT_PARTS) throw new Error(`Burst supports at most ${MAX_SPLIT_PARTS} pages per preparation; use ranges for larger outputs.`);
    const groups = request.mode === 'ranges' ? parsePdfSplitRanges(request.ranges, writer.pageCount) : Array.from({ length: writer.pageCount }, (_, i) => [i + 1]);
    for (const pages of groups) {
      add(pages, await write(pages));
      options.onProgress?.(parts.length, groups.length);
      check();
    }
  } else {
    for (let page = 1; page <= writer.pageCount; page++) {
      let selected = -1;
      let selectedBytes: Uint8Array | undefined;
      const candidates = request.preserveOrder ? (parts.length ? [parts.length - 1] : []) : parts.map((_, i) => i);
      for (const index of candidates) {
        const candidate = await write([...parts[index].pages, page]);
        if (candidate.byteLength <= request.maxBytes && (!selectedBytes || candidate.byteLength > selectedBytes.byteLength)) {
          selected = index; selectedBytes = candidate;
        }
      }
      if (selectedBytes) {
        totalBytes += selectedBytes.byteLength - parts[selected].bytes.byteLength;
        if (totalBytes > MAX_SPLIT_BYTES) throw new Error('Split files exceed the 128 MiB total preparation limit; reduce the selection.');
        parts[selected] = { ...parts[selected], pages: [...parts[selected].pages, page], bytes: selectedBytes };
      } else {
        const single = await write([page]);
        if (single.byteLength > request.maxBytes) throw new Error(`Page ${page} alone requires ${single.byteLength.toLocaleString()} bytes, above the ${request.maxBytes.toLocaleString()}-byte ceiling. Increase the ceiling; no files were prepared.`);
        add([page], single);
      }
      options.onProgress?.(page, writer.pageCount);
      check();
    }
  }
  const prefix = pdfSplitPrefix(options.filename);
  for (let index = 0; index < parts.length; index++) {
    check();
    const part = parts[index];
    const inspection = await inspectPdf(part.bytes);
    if (!inspection.diagnostics.complete || inspection.pageCount !== part.pages.length || inspection.formFieldCount !== 0) throw new Error('A split file failed output verification; no files were prepared.');
    if (request.mode === 'size' && part.bytes.byteLength > request.maxBytes) throw new Error('A split file exceeds the requested ceiling; no files were prepared.');
    const expected = (options.attachments ?? []).map(item => item.name).sort();
    if (JSON.stringify(inspection.attachments.map(item => item.name).sort()) !== JSON.stringify(expected)) throw new Error('Split attachment verification failed; no files were prepared.');
    part.filename = `${prefix}-part-${String(index + 1).padStart(3, '0')}.pdf`;
  }
  check();
  return parts;
}

export async function zipPdfParts(parts: PdfSplitPart[], signal?: AbortSignal): Promise<Uint8Array> {
  signal?.throwIfAborted();
  if (!parts.length || parts.length > MAX_SPLIT_PARTS || new Set(parts.map(part => part.filename)).size !== parts.length) throw new Error('ZIP needs a nonempty set of uniquely named split files.');
  if (parts.some(part => !part.filename || /[\\/\u0000-\u001f\u007f]/.test(part.filename) || new TextEncoder().encode(part.filename).byteLength > 240) || parts.reduce((sum, part) => sum + part.bytes.byteLength, 0) > MAX_SPLIT_BYTES) throw new Error('ZIP filenames or total bytes exceed the preparation limits.');
  const { default: JSZip } = await import('jszip');
  signal?.throwIfAborted();
  const zip = new JSZip();
  for (const part of parts) zip.file(part.filename, part.bytes);
  const stream = zip.generateInternalStream({ type: 'uint8array', compression: 'STORE', streamFiles: true });
  return new Promise((resolve, reject) => {
    let chunks: Uint8Array[] = [];
    let length = 0;
    let finished = false;
    const stop = (reason: unknown) => {
      if (finished) return;
      finished = true; stream.pause(); chunks = [];
      signal?.removeEventListener('abort', cancel); reject(reason);
    };
    const cancel = () => stop(signal?.reason ?? new DOMException('ZIP cancelled', 'AbortError'));
    signal?.addEventListener('abort', cancel, { once: true });
    stream.on('data', data => {
      // pause again if an earlier queued resume runs after cancellation.
      if (finished) { stream.pause(); return; }
      if (signal?.aborted) { cancel(); return; }
      length += data.byteLength;
      if (length > MAX_SPLIT_BYTES + 2 * 1024 * 1024) { stop(new Error('ZIP exceeds the preparation limit; download individual parts instead.')); return; }
      chunks.push(data);
    });
    stream.on('error', stop);
    stream.on('end', () => {
      if (finished) return;
      if (signal?.aborted) { cancel(); return; }
      try {
        const result = new Uint8Array(length);
        let offset = 0;
        for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
        chunks = []; finished = true;
        signal?.removeEventListener('abort', cancel); resolve(result);
      } catch (error) { stop(error); }
    });
    if (signal?.aborted) cancel(); else stream.resume();
  });
}

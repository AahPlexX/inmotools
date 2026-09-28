import { downloadBlob } from '../../lib/download';
import { uniqueFilename } from './photo-export-settings';

/** Batch/multi-output export plumbing: a reorderable queue with per-item cancel and retry, output
 * "sinks" (browser downloads, or a folder the user picked through the File System Access API), and
 * a manifest describing what was produced. Items are processed strictly one at a time and each
 * finished blob is handed to the sink immediately, so no full-resolution output is retained. */

export type PhotoQueueStatus = 'queued' | 'running' | 'done' | 'failed' | 'cancelled';

export interface PhotoQueueItem<T> {
  id: string;
  label: string;
  payload: T;
  status: PhotoQueueStatus;
  error?: string;
  outputName?: string;
  width?: number;
  height?: number;
  bytes?: number;
}

export function createQueueItems<T>(entries: Array<{ label: string; payload: T }>, prefix = 'item'): Array<PhotoQueueItem<T>> {
  return entries.map((entry, index) => ({ id: `${prefix}-${index}-${Math.random().toString(36).slice(2, 8)}`, label: entry.label, payload: entry.payload, status: 'queued' }));
}

export function moveQueueItem<T>(items: Array<PhotoQueueItem<T>>, id: string, direction: -1 | 1): Array<PhotoQueueItem<T>> {
  const index = items.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** Marks failed or cancelled items as queued again, clearing their previous outcome. */
export function retryQueueItems<T>(items: Array<PhotoQueueItem<T>>, ids?: string[]): Array<PhotoQueueItem<T>> {
  return items.map((item) => ((item.status === 'failed' || item.status === 'cancelled') && (!ids || ids.includes(item.id))
    ? { id: item.id, label: item.label, payload: item.payload, status: 'queued' as const }
    : item));
}

export interface PhotoQueueJobResult {
  blob: Blob;
  filename: string;
  width: number;
  height: number;
  details?: Record<string, string | number | boolean>;
}

export interface PhotoOutputSink {
  readonly kind: 'download' | 'folder';
  readonly label: string;
  /** Writes one file and returns the name actually used (after collision handling). */
  write(blob: Blob, filename: string): Promise<string>;
}

/** Browser downloads. Names already produced in this run get numbered copies so a batch never
 * asks the browser to save two different photos under one name. */
export function createDownloadSink(save: (blob: Blob, name: string) => void = downloadBlob): PhotoOutputSink {
  const used = new Set<string>();
  return {
    kind: 'download',
    label: 'your browser’s downloads',
    async write(blob, filename) {
      const name = uniqueFilename(filename, used);
      save(blob, name);
      return name;
    },
  };
}

interface DirectoryHandleLike {
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void>; abort(): Promise<void> }> }>;
}

/** A folder picked with `showDirectoryPicker`. Existing files are never overwritten: a name that
 * already exists in the folder (or earlier in this run) gets a numbered copy instead. */
export function createFolderSink(directory: DirectoryHandleLike): PhotoOutputSink {
  const used = new Set<string>();
  async function exists(name: string): Promise<boolean> {
    try {
      await directory.getFileHandle(name);
      return true;
    } catch (error) {
      if (error instanceof DOMException && (error.name === 'NotFoundError' || error.name === 'TypeMismatchError')) return error.name === 'TypeMismatchError';
      throw error;
    }
  }
  return {
    kind: 'folder',
    label: `the “${directory.name}” folder`,
    async write(blob, filename) {
      let name = uniqueFilename(filename, used);
      while (await exists(name)) name = uniqueFilename(filename, used);
      const handle = await directory.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      try {
        await writable.write(blob);
        await writable.close();
      } catch (error) {
        await writable.abort().catch(() => undefined);
        throw error;
      }
      return name;
    },
  };
}

export interface FileSystemAccessWindow {
  showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite'; id?: string }) => Promise<DirectoryHandleLike>;
  showSaveFilePicker?: (options?: { suggestedName?: string; id?: string; types?: Array<{ description?: string; accept: Record<string, string[]> }> }) => Promise<{ name: string; createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void>; abort(): Promise<void> }> }>;
  showOpenFilePicker?: (options?: { multiple?: boolean; id?: string; types?: Array<{ description?: string; accept: Record<string, string[]> }>; excludeAcceptAllOption?: boolean }) => Promise<Array<{ getFile(): Promise<File> }>>;
}

export function fileSystemAccess(): FileSystemAccessWindow {
  return (typeof window === 'undefined' ? {} : window) as unknown as FileSystemAccessWindow;
}

/** True when the user dismissed a picker; the spec rejects with an "AbortError" DOMException. */
export function isPickerCancel(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

export interface PhotoQueueRunOptions<T> {
  sink: PhotoOutputSink;
  /** Called with the item list after every state change. */
  onChange: (items: Array<PhotoQueueItem<T>>) => void;
  /** Returns true when the item was cancelled while (or before) it ran. */
  isCancelled: (id: string) => boolean;
}

export interface PhotoQueueRunSummary {
  done: number;
  failed: number;
  cancelled: number;
}

/** Runs every queued item in order. A failure is recorded on that item only; the rest continue.
 * An item cancelled while rendering is marked cancelled and its output is discarded unsaved. */
export async function runPhotoQueue<T>(
  initial: Array<PhotoQueueItem<T>>,
  job: (item: PhotoQueueItem<T>, position: number) => Promise<PhotoQueueJobResult>,
  options: PhotoQueueRunOptions<T>,
): Promise<{ items: Array<PhotoQueueItem<T>>; summary: PhotoQueueRunSummary }> {
  let items = [...initial];
  const update = (id: string, patch: Partial<PhotoQueueItem<T>>) => {
    items = items.map((item) => (item.id === id ? { ...item, ...patch } : item));
    options.onChange(items);
  };
  let position = 0;
  for (const original of initial) {
    const current = items.find((item) => item.id === original.id);
    if (!current || current.status !== 'queued') continue;
    position += 1;
    if (options.isCancelled(current.id)) { update(current.id, { status: 'cancelled' }); continue; }
    update(current.id, { status: 'running', error: undefined });
    try {
      const result = await job(current, position);
      if (options.isCancelled(current.id)) { update(current.id, { status: 'cancelled' }); continue; }
      const outputName = await options.sink.write(result.blob, result.filename);
      update(current.id, { status: 'done', outputName, width: result.width, height: result.height, bytes: result.blob.size });
    } catch (error) {
      if (options.isCancelled(current.id)) update(current.id, { status: 'cancelled' });
      else update(current.id, { status: 'failed', error: error instanceof Error ? error.message : String(error) });
    }
  }
  const summary = {
    done: items.filter((item) => item.status === 'done').length,
    failed: items.filter((item) => item.status === 'failed').length,
    cancelled: items.filter((item) => item.status === 'cancelled').length,
  };
  return { items, summary };
}

// --- Export manifest (capability 163) ---

export interface PhotoManifestEntry {
  source: string;
  output: string | null;
  status: PhotoQueueStatus;
  width?: number;
  height?: number;
  bytes?: number;
  error?: string;
  details?: Record<string, string | number | boolean>;
}

export function buildExportManifest(entries: PhotoManifestEntry[], context: { generatedAt?: Date; destination: string; settings: Record<string, unknown> }) {
  return {
    kind: 'inmotools-photo-export-manifest',
    version: 1,
    generatedAt: (context.generatedAt ?? new Date()).toISOString(),
    destination: context.destination,
    settings: context.settings,
    totals: {
      files: entries.length,
      exported: entries.filter((entry) => entry.status === 'done').length,
      failed: entries.filter((entry) => entry.status === 'failed').length,
      cancelled: entries.filter((entry) => entry.status === 'cancelled').length,
    },
    entries,
  };
}

function csvCell(value: unknown): string {
  const text = value === undefined || value === null ? '' : String(value);
  // Prefix formula-leading characters so spreadsheet apps never execute a file name as a formula.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function manifestToCsv(entries: PhotoManifestEntry[]): string {
  const detailKeys = [...new Set(entries.flatMap((entry) => Object.keys(entry.details ?? {})))].sort();
  const header = ['source', 'output', 'status', 'width', 'height', 'bytes', 'error', ...detailKeys];
  const rows = entries.map((entry) => [entry.source, entry.output, entry.status, entry.width, entry.height, entry.bytes, entry.error, ...detailKeys.map((key) => entry.details?.[key])].map(csvCell).join(','));
  return `${[header.join(','), ...rows].join('\r\n')}\r\n`;
}

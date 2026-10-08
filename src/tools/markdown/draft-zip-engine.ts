import { strFromU8, strToU8, unzipSync, zipSync, type Zippable } from 'fflate';
import { createDraftRecord } from './autosave-engine';
import type { DraftRecord } from './markdown-types';

// One ZIP of every local draft, one .md file per draft. The archive is deterministic: entries are
// ordered by name, carry a fixed modification time and use the same compression, so the same drafts
// always produce the same bytes. Import reads .md, .markdown and .txt files from any ZIP.

export const DRAFTS_ZIP_FILENAME = 'markdown-drafts.zip';
export const MAX_ZIP_ENTRIES = 500;
export const MAX_ZIP_ENTRY_BYTES = 5 * 1024 * 1024;
export const MAX_ZIP_TOTAL_BYTES = 50 * 1024 * 1024;

const ENTRY_TIME = new Date(1980, 0, 1, 0, 0, 0);
const IMPORT_EXTENSION = /\.(md|markdown|txt)$/i;
const MAX_NAME_LENGTH = 100;

export class DraftZipError extends Error {}

const compareText = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

// A draft name made safe as a file name: no path separators or characters Windows rejects.
export const zipEntryStem = (name: string): string => {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, MAX_NAME_LENGTH)
    .trim();
  return cleaned || 'Untitled';
};

export const draftEntryNames = (drafts: readonly DraftRecord[]): { draft: DraftRecord; entry: string }[] => {
  const ordered = [...drafts].sort((a, b) =>
    compareText(zipEntryStem(a.name).toLowerCase(), zipEntryStem(b.name).toLowerCase())
    || compareText(zipEntryStem(a.name), zipEntryStem(b.name))
    || a.updatedAt - b.updatedAt
    || compareText(a.id, b.id));
  const used = new Set<string>();
  return ordered.map((draft) => {
    const stem = zipEntryStem(draft.name);
    let entry = `${stem}.md`;
    for (let copy = 2; used.has(entry.toLowerCase()); copy += 1) entry = `${stem} (${copy}).md`;
    used.add(entry.toLowerCase());
    return { draft, entry };
  });
};

export const buildDraftsZip = (drafts: readonly DraftRecord[]): Uint8Array => {
  const files: Zippable = {};
  for (const { draft, entry } of draftEntryNames(drafts)) {
    files[entry] = [strToU8(draft.text), { level: 6, mtime: ENTRY_TIME }];
  }
  return zipSync(files);
};

export interface ZipDocument {
  readonly name: string;
  readonly text: string;
}

// Markdown and text files in a ZIP, ordered by file name. Folders, hidden files and other file types
// are ignored. Throws DraftZipError for a file that is not a ZIP or that is unreasonably large.
export const readDocumentsFromZip = (bytes: Uint8Array): ZipDocument[] => {
  let entries = 0;
  let total = 0;
  let archive: Record<string, Uint8Array>;
  try {
    archive = unzipSync(bytes, {
      filter: (file) => {
        if (file.name.endsWith('/') || !IMPORT_EXTENSION.test(file.name)) return false;
        const base = file.name.slice(file.name.lastIndexOf('/') + 1);
        if (base.startsWith('.') || file.name.startsWith('__MACOSX/')) return false;
        entries += 1;
        total += file.originalSize;
        if (entries > MAX_ZIP_ENTRIES) throw new DraftZipError(`That ZIP holds more than ${MAX_ZIP_ENTRIES} documents.`);
        if (file.originalSize > MAX_ZIP_ENTRY_BYTES || total > MAX_ZIP_TOTAL_BYTES) {
          throw new DraftZipError('That ZIP holds documents that are too large to import.');
        }
        return true;
      },
    });
  } catch (error) {
    if (error instanceof DraftZipError) throw error;
    throw new DraftZipError('That file is not a readable ZIP archive.');
  }
  return Object.keys(archive)
    .map((path) => {
      const base = path.slice(path.lastIndexOf('/') + 1);
      const data = archive[path] as Uint8Array;
      return {
        path,
        name: zipEntryStem(base.replace(IMPORT_EXTENSION, '')),
        text: strFromU8(data).replace(/^\uFEFF/, ''),
      };
    })
    .sort((a, b) => compareText(a.path, b.path))
    .map(({ name, text }) => ({ name, text }));
};

// New draft records for documents that are not already saved with the same name and text.
export const planDraftImport = (
  existing: readonly DraftRecord[],
  documents: readonly ZipDocument[],
  now: number,
): { created: DraftRecord[]; skipped: number } => {
  const known = new Set(existing.map((draft) => `${draft.name}\u0000${draft.text}`));
  const created: DraftRecord[] = [];
  let skipped = 0;
  for (const document of documents) {
    const key = `${document.name}\u0000${document.text}`;
    if (known.has(key)) { skipped += 1; continue; }
    known.add(key);
    created.push(createDraftRecord(document.name, document.text, now + created.length));
  }
  return { created, skipped };
};

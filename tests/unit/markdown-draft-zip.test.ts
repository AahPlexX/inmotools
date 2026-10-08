import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import {
  buildDraftsZip,
  DraftZipError,
  draftEntryNames,
  MAX_ZIP_ENTRY_BYTES,
  planDraftImport,
  readDocumentsFromZip,
  zipEntryStem,
} from '../../src/tools/markdown/draft-zip-engine';
import type { DraftRecord } from '../../src/tools/markdown/markdown-types';

const draft = (id: string, name: string, text: string, updatedAt = 1): DraftRecord => ({ id, name, text, updatedAt });

describe('MDW-R71 drafts ZIP', () => {
  it('exports three drafts as three .md files and reads them back', () => {
    const drafts = [draft('1', 'Notes', '# Notes\n'), draft('2', 'Plan', 'plan ✓ ünïcode\n'), draft('3', 'Ideas', '- one\n')];
    const archive = unzipSync(buildDraftsZip(drafts));
    expect(Object.keys(archive).sort()).toEqual(['Ideas.md', 'Notes.md', 'Plan.md']);
    const documents = readDocumentsFromZip(buildDraftsZip(drafts));
    expect(documents).toEqual([
      { name: 'Ideas', text: '- one\n' },
      { name: 'Notes', text: '# Notes\n' },
      { name: 'Plan', text: 'plan ✓ ünïcode\n' },
    ]);
  });

  it('produces identical bytes for the same drafts in any order', () => {
    const a = draft('1', 'A', 'one');
    const b = draft('2', 'B', 'two');
    expect(Array.from(buildDraftsZip([a, b]))).toEqual(Array.from(buildDraftsZip([b, a])));
  });

  it('keeps drafts with the same or unsafe names as separate files', () => {
    const names = draftEntryNames([
      draft('1', 'Same', 'a', 1),
      draft('2', 'same', 'b', 2),
      draft('3', 'a/b:c', 'c'),
      draft('4', '   ', 'd'),
    ]).map((item) => item.entry);
    expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(4);
    expect(names).toContain('abc.md');
    expect(names).toContain('Untitled.md');
    expect(zipEntryStem('../../etc/passwd')).toBe('etcpasswd');
  });

  it('ignores folders, hidden files, macOS metadata and other file types', () => {
    const bytes = zipSync({
      'keep.md': strToU8('kept'),
      'folder/nested.txt': strToU8('nested'),
      '.hidden.md': strToU8('hidden'),
      '__MACOSX/._keep.md': strToU8('meta'),
      'image.png': new Uint8Array([1, 2, 3]),
    });
    expect(readDocumentsFromZip(bytes).map((document) => document.name)).toEqual(['nested', 'keep']);
  });

  it('rejects data that is not a ZIP and entries that are too large', () => {
    expect(() => readDocumentsFromZip(strToU8('not a zip'))).toThrow(DraftZipError);
    const huge = zipSync({ 'big.md': new Uint8Array(MAX_ZIP_ENTRY_BYTES + 1) });
    expect(() => readDocumentsFromZip(huge)).toThrow(/too large/);
  });

  it('skips documents already saved with the same name and text', () => {
    const existing = [draft('1', 'Notes', 'same')];
    const plan = planDraftImport(existing, [
      { name: 'Notes', text: 'same' },
      { name: 'Notes', text: 'changed' },
      { name: 'Other', text: 'new' },
    ], 100);
    expect(plan.skipped).toBe(1);
    expect(plan.created.map((record) => record.name)).toEqual(['Notes', 'Other']);
    expect(new Set(plan.created.map((record) => record.id)).size).toBe(2);
  });
});

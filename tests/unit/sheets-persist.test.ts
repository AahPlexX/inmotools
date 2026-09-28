import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearWorkbooks,
  isPortableWorkbook,
  listWorkbooks,
  loadWorkbook,
  normalizeStoredWorkbook,
  persistenceContract,
  readPrefsFromLocalStorage,
  resetSheetsDbForTests,
  saveWorkbook,
  writePrefsToLocalStorage,
} from '../../src/tools/sheets/sheets-persist';
import { parseBundle, toBundle } from '../../src/tools/sheets/sheets-io';
import { emptyMeta, starterWorkbook } from '../../src/tools/sheets/sheets-types';

describe('tabular sheet persistence', () => {
  afterEach(async () => {
    await clearWorkbooks();
    resetSheetsDbForTests();
  });

  it('round-trips a workbook through IndexedDB and rejects malformed rows', async () => {
    const book = starterWorkbook();
    const id = await saveWorkbook(book);
    expect(id).toBe(book.id);
    const loaded = await loadWorkbook(id);
    expect(loaded?.workbook.sheets).toHaveLength(2);
    expect(loaded?.workbook.namedRanges[0]?.name).toBe('TaxRate');
    expect(normalizeStoredWorkbook({ workbook: { name: 'nope' } })).toBeNull();
    expect(isPortableWorkbook({ id: 'x' })).toBe(false);
    await expect(saveWorkbook({ id: 'bad' } as never)).rejects.toThrow(/invalid portable workbook/i);
    expect(await listWorkbooks()).toHaveLength(1);
  });

  it('stores zoom and theme prefs in LocalStorage only', () => {
    const storage = new Map<string, string>();
    const fake = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
    };
    writePrefsToLocalStorage({ zoom: 125, theme: 'high-contrast', lastWorkbookId: 'abc', showProgress: true }, fake);
    expect(readPrefsFromLocalStorage(fake)).toMatchObject({ zoom: 125, theme: 'high-contrast', lastWorkbookId: 'abc' });
    expect(persistenceContract().remote).toBe(false);
    expect(persistenceContract().database).toBe('inmotools-tabular-sheet-workstation');
  });

  it('round-trips a tagged portable bundle', () => {
    const bundle = toBundle(starterWorkbook(), { ...emptyMeta(), title: 'Q3', author: 'Ada', tags: ['finance', 'finance', 'local'], notes: 'keep offline' });
    const parsed = parseBundle(JSON.parse(JSON.stringify(bundle)));
    expect(parsed?.meta.tags).toEqual(['finance', 'local']);
    expect(parsed?.workbook.sheets[0]?.name).toBe('Sheet1');
    expect(parseBundle({ tool: 'other' })).toBeNull();
  });
});

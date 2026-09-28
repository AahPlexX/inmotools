import Dexie, { type Table } from 'dexie';
import { defaultPrefs, SCHEMA_VERSION, TOOL_ID, type PortableWorkbook, type SheetPrefs } from './sheets-types';

export interface StoredWorkbook {
  id: string;
  savedAt: number;
  name: string;
  workbook: PortableWorkbook;
}

export interface StoredPref {
  key: string;
  value: unknown;
}

const DB_NAME = 'inmotools-tabular-sheet-workstation';
const PREFS_KEY = 'inmotools-tabular-sheet-prefs';

class SheetsDb extends Dexie {
  workbooks!: Table<StoredWorkbook, string>;
  preferences!: Table<StoredPref, string>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      workbooks: 'id, savedAt, name',
      preferences: 'key',
    });
  }
}

let dbInstance: SheetsDb | null = null;

export function getSheetsDb(): SheetsDb {
  if (!dbInstance) dbInstance = new SheetsDb();
  return dbInstance;
}

export function resetSheetsDbForTests(): void {
  dbInstance = null;
}

export function isPortableWorkbook(value: unknown): value is PortableWorkbook {
  if (value === null || typeof value !== 'object') return false;
  const record = value as Partial<PortableWorkbook>;
  if (typeof record.id !== 'string' || typeof record.name !== 'string' || typeof record.activeSheetId !== 'string') return false;
  if (!Array.isArray(record.sheets) || record.sheets.length === 0) return false;
  return record.sheets.every((sheet) => (
    sheet
    && typeof sheet.id === 'string'
    && typeof sheet.name === 'string'
    && Number.isInteger(sheet.rowCount)
    && Number.isInteger(sheet.columnCount)
    && sheet.cells !== null
    && typeof sheet.cells === 'object'
    && Array.isArray(sheet.merges)
  ));
}

export function normalizeStoredWorkbook(value: unknown, fallbackSavedAt = Date.now()): StoredWorkbook | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Partial<StoredWorkbook>;
  if (!isPortableWorkbook(record.workbook)) return null;
  const savedAt = typeof record.savedAt === 'number' && Number.isFinite(record.savedAt) ? record.savedAt : fallbackSavedAt;
  const id = typeof record.id === 'string' && record.id ? record.id : record.workbook.id;
  const name = typeof record.name === 'string' && record.name.trim() ? record.name : record.workbook.name;
  return { id, savedAt, name, workbook: record.workbook };
}

export async function saveWorkbook(workbook: PortableWorkbook, savedAt = Date.now()): Promise<string> {
  if (!isPortableWorkbook(workbook)) throw new Error('Invalid portable workbook.');
  const row: StoredWorkbook = {
    id: workbook.id,
    savedAt,
    name: workbook.name,
    workbook,
  };
  await getSheetsDb().workbooks.put(row);
  return row.id;
}

export async function loadWorkbook(id: string): Promise<StoredWorkbook | null> {
  const row = await getSheetsDb().workbooks.get(id);
  return row ? normalizeStoredWorkbook(row) : null;
}

export async function listWorkbooks(): Promise<StoredWorkbook[]> {
  const rows = await getSheetsDb().workbooks.orderBy('savedAt').reverse().toArray();
  return rows.flatMap((row) => {
    const normalized = normalizeStoredWorkbook(row, Number.NaN);
    return normalized ? [normalized] : [];
  });
}

export async function deleteWorkbook(id: string): Promise<void> {
  await getSheetsDb().workbooks.delete(id);
}

export async function clearWorkbooks(): Promise<void> {
  await getSheetsDb().workbooks.clear();
}

export function readPrefsFromLocalStorage(storage: Pick<Storage, 'getItem'> | null = typeof localStorage === 'undefined' ? null : localStorage): SheetPrefs {
  if (!storage) return defaultPrefs();
  try {
    const raw = storage.getItem(PREFS_KEY);
    if (!raw) return defaultPrefs();
    const parsed = JSON.parse(raw) as Partial<SheetPrefs>;
    return {
      ...defaultPrefs(),
      zoom: typeof parsed.zoom === 'number' && parsed.zoom >= 50 && parsed.zoom <= 200 ? parsed.zoom : 100,
      theme: parsed.theme === 'high-contrast' ? 'high-contrast' : 'light',
      lastWorkbookId: typeof parsed.lastWorkbookId === 'string' ? parsed.lastWorkbookId : null,
      showProgress: parsed.showProgress !== false,
    };
  } catch {
    return defaultPrefs();
  }
}

export function writePrefsToLocalStorage(
  prefs: SheetPrefs,
  storage: Pick<Storage, 'setItem'> | null = typeof localStorage === 'undefined' ? null : localStorage,
): void {
  if (!storage) return;
  storage.setItem(PREFS_KEY, JSON.stringify(prefs));
}

export async function writePreference<T>(key: string, value: T): Promise<void> {
  await getSheetsDb().preferences.put({ key, value });
}

export async function readPreference<T>(key: string, fallback: T): Promise<T> {
  const row = await getSheetsDb().preferences.get(key);
  return row ? row.value as T : fallback;
}

export function persistenceContract() {
  return {
    tool: TOOL_ID,
    schemaVersion: SCHEMA_VERSION,
    database: DB_NAME,
    prefsKey: PREFS_KEY,
    remote: false,
  };
}

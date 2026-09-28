// IndexedDB persistence for the typing workstation. Uses Dexie for the
// transactional key-value tables. Every write is scoped to this tool so it
// cannot collide with other InMo Tools suites.

import Dexie, { type Table } from 'dexie';
import type { KeystrokeEvent } from './typing-engine';
import { LANGUAGE_POOLS, LAYOUTS, type CorpusMode, type Language, type LayoutId, type Quote } from './typing-corpora';

export interface StoredTest {
  id?: number;
  savedAt: number; // epoch ms
  /** Stable local typist owner. Optional only at the legacy/import normalization boundary. */
  typistId?: string;
  mode: CorpusMode;
  durationMode: 'time' | 'words' | 'quote' | 'zen' | 'certification';
  durationValue: number;
  quoteLength?: Quote['length'];
  language: Language;
  layout: LayoutId;
  targetText: string;
  finishReason: 'completed' | 'failed' | 'aborted' | 'stopped';
  netWpm: number;
  grossWpm: number;
  rawCpm: number;
  accuracy: number;
  consistency: number;
  elapsedMs: number;
  correctChars: number;
  incorrectChars: number;
  missedChars: number;
  extraChars: number;
  tags: string[];
  notes: string;
  // Full keystroke log is optional to keep large tests manageable.
  keystrokes?: KeystrokeEvent[];
}

export interface StoredTypist {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}

export const DEFAULT_TYPIST_ID = 'local-default';
export const DEFAULT_TYPIST_NAME = 'Local typist';

export interface StoredDictionary {
  id?: number;
  name: string;
  language: Language;
  words: string[];
  createdAt: number;
}

export interface StoredPreference {
  key: string;
  value: unknown;
}

export interface StoredDrill {
  id?: number;
  name: string;
  weakKeys: string[];
  text: string;
  createdAt: number;
}

export interface PersonalBestQuery {
  typistId?: string;
  mode: CorpusMode;
  durationMode: StoredTest['durationMode'];
  durationValue: number;
  language: Language;
  layout: LayoutId;
  quoteLength?: Quote['length'];
}

class TypingDb extends Dexie {
  tests!: Table<StoredTest, number>;
  typists!: Table<StoredTypist, string>;
  dictionaries!: Table<StoredDictionary, number>;
  preferences!: Table<StoredPreference, string>;
  drills!: Table<StoredDrill, number>;

  constructor() {
    super('inmotools-typing-workstation');
    this.version(1).stores({
      tests: '++id, savedAt, mode, language, layout, netWpm, *tags',
      dictionaries: '++id, name, language, createdAt',
      preferences: 'key',
      drills: '++id, name, createdAt',
    });
    this.version(2).stores({
      tests: '++id, savedAt, typistId, mode, language, layout, netWpm, *tags',
      typists: 'id, name, updatedAt',
      dictionaries: '++id, name, language, createdAt',
      preferences: 'key',
      drills: '++id, name, createdAt',
    });
  }
}

let dbInstance: TypingDb | null = null;

function getDb(): TypingDb {
  if (!dbInstance) dbInstance = new TypingDb();
  return dbInstance;
}

// --------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------
const CORPUS_MODES = new Set<CorpusMode>([
  'words-200', 'words-1000', 'words-5000', 'punctuation', 'numbers', 'code',
  'medical', 'legal', 'kids', 'quote', 'zen', 'custom',
]);
const DURATION_MODES = new Set<StoredTest['durationMode']>(['time', 'words', 'quote', 'zen', 'certification']);
const FINISH_REASONS = new Set<StoredTest['finishReason']>(['completed', 'failed', 'aborted', 'stopped']);
const QUOTE_LENGTHS = new Set<Quote['length']>(['short', 'medium', 'long', 'thicc']);
const LANGUAGES = new Set<Language>(Object.keys(LANGUAGE_POOLS) as Language[]);
const LAYOUT_IDS = new Set<LayoutId>(LAYOUTS.map((layout) => layout.id));

function finiteNumber(value: unknown, min = 0, max = Number.POSITIVE_INFINITY): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max;
}
function validKeystrokes(value: unknown): value is KeystrokeEvent[] {
  if (!Array.isArray(value)) return false;
  return value.every((event) => {
    if (event == null || typeof event !== 'object') return false;
    const record = event as Partial<KeystrokeEvent>;
    return finiteNumber(record.t)
      && typeof record.key === 'string'
      && typeof record.code === 'string'
      && typeof record.correct === 'boolean'
      && Number.isInteger(record.index)
      && typeof record.expected === 'string';
  });
}
export function normalizeStoredTest(value: unknown, fallbackSavedAt = Date.now()): StoredTest | null {
  if (value == null || typeof value !== 'object') return null;
  const record = value as Partial<StoredTest>;
  if (!CORPUS_MODES.has(record.mode as CorpusMode)) return null;
  if (!DURATION_MODES.has(record.durationMode as StoredTest['durationMode'])) return null;
  if (!LANGUAGES.has(record.language as Language) || !LAYOUT_IDS.has(record.layout as LayoutId)) return null;
  if (!FINISH_REASONS.has(record.finishReason as StoredTest['finishReason'])) return null;
  if (record.quoteLength !== undefined && !QUOTE_LENGTHS.has(record.quoteLength)) return null;
  if ((record.mode === 'quote') !== (record.durationMode === 'quote')) return null;
  if ((record.mode === 'zen') !== (record.durationMode === 'zen')) return null;
  if (record.durationMode === 'quote' && record.quoteLength === undefined) return null;
  if (typeof record.targetText !== 'string' || !finiteNumber(record.durationValue)) return null;
  if (!finiteNumber(record.netWpm) || !finiteNumber(record.grossWpm) || !finiteNumber(record.rawCpm)) return null;
  if (!finiteNumber(record.accuracy, 0, 100) || !finiteNumber(record.consistency, 0, 100)) return null;
  if (!finiteNumber(record.elapsedMs) || !finiteNumber(record.correctChars) || !finiteNumber(record.incorrectChars)
      || !finiteNumber(record.missedChars) || !finiteNumber(record.extraChars)) return null;
  if (record.tags !== undefined && (!Array.isArray(record.tags) || !record.tags.every((tag) => typeof tag === 'string'))) return null;
  if (record.notes !== undefined && typeof record.notes !== 'string') return null;
  if (record.keystrokes !== undefined && !validKeystrokes(record.keystrokes)) return null;
  const savedAt = record.savedAt === undefined ? fallbackSavedAt : record.savedAt;
  if (!finiteNumber(savedAt)) return null;
  if (record.id !== undefined && (!Number.isInteger(record.id) || record.id <= 0)) return null;
  if (record.typistId !== undefined && (typeof record.typistId !== 'string' || record.typistId.trim() === '')) return null;
  return { ...(record as StoredTest), savedAt, typistId: record.typistId?.trim(), tags: record.tags ?? [], notes: record.notes ?? '' };
}

export async function saveTest(test: StoredTest): Promise<number> {
  const normalized = normalizeStoredTest(test);
  if (!normalized) throw new Error('Invalid typing test record.');
  const localTest = { ...normalized };
  delete localTest.id;
  return getDb().tests.add(localTest);
}

export async function updateTestTags(id: number, tags: string[], notes?: string): Promise<void> {
  const patch: Partial<StoredTest> = { tags };
  if (notes !== undefined) patch.notes = notes;
  await getDb().tests.update(id, patch);
}

export async function deleteTest(id: number): Promise<void> {
  await getDb().tests.delete(id);
}

export async function listTests(): Promise<StoredTest[]> {
  const rows = await getDb().tests.orderBy('savedAt').reverse().toArray();
  return rows.flatMap((row) => {
    const normalized = normalizeStoredTest(row, Number.NaN);
    return normalized ? [normalized] : [];
  });
}

export interface TestFilterOptions {
  typistId?: string;
  tags?: string[];
  mode?: CorpusMode;
  language?: Language;
  layout?: LayoutId;
  since?: number;
  until?: number;
}
export function filterStoredTests(tests: StoredTest[], opts: TestFilterOptions): StoredTest[] {
  const wantedTags = (opts.tags ?? []).map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean);
  return tests.filter((test) => {
    if (opts.typistId && test.typistId !== opts.typistId) return false;
    if (opts.mode && test.mode !== opts.mode) return false;
    if (opts.language && test.language !== opts.language) return false;
    if (opts.layout && test.layout !== opts.layout) return false;
    if (opts.since && test.savedAt < opts.since) return false;
    if (opts.until && test.savedAt > opts.until) return false;
    if (wantedTags.length > 0) {
      const storedTags = new Set(test.tags.map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean));
      if (!wantedTags.every((tag) => storedTags.has(tag))) return false;
    }
    return true;
  });
}
export async function filterTests(opts: TestFilterOptions): Promise<StoredTest[]> {
  return filterStoredTests(await listTests(), opts);
}

export async function findPersonalBest(query: PersonalBestQuery): Promise<StoredTest | undefined> {
  const rows = await getDb().tests
    .where('mode').equals(query.mode)
    .filter((t) => (
      (!query.typistId || t.typistId === query.typistId)
      && t.durationMode === query.durationMode
      && (query.durationMode === 'quote' || query.durationMode === 'zen' || t.durationValue === query.durationValue)
      && t.language === query.language
      && t.layout === query.layout
      && t.finishReason === 'completed'
      && (query.durationMode !== 'quote' || t.quoteLength === query.quoteLength)
    ))
    .toArray();
  const normalizedRows = rows.flatMap((row) => {
    const normalized = normalizeStoredTest(row, Number.NaN);
    return normalized ? [normalized] : [];
  });
  if (normalizedRows.length === 0) return undefined;
  normalizedRows.sort((a, b) => b.netWpm - a.netWpm);
  return normalizedRows[0];
}

export async function clearAllTests(): Promise<void> {
  await getDb().tests.clear();
}

export async function clearTestsForTypist(typistId: string): Promise<void> {
  await getDb().tests.where('typistId').equals(typistId).delete();
}

export async function listTestsForTypist(typistId: string): Promise<StoredTest[]> {
  return filterStoredTests(await listTests(), { typistId });
}

// --------------------------------------------------------------------
// Typists
// --------------------------------------------------------------------

export async function ensureDefaultTypist(): Promise<StoredTypist> {
  const db = getDb();
  const now = Date.now();
  let profile = await db.typists.get(DEFAULT_TYPIST_ID);
  if (!profile) {
    profile = { id: DEFAULT_TYPIST_ID, name: DEFAULT_TYPIST_NAME, createdAt: now, updatedAt: now };
    await db.typists.put(profile);
  }
  await db.tests.filter((test) => !test.typistId).modify({ typistId: DEFAULT_TYPIST_ID });
  return profile;
}

export async function listTypists(): Promise<StoredTypist[]> {
  await ensureDefaultTypist();
  return getDb().typists.orderBy('name').toArray();
}

export async function createTypist(name: string): Promise<StoredTypist> {
  const normalizedName = name.trim().replace(/\s+/g, ' ');
  if (!normalizedName) throw new Error('Typist name is required.');
  const existing = await listTypists();
  if (existing.some((profile) => profile.name.toLocaleLowerCase() === normalizedName.toLocaleLowerCase())) {
    throw new Error('A typist with that name already exists.');
  }
  const now = Date.now();
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `typist-${now}-${Math.random().toString(36).slice(2, 10)}`;
  const profile: StoredTypist = { id: randomId, name: normalizedName, createdAt: now, updatedAt: now };
  await getDb().typists.add(profile);
  return profile;
}

// --------------------------------------------------------------------
// Dictionaries
// --------------------------------------------------------------------
export async function saveDictionary(dict: StoredDictionary): Promise<number> {
  return getDb().dictionaries.add(dict);
}

export async function listDictionaries(): Promise<StoredDictionary[]> {
  return getDb().dictionaries.orderBy('createdAt').reverse().toArray();
}

export async function deleteDictionary(id: number): Promise<void> {
  await getDb().dictionaries.delete(id);
}

// --------------------------------------------------------------------
// Drills
// --------------------------------------------------------------------
export async function saveDrill(drill: StoredDrill): Promise<number> {
  return getDb().drills.add(drill);
}

export async function listDrills(): Promise<StoredDrill[]> {
  return getDb().drills.orderBy('createdAt').reverse().toArray();
}

export async function deleteDrill(id: number): Promise<void> {
  await getDb().drills.delete(id);
}

// --------------------------------------------------------------------
// Preferences
// --------------------------------------------------------------------
export async function readPreference<T>(key: string, fallback: T): Promise<T> {
  const row = await getDb().preferences.get(key);
  if (!row) return fallback;
  return row.value as T;
}

export async function writePreference<T>(key: string, value: T): Promise<void> {
  await getDb().preferences.put({ key, value });
}

// --------------------------------------------------------------------
// Aggregate analytics helpers.
// --------------------------------------------------------------------
export interface RollingAverages {
  last10: number;
  last50: number;
  allTime: number;
}

export function rollingWpm(tests: StoredTest[]): RollingAverages {
  const sorted = tests.slice().sort((a, b) => a.savedAt - b.savedAt);
  const mean = (arr: number[]) => (arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length);
  const wpm = sorted.map((t) => t.netWpm);
  return {
    last10: mean(wpm.slice(-10)),
    last50: mean(wpm.slice(-50)),
    allTime: mean(wpm),
  };
}

export interface DailyActivity {
  date: string; // YYYY-MM-DD
  tests: number;
  totalMs: number;
  meanWpm: number;
}

export function dailyActivity(tests: StoredTest[]): DailyActivity[] {
  const map = new Map<string, DailyActivity>();
  for (const t of tests) {
    const d = new Date(t.savedAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const existing = map.get(key);
    if (existing) {
      existing.tests += 1;
      existing.totalMs += t.elapsedMs;
      existing.meanWpm = (existing.meanWpm * (existing.tests - 1) + t.netWpm) / existing.tests;
    } else {
      map.set(key, { date: key, tests: 1, totalMs: t.elapsedMs, meanWpm: t.netWpm });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// IndexedDB persistence for the typing workstation. Uses Dexie for the
// transactional key-value tables. Every write is scoped to this tool so it
// cannot collide with other InMo Tools suites.

import Dexie, { type Table } from 'dexie';
import type { KeystrokeEvent } from './typing-engine';
import type { CorpusMode, Language, LayoutId } from './typing-corpora';

export interface StoredTest {
  id?: number;
  savedAt: number; // epoch ms
  mode: CorpusMode;
  durationMode: 'time' | 'words' | 'quote' | 'zen' | 'certification';
  durationValue: number;
  language: Language;
  layout: LayoutId;
  targetText: string;
  finishReason: 'completed' | 'failed' | 'aborted';
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

class TypingDb extends Dexie {
  tests!: Table<StoredTest, number>;
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
export async function saveTest(test: StoredTest): Promise<number> {
  return getDb().tests.add(test);
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
  return getDb().tests.orderBy('savedAt').reverse().toArray();
}

export async function filterTests(opts: {
  tags?: string[];
  mode?: CorpusMode;
  language?: Language;
  layout?: LayoutId;
  since?: number;
  until?: number;
}): Promise<StoredTest[]> {
  const all = await listTests();
  return all.filter((t) => {
    if (opts.mode && t.mode !== opts.mode) return false;
    if (opts.language && t.language !== opts.language) return false;
    if (opts.layout && t.layout !== opts.layout) return false;
    if (opts.since && t.savedAt < opts.since) return false;
    if (opts.until && t.savedAt > opts.until) return false;
    if (opts.tags && opts.tags.length > 0) {
      if (!opts.tags.every((tag) => t.tags.includes(tag))) return false;
    }
    return true;
  });
}

export async function findPersonalBest(mode: CorpusMode, durationValue: number): Promise<StoredTest | undefined> {
  const rows = await getDb().tests
    .where('mode').equals(mode)
    .filter((t) => t.durationValue === durationValue && t.finishReason === 'completed')
    .toArray();
  if (rows.length === 0) return undefined;
  rows.sort((a, b) => b.netWpm - a.netWpm);
  return rows[0];
}

export async function clearAllTests(): Promise<void> {
  await getDb().tests.clear();
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

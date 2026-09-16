import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearAllTests,
  dailyActivity,
  filterTests,
  findPersonalBest,
  listTests,
  readPreference,
  rollingWpm,
  saveTest,
  updateTestTags,
  writePreference,
  type StoredTest,
} from '../../src/tools/typing/typing-storage';

function makeTest(overrides: Partial<StoredTest> = {}): StoredTest {
  return {
    savedAt: Date.now(),
    mode: 'words-1000',
    durationMode: 'time',
    durationValue: 30,
    language: 'english',
    layout: 'qwerty',
    targetText: 'test',
    finishReason: 'completed',
    netWpm: 70,
    grossWpm: 74,
    rawCpm: 370,
    accuracy: 96,
    consistency: 82,
    elapsedMs: 30000,
    correctChars: 210,
    incorrectChars: 4,
    missedChars: 0,
    extraChars: 0,
    tags: [],
    notes: '',
    ...overrides,
  };
}

describe('typing storage', () => {
  beforeEach(async () => {
    await clearAllTests();
  });

  it('round-trips a stored test', async () => {
    const id = await saveTest(makeTest({ tags: ['morning'] }));
    expect(id).toBeGreaterThan(0);
    const rows = await listTests();
    expect(rows.length).toBe(1);
    expect(rows[0]?.tags).toEqual(['morning']);
  });

  it('assigns fresh local ids when imported records carry an existing id', async () => {
    const first = await saveTest(makeTest({ id: 7, notes: 'first import' }));
    const second = await saveTest(makeTest({ id: 7, notes: 'second import' }));
    expect(second).not.toBe(first);
    const rows = await listTests();
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.id)).size).toBe(2);
    expect(rows.map((row) => row.notes).sort()).toEqual(['first import', 'second import']);
  });

  it('updates tags and notes for a stored test', async () => {
    const id = await saveTest(makeTest());
    await updateTestTags(id, ['code', 'sprint'], 'daily warm-up');
    const rows = await listTests();
    expect(rows[0]?.tags).toEqual(['code', 'sprint']);
    expect(rows[0]?.notes).toBe('daily warm-up');
  });

  it('filters tests by tag intersection', async () => {
    await saveTest(makeTest({ tags: ['morning', 'code'] }));
    await saveTest(makeTest({ tags: ['legal'] }));
    const filtered = await filterTests({ tags: ['code'] });
    expect(filtered.length).toBe(1);
  });

  it('finds a personal best only inside the same test family', async () => {
    await saveTest(makeTest({ netWpm: 90, durationMode: 'time', durationValue: 30, language: 'english', layout: 'qwerty' }));
    await saveTest(makeTest({ netWpm: 140, durationMode: 'time', durationValue: 30, language: 'spanish', layout: 'qwerty' }));
    await saveTest(makeTest({ netWpm: 150, durationMode: 'time', durationValue: 30, language: 'english', layout: 'azerty' }));
    await saveTest(makeTest({ netWpm: 160, durationMode: 'words', durationValue: 30, language: 'english', layout: 'qwerty' }));

    const pb = await findPersonalBest({
      mode: 'words-1000',
      durationMode: 'time',
      durationValue: 30,
      language: 'english',
      layout: 'qwerty',
    });
    expect(pb?.netWpm).toBe(90);
  });

  it('keeps personal-best quote lengths isolated without depending on an irrelevant prior duration value', async () => {
    await saveTest(makeTest({ mode: 'quote', durationMode: 'quote', durationValue: 30, quoteLength: 'short', netWpm: 80 }));
    await saveTest(makeTest({ mode: 'quote', durationMode: 'quote', durationValue: 60, quoteLength: 'long', netWpm: 130 }));

    const pb = await findPersonalBest({
      mode: 'quote',
      durationMode: 'quote',
      durationValue: 120,
      language: 'english',
      layout: 'qwerty',
      quoteLength: 'short',
    });
    expect(pb?.netWpm).toBe(80);
  });

  it('persists preferences', async () => {
    await writePreference('config', { theme: 'nord' });
    const value = await readPreference<{ theme: string }>('config', { theme: 'light' });
    expect(value.theme).toBe('nord');
  });

  it('computes rolling averages and daily activity', async () => {
    await saveTest(makeTest({ savedAt: Date.UTC(2026, 8, 14, 8, 0, 0), netWpm: 50 }));
    await saveTest(makeTest({ savedAt: Date.UTC(2026, 8, 14, 12, 0, 0), netWpm: 60 }));
    await saveTest(makeTest({ savedAt: Date.UTC(2026, 8, 15, 8, 0, 0), netWpm: 70 }));
    const rows = await listTests();
    const rolling = rollingWpm(rows);
    expect(rolling.last10).toBeCloseTo(60, 1);
    const daily = dailyActivity(rows);
    expect(daily.length).toBe(2);
    expect(daily[0]?.tests).toBe(2);
  });
});

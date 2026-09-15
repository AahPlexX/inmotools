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

  it('finds the personal best per mode + duration', async () => {
    await saveTest(makeTest({ netWpm: 60, durationValue: 30 }));
    await saveTest(makeTest({ netWpm: 90, durationValue: 30 }));
    await saveTest(makeTest({ netWpm: 200, durationValue: 60 }));
    const pb = await findPersonalBest('words-1000', 30);
    expect(pb?.netWpm).toBe(90);
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

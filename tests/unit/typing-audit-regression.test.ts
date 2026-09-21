import { describe, expect, it } from 'vitest';
import * as audio from '../../src/tools/typing/typing-audio';
import * as corpora from '../../src/tools/typing/typing-corpora';
import {
  computeMetrics,
  finish,
  ghostSeries,
  initState,
  pressKey,
  wpmSeries,
} from '../../src/tools/typing/typing-engine';
import * as typingExport from '../../src/tools/typing/typing-export';
import * as storage from '../../src/tools/typing/typing-storage';
import type { StoredTest } from '../../src/tools/typing/typing-storage';

const sampleTest: StoredTest = {
  id: 1,
  savedAt: Date.UTC(2026, 8, 16, 12, 0, 0),
  mode: 'words-1000',
  durationMode: 'time',
  durationValue: 30,
  language: 'english',
  layout: 'qwerty',
  targetText: 'alpha beta',
  finishReason: 'completed',
  netWpm: 72,
  grossWpm: 75,
  rawCpm: 375,
  accuracy: 98,
  consistency: 84,
  elapsedMs: 30000,
  correctChars: 180,
  incorrectChars: 2,
  missedChars: 0,
  extraChars: 0,
  tags: ['morning'],
  notes: 'baseline',
};

describe('typing audit regressions', () => {
  it('counts an expected Enter/newline consistently in final, live, and ghost metrics', () => {
    let state = initState('a\nb');
    state = pressKey(state, 'a', 'KeyA', 100);
    state = pressKey(state, 'Enter', 'Enter', 600);
    state = pressKey(state, 'b', 'KeyB', 1100);
    state = finish(state, 'completed', 1200);

    expect(computeMetrics(state).correctChars).toBe(3);
    expect(wpmSeries(state).at(-1)?.wpm).toBe(18);
    expect(ghostSeries(state.events).at(-1)?.correctChars).toBe(3);
  });

  it('keeps Backspace in the raw event log and removes erased progress from the ghost', () => {
    let state = initState('a');
    state = pressKey(state, 'a', 'KeyA', 100);
    state = pressKey(state, 'Backspace', 'Backspace', 200);
    state = pressKey(state, 'a', 'KeyA', 1100);

    expect(state.events.map((event) => event.key)).toEqual(['a', 'Backspace', 'a']);
    expect(ghostSeries(state.events).at(-1)?.correctChars).toBe(1);
  });

  it('classifies wrong keys as incorrect audio cues without misclassifying valid special keys', () => {
    const classify = (audio as typeof audio & {
      classifyKeystrokeSound?: (key: string, expected: string | undefined, caseSensitive: boolean) => string | null;
    }).classifyKeystrokeSound;
    expect(classify).toBeTypeOf('function');
    if (!classify) return;

    expect(classify('x', 'a', true)).toBe('incorrect');
    expect(classify('A', 'a', false)).toBe('correct');
    expect(classify(' ', ' ', true)).toBe('space');
    expect(classify('Enter', '\n', true)).toBe('enter');
    expect(classify('Enter', 'a', true)).toBeNull();
    expect(classify('Backspace', 'a', true)).toBe('backspace');
  });

  it('derives home-row index anchors from the selected physical layout', () => {
    const homeRowAnchors = (corpora as typeof corpora & {
      homeRowAnchors?: (layout: ReturnType<typeof corpora.findLayout>) => { left: string; right: string };
    }).homeRowAnchors;
    expect(homeRowAnchors).toBeTypeOf('function');
    if (!homeRowAnchors) return;

    expect(homeRowAnchors(corpora.findLayout('qwerty'))).toEqual({ left: 'f', right: 'j' });
    expect(homeRowAnchors(corpora.findLayout('dvorak'))).toEqual({ left: 'u', right: 'h' });
    expect(homeRowAnchors(corpora.findLayout('bapo'))).toEqual({ left: 'e', right: 's' });
  });

  it('escapes spreadsheet formula-like values in CSV exports', () => {
    const csv = typingExport.testsToCsv([sampleTest], {
      ...typingExport.EMPTY_EXPORT_METADATA,
      typistName: '=1+1',
      notes: '@SUM(A1:A2)',
    });
    expect(csv).toContain("'=1+1");
    expect(csv).toContain("'@SUM(A1:A2)");
  });

  it('does not issue a proficiency certificate for a failed or aborted test', () => {
    expect(() => typingExport.certificatePdf({ ...sampleTest, finishReason: 'failed' }, typingExport.EMPTY_EXPORT_METADATA)).toThrow();
    expect(() => typingExport.certificatePdf({ ...sampleTest, finishReason: 'aborted' }, typingExport.EMPTY_EXPORT_METADATA)).toThrow();
  });

  it('sanitizes imported bundles instead of persisting malformed history records', () => {
    const parseImportedTests = (typingExport as typeof typingExport & {
      parseImportedTests?: (value: unknown, now?: number) => { tests: StoredTest[]; skipped: number };
    }).parseImportedTests;
    expect(parseImportedTests).toBeTypeOf('function');
    if (!parseImportedTests) return;

    const result = parseImportedTests({
      tool: 'inmotools-typing-workstation',
      schemaVersion: 1,
      tests: [
        sampleTest,
        { ...sampleTest, id: 2, tags: '=not-an-array' },
        { ...sampleTest, id: 3, mode: 'not-a-mode' },
      ],
    }, Date.UTC(2026, 8, 16, 13, 0, 0));

    expect(result.tests).toHaveLength(1);
    expect(result.tests[0]?.tags).toEqual(['morning']);
    expect(result.skipped).toBe(2);
  });

  it('uses one shared tag-filter contract for visible history and exports', () => {
    const filterStoredTests = (storage as typeof storage & {
      filterStoredTests?: (tests: StoredTest[], opts: { tags?: string[] }) => StoredTest[];
    }).filterStoredTests;
    expect(filterStoredTests).toBeTypeOf('function');
    if (!filterStoredTests) return;

    const rows = [
      sampleTest,
      { ...sampleTest, id: 2, tags: ['morning', 'code'] },
      { ...sampleTest, id: 3, tags: ['legal'] },
    ];
    expect(filterStoredTests(rows, { tags: ['morning', 'code'] })).toHaveLength(1);
    expect(filterStoredTests(rows, { tags: [' MORNING ', 'Code'] })).toHaveLength(1);
    expect(filterStoredTests(rows, { tags: ['missing'] })).toHaveLength(0);
  });
});

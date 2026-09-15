import { describe, expect, it } from 'vitest';
import {
  EMPTY_EXPORT_METADATA,
  certificatePdf,
  keystrokesToCsv,
  sessionMarkdown,
  suggestFilename,
  testToJson,
  testsToCsv,
  testsToJson,
} from '../../src/tools/typing/typing-export';
import type { StoredTest } from '../../src/tools/typing/typing-storage';

const sampleTest: StoredTest = {
  id: 1,
  savedAt: Date.UTC(2026, 8, 15, 12, 0, 0),
  mode: 'words-1000',
  durationMode: 'time',
  durationValue: 30,
  language: 'english',
  layout: 'qwerty',
  targetText: 'hello world',
  finishReason: 'completed',
  netWpm: 88,
  grossWpm: 92,
  rawCpm: 460,
  accuracy: 97.5,
  consistency: 82.3,
  elapsedMs: 30000,
  correctChars: 220,
  incorrectChars: 4,
  missedChars: 0,
  extraChars: 1,
  tags: ['morning', 'code'],
  notes: 'warmup',
  keystrokes: [
    { t: 10, key: 'h', code: 'KeyH', correct: true, index: 0, expected: 'h' },
    { t: 25, key: 'e', code: 'KeyE', correct: true, index: 1, expected: 'e' },
  ],
};

describe('typing exports', () => {
  it('emits CSV with the expected columns', () => {
    const csv = testsToCsv([sampleTest]);
    const header = csv.split('\n')[0]!;
    expect(header).toContain('net_wpm');
    expect(header).toContain('accuracy_pct');
    expect(header).toContain('tags');
    expect(csv).toContain('88');
    expect(csv).toContain('morning|code');
  });

  it('emits keystroke CSV rows', () => {
    const csv = keystrokesToCsv(sampleTest.keystrokes!);
    expect(csv.split('\n')[0]).toContain('seq,time_ms,key,code');
    expect(csv).toContain('KeyH');
  });

  it('emits JSON envelope with editable meta', () => {
    const meta = { ...EMPTY_EXPORT_METADATA, typistName: 'Ada', tags: ['proctored'], notes: 'exam' };
    const json = testToJson(sampleTest, meta);
    const parsed = JSON.parse(json);
    expect(parsed.tool).toBe('inmotools-typing-workstation');
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.typistName).toBe('Ada');
    expect(parsed.test.tags).toContain('morning');
    expect(parsed.test.tags).toContain('proctored');
  });

  it('respects includeKeystrokes when producing bulk exports', () => {
    const meta = { ...EMPTY_EXPORT_METADATA, includeKeystrokes: false };
    const json = testsToJson([sampleTest], meta);
    const parsed = JSON.parse(json);
    expect(parsed.tests[0].keystrokes).toBeUndefined();
    const jsonWith = testsToJson([sampleTest], { ...meta, includeKeystrokes: true });
    const parsedWith = JSON.parse(jsonWith);
    expect(parsedWith.tests[0].keystrokes).toHaveLength(2);
  });

  it('emits Markdown session summary', () => {
    const md = sessionMarkdown([sampleTest], { ...EMPTY_EXPORT_METADATA, typistName: 'Grace' });
    expect(md).toContain('# Typing Workstation Session');
    expect(md).toContain('Grace');
    expect(md).toMatch(/\|.*Net WPM.*\|/);
  });

  it('builds a certificate PDF blob', () => {
    const blob = certificatePdf(sampleTest, { ...EMPTY_EXPORT_METADATA, typistName: 'Grace' });
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.size).toBeGreaterThan(500);
    expect(blob.type).toContain('pdf');
  });

  it('suggests deterministic filenames', () => {
    const stamp = new Date(Date.UTC(2026, 8, 15, 12, 30, 45));
    expect(suggestFilename('csv', 'test', stamp)).toBe('typing-test-2026-09-15T12-30-45.csv');
    expect(suggestFilename('pdf', 'test', stamp)).toBe('typing-test-2026-09-15T12-30-45.pdf');
    expect(suggestFilename('json', 'history', stamp)).toBe('typing-history-2026-09-15T12-30-45.json');
  });
});

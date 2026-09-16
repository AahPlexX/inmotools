import { describe, expect, it } from 'vitest';
import { quotesByLength } from '../../src/tools/typing/typing-corpora';
import {
  buildTargetText,
  buildZenChunk,
  countWords,
  targetWordCapacity,
  TIMED_CAPACITY_WPM,
  type TargetConfig,
} from '../../src/tools/typing/typing-target';

const BASE: TargetConfig = {
  language: 'english',
  mode: 'words-1000',
  durationMode: 'time',
  durationValue: 30,
  quoteLength: 'medium',
  customText: '',
  codeIndex: 0,
};

describe('typing target duration contracts', () => {
  it('builds exactly the selected number of words for word-count tests', () => {
    const target = buildTargetText({ ...BASE, durationMode: 'words', durationValue: 10 }, 42);
    expect(countWords(target)).toBe(10);
  });

  it('applies word-count duration to fixed specialized corpora without losing their original whitespace before the cutoff', () => {
    const target = buildTargetText({ ...BASE, mode: 'code', durationMode: 'words', durationValue: 25 }, 42);
    expect(countWords(target)).toBe(25);
    expect(target.length).toBeGreaterThan(25);
  });

  it('allocates enough target text for timed and five-minute certification sessions', () => {
    const timed = { ...BASE, durationMode: 'time' as const, durationValue: 120 };
    const certification = { ...BASE, durationMode: 'certification' as const };
    const timedCapacity = targetWordCapacity(timed);
    const certificationCapacity = targetWordCapacity(certification);
    expect(timedCapacity).toBeGreaterThanOrEqual(Math.ceil((120 / 60) * TIMED_CAPACITY_WPM));
    expect(certificationCapacity).toBeGreaterThanOrEqual(Math.ceil((300 / 60) * TIMED_CAPACITY_WPM));
    expect(countWords(buildTargetText(timed, 7))).toBe(timedCapacity);
    expect(countWords(buildTargetText(certification, 7))).toBe(certificationCapacity);
  });

  it('uses the selected quote length when quote duration is chosen', () => {
    const target = buildTargetText({ ...BASE, durationMode: 'quote', quoteLength: 'short' }, 3);
    expect(quotesByLength('short').some((quote) => quote.text === target)).toBe(true);
  });

  it('repeats short custom text to satisfy an exact word-count contract', () => {
    const target = buildTargetText({ ...BASE, mode: 'custom', durationMode: 'words', durationValue: 10, customText: 'alpha beta' }, 1);
    expect(countWords(target)).toBe(10);
  });

  it('creates deterministic replenishment chunks for Zen mode', () => {
    const a = buildZenChunk('english', 9, 160);
    const b = buildZenChunk('english', 9, 160);
    expect(a).toBe(b);
    expect(countWords(a)).toBe(160);
  });
});

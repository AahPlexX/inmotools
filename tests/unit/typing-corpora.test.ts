import { describe, expect, it } from 'vitest';
import {
  CODE_SNIPPETS,
  ENGLISH_TOP_200,
  ENGLISH_TOP_1000,
  ENGLISH_TOP_5000,
  KIDS_SENTENCES,
  LAYOUTS,
  LEGAL_SENTENCES,
  MEDICAL_SENTENCES,
  QUOTES,
  findLayout,
  poolForMode,
  quotesByLength,
} from '../../src/tools/typing/typing-corpora';

describe('typing corpora', () => {
  it('provides frequency tiers of unique words', () => {
    expect(ENGLISH_TOP_200.length).toBeGreaterThan(100);
    expect(new Set(ENGLISH_TOP_200).size).toBe(ENGLISH_TOP_200.length);
    expect(ENGLISH_TOP_1000.length).toBeGreaterThan(ENGLISH_TOP_200.length);
    expect(ENGLISH_TOP_5000.length).toBeGreaterThan(ENGLISH_TOP_1000.length);
  });

  it('serves keyboard layouts including QWERTY, Dvorak, Colemak, Workman, AZERTY, QWERTZ, BAPO', () => {
    const ids = LAYOUTS.map((l) => l.id).sort();
    expect(ids).toEqual(['azerty', 'bapo', 'colemak', 'dvorak', 'qwerty', 'qwertz', 'workman']);
  });

  it('returns a layout definition by id', () => {
    expect(findLayout('qwerty').label).toBe('QWERTY');
    expect(() => findLayout('nonexistent' as never)).toThrow();
  });

  it('bundles medical, legal, kids sentences and quotes', () => {
    expect(MEDICAL_SENTENCES.length).toBeGreaterThan(0);
    expect(LEGAL_SENTENCES.length).toBeGreaterThan(0);
    expect(KIDS_SENTENCES.length).toBeGreaterThan(0);
    expect(QUOTES.length).toBeGreaterThan(0);
  });

  it('groups quotes by length', () => {
    expect(quotesByLength('short').length).toBeGreaterThan(0);
    expect(quotesByLength('long').every((q) => q.length === 'long')).toBe(true);
  });

  it('ships programmer code snippets across common languages', () => {
    const langs = new Set(CODE_SNIPPETS.map((s) => s.language));
    expect(langs.has('javascript')).toBe(true);
    expect(langs.has('typescript')).toBe(true);
    expect(langs.has('python')).toBe(true);
    expect(langs.has('sql')).toBe(true);
  });

  it('maps corpus modes to the right pool', () => {
    expect(poolForMode('words-200', 'english').length).toBeGreaterThan(0);
    expect(poolForMode('words-1000', 'english').length).toBeGreaterThan(poolForMode('words-200', 'english').length);
  });
});

import { describe, expect, it } from 'vitest';
import { decodeRegexMatrixState, encodeRegexMatrixState } from '../../src/tools/regex/regex-share';

describe('RegexMatrix share state', () => {
  it('round-trips compressed local state without a server', () => {
    const source = { mode: 'studio' as const, flavor: 'pcre2' as const, pattern: '(?<word>\\w+)', flags: 'g', subject: 'alpha beta' };
    const encoded = encodeRegexMatrixState(source);
    expect(encoded.length).toBeGreaterThan(0);
    expect(decodeRegexMatrixState(encoded)).toEqual(source);
  });

  it('returns null for malformed shared state', () => {
    expect(decodeRegexMatrixState('not-a-valid-state')).toBeNull();
  });
});

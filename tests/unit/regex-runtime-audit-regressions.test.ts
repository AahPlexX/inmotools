import { describe, expect, it } from 'vitest';
import { executePcre2Regex } from '../../src/tools/regex/regex-engine';

describe('RegexMatrix PCRE2 September 2026 audit regressions', () => {
  it('returns only the first PCRE2 match when the application-level global flag is absent', async () => {
    const single = await executePcre2Regex('a', '', 'aaa');
    expect(single.error).toBeNull();
    expect(single.matches.map((match) => match.index)).toEqual([0]);

    const global = await executePcre2Regex('a', 'g', 'aaa');
    expect(global.error).toBeNull();
    expect(global.matches.map((match) => match.index)).toEqual([0, 1, 2]);
  });

  it('reports the same explicit 5,000-record display bound as ECMAScript instead of returning an unbounded PCRE2 list', async () => {
    const result = await executePcre2Regex('a', 'g', 'a'.repeat(5_001));
    expect(result.error).toBeNull();
    expect(result.matches).toHaveLength(5_000);
    expect(result.matchLimit).toBe(5_000);
    expect(result.truncated).toBe(true);
    expect(result.totalMatches).toBe(5_001);
    expect(result.totalMatchesExact).toBe(true);
    expect(result.omittedCount).toBe(1);
    expect(result.offsetUnit).toBe('utf16-code-unit');
  });

  it('reports PCRE2 match offsets in the JavaScript UI UTF-16 code-unit coordinate system', async () => {
    const result = await executePcre2Regex('a', 'g', '😀a');
    expect(result.error).toBeNull();
    expect(result.matches[0]).toMatchObject({ match: 'a', index: 2, end: 3 });
    expect(result.offsetUnit).toBe('utf16-code-unit');
  });
});

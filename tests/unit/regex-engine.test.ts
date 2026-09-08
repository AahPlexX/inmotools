import { describe, expect, it } from 'vitest';
import { advanceStringIndex, executeEcmaRegex, executePcre2Regex } from '../../src/tools/regex/regex-engine';

describe('RegexMatrix execution engines', () => {
  it('returns ECMAScript matches with named groups and exact offsets', () => {
    const result = executeEcmaRegex('(?<year>\\d{4})-(?<month>\\d{2})', 'g', '2026-08 2025-12');
    expect(result.error).toBeNull();
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0]).toMatchObject({ match: '2026-08', index: 0, end: 7, namedGroups: { year: '2026', month: '08' } });
    expect(result.matches[1]).toMatchObject({ match: '2025-12', index: 8, end: 15 });
    expect(result.totalMatches).toBe(2);
    expect(result.truncated).toBe(false);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('returns compile errors instead of throwing from the ECMAScript adapter', () => {
    const result = executeEcmaRegex('[unterminated', 'g', 'abc');
    expect(result.matches).toEqual([]);
    expect(result.error).toMatch(/unterminated|regular expression/i);
  });

  it('executes PCRE2-only atomic grouping through the WASM adapter', async () => {
    const result = await executePcre2Regex('(?>a+)b', '', 'aaab');
    expect(result.engine).toContain('PCRE2');
    expect(result.error).toBeNull();
    expect(result.matches[0]?.match).toBe('aaab');
  });
});

describe('ECMAScript empty-match advancement', () => {
  it('implements AdvanceStringIndex in UTF-16 and Unicode-aware modes', () => {
    expect(advanceStringIndex('😀', 0, false)).toBe(1);
    expect(advanceStringIndex('😀', 0, true)).toBe(2);
    expect(advanceStringIndex('a', 0, true)).toBe(1);
    expect(advanceStringIndex('😀', 2, true)).toBe(3);
  });

  it('does not repeat index 0 for a zero-length global Unicode pattern against an astral code point', () => {
    const result = executeEcmaRegex('(?=)', 'gu', '😀');
    expect(result.error).toBeNull();
    expect(result.matches.map((match) => match.index)).toEqual([0, 2]);
    expect(result.totalMatches).toBe(2);
    expect(result.truncated).toBe(false);
  });

  it('retains UTF-16 code-unit advancement without Unicode-aware flags', () => {
    const result = executeEcmaRegex('(?=)', 'g', '😀');
    expect(result.matches.map((match) => match.index)).toEqual([0, 1, 2]);
  });
});

describe('ECMAScript result limits', () => {
  it('reports an exact omitted count instead of silently truncating 5,001 ordinary matches', () => {
    const subject = 'a'.repeat(5_001);
    const result = executeEcmaRegex('a', 'g', subject);
    expect(result.matches).toHaveLength(5_000);
    expect(result.truncated).toBe(true);
    expect(result.totalMatches).toBe(5_001);
    expect(result.omittedCount).toBe(1);
    expect(result.nextStartIndex).toBe(5_000);
    expect(result.matchLimit).toBe(5_000);
  });

  it('supports bounded continuation from the cursor after the returned subset', () => {
    const subject = 'a'.repeat(5_001);
    const first = executeEcmaRegex('a', 'g', subject);
    const second = executeEcmaRegex('a', 'g', subject, { startIndex: first.nextStartIndex ?? 0 });
    expect(second.matches).toHaveLength(1);
    expect(second.matches[0]?.index).toBe(5_000);
    expect(second.truncated).toBe(false);
    expect(second.totalMatches).toBe(1);
  });

  it('marks total count inexact when the counting guard itself is reached', () => {
    const result = executeEcmaRegex('a', 'g', 'a'.repeat(30), { matchLimit: 5, countLimit: 10 });
    expect(result.matches).toHaveLength(5);
    expect(result.truncated).toBe(true);
    expect(result.totalMatches).toBeNull();
    expect(result.totalMatchesExact).toBe(false);
    expect(result.omittedCount).toBeNull();
    expect(result.nextStartIndex).toBe(5);
  });
});

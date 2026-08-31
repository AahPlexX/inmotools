import { describe, expect, it } from 'vitest';
import { executeEcmaRegex, executePcre2Regex } from '../../src/tools/regex/regex-engine';

describe('RegexMatrix execution engines', () => {
  it('returns ECMAScript matches with named groups and exact offsets', () => {
    const result = executeEcmaRegex('(?<year>\\d{4})-(?<month>\\d{2})', 'g', '2026-08 2025-12');
    expect(result.error).toBeNull();
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0]).toMatchObject({ match: '2026-08', index: 0, end: 7, namedGroups: { year: '2026', month: '08' } });
    expect(result.matches[1]).toMatchObject({ match: '2025-12', index: 8, end: 15 });
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

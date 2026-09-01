import { describe, expect, it } from 'vitest';
import { buildPracticeChallenge } from '../../src/tools/regex/regex-practice';
import { generateFuzzCases, synthesizeRegexCandidates } from '../../src/tools/regex/regex-synthesis';
import { ACADEMY_TRACKS } from '../../src/tools/regex/regex-academy';

describe('RegexMatrix learning and synthesis expansion', () => {
  it('adds a dedicated SEO course and expands the bundled curriculum', () => {
    const seo = ACADEMY_TRACKS.find((track) => track.id === 'seo');
    expect(seo?.title).toBe('Regex for SEO');
    expect(seo?.lessons.length).toBeGreaterThanOrEqual(6);
    expect(ACADEMY_TRACKS.flatMap((track) => track.lessons).length).toBeGreaterThanOrEqual(30);
  });

  it('builds deterministic practice challenges from curriculum lessons', () => {
    const one = buildPracticeChallenge(ACADEMY_TRACKS, 7);
    const two = buildPracticeChallenge(ACADEMY_TRACKS, 7);
    expect(one).toEqual(two);
    expect(one.cases.length).toBeGreaterThanOrEqual(2);
  });

  it('synthesizes ranked candidates without silently replacing the user pattern', () => {
    const candidates = synthesizeRegexCandidates(['123','456','789'], ['12a','1234']);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates[0]?.pattern).toContain('\\d');
    expect(candidates[0]?.passesAllSamples).toBe(true);
  });

  it('generates deterministic edge cases locally', () => {
    const a = generateFuzzCases(['alpha123'], 8);
    const b = generateFuzzCases(['alpha123'], 8);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(a.length);
    expect(a.length).toBeGreaterThanOrEqual(5);
  });
});

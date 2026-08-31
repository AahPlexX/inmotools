import { describe, expect, it } from 'vitest';
import { ACADEMY_TRACKS, validateAcademySolution } from '../../src/tools/regex/regex-academy';

describe('RegexMatrix Academy', () => {
  it('ships four coherent tracks with at least twenty-four deterministic lessons', () => {
    expect(ACADEMY_TRACKS.map((track) => track.id)).toEqual(['fundamentals', 'intermediate', 'advanced', 'production']);
    expect(ACADEMY_TRACKS.flatMap((track) => track.lessons).length).toBeGreaterThanOrEqual(24);
    expect(ACADEMY_TRACKS.every((track) => track.lessons.length >= 5)).toBe(true);
  });

  it('validates lesson positive and negative fixtures with the submitted pattern', () => {
    const lesson = ACADEMY_TRACKS.flatMap((track) => track.lessons).find((item) => item.id === 'negative-lookahead');
    expect(lesson).toBeDefined();
    const result = validateAcademySolution(lesson!, '^(?!admin)[a-z0-9_]{5,12}$', 'i');
    expect(result.complete).toBe(true);
    expect(result.cases.every((item) => item.passed)).toBe(true);
  });
});

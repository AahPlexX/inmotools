import { describe, expect, it } from 'vitest';
import { buildRegexCrossword, validateRegexCrossword } from '../../src/tools/regex/regex-crossword';
import { decodeCustomTrackPackage, encodeCustomTrackPackage, parseCustomTrackPackage, serializeCustomTrackPackage } from '../../src/tools/regex/regex-custom-track';

const customTrack = {
  schemaVersion: 1 as const,
  track: {
    id: 'team-basics',
    title: 'Team Regex Basics',
    lessons: [{
      id: 'digits-only', title: 'Digits only', objective: 'Match only digits.',
      guide: 'Anchor the expression and require one or more digits.', starter: '^\\d+$', flags: '', hint: 'Use anchors.',
      cases: [{ value: '123', shouldMatch: true }, { value: '12a', shouldMatch: false }],
    }],
  },
};

describe('RegexMatrix advanced Academy contracts', () => {
  it('builds deterministic regex crosswords and validates both axes', () => {
    const puzzle = buildRegexCrossword(0);
    expect(puzzle.size).toBe(3);
    expect(puzzle.solution.join('')).toBe('CATARERED');
    const solved = validateRegexCrossword(puzzle, puzzle.solution);
    expect(solved.complete).toBe(true);
    expect(solved.rows.every((item) => item.passed)).toBe(true);
    expect(solved.columns.every((item) => item.passed)).toBe(true);

    const wrong = [...puzzle.solution]; wrong[4] = 'X';
    const checked = validateRegexCrossword(puzzle, wrong);
    expect(checked.complete).toBe(false);
    expect(checked.rows[1]?.passed).toBe(false);
    expect(checked.columns[1]?.passed).toBe(false);
  });

  it('round-trips a bounded custom Academy package through JSON and local hash state', () => {
    const parsed = parseCustomTrackPackage(JSON.stringify(customTrack));
    expect(parsed.track.title).toBe('Team Regex Basics');
    expect(parsed.track.lessons[0]?.cases).toHaveLength(2);
    expect(parseCustomTrackPackage(serializeCustomTrackPackage(parsed))).toEqual(parsed);
    expect(decodeCustomTrackPackage(encodeCustomTrackPackage(parsed))).toEqual(parsed);
  });

  it('rejects malformed or unsafe custom track packages', () => {
    expect(() => parseCustomTrackPackage('{"schemaVersion":2,"track":{}}')).toThrow(/schema|version/i);
    const duplicate = structuredClone(customTrack);
    duplicate.track.lessons.push({ ...duplicate.track.lessons[0] });
    expect(() => parseCustomTrackPackage(JSON.stringify(duplicate))).toThrow(/duplicate/i);
  });
});

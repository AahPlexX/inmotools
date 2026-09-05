import { describe, expect, it } from 'vitest';
import { buildChord, buildMidiBytes, isValidNote, tryBuildChord } from '../../src/tools/music/music-engine';

describe('harmonic progression engine', () => {
  it('builds first inversion major voicing in ascending order', () => {
    expect(buildChord({ root: 'C4', quality: 'major', inversion: 1 })).toEqual([64, 67, 72]);
  });

  it('encodes a standard MIDI header for exported progressions', () => {
    const bytes = buildMidiBytes([{ root: 'C4', quality: 'major', inversion: 0, beats: 4 }], 120);
    expect(Array.from(bytes.slice(0, 4))).toEqual([77, 84, 104, 100]);
    expect(bytes.byteLength).toBeGreaterThan(20);
  });
});


describe('note validation', () => {
  it('accepts a note with an octave', () => {
    expect(isValidNote('C4')).toBe(true);
    expect(isValidNote('F#3')).toBe(true);
    expect(isValidNote('Bb-1')).toBe(true);
  });

  it('rejects a note letter with no octave, the state a field is in mid-edit', () => {
    expect(isValidNote('C')).toBe(false);
  });

  it('rejects an empty or nonsense root', () => {
    expect(isValidNote('')).toBe(false);
    expect(isValidNote('H4')).toBe(false);
    expect(isValidNote('wat')).toBe(false);
  });

  it('tolerates surrounding whitespace', () => {
    expect(isValidNote('  C4 ')).toBe(true);
  });
});

describe('tryBuildChord', () => {
  it('builds a chord for a valid spec', () => {
    expect(tryBuildChord({ root: 'C4', quality: 'major', inversion: 0 })).toEqual([60, 64, 67]);
  });

  it('returns null instead of throwing for an incomplete root', () => {
    expect(() => tryBuildChord({ root: 'C', quality: 'major', inversion: 0 })).not.toThrow();
    expect(tryBuildChord({ root: 'C', quality: 'major', inversion: 0 })).toBeNull();
  });

  it('returns null for an empty root', () => {
    expect(tryBuildChord({ root: '', quality: 'minor', inversion: 0 })).toBeNull();
  });
});

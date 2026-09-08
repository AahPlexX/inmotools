import { describe, expect, it } from 'vitest';
import { buildChord, buildMidiBytes, isValidNote, tryBuildChord, validateProgression, voiceLeadingDistance } from '../../src/tools/music/music-engine';

describe('harmonic progression engine', () => {
  it('builds first inversion major voicing in ascending order', () => {
    expect(buildChord({ root: 'C4', quality: 'major', inversion: 1 })).toEqual([64, 67, 72]);
  });

  it('encodes a standard MIDI header for exported progressions', () => {
    const bytes = buildMidiBytes([{ root: 'C4', quality: 'major', inversion: 0, beats: 4 }], 120);
    expect(Array.from(bytes.slice(0, 4))).toEqual([77, 84, 104, 100]);
    expect(bytes.byteLength).toBeGreaterThan(20);
  });

  it('rejects invalid tempo and chord durations before playback/export math', () => {
    expect(validateProgression([{ root: 'C4', quality: 'major', inversion: 0, beats: 0 }], 120)[0]).toMatch(/duration/);
    expect(validateProgression([{ root: 'C4', quality: 'major', inversion: 0, beats: 4 }], 0)[0]).toMatch(/Tempo/);
  });

  it('reports simple voice-leading movement between neighboring voicings', () => {
    expect(voiceLeadingDistance(
      { root: 'C4', quality: 'major', inversion: 0 },
      { root: 'F4', quality: 'major', inversion: 1 },
    )).toBe(27);
  });
});

describe('note validation', () => {
  it('accepts a note with an octave and surrounding whitespace', () => {
    expect(isValidNote('C4')).toBe(true);
    expect(isValidNote('F#3')).toBe(true);
    expect(isValidNote('Bb-1')).toBe(true);
    expect(buildChord({ root: '  C4 ', quality: 'major', inversion: 0 })).toEqual([60, 64, 67]);
  });

  it('rejects a note letter with no octave, the state a field is in mid-edit', () => {
    expect(isValidNote('C')).toBe(false);
  });

  it('rejects empty, nonsense, and out-of-range MIDI roots/voicings', () => {
    expect(isValidNote('')).toBe(false);
    expect(isValidNote('H4')).toBe(false);
    expect(isValidNote('C-2')).toBe(false);
    expect(tryBuildChord({ root: 'B9', quality: 'major', inversion: 0 })).toBeNull();
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
});

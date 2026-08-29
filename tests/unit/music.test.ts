import { describe, expect, it } from 'vitest';
import { buildChord, buildMidiBytes } from '../../src/tools/music/music-engine';

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

import { describe, expect, it } from 'vitest';
import { MaterialCache, balanceGains, clipAudible, fadeGain, materialKey, mixArrangement } from '../../src/tools/music/mastering-arrangement';
import { applyEdits, type PcmAudio } from '../../src/tools/music/mastering-engine';
import {
  addSourceTracksRevision,
  createMasteringDocument,
  crossfadeClipsRevision,
  duplicateClipRevision,
  moveClipRevision,
  setClipFadeRevision,
  updateClipRevision,
  updateTrackRevision,
  type FadeCurve,
  type MasteringSourceReference,
} from '../../src/tools/music/mastering-project';

const reference = (id: string, frames: number, channelCount = 1): MasteringSourceReference => ({
  id, name: id, sampleRate: 4, channelCount, frameCount: frames, fileSize: 1, lastModified: 0, codec: 'pcm-s16',
});
const pcm = (...channels: number[][]): PcmAudio => ({ sampleRate: 4, channels: channels.map((values) => Float32Array.from(values)) });
const values = (audio: PcmAudio) => audio.channels.map((channel) => Array.from(channel, (value) => Number(value.toFixed(6))));

describe('fade curves', () => {
  it('rises from 0 to 1 for every curve and mirrors for fade-outs', () => {
    const curves: FadeCurve[] = ['linear', 'equalPower', 'exponential', 'logarithmic', 'sCurve'];
    for (const curve of curves) {
      expect(fadeGain(curve, 0)).toBeCloseTo(0, 12);
      expect(fadeGain(curve, 1)).toBeCloseTo(1, 12);
      let previous = -1;
      for (let step = 0; step <= 20; step += 1) {
        const gain = fadeGain(curve, step / 20);
        expect(gain).toBeGreaterThanOrEqual(previous);
        previous = gain;
      }
    }
    expect(fadeGain('linear', 0.25) + fadeGain('linear', 0.75)).toBeCloseTo(1, 12);
    expect(fadeGain('equalPower', 0.3) ** 2 + fadeGain('equalPower', 0.7) ** 2).toBeCloseTo(1, 12);
    expect(fadeGain('exponential', 0.5)).toBeLessThan(0.5);
    expect(fadeGain('logarithmic', 0.5)).toBeGreaterThan(0.5);
    expect(fadeGain('sCurve', 0.5)).toBeCloseTo(0.5, 12);
  });

  it('uses a unity-centre balance law', () => {
    expect(balanceGains(0)).toEqual([1, 1]);
    expect(balanceGains(1)).toEqual([0, 1]);
    expect(balanceGains(-0.5)).toEqual([1, 0.5]);
  });
});

describe('arrangement mix', () => {
  it('renders a single centred clip bit-identically to its material', () => {
    const document = addSourceTracksRevision(createMasteringDocument(), [{ source: reference('a', 4), trackId: 't', clipId: 'c' }]);
    const material = pcm([0.1, -0.2, 0.3, -0.4]);
    expect(mixArrangement(document, new Map([['c', material]])).channels[0]).toEqual(material.channels[0]);
  });

  it('places clips with gaps, applies gain and balance, and upmixes mono into a stereo mix', () => {
    let document = addSourceTracksRevision(createMasteringDocument(), [
      { source: reference('mono', 2), trackId: 't1', clipId: 'm' },
      { source: reference('stereo', 2, 2), trackId: 't2', clipId: 's' },
    ]);
    document = moveClipRevision(document, 's', 1);
    document = updateClipRevision(document, 'm', { gainDb: 20 * Math.log10(0.5), pan: 1 });
    const mixed = mixArrangement(document, new Map([['m', pcm([1, 1])], ['s', pcm([0.25, 0.25], [-0.25, -0.25])]]));
    expect(values(mixed)).toEqual([[0, 0, 0, 0, 0.25, 0.25], [0.5, 0.5, 0, 0, -0.25, -0.25]]);
  });

  it('honours track gain, clip and track mute, and solo', () => {
    let document = addSourceTracksRevision(createMasteringDocument(), [
      { source: reference('a', 2), trackId: 'ta', clipId: 'a' },
      { source: reference('b', 2), trackId: 'tb', clipId: 'b' },
    ]);
    const materials = new Map([['a', pcm([0.5, 0.5])], ['b', pcm([0.25, 0.25])]]);
    expect(values(mixArrangement(document, materials))).toEqual([[0.75, 0.75]]);
    document = updateTrackRevision(document, 'tb', { solo: true, gainDb: 20 * Math.log10(2) });
    expect(clipAudible(document, 'ta', 'a')).toBe(false);
    expect(values(mixArrangement(document, materials))).toEqual([[0.5, 0.5]]);
    document = updateTrackRevision(document, 'tb', { muted: true });
    expect(values(mixArrangement(document, materials))).toEqual([[0, 0]]);
    document = updateTrackRevision(updateTrackRevision(document, 'tb', { muted: false, solo: false }), 'ta', {});
    document = updateClipRevision(document, 'a', { muted: true });
    expect(values(mixArrangement(document, materials))).toEqual([[0.5, 0.5]]);
    document = updateClipRevision(updateClipRevision(document, 'a', { muted: false }), 'b', { solo: true });
    expect(values(mixArrangement(document, materials))).toEqual([[0.5, 0.5]]);
    expect(clipAudible(document, 'ta', 'a')).toBe(false);
  });

  it('applies fades at frame centres and keeps an equal-power crossfade at constant power', () => {
    let document = addSourceTracksRevision(createMasteringDocument(), [{ source: reference('a', 8), trackId: 't', clipId: 'a' }]);
    document = setClipFadeRevision(document, 'a', 'in', { durationSeconds: 0.5, curve: 'linear' });
    const ones = pcm(Array(8).fill(1));
    expect(values(mixArrangement(document, new Map([['a', ones]]))).flat().slice(0, 3)).toEqual([0.25, 0.75, 1]);

    document = setClipFadeRevision(document, 'a', 'in', { durationSeconds: 0, curve: 'linear' });
    document = duplicateClipRevision(document, 'a', 'b');
    document = crossfadeClipsRevision(document, 'a', 'b', 1, 'equalPower');
    const left = mixArrangement({ ...document, tracks: [{ ...document.tracks[0], clips: [document.tracks[0].clips[0]] }] }, new Map([['a', ones]]));
    const right = mixArrangement({ ...document, tracks: [{ ...document.tracks[0], clips: [document.tracks[0].clips[1]] }] }, new Map([['b', ones]]));
    for (let frame = 4; frame < 8; frame += 1) {
      expect(left.channels[0][frame] ** 2 + right.channels[0][frame] ** 2).toBeCloseTo(1, 6);
    }
    expect(mixArrangement(document, new Map([['a', ones], ['b', ones]])).channels[0]).toHaveLength(12);
  });

  it('rejects materials at a different rate than the project', () => {
    const document = addSourceTracksRevision(createMasteringDocument(), [{ source: reference('a', 2), trackId: 't', clipId: 'a' }]);
    expect(() => mixArrangement(document, new Map([['a', { sampleRate: 8, channels: [new Float32Array(2)] }]]))).toThrow(/project runs at 4 Hz/);
    expect(() => mixArrangement(createMasteringDocument(), new Map())).toThrow(/no audio/);
  });
});

describe('material cache', () => {
  it('replays only the edits after the longest cached prefix and evicts the least recently used entry', () => {
    const cache = new MaterialCache(2);
    const source = pcm([0.5, -0.5, 0.25, 1]);
    const first = cache.material('s', source, [{ type: 'gain', gainDb: 6 }]);
    const appended = cache.material('s', source, [{ type: 'gain', gainDb: 6 }, { type: 'invertPolarity' }]);
    expect(Array.from(appended.channels[0])).toEqual(Array.from(applyEdits(source, [{ type: 'gain', gainDb: 6 }, { type: 'invertPolarity' }]).channels[0]));
    expect(cache.material('s', source, [{ type: 'gain', gainDb: 6 }])).toBe(first);
    cache.material('s', source, [{ type: 'removeDc' }]);
    expect(cache.size).toBe(2);
    expect(cache.material('s', source, [{ type: 'gain', gainDb: 6 }])).toBe(first);
    cache.forgetSource('s');
    expect(cache.size).toBe(0);
    expect(materialKey('a', [])).not.toBe(materialKey('b', []));
  });
});

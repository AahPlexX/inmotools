import { describe, expect, it } from 'vitest';
import { MasteringDspEngine } from '../../src/tools/music/mastering-dsp-engine';
import { addSourceTracksRevision, createMasteringDocument, deleteRangeRevision, moveClipRevision } from '../../src/tools/music/mastering-project';

const reference = (id: string, frameCount: number, sampleRate = 8) => ({
  id, name: `${id}.wav`, sampleRate, channelCount: 1, frameCount, fileSize: 1, lastModified: 0, codec: 'pcm-s16',
});

describe('DSP engine', () => {
  it('renders the arrangement with per-clip info and keeps materials in step with document edits', () => {
    const engine = new MasteringDspEngine();
    const loaded = engine.loadSource('a', { sampleRate: 8, channels: [Float32Array.from([0.5, 0.25, -0.25, -0.5, 0.5, 0.25, -0.25, -0.5])] }, 8);
    expect(loaded).toEqual({ frameCount: 8, channelCount: 1 });
    let document = addSourceTracksRevision(createMasteringDocument(), [{ source: reference('a', 8), trackId: 't', clipId: 'c' }]);
    let rendered = engine.render(document);
    expect(Array.from(rendered.mix.channels[0])).toEqual([0.5, 0.25, -0.25, -0.5, 0.5, 0.25, -0.25, -0.5]);
    expect(rendered.clips.c).toMatchObject({ frameCount: 8, channelCount: 1, dcOffsets: [0] });
    expect(rendered.pyramid.frameCount).toBe(8);

    document = moveClipRevision(deleteRangeRevision(document, 0, 0.5), 'c', 0.25);
    rendered = engine.render(document);
    expect(Array.from(rendered.mix.channels[0])).toEqual([0, 0, 0.5, 0.25, -0.25, -0.5]);
  });

  it('converts sources to the project rate on load and reports missing sources by clip name', () => {
    const engine = new MasteringDspEngine();
    const loaded = engine.loadSource('b', { sampleRate: 16, channels: [new Float32Array(32)] }, 8);
    expect(loaded.frameCount).toBe(16);
    const document = addSourceTracksRevision(createMasteringDocument(), [{ source: reference('missing', 8), trackId: 't', clipId: 'c' }]);
    expect(() => engine.render(document)).toThrow(/missing\.wav is not loaded/);
    expect(() => engine.loadSource('empty', { sampleRate: 8, channels: [new Float32Array(0)] }, 8)).toThrow(/no audio frames/);
    engine.releaseSource('b');
    expect(engine.hasSource('b')).toBe(false);
  });

  it('snaps timeline times to zero crossings inside the clip', () => {
    const engine = new MasteringDspEngine();
    engine.loadSource('a', { sampleRate: 8, channels: [Float32Array.from([0.4, 0.3, 0.2, 0.1, -0.1, -0.2, -0.3, -0.4])] }, 8);
    const document = moveClipRevision(addSourceTracksRevision(createMasteringDocument(), [{ source: reference('a', 8), trackId: 't', clipId: 'c' }]), 'c', 1);
    expect(engine.snapToZeroCrossings(document, 'c', [1 + 2 / 8, 0.5, 5])).toEqual([1 + 4 / 8, 0.5, 5]);
    expect(engine.clipSlice(document, 'c', 6, 4)).toEqual({ startFrame: 4, channels: [Float32Array.from([-0.1, -0.2, -0.3, -0.4])] });
    expect(() => engine.clipSlice(document, 'missing', 0, 1)).toThrow(/not loaded/);
  });
});

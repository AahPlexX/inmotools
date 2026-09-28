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

describe('DSP engine analysis', () => {
  it('renders the master from the last mix with a loudness report and analyses its spectrum', async () => {
    const { defaultMasterSettings } = await import('../../src/tools/music/dsp/master-chain');
    const engine = new MasteringDspEngine();
    expect(() => engine.measureMix()).toThrow(/Render the timeline/);
    const rate = 48_000;
    const tone = Float32Array.from({ length: rate * 4 }, (_, n) => 0.1 * Math.sin(2 * Math.PI * 1000 * n / rate));
    engine.loadSource('a', { sampleRate: rate, channels: [tone] }, rate);
    const document = addSourceTracksRevision(createMasteringDocument(), [{ source: { ...reference('a', rate * 4), sampleRate: rate }, trackId: 't', clipId: 'c' }]);
    engine.render(document);
    const settings = defaultMasterSettings();
    settings.outputGainDb = 6;
    const master = engine.renderMaster(settings, 0.5, 4);
    expect(master.channels).toHaveLength(1);
    expect(master.channels[0]).toHaveLength(rate * 3.5);
    expect(master.loudness.integrated - engine.measureMix().integrated).toBeCloseTo(6, 1);
    expect(master.shortTermSeries.length).toBeGreaterThan(0);
    const { resonances } = engine.analyzeSpectrum(0, 4);
    expect(Math.abs(resonances[0].frequency - 1000)).toBeLessThan(10);
  });
});

describe('DSP engine export render', () => {
  const twoTracks = () => {
    const engine = new MasteringDspEngine();
    engine.loadSource('a', { sampleRate: 8, channels: [Float32Array.from([1, 1, 1, 1])] }, 8);
    engine.loadSource('b', { sampleRate: 8, channels: [Float32Array.from([0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5]), Float32Array.from([-0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5, -0.5])] }, 8);
    let document = addSourceTracksRevision(createMasteringDocument(), [
      { source: reference('a', 4), trackId: 't1', clipId: 'ca' },
      { source: { ...reference('b', 8), channelCount: 2 }, trackId: 't2', clipId: 'cb' },
    ]);
    // Track 1 is muted and hard left; track 2 is soloed. Neither setting may leak into stems.
    document = {
      ...document,
      tracks: [
        { ...document.tracks[0], muted: true, pan: -1 },
        { ...document.tracks[1], solo: true },
      ],
    };
    engine.render(document);
    return { engine, document };
  };

  it('copies the unprocessed mix over a range exactly', () => {
    const { engine, document } = twoTracks();
    const result = engine.renderExport(document, { master: null, startSeconds: 0.25, endSeconds: 0.75 });
    expect(result.sampleRate).toBe(8);
    expect(result.channels.map((channel) => Array.from(channel))).toEqual([[0.5, 0.5, 0.5, 0.5], [-0.5, -0.5, -0.5, -0.5]]);
  });

  it('renders a stem alone at full project length, ignoring mute and solo but keeping pan', () => {
    const { engine, document } = twoTracks();
    const stem = engine.renderExport(document, { master: null, trackId: 't1' });
    expect(stem.channels.map((channel) => Array.from(channel))).toEqual([[1, 1, 1, 1, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0, 0, 0]]);
    expect(() => engine.renderExport(document, { master: null, trackId: 'gone' })).toThrow(/no longer in the project/);
  });

  it('converts to the requested rate and measures what will be written', () => {
    const engine = new MasteringDspEngine();
    const rate = 48_000;
    const tone = Float32Array.from({ length: rate * 2 }, (_, n) => 0.25 * Math.sin(2 * Math.PI * 997 * n / rate));
    engine.loadSource('a', { sampleRate: rate, channels: [tone] }, rate);
    const document = addSourceTracksRevision(createMasteringDocument(), [{ source: { ...reference('a', rate * 2), sampleRate: rate }, trackId: 't', clipId: 'c' }]);
    engine.render(document);
    const same = engine.renderExport(document, { master: null });
    const converted = engine.renderExport(document, { master: null, targetRate: 44_100 });
    expect(converted.sampleRate).toBe(44_100);
    expect(converted.channels[0]).toHaveLength(88_200);
    expect(converted.loudness.integrated).toBeCloseTo(same.loudness.integrated, 1);
    expect(() => engine.renderExport(document, { master: null, targetRate: 1000 })).toThrow(RangeError);
  });
});

import { describe, expect, it } from 'vitest';
import { magnitudeSpectrum } from '../../src/tools/music/dsp/fft';
import { fillRoomTone, measureLevel, normalizeLevel, patchSamples, quantizePcm, seededRandom } from '../../src/tools/music/dsp/processors';
import { pitchShift, stretchedLength, timeStretch } from '../../src/tools/music/dsp/stretch';
import { applyEdits, estimateEditedFrameCount, type PcmAudio } from '../../src/tools/music/mastering-engine';
import { addSourceTracksRevision, appendAudioEditRevision, createMasteringDocument, estimateDocumentDuration, duplicateClipRevision, stretchClipRevision } from '../../src/tools/music/mastering-project';

const RATE = 48_000;
const sine = (frequency: number, seconds: number, amplitude = 0.5) => Float32Array.from({ length: Math.round(seconds * RATE) }, (_, n) => amplitude * Math.sin(2 * Math.PI * frequency * n / RATE));
const mono = (channel: Float32Array): PcmAudio => ({ sampleRate: RATE, channels: [channel] });

/** Dominant frequency by parabolic interpolation of the FFT peak in the middle of the signal. */
function dominantFrequency(samples: Float32Array) {
  const size = 16_384;
  const magnitudes = magnitudeSpectrum(samples, Math.floor(samples.length / 2 - size / 2), size);
  let best = 1;
  for (let bin = 1; bin < magnitudes.length - 1; bin += 1) if (magnitudes[bin] > magnitudes[best]) best = bin;
  const [a, b, c] = [magnitudes[best - 1], magnitudes[best], magnitudes[best + 1]];
  return (best + 0.5 * (a - c) / (a - 2 * b + c)) * RATE / size;
}
const rms = (samples: Float32Array, from = 0, to = samples.length) => {
  let sum = 0;
  for (let n = from; n < to; n += 1) sum += samples[n] * samples[n];
  return Math.sqrt(sum / (to - from));
};

describe('time stretch and pitch shift', () => {
  it('changes length by the ratio while keeping pitch and level', () => {
    for (const ratio of [0.5, 1.5]) {
      const input = sine(440, 1.5);
      const output = timeStretch(mono(input), ratio).channels[0];
      expect(output.length).toBe(stretchedLength(input.length, ratio));
      expect(Math.abs(dominantFrequency(output) - 440)).toBeLessThan(1.5);
      const middle = Math.floor(output.length / 2);
      expect(Math.abs(20 * Math.log10(rms(output, middle - 4000, middle + 4000) / rms(input)))).toBeLessThan(1);
    }
    expect(() => timeStretch(mono(sine(440, 0.1)), 5)).toThrow(RangeError);
  });

  it('keeps a stereo image when stretching and preserves exact length when pitch shifting', () => {
    const left = sine(330, 1);
    const stretched = timeStretch({ sampleRate: RATE, channels: [left, left.slice()] }, 1.25);
    let difference = 0;
    for (let n = 0; n < stretched.channels[0].length; n += 1) difference = Math.max(difference, Math.abs(stretched.channels[0][n] - stretched.channels[1][n]));
    expect(difference).toBeLessThan(1e-6);

    const input = sine(440, 1.5);
    const up = pitchShift(mono(input), 7, 0).channels[0];
    expect(up.length).toBe(input.length);
    expect(Math.abs(dominantFrequency(up) - 440 * 2 ** (7 / 12))).toBeLessThan(2);
    const down = pitchShift(mono(input), -12, 0, true).channels[0];
    expect(Math.abs(dominantFrequency(down) - 220)).toBeLessThan(1.5);
    expect(() => pitchShift(mono(input), 30)).toThrow(RangeError);
  });

  it('keeps the spectral envelope in place when formant preservation is on', () => {
    // A 150 Hz harmonic series with a strong resonance near 1.2 kHz.
    const length = Math.round(1.5 * RATE);
    const voice = new Float32Array(length);
    for (let harmonic = 1; harmonic * 150 < 6000; harmonic += 1) {
      const frequency = harmonic * 150;
      const gain = 1 / (1 + ((frequency - 1200) / 300) ** 2);
      for (let n = 0; n < length; n += 1) voice[n] += 0.05 * gain * Math.sin(2 * Math.PI * frequency * n / RATE);
    }
    const centroid = (samples: Float32Array) => {
      const magnitudes = magnitudeSpectrum(samples, Math.floor(samples.length / 2 - 4096), 8192);
      let weighted = 0, total = 0;
      magnitudes.forEach((value, bin) => { weighted += value * bin; total += value; });
      return weighted / total * RATE / 8192;
    };
    const plain = centroid(pitchShift(mono(voice), 5, 0, false).channels[0]);
    const preserved = centroid(pitchShift(mono(voice), 5, 0, true).channels[0]);
    const original = centroid(voice);
    expect(Math.abs(preserved - original)).toBeLessThan(Math.abs(plain - original) / 2);
  });
});

describe('level, bit depth, sample pen, and room tone', () => {
  it('normalizes integrated loudness and RMS to the target', () => {
    const audio = mono(sine(1000, 5, 0.1));
    expect(measureLevel(normalizeLevel(audio, 'lufs', -16), 'lufs')).toBeCloseTo(-16, 1);
    expect(measureLevel(normalizeLevel(audio, 'rms', -20), 'rms')).toBeCloseTo(-20, 3);
    expect(normalizeLevel(mono(new Float32Array(10)), 'rms', -20).channels[0]).toEqual(new Float32Array(10));
  });

  it('quantizes onto the integer grid with deterministic TPDF dither', () => {
    const audio = mono(Float32Array.from({ length: 2000 }, (_, n) => Math.sin(n / 30) * 0.3));
    const plain = quantizePcm(audio, 8, 'none').channels[0];
    for (const value of plain) expect(Number.isInteger(value * 128)).toBe(true);
    const dithered = quantizePcm(audio, 8, 'tpdf', 7).channels[0];
    expect(Array.from(quantizePcm(audio, 8, 'tpdf', 7).channels[0])).toEqual(Array.from(dithered));
    expect(Array.from(dithered)).not.toEqual(Array.from(plain));
    let maxError = 0;
    dithered.forEach((value, n) => { maxError = Math.max(maxError, Math.abs(value - audio.channels[0][n])); });
    expect(maxError).toBeLessThanOrEqual(1.5 / 128 + 1e-9);
    expect(quantizePcm(mono(Float32Array.from([1.5, -2])), 16, 'none').channels[0][0]).toBe(32767 / 32768);
    expect(() => quantizePcm(audio, 12, 'none')).toThrow(RangeError);
    const random = seededRandom(3);
    expect(random()).toBe(seededRandom(3)());
  });

  it('patches samples in place on one channel only', () => {
    const audio = { sampleRate: RATE, channels: [Float32Array.from([0, 0, 0, 0]), Float32Array.from([1, 1, 1, 1])] };
    const patched = patchSamples(audio, 1, [[0.5, Number.NaN, 0.25, 9]]);
    expect(Array.from(patched.channels[0])).toEqual([0, 0.5, 0, 0.25]);
    expect(Array.from(patched.channels[1])).toEqual([1, 1, 1, 1]);
  });

  it('fills a range with captured room tone at a matching level', () => {
    const random = seededRandom(11);
    const noise = Float32Array.from({ length: RATE * 3 }, () => (random() - 0.5) * 0.02);
    for (let n = RATE; n < RATE * 2; n += 1) noise[n] = 0.8 * Math.sin(n / 5);
    const filled = fillRoomTone(mono(noise), 0, 0.9, 1, 2, 5).channels[0];
    const captured = rms(noise, 0, Math.round(0.9 * RATE));
    const fill = rms(filled, RATE + 1000, 2 * RATE - 1000);
    expect(Math.abs(20 * Math.log10(fill / captured))).toBeLessThan(1);
    expect(Array.from(filled.subarray(0, RATE))).toEqual(Array.from(noise.subarray(0, RATE)));
    expect(() => fillRoomTone(mono(noise), 0, 0.001, 1, 2)).toThrow(/20 ms/);
  });
});

describe('processor edits in the document', () => {
  it('predicts stretched length and scales annotations inside the clip', () => {
    const edits = [{ type: 'timeStretch' as const, ratio: 1.5 }, { type: 'crop' as const, startSeconds: 0.1, endSeconds: 0.4 }];
    const source = mono(sine(200, 0.5));
    expect(estimateEditedFrameCount(source.channels[0].length, RATE, edits)).toBe(applyEdits(source, edits).channels[0].length);

    const reference = { id: 's', name: 's', sampleRate: RATE, channelCount: 1, frameCount: RATE * 2, fileSize: 1, lastModified: 0, codec: 'pcm' };
    let document = addSourceTracksRevision(createMasteringDocument(), [{ source: reference, trackId: 't', clipId: 'c' }]);
    document = duplicateClipRevision(document, 'c', 'd');
    document = { ...document, activeClipId: 'c', markers: [{ id: 'in', label: 'In', seconds: 1 }, { id: 'late', label: 'Late', seconds: 3 }], playhead: 1 };
    const stretched = stretchClipRevision(document, 0.5);
    expect(stretched.tracks[0].clips[1].startSeconds).toBe(1);
    expect(stretched.markers.map((marker) => marker.seconds)).toEqual([0.5, 2]);
    expect(stretched.playhead).toBe(0.5);
    expect(estimateDocumentDuration(stretched)).toBe(3);
    expect(appendAudioEditRevision(document, { type: 'timeStretch', ratio: 0.5 })).toEqual(stretched);

    const roomTone = appendAudioEditRevision({ ...document, activeClipId: 'd' }, { type: 'roomTone', captureStartSeconds: 2.1, captureEndSeconds: 2.5, startSeconds: 3, endSeconds: 3.5, seed: 1 });
    expect(roomTone.tracks[0].clips[1].edits[0]).toEqual({ type: 'roomTone', captureStartSeconds: 0.1, captureEndSeconds: 0.5, startSeconds: 1, endSeconds: 1.5, seed: 1 });
  });
});

describe('time and repair helpers', () => {
  it('resolves one stretch ratio from percent, duration, or tempo', async () => {
    const { stretchRatio } = await import('../../src/tools/music/MasteringTimePitchTab');
    const base = { percent: 150, targetSeconds: 3, currentSeconds: 2, fromBpm: 120, toBpm: 90 };
    expect(stretchRatio('percent', base)).toBe(1.5);
    expect(stretchRatio('duration', base)).toBe(1.5);
    expect(stretchRatio('tempo', base)).toBeCloseTo(4 / 3, 12);
    expect(stretchRatio('tempo', { ...base, toBpm: 0 })).toBeNull();
    expect(stretchRatio('duration', { ...base, currentSeconds: 0 })).toBeNull();
  });

  it('rebuilds a gap with a smooth cubic through the neighbouring samples', async () => {
    const { interpolateGap } = await import('../../src/tools/music/MasteringSamplePen');
    expect(interpolateGap([0, 1], [2, 3], 1)[0]).toBeCloseTo(1.5, 12);
    const line = interpolateGap([0, 0.1], [0.4, 0.5], 2);
    expect(line[0]).toBeCloseTo(0.2, 12);
    expect(line[1]).toBeCloseTo(0.3, 12);
  });
});

import { fillRoomTone, normalizeLevel, patchSamples, quantizePcm, type DitherMode, type LevelMeasure } from './dsp/processors';
import { pitchShift, stretchedLength, timeStretch } from './dsp/stretch';
import { declick, declip, decrackle, deess, dehum, deplosive, hissGate, repairBurst, type HissBand } from './dsp/restoration';
import { denoise, spectralAttenuate, spectralHeal, type SpectralRegion } from './dsp/spectral';

export interface PcmAudio {
  sampleRate: number;
  channels: Float32Array[];
}

export interface TimeSelection {
  startSeconds: number;
  endSeconds: number;
}

export interface MasteringMarker {
  id: string;
  label: string;
  seconds: number;
}

export interface MasteringRegion {
  id: string;
  label: string;
  startSeconds: number;
  endSeconds: number;
}

export interface PeakBucket { min: number; max: number }

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;

export function clampSelection(selection: TimeSelection, durationSeconds: number): TimeSelection {
  const duration = Math.max(0, finite(durationSeconds));
  const first = Math.min(duration, Math.max(0, finite(selection.startSeconds)));
  const second = Math.min(duration, Math.max(0, finite(selection.endSeconds)));
  return { startSeconds: Math.min(first, second), endSeconds: Math.max(first, second) };
}
export function buildPeakEnvelope(audio: PcmAudio, bucketCount: number): PeakBucket[] {
  if (!audio.channels.length) return [];
  const sampleCount = audio.channels[0].length;
  if (sampleCount === 0) return [];
  if (audio.channels.some((channel) => channel.length !== sampleCount)) throw new Error('Audio channels must have equal sample counts.');
  const buckets = Math.max(1, Math.min(sampleCount, Math.trunc(finite(bucketCount, 1))));
  const result: PeakBucket[] = [];
  for (let bucket = 0; bucket < buckets; bucket += 1) {
    const start = Math.floor(bucket * sampleCount / buckets);
    const end = Math.max(start + 1, Math.floor((bucket + 1) * sampleCount / buckets));
    let min = Infinity;
    let max = -Infinity;
    for (const channel of audio.channels) {
      for (let index = start; index < end; index += 1) {
        const sample = channel[index] ?? 0;
        if (sample < min) min = sample;
        if (sample > max) max = sample;
      }
    }
    result.push({ min, max });
  }
  return result;
}

export function findZeroCrossing(samples: Float32Array, targetIndex: number, radius = 2048): number {
  if (!samples.length) return 0;
  const target = Math.max(0, Math.min(samples.length - 1, Math.trunc(finite(targetIndex))));
  const reach = Math.max(0, Math.trunc(finite(radius)));
  const crossesAt = (index: number) => index > 0 && ((samples[index - 1] <= 0 && samples[index] >= 0) || (samples[index - 1] >= 0 && samples[index] <= 0));
  if (crossesAt(target)) return target;
  for (let distance = 1; distance <= reach; distance += 1) {
    const right = target + distance;
    const left = target - distance;
    if (right < samples.length && crossesAt(right)) return right;
    if (left >= 0 && crossesAt(left)) return left;
  }
  return target;
}
function validatePcm(audio: PcmAudio): number {
  if (!Number.isFinite(audio.sampleRate) || audio.sampleRate <= 0) throw new Error('Sample rate must be a positive finite number.');
  if (!audio.channels.length) throw new Error('Audio must contain at least one channel.');
  const sampleCount = audio.channels[0].length;
  if (audio.channels.some((channel) => channel.length !== sampleCount)) throw new Error('Audio channels must have equal sample counts.');
  return sampleCount;
}

export function applyGain(audio: PcmAudio, gainDb: number): PcmAudio {
  validatePcm(audio);
  const gain = 10 ** (finite(gainDb) / 20);
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((channel) => Float32Array.from(channel, (sample) => sample * gain)),
  };
}

export function measureDcOffset(audio: PcmAudio): number[] {
  validatePcm(audio);
  return audio.channels.map((channel) => {
    if (!channel.length) return 0;
    let sum = 0;
    for (const sample of channel) sum += sample;
    return sum / channel.length;
  });
}

export function removeDcOffset(audio: PcmAudio): PcmAudio {
  validatePcm(audio);
  const offsets = measureDcOffset(audio);
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((channel, index) => Float32Array.from(channel, (sample) => sample - offsets[index])),
  };
}

export function invertPolarity(audio: PcmAudio): PcmAudio {
  validatePcm(audio);
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((channel) => Float32Array.from(channel, (sample) => -sample)),
  };
}

export function reverseRange(audio: PcmAudio, startSeconds: number, endSeconds: number): PcmAudio {
  const sampleCount = validatePcm(audio);
  const duration = sampleCount / audio.sampleRate;
  const selection = clampSelection({ startSeconds, endSeconds }, duration);
  const start = Math.max(0, Math.min(sampleCount, Math.round(selection.startSeconds * audio.sampleRate)));
  const end = Math.max(start, Math.min(sampleCount, Math.round(selection.endSeconds * audio.sampleRate)));
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((channel) => {
      const next = channel.slice();
      for (let left = start, right = end - 1; left < right; left += 1, right -= 1) {
        const temp = next[left]; next[left] = next[right]; next[right] = temp;
      }
      return next;
    }),
  };
}

export function insertSilence(audio: PcmAudio, atSeconds: number, durationSeconds: number): PcmAudio {
  const sampleCount = validatePcm(audio);
  const at = Math.max(0, Math.min(sampleCount, Math.round(finite(atSeconds) * audio.sampleRate)));
  const silenceSamples = Math.max(0, Math.round(finite(durationSeconds) * audio.sampleRate));
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((channel) => {
      const next = new Float32Array(channel.length + silenceSamples);
      next.set(channel.subarray(0, at), 0);
      next.set(channel.subarray(at), at + silenceSamples);
      return next;
    }),
  };
}

export function swapStereoChannels(audio: PcmAudio): PcmAudio {
  validatePcm(audio);
  if (audio.channels.length !== 2) throw new Error('Swapping stereo channels requires exactly two channels.');
  return { sampleRate: audio.sampleRate, channels: [audio.channels[1].slice(), audio.channels[0].slice()] };
}

export function foldDownMono(audio: PcmAudio): PcmAudio {
  const sampleCount = validatePcm(audio);
  const mono = new Float32Array(sampleCount);
  for (let index = 0; index < sampleCount; index += 1) {
    let sum = 0;
    for (const channel of audio.channels) sum += channel[index];
    mono[index] = sum / audio.channels.length;
  }
  return { sampleRate: audio.sampleRate, channels: [mono] };
}

export function extractChannel(audio: PcmAudio, channelIndex: number): PcmAudio {
  validatePcm(audio);
  const index = Math.trunc(finite(channelIndex, 0));
  if (index < 0 || index >= audio.channels.length) throw new Error('Channel index is out of range.');
  return { sampleRate: audio.sampleRate, channels: [audio.channels[index].slice()] };
}

export function dualMonoFromChannel(audio: PcmAudio, channelIndex: number): PcmAudio {
  const source = extractChannel(audio, channelIndex).channels[0];
  return { sampleRate: audio.sampleRate, channels: [source, source.slice()] };
}

export function normalizePeak(audio: PcmAudio, targetDbfs = -1): PcmAudio {
  validatePcm(audio);
  let peak = 0;
  for (const channel of audio.channels) for (const sample of channel) peak = Math.max(peak, Math.abs(sample));
  if (peak === 0) return { sampleRate: audio.sampleRate, channels: audio.channels.map((channel) => channel.slice()) };
  const target = 10 ** (finite(targetDbfs, -1) / 20);
  return applyGain(audio, 20 * Math.log10(target / peak));
}

export function slicePcm(audio: PcmAudio, startSeconds: number, endSeconds: number): PcmAudio {
  const sampleCount = validatePcm(audio);
  const duration = sampleCount / audio.sampleRate;
  const selection = clampSelection({ startSeconds, endSeconds }, duration);
  const start = Math.max(0, Math.min(sampleCount, Math.round(selection.startSeconds * audio.sampleRate)));
  const end = Math.max(start, Math.min(sampleCount, Math.round(selection.endSeconds * audio.sampleRate)));
  return { sampleRate: audio.sampleRate, channels: audio.channels.map((channel) => channel.slice(start, end)) };
}

export function resolveSampleBoundary(
  audio: PcmAudio,
  seconds: number,
  snapToZeroCrossing = false,
  radius = 2048,
): number {
  const sampleCount = validatePcm(audio);
  const requested = Math.max(0, Math.min(sampleCount, Math.round(finite(seconds) * audio.sampleRate)));
  if (!snapToZeroCrossing || requested === 0 || requested === sampleCount) return requested;
  return findZeroCrossing(audio.channels[0], requested, radius);
}

export function splitPcmAt(
  audio: PcmAudio,
  seconds: number,
  snapToZeroCrossing = false,
  radius = 2048,
): [PcmAudio, PcmAudio] {
  const boundary = resolveSampleBoundary(audio, seconds, snapToZeroCrossing, radius);
  const splitSeconds = boundary / audio.sampleRate;
  return [slicePcm(audio, 0, splitSeconds), slicePcm(audio, splitSeconds, pcmDuration(audio))];
}

export function trimPcmStart(audio: PcmAudio, seconds: number, snapToZeroCrossing = false, radius = 2048): PcmAudio {
  const boundary = resolveSampleBoundary(audio, seconds, snapToZeroCrossing, radius);
  return slicePcm(audio, boundary / audio.sampleRate, pcmDuration(audio));
}

export function trimPcmEnd(audio: PcmAudio, seconds: number, snapToZeroCrossing = false, radius = 2048): PcmAudio {
  const boundary = resolveSampleBoundary(audio, seconds, snapToZeroCrossing, radius);
  return slicePcm(audio, 0, boundary / audio.sampleRate);
}

export function deletePcmRange(
  audio: PcmAudio,
  startSeconds: number,
  endSeconds: number,
  snapToZeroCrossing = false,
  radius = 2048,
): PcmAudio {
  const sampleCount = validatePcm(audio);
  const selected = clampSelection({ startSeconds, endSeconds }, sampleCount / audio.sampleRate);
  const first = resolveSampleBoundary(audio, selected.startSeconds, snapToZeroCrossing, radius);
  const second = resolveSampleBoundary(audio, selected.endSeconds, snapToZeroCrossing, radius);
  const start = Math.min(first, second);
  const end = Math.max(first, second);
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((channel) => {
      const next = new Float32Array(start + sampleCount - end);
      next.set(channel.subarray(0, start), 0);
      next.set(channel.subarray(end), start);
      return next;
    }),
  };
}

export type AudioEdit =
  | { type: 'crop'; startSeconds: number; endSeconds: number }
  | { type: 'deleteRange'; startSeconds: number; endSeconds: number }
  | { type: 'gain'; gainDb: number }
  | { type: 'normalizePeak'; targetDbfs: number }
  | { type: 'removeDc' }
  | { type: 'invertPolarity' }
  | { type: 'reverse'; startSeconds: number; endSeconds: number }
  | { type: 'insertSilence'; atSeconds: number; durationSeconds: number }
  | { type: 'swapStereo' }
  | { type: 'foldDownMono' }
  | { type: 'extractChannel'; channelIndex: number }
  | { type: 'dualMono'; channelIndex: number }
  | { type: 'normalizeLevel'; measure: LevelMeasure; target: number }
  | { type: 'quantize'; bits: number; dither: DitherMode; seed: number }
  | { type: 'samplePatch'; startFrame: number; values: number[][] }
  | { type: 'roomTone'; captureStartSeconds: number; captureEndSeconds: number; startSeconds: number; endSeconds: number; seed: number }
  | { type: 'timeStretch'; ratio: number }
  | { type: 'pitchShift'; semitones: number; cents: number; preserveFormants: boolean }
  | { type: 'denoise'; noiseStartSeconds: number; noiseEndSeconds: number; reductionDb: number; smoothing: number; range?: TimeSelection }
  | { type: 'dehum'; fundamental: 50 | 60; harmonics: number; range?: TimeSelection }
  | { type: 'declick'; sensitivity: number; maxClickMs: number; range?: TimeSelection }
  | { type: 'decrackle'; amount: number; range?: TimeSelection }
  | { type: 'deplosive'; cutoffHz: number; sensitivityDb: number; reductionDb: number; range?: TimeSelection }
  | { type: 'deess'; frequencyHz: number; thresholdDb: number; rangeDb: number; range?: TimeSelection }
  | { type: 'hissGate'; lowCrossover: number; highCrossover: number; bands: HissBand[]; rangeDb: number; range?: TimeSelection }
  | { type: 'declip'; levelPercent: number; range?: TimeSelection }
  | { type: 'repairBurst'; startSeconds: number; endSeconds: number }
  | { type: 'spectralAttenuate'; regions: SpectralRegion[]; reductionDb: number }
  | { type: 'spectralHeal'; region: SpectralRegion };

/**
 * Runs a whole-clip processor but keeps its result only inside `range`,
 * blending in and out over 5 ms with equal-power curves. Without a range the
 * processed audio is returned as is. Processing the whole clip keeps filter
 * and envelope state realistic at the range edges.
 */
export function processInRange(audio: PcmAudio, range: TimeSelection | undefined, process: (input: PcmAudio) => PcmAudio): PcmAudio {
  const processed = process(audio);
  if (!range) return processed;
  const length = audio.channels[0]?.length ?? 0;
  const start = Math.max(0, Math.min(length, Math.round(Math.min(range.startSeconds, range.endSeconds) * audio.sampleRate)));
  const end = Math.max(start, Math.min(length, Math.round(Math.max(range.startSeconds, range.endSeconds) * audio.sampleRate)));
  const fade = Math.min(Math.round(0.005 * audio.sampleRate), Math.floor((end - start) / 2));
  return {
    sampleRate: audio.sampleRate,
    channels: audio.channels.map((channel, index) => {
      const output = channel.slice();
      const wetChannel = processed.channels[index] ?? channel;
      for (let n = start; n < end; n += 1) {
        const edge = Math.min(n - start, end - 1 - n);
        const wet = fade > 0 && edge < fade ? Math.sin(Math.PI / 2 * (edge + 0.5) / fade) : 1;
        output[n] = channel[n] * Math.sqrt(1 - wet * wet) + wetChannel[n] * wet;
      }
      return output;
    }),
  };
}

export function applyEdits(source: PcmAudio, edits: readonly AudioEdit[]): PcmAudio {
  let current: PcmAudio = { sampleRate: source.sampleRate, channels: source.channels.map((channel) => channel.slice()) };
  for (const edit of edits) {
    switch (edit.type) {
      case 'crop': current = slicePcm(current, edit.startSeconds, edit.endSeconds); break;
      case 'deleteRange': current = deletePcmRange(current, edit.startSeconds, edit.endSeconds); break;
      case 'gain': current = applyGain(current, edit.gainDb); break;
      case 'normalizePeak': current = normalizePeak(current, edit.targetDbfs); break;
      case 'removeDc': current = removeDcOffset(current); break;
      case 'invertPolarity': current = invertPolarity(current); break;
      case 'reverse': current = reverseRange(current, edit.startSeconds, edit.endSeconds); break;
      case 'insertSilence': current = insertSilence(current, edit.atSeconds, edit.durationSeconds); break;
      case 'swapStereo': current = swapStereoChannels(current); break;
      case 'foldDownMono': current = foldDownMono(current); break;
      case 'extractChannel': current = extractChannel(current, edit.channelIndex); break;
      case 'dualMono': current = dualMonoFromChannel(current, edit.channelIndex); break;
      case 'normalizeLevel': current = normalizeLevel(current, edit.measure, edit.target); break;
      case 'quantize': current = quantizePcm(current, edit.bits, edit.dither, edit.seed); break;
      case 'samplePatch': current = patchSamples(current, edit.startFrame, edit.values); break;
      case 'roomTone': current = fillRoomTone(current, edit.captureStartSeconds, edit.captureEndSeconds, edit.startSeconds, edit.endSeconds, edit.seed); break;
      case 'timeStretch': current = timeStretch(current, edit.ratio); break;
      case 'pitchShift': current = pitchShift(current, edit.semitones, edit.cents, edit.preserveFormants); break;
      case 'denoise': { const e = edit; current = processInRange(current, e.range, (input) => denoise(input, e.noiseStartSeconds, e.noiseEndSeconds, e.reductionDb, e.smoothing)); break; }
      case 'dehum': { const e = edit; current = processInRange(current, e.range, (input) => dehum(input, e.fundamental, e.harmonics)); break; }
      case 'declick': { const e = edit; current = processInRange(current, e.range, (input) => declick(input, e.sensitivity, e.maxClickMs).audio); break; }
      case 'decrackle': { const e = edit; current = processInRange(current, e.range, (input) => decrackle(input, e.amount)); break; }
      case 'deplosive': { const e = edit; current = processInRange(current, e.range, (input) => deplosive(input, e.cutoffHz, e.sensitivityDb, e.reductionDb)); break; }
      case 'deess': { const e = edit; current = processInRange(current, e.range, (input) => deess(input, e.frequencyHz, e.thresholdDb, e.rangeDb)); break; }
      case 'hissGate': { const e = edit; current = processInRange(current, e.range, (input) => hissGate(input, e.lowCrossover, e.highCrossover, e.bands, e.rangeDb)); break; }
      case 'declip': { const e = edit; current = processInRange(current, e.range, (input) => declip(input, e.levelPercent).audio); break; }
      case 'repairBurst': current = repairBurst(current, edit.startSeconds, edit.endSeconds); break;
      case 'spectralAttenuate': current = spectralAttenuate(current, edit.regions, edit.reductionDb); break;
      case 'spectralHeal': current = spectralHeal(current, edit.region); break;
    }
  }
  return current;
}

export const pcmDuration = (audio: PcmAudio): number => audio.channels.length ? audio.channels[0].length / audio.sampleRate : 0;

/** Timeline seconds rounded to the nearest frame, clamped to `[0, length]`; the same rule `applyEdits` uses. */
const editFrame = (seconds: number, sampleRate: number, length: number) =>
  Math.max(0, Math.min(length, Math.round(finite(seconds) * sampleRate)));

/**
 * Predicts the frame count `applyEdits` produces without touching PCM.
 *
 * Document operations (ripple, clip placement, timeline duration) need clip
 * lengths while the decoded audio lives in the DSP worker. This mirrors the
 * renderer's frame rounding for every length-changing edit, so the document and
 * the rendered material can never disagree about where a clip ends.
 */
export function estimateEditedFrameCount(sourceFrames: number, sampleRate: number, edits: readonly AudioEdit[]): number {
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) throw new RangeError('Sample rate must be a positive finite number.');
  let length = Math.max(0, Math.trunc(finite(sourceFrames)));
  for (const edit of edits) {
    if (edit.type === 'crop') {
      const first = editFrame(edit.startSeconds, sampleRate, length);
      const second = editFrame(edit.endSeconds, sampleRate, length);
      length = Math.abs(second - first);
    } else if (edit.type === 'deleteRange') {
      const first = editFrame(edit.startSeconds, sampleRate, length);
      const second = editFrame(edit.endSeconds, sampleRate, length);
      length -= Math.abs(second - first);
    } else if (edit.type === 'insertSilence') {
      length += Math.max(0, Math.round(finite(edit.durationSeconds) * sampleRate));
    } else if (edit.type === 'timeStretch') {
      length = stretchedLength(length, edit.ratio);
    }
  }
  return length;
}

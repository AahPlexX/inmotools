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

export interface MasteringTrack {
  id: string;
  name: string;
  sourceId: string;
  durationSeconds: number;
  gainDb: number;
  pan: number;
  muted: boolean;
  solo: boolean;
}

export interface MasteringProject {
  version: 1;
  tracks: MasteringTrack[];
  selection: TimeSelection;
  markers: MasteringMarker[];
  loopEnabled: boolean;
}

export interface PeakBucket { min: number; max: number }

export const createProject = (): MasteringProject => ({
  version: 1,
  tracks: [],
  selection: { startSeconds: 0, endSeconds: 0 },
  markers: [],
  loopEnabled: false,
});

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
    let min = 1;
    let max = -1;
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

export type AudioEdit =
  | { type: 'crop'; startSeconds: number; endSeconds: number }
  | { type: 'gain'; gainDb: number }
  | { type: 'normalizePeak'; targetDbfs: number };

export function applyEdits(source: PcmAudio, edits: readonly AudioEdit[]): PcmAudio {
  let current: PcmAudio = { sampleRate: source.sampleRate, channels: source.channels.map((channel) => channel.slice()) };
  for (const edit of edits) {
    if (edit.type === 'crop') current = slicePcm(current, edit.startSeconds, edit.endSeconds);
    else if (edit.type === 'gain') current = applyGain(current, edit.gainDb);
    else current = normalizePeak(current, edit.targetDbfs);
  }
  return current;
}

export const pcmDuration = (audio: PcmAudio): number => audio.channels.length ? audio.channels[0].length / audio.sampleRate : 0;

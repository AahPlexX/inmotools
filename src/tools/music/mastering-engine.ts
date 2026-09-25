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
  regions: MasteringRegion[];
  loopEnabled: boolean;
}

export interface PeakBucket { min: number; max: number }

export const createProject = (): MasteringProject => ({
  version: 1,
  tracks: [],
  selection: { startSeconds: 0, endSeconds: 0 },
  markers: [],
  regions: [],
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
  | { type: 'dualMono'; channelIndex: number };

export interface SourceOutputRange {
  sourceStartFrame: number;
  sourceEndFrame: number;
  outputStartFrame: number;
  outputEndFrame: number;
  reversed: boolean;
}

type TimelineSpan = {
  sourceStartFrame: number;
  sourceEndFrame: number;
  reversed: boolean;
} | {
  sourceStartFrame: null;
  sourceEndFrame: null;
  reversed: false;
  frameCount: number;
};

const spanLength = (span: TimelineSpan) => span.sourceStartFrame === null
  ? span.frameCount
  : span.sourceEndFrame - span.sourceStartFrame;

function splitTimelineAt(spans: TimelineSpan[], frame: number): [TimelineSpan[], TimelineSpan[]] {
  const left: TimelineSpan[] = [];
  const right: TimelineSpan[] = [];
  let position = 0;
  for (const span of spans) {
    const length = spanLength(span);
    const boundary = position + length;
    if (boundary <= frame) left.push(span);
    else if (position >= frame) right.push(span);
    else {
      const before = frame - position;
      const after = length - before;
      if (span.sourceStartFrame === null) {
        if (before > 0) left.push({ ...span, frameCount: before });
        if (after > 0) right.push({ ...span, frameCount: after });
      } else {
        const leftSpan: TimelineSpan = span.reversed
          ? { ...span, sourceStartFrame: span.sourceEndFrame - before }
          : { ...span, sourceEndFrame: span.sourceStartFrame + before };
        const rightSpan: TimelineSpan = span.reversed
          ? { ...span, sourceEndFrame: span.sourceEndFrame - before }
          : { ...span, sourceStartFrame: span.sourceStartFrame + before };
        if (before > 0) left.push(leftSpan);
        if (after > 0) right.push(rightSpan);
      }
    }
    position = boundary;
  }
  return [left, right];
}

function timelineFrame(seconds: number, sampleRate: number, length: number): number {
  return Math.max(0, Math.min(length, Math.round(finite(seconds) * sampleRate)));
}

/**
 * A half-open segment of the edited single-source timeline. Null source frames
 * identify inserted silence; reversed source segments read from end to start.
 */
export type SourceTimelineSegment =
  | {
    outputStartFrame: number;
    outputEndFrame: number;
    sourceStartFrame: number;
    sourceEndFrame: number;
    reversed: boolean;
  }
  | {
    outputStartFrame: number;
    outputEndFrame: number;
    sourceStartFrame: null;
    sourceEndFrame: null;
    reversed: false;
  };

/**
 * Derives the source and silence spans produced by the ordered AudioEdit stack.
 * All edit times are interpreted on the output timeline produced by prior edits.
 * This metadata does not render PCM or represent track/clip arrangement order.
 */
export function deriveSourceTimelineThroughEdits(
  source: PcmAudio,
  edits: readonly AudioEdit[],
): SourceTimelineSegment[] {
  const sourceLength = validatePcm(source);
  let spans: TimelineSpan[] = sourceLength
    ? [{ sourceStartFrame: 0, sourceEndFrame: sourceLength, reversed: false }]
    : [];
  const length = () => spans.reduce((total, span) => total + spanLength(span), 0);

  for (const edit of edits) {
    const currentLength = length();
    if (edit.type === 'crop') {
      const start = timelineFrame(edit.startSeconds, source.sampleRate, currentLength);
      const end = timelineFrame(edit.endSeconds, source.sampleRate, currentLength);
      const lower = Math.min(start, end);
      const [, afterStart] = splitTimelineAt(spans, lower);
      const [selected] = splitTimelineAt(afterStart, Math.max(start, end) - lower);
      spans = selected;
    } else if (edit.type === 'deleteRange') {
      const start = timelineFrame(edit.startSeconds, source.sampleRate, currentLength);
      const end = timelineFrame(edit.endSeconds, source.sampleRate, currentLength);
      const lower = Math.min(start, end);
      const [before, afterStart] = splitTimelineAt(spans, lower);
      const [, after] = splitTimelineAt(afterStart, Math.max(start, end) - lower);
      spans = [...before, ...after];
    } else if (edit.type === 'insertSilence') {
      const at = timelineFrame(edit.atSeconds, source.sampleRate, currentLength);
      const silenceLength = Math.max(0, Math.round(finite(edit.durationSeconds) * source.sampleRate));
      const [before, after] = splitTimelineAt(spans, at);
      if (silenceLength > 0) {
        spans = [...before, {
          sourceStartFrame: null,
          sourceEndFrame: null,
          reversed: false,
          frameCount: silenceLength,
        }, ...after];
      } else {
        spans = [...before, ...after];
      }
    } else if (edit.type === 'reverse') {
      const start = timelineFrame(edit.startSeconds, source.sampleRate, currentLength);
      const end = timelineFrame(edit.endSeconds, source.sampleRate, currentLength);
      const lower = Math.min(start, end);
      const upper = Math.max(start, end);
      const [before, afterStart] = splitTimelineAt(spans, lower);
      const [selected, after] = splitTimelineAt(afterStart, upper - lower);
      spans = [...before, ...selected.reverse().map((span) => span.sourceStartFrame === null
        ? span
        : { ...span, reversed: !span.reversed }), ...after];
    }
  }

  const result: SourceTimelineSegment[] = [];
  let outputStartFrame = 0;
  for (const span of spans) {
    const outputEndFrame = outputStartFrame + spanLength(span);
    if (span.sourceStartFrame === null) {
      result.push({
        outputStartFrame,
        outputEndFrame,
        sourceStartFrame: null,
        sourceEndFrame: null,
        reversed: false,
      });
    } else {
      result.push({
        outputStartFrame,
        outputEndFrame,
        sourceStartFrame: span.sourceStartFrame,
        sourceEndFrame: span.sourceEndFrame,
        reversed: span.reversed,
      });
    }
    outputStartFrame = outputEndFrame;
  }
  return result;
}

/**
 * Maps an original-source half-open range to its surviving edited-output ranges.
 * Results are ordered on the output timeline; inserted silence has no source range.
 */
export function mapSourceRangeThroughEdits(
  source: PcmAudio,
  edits: readonly AudioEdit[],
  startSeconds: number,
  endSeconds: number,
): SourceOutputRange[] {
  const timeline = deriveSourceTimelineThroughEdits(source, edits);
  const sourceLength = source.channels[0].length;
  const requested = clampSelection({ startSeconds, endSeconds }, sourceLength / source.sampleRate);
  const sourceStart = timelineFrame(requested.startSeconds, source.sampleRate, sourceLength);
  const sourceEnd = timelineFrame(requested.endSeconds, source.sampleRate, sourceLength);
  const result: SourceOutputRange[] = [];

  if (sourceStart === sourceEnd) return result;
  for (const segment of timeline) {
    if (segment.sourceStartFrame === null) continue;
    const overlapStart = Math.max(sourceStart, segment.sourceStartFrame);
    const overlapEnd = Math.min(sourceEnd, segment.sourceEndFrame);
    if (overlapStart >= overlapEnd) continue;
    const startOffset = segment.reversed
      ? segment.sourceEndFrame - overlapEnd
      : overlapStart - segment.sourceStartFrame;
    const endOffset = segment.reversed
      ? segment.sourceEndFrame - overlapStart
      : overlapEnd - segment.sourceStartFrame;
    result.push({
      sourceStartFrame: overlapStart,
      sourceEndFrame: overlapEnd,
      outputStartFrame: segment.outputStartFrame + startOffset,
      outputEndFrame: segment.outputStartFrame + endOffset,
      reversed: segment.reversed,
    });
  }
  return result;
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
    }
  }
  return current;
}

export const pcmDuration = (audio: PcmAudio): number => audio.channels.length ? audio.channels[0].length / audio.sampleRate : 0;

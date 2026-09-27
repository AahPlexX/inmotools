/**
 * Arrangement rendering: turns clip materials into one mixed PCM timeline.
 *
 * Receives the serializable document from mastering-project.ts plus decoded
 * clip materials (source PCM with each clip's edits applied). Produces the
 * pre-master mix that playback, waveform peaks, meters, and export all read.
 * Mix order and pan law are documented in
 * docs/superpowers/plans/2026-09-27-audio-mastering-completion.md.
 */
import { applyEdits, type AudioEdit, type PcmAudio } from './mastering-engine';
import type { FadeCurve, MasteringDocument } from './mastering-project';

// --- SECTION: fade curves (ledger 14, 15) ---

/**
 * Exponential fades rise by a fixed number of decibels per unit time. This
 * constant makes the curve span 40 dB (a factor of 100) before its final step to
 * unity, which keeps the start audibly soft without a long silent lead-in.
 */
const EXPONENTIAL_SPAN = Math.log(100);

/**
 * Fade-in gain for normalized position `x` in [0, 1]; 0 at the start, 1 at the end.
 * Fade-outs use `fadeGain(curve, 1 - x)`, so a crossfade built from one curve is
 * the exact mirror of itself. Equal-power pairs sum to constant power
 * (sin² + cos² = 1); linear pairs sum to constant amplitude.
 */
export function fadeGain(curve: FadeCurve, x: number): number {
  const t = Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0));
  switch (curve) {
    case 'linear': return t;
    case 'equalPower': return Math.sin(t * Math.PI / 2);
    case 'exponential': return (Math.exp(EXPONENTIAL_SPAN * t) - 1) / (Math.exp(EXPONENTIAL_SPAN) - 1);
    case 'logarithmic': return 1 - (Math.exp(EXPONENTIAL_SPAN * (1 - t)) - 1) / (Math.exp(EXPONENTIAL_SPAN) - 1);
    case 'sCurve': return (1 - Math.cos(t * Math.PI)) / 2;
  }
}

// --- SECTION: pan law (ledger 16) ---

/**
 * Balance law with unity at centre: panning attenuates the opposite side
 * linearly to silence at full pan while the near side stays at unity. A centred
 * clip therefore passes through unchanged, which mastering work depends on.
 */
export function balanceGains(pan: number): [number, number] {
  const p = Math.min(1, Math.max(-1, Number.isFinite(pan) ? pan : 0));
  return [Math.min(1, 1 - p), Math.min(1, 1 + p)];
}

// --- SECTION: material cache ---

/**
 * Key for a clip's material. Edits are plain JSON, so their serialization is a
 * stable identity for the rendered result of one source.
 */
export const materialKey = (sourceId: string, edits: readonly AudioEdit[]) => `${sourceId}\u0000${JSON.stringify(edits)}`;

/**
 * Bounded LRU cache of rendered clip materials.
 *
 * Appending one edit is the common case, so a miss first looks for the longest
 * cached prefix of the same edit list and replays only the remaining edits.
 * Heavy edits (denoise, stretch) therefore run once per revision instead of on
 * every re-render.
 */
export class MaterialCache {
  private readonly entries = new Map<string, PcmAudio>();

  constructor(private readonly capacity = 32) {}

  get size() { return this.entries.size; }

  clear() { this.entries.clear(); }

  /** Drops every material derived from one source (called when a source is released). */
  forgetSource(sourceId: string) {
    for (const key of [...this.entries.keys()]) if (key.startsWith(`${sourceId}\u0000`)) this.entries.delete(key);
  }

  material(sourceId: string, source: PcmAudio, edits: readonly AudioEdit[]): PcmAudio {
    const key = materialKey(sourceId, edits);
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit;
    }
    let base = source;
    let applied = 0;
    for (let prefix = edits.length - 1; prefix > 0; prefix -= 1) {
      const cached = this.entries.get(materialKey(sourceId, edits.slice(0, prefix)));
      if (cached) { base = cached; applied = prefix; break; }
    }
    const rendered = applyEdits(base, edits.slice(applied));
    this.entries.set(key, rendered);
    while (this.entries.size > this.capacity) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    return rendered;
  }
}

// --- SECTION: mixing ---

/**
 * Whether a clip is heard. Mute always wins. When anything is soloed (a track
 * or a clip), a clip plays only if it or its track is soloed.
 */
export function clipAudible(document: MasteringDocument, trackId: string, clipId: string): boolean {
  const track = document.tracks.find((candidate) => candidate.id === trackId);
  const clip = track?.clips.find((candidate) => candidate.id === clipId);
  if (!track || !clip || track.muted || clip.muted) return false;
  const anySolo = document.tracks.some((candidate) => candidate.solo || candidate.clips.some((item) => item.solo));
  return !anySolo || track.solo || clip.solo;
}

/** Mono when every clip material is mono, otherwise stereo. Muting never changes the channel count. */
export function mixChannelCount(materials: ReadonlyMap<string, PcmAudio>): 1 | 2 {
  for (const material of materials.values()) if (material.channels.length > 1) return 2;
  return 1;
}

/**
 * Renders the arrangement to one PCM buffer at the project rate.
 *
 * @param document - The current document; clip placement, fades, gain, pan, mute, and solo are read from it.
 * @param materials - Rendered material per clip id (source with the clip's edits applied).
 * @returns The mixed timeline, one frame per project frame from 0 to the end of the last clip.
 * @throws {Error} when the project has no sample rate or a material's rate differs from it.
 */
export function mixArrangement(document: MasteringDocument, materials: ReadonlyMap<string, PcmAudio>): PcmAudio {
  const rate = document.sampleRate;
  if (!rate) throw new Error('The project has no audio yet.');
  const channelCount = mixChannelCount(materials);
  let totalFrames = 0;
  for (const track of document.tracks) {
    for (const clip of track.clips) {
      const material = materials.get(clip.id);
      if (!material) continue;
      if (material.sampleRate !== rate) throw new Error(`Clip ${clip.name} is at ${material.sampleRate} Hz but the project runs at ${rate} Hz.`);
      totalFrames = Math.max(totalFrames, Math.round(clip.startSeconds * rate) + material.channels[0].length);
    }
  }
  const output = Array.from({ length: channelCount }, () => new Float32Array(totalFrames));

  for (const track of document.tracks) {
    const trackGain = 10 ** (track.gainDb / 20);
    const [trackLeft, trackRight] = channelCount === 2 ? balanceGains(track.pan) : [1, 1];
    for (const clip of track.clips) {
      const material = materials.get(clip.id);
      if (!material || !clipAudible(document, track.id, clip.id)) continue;
      const frames = material.channels[0].length;
      const offset = Math.round(clip.startSeconds * rate);
      const gain = trackGain * 10 ** (clip.gainDb / 20);
      const [clipLeft, clipRight] = channelCount === 2 ? balanceGains(clip.pan) : [1, 1];
      const fadeInFrames = Math.min(frames, Math.round(clip.fadeIn.durationSeconds * rate));
      const fadeOutFrames = Math.min(frames - fadeInFrames, Math.round(clip.fadeOut.durationSeconds * rate));
      const fadeOutStart = frames - fadeOutFrames;
      const sourceLeft = material.channels[0];
      const sourceRight = material.channels[1] ?? material.channels[0];
      const leftGain = gain * clipLeft * trackLeft;
      const rightGain = gain * clipRight * trackRight;
      for (let frame = 0; frame < frames; frame += 1) {
        let envelope = 1;
        // Sampling fades at frame centres keeps the first frame of a fade-in
        // audible-but-quiet and makes fade-in/fade-out pairs exact mirrors.
        if (frame < fadeInFrames) envelope = fadeGain(clip.fadeIn.curve, (frame + 0.5) / fadeInFrames);
        else if (frame >= fadeOutStart) envelope = fadeGain(clip.fadeOut.curve, 1 - (frame - fadeOutStart + 0.5) / fadeOutFrames);
        const target = offset + frame;
        output[0][target] += sourceLeft[frame] * leftGain * envelope;
        if (channelCount === 2) output[1][target] += sourceRight[frame] * rightGain * envelope;
      }
    }
  }
  return { sampleRate: rate, channels: output };
}

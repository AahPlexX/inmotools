/**
 * Heavy-work engine for the Audio Mastering workstation.
 *
 * Owns decoded source PCM (converted to the project rate on load), the clip
 * material cache, and every whole-timeline computation: mixing, peak pyramids,
 * per-clip overviews, and boundary snapping. It is plain TypeScript so unit
 * tests call it directly; `mastering-dsp.worker.ts` exposes it to the UI thread
 * through messages, keeping long renders off the main thread.
 */
import { MaterialCache, mixArrangement } from './mastering-arrangement';
import { buildPeakEnvelope, findZeroCrossing, measureDcOffset, type PcmAudio, type PeakBucket } from './mastering-engine';
import type { MasteringDocument } from './mastering-project';
import { buildPeakPyramid, type PeakPyramid } from './dsp/peaks';
import { averageSpectrum, findResonances, type Resonance, type Spectrum } from './dsp/analysis';
import { measureLoudness, LoudnessMeter, type LoudnessReading } from './dsp/loudness';
import { renderMaster, type MasterSettings } from './dsp/master-chain';
import { buildSpectrogram, type Spectrogram } from './dsp/spectrogram';
import { resamplePcm } from './dsp/resample';

export interface ClipRenderInfo {
  frameCount: number;
  channelCount: number;
  dcOffsets: number[];
  /** Coarse overview for track lanes; at most {@link CLIP_OVERVIEW_BUCKETS} buckets. */
  peaks: PeakBucket[];
}

export interface RenderResult {
  mix: PcmAudio;
  pyramid: PeakPyramid;
  clips: Record<string, ClipRenderInfo>;
}

const CLIP_OVERVIEW_BUCKETS = 600;

export interface MasterRenderResult {
  channels: Float32Array[];
  sampleRate: number;
  loudness: LoudnessReading;
  /** Short-term loudness every 100 ms (for the loudness CSV/JSON report). */
  shortTermSeries: number[];
}

export class MasteringDspEngine {
  private readonly sources = new Map<string, PcmAudio>();
  private readonly cache = new MaterialCache();
  /** The most recent mix, kept so analysis and master renders need no re-mix. */
  private lastMix: PcmAudio | null = null;

  /**
   * Registers decoded PCM for a source, converting it to the project rate.
   * @returns The converted frame count the document must record for this source.
   */
  loadSource(sourceId: string, pcm: PcmAudio, projectRate: number): { frameCount: number; channelCount: number } {
    if (!pcm.channels.length || !pcm.channels[0].length) throw new Error('The decoded file contains no audio frames.');
    const converted = pcm.sampleRate === projectRate ? pcm : resamplePcm(pcm, projectRate);
    this.cache.forgetSource(sourceId);
    this.sources.set(sourceId, converted);
    return { frameCount: converted.channels[0].length, channelCount: converted.channels.length };
  }

  releaseSource(sourceId: string) {
    this.sources.delete(sourceId);
    this.cache.forgetSource(sourceId);
  }

  releaseAll() {
    this.sources.clear();
    this.cache.clear();
    this.lastMix = null;
  }

  hasSource(sourceId: string) { return this.sources.has(sourceId); }

  /** Rendered material for one clip, or null when its source is not loaded. */
  clipMaterial(document: MasteringDocument, clipId: string): PcmAudio | null {
    for (const track of document.tracks) {
      const clip = track.clips.find((candidate) => candidate.id === clipId);
      if (!clip) continue;
      const source = this.sources.get(clip.sourceId);
      return source ? this.cache.material(clip.sourceId, source, clip.edits) : null;
    }
    return null;
  }

  /**
   * Renders the whole arrangement.
   * @throws {Error} naming the first clip whose source is missing, so the UI can offer relinking.
   */
  render(document: MasteringDocument): RenderResult {
    const materials = new Map<string, PcmAudio>();
    const clips: Record<string, ClipRenderInfo> = {};
    for (const track of document.tracks) {
      for (const clip of track.clips) {
        const material = this.clipMaterial(document, clip.id);
        if (!material) throw new Error(`The audio for ${clip.name} is not loaded. Open the original file again to relink it.`);
        materials.set(clip.id, material);
        const frameCount = material.channels[0]?.length ?? 0;
        clips[clip.id] = {
          frameCount,
          channelCount: material.channels.length,
          dcOffsets: frameCount ? measureDcOffset(material) : material.channels.map(() => 0),
          peaks: frameCount ? buildPeakEnvelope(material, CLIP_OVERVIEW_BUCKETS) : [],
        };
      }
    }
    const mix = document.sampleRate && materials.size
      ? mixArrangement(document, materials)
      : { sampleRate: document.sampleRate ?? 48_000, channels: [new Float32Array(0)] };
    this.lastMix = mix;
    return { mix, pyramid: buildPeakPyramid(mix), clips };
  }

  private mixRange(startSeconds?: number, endSeconds?: number): { mix: PcmAudio; start: number; end: number } {
    const mix = this.lastMix;
    if (!mix || !mix.channels[0]?.length) throw new Error('Render the timeline before analysing it.');
    const length = mix.channels[0].length;
    const start = startSeconds === undefined ? 0 : Math.max(0, Math.min(length, Math.round(startSeconds * mix.sampleRate)));
    const end = endSeconds === undefined ? length : Math.max(start, Math.min(length, Math.round(endSeconds * mix.sampleRate)));
    return { mix, start, end };
  }

  /** Average spectrum of the mix over a range, plus the strongest resonances (ledger 50). */
  analyzeSpectrum(startSeconds?: number, endSeconds?: number): { spectrum: Spectrum; resonances: Resonance[] } {
    const { mix, start, end } = this.mixRange(startSeconds, endSeconds);
    const spectrum = averageSpectrum(mix.channels, mix.sampleRate, start, end);
    return { spectrum, resonances: findResonances(spectrum) };
  }

  /**
   * Offline master render (ledger 72) of the mix or a range of it, with a full
   * BS.1770-5 / EBU R 128 loudness reading of the result.
   */
  renderMaster(settings: MasterSettings, startSeconds?: number, endSeconds?: number): MasterRenderResult {
    const { mix, start, end } = this.mixRange(startSeconds, endSeconds);
    const channels = renderMaster(mix.channels.map((channel) => channel.subarray(start, end)), mix.sampleRate, settings);
    const meter = new LoudnessMeter(mix.sampleRate, channels.length);
    const block = 8192;
    for (let offset = 0; offset < channels[0].length; offset += block) {
      const size = Math.min(block, channels[0].length - offset);
      meter.process(channels.map((channel) => channel.subarray(offset, offset + size)), size);
    }
    return { channels, sampleRate: mix.sampleRate, loudness: meter.reading(), shortTermSeries: [...meter.shortTermSeries()] };
  }

  /** Spectrogram of the whole mix (ledger 6). */
  spectrogram(): Spectrogram {
    const { mix } = this.mixRange();
    return buildSpectrogram(mix.channels, mix.sampleRate);
  }

  /** Loudness reading of the unprocessed mix, for before/after comparison. */
  measureMix(): LoudnessReading {
    const { mix } = this.mixRange();
    return measureLoudness(mix.channels, mix.sampleRate);
  }

  /**
   * Copies part of a clip's material for the sample pen. The start is clamped
   * so the slice stays inside the clip; the actual start is returned.
   * @throws {Error} when the clip or its source is missing.
   */
  clipSlice(document: MasteringDocument, clipId: string, startFrame: number, frameCount: number): { startFrame: number; channels: Float32Array[] } {
    const material = this.clipMaterial(document, clipId);
    if (!material) throw new Error('The selected clip is not loaded.');
    const length = material.channels[0]?.length ?? 0;
    const count = Math.max(0, Math.min(length, Math.trunc(frameCount)));
    const start = Math.max(0, Math.min(length - count, Math.trunc(startFrame)));
    return { startFrame: start, channels: material.channels.map((channel) => channel.slice(start, start + count)) };
  }

  /**
   * Moves timeline times to the nearest zero crossing inside a clip's material
   * (first channel), searching `radius` frames either side (ledger 12).
   */
  snapToZeroCrossings(document: MasteringDocument, clipId: string, timelineSeconds: readonly number[], radius = 2048): number[] {
    const rate = document.sampleRate;
    const clip = document.tracks.flatMap((track) => track.clips).find((candidate) => candidate.id === clipId);
    const material = clip ? this.clipMaterial(document, clipId) : null;
    if (!rate || !clip || !material?.channels[0]?.length) return [...timelineSeconds];
    const channel = material.channels[0];
    const clipStartFrame = Math.round(clip.startSeconds * rate);
    return timelineSeconds.map((seconds) => {
      const local = Math.round(seconds * rate) - clipStartFrame;
      if (local <= 0 || local >= channel.length) return Math.round(seconds * rate) / rate;
      return (clipStartFrame + findZeroCrossing(channel, local, radius)) / rate;
    });
  }
}

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

export class MasteringDspEngine {
  private readonly sources = new Map<string, PcmAudio>();
  private readonly cache = new MaterialCache();

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
    return { mix, pyramid: buildPeakPyramid(mix), clips };
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

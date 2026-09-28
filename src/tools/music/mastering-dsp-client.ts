/**
 * UI-thread handle for the Mastering DSP worker.
 *
 * Wraps request/response correlation in promises. `render` resolves to `null`
 * when a newer render replaced it, so the caller simply ignores stale results.
 * `dispose` terminates the worker and rejects anything still waiting, which
 * releases the worker's source PCM when the workspace unmounts.
 */
import type { ExportRenderRequest, MasterRenderResult, RenderResult } from './mastering-dsp-engine';
import type { MasterSettings } from './dsp/master-chain';
import type { DspRequest, DspResponse } from './mastering-dsp-protocol';
import type { MasteringDocument } from './mastering-project';
import type { PcmAudio } from './mastering-engine';

type Pending = { resolve: (response: DspResponse) => void; reject: (error: Error) => void };
type WithoutId<T> = T extends unknown ? Omit<T, 'requestId'> : never;

export class MasteringDspClient {
  private readonly worker: Worker;
  private readonly pending = new Map<number, Pending>();
  private nextId = 1;
  private disposed = false;
  /** Set once the worker reports an uncaught error; later requests fail fast instead of hanging. */
  private failure: Error | null = null;

  constructor(onFailure?: (error: Error) => void) {
    this.worker = new Worker(new URL('./mastering-dsp.worker.ts', import.meta.url), { type: 'module' });
    this.worker.onmessage = (event: MessageEvent<DspResponse>) => {
      const waiter = this.pending.get(event.data.requestId);
      if (!waiter) return;
      this.pending.delete(event.data.requestId);
      waiter.resolve(event.data);
    };
    const fail = (error: Error) => {
      if (this.failure) return;
      this.failure = error;
      onFailure?.(error);
      for (const waiter of this.pending.values()) waiter.reject(error);
      this.pending.clear();
    };
    this.worker.onerror = (event) => fail(new Error(event.message || 'The audio processing worker stopped unexpectedly.'));
    this.worker.onmessageerror = () => fail(new Error('The audio processing worker returned data this browser could not read.'));
  }

  private request(message: WithoutId<DspRequest>, transfer: Transferable[] = []): Promise<DspResponse> {
    if (this.disposed) return Promise.reject(new Error('The audio processing worker has been released.'));
    if (this.failure) return Promise.reject(this.failure);
    const requestId = this.nextId++;
    return new Promise<DspResponse>((resolve, reject) => {
      this.pending.set(requestId, { resolve, reject });
      try {
        this.worker.postMessage({ ...message, requestId } as DspRequest, transfer);
      } catch (error) {
        this.pending.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private static unwrap<T extends DspResponse['type']>(response: DspResponse, type: T): Extract<DspResponse, { type: T }> {
    if (response.type === 'error') throw new Error(response.message);
    if (response.type !== type) throw new Error(`Unexpected worker reply ${response.type}.`);
    return response as Extract<DspResponse, { type: T }>;
  }

  /** Transfers the PCM to the worker; the caller's channel arrays become detached. */
  async loadSource(sourceId: string, pcm: PcmAudio, projectRate: number) {
    const response = await this.request(
      { type: 'loadSource', sourceId, sampleRate: pcm.sampleRate, channels: pcm.channels, projectRate },
      pcm.channels.map((channel) => channel.buffer),
    );
    const loaded = MasteringDspClient.unwrap(response, 'sourceLoaded');
    return { frameCount: loaded.frameCount, channelCount: loaded.channelCount };
  }

  async releaseSource(sourceId: string) {
    MasteringDspClient.unwrap(await this.request({ type: 'releaseSource', sourceId }), 'released');
  }

  async releaseAll() {
    MasteringDspClient.unwrap(await this.request({ type: 'releaseAll' }), 'released');
  }

  async render(document: MasteringDocument): Promise<RenderResult | null> {
    const response = await this.request({ type: 'render', document });
    if (response.type === 'superseded') return null;
    return MasteringDspClient.unwrap(response, 'rendered').result;
  }

  async snap(document: MasteringDocument, clipId: string, seconds: number[], radius?: number) {
    return MasteringDspClient.unwrap(await this.request({ type: 'snap', document, clipId, seconds, radius }), 'snapped').seconds;
  }

  /** Copies up to `frameCount` frames of a clip's rendered material, starting at a clip-local frame. */
  async slice(document: MasteringDocument, clipId: string, startFrame: number, frameCount: number) {
    const response = MasteringDspClient.unwrap(await this.request({ type: 'slice', document, clipId, startFrame, frameCount }), 'sliced');
    return { startFrame: response.startFrame, channels: response.channels };
  }

  async spectrum(startSeconds?: number, endSeconds?: number) {
    const response = MasteringDspClient.unwrap(await this.request({ type: 'spectrum', startSeconds, endSeconds }), 'spectrumResult');
    return { spectrum: response.spectrum, resonances: response.resonances };
  }

  async renderMaster(settings: MasterSettings, startSeconds?: number, endSeconds?: number): Promise<MasterRenderResult> {
    return MasteringDspClient.unwrap(await this.request({ type: 'master', settings, startSeconds, endSeconds }), 'masterResult').result;
  }

  /** Renders the mix or one stem for export; the returned channels are owned by the caller. */
  async renderExport(document: MasteringDocument, request: ExportRenderRequest): Promise<MasterRenderResult> {
    return MasteringDspClient.unwrap(await this.request({ type: 'export', document, request }), 'exported').result;
  }

  async spectrogram() {
    return MasteringDspClient.unwrap(await this.request({ type: 'spectrogram' }), 'spectrogramResult').spectrogram;
  }

  async measureMix() {
    return MasteringDspClient.unwrap(await this.request({ type: 'measureMix' }), 'mixMeasured').loudness;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.terminate();
    const error = new Error('The audio processing worker has been released.');
    for (const waiter of this.pending.values()) waiter.reject(error);
    this.pending.clear();
  }
}

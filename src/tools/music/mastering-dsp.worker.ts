/// <reference lib="webworker" />
/**
 * DSP worker for the Audio Mastering workstation.
 *
 * Thin message adapter around {@link MasteringDspEngine}. Render requests are
 * coalesced: while one render runs, newer requests replace older pending ones,
 * and every superseded request is answered with `superseded` so no caller
 * waits forever. Large results cross back as transferred buffers.
 */
import { MasteringDspEngine } from './mastering-dsp-engine';
import type { DspRequest, DspResponse } from './mastering-dsp-protocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const engine = new MasteringDspEngine();
let pendingRender: Extract<DspRequest, { type: 'render' }> | null = null;
let renderScheduled = false;

const post = (message: DspResponse, transfer: Transferable[] = []) => scope.postMessage(message, transfer);
const errorText = (error: unknown) => error instanceof Error ? error.message : String(error);

function runPendingRender() {
  renderScheduled = false;
  const request = pendingRender;
  pendingRender = null;
  if (!request) return;
  try {
    const result = engine.render(request.document);
    const transfer: Transferable[] = [
      ...result.mix.channels.map((channel) => channel.buffer),
      ...result.pyramid.levels.flatMap((level) => [level.min.buffer, level.max.buffer]),
    ];
    post({ type: 'rendered', requestId: request.requestId, result }, transfer);
  } catch (error) {
    post({ type: 'error', requestId: request.requestId, message: errorText(error) });
  }
}

scope.onmessage = (event: MessageEvent<DspRequest>) => {
  const request = event.data;
  try {
    switch (request.type) {
      case 'loadSource': {
        const loaded = engine.loadSource(request.sourceId, { sampleRate: request.sampleRate, channels: request.channels }, request.projectRate);
        post({ type: 'sourceLoaded', requestId: request.requestId, ...loaded });
        break;
      }
      case 'releaseSource':
        engine.releaseSource(request.sourceId);
        post({ type: 'released', requestId: request.requestId });
        break;
      case 'releaseAll':
        engine.releaseAll();
        pendingRender = null;
        post({ type: 'released', requestId: request.requestId });
        break;
      case 'render':
        if (pendingRender) post({ type: 'superseded', requestId: pendingRender.requestId });
        pendingRender = request;
        if (!renderScheduled) {
          renderScheduled = true;
          setTimeout(runPendingRender, 0);
        }
        break;
      case 'snap':
        post({ type: 'snapped', requestId: request.requestId, seconds: engine.snapToZeroCrossings(request.document, request.clipId, request.seconds, request.radius) });
        break;
    }
  } catch (error) {
    post({ type: 'error', requestId: request.requestId, message: errorText(error) });
  }
};

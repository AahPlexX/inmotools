import { analyzeFloorplan } from './floorplan-analysis';
import type { FloorplanProject } from './floorplan-types';

export type FloorplanWorkerRequest = { readonly type: 'analyze'; readonly requestId: number; readonly project: FloorplanProject };
export type FloorplanWorkerResponse = { readonly type: 'analysis'; readonly requestId: number; readonly analysis: ReturnType<typeof analyzeFloorplan> }
  | { readonly type: 'error'; readonly requestId: number; readonly message: string };

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
workerScope.onmessage = (event: MessageEvent<FloorplanWorkerRequest>) => {
  const request = event.data;
  if (request.type !== 'analyze') return;
  try {
    workerScope.postMessage({ type: 'analysis', requestId: request.requestId, analysis: analyzeFloorplan(request.project) } satisfies FloorplanWorkerResponse);
  } catch (error) {
    workerScope.postMessage({ type: 'error', requestId: request.requestId, message: error instanceof Error ? error.message : String(error) } satisfies FloorplanWorkerResponse);
  }
};

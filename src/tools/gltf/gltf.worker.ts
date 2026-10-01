import { optimizeGlb } from './gltf-engine';
import type { GltfWorkerRequest, GltfWorkerResponse } from './gltf-worker-protocol';

const post = (message: GltfWorkerResponse) => self.postMessage(message);

self.onmessage = async (event: MessageEvent<GltfWorkerRequest>) => {
  const request = event.data;
  if (request?.type !== 'optimize') return;
  try {
    const result = await optimizeGlb(request.bytes, request.options, {
      onProgress: (value, stage) => post({ type: 'progress', requestId: request.requestId, value, stage }),
    });
    post({ type: 'completed', requestId: request.requestId, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'GLB optimization failed in the worker.';
    // A canceled run is terminated with the worker, so its rejection is never observed; this keeps genuine failures visible.
    post({ type: 'error', requestId: request.requestId, message });
  }
};

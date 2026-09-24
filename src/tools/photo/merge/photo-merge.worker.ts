/// <reference lib="webworker" />
import { loadPhotoMergeEngine } from './photo-merge-engine';
import { handlePhotoMergeRequest } from './photo-merge-handler';
import type { PhotoMergeResponse } from './photo-merge-types';

const scope = self as unknown as DedicatedWorkerGlobalScope;

// Requests run strictly one at a time so peak engine memory is bounded to a single job.
let queue: Promise<void> = Promise.resolve();

scope.onmessage = (event: MessageEvent<unknown>) => {
  queue = queue.then(async () => {
    let response: PhotoMergeResponse;
    try {
      response = await handlePhotoMergeRequest(event.data, loadPhotoMergeEngine);
    } catch (error) {
      const data = event.data as { id?: unknown } | null;
      response = {
        id: typeof data?.id === 'number' ? data.id : -1,
        ok: false,
        diagnostic: { code: 'worker-failed', message: error instanceof Error ? error.message : 'Alignment stopped unexpectedly.' },
      };
    }
    const transfer = response.ok && response.type === 'align' ? response.aligned.map((raster) => raster.buffer) : [];
    scope.postMessage(response, transfer);
  });
};

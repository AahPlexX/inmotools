import type { CountedImageQuantizationResult } from './engines/counted-image-engine';
import type { CountedImageWorkerRequest, CountedImageWorkerResponse } from './counted-image-worker-contract';

let nextRequestId = 1;

export interface CountedImageFileOptions {
  readonly rows: number;
  readonly cols: number;
  readonly maxColors: number;
  readonly dither: boolean;
}

export const quantizeCountedImageFile = async (
  file: File,
  options: CountedImageFileOptions,
): Promise<CountedImageQuantizationResult> => {
  const buffer = await file.arrayBuffer();
  const worker = new Worker(new URL('./counted-image.worker.ts', import.meta.url), { type: 'module' });
  const requestId = nextRequestId;
  nextRequestId += 1;

  return new Promise((resolve, reject) => {
    const finish = () => worker.terminate();
    worker.addEventListener('message', (event: MessageEvent<CountedImageWorkerResponse>) => {
      const response = event.data;
      if (!response || response.requestId !== requestId) return;
      finish();
      if (response.type === 'result') resolve(response.result);
      else reject(new Error(response.message));
    });
    worker.addEventListener('error', (event) => {
      finish();
      reject(new Error(event.message || 'Image worker failed.'));
    });
    const request: CountedImageWorkerRequest = {
      type: 'quantize', requestId, buffer, mimeType: file.type,
      rows: options.rows, cols: options.cols, maxColors: options.maxColors, dither: options.dither,
    };
    worker.postMessage(request, [buffer]);
  });
};
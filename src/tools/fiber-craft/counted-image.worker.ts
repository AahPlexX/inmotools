/// <reference lib="webworker" />

import { quantizeCountedImage } from './engines/counted-image-engine';
import type { CountedImageWorkerRequest, CountedImageWorkerResponse } from './counted-image-worker-contract';

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener('message', async (event: MessageEvent<CountedImageWorkerRequest>) => {
  const request = event.data;
  if (!request || request.type !== 'quantize') return;

  try {
    const blob = new Blob([request.buffer], { type: request.mimeType || 'application/octet-stream' });
    const bitmap = await createImageBitmap(blob, {
      resizeWidth: request.cols,
      resizeHeight: request.rows,
      resizeQuality: 'high',
    });
    const canvas = new OffscreenCanvas(request.cols, request.rows);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Image canvas is unavailable in this browser.');
    context.drawImage(bitmap, 0, 0, request.cols, request.rows);
    bitmap.close();
    const image = context.getImageData(0, 0, request.cols, request.rows);
    const result = quantizeCountedImage({
      width: request.cols,
      height: request.rows,
      pixels: image.data,
      rows: request.rows,
      cols: request.cols,
      maxColors: request.maxColors,
      dither: request.dither,
    });
    scope.postMessage({ type: 'result', requestId: request.requestId, result } satisfies CountedImageWorkerResponse);
  } catch (error) {
    scope.postMessage({
      type: 'error',
      requestId: request.requestId,
      message: error instanceof Error ? error.message : 'Image quantization failed.',
    } satisfies CountedImageWorkerResponse);
  }
});
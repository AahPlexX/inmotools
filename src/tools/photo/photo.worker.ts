/// <reference lib="webworker" />

import { processPhotoColorPipeline } from './color/photo-color-pipeline';
import type { PhotoRecipe } from './photo-types';

interface ProcessMessage {
  type: 'process';
  revision: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  recipe: PhotoRecipe;
  mode: 'preview' | 'export';
  jpegBackground?: readonly [number, number, number];
}

interface ProcessedMessage {
  type: 'processed';
  revision: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  proofBaseBuffer?: ArrayBuffer;
  gamutWarningPixels: number;
}

interface ErrorMessage {
  type: 'error';
  revision: number;
  width: number;
  height: number;
  message: string;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener('message', async (event: MessageEvent<ProcessMessage>) => {
  const request = event.data;
  if (!request || request.type !== 'process') return;

  try {
    const pixels = new Uint8ClampedArray(request.buffer);
    const processed = await processPhotoColorPipeline(
      pixels,
      request.width,
      request.height,
      request.recipe,
      request.mode,
      request.jpegBackground,
    );
    const response: ProcessedMessage = {
      type: 'processed',
      revision: request.revision,
      width: request.width,
      height: request.height,
      buffer: processed.pixels.buffer as ArrayBuffer,
      proofBaseBuffer: processed.proofBasePixels?.buffer as ArrayBuffer | undefined,
      gamutWarningPixels: processed.gamutWarningPixels,
    };
    const transfers: Transferable[] = [response.buffer];
    if (response.proofBaseBuffer) transfers.push(response.proofBaseBuffer);
    scope.postMessage(response, transfers);
  } catch (error) {
    const response: ErrorMessage = {
      type: 'error',
      revision: request.revision,
      width: request.width,
      height: request.height,
      message: error instanceof Error ? error.message : 'Photo processing failed.',
    };
    scope.postMessage(response);
  }
});

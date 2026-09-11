/// <reference lib="webworker" />

import { applyPixelAdjustments } from './photo-engine';
import type { PhotoRecipe } from './photo-types';

interface ProcessMessage {
  type: 'process';
  revision: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
  recipe: PhotoRecipe;
}

interface ProcessedMessage {
  type: 'processed';
  revision: number;
  width: number;
  height: number;
  buffer: ArrayBuffer;
}

interface ErrorMessage {
  type: 'error';
  revision: number;
  width: number;
  height: number;
  message: string;
}

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.addEventListener('message', (event: MessageEvent<ProcessMessage>) => {
  const request = event.data;
  if (!request || request.type !== 'process') return;

  try {
    const pixels = new Uint8ClampedArray(request.buffer);
    applyPixelAdjustments(pixels, request.width, request.height, request.recipe);
    const response: ProcessedMessage = {
      type: 'processed',
      revision: request.revision,
      width: request.width,
      height: request.height,
      buffer: pixels.buffer as ArrayBuffer,
    };
    scope.postMessage(response, [response.buffer]);
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

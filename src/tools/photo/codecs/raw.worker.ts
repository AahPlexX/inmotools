/// <reference lib="webworker" />
import { decodeRawPixels } from './raw-decoder';
import type { PhotoRawSettings } from '../photo-types';

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async (event: MessageEvent<ArrayBuffer | { buffer: ArrayBuffer; settings: PhotoRawSettings }>) => {
  try {
    const request = event.data;
    const decoded = await decodeRawPixels(request instanceof ArrayBuffer ? request : request.buffer, request instanceof ArrayBuffer ? undefined : request.settings);
    const canvas = new OffscreenCanvas(decoded.width, decoded.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('RAW raster canvas is unavailable.');
    context.putImageData(new ImageData(decoded.rgba, decoded.width, decoded.height), 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    if (blob.type !== 'image/png') throw new Error('RAW raster PNG encoding is unavailable.');
    scope.postMessage({ blob, notice: decoded.notice, rawSource: decoded.rawSource });
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : 'RAW decoding failed.' });
  }
};

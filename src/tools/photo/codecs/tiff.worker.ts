/// <reference lib="webworker" />
import { decodeTiffPixels } from './tiff-decoder';

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    const decoded = await decodeTiffPixels(event.data);
    const canvas = new OffscreenCanvas(decoded.width, decoded.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('TIFF raster canvas is unavailable.');
    context.putImageData(new ImageData(decoded.rgba, decoded.width, decoded.height), 0, 0);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    if (blob.type !== 'image/png') throw new Error('TIFF raster PNG encoding is unavailable.');
    scope.postMessage({ blob, notice: decoded.notice });
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : 'TIFF decoding failed.' });
  }
};

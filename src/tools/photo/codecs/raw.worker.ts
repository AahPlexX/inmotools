/// <reference lib="webworker" />
import { decodeRawPixels } from './raw-decoder';
import type { PhotoRawSettings } from '../photo-types';

const scope = self as unknown as DedicatedWorkerGlobalScope;
scope.onmessage = async (event: MessageEvent<ArrayBuffer | { buffer: ArrayBuffer; settings?: PhotoRawSettings; preview?: boolean }>) => {
  try {
    const request = event.data;
    const decoded = await decodeRawPixels(request instanceof ArrayBuffer ? request : request.buffer, request instanceof ArrayBuffer ? undefined : request.settings,
      !(request instanceof ArrayBuffer) && request.preview ? async (preview) => {
        const bitmap = preview.jpeg ? await createImageBitmap(new Blob([preview.jpeg], { type: 'image/jpeg' }), { imageOrientation: 'from-image' }) : null;
        try {
          const flip = preview.flip ?? 0; const transpose = (flip & 4) !== 0;
          const width = bitmap?.width ?? (transpose ? preview.height : preview.width);
          const height = bitmap?.height ?? (transpose ? preview.width : preview.height);
          if (width > 4096 || height > 4096 || width * height > 16_000_000) throw new Error('RAW preview geometry is unsafe.');
          const scale = Math.min(1, 1024 / Math.max(width, height));
          const canvas = new OffscreenCanvas(Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale)));
          const context = canvas.getContext('2d');
          if (!context) throw new Error('RAW preview canvas is unavailable.');
          if (bitmap) context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          else {
            const source = new OffscreenCanvas(preview.width, preview.height);
            const sourceContext = source.getContext('2d');
            if (!sourceContext || !preview.rgba) throw new Error('RAW preview bitmap is unavailable.');
            sourceContext.putImageData(new ImageData(preview.rgba, preview.width, preview.height), 0, 0);
            context.scale(canvas.width / width, canvas.height / height);
            if (transpose) context.transform(0, 1, 1, 0, 0, 0);
            context.translate(flip & 1 ? preview.width : 0, flip & 2 ? preview.height : 0);
            context.scale(flip & 1 ? -1 : 1, flip & 2 ? -1 : 1);
            context.drawImage(source, 0, 0);
          }
          const blob = await canvas.convertToBlob({ type: 'image/png' });
          if (blob.type === 'image/png' && blob.size <= 8 * 1024 * 1024) scope.postMessage({ preview: blob });
        } finally { bitmap?.close(); }
      } : undefined);
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

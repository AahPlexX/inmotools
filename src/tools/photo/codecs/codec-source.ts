import type { PhotoImportRaster } from '../photo-import';
import type { PhotoRawSettings, PhotoRawSource } from '../photo-types';

let queue: Promise<unknown> = Promise.resolve();

/** A shared queue bounds concurrent codec intermediates, including mixed imports. */
export function prepareCodecSource(file: Blob, format: string, seconds: number, createWorker: () => Worker, settings?: PhotoRawSettings, onPreview?: (blob: Blob) => void): Promise<PhotoImportRaster> {
  const task = queue.then(async () => {
    if (file.size > 64 * 1024 * 1024) throw new Error(`${format} input exceeds the 64 MiB import limit.`);
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
      throw new Error(`${format} import requires Worker and OffscreenCanvas support; convert the source to PNG in this browser.`);
    }
    const buffer = await file.arrayBuffer();
    const worker = createWorker();
    try {
      return await new Promise<PhotoImportRaster>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`${format} decoding exceeded its ${seconds}-second time limit.`)), seconds * 1000);
        const finish = (callback: () => void) => { clearTimeout(timeout); callback(); };
        worker.onmessage = (event: MessageEvent<{ blob?: Blob; preview?: Blob; notice?: string; error?: string; rawSource?: PhotoRawSource }>) => {
          const message = event.data;
          if (message && typeof message === 'object' && 'preview' in message) {
            if (message.preview instanceof Blob && message.preview.type === 'image/png' && message.preview.size <= 8 * 1024 * 1024) {
              try { onPreview?.(message.preview); } catch { /* Optional display cannot break codec completion. */ }
            }
            return; // Progress does not extend the deadline or release the decoder queue.
          }
          finish(() => {
            if (!message?.blob || message.blob.type !== 'image/png') reject(new Error(message?.error || `${format} decoder returned an invalid raster.`));
            else resolve({ blob: message.blob, notice: message.notice, ...(message.rawSource ? { rawSource: message.rawSource } : {}) });
          });
        };
        worker.onerror = () => finish(() => reject(new Error(`${format} decoder worker failed; the current photo is unchanged.`)));
        worker.onmessageerror = () => finish(() => reject(new Error(`${format} decoder response could not be read.`)));
        try { worker.postMessage(onPreview ? { buffer, settings, preview: true } : settings ? { buffer, settings } : buffer, [buffer]); }
        catch (error) { finish(() => reject(error)); }
      });
    } finally { worker.terminate(); }
  });
  queue = task.catch(() => undefined);
  return task;
}

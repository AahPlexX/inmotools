import type { PhotoImportRaster } from '../photo-import';

let queue: Promise<unknown> = Promise.resolve();

export function prepareTiffSource(file: Blob): Promise<PhotoImportRaster> {
  const task = queue.then(async () => {
    if (file.size > 64 * 1024 * 1024) throw new Error('TIFF input exceeds the 64 MiB import limit.');
    if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') {
      throw new Error('TIFF import requires Worker and OffscreenCanvas support; convert the source to PNG in this browser.');
    }
    const buffer = await file.arrayBuffer();
    const worker = new Worker(new URL('./tiff.worker.ts', import.meta.url), { type: 'module' });
    try {
      return await new Promise<PhotoImportRaster>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('TIFF decoding exceeded its 20-second time limit.')), 20_000);
        const finish = (callback: () => void) => { clearTimeout(timeout); callback(); };
        worker.onmessage = (event: MessageEvent<{ blob?: Blob; notice?: string; error?: string }>) => finish(() => {
          const message = event.data;
          if (!message.blob || message.blob.type !== 'image/png') reject(new Error(message.error || 'TIFF decoder returned an invalid raster.'));
          else resolve({ blob: message.blob, notice: message.notice });
        });
        worker.onerror = () => finish(() => reject(new Error('TIFF decoder worker failed; the current photo is unchanged.')));
        worker.onmessageerror = () => finish(() => reject(new Error('TIFF decoder response could not be read.')));
        try { worker.postMessage(buffer, [buffer]); }
        catch (error) { finish(() => reject(error)); }
      });
    } finally {
      worker.terminate();
    }
  });
  queue = task.catch(() => undefined);
  return task;
}

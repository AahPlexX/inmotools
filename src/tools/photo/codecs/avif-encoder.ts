/** Encodes RGBA pixels to AVIF in a dedicated, lazily created worker. The 3.5 MB encoder is
 * fetched only when someone actually exports AVIF. One encode runs at a time; a worker is
 * terminated after every job (success, failure, or timeout) so a stuck encode never lingers. */

const AVIF_DEADLINE_SECONDS = 180;
let queue: Promise<unknown> = Promise.resolve();

export function avifEncodingAvailable(): boolean {
  return typeof Worker !== 'undefined' && typeof WebAssembly !== 'undefined';
}

export function encodePhotoAvif(pixels: Uint8ClampedArray, width: number, height: number, options: { quality: number; lossless: boolean }): Promise<Blob> {
  const task = queue.then(() => new Promise<Blob>((resolve, reject) => {
    if (!avifEncodingAvailable()) {
      reject(new Error('AVIF export needs WebAssembly and Web Worker support.'));
      return;
    }
    const worker = new Worker(new URL('./avif-encode.worker.ts', import.meta.url), { type: 'module' });
    const finish = (callback: () => void) => {
      clearTimeout(timer);
      worker.terminate();
      callback();
    };
    const timer = setTimeout(() => finish(() => reject(new Error(`AVIF encoding took longer than ${AVIF_DEADLINE_SECONDS / 60} minutes and was stopped. Try a smaller size or another format.`))), AVIF_DEADLINE_SECONDS * 1000);
    worker.onmessage = (event: MessageEvent<{ buffer?: ArrayBuffer; error?: string }>) => {
      finish(() => {
        if (event.data?.buffer instanceof ArrayBuffer && event.data.buffer.byteLength > 0) resolve(new Blob([event.data.buffer], { type: 'image/avif' }));
        else reject(new Error(event.data?.error || 'The AVIF encoder returned no data.'));
      });
    };
    worker.onerror = () => finish(() => reject(new Error('The AVIF encoder could not start in this browser.')));
    worker.onmessageerror = () => finish(() => reject(new Error('The AVIF encoder returned an unreadable result.')));
    const copy = new Uint8ClampedArray(pixels);
    worker.postMessage({ width, height, buffer: copy.buffer, quality: options.quality * 100, lossless: options.lossless }, [copy.buffer]);
  }));
  queue = task.catch(() => undefined);
  return task;
}

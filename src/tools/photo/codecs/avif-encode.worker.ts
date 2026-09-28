/// <reference lib="webworker" />
// Single-threaded libavif encoder from the pinned @jsquash/avif package. The package's default
// entry switches to a multi-threaded build when SharedArrayBuffer is available; importing the
// single-threaded glue directly keeps behaviour identical on hosts without cross-origin isolation
// (such as GitHub Pages) and avoids bundling a second encoder.
import avifEncoderFactory from '@jsquash/avif/codec/enc/avif_enc.js';
import { defaultOptions } from '@jsquash/avif/meta.js';
import { initEmscriptenModule } from '@jsquash/avif/utils.js';

interface EncodeMessage { width: number; height: number; buffer: ArrayBuffer; quality: number; lossless: boolean }

const scope = self as unknown as DedicatedWorkerGlobalScope;
let modulePromise: ReturnType<typeof initEmscriptenModule> | null = null;

scope.onmessage = async (event: MessageEvent<EncodeMessage>) => {
  try {
    const { width, height, buffer, quality, lossless } = event.data;
    if (!(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0) || !(buffer instanceof ArrayBuffer) || buffer.byteLength < width * height * 4) {
      throw new Error('AVIF encoder received an incomplete image.');
    }
    modulePromise ??= initEmscriptenModule(avifEncoderFactory);
    const module = await modulePromise;
    // Mirrors @jsquash/avif's own encode(): lossless forces quality 100 and full-resolution chroma.
    const options = lossless
      ? { ...defaultOptions, lossless: true, quality: 100, qualityAlpha: -1, subsample: 3 }
      : { ...defaultOptions, lossless: false, quality: Math.round(Math.min(100, Math.max(0, quality))) };
    const output = module.encode(new Uint8Array(buffer), width, height, options);
    if (!output) throw new Error('The AVIF encoder could not encode this image.');
    const bytes = new Uint8Array(output);
    scope.postMessage({ buffer: bytes.buffer }, [bytes.buffer]);
  } catch (error) {
    scope.postMessage({ error: error instanceof Error ? error.message : String(error) });
  }
};

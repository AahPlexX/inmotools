import type { PhotoCv } from './photo-registration';

function isReady(candidate: unknown): candidate is PhotoCv {
  return typeof candidate === 'object' && candidate !== null && typeof (candidate as { Mat?: unknown }).Mat === 'function';
}

/** Normalises the three shapes the OpenCV.js build can export — an initialised module, a promise
 * of one, or an Emscripten module whose runtime is still starting — into one initialised engine. */
export async function resolvePhotoCvRuntime(exported: unknown): Promise<PhotoCv> {
  let candidate = exported;
  if (isReady(candidate)) return candidate;
  if (candidate instanceof Promise) candidate = await candidate;
  if (isReady(candidate)) return candidate;
  if (typeof candidate !== 'object' || candidate === null) throw new Error('The image alignment engine is missing.');
  const pending = candidate as { onRuntimeInitialized?: () => void };
  await new Promise<void>((resolve) => { pending.onRuntimeInitialized = () => resolve(); });
  if (!isReady(pending)) throw new Error('The image alignment engine did not initialise.');
  return pending;
}

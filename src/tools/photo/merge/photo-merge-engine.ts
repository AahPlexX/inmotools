// Static import on purpose: only the merge worker imports this module and the worker is created
// on demand, so the ~15 MB engine still loads only when a merge starts. A dynamic import() would
// hand the module namespace to promise resolution, which this CJS package's interop namespace can
// break by exposing its default export's `then`.
import * as openCvNamespace from '@techstark/opencv-js';
import { resolvePhotoCvRuntime } from './photo-cv-runtime';
import type { PhotoCv } from './photo-registration';

let enginePromise: Promise<PhotoCv> | null = null;

/** Resolves the initialised engine once per worker. A failed initialisation is not cached, so a
 * later merge can retry instead of inheriting the failure. */
export function loadPhotoMergeEngine(): Promise<PhotoCv> {
  enginePromise ??= resolvePhotoCvRuntime((openCvNamespace as { default?: unknown }).default ?? openCvNamespace).catch((error: unknown) => {
    enginePromise = null;
    throw error;
  });
  return enginePromise;
}

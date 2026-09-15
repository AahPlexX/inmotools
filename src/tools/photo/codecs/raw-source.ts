import type { PhotoImportRaster } from '../photo-import';
import { prepareCodecSource } from './codec-source';
import { normalizeRawSettings } from '../photo-raw-settings';
import type { PhotoRawSettings } from '../photo-types';
export function prepareRawSource(file: Blob, settings?: PhotoRawSettings): Promise<PhotoImportRaster> {
  const normalized = normalizeRawSettings(settings);
  const options = JSON.stringify(normalized) === JSON.stringify(normalizeRawSettings(undefined)) ? undefined : normalized;
  return prepareCodecSource(file, 'RAW', 30, () => new Worker(new URL('./raw.worker.ts', import.meta.url), { type: 'module' }), options);
}

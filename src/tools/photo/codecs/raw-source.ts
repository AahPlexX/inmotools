import type { PhotoImportRaster } from '../photo-import';
import { prepareCodecSource } from './codec-source';
export function prepareRawSource(file: Blob): Promise<PhotoImportRaster> {
  return prepareCodecSource(file, 'RAW', 30, () => new Worker(new URL('./raw.worker.ts', import.meta.url), { type: 'module' }));
}

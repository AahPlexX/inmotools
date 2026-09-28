import type { PhotoImportRaster } from '../photo-import';
import { prepareCodecSource } from './codec-source';

export function prepareTiffSource(file: Blob): Promise<PhotoImportRaster> {
  return prepareCodecSource(file, 'TIFF', 20, () => new Worker(new URL('./tiff.worker.ts', import.meta.url), { type: 'module' }));
}

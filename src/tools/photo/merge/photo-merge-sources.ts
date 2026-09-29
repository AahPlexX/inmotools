import { preparePhotoRaster, releasePhotoRaster } from '../photo-import';
import type { PhotoMergeRaster } from './photo-merge-types';

export interface PhotoMergeFrame {
  file: File;
  width: number;
  height: number;
  /** From EXIF ExposureTime when present; HDR asks the user for any that are missing. */
  exposureSeconds: number | null;
}

/** Reads EXIF ExposureTime as seconds from an ExifReader tag map. Accepts the rational
 * `[numerator, denominator]` value or a plain number; anything else is treated as unknown. */
export function exposureSecondsFromTags(tags: Record<string, { value?: unknown } | undefined>): number | null {
  const value = tags.ExposureTime?.value;
  const seconds = Array.isArray(value) && value.length === 2 ? Number(value[0]) / Number(value[1]) : Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
}

async function readExposure(file: File): Promise<number | null> {
  try {
    const { default: ExifReader } = await import('exifreader');
    return exposureSecondsFromTags(await ExifReader.load(file) as Record<string, { value?: unknown }>);
  } catch {
    return null; // No EXIF, or a format the reader does not parse: the user enters the time.
  }
}

async function decodeBitmap(file: File): Promise<ImageBitmap> {
  const raster = await preparePhotoRaster(file);
  return createImageBitmap(raster.blob, { imageOrientation: 'from-image' });
}

/** Size and exposure only; pixels are decoded later, one frame at a time, so a selection of
 * large photos is never held in memory all at once just to show the list. */
export async function readMergeFrame(file: File): Promise<PhotoMergeFrame> {
  const bitmap = await decodeBitmap(file);
  const frame = { file, width: bitmap.width, height: bitmap.height, exposureSeconds: await readExposure(file) };
  bitmap.close();
  return frame;
}

export async function decodeMergeFrame(frame: PhotoMergeFrame): Promise<PhotoMergeRaster> {
  const bitmap = await decodeBitmap(frame.file);
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('2D canvas rendering is unavailable in this browser.');
    context.drawImage(bitmap, 0, 0);
    const pixels = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { width: bitmap.width, height: bitmap.height, buffer: pixels.data.buffer };
  } finally {
    bitmap.close();
    releasePhotoRaster(frame.file);
  }
}

export async function mergeResultToFile(raster: PhotoMergeRaster, name: string): Promise<File> {
  const canvas = new OffscreenCanvas(raster.width, raster.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas rendering is unavailable in this browser.');
  context.putImageData(new ImageData(new Uint8ClampedArray(raster.buffer), raster.width, raster.height), 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return new File([blob], name, { type: 'image/png' });
}

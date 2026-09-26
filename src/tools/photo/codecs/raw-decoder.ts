import { normalizeRawSettings } from '../photo-raw-settings';
import type { PhotoRawSettings, PhotoRawSource } from '../photo-types';

export const RAW_EXTENSION = /\.(?:dng|cr2|cr3|nef|arw|raf|orf|rw2|pef|srw)$/i;

/** Read only a bounded first TIFF directory; never traverse metadata pointers. */
export async function detectRawSource(file: Blob): Promise<boolean> {
  const type = file.type.trim().toLowerCase();
  const name = 'name' in file ? String(file.name) : '';
  if (/^image\/(?:x-)?(?:adobe-dng|dng|canon-cr[23]|nikon-nef|sony-arw|fuji(?:film)?-raf|olympus-orf|panasonic-rw2|pentax-pef|samsung-srw)$/.test(type)
    || ((!type || type === 'application/octet-stream' || type === 'image/x-raw') && RAW_EXTENSION.test(name))) return true;
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  if (header.length < 8) return false;
  const little = header[0] === 73 && header[1] === 73;
  if (!little && !(header[0] === 77 && header[1] === 77)) return false;
  const view = new DataView(header.buffer);
  if (view.getUint16(2, little) !== 42) return false;
  if (header.length >= 12 && header[8] === 67 && header[9] === 82 && header[10] === 2 && header[11] === 0) return true;
  const offset = view.getUint32(4, little);
  if (offset < 8 || offset + 2 > file.size) return false;
  const countBytes = await file.slice(offset, offset + 2).arrayBuffer();
  if (countBytes.byteLength !== 2) return false;
  const count = new DataView(countBytes).getUint16(0, little);
  if (count > 512 || offset + 2 + count * 12 > file.size) return false;
  const directory = new DataView(await file.slice(offset + 2, offset + 2 + count * 12).arrayBuffer());
  for (let index = 0; index < count; index++) {
    const at = index * 12;
    if (directory.getUint16(at, little) === 50706 && directory.getUint16(at + 2, little) === 1
      && directory.getUint32(at + 4, little) === 4) return true;
  }
  return false;
}

function checkGeometry(width: number, height: number): void {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
    || width > 4096 || height > 4096 || width * height > 16_000_000) {
    throw new Error('RAW dimensions exceed the 4096-edge / 16-megapixel import limit; convert a smaller source to TIFF or PNG.');
  }
}

export type RawEmbeddedPreview = { width: number; height: number } & (
  { rgba: Uint8ClampedArray<ArrayBuffer>; flip: number; jpeg?: never } | { jpeg: Uint8Array<ArrayBuffer>; rgba?: never; flip?: never }
);

/** Validate JPEG SOF geometry before asking the browser to allocate decoded pixels. */
export function rawPreviewJpegGeometry(bytes: Uint8Array): { width: number; height: number } {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Invalid RAW preview JPEG.');
  let at = 2;
  while (at + 4 <= bytes.length) {
    if (bytes[at++] !== 0xff) break;
    while (bytes[at] === 0xff) at++;
    const marker = bytes[at++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = (bytes[at] << 8) | bytes[at + 1];
    if (length < 2 || at + length > bytes.length) break;
    if ([0xc0, 0xc1, 0xc2].includes(marker) && length >= 8) {
      const height = (bytes[at + 3] << 8) | bytes[at + 4];
      const width = (bytes[at + 5] << 8) | bytes[at + 6];
      checkGeometry(width, height);
      return { width, height };
    }
    at += length;
  }
  throw new Error('Unsupported RAW preview JPEG header.');
}

// --- Pre-demosaic exposure (LibRaw exp_correc / exp_shift / exp_preser) ---

/** Byte offsets inside libraw_output_params_t relative to `bright`, following LibRaw's documented
 * declaration order (bright, threshold, half_size … fbdd_noiserd, exp_correc, exp_shift,
 * exp_preser) with 4-byte fields and wasm32 pointers. The pinned wrapper exposes no setter for the
 * exposure fields, so they are written directly — but only after every anchor below has been
 * proven by writing it through the wrapper's own official setter and reading it back here. */
const PARAM_OFFSETS = { highlight: 16, outputBps: 52, adjustMaximumThr: 104, fbddNoiserd: 132, expCorrec: 136, expShift: 140, expPreser: 144 } as const;
const PARAM_SCAN_BYTES = 2 * 1024 * 1024;

interface LibRawInternals { module?: { HEAPU8: Uint8Array } }
interface LibRawSetters {
  setBright(value: number): void;
  setHighlight(value: number): void;
  setOutputBps(value: number): void;
  setAdjustMaximumThr(value: number): void;
  setFbddNoiserd(value: number): void;
}

/** Locates `bright` inside the decoder's libraw_data_t and proves the documented layout with four
 * independent setters. Returns the heap view and `bright` offset, or throws without writing. */
function locateOutputParams(LibRawClass: unknown, decoder: LibRawSetters): { view: DataView; bright: number } {
  const heap = (LibRawClass as LibRawInternals).module?.HEAPU8;
  const handle = (decoder as unknown as { lr?: unknown }).lr;
  if (!heap || typeof handle !== 'number' || handle <= 0) throw new Error('RAW exposure is unavailable in this decoder build.');
  const view = new DataView(heap.buffer);
  const limit = Math.min(heap.byteLength - PARAM_OFFSETS.expPreser - 4, handle + PARAM_SCAN_BYTES);
  const brightSentinel = Math.fround(1.2345678);
  decoder.setBright(brightSentinel);
  const candidates: number[] = [];
  for (let at = handle; at <= limit; at += 4) if (view.getFloat32(at, true) === brightSentinel) candidates.push(at);
  const verified = candidates.filter((bright) => {
    const originals = {
      highlight: view.getInt32(bright + PARAM_OFFSETS.highlight, true),
      outputBps: view.getInt32(bright + PARAM_OFFSETS.outputBps, true),
      adjust: view.getFloat32(bright + PARAM_OFFSETS.adjustMaximumThr, true),
      fbdd: view.getInt32(bright + PARAM_OFFSETS.fbddNoiserd, true),
    };
    decoder.setHighlight(9);
    decoder.setOutputBps(13);
    decoder.setAdjustMaximumThr(0.3125);
    decoder.setFbddNoiserd(3);
    const matches = view.getInt32(bright + PARAM_OFFSETS.highlight, true) === 9
      && view.getInt32(bright + PARAM_OFFSETS.outputBps, true) === 13
      && view.getFloat32(bright + PARAM_OFFSETS.adjustMaximumThr, true) === 0.3125
      && view.getInt32(bright + PARAM_OFFSETS.fbddNoiserd, true) === 3;
    decoder.setHighlight(originals.highlight);
    decoder.setOutputBps(originals.outputBps);
    decoder.setAdjustMaximumThr(originals.adjust);
    decoder.setFbddNoiserd(originals.fbdd);
    return matches;
  });
  decoder.setBright(1);
  if (verified.length !== 1) throw new Error('RAW exposure could not be verified for this decoder build, so it was not applied.');
  return { view, bright: verified[0] };
}

/** Applies LibRaw's pre-demosaic exposure correction: a linear shift of the sensor data before
 * interpolation (not output brightness scaling), with optional highlight preservation. */
export function applyRawExposure(LibRawClass: unknown, decoder: LibRawSetters, exposureEv: number, highlightPreservation: number): void {
  const { view, bright } = locateOutputParams(LibRawClass, decoder);
  const enabled = exposureEv !== 0;
  view.setInt32(bright + PARAM_OFFSETS.expCorrec, enabled ? 1 : 0, true);
  view.setFloat32(bright + PARAM_OFFSETS.expShift, enabled ? 2 ** exposureEv : 1, true);
  view.setFloat32(bright + PARAM_OFFSETS.expPreser, enabled ? highlightPreservation : 0, true);
}

export async function decodeRawPixels(buffer: ArrayBuffer, inputSettings?: PhotoRawSettings, onPreview?: (preview: RawEmbeddedPreview) => Promise<void>): Promise<{ width: number; height: number; samples: Uint16Array; rgba: Uint8ClampedArray<ArrayBuffer>; notice: string; rawSource: PhotoRawSource }> {
  if (!buffer.byteLength || buffer.byteLength > 64 * 1024 * 1024) throw new Error('RAW input must be nonempty and no larger than 64 MiB.');
  const { LibRaw } = await import('@colorhythm/libraw-wasm');
  await LibRaw.initialize();
  const decoder = new LibRaw();
  await decoder.waitUntilReady();
  try {
    decoder.open(buffer);
    checkGeometry(decoder.getRawWidth(), decoder.getRawHeight());
    checkGeometry(decoder.getActiveWidth(), decoder.getActiveHeight());
    const aspect = decoder.getPixelAspect();
    if (!Number.isFinite(aspect) || aspect <= 0) throw new Error('RAW pixel aspect is invalid.');
    checkGeometry(
      Math.ceil(decoder.getActiveWidth() * Math.max(1, aspect)),
      Math.ceil(decoder.getActiveHeight() / Math.min(1, aspect)),
    );
    if (onPreview) {
      // Optional camera previews never replace sensor development or abort it.
      try {
        const thumbnail = decoder.getThumbnail();
        // LibRaw reports UNKNOWN/zero colors until unpackThumb; do not gate on those lazy facts.
        if (thumbnail.twidth > 0 && thumbnail.theight > 0 && thumbnail.tlength > 0) {
          checkGeometry(thumbnail.twidth, thumbnail.theight);
          if (thumbnail.tlength < 1 || thumbnail.tlength > 8 * 1024 * 1024
            || thumbnail.twidth * thumbnail.theight * 6 > 8 * 1024 * 1024) throw new Error('RAW preview exceeds its byte limit.');
          decoder.unpackThumb();
          const image = decoder.dcrawMakeMemThumb();
          if (image.data_size < 1 || image.data_size > 8 * 1024 * 1024 || image.data.byteLength !== image.data_size) throw new Error('Invalid RAW preview size.');
          if (image.type_ === 'LIBRAW_IMAGE_JPEG') {
            const geometry = rawPreviewJpegGeometry(image.data);
            await onPreview({ ...geometry, jpeg: image.data });
          } else if (image.type_ === 'LIBRAW_IMAGE_BITMAP' && image.bits === 8 && image.colors === 3) {
            checkGeometry(image.width, image.height);
            if (image.data_size !== image.width * image.height * 3) throw new Error('Invalid RAW preview bitmap.');
            const rgba = new Uint8ClampedArray(image.width * image.height * 4);
            for (let pixel = 0; pixel < image.width * image.height; pixel++) {
              rgba.set(image.data.subarray(pixel * 3, pixel * 3 + 3), pixel * 4); rgba[pixel * 4 + 3] = 255;
            }
            await onPreview({ width: image.width, height: image.height, rgba, flip: decoder.getFlip() & 7 });
          }
        }
      } catch { /* Missing, damaged, oversized or unsupported optional previews fall back to full development. */ }
    }
    const camera = decoder.getIParams();
    const cleanText = (value: string) => value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 64);
    const channels = Array.from({ length: 4 }, (_, index) => String.fromCharCode(decoder.getCdesc(index))).join('');
    const colors = decoder.getColors();
    // The C unsigned CFA bitmask crosses the WASM i32 binding as signed.
    const filters = decoder.getFilters() >>> 0;
    const rgb = colors === 3 && channels.startsWith('RGB') && !decoder.getIsFoveon();
    const bayer = rgb && filters >= 1000;
    const rawSource: PhotoRawSource = {
      make: cleanText(camera.normalized_make || camera.make),
      model: cleanText(camera.normalized_model || camera.model),
      rawWidth: decoder.getRawWidth(), rawHeight: decoder.getRawHeight(),
      activeWidth: decoder.getActiveWidth(), activeHeight: decoder.getActiveHeight(),
      layout: bayer ? 'Bayer CFA' : rgb && filters === 9 ? 'X-Trans CFA' : rgb && filters === 0 ? 'Linear RGB' : 'Other',
      cameraWhiteBalance: rgb && [0, 1, 2].every((index) => Number.isFinite(decoder.getCamMul(index)) && decoder.getCamMul(index) > 0),
      colorControls: rgb,
      demosaicControl: bayer,
    };
    const settings = normalizeRawSettings(inputSettings);
    decoder.setOutputColor(1);
    decoder.setOutputBps(16);
    decoder.setGamma(0, 1 / 2.4);
    decoder.setGamma(1, 12.92);
    decoder.setUseCameraWb(settings.whiteBalance === 'camera' || !rgb ? 1 : 0);
    if (rgb) {
      if (settings.whiteBalance === 'custom') {
        [settings.redMultiplier, 1, settings.blueMultiplier, 1].forEach((value, index) => decoder.setUserMul(index, value));
      }
      decoder.setHighlight({ clip: 0, unclip: 1, blend: 2 }[settings.highlight]);
    }
    if (bayer) decoder.setDemosaic({ bilinear: 0, vng: 1, ppg: 2, ahd: 3 }[settings.demosaic]);
    decoder.setNoAutoBright(1);
    applyRawExposure(LibRaw, decoder, settings.exposureEv, settings.highlightPreservation);
    decoder.unpack();
    decoder.dcrawProcess();
    const image = decoder.dcrawMakeMemImage();
    checkGeometry(image.width, image.height);
    if (image.type_ !== 'LIBRAW_IMAGE_BITMAP' || image.bits !== 16 || image.colors !== 3
      || image.data_size !== image.width * image.height * 6 || image.data.byteLength !== image.data_size) {
      throw new Error('RAW decoder returned an unsupported processed raster.');
    }
    const samples = new Uint16Array(image.data_size / 2);
    const data = new DataView(image.data.buffer, image.data.byteOffset, image.data.byteLength);
    const rgba = new Uint8ClampedArray(image.width * image.height * 4);
    for (let pixel = 0; pixel < image.width * image.height; pixel++) {
      for (let channel = 0; channel < 3; channel++) {
        const at = pixel * 3 + channel;
        samples[at] = data.getUint16(at * 2, true);
        rgba[pixel * 4 + channel] = Math.round(samples[at] * 255 / 65535);
      }
      rgba[pixel * 4 + 3] = 255;
    }
    return {
      width: image.width, height: image.height, samples, rgba, rawSource,
      notice: 'RAW source preserved; LibRaw develops a 16-bit sRGB intermediate. Source-supported white balance, highlight handling, pre-demosaic exposure and Bayer demosaic settings run before raster editing. Editing and export use an 8-bit raster. Bounded embedded camera previews appear during import when available; they are not editing or export sources.',
    };
  } catch (error) {
    throw new Error(`RAW decoding failed: ${error instanceof Error ? error.message : 'unsupported or damaged source'}. Convert the source to TIFF or PNG if this camera/variant is unsupported.`);
  } finally { decoder.dispose(); }
}

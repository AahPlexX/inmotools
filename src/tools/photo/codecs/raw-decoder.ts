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

export async function decodeRawPixels(buffer: ArrayBuffer, inputSettings?: PhotoRawSettings): Promise<{ width: number; height: number; samples: Uint16Array; rgba: Uint8ClampedArray<ArrayBuffer>; notice: string; rawSource: PhotoRawSource }> {
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
      notice: 'RAW source preserved; LibRaw develops a 16-bit sRGB intermediate. Source-supported white balance, highlight handling and Bayer demosaic settings run before raster editing. Editing and export use an 8-bit raster. RAW exposure baseline and embedded-preview extraction are not yet available.',
    };
  } catch (error) {
    throw new Error(`RAW decoding failed: ${error instanceof Error ? error.message : 'unsupported or damaged source'}. Convert the source to TIFF or PNG if this camera/variant is unsupported.`);
  } finally { decoder.dispose(); }
}

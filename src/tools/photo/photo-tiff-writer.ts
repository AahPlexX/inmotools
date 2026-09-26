/** Baseline TIFF 6.0 writer for Photo Studio exports: little-endian ("II", magic 42), one IFD,
 * uncompressed chunky 8-bit RGB or RGB + unassociated alpha, in strips. Optional ICC profile
 * (tag 34675) and XMP packet (tag 700) travel inside the file. Tag numbers and field types follow
 * libtiff's `tiff.h`, the TIFF reference implementation.
 *
 * Photo Studio edits in 8 bits per channel, so exports are 8-bit: writing 16-bit samples from 8-bit
 * data would only pad values and misrepresent precision. */

const TYPE_BYTE = 1;
const TYPE_ASCII = 2;
const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;
const TYPE_UNDEFINED = 7;

const TAG = {
  imageWidth: 256,
  imageLength: 257,
  bitsPerSample: 258,
  compression: 259,
  photometric: 262,
  stripOffsets: 273,
  samplesPerPixel: 277,
  rowsPerStrip: 278,
  stripByteCounts: 279,
  xResolution: 282,
  yResolution: 283,
  planarConfig: 284,
  resolutionUnit: 296,
  software: 305,
  xmp: 700,
  extraSamples: 338,
  icc: 34675,
} as const;

/** Rows per strip are chosen so each strip holds about 64 KiB, near libtiff's default target. */
const STRIP_TARGET_BYTES = 64 * 1024;

export interface PhotoTiffOptions {
  /** Keep a fourth, unassociated-alpha sample. When false, alpha is dropped. */
  alpha: boolean;
  /** Pixels per inch written to X/YResolution (defaults to 72). */
  ppi?: number;
  icc?: Uint8Array;
  xmp?: Uint8Array;
  software?: string;
}

interface Entry { tag: number; type: number; count: number; data: Uint8Array }

function bytesPerType(type: number): number {
  return type === TYPE_SHORT ? 2 : type === TYPE_LONG ? 4 : type === TYPE_RATIONAL ? 8 : 1;
}

function shorts(values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 2);
  const view = new DataView(out.buffer);
  values.forEach((value, index) => view.setUint16(index * 2, value, true));
  return out;
}

function longs(values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4);
  const view = new DataView(out.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value, true));
  return out;
}

function rational(value: number): Uint8Array {
  // Resolution as an exact fraction with a denominator of 100 (e.g. 300 ppi = 30000/100).
  return longs([Math.max(1, Math.round(value * 100)), 100]);
}

/** Whether any pixel is less than fully opaque. */
export function hasTransparency(pixels: Uint8ClampedArray | Uint8Array): boolean {
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] !== 255) return true;
  return false;
}

export function encodePhotoTiff(pixels: Uint8ClampedArray | Uint8Array, width: number, height: number, options: PhotoTiffOptions): Uint8Array {
  if (!(Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0)) throw new Error('TIFF export needs positive whole-pixel dimensions.');
  if (pixels.length < width * height * 4) throw new Error('TIFF export pixel data is smaller than its dimensions.');
  const samples = options.alpha ? 4 : 3;
  const rowBytes = width * samples;
  const rowsPerStrip = Math.max(1, Math.min(height, Math.floor(STRIP_TARGET_BYTES / rowBytes) || 1));
  const stripCount = Math.ceil(height / rowsPerStrip);
  const stripByteCounts = Array.from({ length: stripCount }, (_, index) => Math.min(rowsPerStrip, height - index * rowsPerStrip) * rowBytes);

  const ppi = options.ppi && Number.isFinite(options.ppi) && options.ppi > 0 ? Math.min(100_000, options.ppi) : 72;
  const software = new TextEncoder().encode(`${options.software ?? 'InMo Tools Photo Studio'}\0`);
  const entries: Entry[] = [
    { tag: TAG.imageWidth, type: TYPE_LONG, count: 1, data: longs([width]) },
    { tag: TAG.imageLength, type: TYPE_LONG, count: 1, data: longs([height]) },
    { tag: TAG.bitsPerSample, type: TYPE_SHORT, count: samples, data: shorts(new Array(samples).fill(8)) },
    { tag: TAG.compression, type: TYPE_SHORT, count: 1, data: shorts([1]) },
    { tag: TAG.photometric, type: TYPE_SHORT, count: 1, data: shorts([2]) },
    // Offsets are patched below once the data layout is known.
    { tag: TAG.stripOffsets, type: TYPE_LONG, count: stripCount, data: longs(new Array(stripCount).fill(0)) },
    { tag: TAG.samplesPerPixel, type: TYPE_SHORT, count: 1, data: shorts([samples]) },
    { tag: TAG.rowsPerStrip, type: TYPE_LONG, count: 1, data: longs([rowsPerStrip]) },
    { tag: TAG.stripByteCounts, type: TYPE_LONG, count: stripCount, data: longs(stripByteCounts) },
    { tag: TAG.xResolution, type: TYPE_RATIONAL, count: 1, data: rational(ppi) },
    { tag: TAG.yResolution, type: TYPE_RATIONAL, count: 1, data: rational(ppi) },
    { tag: TAG.planarConfig, type: TYPE_SHORT, count: 1, data: shorts([1]) },
    { tag: TAG.resolutionUnit, type: TYPE_SHORT, count: 1, data: shorts([2]) },
    { tag: TAG.software, type: TYPE_ASCII, count: software.length, data: software },
  ];
  if (options.xmp?.length) entries.push({ tag: TAG.xmp, type: TYPE_BYTE, count: options.xmp.length, data: options.xmp });
  if (options.alpha) entries.push({ tag: TAG.extraSamples, type: TYPE_SHORT, count: 1, data: shorts([2]) });
  if (options.icc?.length) entries.push({ tag: TAG.icc, type: TYPE_UNDEFINED, count: options.icc.length, data: options.icc });
  // The specification requires IFD entries in ascending tag order.
  entries.sort((a, b) => a.tag - b.tag);

  const ifdOffset = 8;
  const ifdSize = 2 + entries.length * 12 + 4;
  let cursor = ifdOffset + ifdSize;
  const align = (value: number) => value + (value % 2);
  const external = new Map<Entry, number>();
  for (const entry of entries) {
    if (entry.data.length > 4) {
      cursor = align(cursor);
      external.set(entry, cursor);
      cursor += entry.data.length;
    }
  }
  cursor = align(cursor);
  const stripOffsets: number[] = [];
  for (const count of stripByteCounts) {
    stripOffsets.push(cursor);
    cursor += count;
  }
  const offsetsEntry = entries.find((entry) => entry.tag === TAG.stripOffsets)!;
  offsetsEntry.data = longs(stripOffsets);
  if (cursor > 0xffffffff) throw new Error('This image is too large for a classic TIFF file (4 GiB limit).');

  const out = new Uint8Array(cursor);
  const view = new DataView(out.buffer);
  out[0] = 0x49; out[1] = 0x49;
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);
  view.setUint16(ifdOffset, entries.length, true);
  entries.forEach((entry, index) => {
    const at = ifdOffset + 2 + index * 12;
    view.setUint16(at, entry.tag, true);
    view.setUint16(at + 2, entry.type, true);
    view.setUint32(at + 4, entry.count, true);
    const offset = external.get(entry);
    if (offset === undefined) out.set(entry.data, at + 8);
    else {
      view.setUint32(at + 8, offset, true);
      out.set(entry.data, offset);
    }
  });
  view.setUint32(ifdOffset + 2 + entries.length * 12, 0, true);

  let write = stripOffsets[0];
  for (let p = 0; p < width * height; p += 1) {
    const o = p * 4;
    out[write] = pixels[o]; out[write + 1] = pixels[o + 1]; out[write + 2] = pixels[o + 2];
    if (options.alpha) { out[write + 3] = pixels[o + 3]; write += 4; } else write += 3;
  }
  return out;
}

export interface PhotoTiffContents {
  width: number;
  height: number;
  pixels: Uint8ClampedArray;
  alpha: boolean;
  ppi: number;
  icc?: Uint8Array;
  xmp?: Uint8Array;
}

/** Reads back a TIFF produced by `encodePhotoTiff` (and equivalent baseline files): little-endian,
 * uncompressed, chunky 8-bit RGB/RGBA. Anything else is refused rather than guessed at. */
export function readPhotoTiff(bytes: Uint8Array): PhotoTiffContents {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 8 || bytes[0] !== 0x49 || bytes[1] !== 0x49 || view.getUint16(2, true) !== 42) throw new Error('Not a little-endian classic TIFF file.');
  const ifd = view.getUint32(4, true);
  if (ifd + 2 > bytes.length) throw new Error('TIFF directory is outside the file.');
  const count = view.getUint16(ifd, true);
  const tags = new Map<number, { type: number; count: number; offset: number }>();
  for (let index = 0; index < count; index += 1) {
    const at = ifd + 2 + index * 12;
    const type = view.getUint16(at + 2, true);
    const valueCount = view.getUint32(at + 4, true);
    const size = bytesPerType(type) * valueCount;
    tags.set(view.getUint16(at, true), { type, count: valueCount, offset: size > 4 ? view.getUint32(at + 8, true) : at + 8 });
  }
  const read = (tag: number, index = 0): number => {
    const entry = tags.get(tag);
    if (!entry) throw new Error(`TIFF is missing required tag ${tag}.`);
    if (entry.type === TYPE_SHORT) return view.getUint16(entry.offset + index * 2, true);
    if (entry.type === TYPE_LONG) return view.getUint32(entry.offset + index * 4, true);
    if (entry.type === TYPE_RATIONAL) return view.getUint32(entry.offset + index * 8, true) / view.getUint32(entry.offset + index * 8 + 4, true);
    throw new Error(`TIFF tag ${tag} has an unexpected type.`);
  };
  const raw = (tag: number) => {
    const entry = tags.get(tag);
    return entry ? bytes.slice(entry.offset, entry.offset + entry.count * bytesPerType(entry.type)) : undefined;
  };
  const width = read(TAG.imageWidth); const height = read(TAG.imageLength);
  const samples = read(TAG.samplesPerPixel);
  if (read(TAG.compression) !== 1 || read(TAG.photometric) !== 2 || (samples !== 3 && samples !== 4)) throw new Error('Only uncompressed 8-bit RGB/RGBA TIFF is supported here.');
  for (let s = 0; s < samples; s += 1) if (read(TAG.bitsPerSample, s) !== 8) throw new Error('Only 8-bit TIFF samples are supported here.');
  const strips = tags.get(TAG.stripOffsets)!.count;
  const pixels = new Uint8ClampedArray(width * height * 4);
  let p = 0;
  for (let strip = 0; strip < strips; strip += 1) {
    let offset = read(TAG.stripOffsets, strip);
    const end = offset + read(TAG.stripByteCounts, strip);
    if (end > bytes.length) throw new Error('TIFF strip data is outside the file.');
    for (; offset < end && p < width * height; p += 1, offset += samples) {
      pixels[p * 4] = bytes[offset]; pixels[p * 4 + 1] = bytes[offset + 1]; pixels[p * 4 + 2] = bytes[offset + 2];
      pixels[p * 4 + 3] = samples === 4 ? bytes[offset + 3] : 255;
    }
  }
  return {
    width,
    height,
    pixels,
    alpha: samples === 4,
    ppi: tags.has(TAG.xResolution) ? read(TAG.xResolution) : 72,
    icc: raw(TAG.icc),
    xmp: raw(TAG.xmp),
  };
}

/** Rewrites one of our TIFF files with an added or replaced ICC profile, XMP packet, or resolution,
 * preserving pixels and every other value — the TIFF counterpart of the JPEG/PNG/WebP embedders. */
export function withPhotoTiffExtras(bytes: Uint8Array, extras: { icc?: Uint8Array; xmp?: Uint8Array; ppi?: number }): Uint8Array {
  const contents = readPhotoTiff(bytes);
  return encodePhotoTiff(contents.pixels, contents.width, contents.height, {
    alpha: contents.alpha,
    ppi: extras.ppi ?? contents.ppi,
    icc: extras.icc ?? contents.icc,
    xmp: extras.xmp ?? contents.xmp,
  });
}

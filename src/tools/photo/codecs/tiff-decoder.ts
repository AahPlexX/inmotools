const MAX_INPUT_BYTES = 64 * 1024 * 1024;
const MAX_EDGE = 4096;
const RASTER_TAGS = new Set([256, 257, 258, 259, 262, 266, 273, 274, 277, 278, 279, 284, 317, 338, 339, 322, 323, 324, 325]);

interface TiffRasterDirectory {
  little: boolean;
  fields: Map<number, number[]>;
  multiplePages: boolean;
}

// Only raster tags enter the third-party parser. Unknown metadata and recursive
// EXIF/GPS/next-page pointers never reach it, but remain in the immutable source.
function readRasterDirectory(buffer: ArrayBuffer): TiffRasterDirectory {
  if (buffer.byteLength < 8 || buffer.byteLength > MAX_INPUT_BYTES) throw new Error('TIFF input is truncated or exceeds the 64 MiB limit.');
  const view = new DataView(buffer);
  const order = view.getUint16(0);
  if (order !== 0x4949 && order !== 0x4d4d) throw new Error('Invalid TIFF byte order.');
  const little = order === 0x4949;
  const magic = view.getUint16(2, little);
  if (magic === 43) throw new Error('BigTIFF is not supported; convert to a standard TIFF or PNG.');
  if (magic !== 42) throw new Error('Invalid TIFF signature.');
  const offset = view.getUint32(4, little);
  if (offset < 8 || offset + 2 > buffer.byteLength) throw new Error('Truncated TIFF directory.');
  const count = view.getUint16(offset, little);
  if (count > 512 || offset + 2 + count * 12 + 4 > buffer.byteLength) throw new Error('TIFF directory is truncated or exceeds the entry limit.');
  const fields = new Map<number, number[]>();
  for (let index = 0; index < count; index++) {
    const at = offset + 2 + index * 12;
    const tag = view.getUint16(at, little);
    if (!RASTER_TAGS.has(tag)) continue;
    const type = view.getUint16(at + 2, little);
    const size = view.getUint32(at + 4, little);
    if ((type !== 3 && type !== 4) || size < 1 || size > 4096 || fields.has(tag)) throw new Error('Unsupported or duplicate TIFF raster directory field.');
    const bytesPerValue = type === 3 ? 2 : 4;
    const bytes = size * bytesPerValue;
    const start = bytes > 4 ? view.getUint32(at + 8, little) : at + 8;
    if (start + bytes > buffer.byteLength) throw new Error('Truncated TIFF directory values.');
    fields.set(tag, Array.from({ length: size }, (_, i) => type === 3
      ? view.getUint16(start + i * 2, little)
      : view.getUint32(start + i * 4, little)));
  }
  return { little, fields, multiplePages: view.getUint32(offset + 2 + count * 12, little) !== 0 };
}

async function inflateStrip(bytes: Uint8Array<ArrayBuffer>, expected: number): Promise<Uint8Array<ArrayBuffer>> {
  if (typeof DecompressionStream === 'undefined') throw new Error('Deflate TIFF requires browser DecompressionStream support; use an uncompressed TIFF.');
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate')).getReader();
  const output = new Uint8Array(expected);
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > expected) throw new Error('TIFF strip decompressed size exceeds its declared raster size.');
      output.set(value, offset);
      offset += value.length;
    }
    if (offset !== expected) throw new Error('TIFF strip decompressed size does not match its declared raster size.');
    return output;
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

// Normalize a bounded set of strips, not image semantics. The maintained TIFF
// decoder still owns endian sample reads, prediction, and photometric inversion.
function rasterContainer(fields: Map<number, number[]>, strips: Uint8Array<ArrayBuffer>[], little: boolean): ArrayBuffer {
  const entries = [...fields].filter(([tag]) => ![322, 323, 324, 325].includes(tag));
  let size = 8 + 2 + entries.length * 12 + 4;
  for (const [, values] of entries) if (values.length > 1) size += values.length * 4;
  const headerSize = size;
  const offsets: number[] = [];
  for (const strip of strips) { offsets.push(size); size += strip.length; }
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);
  view.setUint16(0, little ? 0x4949 : 0x4d4d);
  view.setUint16(2, 42, little);
  view.setUint32(4, 8, little);
  view.setUint16(8, entries.length, little);
  let extra = 8 + 2 + entries.length * 12 + 4;
  entries.forEach(([tag, original], index) => {
    const values = tag === 273 ? offsets : tag === 279 ? strips.map((strip) => strip.length) : tag === 259 ? [1] : original;
    const at = 10 + index * 12;
    view.setUint16(at, tag, little);
    view.setUint16(at + 2, 4, little);
    view.setUint32(at + 4, values.length, little);
    if (values.length === 1) view.setUint32(at + 8, values[0], little);
    else {
      view.setUint32(at + 8, extra, little);
      values.forEach((value) => { view.setUint32(extra, value, little); extra += 4; });
    }
  });
  let writeAt = headerSize;
  const output = new Uint8Array(buffer);
  for (const strip of strips) { output.set(strip, writeAt); writeAt += strip.length; }
  return buffer;
}

export async function decodeTiffPixels(buffer: ArrayBuffer): Promise<{
  width: number; height: number; bitDepth: number;
  samples: Uint8Array | Uint16Array; rgba: Uint8ClampedArray<ArrayBuffer>; notice: string;
}> {
  const { little, fields, multiplePages } = readRasterDirectory(buffer);
  const scalar = (tag: number, fallback?: number): number => {
    const values = fields.get(tag);
    if (values && values.length !== 1) throw new Error('Unsupported TIFF scalar directory field.');
    return values?.[0] ?? fallback ?? 0;
  };
  const width = scalar(256);
  const height = scalar(257);
  if (width < 1 || height < 1) throw new Error('Invalid TIFF dimensions.');
  if (width > MAX_EDGE || height > MAX_EDGE || width * height > MAX_EDGE ** 2) throw new Error('TIFF dimensions exceed the verified 4096-edge / 16-megapixel import limit.');
  const bits = fields.get(258) ?? [1];
  const bitDepth = bits[0];
  const components = scalar(277, 1);
  const formats = fields.get(339) ?? [1];
  if (![8, 16].includes(bitDepth) || bits.some((bit) => bit !== bitDepth) || ![1, components].includes(bits.length)
    || formats.some((format) => format !== 1) || ![1, components].includes(formats.length)) {
    throw new Error('Unsupported TIFF bit depth/sample format; use uniform unsigned 8-bit or 16-bit samples.');
  }
  const photometric = scalar(262, 1);
  if (![0, 1, 2].includes(photometric)) throw new Error('Unsupported TIFF color model; use grayscale or RGB. ICC transforms are not applied.');
  const base = photometric === 2 ? 3 : 1;
  const extra = fields.get(338) ?? [];
  const alpha = components === base + 1;
  if ((components !== base && !alpha) || (alpha && (extra.length !== 1 || extra[0] !== 2 || photometric === 0)) || (!alpha && extra.length)) {
    throw new Error('Unsupported TIFF alpha/sample layout; use grayscale/RGB with optional unassociated alpha.');
  }
  if (scalar(274, 1) !== 1) throw new Error('Unsupported TIFF orientation; save with top-left orientation before importing.');
  if (scalar(266, 1) !== 1) throw new Error('Unsupported TIFF fill order; save with most-significant-bit-first ordering.');
  if (scalar(284, 1) !== 1 || [322, 323, 324, 325].some((tag) => fields.has(tag))) throw new Error('Unsupported tiled or planar TIFF; use interleaved strips.');
  if (![1, 2].includes(scalar(317, 1))) throw new Error('Unsupported TIFF predictor.');
  const compression = scalar(259, 1);
  if (![1, 8, 32946].includes(compression)) throw new Error('Unsupported TIFF compression; use uncompressed or Deflate TIFF. LZW, PackBits, JPEG and CCITT are not enabled.');
  const rows = scalar(278, height);
  const offsets = fields.get(273) ?? [];
  const counts = fields.get(279) ?? [];
  if (rows < 1 || offsets.length !== Math.ceil(height / rows) || offsets.length !== counts.length) throw new Error('Invalid TIFF strip layout.');
  const strips: Uint8Array<ArrayBuffer>[] = [];
  for (let index = 0; index < offsets.length; index++) {
    const offset = offsets[index];
    const count = counts[index];
    const expected = width * Math.min(rows, height - index * rows) * components * (bitDepth / 8);
    if (count < 1 || offset < 8 || offset + count > buffer.byteLength) throw new Error('Truncated TIFF strip data.');
    const bytes = new Uint8Array(buffer, offset, count);
    if (compression === 1) {
      if (count !== expected) throw new Error('TIFF strip size does not match its declared raster size.');
      strips.push(bytes);
    } else strips.push(await inflateStrip(bytes, expected));
  }
  fields.set(278, [rows]);
  fields.set(258, bits);
  const { decode } = await import('tiff');
  const image = decode(rasterContainer(fields, strips, little), { pages: [0] })[0];
  if (!image || !(image.data instanceof Uint8Array || image.data instanceof Uint16Array)
    || image.data.length !== width * height * components) throw new Error('TIFF decoder returned an invalid raster.');
  const rgba = new Uint8ClampedArray(width * height * 4);
  const scale = bitDepth === 16 ? 255 / 65535 : 1;
  for (let pixel = 0; pixel < width * height; pixel++) {
    const at = pixel * components;
    for (let channel = 0; channel < 3; channel++) rgba[pixel * 4 + channel] = Math.round(image.data[at + (base === 3 ? channel : 0)] * scale);
    rgba[pixel * 4 + 3] = alpha ? Math.round(image.data[at + base] * scale) : 255;
  }
  return {
    width, height, bitDepth, samples: image.data, rgba,
    notice: `${bitDepth}-bit TIFF source preserved; editing and export use an 8-bit raster. ${multiplePages ? 'Only the first page is imported. ' : ''}ICC profile transforms are not applied.`,
  };
}

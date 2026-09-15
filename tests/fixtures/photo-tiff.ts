/** Tiny original, deterministic TIFF 6.0 fixtures; no third-party image data. */
export function makePhotoTiff(options: {
  bits?: number;
  samples?: number[];
  width?: number;
  height?: number;
  photometric?: number;
  components?: number;
  compression?: number;
  encoded?: number[];
  orientation?: number;
  littleEndian?: boolean;
  extraSample?: number;
  nextIfd?: number;
  predictor?: number;
  fillOrder?: number;
} = {}): Uint8Array<ArrayBuffer> {
  const bits = options.bits ?? 8;
  const components = options.components ?? 3;
  const samples = options.samples ?? [255, 0, 0, 0, 255, 0];
  const entries = [
    [256, 4, options.width ?? 2], [257, 4, options.height ?? 1],
    [258, 3, bits], [259, 3, options.compression ?? 1],
    [262, 3, options.photometric ?? 2], [266, 3, options.fillOrder ?? 1], [273, 4, 0],
    [274, 3, options.orientation ?? 1], [277, 3, components],
    [278, 4, options.height ?? 1], [279, 4, 0], [284, 3, 1],
    [317, 3, options.predictor ?? 1], [339, 3, 1],
    ...(options.extraSample === undefined ? [] : [[338, 3, options.extraSample]]),
  ];
  const offset = 8 + 2 + entries.length * 12 + 4;
  const size = options.encoded?.length ?? samples.length * (bits / 8);
  const bytes = new Uint8Array(offset + size);
  const view = new DataView(bytes.buffer);
  const little = options.littleEndian ?? true;
  view.setUint16(0, little ? 0x4949 : 0x4d4d);
  view.setUint16(2, 42, little);
  view.setUint32(4, 8, little);
  view.setUint16(8, entries.length, little);
  entries.forEach(([tag, type, initial], index) => {
    const at = 10 + index * 12;
    const value = tag === 273 ? offset : tag === 279 ? size : initial;
    view.setUint16(at, tag, little);
    view.setUint16(at + 2, type, little);
    view.setUint32(at + 4, 1, little);
    if (type === 3) view.setUint16(at + 8, value, little);
    else view.setUint32(at + 8, value, little);
  });
  view.setUint32(offset - 4, options.nextIfd ?? 0, little);
  if (options.encoded) bytes.set(options.encoded, offset);
  else samples.forEach((value, index) => {
    if (bits === 8) view.setUint8(offset + index, value);
    else if (bits === 16) view.setUint16(offset + index * 2, value, little);
    else view.setFloat32(offset + index * 4, value, little);
  });
  return bytes;
}

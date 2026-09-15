/** Original 32x32 uncompressed Bayer DNG; contains no third-party camera data. */
export function makePhotoDng(options: { width?: number; height?: number; sample?: number; orientation?: number; pixelAspect?: number } = {}): Uint8Array<ArrayBuffer> {
  const width = options.width ?? 32;
  const height = options.height ?? 32;
  const text = [...new TextEncoder().encode('InMo Synthetic Bayer'), 0];
  const entries: [number, number, number[]][] = [
    [254, 4, [0]], [256, 4, [width]], [257, 4, [height]], [258, 3, [16]],
    [259, 3, [1]], [262, 3, [32803]], [273, 4, [0]], [274, 3, [options.orientation ?? 1]],
    [277, 3, [1]], [278, 4, [height]], [279, 4, [2048]], [284, 3, [1]],
    [33421, 3, [2, 2]], [33422, 1, [0, 1, 1, 2]],
    [50706, 1, [1, 4, 0, 0]], [50707, 1, [1, 1, 0, 0]], [50708, 2, text],
    [50710, 1, [0, 1, 2]], [50711, 3, [1]], [50714, 3, [0]], [50717, 4, [4095]],
    [50718, 5, [options.pixelAspect ?? 1, 1, 1, 1]],
    // XYZ -> camera RGB, identity characterization and neutral as-shot WB.
    [50721, 10, [1, 1, 0, 1, 0, 1, 0, 1, 1, 1, 0, 1, 0, 1, 0, 1, 1, 1]],
    [50728, 5, [1, 1, 1, 1, 1, 1]], [50778, 3, [21]],
  ];
  const unit = (type: number) => type === 1 || type === 2 ? 1 : type === 3 ? 2 : 4;
  const count = (type: number, values: number[]) => type === 5 || type === 10 ? values.length / 2 : values.length;
  let cursor = 8 + 2 + entries.length * 12 + 4;
  const extra = entries.map(([, type, values]) => {
    if (unit(type) * values.length <= 4) return 0;
    const offset = cursor; cursor += unit(type) * values.length;
    cursor += cursor % 2;
    return offset;
  });
  const pixelOffset = cursor;
  const bytes = new Uint8Array(pixelOffset + 2048);
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0x4949); view.setUint16(2, 42, true); view.setUint32(4, 8, true);
  view.setUint16(8, entries.length, true);
  entries.forEach(([tag, type, initial], index) => {
    const values = tag === 273 ? [pixelOffset] : initial;
    const at = 10 + index * 12;
    view.setUint16(at, tag, true); view.setUint16(at + 2, type, true);
    view.setUint32(at + 4, count(type, values), true);
    if (extra[index]) view.setUint32(at + 8, extra[index], true);
    const target = extra[index] || at + 8;
    values.forEach((value, component) => {
      const offset = target + component * unit(type);
      if (unit(type) === 1) view.setUint8(offset, value);
      else if (unit(type) === 2) view.setUint16(offset, value, true);
      else if (type === 10) view.setInt32(offset, value, true);
      else view.setUint32(offset, value, true);
    });
  });
  for (let index = 0; index < 1024; index++) view.setUint16(pixelOffset + index * 2, options.sample ?? 1024, true);
  return bytes;
}

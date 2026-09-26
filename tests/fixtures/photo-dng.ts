/** Original 32x32 uncompressed Bayer DNG; contains no third-party camera data. */
export function makePhotoDng(options: { width?: number; height?: number; sample?: number; orientation?: number; pixelAspect?: number; patterned?: boolean; thumbnail?: boolean; thumbnailWidth?: number; thumbnailJpeg?: Uint8Array } = {}): Uint8Array<ArrayBuffer> {
  const width = options.width ?? 32;
  const height = options.height ?? 32;
  const text = [...new TextEncoder().encode('InMo Synthetic Bayer'), 0];
  const entries: [number, number, number[]][] = [
    [254, 4, [0]], [256, 4, [width]], [257, 4, [height]], [258, 3, [16]],
    [259, 3, [1]], [262, 3, [32803]], [273, 4, [0]], [274, 3, [options.orientation ?? 1]],
    [277, 3, [1]], [278, 4, [height]], [279, 4, [2048]], [284, 3, [1]],
    ...(options.thumbnail ? [[330, 4, [0]] as [number, number, number[]]] : []),
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
  const thumbnailIfd = pixelOffset + 2048;
  const thumbnailEntries: [number, number, number][] = [
    [254, 4, 1], [256, 4, options.thumbnailWidth ?? 16], [257, 4, 8], [258, 3, 8], [259, 3, options.thumbnailJpeg ? 7 : 1],
    [262, 3, options.thumbnailJpeg ? 6 : 2], [273, 4, thumbnailIfd + 132], [277, 3, 3], [278, 4, 8], [279, 4, options.thumbnailJpeg?.length ?? 384],
  ];
  const bytes = new Uint8Array(thumbnailIfd + (options.thumbnail ? 132 + (options.thumbnailJpeg?.length ?? 384) : 0));
  const view = new DataView(bytes.buffer);
  view.setUint16(0, 0x4949); view.setUint16(2, 42, true); view.setUint32(4, 8, true);
  view.setUint16(8, entries.length, true);
  entries.forEach(([tag, type, initial], index) => {
    const values = tag === 273 ? [pixelOffset] : tag === 330 ? [thumbnailIfd] : initial;
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
  for (let index = 0; index < 1024; index++) {
    const sample = options.patterned ? 512 + ((index % 32) % 4 + Math.floor(index / 32) % 4) * 512 : options.sample ?? 1024;
    view.setUint16(pixelOffset + index * 2, sample, true);
  }
  if (options.thumbnail) {
    view.setUint16(thumbnailIfd, thumbnailEntries.length, true);
    thumbnailEntries.forEach(([tag, type, value], index) => {
      const at = thumbnailIfd + 2 + index * 12;
      view.setUint16(at, tag, true); view.setUint16(at + 2, type, true);
      view.setUint32(at + 4, tag === 258 ? 3 : 1, true);
      view.setUint32(at + 8, tag === 258 ? thumbnailIfd + 126 : value, true);
    });
    for (let channel = 0; channel < 3; channel++) view.setUint16(thumbnailIfd + 126 + channel * 2, 8, true);
    if (options.thumbnailJpeg) bytes.set(options.thumbnailJpeg, thumbnailIfd + 132);
    else for (let pixel = 0; pixel < 128; pixel++) bytes.set([230, 40, 90], thumbnailIfd + 132 + pixel * 3);
  }
  return bytes;
}

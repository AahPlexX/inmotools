const HEADER_BYTES = 128;
const TAG_TABLE_BYTES = 4 + 7 * 12;
const XYZ_BYTES = 20;
const CURVE_BYTES = 16;

function ascii(bytes: Uint8Array, offset: number, value: string): void {
  for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
}

function u16(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value, false);
}

function u32(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, false);
}

function fixed(view: DataView, offset: number, value: number): void {
  view.setInt32(offset, Math.round(value * 65_536), false);
}

function writeXyz(bytes: Uint8Array, offset: number, values: readonly [number, number, number]): void {
  const view = new DataView(bytes.buffer);
  ascii(bytes, offset, 'XYZ ');
  fixed(view, offset + 8, values[0]);
  fixed(view, offset + 12, values[1]);
  fixed(view, offset + 16, values[2]);
}

/** Builds a small project-authored ICC v2 matrix/shaper RGB fixture. */
export function photoSrgbProfileBytes(): Uint8Array {
  const dataOffset = HEADER_BYTES + TAG_TABLE_BYTES;
  const whiteOffset = dataOffset;
  const redOffset = whiteOffset + XYZ_BYTES;
  const greenOffset = redOffset + XYZ_BYTES;
  const blueOffset = greenOffset + XYZ_BYTES;
  const curveOffset = blueOffset + XYZ_BYTES;
  const profileBytes = curveOffset + CURVE_BYTES;
  const bytes = new Uint8Array(profileBytes);
  const view = new DataView(bytes.buffer);

  u32(view, 0, profileBytes);
  ascii(bytes, 4, 'lcms');
  u32(view, 8, 0x02100000);
  ascii(bytes, 12, 'mntr');
  ascii(bytes, 16, 'RGB ');
  ascii(bytes, 20, 'XYZ ');
  [2026, 9, 17, 0, 0, 0].forEach((value, index) => u16(view, 24 + index * 2, value));
  ascii(bytes, 36, 'acsp');
  ascii(bytes, 40, '*nix');
  ascii(bytes, 48, 'TEST');
  ascii(bytes, 52, 'RGB ');
  u32(view, 64, 1);
  fixed(view, 68, 0.9642);
  fixed(view, 72, 1);
  fixed(view, 76, 0.8249);
  ascii(bytes, 80, 'IMTL');

  const tags: Array<[string, number, number]> = [
    ['wtpt', whiteOffset, XYZ_BYTES],
    ['rXYZ', redOffset, XYZ_BYTES],
    ['gXYZ', greenOffset, XYZ_BYTES],
    ['bXYZ', blueOffset, XYZ_BYTES],
    ['rTRC', curveOffset, 14],
    ['gTRC', curveOffset, 14],
    ['bTRC', curveOffset, 14],
  ];
  u32(view, HEADER_BYTES, tags.length);
  tags.forEach(([signature, offset, length], index) => {
    const entry = HEADER_BYTES + 4 + index * 12;
    ascii(bytes, entry, signature);
    u32(view, entry + 4, offset);
    u32(view, entry + 8, length);
  });

  writeXyz(bytes, whiteOffset, [0.9642, 1, 0.8249]);
  writeXyz(bytes, redOffset, [0.4360747, 0.2225045, 0.0139322]);
  writeXyz(bytes, greenOffset, [0.3850649, 0.7168786, 0.0971045]);
  writeXyz(bytes, blueOffset, [0.1430804, 0.0606169, 0.7141733]);
  ascii(bytes, curveOffset, 'curv');
  u32(view, curveOffset + 8, 1);
  u16(view, curveOffset + 12, Math.round(2.2 * 256));
  return bytes;
}

export function photoSrgbProfileFile(): File {
  return new File([photoSrgbProfileBytes()], 'Photo Studio Test RGB.icc', { type: 'application/vnd.iccprofile' });
}

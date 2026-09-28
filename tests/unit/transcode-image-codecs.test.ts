import { describe, expect, it } from 'vitest';
import { encodeAnimatedWebp, encodeBmp, encodeIcns, encodeIco, scaleToFit, type RgbaImage } from '../../src/tools/transcode/image-codecs';

const solidImage = (width: number, height: number, rgba: [number, number, number, number]): RgbaImage => {
  const data = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = rgba[0];
    data[i * 4 + 1] = rgba[1];
    data[i * 4 + 2] = rgba[2];
    data[i * 4 + 3] = rgba[3];
  }
  return { width, height, data };
};

// Minimal 1x1 red PNG for container tests.
const PNG_1X1 = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
  0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xcf, 0xc0, 0x00,
  0x00, 0x00, 0x03, 0x00, 0x01, 0x5e, 0xf3, 0x2b, 0x6b, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

describe('BMP writer', () => {
  it('writes a valid 24-bit BMP with row padding', () => {
    const bmp = encodeBmp(solidImage(3, 2, [255, 0, 0, 255]));
    const view = new DataView(bmp.buffer);
    expect(String.fromCharCode(bmp[0], bmp[1])).toBe('BM');
    expect(view.getInt32(18, true)).toBe(3);
    expect(view.getInt32(22, true)).toBe(2);
    expect(view.getUint16(28, true)).toBe(24);
    // Row stride padded to 4 bytes: 3px * 3 = 9 -> 12.
    expect(view.getUint32(34, true)).toBe(12 * 2);
    // Bottom-up first stored row should be blue channel first (red pixel).
    expect(Array.from(bmp.slice(54, 57))).toEqual([0, 0, 255]);
  });

  it('flattens transparency onto the background color', () => {
    const bmp = encodeBmp(solidImage(1, 1, [0, 0, 0, 0]), [255, 255, 255]);
    expect(Array.from(bmp.slice(54, 57))).toEqual([255, 255, 255]);
  });
});

describe('ICO container', () => {
  it('packs PNG frames with a correct directory', () => {
    const ico = encodeIco([
      { size: 16, png: PNG_1X1 },
      { size: 256, png: PNG_1X1 },
    ]);
    const view = new DataView(ico.buffer);
    expect(view.getUint16(2, true)).toBe(1); // icon type
    expect(view.getUint16(4, true)).toBe(2); // count
    expect(ico[6]).toBe(16);
    expect(ico[7]).toBe(16);
    expect(ico[22]).toBe(0); // 256 encoded as 0
    const firstOffset = view.getUint32(6 + 12, true);
    expect(firstOffset).toBe(6 + 32);
    // Payload bytes are present at the declared offset.
    expect(Array.from(ico.slice(firstOffset, firstOffset + 8))).toEqual(Array.from(PNG_1X1.slice(0, 8)));
  });
});

describe('ICNS container', () => {
  it('packs PNG payloads behind icns magic and big-endian lengths', () => {
    const icns = encodeIcns(new Map([[128, PNG_1X1], [256, PNG_1X1]]));
    const view = new DataView(icns.buffer);
    expect(String.fromCharCode(...icns.slice(0, 4))).toBe('icns');
    expect(view.getUint32(4, false)).toBe(icns.length);
    expect(String.fromCharCode(...icns.slice(8, 12))).toBe('ic07');
    expect(view.getUint32(12, false)).toBe(8 + PNG_1X1.length);
  });

  it('rejects empty inputs', () => {
    expect(() => encodeIcns(new Map())).toThrow(/no icon sizes/i);
  });
});

describe('animated WebP builder', () => {
  // RIFF/WEBP wrapper around a fake VP8L chunk.
  const fakeStill = (): Uint8Array => {
    const payload = Uint8Array.from([0x2f, 0x00, 0x00, 0x00]);
    const out = new Uint8Array(12 + 8 + payload.length);
    out.set([0x52, 0x49, 0x46, 0x46], 0);
    new DataView(out.buffer).setUint32(4, 4 + 8 + payload.length, true);
    out.set([0x57, 0x45, 0x42, 0x50], 8);
    out.set([0x56, 0x50, 0x38, 0x4c], 12);
    new DataView(out.buffer).setUint32(16, payload.length, true);
    out.set(payload, 20);
    return out;
  };

  it('emits VP8X + ANIM + one ANMF per frame', () => {
    const webp = encodeAnimatedWebp([
      { webp: fakeStill(), delayMs: 100 },
      { webp: fakeStill(), delayMs: 200 },
    ], 2, 2);
    expect(String.fromCharCode(...webp.slice(0, 4))).toBe('RIFF');
    expect(String.fromCharCode(...webp.slice(8, 12))).toBe('WEBP');
    expect(String.fromCharCode(...webp.slice(12, 16))).toBe('VP8X');
    expect(webp[20] & 0x02).toBe(0x02); // animation flag
    expect(String.fromCharCode(...webp.slice(30, 34))).toBe('ANIM');
    const anmfCount = (webp.join(',') .split(',').length > 0)
      ? (() => { let count = 0; for (let i = 12; i + 4 <= webp.length; i += 1) if (webp[i] === 0x41 && webp[i + 1] === 0x4e && webp[i + 2] === 0x4d && webp[i + 3] === 0x46) count += 1; return count; })()
      : 0;
    expect(anmfCount).toBe(2);
  });

  it('rejects non-WebP frame payloads', () => {
    expect(() => encodeAnimatedWebp([{ webp: new Uint8Array(8), delayMs: 10 }], 1, 1)).toThrow(/not a webp/i);
  });
});

describe('scale helper', () => {
  it('fits images into square targets preserving aspect ratio', () => {
    expect(scaleToFit(solidImage(200, 100, [0, 0, 0, 255]), 64)).toEqual({ width: 64, height: 32 });
    expect(scaleToFit(solidImage(10, 10, [0, 0, 0, 255]), 256)).toEqual({ width: 256, height: 256 });
  });
});

describe('TIFF encoder', () => {
  it('round-trips RGBA through utif2 encode/decode', async () => {
    const { encodeTiff } = await import('../../src/tools/transcode/images-engine');
    const { decodeTiffPages } = await import('../../src/tools/transcode/images-engine');
    const image = solidImage(4, 3, [200, 60, 30, 255]);
    const tiff = await encodeTiff(image);
    // Valid TIFF magic: little-endian (II) or big-endian (MM).
    expect([[0x49, 0x49], [0x4d, 0x4d]]).toContainEqual([tiff[0], tiff[1]]);
    const pages = await decodeTiffPages(tiff);
    expect(pages).toHaveLength(1);
    expect(pages[0].width).toBe(4);
    expect(pages[0].height).toBe(3);
    expect(Array.from(pages[0].data.slice(0, 4))).toEqual([200, 60, 30, 255]);
  });
});

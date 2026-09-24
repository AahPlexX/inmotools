import { deflateSync } from 'node:zlib';

/** Minimal PNG (RGBA8, no interlace) encoder for browser-test fixtures, so tests can generate
 * scenes with known content instead of committing binary images. */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), Buffer.from(data)]);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

export function encodePng(width: number, height: number, rgba: Uint8Array): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter: none
    Buffer.from(rgba.buffer, rgba.byteOffset + y * width * 4, width * 4).copy(raw, y * (width * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

/** Deterministic textured scene with gradients, blocks, and fine surface detail, shifted by
 * (dx, dy) pixels and scaled in brightness by `exposure` — enough structure for registration. */
export function texturedScenePng(width: number, height: number, options: { dx?: number; dy?: number; exposure?: number; seed?: number } = {}): Buffer {
  const { dx = 0, dy = 0, exposure = 1, seed = 17 } = options;
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = x - dx; const sy = y - dy;
      let hash = (Math.floor(sx / 2) * 73856093) ^ (Math.floor(sy / 2) * 19349663) ^ seed;
      hash = Math.imul(hash ^ (hash >>> 13), 1274126177);
      const grain = (((hash ^ (hash >>> 16)) >>> 0) / 4294967295);
      const block = ((Math.floor(sx / 23) * 7 + Math.floor(sy / 17) * 13 + seed) % 5) / 5;
      const base = [0.15 + 0.5 * (sx / width), 0.15 + 0.5 * (sy / height), 0.25 + 0.5 * block];
      const o = (y * width + x) * 4;
      for (let c = 0; c < 3; c += 1) rgba[o + c] = Math.round(255 * Math.min(1, base[c] * (0.8 + 0.4 * grain) * exposure));
      rgba[o + 3] = 255;
    }
  }
  return encodePng(width, height, rgba);
}

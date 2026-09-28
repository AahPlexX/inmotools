// Pure binary image container codecs: BMP writer, ICO container, ICNS
// container, and an animated WebP (RIFF) builder. No DOM required, fully
// unit-testable.

export interface RgbaImage {
  width: number;
  height: number;
  /** Row-major RGBA, 4 bytes per pixel. */
  data: Uint8Array;
}

// ---------------------------------------------------------------------------
// BMP writer (24-bit, bottom-up, BI_RGB)
// ---------------------------------------------------------------------------

export function encodeBmp(image: RgbaImage, background: [number, number, number] = [255, 255, 255]): Uint8Array {
  const { width, height, data } = image;
  const rowBytes = width * 3;
  const padded = Math.ceil(rowBytes / 4) * 4;
  const pixelBytes = padded * height;
  const out = new Uint8Array(54 + pixelBytes);
  const view = new DataView(out.buffer);

  out[0] = 0x42; out[1] = 0x4d; // 'BM'
  view.setUint32(2, 54 + pixelBytes, true);
  view.setUint32(10, 54, true);
  view.setUint32(14, 40, true); // BITMAPINFOHEADER
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // positive = bottom-up
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, 24, true); // bpp
  view.setUint32(30, 0, true); // BI_RGB
  view.setUint32(34, pixelBytes, true);
  view.setInt32(38, 2835, true); // ~72 DPI
  view.setInt32(42, 2835, true);

  const [bgR, bgG, bgB] = background;
  let offset = 54;
  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < width; x += 1) {
      const src = (y * width + x) * 4;
      const alpha = data[src + 3] / 255;
      out[offset] = Math.round(data[src + 2] * alpha + bgB * (1 - alpha));
      out[offset + 1] = Math.round(data[src + 1] * alpha + bgG * (1 - alpha));
      out[offset + 2] = Math.round(data[src] * alpha + bgR * (1 - alpha));
      offset += 3;
    }
    offset += padded - rowBytes;
  }
  return out;
}

// ---------------------------------------------------------------------------
// ICO container (PNG-compressed frames; Vista+ readers and all modern OSes)
// ---------------------------------------------------------------------------

export function encodeIco(frames: Array<{ size: number; png: Uint8Array }>): Uint8Array {
  const count = frames.length;
  const headerSize = 6 + count * 16;
  const total = headerSize + frames.reduce((sum, frame) => sum + frame.png.length, 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, count, true);

  let dataOffset = headerSize;
  frames.forEach((frame, index) => {
    const entry = 6 + index * 16;
    out[entry] = frame.size >= 256 ? 0 : frame.size;
    out[entry + 1] = frame.size >= 256 ? 0 : frame.size;
    out[entry + 2] = 0; // palette
    out[entry + 3] = 0; // reserved
    view.setUint16(entry + 4, 1, true); // planes
    view.setUint16(entry + 6, 32, true); // bpp
    view.setUint32(entry + 8, frame.png.length, true);
    view.setUint32(entry + 12, dataOffset, true);
    out.set(frame.png, dataOffset);
    dataOffset += frame.png.length;
  });
  return out;
}

// ---------------------------------------------------------------------------
// ICNS container (PNG-encoded icon types)
// ---------------------------------------------------------------------------

const ICNS_TYPES: Array<{ ostype: string; px: number }> = [
  { ostype: 'ic11', px: 32 },   // 16@2x
  { ostype: 'ic12', px: 64 },   // 32@2x
  { ostype: 'ic07', px: 128 },
  { ostype: 'ic13', px: 256 },  // 128@2x
  { ostype: 'ic08', px: 256 },
  { ostype: 'ic14', px: 512 },  // 256@2x
  { ostype: 'ic09', px: 512 },
];

export function encodeIcns(pngBySize: Map<number, Uint8Array>): Uint8Array {
  const entries = ICNS_TYPES.filter((type) => pngBySize.has(type.px));
  if (entries.length === 0) throw new Error('No icon sizes available for ICNS packaging.');
  const seen = new Set<string>();
  const unique = entries.filter((entry) => (seen.has(entry.ostype) ? false : (seen.add(entry.ostype), true)));
  const bodySize = unique.reduce((sum, entry) => sum + 8 + (pngBySize.get(entry.px)?.length ?? 0), 0);
  const total = 8 + bodySize;
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  out.set([0x69, 0x63, 0x6e, 0x73], 0); // 'icns'
  view.setUint32(4, total, false);
  let offset = 8;
  for (const entry of unique) {
    const png = pngBySize.get(entry.px)!;
    for (let i = 0; i < 4; i += 1) out[offset + i] = entry.ostype.charCodeAt(i);
    view.setUint32(offset + 4, 8 + png.length, false);
    out.set(png, offset + 8);
    offset += 8 + png.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Animated WebP builder: wraps still WebP VP8/VP8L payloads in an animated
// RIFF container (VP8X + ANIM + ANMF frames).
// ---------------------------------------------------------------------------

function extractVp8Chunk(stillWebp: Uint8Array): { fourcc: string; payload: Uint8Array } {
  const tag = (offset: number) => String.fromCharCode(stillWebp[offset], stillWebp[offset + 1], stillWebp[offset + 2], stillWebp[offset + 3]);
  if (tag(0) !== 'RIFF' || tag(8) !== 'WEBP') throw new Error('Not a WebP image.');
  let offset = 12;
  while (offset + 8 <= stillWebp.length) {
    const fourcc = tag(offset);
    const size = stillWebp[offset + 4] | (stillWebp[offset + 5] << 8) | (stillWebp[offset + 6] << 16) | (stillWebp[offset + 7] << 24);
    if (fourcc === 'VP8 ' || fourcc === 'VP8L') {
      return { fourcc, payload: stillWebp.subarray(offset + 8, offset + 8 + size) };
    }
    offset += 8 + size + (size % 2);
  }
  throw new Error('No VP8 frame chunk found in the WebP image.');
}

export interface WebpAnimationFrame {
  /** Still WebP encoding of the frame at full canvas size. */
  webp: Uint8Array;
  delayMs: number;
}

export function encodeAnimatedWebp(frames: WebpAnimationFrame[], width: number, height: number, loopCount = 0): Uint8Array {
  if (frames.length === 0) throw new Error('No frames supplied.');
  const chunks: Uint8Array[] = [];
  const pushChunk = (fourcc: string, payload: Uint8Array) => {
    const header = new Uint8Array(8 + payload.length + (payload.length % 2));
    for (let i = 0; i < 4; i += 1) header[i] = fourcc.charCodeAt(i);
    new DataView(header.buffer).setUint32(4, payload.length, true);
    header.set(payload, 8);
    chunks.push(header);
  };

  // VP8X extended header with the animation flag.
  const vp8x = new Uint8Array(10);
  vp8x[0] = 0x02; // animation flag
  new DataView(vp8x.buffer).setUint32(4, width - 1, true);
  // width occupies 24 bits at offset 4, height 24 bits at offset 7
  vp8x[4] = (width - 1) & 0xff; vp8x[5] = ((width - 1) >> 8) & 0xff; vp8x[6] = ((width - 1) >> 16) & 0xff;
  vp8x[7] = (height - 1) & 0xff; vp8x[8] = ((height - 1) >> 8) & 0xff; vp8x[9] = ((height - 1) >> 16) & 0xff;
  pushChunk('VP8X', vp8x);

  // ANIM chunk: background color (4 bytes) + loop count (2 bytes).
  const anim = new Uint8Array(6);
  new DataView(anim.buffer).setUint16(4, loopCount, true);
  pushChunk('ANIM', anim);

  for (const frame of frames) {
    const { fourcc, payload } = extractVp8Chunk(frame.webp);
    const anmf = new Uint8Array(16 + 8 + payload.length + (payload.length % 2));
    const view = new DataView(anmf.buffer);
    // Frame rectangle: left/top are 24-bit values in units of 2 pixels.
    anmf[0] = 0; anmf[1] = 0; anmf[2] = 0;
    anmf[3] = 0; anmf[4] = 0; anmf[5] = 0;
    anmf[6] = (width - 1) & 0xff; anmf[7] = ((width - 1) >> 8) & 0xff; anmf[8] = ((width - 1) >> 16) & 0xff;
    anmf[9] = (height - 1) & 0xff; anmf[10] = ((height - 1) >> 8) & 0xff; anmf[11] = ((height - 1) >> 16) & 0xff;
    const duration = Math.max(0, Math.round(frame.delayMs));
    anmf[12] = duration & 0xff; anmf[13] = (duration >> 8) & 0xff; anmf[14] = (duration >> 16) & 0xff;
    anmf[15] = 0x00; // dispose to background, blend mode 0
    for (let i = 0; i < 4; i += 1) anmf[16 + i] = fourcc.charCodeAt(i);
    view.setUint32(20, payload.length, true);
    anmf.set(payload, 24);
    pushChunk('ANMF', anmf);
  }

  const bodySize = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(12 + bodySize);
  out.set([0x52, 0x49, 0x46, 0x46], 0);
  new DataView(out.buffer).setUint32(4, 4 + bodySize, true);
  out.set([0x57, 0x45, 0x42, 0x50], 8);
  let offset = 12;
  for (const chunk of chunks) { out.set(chunk, offset); offset += chunk.length; }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function scaleToFit(image: RgbaImage, size: number): { width: number; height: number } {
  const ratio = Math.min(size / image.width, size / image.height);
  return { width: Math.max(1, Math.round(image.width * ratio)), height: Math.max(1, Math.round(image.height * ratio)) };
}

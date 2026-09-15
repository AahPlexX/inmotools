// Browser image pipeline for the Transcode Workstation (F09-F14).
// Decode any browser-supported raster format to RGBA, re-encode to the target
// format, and handle animated GIF/APNG/WebP plus multi-page TIFF and SVG
// rasterization.

import { encodeAnimatedWebp, encodeBmp, encodeIcns, encodeIco, type RgbaImage, type WebpAnimationFrame } from './image-codecs';

export interface ImageInfo {
  width: number;
  height: number;
}

export interface FrameInfo {
  image: RgbaImage;
  delayMs: number;
}

export function mimeForBytes(bytes: Uint8Array, fallback: string): string {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  if (bytes.length >= 12 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  if (bytes.length >= 4 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'image/gif';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
  return fallback;
}

export async function decodeToRgba(bytes: Uint8Array, mime: string): Promise<RgbaImage> {
  const blob = new Blob([bytes.slice().buffer as ArrayBuffer], { type: mime });
  const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
    context.drawImage(bitmap, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    return { width: canvas.width, height: canvas.height, data: new Uint8Array(imageData.data.buffer) };
  } finally {
    bitmap.close();
  }
}

// ImageData requires an ArrayBuffer-backed Uint8ClampedArray; copy to guarantee
// that regardless of how the source bytes were produced.
function toImageData(image: RgbaImage): ImageData {
  const clamped = new Uint8ClampedArray(image.data.length);
  clamped.set(image.data);
  return new ImageData(clamped, image.width, image.height);
}

export function resizeRgba(image: RgbaImage, width: number, height: number): RgbaImage {
  if (width === image.width && height === image.height) return image;
  const source = toImageData(image);
  const sourceCanvas = document.createElement('canvas');
  sourceCanvas.width = image.width;
  sourceCanvas.height = image.height;
  const sourceContext = sourceCanvas.getContext('2d');
  if (!sourceContext) throw new Error('Canvas rendering is unavailable.');
  sourceContext.putImageData(source, 0, 0);
  const target = document.createElement('canvas');
  target.width = width;
  target.height = height;
  const targetContext = target.getContext('2d', { willReadFrequently: true });
  if (!targetContext) throw new Error('Canvas rendering is unavailable.');
  targetContext.imageSmoothingEnabled = true;
  targetContext.imageSmoothingQuality = 'high';
  targetContext.drawImage(sourceCanvas, 0, 0, width, height);
  const resized = targetContext.getImageData(0, 0, width, height);
  return { width, height, data: new Uint8Array(resized.data.buffer) };
}

export function canEncodeMime(mime: string): boolean {
  if (typeof document === 'undefined') return false;
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  try {
    const dataUrl = canvas.toDataURL(mime);
    return dataUrl.startsWith(`data:${mime}`);
  } catch {
    return false;
  }
}

export async function encodeRgba(image: RgbaImage, mime: string, quality?: number, background: [number, number, number] = [255, 255, 255]): Promise<Uint8Array> {
  if (mime === 'image/bmp') return encodeBmp(image, background);
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering is unavailable.');
  if (mime === 'image/jpeg') {
    context.fillStyle = `rgb(${background[0]}, ${background[1]}, ${background[2]})`;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.putImageData(toImageData(image), 0, 0);
  if (!canEncodeMime(mime)) throw new Error(`This browser cannot encode ${mime} output. Choose another target format.`);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Image encoding failed.'))), mime, quality);
  });
  return new Uint8Array(await blob.arrayBuffer());
}

// ---------------------------------------------------------------------------
// Icons (F12)
// ---------------------------------------------------------------------------

const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const ICNS_SIZES = [32, 64, 128, 256, 512];

export async function buildIco(image: RgbaImage): Promise<Uint8Array> {
  const frames: Array<{ size: number; png: Uint8Array }> = [];
  for (const size of ICO_SIZES) {
    if (size > Math.max(image.width, image.height) * 4) continue;
    const frame = resizeRgba(image, size, size);
    frames.push({ size, png: await encodeRgba(frame, 'image/png') });
  }
  if (frames.length === 0) throw new Error('Image is too small to build an icon.');
  return encodeIco(frames);
}

export async function buildIcns(image: RgbaImage): Promise<Uint8Array> {
  const pngBySize = new Map<number, Uint8Array>();
  for (const size of ICNS_SIZES) {
    if (size > Math.max(image.width, image.height) * 4) continue;
    pngBySize.set(size, await encodeRgba(resizeRgba(image, size, size), 'image/png'));
  }
  return encodeIcns(pngBySize);
}

// ---------------------------------------------------------------------------
// Animated GIF decoding (gifuct-js) with disposal compositing
// ---------------------------------------------------------------------------

export async function decodeGifFrames(bytes: Uint8Array): Promise<{ frames: FrameInfo[]; width: number; height: number }> {
  const { parseGIF } = await import('gifuct-js');
  const gif = parseGIF(bytes.slice().buffer as ArrayBuffer);
  const { decompressFrames } = await import('gifuct-js');
  const parsed = decompressFrames(gif, true);
  if (parsed.length === 0) throw new Error('The GIF contains no frames.');
  const width = gif.lsd.width;
  const height = gif.lsd.height;
  const base = document.createElement('canvas');
  base.width = width;
  base.height = height;
  const context = base.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Canvas rendering is unavailable.');
  const previous = document.createElement('canvas');
  previous.width = width;
  previous.height = height;
  const previousContext = previous.getContext('2d', { willReadFrequently: true })!;

  const frames: FrameInfo[] = [];
  for (const frame of parsed) {
    const patch = context.createImageData(frame.dims.width, frame.dims.height);
    patch.data.set(new Uint8ClampedArray(frame.patch));
    if (frame.disposalType === 2) previousContext.clearRect(0, 0, width, height);
    if (frame.disposalType === 3) {
      previousContext.clearRect(0, 0, width, height);
      previousContext.drawImage(base, 0, 0);
    }
    context.putImageData(patch, frame.dims.left, frame.dims.top);
    const snapshot = context.getImageData(0, 0, width, height);
    frames.push({
      image: { width, height, data: new Uint8Array(snapshot.data.buffer) },
      delayMs: Math.max(20, (frame.delay ?? 10) * 10),
    });
    if (frame.disposalType === 2) {
      context.clearRect(frame.dims.left, frame.dims.top, frame.dims.width, frame.dims.height);
    }
  }
  return { frames, width, height };
}

export async function decodeApngFrames(bytes: Uint8Array): Promise<{ frames: FrameInfo[]; width: number; height: number }> {
  const UPNG = (await import('upng-js')).default as unknown as {
    decode: (buffer: ArrayBuffer) => { width: number; height: number; frames?: Array<{ delay: number }>; data: ArrayBuffer };
    toRGBA8: (img: { width: number; height: number; frames?: unknown[]; data: ArrayBuffer }) => ArrayBuffer[];
  };
  const img = UPNG.decode(bytes.slice().buffer as ArrayBuffer);
  const buffers = UPNG.toRGBA8(img);
  const count = buffers.length;
  const frames: FrameInfo[] = [];
  for (let index = 0; index < count; index += 1) {
    const frameBuffer = new Uint8Array(buffers[index]);
    const delay = img.frames?.[index]?.delay ?? 100;
    frames.push({ image: { width: img.width, height: img.height, data: frameBuffer }, delayMs: Math.max(20, delay) });
  }
  return { frames, width: img.width, height: img.height };
}

// ---------------------------------------------------------------------------
// Animation encoders
// ---------------------------------------------------------------------------

export async function encodeGifAnimation(frames: FrameInfo[], width: number, height: number): Promise<Uint8Array> {
  const { GIFEncoder, quantize, applyPalette } = await import('gifenc');
  const gif = GIFEncoder();
  for (const frame of frames) {
    const resized = frame.image.width === width && frame.image.height === height ? frame.image : resizeRgba(frame.image, width, height);
    const palette = quantize(resized.data, 256);
    const index = applyPalette(resized.data, palette);
    gif.writeFrame(index, width, height, { palette, delay: frame.delayMs });
  }
  gif.finish();
  return new Uint8Array(gif.bytes());
}

export async function encodeApngAnimation(frames: FrameInfo[], width: number, height: number): Promise<Uint8Array> {
  const UPNG = (await import('upng-js')).default as unknown as {
    encode: (imgs: ArrayBuffer[], width: number, height: number, cnum: number, dels: number[]) => ArrayBuffer;
  };
  const imgs = frames.map((frame) => {
    const resized = frame.image.width === width && frame.image.height === height ? frame.image : resizeRgba(frame.image, width, height);
    return resized.data.buffer.slice(resized.data.byteOffset, resized.data.byteOffset + resized.data.length) as ArrayBuffer;
  });
  const dels = frames.map((frame) => frame.delayMs);
  return new Uint8Array(UPNG.encode(imgs, width, height, 0, dels));
}

export async function encodeWebpAnimation(frames: FrameInfo[], width: number, height: number): Promise<Uint8Array> {
  if (!canEncodeMime('image/webp')) throw new Error('This browser cannot encode WebP output.');
  const stills: WebpAnimationFrame[] = [];
  for (const frame of frames) {
    const resized = frame.image.width === width && frame.image.height === height ? frame.image : resizeRgba(frame.image, width, height);
    stills.push({ webp: await encodeRgba(resized, 'image/webp', 0.88), delayMs: frame.delayMs });
  }
  return encodeAnimatedWebp(stills, width, height, 0);
}

export async function encodeSpriteSheet(frames: FrameInfo[]): Promise<Uint8Array> {
  if (frames.length === 0) throw new Error('No frames available.');
  const width = frames[0].image.width;
  const height = frames[0].image.height;
  const columns = Math.ceil(Math.sqrt(frames.length));
  const rows = Math.ceil(frames.length / columns);
  const canvas = document.createElement('canvas');
  canvas.width = columns * width;
  canvas.height = rows * height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering is unavailable.');
  frames.forEach((frame, index) => {
    const x = (index % columns) * width;
    const y = Math.floor(index / columns) * height;
    const frameCanvas = document.createElement('canvas');
    frameCanvas.width = frame.image.width;
    frameCanvas.height = frame.image.height;
    frameCanvas.getContext('2d')!.putImageData(toImageData(frame.image), 0, 0);
    context.drawImage(frameCanvas, x, y);
  });
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('Sprite encoding failed.'))), 'image/png');
  });
  return new Uint8Array(await blob.arrayBuffer());
}

// ---------------------------------------------------------------------------
// TIFF (F13)
// ---------------------------------------------------------------------------

export async function decodeTiffPages(bytes: Uint8Array): Promise<RgbaImage[]> {
  const UTIF = (await import('utif2')).default as unknown as {
    decode: (buffer: ArrayBuffer) => unknown[];
    decodeImage: (buffer: ArrayBuffer, ifd: unknown) => void;
    toRGBA8: (ifd: unknown) => Uint8Array;
  };
  const buffer = bytes.slice().buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const ifds = UTIF.decode(buffer) as Array<{ width?: number; height?: number }>;
  const pages: RgbaImage[] = [];
  for (const ifd of ifds) {
    UTIF.decodeImage(buffer, ifd);
    if (!ifd.width || !ifd.height) continue;
    const rgba = UTIF.toRGBA8(ifd);
    pages.push({ width: ifd.width, height: ifd.height, data: rgba.slice() });
  }
  if (pages.length === 0) throw new Error('No decodable pages found in the TIFF file.');
  return pages;
}

// ---------------------------------------------------------------------------
// SVG rasterization (F10)
// ---------------------------------------------------------------------------

export interface SvgRasterOptions {
  width?: number;
  height?: number;
  scale?: number;
  background?: string;
}

function svgIntrinsicSize(text: string): { width: number; height: number } {
  const widthMatch = /\bwidth\s*=\s*"([\d.]+)(px)?"/.exec(text);
  const heightMatch = /\bheight\s*=\s*"([\d.]+)(px)?"/.exec(text);
  const viewBoxMatch = /\bviewBox\s*=\s*"([\d.\s-]+)"/.exec(text);
  if (widthMatch && heightMatch) {
    return { width: Number.parseFloat(widthMatch[1]), height: Number.parseFloat(heightMatch[1]) };
  }
  if (viewBoxMatch) {
    const parts = viewBoxMatch[1].trim().split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts.every((part) => Number.isFinite(part))) {
      return { width: parts[2], height: parts[3] };
    }
  }
  return { width: 512, height: 512 };
}

export async function rasterizeSvg(text: string, mime: string, options: SvgRasterOptions, quality?: number): Promise<Uint8Array> {
  const intrinsic = svgIntrinsicSize(text);
  const scale = options.scale ?? 1;
  const width = Math.max(1, Math.round(options.width ?? intrinsic.width * scale));
  const height = Math.max(1, Math.round(options.height ?? intrinsic.height * scale));
  const blob = new Blob([text], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('The SVG could not be rendered. External resources inside SVG are not loaded.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas rendering is unavailable.');
    if (mime === 'image/jpeg') {
      context.fillStyle = options.background ?? '#ffffff';
      context.fillRect(0, 0, width, height);
    } else if (options.background) {
      context.fillStyle = options.background;
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0, width, height);
    if (!canEncodeMime(mime)) throw new Error(`This browser cannot encode ${mime} output.`);
    const out = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => (value ? resolve(value) : reject(new Error('SVG rasterization failed.'))), mime, quality);
    });
    return new Uint8Array(await out.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}

// ---------------------------------------------------------------------------
// Raster -> SVG tracing (F11)
// ---------------------------------------------------------------------------

export interface TraceOptions {
  colors: number;
  detail: number; // 0..10, higher = more detail
  pathOmit: number;
}

export async function traceToSvg(image: RgbaImage, options: TraceOptions, title: string): Promise<string> {
  const imagetracer = await import('imagetracerjs');
  const tracer = (imagetracer.default ?? imagetracer) as unknown as {
    imagedataToSVG: (data: ImageData, preset: Record<string, unknown>) => string;
  };
  const imageData = toImageData(image);
  const detail = Math.min(10, Math.max(0, options.detail));
  const svg = tracer.imagedataToSVG(imageData, {
    numberofcolors: Math.min(256, Math.max(2, options.colors)),
    ltres: 1 + (10 - detail) * 0.4,
    qtres: 1 + (10 - detail) * 0.4,
    pathomit: Math.max(0, options.pathOmit),
    roundcoords: 2,
    viewbox: true,
    desc: false,
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<!-- Traced from ${title} -->\n${svg}`;
}

// ---------------------------------------------------------------------------
// Image -> PDF (single page)
// ---------------------------------------------------------------------------

export async function imageToPdf(bytes: Uint8Array, mime: string): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const embeddable = mime === 'image/jpeg' ? bytes : await reencodeForPdf(bytes, mime);
  const image = mime === 'image/jpeg'
    ? await doc.embedJpg(embeddable)
    : await doc.embedPng(embeddable);
  const scale = Math.min(1, 560 / image.width, 740 / image.height);
  const page = doc.addPage([image.width * scale + 80, image.height * scale + 80]);
  page.drawImage(image, { x: 40, y: 40, width: image.width * scale, height: image.height * scale });
  return new Uint8Array(await doc.save());
}

async function reencodeForPdf(bytes: Uint8Array, mime: string): Promise<Uint8Array> {
  const image = await decodeToRgba(bytes, mime);
  return encodeRgba(image, 'image/png');
}

export type { RgbaImage };

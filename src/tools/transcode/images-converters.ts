// Registry wiring for images, icons & animation (F09-F14).

import { zipSync } from 'fflate';
import { FORMATS, type FormatId } from './formats';
import {
  buildIcns, buildIco, decodeApngFrames, decodeGifFrames, decodeTiffPages, decodeToRgba, encodeApngAnimation,
  encodeGifAnimation, encodeRgba, encodeSpriteSheet, encodeTiff, encodeWebpAnimation, imageToPdf,
  rasterizeSvg, traceToSvg,
} from './images-engine';
import { bytesToBase64, toDataUri } from './text-codecs';
import { hasImageMetadata, writeJpegMetadata, writePngMetadata, type ImageMetadata } from './metadata-engine';
import { baseName, bytesArtifact, registerConverter, swapExtension, textArtifact, type ConversionOptions } from './transcode-engine';

function imageMetadataFrom(options: ConversionOptions): ImageMetadata {
  return {
    title: typeof options.title === 'string' ? options.title : undefined,
    artist: typeof options.artist === 'string' ? options.artist : undefined,
    description: typeof options.description === 'string' ? options.description : undefined,
    copyright: typeof options.copyright === 'string' ? options.copyright : undefined,
    software: typeof options.software === 'string' ? options.software : undefined,
    creationTime: typeof options.creationTime === 'string' ? options.creationTime : undefined,
    xmp: options.xmp === true || options.xmp === 'true',
    stripExisting: options.stripMeta === true || options.stripMeta === 'true',
  };
}

/** Attach EXIF/tEXt metadata at export when the user supplied any. */
async function applyImageMetadata(bytes: Uint8Array, targetId: string, options: ConversionOptions): Promise<Uint8Array> {
  const meta = imageMetadataFrom(options);
  if (!hasImageMetadata(meta)) return bytes;
  if (targetId === 'png') return writePngMetadata(bytes, meta);
  if (targetId === 'jpeg') return writeJpegMetadata(bytes, meta);
  return bytes;
}

const RASTER_SOURCES: FormatId[] = ['png', 'jpeg', 'webp', 'avif', 'bmp'];
const RASTER_TARGETS: Array<{ id: FormatId; mime: string; extension: string; qualityControlled: boolean }> = [
  { id: 'png', mime: 'image/png', extension: 'png', qualityControlled: false },
  { id: 'jpeg', mime: 'image/jpeg', extension: 'jpg', qualityControlled: true },
  { id: 'webp', mime: 'image/webp', extension: 'webp', qualityControlled: true },
  { id: 'avif', mime: 'image/avif', extension: 'avif', qualityControlled: true },
  { id: 'bmp', mime: 'image/bmp', extension: 'bmp', qualityControlled: false },
];

const qualityFrom = (options: ConversionOptions): number => {
  const raw = Number(options.quality ?? 85);
  if (!Number.isFinite(raw)) return 0.85;
  return Math.min(100, Math.max(1, raw)) / 100;
};

async function framesZip(frames: Array<{ png: Uint8Array; delayMs: number }>, sourceName: string) {
  const entries: Record<string, Uint8Array> = {};
  frames.forEach((frame, index) => {
    entries[`frame-${String(index + 1).padStart(3, '0')}.png`] = frame.png;
  });
  entries['frames.json'] = new TextEncoder().encode(JSON.stringify({
    source: sourceName,
    frameCount: frames.length,
    delaysMs: frames.map((frame) => frame.delayMs),
  }, null, 2));
  return new Uint8Array(zipSync(entries, { level: 6 }));
}

export function registerImageConverters(): void {
  // --- Raster-to-raster matrix (F09) ----------------------------------------
  for (const source of RASTER_SOURCES) {
    for (const target of RASTER_TARGETS) {
      if (source === target.id) continue;
      registerConverter(source, target.id, `Convert ${FORMATS[source].label} to ${FORMATS[target.id].label}`, async (input, options) => {
        const image = await decodeToRgba(input.bytes, FORMATS[source].mime);
        let bytes = await encodeRgba(image, target.mime, target.qualityControlled ? qualityFrom(options) : undefined);
        bytes = await applyImageMetadata(bytes, target.id, options);
        return [bytesArtifact(swapExtension(input.fileName, target.extension), bytes, target.mime)];
      });
    }
    registerConverter(source, 'ico', 'Build a multi-resolution Windows .ico', async (input) => {
      const image = await decodeToRgba(input.bytes, FORMATS[source].mime);
      return [bytesArtifact(swapExtension(input.fileName, 'ico'), await buildIco(image), 'image/x-icon')];
    });
    registerConverter(source, 'icns', 'Build an Apple .icns icon package', async (input) => {
      const image = await decodeToRgba(input.bytes, FORMATS[source].mime);
      return [bytesArtifact(swapExtension(input.fileName, 'icns'), await buildIcns(image), 'image/icns')];
    });
    registerConverter(source, 'base64', 'Encode the image as Base64 text', async (input) => {
      return [textArtifact(`${baseName(input.fileName)}.b64.txt`, bytesToBase64(input.bytes), 'text/plain;charset=utf-8')];
    });
    registerConverter(source, 'data-uri', 'Encode the image as a data: URI', async (input) => {
      return [textArtifact(`${baseName(input.fileName)}.uri.txt`, toDataUri(input.bytes, FORMATS[source].mime), 'text/plain;charset=utf-8')];
    });
  }

  // Raster -> single-page PDF.
  for (const source of ['png', 'jpeg', 'webp', 'bmp', 'avif'] as FormatId[]) {
    registerConverter(source, 'pdf', 'Place the image on a PDF page', async (input) => {
      return [bytesArtifact(swapExtension(input.fileName, 'pdf'), await imageToPdf(input.bytes, FORMATS[source].mime), 'application/pdf')];
    });
  }

  // PNG -> multi-tag TIFF (F13 reverse).
  registerConverter('png', 'tiff', 'Encode the image as a TIFF file', async (input) => {
    const image = await decodeToRgba(input.bytes, 'image/png');
    return [bytesArtifact(swapExtension(input.fileName, 'tiff'), await encodeTiff(image), 'image/tiff')];
  });

  // WebP -> GIF (palette-quantized still frame).
  registerConverter('webp', 'gif', 'Convert WebP to a palette GIF', async (input) => {
    const image = await decodeToRgba(input.bytes, 'image/webp');
    const bytes = await encodeGifAnimation(
      [{ image, delayMs: 0 }],
      image.width,
      image.height,
    );
    return [bytesArtifact(swapExtension(input.fileName, 'gif'), bytes, 'image/gif')];
  });

  // --- PNG tracing (F11) -----------------------------------------------------
  registerConverter('png', 'svg', 'Trace the bitmap into SVG vector paths', async (input, options) => {
    const image = await decodeToRgba(input.bytes, 'image/png');
    const svg = await traceToSvg(image, {
      colors: Number(options.colors ?? 8) || 8,
      detail: Number(options.detail ?? 5),
      pathOmit: Number(options.pathOmit ?? 8),
    }, input.fileName);
    return [textArtifact(swapExtension(input.fileName, 'svg'), svg, 'image/svg+xml')];
  });

  // --- TIFF (F13) --------------------------------------------------------------
  for (const target of ['png', 'jpeg', 'webp'] as FormatId[]) {
    registerConverter('tiff', target, `Convert the first TIFF page to ${FORMATS[target].label}`, async (input, options) => {
      const pages = await decodeTiffPages(input.bytes);
      const entry = RASTER_TARGETS.find((candidate) => candidate.id === target)!;
      const bytes = await encodeRgba(pages[0], entry.mime, entry.qualityControlled ? qualityFrom(options) : undefined);
      return [bytesArtifact(swapExtension(input.fileName, entry.extension), bytes, entry.mime)];
    });
  }
  registerConverter('tiff', 'frames-zip', 'Export every TIFF page as PNG in a ZIP', async (input) => {
    const pages = await decodeTiffPages(input.bytes);
    const frames: Array<{ png: Uint8Array; delayMs: number }> = [];
    for (const page of pages) frames.push({ png: await encodeRgba(page, 'image/png'), delayMs: 0 });
    return [bytesArtifact(`${baseName(input.fileName)}.pages.zip`, await framesZip(frames, input.fileName), 'application/zip')];
  });

  // --- SVG rasterization (F10) ---------------------------------------------------
  for (const target of RASTER_TARGETS.filter((entry) => entry.id !== 'bmp')) {
    registerConverter('svg', target.id, `Render SVG to ${FORMATS[target.id].label}`, async (input, options) => {
      const bytes = await rasterizeSvg(input.text(), target.mime, {
        width: Number(options.width) > 0 ? Number(options.width) : undefined,
        height: Number(options.height) > 0 ? Number(options.height) : undefined,
        scale: Number(options.scale) > 0 ? Number(options.scale) : undefined,
        background: typeof options.background === 'string' ? (options.background as string) : undefined,
      }, target.qualityControlled ? qualityFrom(options) : undefined);
      return [bytesArtifact(swapExtension(input.fileName, target.extension), bytes, target.mime)];
    });
  }
  registerConverter('svg', 'ico', 'Render SVG into a multi-resolution .ico', async (input) => {
    const png = await rasterizeSvg(input.text(), 'image/png', { width: 256, height: 256 });
    const image = await decodeToRgba(png, 'image/png');
    return [bytesArtifact(swapExtension(input.fileName, 'ico'), await buildIco(image), 'image/x-icon')];
  });
  registerConverter('svg', 'pdf', 'Render SVG onto a PDF page', async (input) => {
    const png = await rasterizeSvg(input.text(), 'image/png', { scale: 2 });
    return [bytesArtifact(swapExtension(input.fileName, 'pdf'), await imageToPdf(png, 'image/png'), 'application/pdf')];
  });
  registerConverter('svg', 'base64', 'Encode the SVG text as Base64', async (input) => {
    return [textArtifact(`${baseName(input.fileName)}.b64.txt`, bytesToBase64(new TextEncoder().encode(input.text())), 'text/plain;charset=utf-8')];
  });
  registerConverter('svg', 'data-uri', 'Encode the SVG as a data: URI', async (input) => {
    return [textArtifact(`${baseName(input.fileName)}.uri.txt`, toDataUri(new TextEncoder().encode(input.text()), 'image/svg+xml'), 'text/plain;charset=utf-8')];
  });

  // --- Animated GIF / APNG / WebP (F14) ---------------------------------------------
  registerConverter('gif', 'apng', 'Convert animated GIF to APNG', async (input) => {
    const { frames, width, height } = await decodeGifFrames(input.bytes);
    return [bytesArtifact(swapExtension(input.fileName, 'apng.png'), await encodeApngAnimation(frames, width, height), 'image/apng')];
  });
  registerConverter('gif', 'webp', 'Convert animated GIF to animated WebP', async (input) => {
    const { frames, width, height } = await decodeGifFrames(input.bytes);
    return [bytesArtifact(swapExtension(input.fileName, 'webp'), await encodeWebpAnimation(frames, width, height), 'image/webp')];
  });
  registerConverter('gif', 'sprite-png', 'Compose GIF frames into a sprite sheet', async (input) => {
    const { frames } = await decodeGifFrames(input.bytes);
    return [bytesArtifact(swapExtension(input.fileName, 'sprite.png'), await encodeSpriteSheet(frames), 'image/png')];
  });
  registerConverter('gif', 'frames-zip', 'Split GIF frames into a ZIP archive', async (input) => {
    const { frames } = await decodeGifFrames(input.bytes);
    const packed: Array<{ png: Uint8Array; delayMs: number }> = [];
    for (const frame of frames) packed.push({ png: await encodeRgba(frame.image, 'image/png'), delayMs: frame.delayMs });
    return [bytesArtifact(`${baseName(input.fileName)}.frames.zip`, await framesZip(packed, input.fileName), 'application/zip')];
  });

  registerConverter('apng', 'gif', 'Convert APNG to animated GIF', async (input) => {
    const { frames, width, height } = await decodeApngFrames(input.bytes);
    return [bytesArtifact(swapExtension(input.fileName, 'gif'), await encodeGifAnimation(frames, width, height), 'image/gif')];
  });
  registerConverter('apng', 'webp', 'Convert APNG to animated WebP', async (input) => {
    const { frames, width, height } = await decodeApngFrames(input.bytes);
    return [bytesArtifact(swapExtension(input.fileName, 'webp'), await encodeWebpAnimation(frames, width, height), 'image/webp')];
  });
  registerConverter('apng', 'frames-zip', 'Split APNG frames into a ZIP archive', async (input) => {
    const { frames } = await decodeApngFrames(input.bytes);
    const packed: Array<{ png: Uint8Array; delayMs: number }> = [];
    for (const frame of frames) packed.push({ png: await encodeRgba(frame.image, 'image/png'), delayMs: frame.delayMs });
    return [bytesArtifact(`${baseName(input.fileName)}.frames.zip`, await framesZip(packed, input.fileName), 'application/zip')];
  });

  // Animated webp input is detected as plain webp; still-frame decode is
  // handled by the raster converters above.
}

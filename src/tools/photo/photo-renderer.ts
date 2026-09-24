import { normalizeRecipe, sampleHistogram, type PhotoLayerPixels } from './photo-engine';
import { warpPhotoGeometryPixels } from './photo-geometry';
import { warpPhotoMeshLiquifyPixels } from './photo-warp';
import { preparePhotoRaster } from './photo-import';
import { normalizeResamplingKernel, resamplePixels, type PhotoResamplingKernel } from './photo-resample';
import { encodePhotoTiff, hasTransparency } from './photo-tiff-writer';
import { avifEncodingAvailable, encodePhotoAvif } from './codecs/avif-encoder';
import { TEXT_LAYER_PADDING } from './photo-layers';
import type {
  PhotoCapabilities,
  PhotoHistogram,
  PhotoOutputMime,
  PhotoRecipe,
} from './photo-types';

const PREVIEW_MAX_EDGE = 1600;
const VERIFIED_SAFE_EDGE = 4096;
const VERIFIED_SAFE_AREA = 4096 * 4096;
const ABSOLUTE_ATTEMPT_EDGE = 8192;
const ABSOLUTE_ATTEMPT_AREA = 40_000_000;

export interface PhotoRenderRequest {
  file: Blob;
  recipe: PhotoRecipe;
  revision: number;
  mode?: 'preview' | 'export';
  outputMime?: PhotoOutputMime;
  quality?: number;
  requestedWidth?: number;
  requestedHeight?: number;
  maxPreviewEdge?: number;
  jpegBackground?: string;
  /** Final-resize kernel for exports; previews always use the browser scaler for speed. */
  resampling?: PhotoResamplingKernel;
  /** AVIF only: encode losslessly instead of at `quality`. */
  lossless?: boolean;
}

export interface PhotoRenderResult {
  revision: number;
  blob: Blob;
  width: number;
  height: number;
  sourceWidth: number;
  sourceHeight: number;
  scaledForSafety: boolean;
  histogram: PhotoHistogram;
  outputMime: string;
  proofBaseBlob?: Blob;
  gamutWarningPixels: number;
  /** Kernel actually used for the final resize (`browser` when no resize was needed or the
   * unscaled frame exceeded safe canvas limits). */
  resampling: PhotoResamplingKernel;
}

interface LayerBufferPayload {
  layerId: string;
  buffer: ArrayBuffer;
  width: number;
  height: number;
}

interface RenderWorkerResponse {
  revision: number;
  type: 'processed' | 'error';
  width: number;
  height: number;
  buffer?: ArrayBuffer;
  proofBaseBuffer?: ArrayBuffer;
  gamutWarningPixels?: number;
  message?: string;
}

interface ProcessedPixelBuffers {
  pixels: Uint8ClampedArray;
  proofBasePixels?: Uint8ClampedArray;
  gamutWarningPixels: number;
}

interface PendingWorkerRequest {
  resolve: (result: ProcessedPixelBuffers) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let workerBroken = false;
let nextWorkerRequestId = 0;
// Keyed by an internally generated id (not the caller-supplied revision), since
// multiple callers (preview + export) each keep their own independent revision
// counters and could otherwise collide on the same key.
const pendingWorkerRequests = new Map<number, PendingWorkerRequest>();

export function normalizeQuarterTurns(value: number): number {
  const rounded = Math.round(Number.isFinite(value) ? value : 0);
  return ((rounded % 4) + 4) % 4;
}

export function isRenderResultCurrent(activeRevision: number, result: Pick<PhotoRenderResult, 'revision'>): boolean {
  return activeRevision === result.revision;
}

export function fitDimensionsWithinLimits(
  width: number,
  height: number,
  maxEdge: number,
  maxArea: number,
): { width: number; height: number; scaled: boolean } {
  const safeWidth = Math.max(1, Math.round(Number.isFinite(width) ? width : 1));
  const safeHeight = Math.max(1, Math.round(Number.isFinite(height) ? height : 1));
  const edgeLimit = Math.max(1, Number.isFinite(maxEdge) ? maxEdge : VERIFIED_SAFE_EDGE);
  const areaLimit = Math.max(1, Number.isFinite(maxArea) ? maxArea : VERIFIED_SAFE_AREA);
  const edgeScale = Math.min(1, edgeLimit / Math.max(safeWidth, safeHeight));
  const areaScale = Math.min(1, Math.sqrt(areaLimit / (safeWidth * safeHeight)));
  const scale = Math.min(edgeScale, areaScale);
  if (scale >= 1) return { width: safeWidth, height: safeHeight, scaled: false };

  let nextWidth = Math.max(1, Math.floor(safeWidth * scale));
  let nextHeight = Math.max(1, Math.floor(safeHeight * scale));
  while (nextWidth * nextHeight > areaLimit) {
    if (nextWidth >= nextHeight) nextWidth -= 1;
    else nextHeight -= 1;
  }
  return { width: nextWidth, height: nextHeight, scaled: true };
}

function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined') throw new Error('Canvas rendering is unavailable in this environment.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function getContext2d(canvas: HTMLCanvasElement | OffscreenCanvas): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext('2d', { alpha: true, willReadFrequently: true });
  if (!context) throw new Error('2D canvas rendering is unavailable in this browser.');
  return context as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
}

/** Decodes one layer's self-contained data URL to raw pixels for compositing. A layer with no
 * image yet (still being added) or an image this browser cannot decode is skipped rather than
 * failing the whole render, matching how the engine already treats an undecoded layer as a
 * no-op. */
async function decodeImageLayerPixels(layer: { id: string; sourceDataUrl: string }): Promise<LayerBufferPayload | null> {
  if (!layer.sourceDataUrl) return null;
  try {
    const blob = await (await fetch(layer.sourceDataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    try {
      const canvas = createCanvas(bitmap.width, bitmap.height);
      const context = getContext2d(canvas);
      context.drawImage(bitmap, 0, 0);
      const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height);
      return { layerId: layer.id, buffer: imageData.data.buffer as ArrayBuffer, width: bitmap.width, height: bitmap.height };
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

const SHAPE_LAYER_SIZE = 400;

/** Renders a text layer to an offscreen canvas at its natural size (canvas dimensions become the
 * layer's own pixel-buffer size, which compositeOneLayer then scales/positions like any image
 * layer). An empty string renders nothing rather than failing the layer. */
function renderTextLayerPixels(layer: { id: string; text?: string; textColor?: string; fontSize?: number }): LayerBufferPayload | null {
  const text = layer.text?.trim();
  if (!text) return null;
  const fontSize = Math.max(8, layer.fontSize ?? 48);
  const measuringCanvas = createCanvas(1, 1);
  const measuringContext = getContext2d(measuringCanvas);
  measuringContext.font = `${fontSize}px sans-serif`;
  const metrics = measuringContext.measureText(text);
  const width = Math.max(1, Math.ceil(metrics.width) + TEXT_LAYER_PADDING * 2);
  const height = Math.max(1, Math.ceil(fontSize * 1.4) + TEXT_LAYER_PADDING);
  const canvas = createCanvas(width, height);
  const context = getContext2d(canvas);
  context.clearRect(0, 0, width, height);
  context.font = `${fontSize}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = layer.textColor ?? '#ffffff';
  context.fillText(text, width / 2, height / 2);
  const imageData = context.getImageData(0, 0, width, height);
  return { layerId: layer.id, buffer: imageData.data.buffer as ArrayBuffer, width, height };
}

/** Renders a shape layer (rectangle/ellipse/line) to a fixed-size offscreen canvas; transform.scale
 * on the layer is what a user then resizes it with, matching text and image layers. */
function renderShapeLayerPixels(layer: { id: string; shapeKind?: string; shapeColor?: string; shapeStrokeWidth?: number; shapeFilled?: boolean }): LayerBufferPayload | null {
  const size = SHAPE_LAYER_SIZE;
  const canvas = createCanvas(size, size);
  const context = getContext2d(canvas);
  context.clearRect(0, 0, size, size);
  const color = layer.shapeColor ?? '#ffffff';
  const strokeWidth = Math.max(0, layer.shapeStrokeWidth ?? 0.02) * size;
  const filled = layer.shapeFilled ?? true;
  const inset = Math.max(strokeWidth / 2, 4);
  context.fillStyle = color;
  context.strokeStyle = color;
  context.lineWidth = Math.max(1, strokeWidth);
  if (layer.shapeKind === 'ellipse') {
    context.beginPath();
    context.ellipse(size / 2, size / 2, size / 2 - inset, size / 2 - inset, 0, 0, Math.PI * 2);
    if (filled) context.fill(); else context.stroke();
  } else if (layer.shapeKind === 'line') {
    context.beginPath();
    context.moveTo(inset, size / 2);
    context.lineTo(size - inset, size / 2);
    context.stroke();
  } else {
    if (filled) context.fillRect(inset, inset, size - inset * 2, size - inset * 2);
    else context.strokeRect(inset, inset, size - inset * 2, size - inset * 2);
  }
  const imageData = context.getImageData(0, 0, size, size);
  return { layerId: layer.id, buffer: imageData.data.buffer as ArrayBuffer, width: size, height: size };
}

interface RenderableLayer {
  id: string;
  role: string;
  sourceDataUrl: string;
  text?: string;
  textColor?: string;
  fontSize?: number;
  shapeKind?: string;
  shapeColor?: string;
  shapeStrokeWidth?: number;
  shapeFilled?: boolean;
}

/** Produces a pixel buffer for any layer role that composites as pixels ('image', 'text', 'shape').
 * An 'adjustment' layer has no pixel buffer of its own — the engine applies it directly to the
 * pixels beneath it — so it resolves to null here and is skipped by the caller. */
async function decodeLayerPixels(layer: RenderableLayer): Promise<LayerBufferPayload | null> {
  if (layer.role === 'text') return renderTextLayerPixels(layer);
  if (layer.role === 'shape') return renderShapeLayerPixels(layer);
  if (layer.role === 'adjustment') return null;
  return decodeImageLayerPixels(layer);
}

async function canvasToBlob(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  mime: PhotoOutputMime,
  quality: number,
): Promise<Blob> {
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    return canvas.convertToBlob({ type: mime, quality: mime === 'image/png' ? undefined : quality });
  }
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('The browser could not encode this image.')),
      mime,
      mime === 'image/png' ? undefined : quality,
    );
  });
}

async function mimeIsSupported(mime: PhotoOutputMime): Promise<boolean> {
  try {
    const canvas = createCanvas(2, 2);
    const context = getContext2d(canvas);
    context.fillStyle = '#7f5fff';
    context.fillRect(0, 0, 2, 2);
    const blob = await canvasToBlob(canvas, mime, 0.85);
    return blob.type === mime;
  } catch {
    return false;
  }
}

function canvasCanRender(width: number, height: number): boolean {
  if (width < 1 || height < 1) return false;
  if (width > ABSOLUTE_ATTEMPT_EDGE || height > ABSOLUTE_ATTEMPT_EDGE || width * height > ABSOLUTE_ATTEMPT_AREA) {
    return false;
  }
  try {
    const canvas = createCanvas(width, height);
    const context = getContext2d(canvas);
    context.clearRect(0, 0, 1, 1);
    context.fillStyle = '#010203';
    context.fillRect(width - 1, height - 1, 1, 1);
    const pixel = context.getImageData(width - 1, height - 1, 1, 1).data;
    if ('width' in canvas) {
      canvas.width = 1;
      canvas.height = 1;
    }
    return pixel[0] === 1 && pixel[1] === 2 && pixel[2] === 3;
  } catch {
    return false;
  }
}

export async function probePhotoCapabilities(): Promise<PhotoCapabilities> {
  const [jpeg, png, webp] = await Promise.all([
    mimeIsSupported('image/jpeg'),
    mimeIsSupported('image/png'),
    mimeIsSupported('image/webp'),
  ]);
  return {
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    imageBitmap: typeof createImageBitmap === 'function',
    jpeg,
    png,
    webp,
    tiff: true,
    avif: avifEncodingAvailable(),
    maxCanvasEdge: VERIFIED_SAFE_EDGE,
    maxCanvasArea: VERIFIED_SAFE_AREA,
  };
}

function ensureWorker(): Worker | null {
  if (workerBroken || typeof Worker === 'undefined') return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL('./photo.worker.ts', import.meta.url), { type: 'module' });
    worker.addEventListener('message', (event: MessageEvent<RenderWorkerResponse>) => {
      const message = event.data;
      const pending = pendingWorkerRequests.get(message.revision);
      if (!pending) return;
      pendingWorkerRequests.delete(message.revision);
      if (message.type === 'error' || !message.buffer) {
        pending.reject(new Error(message.message || 'Photo render worker failed.'));
        return;
      }
      pending.resolve({
        pixels: new Uint8ClampedArray(message.buffer),
        proofBasePixels: message.proofBaseBuffer ? new Uint8ClampedArray(message.proofBaseBuffer) : undefined,
        gamutWarningPixels: message.gamutWarningPixels ?? 0,
      });
    });
    worker.addEventListener('error', () => {
      // Intentionally permanent: once broken, fall back to main-thread processing
      // for the rest of the session rather than risking a crash-loop retry.
      workerBroken = true;
      for (const pending of pendingWorkerRequests.values()) pending.reject(new Error('Photo render worker failed.'));
      pendingWorkerRequests.clear();
      worker?.terminate();
      worker = null;
    });
    return worker;
  } catch {
    workerBroken = true;
    return null;
  }
}

async function processPixels(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  recipe: PhotoRecipe,
  mode: 'preview' | 'export',
  jpegBackground?: readonly [number, number, number],
  layerPixels: PhotoLayerPixels[] = [],
): Promise<ProcessedPixelBuffers> {
  const activeWorker = ensureWorker();
  if (!activeWorker) {
    const { processPhotoColorPipeline } = await import('./color/photo-color-pipeline');
    return processPhotoColorPipeline(pixels, width, height, recipe, mode, jpegBackground, layerPixels);
  }

  const requestId = nextWorkerRequestId++;
  const transferable = new Uint8ClampedArray(pixels);
  // Copies, not the caller's own buffers, so layerPixels stays valid for the main-thread
  // fallback below if the worker attempt fails after these have already been transferred away.
  const transferableLayers: LayerBufferPayload[] = layerPixels.map((entry) => ({
    layerId: entry.layerId,
    buffer: new Uint8ClampedArray(entry.data).buffer as ArrayBuffer,
    width: entry.width,
    height: entry.height,
  }));
  try {
    const result = await new Promise<ProcessedPixelBuffers>((resolve, reject) => {
      pendingWorkerRequests.set(requestId, { resolve, reject });
      activeWorker.postMessage({
        type: 'process',
        revision: requestId,
        width,
        height,
        buffer: transferable.buffer,
        layers: transferableLayers,
        recipe,
        mode,
        jpegBackground,
      }, [transferable.buffer, ...transferableLayers.map((entry) => entry.buffer)]);
    });
    return result;
  } catch (error) {
    pendingWorkerRequests.delete(requestId);
    const color = recipe.colorManagement;
    const colorManaged = Boolean(color?.assignedProfile
      || (mode === 'export' && color?.outputProfile)
      || (mode === 'preview' && color?.softProof && color.proofProfile));
    if (colorManaged) {
      const message = error instanceof Error ? error.message : 'unknown worker error';
      throw new Error(`Color-managed render failed without a main-thread retry: ${message}`);
    }
    const { processPhotoColorPipeline } = await import('./color/photo-color-pipeline');
    return processPhotoColorPipeline(pixels, width, height, recipe, mode, jpegBackground, layerPixels);
  }
}

function naturalOutputDimensions(
  sourceWidth: number,
  sourceHeight: number,
  recipe: PhotoRecipe,
): { width: number; height: number } {
  const cropWidth = Math.max(1, Math.round(sourceWidth * recipe.crop.width));
  const cropHeight = Math.max(1, Math.round(sourceHeight * recipe.crop.height));
  const quarterTurns = normalizeQuarterTurns(recipe.rotateQuarterTurns);
  return quarterTurns % 2 === 0
    ? { width: cropWidth, height: cropHeight }
    : { width: cropHeight, height: cropWidth };
}

function requestedDimensions(
  naturalWidth: number,
  naturalHeight: number,
  request: PhotoRenderRequest,
): { width: number; height: number } {
  if (request.mode !== 'export') {
    return fitDimensionsWithinLimits(
      naturalWidth,
      naturalHeight,
      Math.max(320, request.maxPreviewEdge ?? PREVIEW_MAX_EDGE),
      (request.maxPreviewEdge ?? PREVIEW_MAX_EDGE) ** 2,
    );
  }

  const requestedWidth = request.requestedWidth && request.requestedWidth > 0
    ? Math.round(request.requestedWidth)
    : naturalWidth;
  const requestedHeight = request.requestedHeight && request.requestedHeight > 0
    ? Math.round(request.requestedHeight)
    : request.requestedWidth
      ? Math.max(1, Math.round(requestedWidth * naturalHeight / naturalWidth))
      : naturalHeight;
  return { width: requestedWidth, height: requestedHeight };
}

function drawGeometry(
  bitmap: ImageBitmap,
  recipe: PhotoRecipe,
  width: number,
  height: number,
): HTMLCanvasElement | OffscreenCanvas {
  const canvas = createCanvas(width, height);
  const context = getContext2d(canvas);
  const sourceX = Math.round(bitmap.width * recipe.crop.x);
  const sourceY = Math.round(bitmap.height * recipe.crop.y);
  const sourceWidth = Math.max(1, Math.round(bitmap.width * recipe.crop.width));
  const sourceHeight = Math.max(1, Math.round(bitmap.height * recipe.crop.height));
  const quarterTurns = normalizeQuarterTurns(recipe.rotateQuarterTurns);
  const quarterAngle = quarterTurns * Math.PI / 2;
  const straightenAngle = recipe.straighten * Math.PI / 180;
  const rotated = quarterTurns % 2 === 1;
  const drawWidth = rotated ? height : width;
  const drawHeight = rotated ? width : height;

  context.save();
  context.translate(width / 2, height / 2);
  context.rotate(quarterAngle + straightenAngle);
  context.scale(recipe.flipX ? -1 : 1, recipe.flipY ? -1 : 1);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    bitmap,
    sourceX,
    sourceY,
    sourceWidth,
    sourceHeight,
    -drawWidth / 2,
    -drawHeight / 2,
    drawWidth,
    drawHeight,
  );
  context.restore();
  return canvas;
}

function resolveJpegBackground(background: string): readonly [number, number, number] {
  const output = createCanvas(1, 1);
  const context = getContext2d(output);
  context.fillStyle = '#ffffff';
  context.fillStyle = background;
  context.fillRect(0, 0, 1, 1);
  const pixel = context.getImageData(0, 0, 1, 1).data;
  return [pixel[0], pixel[1], pixel[2]];
}

export async function renderPhoto(request: PhotoRenderRequest): Promise<PhotoRenderResult> {
  if (typeof createImageBitmap !== 'function') throw new Error('This browser cannot decode images for Photo Studio.');
  const recipe = normalizeRecipe(request.recipe);
  const raster = await preparePhotoRaster(request.file, recipe.raw);
  const bitmap = await createImageBitmap(raster.blob, {
    imageOrientation: 'from-image',
    colorSpaceConversion: recipe.colorManagement?.assignedProfile ? 'none' : 'default',
  });
  try {
    const natural = naturalOutputDimensions(bitmap.width, bitmap.height, recipe);
    const desired = requestedDimensions(natural.width, natural.height, request);
    let target = { ...desired, scaled: false };

    if (!canvasCanRender(target.width, target.height)) {
      target = fitDimensionsWithinLimits(target.width, target.height, VERIFIED_SAFE_EDGE, VERIFIED_SAFE_AREA);
      if (!canvasCanRender(target.width, target.height)) {
        target = fitDimensionsWithinLimits(target.width, target.height, 2048, 2048 * 2048);
      }
    }

    const requestedKernel = request.mode === 'export' ? normalizeResamplingKernel(request.resampling) : 'browser';
    const resizing = target.width !== natural.width || target.height !== natural.height;
    let resampling: PhotoResamplingKernel = 'browser';
    let canvas: HTMLCanvasElement | OffscreenCanvas;
    let imageData: ImageData;
    if (requestedKernel !== 'browser' && resizing && canvasCanRender(natural.width, natural.height)) {
      // Draw crop/rotation at natural size, then resize with the deterministic kernel so the
      // selected filter (not the browser's scaler) determines the final pixels.
      const naturalCanvas = drawGeometry(bitmap, recipe, natural.width, natural.height);
      const naturalPixels = getContext2d(naturalCanvas).getImageData(0, 0, natural.width, natural.height).data;
      const resized = resamplePixels(naturalPixels, natural.width, natural.height, target.width, target.height, requestedKernel);
      canvas = createCanvas(target.width, target.height);
      imageData = new ImageData(resized, target.width, target.height);
      resampling = requestedKernel;
    } else {
      canvas = drawGeometry(bitmap, recipe, target.width, target.height);
      imageData = getContext2d(canvas).getImageData(0, 0, target.width, target.height);
    }
    const context = getContext2d(canvas);
    const lensPerspectivePixels = warpPhotoGeometryPixels(
      imageData.data,
      target.width,
      target.height,
      recipe.lensDistortion,
      recipe.perspectiveHorizontal,
      recipe.perspectiveVertical,
    );
    const geometryPixels = warpPhotoMeshLiquifyPixels(
      lensPerspectivePixels,
      target.width,
      target.height,
      recipe.meshWarp,
      recipe.liquifyStrokes,
    );
    const mime = request.outputMime ?? 'image/png';
    const jpegBackground = request.mode === 'export' && mime === 'image/jpeg'
      ? resolveJpegBackground(request.jpegBackground ?? '#ffffff')
      : undefined;
    const decodedLayers = await Promise.all((recipe.layers ?? []).map(decodeLayerPixels));
    const layerPixels: PhotoLayerPixels[] = decodedLayers
      .filter((entry): entry is LayerBufferPayload => entry !== null)
      .map((entry) => ({ layerId: entry.layerId, data: new Uint8ClampedArray(entry.buffer), width: entry.width, height: entry.height }));
    const processed = await processPixels(
      geometryPixels,
      target.width,
      target.height,
      recipe,
      request.mode === 'export' ? 'export' : 'preview',
      jpegBackground,
      layerPixels,
    );
    const ownedPixels = new Uint8ClampedArray(processed.pixels.length);
    ownedPixels.set(processed.pixels);
    const processedImage = new ImageData(ownedPixels, target.width, target.height);
    context.putImageData(processedImage, 0, 0);
    const histogram = sampleHistogram(ownedPixels);
    let proofBaseBlob: Blob | undefined;
    if (processed.proofBasePixels) {
      const proofCanvas = createCanvas(target.width, target.height);
      const proofContext = getContext2d(proofCanvas);
      const proofOwned = new Uint8ClampedArray(processed.proofBasePixels);
      proofContext.putImageData(new ImageData(proofOwned, target.width, target.height), 0, 0);
      proofBaseBlob = await canvasToBlob(proofCanvas, 'image/png', 1);
    }

    const outputCanvas = canvas;
    const quality = Math.min(1, Math.max(0.01, request.quality ?? 0.92));
    let blob = mime === 'image/tiff'
      ? new Blob([encodePhotoTiff(ownedPixels, target.width, target.height, { alpha: hasTransparency(ownedPixels) }) as Uint8Array<ArrayBuffer>], { type: 'image/tiff' })
      : mime === 'image/avif'
        ? await encodePhotoAvif(ownedPixels, target.width, target.height, { quality, lossless: request.lossless === true })
        : await canvasToBlob(outputCanvas, mime, quality);
    if (blob.type !== mime) {
      if (request.mode === 'export') throw new Error(`${mime} export is not supported by this browser.`);
      blob = await canvasToBlob(outputCanvas, 'image/png', 1);
    }

    return {
      revision: request.revision,
      blob,
      width: target.width,
      height: target.height,
      sourceWidth: bitmap.width,
      sourceHeight: bitmap.height,
      scaledForSafety: target.scaled || target.width !== desired.width || target.height !== desired.height,
      histogram,
      outputMime: blob.type,
      proofBaseBlob,
      gamutWarningPixels: processed.gamutWarningPixels,
      resampling,
    };
  } finally {
    bitmap.close();
  }
}

export function disposePhotoRenderer(): void {
  worker?.terminate();
  worker = null;
  workerBroken = false;
  for (const pending of pendingWorkerRequests.values()) pending.reject(new Error('Photo renderer disposed.'));
  pendingWorkerRequests.clear();
}

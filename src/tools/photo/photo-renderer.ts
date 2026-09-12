import { applyPixelAdjustments, normalizeRecipe, sampleHistogram } from './photo-engine';
import { warpPhotoGeometryPixels } from './photo-geometry';
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
}

interface RenderWorkerResponse {
  revision: number;
  type: 'processed' | 'error';
  width: number;
  height: number;
  buffer?: ArrayBuffer;
  message?: string;
}

interface PendingWorkerRequest {
  resolve: (pixels: Uint8ClampedArray) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let workerBroken = false;
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
      pending.resolve(new Uint8ClampedArray(message.buffer));
    });
    worker.addEventListener('error', () => {
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
  revision: number,
): Promise<Uint8ClampedArray> {
  const activeWorker = ensureWorker();
  if (!activeWorker) {
    applyPixelAdjustments(pixels, width, height, recipe);
    return pixels;
  }

  const transferable = new Uint8ClampedArray(pixels);
  try {
    const result = await new Promise<Uint8ClampedArray>((resolve, reject) => {
      pendingWorkerRequests.set(revision, { resolve, reject });
      activeWorker.postMessage({
        type: 'process',
        revision,
        width,
        height,
        buffer: transferable.buffer,
        recipe,
      }, [transferable.buffer]);
    });
    return result;
  } catch {
    pendingWorkerRequests.delete(revision);
    applyPixelAdjustments(pixels, width, height, recipe);
    return pixels;
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

function fillJpegBackground(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  background: string,
): HTMLCanvasElement | OffscreenCanvas {
  const output = createCanvas(canvas.width, canvas.height);
  const context = getContext2d(output);
  context.fillStyle = background;
  context.fillRect(0, 0, output.width, output.height);
  context.drawImage(canvas, 0, 0);
  return output;
}

export async function renderPhoto(request: PhotoRenderRequest): Promise<PhotoRenderResult> {
  if (typeof createImageBitmap !== 'function') throw new Error('This browser cannot decode images for Photo Studio.');
  const recipe = normalizeRecipe(request.recipe);
  const bitmap = await createImageBitmap(request.file, { imageOrientation: 'from-image' });
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

    const canvas = drawGeometry(bitmap, recipe, target.width, target.height);
    const context = getContext2d(canvas);
    const imageData = context.getImageData(0, 0, target.width, target.height);
    const geometryPixels = warpPhotoGeometryPixels(
      imageData.data,
      target.width,
      target.height,
      recipe.lensDistortion,
      recipe.perspectiveHorizontal,
      recipe.perspectiveVertical,
    );
    const processed = await processPixels(geometryPixels, target.width, target.height, recipe, request.revision);
    const ownedPixels = new Uint8ClampedArray(processed.length);
    ownedPixels.set(processed);
    const processedImage = new ImageData(ownedPixels, target.width, target.height);
    context.putImageData(processedImage, 0, 0);
    const histogram = sampleHistogram(ownedPixels);

    const mime = request.outputMime ?? 'image/png';
    const outputCanvas = mime === 'image/jpeg'
      ? fillJpegBackground(canvas, request.jpegBackground ?? '#ffffff')
      : canvas;
    const quality = Math.min(1, Math.max(0.01, request.quality ?? 0.92));
    let blob = await canvasToBlob(outputCanvas, mime, quality);
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
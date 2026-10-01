export interface PdfViewportSize {
  width: number;
  height: number;
}

export interface PdfCanvasRenderPlan {
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  outputScale: number;
  transform: [number, number, number, number, number, number] | null;
}

export interface PdfCancelableRender {
  cancel(): void;
  promise: Promise<unknown>;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const MAX_OUTPUT_SCALE = 3;

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export function normalizedPdfZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return clamp(value, MIN_ZOOM, MAX_ZOOM);
}

export function canvasRenderPlan(viewport: PdfViewportSize, devicePixelRatio: number): PdfCanvasRenderPlan {
  if (![viewport.width, viewport.height].every(Number.isFinite) || viewport.width <= 0 || viewport.height <= 0) {
    throw new Error('PDF viewport dimensions must be finite positive numbers.');
  }
  const requestedScale = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? devicePixelRatio : 1;
  const outputScale = clamp(requestedScale, 1, MAX_OUTPUT_SCALE);
  const cssWidth = Math.floor(viewport.width);
  const cssHeight = Math.floor(viewport.height);
  return {
    cssWidth,
    cssHeight,
    pixelWidth: Math.floor(viewport.width * outputScale),
    pixelHeight: Math.floor(viewport.height * outputScale),
    outputScale,
    transform: outputScale === 1 ? null : [outputScale, 0, 0, outputScale, 0, 0],
  };
}

export class PdfRenderCoordinator {
  private readonly active = new Map<number, PdfCancelableRender>();
  private destroyed = false;

  replace(pageNumber: number, render: PdfCancelableRender): void {
    if (this.destroyed) {
      render.cancel();
      throw new Error('Cannot register a PDF render after the coordinator has been destroyed.');
    }
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      render.cancel();
      throw new Error('PDF render page numbers must be positive integers.');
    }
    this.active.get(pageNumber)?.cancel();
    this.active.set(pageNumber, render);
  }

  release(pageNumber: number, render?: PdfCancelableRender): void {
    const current = this.active.get(pageNumber);
    if (!current || (render && current !== render)) return;
    this.active.delete(pageNumber);
  }

  cancel(pageNumber: number): void {
    const render = this.active.get(pageNumber);
    if (!render) return;
    this.active.delete(pageNumber);
    render.cancel();
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    const renders = [...this.active.values()];
    this.active.clear();
    for (const render of renders) render.cancel();
    await Promise.allSettled(renders.map((render) => render.promise));
  }
}

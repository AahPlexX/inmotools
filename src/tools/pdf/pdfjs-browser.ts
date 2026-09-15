import {
  GlobalWorkerOptions,
  TextLayer,
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
  type RenderTask,
} from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { canvasRenderPlan, normalizedPdfZoom, PdfRenderCoordinator, type PdfCancelableRender } from './pdf-renderer';

export const PDFJS_WORKER_URL = pdfWorkerUrl;

export interface PdfRenderedPage {
  pageNumber: number;
  cssWidth: number;
  cssHeight: number;
  pixelWidth: number;
  pixelHeight: number;
  outputScale: number;
}

function configurePdfWorker(): void {
  if (!GlobalWorkerOptions.workerPort) GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
}

export function isPdfRenderCancellation(error: unknown): boolean {
  return error instanceof Error && (error.name === 'RenderingCancelledException' || error.name === 'AbortException');
}

export class PdfJsDocumentSession {
  private readonly coordinator = new PdfRenderCoordinator();
  private destroyed = false;

  private constructor(
    private readonly loadingTask: PDFDocumentLoadingTask,
    private readonly document: PDFDocumentProxy,
  ) {}

  static async open(bytes: Uint8Array): Promise<PdfJsDocumentSession> {
    configurePdfWorker();
    const loadingTask = getDocument({ data: bytes.slice() });
    try {
      const document = await loadingTask.promise;
      return new PdfJsDocumentSession(loadingTask, document);
    } catch (error) {
      await loadingTask.destroy();
      throw error;
    }
  }

  get pageCount(): number {
    return this.document.numPages;
  }

  cancelPage(pageNumber: number): void {
    this.coordinator.cancel(pageNumber);
  }

  private assertPageNumber(pageNumber: number): void {
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > this.document.numPages) {
      throw new Error(`PDF page ${pageNumber} is outside this ${this.document.numPages}-page document.`);
    }
  }

  async getPageText(pageNumber: number): Promise<string> {
    if (this.destroyed) throw new Error('Cannot extract text from a destroyed PDF.js session.');
    this.assertPageNumber(pageNumber);
    const page = await this.document.getPage(pageNumber);
    try {
      const content = await page.getTextContent({ includeMarkedContent: true, disableNormalization: false });
      return content.items.flatMap((item) => {
        if (!('str' in item)) return [];
        return [`${item.str}${item.hasEOL ? '\n' : ''}`];
      }).join('');
    } finally {
      page.cleanup();
    }
  }

  async renderPage(
    pageNumber: number,
    canvas: HTMLCanvasElement,
    zoom: number,
    devicePixelRatio = window.devicePixelRatio || 1,
    textLayerContainer?: HTMLElement,
  ): Promise<PdfRenderedPage> {
    if (this.destroyed) throw new Error('Cannot render from a destroyed PDF.js session.');
    this.assertPageNumber(pageNumber);
    const page = await this.document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: normalizedPdfZoom(zoom) });
    const plan = canvasRenderPlan(viewport, devicePixelRatio);
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('This browser could not create a 2D canvas context for PDF rendering.');

    canvas.width = plan.pixelWidth;
    canvas.height = plan.pixelHeight;
    canvas.style.width = `${plan.cssWidth}px`;
    canvas.style.height = `${plan.cssHeight}px`;

    const renderTask: RenderTask = page.render({
      canvas,
      canvasContext: context,
      viewport,
      transform: plan.transform ?? undefined,
      background: '#ffffff',
    });

    let textLayer: TextLayer | null = null;
    let task: PdfCancelableRender = renderTask;
    if (textLayerContainer) {
      textLayerContainer.replaceChildren();
      textLayerContainer.style.setProperty('--total-scale-factor', String(viewport.scale));
      textLayer = new TextLayer({
        textContentSource: page.streamTextContent({ includeMarkedContent: true, disableNormalization: true }),
        images: null,
        container: textLayerContainer,
        viewport,
      });
      const textPromise = textLayer.render();
      task = {
        cancel: () => {
          renderTask.cancel();
          textLayer?.cancel();
        },
        promise: Promise.all([renderTask.promise, textPromise]),
      };
    }

    this.coordinator.replace(pageNumber, task);
    try {
      await task.promise;
    } finally {
      this.coordinator.release(pageNumber, task);
      page.cleanup();
    }

    return {
      pageNumber,
      cssWidth: plan.cssWidth,
      cssHeight: plan.cssHeight,
      pixelWidth: plan.pixelWidth,
      pixelHeight: plan.pixelHeight,
      outputScale: plan.outputScale,
    };
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    await this.coordinator.destroy();
    await this.loadingTask.destroy();
  }
}

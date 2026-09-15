/**
 * Browser-side PDF decoding through pdf.js.
 *
 * This is the only module that touches the DOM and the pdf.js worker. It is
 * imported dynamically so the pdf.js runtime never enters the main bundle, and
 * it is injected into `ingestPdf` as a `PdfTextExtractor`, which keeps the PDF
 * layout reconstruction unit-testable without a browser.
 *
 * The decode path is fully local: the document bytes are handed to the worker
 * as a transferable buffer, and no network request is made. Image-only pages
 * are reported rather than OCR'd.
 */

import type { PdfExtraction, PdfOutlineEntry, PdfPageText, PdfTextExtractor } from './sightline-types';

type PdfJsModule = typeof import('pdfjs-dist');
type PdfDocumentProxy = Awaited<ReturnType<PdfJsModule['getDocument']>['promise']>;

let pdfjsPromise: Promise<PdfJsModule> | null = null;

const loadPdfJs = async (): Promise<PdfJsModule> => {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      const [pdfjs, workerUrl] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
      ]);
      // The worker is emitted as its own asset and fetched on demand, so the
      // heavy pdf.js runtime stays out of the precache and the main bundle.
      pdfjs.GlobalWorkerOptions.workerSrc = (workerUrl as { default: string }).default;
      return pdfjs;
    })();
  }
  return pdfjsPromise;
};

const outlineToEntries = async (
  document: PdfDocumentProxy,
  outline: unknown,
  depth: number,
  output: PdfOutlineEntry[],
): Promise<void> => {
  if (!Array.isArray(outline)) return;
  for (const raw of outline) {
    const node = raw as { title?: string; dest?: unknown; items?: unknown[] };
    const title = typeof node.title === 'string' ? node.title : '';
    let pageNumber: number | null = null;
    if (node.dest) {
      try {
        const resolved = typeof node.dest === 'string'
          ? await document.getDestination(node.dest)
          : node.dest;
        if (Array.isArray(resolved) && resolved[0]) {
          pageNumber = (await document.getPageIndex(resolved[0] as never)) + 1;
        }
      } catch {
        pageNumber = null;
      }
    }
    if (title.length > 0) output.push({ title: title.trim(), pageNumber, depth });
    if (Array.isArray(node.items)) await outlineToEntries(document, node.items, depth + 1, output);
  }
};

export const createPdfJsExtractor = (): PdfTextExtractor => ({
  extract: async (data: Uint8Array<ArrayBufferLike>): Promise<PdfExtraction> => {
    const pdfjs = await loadPdfJs();
    // pdf.js takes ownership of the buffer it is given, so the caller's copy is
    // transferred rather than shared.
    const owned = new Uint8Array(data.byteLength);
    owned.set(data);
    const loadingTask = pdfjs.getDocument({
      data: owned,
      // This tool only reads text, so no font or image machinery is enabled.
      disableFontFace: true,
      useSystemFonts: false,
      disableAutoFetch: true,
    });
    const document = await loadingTask.promise;
    try {
      const pages: PdfPageText[] = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        try {
          const viewport = page.getViewport({ scale: 1 });
          const content = await page.getTextContent();
          const items = content.items
            .map((item) => item as { str?: string; transform?: number[]; width?: number; height?: number; fontName?: string })
            .filter((item) => typeof item.str === 'string' && item.str.length > 0 && Array.isArray(item.transform))
            .map((item) => {
              const transform = item.transform as number[];
              return {
                str: item.str as string,
                x: transform[4] ?? 0,
                y: transform[5] ?? 0,
                width: item.width ?? 0,
                height: item.height ?? Math.abs(transform[3] ?? 0),
                fontName: item.fontName ?? '',
              };
            });
          pages.push({
            pageNumber,
            width: viewport.width,
            height: viewport.height,
            items,
            // `viewport` is already rotated, so the declared angle is kept
            // separately for the page-geometry report.
            rotation: page.rotate,
          });
        } finally {
          page.cleanup();
        }
      }

      const info = await document.getMetadata().catch(() => null);
      const metadata: Record<string, string> = {};
      const infoRecord = info?.info as Record<string, unknown> | undefined;
      if (infoRecord) {
        for (const [key, value] of Object.entries(infoRecord)) {
          if (typeof value === 'string' && value.length > 0) metadata[key] = value;
        }
      }
      if (typeof info?.metadata?.get === 'function') {
        for (const key of ['dc:title', 'dc:creator', 'dc:description', 'dc:subject', 'dc:language', 'xmp:CreatorTool']) {
          try {
            const value = info.metadata.get(key);
            if (typeof value === 'string' && value.length > 0) metadata[key] = value;
          } catch {
            // XMP properties that are absent or malformed are skipped.
          }
        }
      }

      let outlineEntries: PdfOutlineEntry[] = [];
      try {
        const outline = await document.getOutline();
        outlineEntries = [];
        await outlineToEntries(document, outline, 1, outlineEntries);
      } catch {
        outlineEntries = [];
      }

      return { pages, metadata, outline: outlineEntries };
    } finally {
      await loadingTask.destroy();
    }
  },
});

/** True when the browser can run the pdf.js decode path at all. */
export const canDecodePdf = (): boolean =>
  typeof window !== 'undefined'
  && typeof Worker !== 'undefined'
  && typeof WebAssembly !== 'undefined';

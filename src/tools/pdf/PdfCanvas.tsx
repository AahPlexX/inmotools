import { useEffect, useRef, useState } from 'react';
import { normalizedPdfZoom } from './pdf-renderer';
import type { PdfJsDocumentSession, PdfRenderedPage } from './pdfjs-browser';

type Props = {
  file: File;
  pageNumber: number;
  zoom: number;
  onDocumentReady?: (pageCount: number) => void;
};

export default function PdfCanvas({ file, pageNumber, zoom, onDocumentReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sessionRef = useRef<PdfJsDocumentSession | null>(null);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [rendered, setRendered] = useState<PdfRenderedPage | null>(null);
  const [status, setStatus] = useState('Loading PDF renderer…');

  useEffect(() => {
    let disposed = false;
    const previous = sessionRef.current;
    sessionRef.current = null;
    if (previous) void previous.destroy();
    setRendered(null);
    setStatus('Loading PDF renderer…');

    void (async () => {
      try {
        const [{ PdfJsDocumentSession }, bytes] = await Promise.all([
          import('./pdfjs-browser'),
          file.arrayBuffer(),
        ]);
        const session = await PdfJsDocumentSession.open(new Uint8Array(bytes));
        if (disposed) {
          await session.destroy();
          return;
        }
        sessionRef.current = session;
        onDocumentReady?.(session.pageCount);
        setSessionVersion((value) => value + 1);
      } catch (error) {
        if (!disposed) setStatus(`PDF preview could not open: ${error instanceof Error ? error.message : 'unknown error'}`);
      }
    })();

    return () => {
      disposed = true;
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) void session.destroy();
    };
  }, [file, onDocumentReady]);

  useEffect(() => {
    const session = sessionRef.current;
    const canvas = canvasRef.current;
    if (!session || !canvas) return;
    let disposed = false;
    const activePage = pageNumber;
    setRendered(null);
    setStatus(`Rendering page ${activePage}…`);

    void session.renderPage(activePage, canvas, normalizedPdfZoom(zoom)).then((result) => {
      if (disposed) return;
      setRendered(result);
      setStatus(`Rendered page ${result.pageNumber} at ${Math.round(normalizedPdfZoom(zoom) * 100)}%.`);
    }).catch(async (error: unknown) => {
      const { isPdfRenderCancellation } = await import('./pdfjs-browser');
      if (!disposed && !isPdfRenderCancellation(error)) {
        setStatus(`PDF preview failed: ${error instanceof Error ? error.message : 'unknown render error'}`);
      }
    });

    return () => {
      disposed = true;
      session.cancelPage(activePage);
    };
  }, [pageNumber, sessionVersion, zoom]);

  return <div>
    <div
      style={{
        maxWidth: '100%',
        overflow: 'auto',
        border: '1px solid var(--border, #d8dde8)',
        borderRadius: 10,
        padding: 8,
        background: '#eef1f5',
      }}
      data-testid="pdf-canvas-scroller"
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Rendered preview of ${file.name} page ${pageNumber}`}
        data-testid="pdf-render-canvas"
        data-rendered-page={rendered?.pageNumber ?? ''}
        data-output-scale={rendered?.outputScale ?? ''}
        style={{ display: 'block', margin: '0 auto', background: '#fff' }}
      />
    </div>
    <p className="help-text" role="status" data-testid="pdf-render-status">{status}</p>
  </div>;
}

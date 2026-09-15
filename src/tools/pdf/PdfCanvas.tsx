import { useEffect, useRef, useState } from 'react';
import { normalizedPdfZoom } from './pdf-renderer';
import { findPdfTextMatches, type PdfTextMatch } from './pdf-text-search';
import type { PdfJsDocumentSession, PdfRenderedPage } from './pdfjs-browser';
import './pdf-text-layer.css';

type Props = {
  file: File;
  pageNumber: number;
  zoom: number;
  onDocumentReady?: (pageCount: number) => void;
};

export default function PdfCanvas({ file, pageNumber, zoom, onDocumentReady }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<PdfJsDocumentSession | null>(null);
  const searchRequestRef = useRef(0);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [rendered, setRendered] = useState<PdfRenderedPage | null>(null);
  const [status, setStatus] = useState('Loading PDF renderer…');
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<PdfTextMatch[]>([]);
  const [searchStatus, setSearchStatus] = useState('Enter text to search the current page.');

  useEffect(() => {
    let disposed = false;
    searchRequestRef.current += 1;
    const previous = sessionRef.current;
    sessionRef.current = null;
    if (previous) void previous.destroy();
    setRendered(null);
    setMatches([]);
    setSearchStatus('Enter text to search the current page.');
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
      searchRequestRef.current += 1;
      const session = sessionRef.current;
      sessionRef.current = null;
      if (session) void session.destroy();
    };
  }, [file, onDocumentReady]);

  useEffect(() => {
    const session = sessionRef.current;
    const canvas = canvasRef.current;
    const textLayer = textLayerRef.current;
    if (!session || !canvas || !textLayer) return;
    let disposed = false;
    const activePage = pageNumber;
    searchRequestRef.current += 1;
    setMatches([]);
    setSearchStatus('Enter text to search the current page.');
    setRendered(null);
    setStatus(`Rendering page ${activePage}…`);

    void session.renderPage(activePage, canvas, normalizedPdfZoom(zoom), window.devicePixelRatio || 1, textLayer).then((result) => {
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

  async function searchCurrentPage() {
    const needle = query.trim();
    const session = sessionRef.current;
    if (!needle) {
      setMatches([]);
      setSearchStatus('Enter text to search the current page.');
      return;
    }
    if (!session) {
      setSearchStatus('The PDF text layer is still loading.');
      return;
    }

    const request = ++searchRequestRef.current;
    const activePage = pageNumber;
    setMatches([]);
    setSearchStatus(`Searching page ${activePage}…`);
    try {
      const text = await session.getPageText(activePage);
      if (request !== searchRequestRef.current || sessionRef.current !== session) return;
      const nextMatches = findPdfTextMatches(text, needle);
      setMatches(nextMatches);
      setSearchStatus(nextMatches.length
        ? `${nextMatches.length} ${nextMatches.length === 1 ? 'match' : 'matches'} on page ${activePage}.`
        : `No matches on page ${activePage}.`);
    } catch (error) {
      if (request !== searchRequestRef.current) return;
      setSearchStatus(`Page search failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  }

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
      <div className="pdf-page-layer" data-testid="pdf-page-layer">
        <canvas
          ref={canvasRef}
          role="img"
          aria-label={`Rendered preview of ${file.name} page ${pageNumber}`}
          data-testid="pdf-render-canvas"
          data-rendered-page={rendered?.pageNumber ?? ''}
          data-output-scale={rendered?.outputScale ?? ''}
          style={{ display: 'block', background: '#fff' }}
        />
        <div ref={textLayerRef} className="pdf-text-layer" data-testid="pdf-text-layer" />
      </div>
    </div>
    <p className="help-text" role="status" data-testid="pdf-render-status">{status}</p>
    <form
      style={{ marginTop: 12 }}
      onSubmit={(event) => {
        event.preventDefault();
        void searchCurrentPage();
      }}
    >
      <div className="field">
        <label htmlFor="pdf-page-search">Search current page</label>
        <div className="button-row" style={{ alignItems: 'end' }}>
          <input
            id="pdf-page-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find text on this page"
            autoComplete="off"
          />
          <button className="action-button secondary" type="submit">Search page</button>
        </div>
      </div>
    </form>
    <p className="help-text" role="status" data-testid="pdf-search-status">{searchStatus}</p>
    {matches.length ? <ol data-testid="pdf-search-results" className="help-text" style={{ marginTop: 8 }}>
      {matches.map((match, index) => <li key={`${match.index}-${index}`}>{match.excerpt || '(match in whitespace)'}</li>)}
    </ol> : null}
  </div>;
}

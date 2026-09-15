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
  onPageRequest?: (pageNumber: number) => void;
};

type PdfDocumentTextMatch = PdfTextMatch & {
  page: number;
};

const MAX_DOCUMENT_SEARCH_RESULTS = 200;

export default function PdfCanvas({ file, pageNumber, zoom, onDocumentReady, onPageRequest }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const textLayerRef = useRef<HTMLDivElement | null>(null);
  const sessionRef = useRef<PdfJsDocumentSession | null>(null);
  const searchRequestRef = useRef(0);
  const [sessionVersion, setSessionVersion] = useState(0);
  const [rendered, setRendered] = useState<PdfRenderedPage | null>(null);
  const [status, setStatus] = useState('Loading PDF renderer…');
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<PdfDocumentTextMatch[]>([]);
  const [searchStatus, setSearchStatus] = useState('Enter text to search this document.');

  useEffect(() => {
    let disposed = false;
    searchRequestRef.current += 1;
    const previous = sessionRef.current;
    sessionRef.current = null;
    if (previous) void previous.destroy();
    setRendered(null);
    setMatches([]);
    setSearchStatus('Enter text to search this document.');
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

  async function searchDocument() {
    const needle = query.trim();
    const session = sessionRef.current;
    if (!needle) {
      searchRequestRef.current += 1;
      setMatches([]);
      setSearchStatus('Enter text to search this document.');
      return;
    }
    if (!session) {
      setSearchStatus('The PDF text layer is still loading.');
      return;
    }

    const request = ++searchRequestRef.current;
    const nextMatches: PdfDocumentTextMatch[] = [];
    setMatches([]);
    setSearchStatus(`Searching ${session.pageCount} page${session.pageCount === 1 ? '' : 's'}…`);

    try {
      for (let page = 1; page <= session.pageCount && nextMatches.length < MAX_DOCUMENT_SEARCH_RESULTS; page += 1) {
        const text = await session.getPageText(page);
        if (request !== searchRequestRef.current || sessionRef.current !== session) return;
        const remaining = MAX_DOCUMENT_SEARCH_RESULTS - nextMatches.length;
        const pageMatches = findPdfTextMatches(text, needle, { maxResults: remaining });
        nextMatches.push(...pageMatches.map((match) => ({ ...match, page })));
      }

      if (request !== searchRequestRef.current || sessionRef.current !== session) return;
      setMatches(nextMatches);
      if (!nextMatches.length) {
        setSearchStatus('No matches in this document.');
      } else if (nextMatches.length >= MAX_DOCUMENT_SEARCH_RESULTS) {
        setSearchStatus(`Showing the first ${MAX_DOCUMENT_SEARCH_RESULTS} matches in this document.`);
      } else {
        setSearchStatus(`${nextMatches.length} ${nextMatches.length === 1 ? 'match' : 'matches'} in this document.`);
      }
    } catch (error) {
      if (request !== searchRequestRef.current) return;
      setSearchStatus(`Document search failed: ${error instanceof Error ? error.message : 'unknown error'}`);
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
        void searchDocument();
      }}
    >
      <div className="field">
        <label htmlFor="pdf-document-search">Search document</label>
        <div className="button-row" style={{ alignItems: 'end' }}>
          <input
            id="pdf-document-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find text across all pages"
            autoComplete="off"
          />
          <button className="action-button secondary" type="submit">Search document</button>
        </div>
      </div>
    </form>
    <p className="help-text" role="status" data-testid="pdf-search-status">{searchStatus}</p>
    {matches.length ? <ol data-testid="pdf-search-results" className="help-text" style={{ marginTop: 8 }}>
      {matches.map((match, index) => <li key={`${match.page}-${match.index}-${index}`}>
        <button
          className="action-button secondary"
          type="button"
          disabled={!onPageRequest}
          aria-label={`Go to page ${match.page}`}
          onClick={() => onPageRequest?.(match.page)}
        >Page {match.page}</button>{' '}
        {match.excerpt || '(match in whitespace)'}
      </li>)}
    </ol> : null}
  </div>;
}

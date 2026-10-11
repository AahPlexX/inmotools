import { useEffect, useRef, useState } from 'react';
import type { PdfJsDocumentSession } from './pdfjs-browser';
import './pdf-thumbnails.css';

const GROUP_SIZE = 20;

function Thumbnail({ session, page, selected, root, onSelect }: {
  session: PdfJsDocumentSession; page: number; selected: boolean;
  root: HTMLDivElement | null; onSelect: (page: number) => void;
}) {
  const button = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);
  const [status, setStatus] = useState('Not rendered');
  useEffect(() => {
    if (!root || !button.current) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) setVisible(true);
    }, { root, threshold: 0.01 });
    observer.observe(button.current);
    return () => observer.disconnect();
  }, [root]);
  useEffect(() => {
    if (!visible || !canvas.current) return;
    const controller = new AbortController();
    const target = canvas.current;
    setStatus('Rendering');
    void session.renderThumbnail(page, target, controller.signal).then(() => {
      if (!controller.signal.aborted) setStatus('Rendered');
    }).catch(() => {
      if (!controller.signal.aborted) setStatus('Preview unavailable');
    });
    return () => { controller.abort(); target.width = 0; target.height = 0; };
  }, [session, page, visible]);
  return <button ref={button} className="pdf-thumbnail" type="button" aria-label={`Preview page ${page} from thumbnails`} aria-current={selected ? 'page' : undefined} onClick={() => onSelect(page)} data-testid="pdf-thumbnail" data-page={page} data-rendered={status === 'Rendered'}>
    <span className="pdf-thumbnail-image"><canvas ref={canvas} aria-hidden="true" width="0" height="0" /></span>
    <span>Page {page}</span><small>{status}</small>
  </button>;
}

export default function PdfThumbnailRail({ session, pageNumber, onSelect }: {
  session: PdfJsDocumentSession; pageNumber: number; onSelect: (page: number) => void;
}) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [group, setGroup] = useState(Math.floor((pageNumber - 1) / GROUP_SIZE));
  useEffect(() => setGroup(Math.floor((pageNumber - 1) / GROUP_SIZE)), [pageNumber]);
  useEffect(() => { if (root) root.scrollLeft = 0; }, [root, group]);
  const start = group * GROUP_SIZE + 1;
  const end = Math.min(start + GROUP_SIZE - 1, session.pageCount);
  return <section className="pdf-thumbnail-section" aria-label="Page thumbnails">
    <div className="button-row">
      <button type="button" className="action-button secondary" disabled={group === 0} onClick={() => setGroup(value => value - 1)}>Previous thumbnail group</button>
      <button type="button" className="action-button secondary" disabled={end >= session.pageCount} onClick={() => setGroup(value => value + 1)}>Next thumbnail group</button>
    </div>
    <p className="help-text">Pages {start}–{end} of {session.pageCount}. Scroll to preview more pages, or use Preview page to jump directly.</p>
    <div ref={setRoot} className="pdf-thumbnail-rail" data-testid="pdf-thumbnail-rail" tabIndex={0} role="region" aria-label="Scrollable page thumbnails">
      {Array.from({ length: end - start + 1 }, (_, i) => <Thumbnail key={start + i} session={session} page={start + i} selected={pageNumber === start + i} root={root} onSelect={onSelect} />)}
    </div>
  </section>;
}

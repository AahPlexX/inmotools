import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { downloadBytes } from '../../lib/download';
import { parsePdfSplitRanges, pdfSplitByteCeiling, pdfSplitPrefix, splitPreparedPdf, zipPdfParts, type PdfSplitPart, type PdfSplitRequest } from './pdf-split';
import type { PdfAttachmentDefinition, PdfMetadataEdits } from './pdf-engine';
import './pdf-split.css';

export type PdfPreparedOutput = { bytes: Uint8Array; filename: string; metadata?: PdfMetadataEdits; attachments: PdfAttachmentDefinition[] };
type Props = {
  revision: object; pageCount: number; blocked: boolean; busy: boolean; fieldsBlocked: boolean;
  prepare: (signal: AbortSignal) => Promise<PdfPreparedOutput>;
  onBusyChange: (busy: boolean) => void;
};
type Result = { revision: object; parts: PdfSplitPart[]; filename: string };
function pagesLabel(pages: number[]) {
  const groups: string[] = [];
  for (let i = 0; i < pages.length; i++) {
    const first = pages[i]; let last = first;
    while (i + 1 < pages.length && pages[i + 1] === last + 1) last = pages[++i];
    groups.push(first === last ? String(first) : `${first}–${last}`);
  }
  return groups.join(', ');
}

export default function PdfSplitPanel({ revision, pageCount, blocked, busy, fieldsBlocked, prepare, onBusyChange }: Props) {
  const [mode, setMode] = useState<PdfSplitRequest['mode']>('ranges');
  const [ranges, setRanges] = useState('1');
  const [megabytes, setMegabytes] = useState('1');
  const [order, setOrder] = useState('ordered');
  const [result, setResult] = useState<Result | null>(null);
  const [group, setGroup] = useState(0);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState('Prepare split files, then download each PDF or one ZIP.');
  const [failed, setFailed] = useState(false);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const current = result?.revision === revision ? result : null;

  const reset = (message: string) => {
    generation.current += 1;
    if (request.current) { request.current.abort(); request.current = null; onBusyChange(false); }
    setWorking(false); setResult(null); setGroup(0); setFailed(false); setStatus(message);
  };
  useLayoutEffect(() => {
    generation.current += 1;
    if (request.current) { request.current.abort(); request.current = null; onBusyChange(false); }
    setWorking(false); setResult(null); setGroup(0); setFailed(false);
    setStatus('Prepare split files, then download each PDF or one ZIP.');
  }, [revision, onBusyChange]);
  useEffect(() => () => { generation.current += 1; request.current?.abort(); }, []);

  let validationError = '';
  try {
    if (pageCount && mode === 'ranges') parsePdfSplitRanges(ranges, pageCount);
    if (mode === 'size') pdfSplitByteCeiling(megabytes);
  } catch (error) { validationError = error instanceof Error ? error.message : 'Review the split settings.'; }

  async function run(kind: 'prepare' | 'zip') {
    if (busy || blocked || fieldsBlocked || validationError) return;
    const controller = new AbortController(); request.current = controller;
    const id = ++generation.current;
    setWorking(true); setFailed(false); onBusyChange(true);
    try {
      if (kind === 'prepare') {
        setResult(null); setGroup(0); setStatus('Preparing the current output…');
        const source = await prepare(controller.signal);
        controller.signal.throwIfAborted();
        const config: PdfSplitRequest = mode === 'ranges' ? { mode, ranges } : mode === 'burst' ? { mode } : { mode, maxBytes: pdfSplitByteCeiling(megabytes), preserveOrder: order === 'ordered' };
        const parts = await splitPreparedPdf(source.bytes, config, { ...source, signal: controller.signal, onProgress: (done, total) => {
          if (!controller.signal.aborted && generation.current === id) setStatus(`Preparing split files: ${done} of ${total}.`);
        } });
        if (!controller.signal.aborted && generation.current === id) {
          setResult({ revision, parts, filename: source.filename });
          setStatus(`Prepared ${parts.length} PDF${parts.length === 1 ? '' : 's'}; actual byte sizes are listed below.`);
        }
      } else if (current) {
        setStatus('Creating ZIP locally…');
        const bytes = await zipPdfParts(current.parts, controller.signal);
        if (!controller.signal.aborted && generation.current === id) {
          downloadBytes(bytes, `${pdfSplitPrefix(current.filename)}-split.zip`, 'application/zip');
          setStatus(`Downloaded ZIP containing ${current.parts.length} PDFs.`);
        }
      }
    } catch (error) {
      if (!controller.signal.aborted && generation.current === id) {
        setFailed(true); setStatus(error instanceof Error ? error.message : 'Split preparation failed; no files were downloaded.');
      }
    } finally {
      if (generation.current === id) { request.current = null; setWorking(false); onBusyChange(false); }
    }
  }
  const first = group * 20;
  const visibleParts = current?.parts.slice(first, first + 20) ?? [];
  return <section className="notice pdf-split-section" aria-labelledby="pdf-split-title">
    <h3 id="pdf-split-title">Split output PDFs</h3>
    <p className="help-text">Uses the current {pageCount}-page editable output plan, including page edits, overlays, replacement metadata and staged attachments. Protected reader-only files are excluded. Original files stay unchanged.</p>
    <div className="pdf-split-controls">
      <div className="field"><label htmlFor="pdf-split-mode">Split mode</label><select id="pdf-split-mode" value={mode} disabled={working} onChange={event => { reset('Split settings changed; prepare again.'); setMode(event.target.value as PdfSplitRequest['mode']); }}><option value="ranges">Page ranges</option><option value="burst">One file per page</option><option value="size">Size ceiling</option></select></div>
      {mode === 'ranges' ? <div className="field"><label htmlFor="pdf-split-ranges">Split ranges</label><input id="pdf-split-ranges" value={ranges} disabled={working} onChange={event => { reset('Split settings changed; prepare again.'); setRanges(event.target.value); }} placeholder="1-2, 3, 4-5" aria-invalid={Boolean(validationError)} aria-describedby="pdf-split-help" /></div> : null}
      {mode === 'size' ? <>
        <div className="field"><label htmlFor="pdf-split-size">Maximum part size (MB)</label><input id="pdf-split-size" type="number" min="0.000001" step="0.001" value={megabytes} disabled={working} onChange={event => { reset('Split settings changed; prepare again.'); setMegabytes(event.target.value); }} aria-invalid={Boolean(validationError)} aria-describedby="pdf-split-help" /></div>
        <div className="field"><label htmlFor="pdf-split-order">Size split order</label><select id="pdf-split-order" value={order} disabled={working} onChange={event => { reset('Split settings changed; prepare again.'); setOrder(event.target.value); }}><option value="ordered">Preserve source order</option><option value="best-fit">Best fit (may regroup pages)</option></select></div>
      </> : null}
    </div>
    <p className="help-text" id="pdf-split-help">{mode === 'ranges' ? 'Each comma item makes one PDF: 1-2, 3, 4-5 creates three files. Ranges refer to the prepared output, not the original source numbering.' : mode === 'burst' ? 'Every prepared output page becomes a separate PDF.' : '1 MB = 1,000,000 bytes. Actual serialized sizes determine fitting; a page that cannot fit prevents preparation. Best fit tests more placements and may regroup pages; it does not promise the fewest files.'} Preparation is limited to 1,000 files, 128 MiB input/total output and 5,000 size candidates.</p>
    {fieldsBlocked ? <p className="help-text">New editable fields cannot be preserved in split PDFs. Remove them or use single-file export.</p> : null}
    {validationError ? <p className="help-text" role="alert">{validationError}</p> : null}
    <div className="button-row">
      <button type="button" className="action-button" disabled={blocked || busy || fieldsBlocked || Boolean(validationError)} onClick={() => void run('prepare')}>Prepare split PDFs</button>
      {working ? <button type="button" className="action-button secondary" onClick={() => reset('Split operation cancelled; no new files were downloaded.')}>Cancel split operation</button> : null}
      {current ? <><button type="button" className="action-button secondary" disabled={busy || working} onClick={() => void run('zip')}>Download all as ZIP</button><button type="button" className="action-button secondary" disabled={working} onClick={() => reset('Split results cleared.')}>Clear split results</button></> : null}
    </div>
    <p className="pdf-split-status" role={failed ? 'alert' : 'status'} data-testid="pdf-split-status">{status}</p>
    {current ? <>
      <p className="help-text">Download individual files below, or choose one ZIP. Each part repeats the intentionally staged attachments and metadata.</p>
      <div className="button-row"><button type="button" className="action-button secondary" disabled={!group || working} onClick={() => setGroup(value => value - 1)}>Previous split group</button><button type="button" className="action-button secondary" disabled={first + 20 >= current.parts.length || working} onClick={() => setGroup(value => value + 1)}>Next split group</button></div>
      <p className="help-text">Files {first + 1}–{Math.min(first + 20, current.parts.length)} of {current.parts.length}</p>
      <div className="pdf-split-results">
        {visibleParts.map((part, index) => <div className="metric pdf-split-part" data-testid="pdf-split-part" data-bytes={part.bytes.byteLength} key={part.filename}>
          <strong>{part.filename}</strong><span>Pages {pagesLabel(part.pages)} · {part.bytes.byteLength.toLocaleString()} bytes</span>
          <button type="button" className="action-button secondary" disabled={busy || working} onClick={() => downloadBytes(part.bytes, part.filename, 'application/pdf')}>Download part {first + index + 1}</button>
        </div>)}
      </div>
    </> : null}
  </section>;
}

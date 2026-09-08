import { useMemo, useState } from 'react';
import { PDFDocument } from 'pdf-lib';
import { downloadBytes } from '../../lib/download';
import { inspectPdf, pageSelectionPreset, parsePageSelection, splicePdfs, type PdfInspection } from './pdf-engine';
import { consumeFileInput } from '../../lib/file-input';

type PdfItem = {
  id: string;
  file: File;
  inspection: PdfInspection;
  pages: string;
  rotate: 0 | 90 | 180 | 270;
};

const bytesLabel = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export default function PdfWorkspace() {
  const [items, setItems] = useState<PdfItem[]>([]);
  const [flatten, setFlatten] = useState(true);
  const [status, setStatus] = useState('Choose PDFs to merge, extract, reorder, rotate, or flatten.');
  const [busy, setBusy] = useState(false);

  const pageStates = useMemo(() => items.map((item) => {
    try {
      const pages = parsePageSelection(item.pages, item.inspection.pageCount);
      return { pages, error: '' };
    } catch (error) {
      return { pages: [] as number[], error: error instanceof Error ? error.message : 'Invalid page selection.' };
    }
  }), [items]);
  const hasPageError = pageStates.some((state) => state.error);
  const outputPageCount = pageStates.reduce((sum, state) => sum + state.pages.length, 0);
  const sourceBytes = items.reduce((sum, item) => sum + item.file.size, 0);

  async function load(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      const next: PdfItem[] = [];
      for (const file of Array.from(list)) {
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const inspection = await inspectPdf(bytes);
          next.push({
            id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
            file,
            inspection,
            pages: '',
            rotate: 0,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown error';
          if (/encrypt/i.test(message)) throw new Error(`${file.name} is encrypted. pdf-lib cannot safely modify encrypted PDFs; decrypt it in an authorized PDF application first.`);
          throw new Error(`${file.name}: ${message}`);
        }
      }
      setItems((current) => [...current, ...next]);
      setStatus(`Added ${next.length} PDF${next.length === 1 ? '' : 's'} locally. Review page selections before processing.`);
    } catch (error) {
      setStatus(`Could not read PDF: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, delta: number) {
    setItems((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  function update(index: number, patch: Partial<PdfItem>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function outputName() {
    if (items.length === 1) {
      const base = items[0].file.name.replace(/\.pdf$/i, '');
      return `${base}.sanitized.pdf`;
    }
    return `merged-${items.length}-documents.pdf`;
  }

  async function process() {
    if (!items.length || hasPageError) return;
    setBusy(true);
    try {
      const selections = await Promise.all(items.map(async (item, index) => ({
        bytes: new Uint8Array(await item.file.arrayBuffer()),
        pages: pageStates[index].pages,
        rotate: item.rotate,
        flatten,
      })));
      const bytes = await splicePdfs(selections);
      downloadBytes(bytes, outputName(), 'application/pdf');
      const delta = bytes.byteLength - sourceBytes;
      setStatus(`Created ${outputPageCount} output page${outputPageCount === 1 ? '' : 's'} locally (${bytesLabel(bytes.byteLength)}; ${delta === 0 ? 'same size as sources' : `${delta > 0 ? '+' : '−'}${bytesLabel(Math.abs(delta))} versus source bytes`}).`);
    } catch (error) {
      setStatus(`PDF processing failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="workspace-header"><div><h2>PDF splice and sanitizer</h2><p>File order becomes output order; page lists can reorder or repeat pages within each file.</p></div></div>
    <div className="workspace-body">
      <div className="field"><label htmlFor="pdf-files">Add PDF files</label><input id="pdf-files" type="file" accept="application/pdf,.pdf" multiple onChange={(event) => consumeFileInput(event.target, () => load(event.target.files))} /><small>New selections append to the current queue instead of replacing it.</small></div>

      {items.map((item, index) => {
        const pageState = pageStates[index];
        return <div className="notice" style={{ marginTop: 14 }} key={item.id}>
          <div className="workspace-grid three">
            <div>
              <strong style={{ overflowWrap: 'anywhere' }}>{item.file.name}</strong>
              <div className="help-text">{item.inspection.pageCount} pages · {bytesLabel(item.file.size)}</div>
              <div className="help-text">{item.inspection.formFieldCount} AcroForm field{item.inspection.formFieldCount === 1 ? '' : 's'} · {item.inspection.metadataFields.length ? `metadata: ${item.inspection.metadataFields.join(', ')}` : 'no common Info metadata detected'}</div>
            </div>
            <div className="field">
              <label htmlFor={`pages-${index}`}>Pages</label>
              <input id={`pages-${index}`} type="text" placeholder="All, or 1,3,5-7" value={item.pages} onChange={(event) => update(index, { pages: event.target.value })} aria-invalid={Boolean(pageState.error)} aria-describedby={`pages-help-${index}`} />
              <small id={`pages-help-${index}`}>{pageState.error || `${pageState.pages.length} page${pageState.pages.length === 1 ? '' : 's'} selected. Repeats are preserved.`}</small>
              <div className="button-row" style={{ marginTop: 4 }}>
                {(['all', 'odd', 'even', 'reverse'] as const).map((preset) => <button key={preset} className="action-button secondary" type="button" onClick={() => update(index, { pages: pageSelectionPreset(preset, item.inspection.pageCount) })}>{preset[0].toUpperCase() + preset.slice(1)}</button>)}
              </div>
            </div>
            <div className="field"><label htmlFor={`rotate-${index}`}>Rotate output</label><select id={`rotate-${index}`} value={item.rotate} onChange={(event) => update(index, { rotate: Number(event.target.value) as PdfItem['rotate'] })}><option value="0">No rotation</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></div>
          </div>
          <div className="button-row"><button className="action-button secondary" type="button" disabled={index === 0} onClick={() => move(index, -1)}>Move up</button><button className="action-button secondary" type="button" disabled={index === items.length - 1} onClick={() => move(index, 1)}>Move down</button><button className="action-button secondary" type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${item.file.name} from the queue`}>Remove</button></div>
        </div>;
      })}

      {items.length ? <div className="metric-row" style={{ marginTop: 18 }}><div className="metric"><span>Documents</span><strong>{items.length}</strong></div><div className="metric"><span>Output pages</span><strong>{hasPageError ? '—' : outputPageCount}</strong></div><div className="metric"><span>Source size</span><strong>{bytesLabel(sourceBytes)}</strong></div></div> : null}

      <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 18 }}><input type="checkbox" checked={flatten} onChange={(event) => setFlatten(event.target.checked)} /> Flatten AcroForm fields before copying pages</label>
      <p className="help-text">Flattening preserves current field appearances but removes editability. It does not rasterize page content.</p>
      <div className="button-row"><button className="action-button" type="button" disabled={!items.length || busy || hasPageError} onClick={() => void process()}>Process and download</button><button className="action-button secondary" type="button" disabled={!items.length || busy} onClick={() => { setItems([]); setStatus('Queue cleared. Choose PDFs to begin again.'); }}>Clear queue</button></div>
      <div className="status-line" role="status">{busy ? 'Processing PDF bytes locally…' : status}</div>
      <div className="notice"><strong>Sanitization scope</strong><p className="help-text">Output is rebuilt into a new PDF, so source document-level Info/catalog metadata is not intentionally carried forward. Selected page content and page-level annotations are preserved; this is not a malware scanner, redaction tool, or guarantee that visible/private information inside page content has been removed.</p></div>
    </div>
  </>;
}

import { useMemo, useState } from 'react';
import { downloadBytes } from '../../lib/download';
import {
  inspectPdf,
  pageSelectionPreset,
  parsePageSelection,
  splicePdfs,
  type PageSelectionPreset,
  type PdfInspection,
  type PdfMetadataEdits,
} from './pdf-engine';
import { consumeFileInput } from '../../lib/file-input';

type PdfItem = {
  id: string;
  file: File;
  inspection: PdfInspection;
  pages: string;
  rotate: 0 | 90 | 180 | 270;
};

type MetadataDraft = {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  creator: string;
  producer: string;
  language: string;
};

const EMPTY_METADATA: MetadataDraft = {
  title: '',
  author: '',
  subject: '',
  keywords: '',
  creator: '',
  producer: '',
  language: '',
};

const OUTPUT_PREVIEW_LIMIT = 100;

const bytesLabel = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const trimmed = (value: string) => value.trim() || undefined;

function metadataForExport(draft: MetadataDraft): PdfMetadataEdits | undefined {
  const keywords = draft.keywords.split(',').map((value) => value.trim()).filter(Boolean);
  const metadata: PdfMetadataEdits = {
    title: trimmed(draft.title),
    author: trimmed(draft.author),
    subject: trimmed(draft.subject),
    keywords: keywords.length ? keywords : undefined,
    creator: trimmed(draft.creator),
    producer: trimmed(draft.producer),
    language: trimmed(draft.language),
  };
  return Object.values(metadata).some((value) => value !== undefined) ? metadata : undefined;
}

function safePdfFilename(value: string, fallback: string): string {
  const candidate = value.trim() || fallback;
  const safe = candidate
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '-')
    .replace(/^\.+/, '')
    .trim();
  const resolved = safe || fallback;
  return /\.pdf$/i.test(resolved) ? resolved : `${resolved}.pdf`;
}

export default function PdfWorkspace() {
  const [items, setItems] = useState<PdfItem[]>([]);
  const [flatten, setFlatten] = useState(true);
  const [metadata, setMetadata] = useState<MetadataDraft>(EMPTY_METADATA);
  const [outputFilename, setOutputFilename] = useState('');
  const [status, setStatus] = useState('Choose PDFs to merge, extract, reorder, rotate, flatten, or prepare for export.');
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
  const formFieldTotal = items.reduce((sum, item) => sum + item.inspection.formFieldCount, 0);
  const formPolicyBlocked = formFieldTotal > 0 && !flatten;
  const authoredMetadata = metadataForExport(metadata);
  const authoredMetadataCount = authoredMetadata ? Object.values(authoredMetadata).filter((value) => value !== undefined).length : 0;

  const outputPreview = useMemo(() => {
    const rows: Array<{ key: string; source: string; page: number; rotate: PdfItem['rotate'] }> = [];
    for (let itemIndex = 0; itemIndex < items.length && rows.length < OUTPUT_PREVIEW_LIMIT; itemIndex += 1) {
      if (pageStates[itemIndex].error) continue;
      const item = items[itemIndex];
      for (let pageIndex = 0; pageIndex < pageStates[itemIndex].pages.length && rows.length < OUTPUT_PREVIEW_LIMIT; pageIndex += 1) {
        rows.push({
          key: `${item.id}-${pageIndex}`,
          source: item.file.name,
          page: pageStates[itemIndex].pages[pageIndex],
          rotate: item.rotate,
        });
      }
    }
    return rows;
  }, [items, pageStates]);

  async function load(list: FileList | null) {
    if (!list?.length) return;
    setBusy(true);
    try {
      const next: PdfItem[] = [];
      for (const file of Array.from(list)) {
        try {
          const bytes = new Uint8Array(await file.arrayBuffer());
          const inspection = await inspectPdf(bytes);
          next.push({ id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`, file, inspection, pages: '', rotate: 0 });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown error';
          if (/encrypt/i.test(message)) throw new Error(`${file.name} is encrypted. This workstation cannot safely modify it with the current engine; decrypt it in an authorized PDF application first.`);
          throw new Error(`${file.name}: ${message}`);
        }
      }
      setItems((current) => [...current, ...next]);
      setStatus(`Added ${next.length} PDF${next.length === 1 ? '' : 's'} locally. Review page selections, form handling, document properties, and the export filename before processing.`);
    } catch (error) {
      setStatus(`Could not read PDF: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  }

  function move(index: number, delta: number) {
    reorder(index, index + delta);
  }

  function reorder(from: number, to: number) {
    setItems((current) => {
      if (from < 0 || to < 0 || from >= current.length || to >= current.length || from === to) return current;
      const next = [...current];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  }

  function update(index: number, patch: Partial<PdfItem>) {
    setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function updateMetadata<Key extends keyof MetadataDraft>(key: Key, value: MetadataDraft[Key]) {
    setMetadata((current) => ({ ...current, [key]: value }));
  }

  function applyPreset(index: number, preset: PageSelectionPreset) {
    const selection = pageSelectionPreset(preset, items[index].inspection.pageCount);
    if (selection === null) {
      setStatus(`${items[index].file.name} has no ${preset} pages. The existing selection was left unchanged.`);
      return;
    }
    update(index, { pages: selection });
  }

  function outputName() {
    if (items.length === 1) {
      const base = items[0].file.name.replace(/\.pdf$/i, '');
      return `${base}.sanitized.pdf`;
    }
    return `merged-${items.length}-documents.pdf`;
  }

  function resetExportProperties() {
    setMetadata(EMPTY_METADATA);
    setOutputFilename('');
    setStatus('Output properties cleared. Source metadata will remain omitted unless you enter replacement values.');
  }

  async function process() {
    if (!items.length || hasPageError || formPolicyBlocked) return;
    setBusy(true);
    try {
      const selections = await Promise.all(items.map(async (item, index) => ({
        bytes: new Uint8Array(await item.file.arrayBuffer()),
        pages: pageStates[index].pages,
        rotate: item.rotate,
        flatten,
      })));
      const bytes = await splicePdfs(selections, { metadata: authoredMetadata });
      const outputInspection = await inspectPdf(bytes);
      if (flatten && formFieldTotal > 0 && outputInspection.formFieldCount !== 0) {
        throw new Error('Output verification found editable form fields after flattening; no download was created.');
      }
      const filename = safePdfFilename(outputFilename, outputName());
      downloadBytes(bytes, filename, 'application/pdf');
      const delta = bytes.byteLength - sourceBytes;
      const formSummary = formFieldTotal > 0
        ? ` ${formFieldTotal} source form field${formFieldTotal === 1 ? '' : 's'} flattened; output inspection found ${outputInspection.formFieldCount} editable fields.`
        : ' Output inspection found no editable form fields.';
      const metadataSummary = authoredMetadataCount
        ? ` ${authoredMetadataCount} replacement metadata propert${authoredMetadataCount === 1 ? 'y was' : 'ies were'} intentionally written.`
        : ' No replacement metadata was written.';
      setStatus(`Created ${outputPageCount} output page${outputPageCount === 1 ? '' : 's'} locally as ${filename} (${bytesLabel(bytes.byteLength)}; ${delta === 0 ? 'same size as sources' : `${delta > 0 ? '+' : '−'}${bytesLabel(Math.abs(delta))} versus source bytes`}).${formSummary}${metadataSummary}`);
    } catch (error) {
      setStatus(`PDF processing failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="workspace-header"><div><h2>PDF Workstation</h2><p>Prepare deterministic local PDF outputs: page order, page selection, rotation, form flattening, metadata, and export naming.</p></div></div>
    <div className="workspace-body">
      <div className="field"><label htmlFor="pdf-files">Add PDF files</label><input id="pdf-files" type="file" accept="application/pdf,.pdf" multiple onChange={(event) => consumeFileInput(event.target, () => load(event.target.files))} /><small>New selections append to the current queue instead of replacing it.</small></div>

      {items.map((item, index) => {
        const pageState = pageStates[index];
        const evenPreset = pageSelectionPreset('even', item.inspection.pageCount);
        return <div
          className="notice"
          style={{ marginTop: 14 }}
          key={item.id}
          data-testid="pdf-item"
          data-pdf-index={index}
          aria-label={`PDF queue item ${index + 1}: ${item.file.name}`}
        >
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
                {(['all', 'odd', 'even', 'reverse'] as const).map((preset) => {
                  const unavailable = preset === 'even' && evenPreset === null;
                  return <button key={preset} className="action-button secondary" type="button" disabled={unavailable} title={unavailable ? 'This PDF contains no even-numbered pages.' : undefined} onClick={() => applyPreset(index, preset)}>{preset[0].toUpperCase() + preset.slice(1)}</button>;
                })}
              </div>
            </div>
            <div className="field"><label htmlFor={`rotate-${index}`}>Rotate output</label><select id={`rotate-${index}`} value={item.rotate} onChange={(event) => update(index, { rotate: Number(event.target.value) as PdfItem['rotate'] })}><option value="0">No rotation</option><option value="90">90°</option><option value="180">180°</option><option value="270">270°</option></select></div>
          </div>
          <div className="workspace-grid" style={{ marginTop: 10, alignItems: 'end' }}>
            <div className="field" style={{ minWidth: 0 }}>
              <label htmlFor={`position-${index}`}>Position for {item.file.name}</label>
              <select id={`position-${index}`} value={String(index + 1)} onChange={(event) => reorder(index, Number(event.target.value) - 1)}>
                {items.map((_, positionIndex) => <option key={positionIndex} value={String(positionIndex + 1)}>Position {positionIndex + 1}</option>)}
              </select>
            </div>
            <div className="button-row" style={{ marginTop: 0 }}><button className="action-button secondary" type="button" disabled={index === 0} onClick={() => move(index, -1)}>Move up</button><button className="action-button secondary" type="button" disabled={index === items.length - 1} onClick={() => move(index, 1)}>Move down</button><button className="action-button secondary" type="button" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${item.file.name} from the queue`}>Remove</button></div>
          </div>
          <small>Choose an exact queue position or use Move up / Move down. These native controls work with touch, mouse, and keyboard without requiring a drag gesture.</small>
        </div>;
      })}

      {items.length ? <div className="metric-row" style={{ marginTop: 18 }}><div className="metric"><span>Documents</span><strong>{items.length}</strong></div><div className="metric"><span>Output pages</span><strong>{hasPageError ? '—' : outputPageCount}</strong></div><div className="metric"><span>Source size</span><strong>{bytesLabel(sourceBytes)}</strong></div></div> : null}

      {items.length ? <section className="notice" style={{ marginTop: 18 }} aria-labelledby="pdf-properties-title">
        <h3 id="pdf-properties-title" style={{ margin: 0 }}>Document properties &amp; export</h3>
        <p className="help-text">Source standard metadata is not copied into the rebuilt output. Only replacement values entered here are intentionally written. Leave a field blank to omit it.</p>
        <div className="workspace-grid three" style={{ marginTop: 14 }}>
          <div className="field"><label htmlFor="pdf-output-title">Output title</label><input id="pdf-output-title" value={metadata.title} onChange={(event) => updateMetadata('title', event.target.value)} autoComplete="off" /></div>
          <div className="field"><label htmlFor="pdf-output-author">Output author</label><input id="pdf-output-author" value={metadata.author} onChange={(event) => updateMetadata('author', event.target.value)} autoComplete="off" /></div>
          <div className="field"><label htmlFor="pdf-output-subject">Output subject</label><input id="pdf-output-subject" value={metadata.subject} onChange={(event) => updateMetadata('subject', event.target.value)} autoComplete="off" /></div>
          <div className="field"><label htmlFor="pdf-output-keywords">Output keywords</label><input id="pdf-output-keywords" value={metadata.keywords} onChange={(event) => updateMetadata('keywords', event.target.value)} placeholder="filed, reviewed, archive" autoComplete="off" /><small>Separate tags with commas.</small></div>
          <div className="field"><label htmlFor="pdf-output-creator">Output creator</label><input id="pdf-output-creator" value={metadata.creator} onChange={(event) => updateMetadata('creator', event.target.value)} autoComplete="off" /></div>
          <div className="field"><label htmlFor="pdf-output-producer">Output producer</label><input id="pdf-output-producer" value={metadata.producer} onChange={(event) => updateMetadata('producer', event.target.value)} autoComplete="off" /></div>
          <div className="field"><label htmlFor="pdf-output-language">Document language</label><input id="pdf-output-language" value={metadata.language} onChange={(event) => updateMetadata('language', event.target.value)} placeholder="en-US" autoComplete="off" /><small>Use a BCP 47 language tag when known.</small></div>
          <div className="field"><label htmlFor="pdf-output-filename">Output filename</label><input id="pdf-output-filename" value={outputFilename} onChange={(event) => setOutputFilename(event.target.value)} placeholder={outputName()} autoComplete="off" /><small>Leave blank for {outputName()}. “.pdf” is added when omitted.</small></div>
        </div>
        <div className="button-row"><button className="action-button secondary" type="button" onClick={resetExportProperties}>Clear replacement properties</button></div>
      </section> : null}

      {items.length && !hasPageError ? <section className="notice" style={{ marginTop: 18 }} data-testid="pdf-output-preview" aria-labelledby="pdf-preview-title">
        <strong id="pdf-preview-title">Output page order preview</strong>
        <p className="help-text">Structural preview of the planned source page order and rotation before export. {outputPageCount > OUTPUT_PREVIEW_LIMIT ? `Showing the first ${OUTPUT_PREVIEW_LIMIT} of ${outputPageCount} pages.` : `${outputPageCount} page${outputPageCount === 1 ? '' : 's'} planned.`}</p>
        <ol style={{ margin: '8px 0 0', paddingInlineStart: 24 }}>
          {outputPreview.map((row) => <li key={row.key} style={{ overflowWrap: 'anywhere' }}>{row.source} · page {row.page}{row.rotate ? ` · rotate ${row.rotate}°` : ''}</li>)}
        </ol>
      </section> : null}

      <label style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 18 }}><input type="checkbox" checked={flatten} onChange={(event) => setFlatten(event.target.checked)} /> Flatten AcroForm fields before copying pages</label>
      <p className="help-text">Flattening preserves current field appearances but removes editability. It does not rasterize page content.</p>
      {items.length ? <div className="notice" data-testid="pdf-form-policy" role={formPolicyBlocked ? 'alert' : undefined}>
        <strong>Form handling confirmation</strong>
        <p className="help-text">{formFieldTotal === 0
          ? 'No AcroForm fields were detected in the queued sources; page copying can proceed with or without the flatten option.'
          : flatten
            ? `${formFieldTotal} source form field${formFieldTotal === 1 ? '' : 's'} will be flattened into their current page appearances. The output is expected to contain zero editable AcroForm fields and is reinspected before download.`
            : `Processing is blocked because ${formFieldTotal} source form field${formFieldTotal === 1 ? '' : 's'} would not remain editable after cross-document page copying. Enable flattening to preserve their current appearances without silently discarding form structure.`}</p>
      </div> : null}

      <div className="button-row"><button className="action-button" type="button" disabled={!items.length || busy || hasPageError || formPolicyBlocked} onClick={() => void process()}>Process and download</button><button className="action-button secondary" type="button" disabled={!items.length || busy} onClick={() => { setItems([]); setMetadata(EMPTY_METADATA); setOutputFilename(''); setStatus('Queue cleared. Choose PDFs to begin again.'); }}>Clear queue</button></div>
      <div className="status-line" role="status">{busy ? 'Processing PDF bytes locally…' : status}</div>
      <div className="notice"><strong>Current sanitization boundary</strong><p className="help-text">Output is rebuilt into a new PDF, so source document-level Info/catalog metadata is not intentionally carried forward. Replacement metadata above is opt-in. Selected page content and page-level annotations are preserved; this stage is not yet the workstation's planned malware analysis, secure redaction, or active-content sanitization system.</p></div>
    </div>
  </>;
}

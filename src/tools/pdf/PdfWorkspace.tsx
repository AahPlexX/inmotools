import { useMemo, useState } from 'react';
import { downloadBytes } from '../../lib/download';
import {
  inspectPdf,
  pageSelectionPreset,
  parsePageSelection,
  splicePdfs,
  type PageSelectionPreset,
  type PdfBlankPageDefinition,
  type PdfBox,
  type PdfInspection,
  type PdfMetadataEdits,
  type PdfPageBoxEdit,
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
  creationDate: string;
  modificationDate: string;
};

type BlankPageStage = PdfBlankPageDefinition & {
  id: string;
  label: string;
};

type BoxName = 'mediaBox' | 'cropBox' | 'bleedBox' | 'trimBox';
type BoxField = keyof PdfBox;
type GeometryEdits = Record<string, Partial<Record<BoxName, PdfBox>>>;

type SourcePlanRow = {
  key: string;
  kind: 'source';
  source: string;
  page: number;
  rotate: PdfItem['rotate'];
  inspection: PdfInspection['pages'][number];
};

type BlankPlanRow = {
  key: string;
  kind: 'blank';
  label: string;
  width: number;
  height: number;
};

type OutputPlanRow = SourcePlanRow | BlankPlanRow;

const EMPTY_METADATA: MetadataDraft = {
  title: '',
  author: '',
  subject: '',
  keywords: '',
  creator: '',
  producer: '',
  language: '',
  creationDate: '',
  modificationDate: '',
};

const OUTPUT_PREVIEW_LIMIT = 100;
const POINTS_PER_INCH = 72;
const BOX_NAMES: Array<{ key: BoxName; label: string }> = [
  { key: 'mediaBox', label: 'MediaBox' },
  { key: 'cropBox', label: 'CropBox' },
  { key: 'bleedBox', label: 'BleedBox' },
  { key: 'trimBox', label: 'TrimBox' },
];
const BOX_FIELDS: Array<{ key: BoxField; label: string }> = [
  { key: 'x', label: 'x' },
  { key: 'y', label: 'y' },
  { key: 'width', label: 'width' },
  { key: 'height', label: 'height' },
];
const BLANK_PRESETS = {
  letter: { label: 'Letter', width: 8.5, height: 11 },
  a4: { label: 'A4', width: 8.2677, height: 11.6929 },
  legal: { label: 'Legal', width: 8.5, height: 14 },
  tabloid: { label: 'Tabloid', width: 11, height: 17 },
} as const;

type BlankPreset = keyof typeof BLANK_PRESETS | 'custom';

const bytesLabel = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const trimmed = (value: string) => value.trim() || undefined;

function utcDateFromInput(value: string): Date | undefined {
  if (!value) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second = '0'] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(minute), Number(second)));
}

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
    creationDate: utcDateFromInput(draft.creationDate),
    modificationDate: utcDateFromInput(draft.modificationDate),
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

function baseBoxes(row: OutputPlanRow): Record<BoxName, PdfBox> {
  if (row.kind === 'blank') {
    const box = { x: 0, y: 0, width: row.width, height: row.height };
    return { mediaBox: box, cropBox: box, bleedBox: box, trimBox: box };
  }
  return {
    mediaBox: row.inspection.mediaBox,
    cropBox: row.inspection.cropBox,
    bleedBox: row.inspection.bleedBox,
    trimBox: row.inspection.trimBox,
  };
}

function boxInside(outer: PdfBox, inner: PdfBox): boolean {
  const epsilon = 0.0001;
  return inner.x >= outer.x - epsilon
    && inner.y >= outer.y - epsilon
    && inner.x + inner.width <= outer.x + outer.width + epsilon
    && inner.y + inner.height <= outer.y + outer.height + epsilon;
}

function geometryValidationError(outputPlan: OutputPlanRow[], edits: GeometryEdits): string {
  for (let index = 0; index < outputPlan.length; index += 1) {
    const row = outputPlan[index];
    const rowEdits = edits[row.key];
    if (!rowEdits) continue;
    const baseline = baseBoxes(row);
    const boxes = {
      mediaBox: rowEdits.mediaBox ?? baseline.mediaBox,
      cropBox: rowEdits.cropBox ?? baseline.cropBox,
      bleedBox: rowEdits.bleedBox ?? baseline.bleedBox,
      trimBox: rowEdits.trimBox ?? baseline.trimBox,
    };
    for (const { key, label } of BOX_NAMES) {
      const box = boxes[key];
      if (![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) {
        return `${label} on output page ${index + 1} needs finite coordinates and positive width/height.`;
      }
    }
    for (const { key, label } of BOX_NAMES.slice(1)) {
      if (!boxInside(boxes.mediaBox, boxes[key])) return `${label} on output page ${index + 1} must remain inside its MediaBox.`;
    }
  }
  return '';
}

export default function PdfWorkspace() {
  const [items, setItems] = useState<PdfItem[]>([]);
  const [flatten, setFlatten] = useState(true);
  const [metadata, setMetadata] = useState<MetadataDraft>(EMPTY_METADATA);
  const [outputFilename, setOutputFilename] = useState('');
  const [blankPreset, setBlankPreset] = useState<BlankPreset>('letter');
  const [blankOrientation, setBlankOrientation] = useState<'portrait' | 'landscape'>('portrait');
  const [blankWidthInches, setBlankWidthInches] = useState(BLANK_PRESETS.letter.width);
  const [blankHeightInches, setBlankHeightInches] = useState(BLANK_PRESETS.letter.height);
  const [blankCount, setBlankCount] = useState(1);
  const [blankAfterPage, setBlankAfterPage] = useState(0);
  const [blankPages, setBlankPages] = useState<BlankPageStage[]>([]);
  const [geometryEdits, setGeometryEdits] = useState<GeometryEdits>({});
  const [geometryPageKey, setGeometryPageKey] = useState('');
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
  const sourcePlan = useMemo<SourcePlanRow[]>(() => {
    const rows: SourcePlanRow[] = [];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      if (pageStates[itemIndex].error) continue;
      const item = items[itemIndex];
      pageStates[itemIndex].pages.forEach((sourcePage, selectionIndex) => {
        rows.push({
          key: `${item.id}:selection:${selectionIndex}:source:${sourcePage}`,
          kind: 'source',
          source: item.file.name,
          page: sourcePage,
          rotate: item.rotate,
          inspection: item.inspection.pages[sourcePage - 1],
        });
      });
    }
    return rows;
  }, [items, pageStates]);
  const sourceOutputPageCount = sourcePlan.length;
  const blankPlanError = blankPages.some((definition) => definition.afterPage > sourceOutputPageCount)
    ? 'A staged blank-page anchor is beyond the current copied-page count. Remove or restage it after changing page selections.'
    : '';
  const outputPlan = useMemo<OutputPlanRow[]>(() => {
    const rows: OutputPlanRow[] = [];
    for (let anchor = 0; anchor <= sourcePlan.length; anchor += 1) {
      if (anchor > 0) rows.push(sourcePlan[anchor - 1]);
      blankPages.filter((definition) => definition.afterPage === anchor).forEach((definition) => {
        for (let offset = 0; offset < (definition.count ?? 1); offset += 1) {
          rows.push({
            key: `${definition.id}:blank:${offset}`,
            kind: 'blank',
            label: definition.label,
            width: definition.width,
            height: definition.height,
          });
        }
      });
    }
    return rows;
  }, [blankPages, sourcePlan]);
  const outputPageCount = outputPlan.length;
  const outputPreview = outputPlan.slice(0, OUTPUT_PREVIEW_LIMIT);
  const sourceBytes = items.reduce((sum, item) => sum + item.file.size, 0);
  const formFieldTotal = items.reduce((sum, item) => sum + item.inspection.formFieldCount, 0);
  const formPolicyBlocked = formFieldTotal > 0 && !flatten;
  const authoredMetadata = metadataForExport(metadata);
  const authoredMetadataCount = authoredMetadata ? Object.values(authoredMetadata).filter((value) => value !== undefined).length : 0;
  const geometryError = geometryValidationError(outputPlan, geometryEdits);
  const activeGeometryKey = outputPlan.some((row) => row.key === geometryPageKey) ? geometryPageKey : (outputPlan[0]?.key ?? '');
  const activeGeometryRow = outputPlan.find((row) => row.key === activeGeometryKey);
  const activeBaselineBoxes = activeGeometryRow ? baseBoxes(activeGeometryRow) : null;
  const activeGeometryEdits = activeGeometryRow ? geometryEdits[activeGeometryRow.key] : undefined;
  const activeBoxes = activeBaselineBoxes ? {
    mediaBox: activeGeometryEdits?.mediaBox ?? activeBaselineBoxes.mediaBox,
    cropBox: activeGeometryEdits?.cropBox ?? activeBaselineBoxes.cropBox,
    bleedBox: activeGeometryEdits?.bleedBox ?? activeBaselineBoxes.bleedBox,
    trimBox: activeGeometryEdits?.trimBox ?? activeBaselineBoxes.trimBox,
  } : null;
  const pageBoxEdits = outputPlan.flatMap((row, index): PdfPageBoxEdit[] => {
    const edits = geometryEdits[row.key];
    return edits && Object.keys(edits).length ? [{ page: index + 1, ...edits }] : [];
  });
  const stagedBlankPageCount = blankPages.reduce((sum, definition) => sum + (definition.count ?? 1), 0);

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
      setStatus(`Added ${next.length} PDF${next.length === 1 ? '' : 's'} locally. Review page selections, form handling, page geometry, document properties, and export settings before processing.`);
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

  function selectBlankPreset(value: BlankPreset) {
    setBlankPreset(value);
    if (value !== 'custom') {
      setBlankWidthInches(BLANK_PRESETS[value].width);
      setBlankHeightInches(BLANK_PRESETS[value].height);
    }
  }

  function stageBlankPages() {
    if (!sourceOutputPageCount || blankAfterPage > sourceOutputPageCount) return;
    const baseWidth = blankWidthInches * POINTS_PER_INCH;
    const baseHeight = blankHeightInches * POINTS_PER_INCH;
    if (![baseWidth, baseHeight].every(Number.isFinite) || baseWidth <= 0 || baseHeight <= 0 || !Number.isInteger(blankCount) || blankCount < 1 || blankCount > 100) {
      setStatus('Blank pages need positive dimensions and a quantity from 1 to 100.');
      return;
    }
    const useEnteredOrientation = blankPreset === 'custom';
    const width = useEnteredOrientation ? baseWidth : blankOrientation === 'portrait' ? Math.min(baseWidth, baseHeight) : Math.max(baseWidth, baseHeight);
    const height = useEnteredOrientation ? baseHeight : blankOrientation === 'portrait' ? Math.max(baseWidth, baseHeight) : Math.min(baseWidth, baseHeight);
    const label = blankPreset === 'custom' ? 'Custom blank' : `${BLANK_PRESETS[blankPreset].label} blank`;
    setBlankPages((current) => [...current, {
      id: crypto.randomUUID(),
      label,
      afterPage: blankAfterPage,
      width: Number(width.toFixed(4)),
      height: Number(height.toFixed(4)),
      count: blankCount,
    }]);
    setStatus(`Staged ${blankCount} ${label.toLowerCase()} page${blankCount === 1 ? '' : 's'} after copied page ${blankAfterPage}.`);
  }

  function updateGeometry(boxName: BoxName, field: BoxField, rawValue: string) {
    if (!activeGeometryRow || !activeBaselineBoxes) return;
    const value = rawValue === '' ? 0 : Number(rawValue);
    setGeometryEdits((current) => {
      const rowEdits = current[activeGeometryRow.key] ?? {};
      const box = rowEdits[boxName] ?? activeBaselineBoxes[boxName];
      return {
        ...current,
        [activeGeometryRow.key]: {
          ...rowEdits,
          [boxName]: { ...box, [field]: value },
        },
      };
    });
  }

  function resetActiveGeometry() {
    if (!activeGeometryRow) return;
    setGeometryEdits((current) => {
      const next = { ...current };
      delete next[activeGeometryRow.key];
      return next;
    });
    setStatus('Page geometry reset to its current source/default boxes.');
  }

  function resetExportProperties() {
    setMetadata(EMPTY_METADATA);
    setOutputFilename('');
    setStatus('Output properties cleared. Source metadata will remain omitted unless you enter replacement values.');
  }

  async function process() {
    if (!items.length || hasPageError || formPolicyBlocked || blankPlanError || geometryError) return;
    setBusy(true);
    try {
      const selections = await Promise.all(items.map(async (item, index) => ({
        bytes: new Uint8Array(await item.file.arrayBuffer()),
        pages: pageStates[index].pages,
        rotate: item.rotate,
        flatten,
      })));
      const blankDefinitions: PdfBlankPageDefinition[] = blankPages.map(({ afterPage, width, height, count }) => ({ afterPage, width, height, count }));
      const bytes = await splicePdfs(selections, {
        metadata: authoredMetadata,
        blankPages: blankDefinitions,
        pageBoxEdits,
      });
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
      const structureSummary = `${stagedBlankPageCount ? ` ${stagedBlankPageCount} blank page${stagedBlankPageCount === 1 ? '' : 's'} inserted.` : ''}${pageBoxEdits.length ? ` ${pageBoxEdits.length} output page${pageBoxEdits.length === 1 ? '' : 's'} received explicit page-box edits.` : ''}`;
      setStatus(`Created ${outputPageCount} output page${outputPageCount === 1 ? '' : 's'} locally as ${filename} (${bytesLabel(bytes.byteLength)}; ${delta === 0 ? 'same size as sources' : `${delta > 0 ? '+' : '−'}${bytesLabel(Math.abs(delta))} versus source bytes`}).${formSummary}${metadataSummary}${structureSummary}`);
    } catch (error) {
      setStatus(`PDF processing failed: ${error instanceof Error ? error.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  }

  return <>
    <div className="workspace-header"><div><h2>PDF Workstation</h2><p>Prepare deterministic local PDF outputs: page order, selection, blank pages, page boxes, form flattening, metadata, and export naming.</p></div></div>
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
        <p className="help-text">Source standard metadata is not copied into the rebuilt output. Only replacement values entered here are intentionally written. Date/time fields are interpreted explicitly as UTC for deterministic exports.</p>
        <div className="workspace-grid three" style={{ marginTop: 14 }}>
          <div className="field"><label htmlFor="pdf-output-title">Output title</label><input id="pdf-output-title" value={metadata.title} onChange={(event) => updateMetadata('title', event.target.value)} autoComplete="off" /></div>
          <div className="field"><label htmlFor="pdf-output-author">Output author</label><input id="pdf-output-author" value={metadata.author} onChange={(event) => updateMetadata('author', event.target.value)} autoComplete="off" /></div>
          <div className="field"><label htmlFor="pdf-output-subject">Output subject</label><input id="pdf-output-subject" value={metadata.subject} onChange={(event) => updateMetadata('subject', event.target.value)} autoComplete="off" /></div>
          <div className="field"><label htmlFor="pdf-output-keywords">Output keywords</label><input id="pdf-output-keywords" value={metadata.keywords} onChange={(event) => updateMetadata('keywords', event.target.value)} placeholder="filed, reviewed, archive" autoComplete="off" /><small>Separate tags with commas.</small></div>
          <div className="field"><label htmlFor="pdf-output-creator">Output creator</label><input id="pdf-output-creator" value={metadata.creator} onChange={(event) => updateMetadata('creator', event.target.value)} autoComplete="off" /></div>
          <div className="field"><label htmlFor="pdf-output-producer">Output producer</label><input id="pdf-output-producer" value={metadata.producer} onChange={(event) => updateMetadata('producer', event.target.value)} autoComplete="off" /></div>
          <div className="field"><label htmlFor="pdf-output-language">Document language</label><input id="pdf-output-language" value={metadata.language} onChange={(event) => updateMetadata('language', event.target.value)} placeholder="en-US" autoComplete="off" /><small>Use a BCP 47 language tag when known.</small></div>
          <div className="field"><label htmlFor="pdf-output-creation-date">Output creation date/time (UTC)</label><input id="pdf-output-creation-date" type="datetime-local" value={metadata.creationDate} onChange={(event) => updateMetadata('creationDate', event.target.value)} /></div>
          <div className="field"><label htmlFor="pdf-output-modification-date">Output modification date/time (UTC)</label><input id="pdf-output-modification-date" type="datetime-local" value={metadata.modificationDate} onChange={(event) => updateMetadata('modificationDate', event.target.value)} /></div>
          <div className="field"><label htmlFor="pdf-output-filename">Output filename</label><input id="pdf-output-filename" value={outputFilename} onChange={(event) => setOutputFilename(event.target.value)} placeholder={outputName()} autoComplete="off" /><small>Leave blank for {outputName()}. “.pdf” is added when omitted.</small></div>
        </div>
        <div className="button-row"><button className="action-button secondary" type="button" onClick={resetExportProperties}>Clear replacement properties</button></div>
      </section> : null}

      {items.length && !hasPageError ? <section className="notice" style={{ marginTop: 18 }} aria-labelledby="pdf-blank-pages-title">
        <h3 id="pdf-blank-pages-title" style={{ margin: 0 }}>Blank page insertion</h3>
        <p className="help-text">Add local blank pages before the first copied page or after an exact copied-page anchor. Anchors stay deterministic even when multiple blank-page groups are staged.</p>
        <div className="workspace-grid three" style={{ marginTop: 14 }}>
          <div className="field"><label htmlFor="pdf-blank-size">Blank page size</label><select id="pdf-blank-size" value={blankPreset} onChange={(event) => selectBlankPreset(event.target.value as BlankPreset)}><option value="letter">Letter — 8.5 × 11 in</option><option value="a4">A4 — 210 × 297 mm</option><option value="legal">Legal — 8.5 × 14 in</option><option value="tabloid">Tabloid — 11 × 17 in</option><option value="custom">Custom inches</option></select></div>
          <div className="field"><label htmlFor="pdf-blank-orientation">Blank page orientation</label><select id="pdf-blank-orientation" value={blankOrientation} disabled={blankPreset === 'custom'} onChange={(event) => setBlankOrientation(event.target.value as 'portrait' | 'landscape')}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select><small>{blankPreset === 'custom' ? 'Custom dimensions use the width/height orientation entered below.' : 'Preset dimensions are swapped for landscape.'}</small></div>
          <div className="field"><label htmlFor="pdf-blank-after">Insert blank pages after</label><select id="pdf-blank-after" value={Math.min(blankAfterPage, sourceOutputPageCount)} onChange={(event) => setBlankAfterPage(Number(event.target.value))}><option value="0">Before first copied page</option>{sourcePlan.map((row, index) => <option key={row.key} value={String(index + 1)}>After copied page {index + 1} — {row.source} p. {row.page}</option>)}</select></div>
          <div className="field"><label htmlFor="pdf-blank-width">Blank width (inches)</label><input id="pdf-blank-width" type="number" min="0.01" step="0.01" value={blankWidthInches} disabled={blankPreset !== 'custom'} onChange={(event) => setBlankWidthInches(Number(event.target.value))} /></div>
          <div className="field"><label htmlFor="pdf-blank-height">Blank height (inches)</label><input id="pdf-blank-height" type="number" min="0.01" step="0.01" value={blankHeightInches} disabled={blankPreset !== 'custom'} onChange={(event) => setBlankHeightInches(Number(event.target.value))} /></div>
          <div className="field"><label htmlFor="pdf-blank-count">Blank page quantity</label><input id="pdf-blank-count" type="number" min="1" max="100" step="1" value={blankCount} onChange={(event) => setBlankCount(Number(event.target.value))} /></div>
        </div>
        <div className="button-row"><button className="action-button secondary" type="button" onClick={stageBlankPages}>Stage blank pages</button></div>
        {blankPages.length ? <ul style={{ margin: '10px 0 0', paddingInlineStart: 24 }}>{blankPages.map((definition) => <li key={definition.id}>{definition.count ?? 1} × {definition.label} · {definition.width.toFixed(2)} × {definition.height.toFixed(2)} pt · after copied page {definition.afterPage} <button className="action-button secondary" type="button" onClick={() => setBlankPages((current) => current.filter((item) => item.id !== definition.id))}>Remove</button></li>)}</ul> : null}
        {blankPlanError ? <p className="help-text" role="alert">{blankPlanError}</p> : null}
      </section> : null}

      {items.length && !hasPageError && outputPlan.length ? <section className="notice" style={{ marginTop: 18 }} aria-labelledby="pdf-page-geometry-title">
        <h3 id="pdf-page-geometry-title" style={{ margin: 0 }}>Page geometry</h3>
        <p className="help-text">Edit MediaBox, CropBox, BleedBox, and TrimBox for a final output page. Crop/Bleed/Trim boxes must remain inside the final MediaBox. Coordinates and dimensions are PDF points (72 points = 1 inch).</p>
        <div className="field" style={{ marginTop: 14 }}><label htmlFor="pdf-geometry-page">Geometry output page</label><select id="pdf-geometry-page" value={activeGeometryKey} onChange={(event) => setGeometryPageKey(event.target.value)}>{outputPlan.map((row, index) => <option key={row.key} value={row.key}>Output page {index + 1} — {row.kind === 'blank' ? row.label : `${row.source} page ${row.page}`}</option>)}</select></div>
        {activeBoxes ? <div style={{ marginTop: 14 }}>
          {BOX_NAMES.map(({ key, label }) => <fieldset key={key} style={{ border: 0, padding: 0, margin: '0 0 16px' }}><legend className="field-label">{label}</legend><div className="workspace-grid three">{BOX_FIELDS.map(({ key: field, label: fieldLabel }) => <div className="field" key={field}><label htmlFor={`pdf-${key}-${field}`}>{label} {fieldLabel}</label><input id={`pdf-${key}-${field}`} type="number" step="any" value={activeBoxes[key][field]} onChange={(event) => updateGeometry(key, field, event.target.value)} /></div>)}</div></fieldset>)}
          <div className="button-row"><button className="action-button secondary" type="button" onClick={resetActiveGeometry}>Reset this page geometry</button></div>
        </div> : null}
        {geometryError ? <p className="help-text" role="alert">{geometryError}</p> : <p className="help-text">{pageBoxEdits.length} output page{pageBoxEdits.length === 1 ? '' : 's'} currently has staged page-box edits.</p>}
      </section> : null}

      {items.length && !hasPageError ? <section className="notice" style={{ marginTop: 18 }} data-testid="pdf-output-preview" aria-labelledby="pdf-preview-title">
        <strong id="pdf-preview-title">Output page order preview</strong>
        <p className="help-text">Structural preview of copied and staged blank pages before export. {outputPageCount > OUTPUT_PREVIEW_LIMIT ? `Showing the first ${OUTPUT_PREVIEW_LIMIT} of ${outputPageCount} pages.` : `${outputPageCount} page${outputPageCount === 1 ? '' : 's'} planned.`}</p>
        <ol style={{ margin: '8px 0 0', paddingInlineStart: 24 }}>
          {outputPreview.map((row) => row.kind === 'source'
            ? <li key={row.key} style={{ overflowWrap: 'anywhere' }}>{row.source} · page {row.page}{row.rotate ? ` · rotate ${row.rotate}°` : ''}</li>
            : <li key={row.key} style={{ overflowWrap: 'anywhere' }}>Blank page · {row.label} · {row.width.toFixed(2)} × {row.height.toFixed(2)} pt</li>)}
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

      <div className="button-row"><button className="action-button" type="button" disabled={!items.length || busy || hasPageError || formPolicyBlocked || Boolean(blankPlanError) || Boolean(geometryError)} onClick={() => void process()}>Process and download</button><button className="action-button secondary" type="button" disabled={!items.length || busy} onClick={() => { setItems([]); setMetadata(EMPTY_METADATA); setOutputFilename(''); setBlankPages([]); setGeometryEdits({}); setGeometryPageKey(''); setStatus('Queue cleared. Choose PDFs to begin again.'); }}>Clear queue</button></div>
      <div className="status-line" role="status">{busy ? 'Processing PDF bytes locally…' : status}</div>
      <div className="notice"><strong>Current sanitization boundary</strong><p className="help-text">Output is rebuilt into a new PDF, so source document-level Info/catalog metadata is not intentionally carried forward. Replacement metadata above is opt-in. Selected page content and page-level annotations are preserved; this stage is not yet the workstation's planned malware analysis, secure redaction, or active-content sanitization system.</p></div>
    </div>
  </>;
}

import { useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { downloadBlob, downloadText } from '../../lib/download';
import VectorCanvas from './VectorCanvas';
import {
  addElement,
  alignSelection,
  baseElement,
  createHistory,
  createVectorDocument,
  distributeSelection,
  duplicateSelection,
  groupSelection,
  mirrorSelection,
  moveSelection,
  pushHistory,
  radialRepeatSelection,
  redoHistory,
  removeSelection,
  reorderSelection,
  selectionBounds,
  undoHistory,
  ungroupSelection,
  updateElement,
} from './vector-engine';
import {
  buildImageEmbed,
  buildInlineEmbed,
  buildSvgDataUri,
  optimizeVectorSvg,
  parseVectorProject,
  renderVectorPdf,
  renderVectorRaster,
  serializeVectorProject,
  serializeVectorSvg,
} from './vector-export';
import type { VectorDocument, VectorElement, VectorExportSettings, VectorFill, VectorTool } from './vector-types';
import './vector-studio.css';

const TOOLS: Array<{ id: VectorTool; label: string; key: string }> = [
  { id: 'select', label: 'Select', key: 'V' },
  { id: 'rect', label: 'Rectangle', key: 'R' },
  { id: 'ellipse', label: 'Ellipse', key: 'O' },
  { id: 'line', label: 'Line', key: 'L' },
  { id: 'polygon', label: 'Polygon', key: 'G' },
  { id: 'star', label: 'Star', key: 'S' },
  { id: 'pen', label: 'Pen', key: 'P' },
  { id: 'pencil', label: 'Pencil', key: 'N' },
  { id: 'text', label: 'Text', key: 'T' },
  { id: 'pan', label: 'Pan', key: 'H' },
];

const EXPORT_DEFAULTS: VectorExportSettings = {
  filename: 'vector-artwork',
  format: 'svg',
  scale: 2,
  quality: 0.92,
  responsive: true,
  includeBackground: false,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function tagsFromInput(value: string): string[] {
  return [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))];
}

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === 'string' ? resolve(reader.result) : reject(new Error('Unable to read image.'));
    reader.onerror = () => reject(reader.error ?? new Error('Unable to read image.'));
    reader.readAsDataURL(file);
  });
}

function elementFillFromSvg(node: Element): VectorFill {
  const fill = node.getAttribute('fill')?.trim() || '#7c3aed';
  return { kind: 'solid', color: fill.startsWith('url(') ? '#7c3aed' : fill };
}

function readNumber(node: Element, name: string, fallback: number): number {
  const value = Number.parseFloat(node.getAttribute(name) ?? '');
  return Number.isFinite(value) ? value : fallback;
}

function svgElementToVector(node: Element, index: number): VectorElement | null {
  const tag = node.tagName.toLowerCase();
  const id = `import-${tag}-${index + 1}`;
  const fill = elementFillFromSvg(node);
  const strokeWidth = Math.max(0, readNumber(node, 'stroke-width', 0));
  const stroke = { color: node.getAttribute('stroke') || '#111827', width: strokeWidth, linecap: 'round' as const, linejoin: 'round' as const, dash: node.getAttribute('stroke-dasharray') || '' };
  const common = { id, name: `Imported ${tag}`, rotation: 0, opacity: clamp(readNumber(node, 'opacity', 1), 0, 1), visible: true, locked: false, fill, stroke, blendMode: 'normal' as const, title: '', description: '' };
  if (tag === 'rect') {
    const x = readNumber(node, 'x', 0); const y = readNumber(node, 'y', 0); const width = readNumber(node, 'width', 100); const height = readNumber(node, 'height', 100);
    return { ...common, type: 'rect', x, y, width, height, cornerRadius: readNumber(node, 'rx', 0) };
  }
  if (tag === 'ellipse' || tag === 'circle') {
    const cx = readNumber(node, 'cx', 50); const cy = readNumber(node, 'cy', 50); const rx = tag === 'circle' ? readNumber(node, 'r', 50) : readNumber(node, 'rx', 50); const ry = tag === 'circle' ? rx : readNumber(node, 'ry', 50);
    return { ...common, type: 'ellipse', x: cx - rx, y: cy - ry, width: rx * 2, height: ry * 2 };
  }
  if (tag === 'line') {
    const x = readNumber(node, 'x1', 0); const y = readNumber(node, 'y1', 0); const x2 = readNumber(node, 'x2', 100); const y2 = readNumber(node, 'y2', 100);
    return { ...common, type: 'line', x, y, x2, y2, width: Math.abs(x2 - x), height: Math.abs(y2 - y) || 1, fill: { kind: 'solid', color: 'none' }, stroke: { ...stroke, width: strokeWidth || 2 } };
  }
  if (tag === 'path') {
    return { ...common, type: 'path', x: 0, y: 0, width: 100, height: 100, d: node.getAttribute('d') || '', closed: /z\s*$/i.test(node.getAttribute('d') || '') };
  }
  if (tag === 'text') {
    const x = readNumber(node, 'x', 0); const y = readNumber(node, 'y', 48); const fontSize = readNumber(node, 'font-size', 48);
    return { ...common, type: 'text', x, y: y - fontSize, width: Math.max(80, (node.textContent || '').length * fontSize * 0.6), height: fontSize * 1.25, text: node.textContent || 'Text', fontFamily: node.getAttribute('font-family') || 'system-ui, sans-serif', fontSize, fontWeight: readNumber(node, 'font-weight', 400), letterSpacing: readNumber(node, 'letter-spacing', 0), textAnchor: 'start' };
  }
  if (tag === 'image') {
    const href = node.getAttribute('href') || node.getAttribute('xlink:href') || '';
    if (!href.startsWith('data:')) return null;
    return { ...common, type: 'image', x: readNumber(node, 'x', 0), y: readNumber(node, 'y', 0), width: readNumber(node, 'width', 240), height: readNumber(node, 'height', 180), href, preserveAspectRatio: node.getAttribute('preserveAspectRatio') || 'xMidYMid meet' };
  }
  return null;
}

function importSvg(source: string): VectorDocument {
  const parser = new DOMParser();
  const xml = parser.parseFromString(source, 'image/svg+xml');
  if (xml.querySelector('parsererror') || xml.documentElement.tagName.toLowerCase() !== 'svg') throw new Error('The selected file is not a valid SVG document.');
  xml.querySelectorAll('script,foreignObject,iframe,object,embed').forEach((node) => node.remove());
  xml.querySelectorAll('*').forEach((node) => {
    for (const attribute of [...node.attributes]) {
      if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
      if (/^(?:href|xlink:href)$/i.test(attribute.name) && !attribute.value.startsWith('#') && !attribute.value.startsWith('data:')) node.removeAttribute(attribute.name);
    }
  });
  const root = xml.documentElement;
  const viewBox = (root.getAttribute('viewBox') || '').trim().split(/[ ,]+/).map(Number);
  const width = viewBox.length === 4 && Number.isFinite(viewBox[2]) ? viewBox[2] : readNumber(root, 'width', 1200);
  const height = viewBox.length === 4 && Number.isFinite(viewBox[3]) ? viewBox[3] : readNumber(root, 'height', 800);
  const document = createVectorDocument();
  const elements = [...root.querySelectorAll('rect,ellipse,circle,line,path,text,image')].map(svgElementToVector).filter((element): element is VectorElement => element !== null);
  return {
    ...document,
    name: root.querySelector(':scope > title')?.textContent?.trim() || 'Imported SVG',
    artboard: { ...document.artboard, width: clamp(width || 1200, 1, 100000), height: clamp(height || 800, 1, 100000) },
    metadata: { ...document.metadata, title: root.querySelector(':scope > title')?.textContent?.trim() || '', description: root.querySelector(':scope > desc')?.textContent?.trim() || '' },
    elements,
  };
}

function starterDocument(kind: 'logo' | 'icon' | 'poster'): VectorDocument {
  let document = createVectorDocument();
  if (kind === 'logo') {
    document = { ...document, name: 'Logo starter', artboard: { ...document.artboard, width: 1200, height: 480, gridSize: 20 } };
    const mark: VectorElement = { ...baseElement('ellipse', 'Brand mark', 120, 120, 240, 240), type: 'ellipse', fill: { kind: 'linear-gradient', start: '#7c3aed', end: '#06b6d4', angle: 35 } };
    const text: VectorElement = { ...baseElement('text', 'Wordmark', 420, 150, 620, 140), type: 'text', text: 'Northstar', fontFamily: 'system-ui, sans-serif', fontSize: 104, fontWeight: 800, letterSpacing: -2, textAnchor: 'start', fill: { kind: 'solid', color: '#111827' } };
    return addElement(addElement(document, mark), text);
  }
  if (kind === 'icon') {
    document = { ...document, name: 'Icon starter', artboard: { ...document.artboard, width: 512, height: 512, gridSize: 16 } };
    const tile: VectorElement = { ...baseElement('rect', 'Icon tile', 56, 56, 400, 400), type: 'rect', cornerRadius: 96, fill: { kind: 'linear-gradient', start: '#2563eb', end: '#7c3aed', angle: 45 } };
    return addElement(document, tile);
  }
  document = { ...document, name: 'Poster starter', artboard: { ...document.artboard, width: 1080, height: 1350, gridSize: 30 } };
  const background: VectorElement = { ...baseElement('rect', 'Poster field', 0, 0, 1080, 1350), type: 'rect', cornerRadius: 0, fill: { kind: 'linear-gradient', start: '#111827', end: '#312e81', angle: 125 } };
  const title: VectorElement = { ...baseElement('text', 'Headline', 100, 160, 800, 220), type: 'text', text: 'MAKE IT BOLD', fontFamily: 'system-ui, sans-serif', fontSize: 116, fontWeight: 900, letterSpacing: 2, textAnchor: 'start', fill: { kind: 'solid', color: '#ffffff' } };
  return addElement(addElement(document, background), title);
}

export default function VectorStudio() {
  const [history, setHistory] = useState(() => createHistory(createVectorDocument()));
  const document = history.present;
  const [selection, setSelection] = useState<string[]>([]);
  const [tool, setTool] = useState<VectorTool>('select');
  const [zoom, setZoom] = useState(0.7);
  const [status, setStatus] = useState('Ready. Choose a tool or start with a template.');
  const [exportSettings, setExportSettings] = useState<VectorExportSettings>(EXPORT_DEFAULTS);
  const [sourcePreview, setSourcePreview] = useState('');
  const [panel, setPanel] = useState<'design' | 'layers' | 'export'>('design');
  const rootRef = useRef<HTMLElement | null>(null);

  const selectedElements = useMemo(() => document.elements.filter((element) => selection.includes(element.id)), [document.elements, selection]);
  const primary = selectedElements[0] ?? null;
  const bounds = useMemo(() => selectionBounds(document, selection), [document, selection]);

  function commit(next: VectorDocument, nextSelection = selection, message?: string) {
    setHistory((current) => pushHistory(current, next));
    setSelection(nextSelection);
    setSourcePreview('');
    if (message) setStatus(message);
  }

  function replaceDocument(next: VectorDocument, message: string) {
    setHistory(createHistory(next));
    setSelection([]);
    setSourcePreview('');
    setStatus(message);
  }

  function undo() {
    setHistory((current) => {
      const next = undoHistory(current);
      if (next !== current) setStatus('Undid the last change.');
      return next;
    });
    setSelection([]);
  }

  function redo() {
    setHistory((current) => {
      const next = redoHistory(current);
      if (next !== current) setStatus('Redid the change.');
      return next;
    });
    setSelection([]);
  }

  function transformPrimary(field: 'x' | 'y' | 'width' | 'height' | 'rotation' | 'opacity', value: number) {
    if (!primary || !Number.isFinite(value)) return;
    if (field === 'x') return commit(moveSelection(document, [primary.id], value - primary.x, 0), selection);
    if (field === 'y') return commit(moveSelection(document, [primary.id], 0, value - primary.y), selection);
    if (field === 'width' || field === 'height') return commit(updateElement(document, primary.id, { [field]: Math.max(1, value) } as Partial<VectorElement>), selection);
    if (field === 'rotation') return commit(updateElement(document, primary.id, { rotation: value } as Partial<VectorElement>), selection);
    commit(updateElement(document, primary.id, { opacity: clamp(value, 0, 1) } as Partial<VectorElement>), selection);
  }

  function updateSelected(patch: Partial<VectorElement>, message?: string) {
    if (!selection.length) return;
    let next = document;
    for (const id of selection) next = updateElement(next, id, patch);
    commit(next, selection, message);
  }

  function setFillKind(kind: VectorFill['kind']) {
    const fill: VectorFill = kind === 'solid' ? { kind, color: '#7c3aed' }
      : kind === 'linear-gradient' ? { kind, start: '#7c3aed', end: '#06b6d4', angle: 45 }
        : kind === 'radial-gradient' ? { kind, start: '#ffffff', end: '#7c3aed', cx: 50, cy: 50 }
          : { kind, foreground: '#7c3aed', background: '#ffffff', size: 24, rotation: 45, pattern: 'stripes' };
    updateSelected({ fill } as Partial<VectorElement>, 'Fill style changed.');
  }

  function changeFill(patch: Record<string, string | number>) {
    if (!primary) return;
    updateSelected({ fill: { ...primary.fill, ...patch } as VectorFill } as Partial<VectorElement>);
  }

  function duplicate() {
    const result = duplicateSelection(document, selection);
    commit(result.document, result.selection, `Duplicated ${result.selection.length} object${result.selection.length === 1 ? '' : 's'}.`);
  }

  function group() {
    const result = groupSelection(document, selection);
    commit(result.document, result.selection, result.selection.length === 1 ? 'Selection grouped.' : undefined);
  }

  function ungroup() {
    if (!primary || primary.type !== 'group') return;
    const result = ungroupSelection(document, primary.id);
    commit(result.document, result.selection, 'Group released into editable objects.');
  }

  function repeatGrid() {
    if (!selection.length || !bounds) return;
    let next = document;
    const created: string[] = [];
    for (let row = 0; row < 3; row += 1) for (let column = 0; column < 3; column += 1) {
      if (row === 0 && column === 0) continue;
      const result = duplicateSelection(next, selection, column * (bounds.width + 24), row * (bounds.height + 24));
      next = result.document;
      created.push(...result.selection);
    }
    commit(next, created, 'Created a 3 × 3 editable repeat grid.');
  }

  function repeatRadial() {
    if (!selection.length) return;
    const result = radialRepeatSelection(document, selection, 8, { x: document.artboard.width / 2, y: document.artboard.height / 2 });
    commit(result.document, result.selection, 'Created an eight-part radial repeat around the artboard center.');
  }

  function createSymbol() {
    if (!selection.length || !bounds) return;
    const selected = document.elements.filter((element) => selection.includes(element.id));
    const symbolId = `symbol-${Date.now().toString(36)}`;
    const instance: VectorElement = {
      ...baseElement('symbol-instance', 'Symbol instance', bounds.x, bounds.y, Math.max(1, bounds.width), Math.max(1, bounds.height)),
      type: 'symbol-instance',
      symbolId,
      fill: { kind: 'solid', color: 'none' },
    };
    const selectedIds = new Set(selection);
    const next: VectorDocument = {
      ...document,
      symbols: [...document.symbols, { id: symbolId, name: primary?.name || 'Component', viewBox: `${bounds.x} ${bounds.y} ${Math.max(1, bounds.width)} ${Math.max(1, bounds.height)}`, elements: selected }],
      elements: [...document.elements.filter((element) => !selectedIds.has(element.id)), instance],
    };
    commit(next, [instance.id], 'Selection converted to a reusable SVG symbol component.');
  }

  function updateArtboard(patch: Partial<VectorDocument['artboard']>) {
    commit({ ...document, artboard: { ...document.artboard, ...patch } }, selection);
  }

  function applyPreset(value: string) {
    const [width, height] = value.split('x').map(Number);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;
    updateArtboard({ width, height });
  }

  async function importProject(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      replaceDocument(parseVectorProject(await file.text()), `Opened ${file.name}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Project import failed.');
    }
  }

  async function importSvgFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const next = importSvg(await file.text());
      replaceDocument(next, `Imported ${next.elements.length} editable SVG object${next.elements.length === 1 ? '' : 's'} from ${file.name}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'SVG import failed.');
    }
  }

  async function importImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const href = await fileAsDataUrl(file);
      const image: VectorElement = { ...baseElement('image', file.name, 120, 120, 480, 320), type: 'image', href, preserveAspectRatio: 'xMidYMid meet', fill: { kind: 'solid', color: 'none' } };
      commit(addElement(document, image), [image.id], `${file.name} embedded locally in the document.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Image import failed.');
    }
  }

  function metadataDocument(): VectorDocument {
    return document;
  }

  function previewSvg() {
    const svg = serializeVectorSvg(metadataDocument(), { responsive: exportSettings.responsive, includeBackground: exportSettings.includeBackground });
    setSourcePreview(exportSettings.format === 'svg-optimized' ? optimizeVectorSvg(svg) : svg);
    setPanel('export');
    setStatus('SVG source preview refreshed from the current document.');
  }

  async function copy(value: string, success: string) {
    try {
      await navigator.clipboard.writeText(value);
      setStatus(success);
    } catch {
      setStatus('Clipboard access was unavailable. Use the source preview and copy manually.');
    }
  }

  async function exportFile() {
    const cleanName = exportSettings.filename.trim().replace(/[\\/:*?"<>|]+/g, '-') || 'vector-artwork';
    const svg = serializeVectorSvg(document, { responsive: exportSettings.responsive, includeBackground: exportSettings.includeBackground });
    try {
      if (exportSettings.format === 'svg') return downloadText(svg, `${cleanName}.svg`, 'image/svg+xml;charset=utf-8');
      if (exportSettings.format === 'svg-optimized') return downloadText(optimizeVectorSvg(svg), `${cleanName}.svg`, 'image/svg+xml;charset=utf-8');
      if (exportSettings.format === 'json') return downloadText(serializeVectorProject(document), `${cleanName}.inmovector.json`, 'application/json;charset=utf-8');
      if (exportSettings.format === 'pdf') return downloadBlob(await renderVectorPdf(document, { scale: exportSettings.scale, background: exportSettings.includeBackground ? document.artboard.background : undefined }), `${cleanName}.pdf`);
      const blob = await renderVectorRaster(document, { format: exportSettings.format, scale: exportSettings.scale, quality: exportSettings.quality, background: exportSettings.includeBackground ? document.artboard.background : undefined });
      downloadBlob(blob, `${cleanName}.${exportSettings.format === 'jpeg' ? 'jpg' : exportSettings.format}`);
      setStatus(`${exportSettings.format.toUpperCase()} export prepared locally.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Export failed.');
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLElement>) {
    const target = event.target as HTMLElement;
    const editable = target.matches('input,textarea,select,[contenteditable="true"]');
    if (!editable && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
      return;
    }
    if (!editable && (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
      event.preventDefault(); duplicate(); return;
    }
    if (!editable && (event.key === 'Delete' || event.key === 'Backspace') && selection.length) {
      event.preventDefault(); commit(removeSelection(document, selection), [], 'Selection deleted.'); return;
    }
    if (!editable && selection.length && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const amount = event.shiftKey ? 10 : 1;
      const dx = event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0;
      const dy = event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0;
      commit(moveSelection(document, selection, dx, dy), selection);
      return;
    }
    if (!editable && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const match = TOOLS.find((item) => item.key.toLowerCase() === event.key.toLowerCase());
      if (match) setTool(match.id);
    }
  }

  const tagText = document.metadata.tags.join(', ');

  return <section ref={rootRef} className="vector-studio" aria-labelledby="vector-studio-title" onKeyDown={onKeyDown}>
    <header className="vector-studio-header">
      <div>
        <span className="vector-kicker">Scalable illustration workspace</span>
        <h2 id="vector-studio-title">Vector Studio</h2>
        <p>Draw, style, organize, and export standards-native vector artwork entirely in your browser. Start simple; precision controls remain available whenever you need them.</p>
      </div>
      <div className="vector-header-actions" aria-label="Document history and view controls">
        <button type="button" onClick={undo} disabled={!history.past.length} aria-label="Undo">↶ <span>Undo</span></button>
        <button type="button" onClick={redo} disabled={!history.future.length} aria-label="Redo">↷ <span>Redo</span></button>
        <button type="button" onClick={() => setZoom((value) => clamp(Number((value - 0.1).toFixed(2)), 0.2, 3))} aria-label="Zoom out">−</button>
        <button type="button" onClick={() => setZoom(0.7)} aria-label="Fit artboard">Fit</button>
        <button type="button" onClick={() => setZoom(1)} aria-label="Zoom to 100 percent">100%</button>
        <button type="button" onClick={() => setZoom((value) => clamp(Number((value + 0.1).toFixed(2)), 0.2, 3))} aria-label="Zoom in">+</button>
      </div>
    </header>

    <div className="vector-template-row" aria-label="Starter documents">
      <span>Start:</span>
      <button type="button" onClick={() => replaceDocument(createVectorDocument(), 'Started a blank vector document.')}>Blank</button>
      <button type="button" onClick={() => replaceDocument(starterDocument('logo'), 'Logo starter loaded.')}>Logo</button>
      <button type="button" onClick={() => replaceDocument(starterDocument('icon'), 'Icon starter loaded.')}>App icon</button>
      <button type="button" onClick={() => replaceDocument(starterDocument('poster'), 'Poster starter loaded.')}>Poster</button>
      <label className="vector-file-button">Open project<input id="vector-project-import" type="file" accept="application/json,.json,.inmovector.json" onChange={importProject}/></label>
      <label className="vector-file-button">Import SVG<input id="vector-svg-import" type="file" accept="image/svg+xml,.svg" onChange={importSvgFile}/></label>
      <label className="vector-file-button">Place image<input id="vector-image-import" type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={importImage}/></label>
    </div>

    <div className="vector-mobile-tabs" role="tablist" aria-label="Vector Studio panels">
      {(['design', 'layers', 'export'] as const).map((id) => <button key={id} type="button" role="tab" aria-selected={panel === id} onClick={() => setPanel(id)}>{id === 'design' ? 'Design' : id === 'layers' ? 'Layers' : 'Export'}</button>)}
    </div>

    <div className="vector-editor-grid">
      <aside className="vector-tool-rail" aria-label="Drawing tools">
        {TOOLS.map((item) => <button key={item.id} type="button" className={tool === item.id ? 'active' : ''} aria-pressed={tool === item.id} aria-label={`${item.label} tool`} title={`${item.label} (${item.key})`} onClick={() => setTool(item.id)}><span className="vector-tool-glyph" aria-hidden="true">{item.id === 'select' ? '↖' : item.id === 'rect' ? '□' : item.id === 'ellipse' ? '○' : item.id === 'line' ? '╱' : item.id === 'polygon' ? '⬡' : item.id === 'star' ? '☆' : item.id === 'pen' ? '⌁' : item.id === 'pencil' ? '✎' : item.id === 'text' ? 'T' : '✋'}</span><span className="vector-tool-label">{item.label}</span></button>)}
      </aside>

      <main className="vector-stage">
        <VectorCanvas document={document} selection={selection} tool={tool} zoom={zoom} onDocumentChange={(next, nextSelection) => commit(next, nextSelection ?? selection)} onSelectionChange={setSelection} onStatus={setStatus}/>
      </main>

      <aside className={`vector-inspector ${panel !== 'design' ? 'vector-mobile-hidden' : ''}`} aria-label="Vector inspector">
        <section className="vector-panel">
          <div className="vector-panel-heading"><h3>Precision</h3><span>{selection.length ? `${selection.length} selected` : 'Nothing selected'}</span></div>
          {primary ? <>
            <label>Name<input value={primary.name} onChange={(event) => updateSelected({ name: event.target.value } as Partial<VectorElement>)}/></label>
            <div className="vector-field-grid four">
              <label>X<input id="vector-x" type="number" value={Number(primary.x.toFixed(2))} onChange={(event) => transformPrimary('x', Number(event.target.value))}/></label>
              <label>Y<input id="vector-y" type="number" value={Number(primary.y.toFixed(2))} onChange={(event) => transformPrimary('y', Number(event.target.value))}/></label>
              <label>W<input id="vector-width" type="number" min="1" value={Number(primary.width.toFixed(2))} onChange={(event) => transformPrimary('width', Number(event.target.value))}/></label>
              <label>H<input id="vector-height" type="number" min="1" value={Number(primary.height.toFixed(2))} onChange={(event) => transformPrimary('height', Number(event.target.value))}/></label>
            </div>
            <div className="vector-field-grid two"><label>Rotation<input type="number" value={Number(primary.rotation.toFixed(2))} onChange={(event) => transformPrimary('rotation', Number(event.target.value))}/></label><label>Opacity<input type="number" min="0" max="1" step="0.05" value={Number(primary.opacity.toFixed(2))} onChange={(event) => transformPrimary('opacity', Number(event.target.value))}/></label></div>
            {primary.type === 'rect' ? <label>Corner radius<input type="range" min="0" max={Math.max(1, Math.min(primary.width, primary.height) / 2)} value={primary.cornerRadius} onChange={(event) => updateSelected({ cornerRadius: Number(event.target.value) } as Partial<VectorElement>)}/></label> : null}
            {primary.type === 'text' ? <><label>Text<textarea value={primary.text} onChange={(event) => updateSelected({ text: event.target.value } as Partial<VectorElement>)}/></label><div className="vector-field-grid two"><label>Font size<input type="number" min="4" max="1000" value={primary.fontSize} onChange={(event) => updateSelected({ fontSize: Number(event.target.value) } as Partial<VectorElement>)}/></label><label>Weight<input type="number" min="100" max="900" step="100" value={primary.fontWeight} onChange={(event) => updateSelected({ fontWeight: Number(event.target.value) } as Partial<VectorElement>)}/></label></div><label>Font family<input value={primary.fontFamily} onChange={(event) => updateSelected({ fontFamily: event.target.value } as Partial<VectorElement>)}/></label></> : null}
            {primary.type === 'path' ? <label>Path data<textarea rows={3} value={primary.d} onChange={(event) => updateSelected({ d: event.target.value } as Partial<VectorElement>)}/></label> : null}
          </> : <p className="vector-empty">Choose an object on the artboard or in Layers. Numeric controls are available as an alternative to dragging.</p>}
        </section>

        <section className="vector-panel">
          <h3>Arrange</h3>
          <div className="vector-button-grid compact">
            <button type="button" onClick={() => commit(alignSelection(document, selection, 'left'), selection)} disabled={!selection.length} aria-label="Align left">Left</button>
            <button type="button" onClick={() => commit(alignSelection(document, selection, 'center'), selection)} disabled={!selection.length} aria-label="Align center">Center</button>
            <button type="button" onClick={() => commit(alignSelection(document, selection, 'right'), selection)} disabled={!selection.length} aria-label="Align right">Right</button>
            <button type="button" onClick={() => commit(alignSelection(document, selection, 'top'), selection)} disabled={!selection.length} aria-label="Align top">Top</button>
            <button type="button" onClick={() => commit(alignSelection(document, selection, 'middle'), selection)} disabled={!selection.length} aria-label="Align middle">Middle</button>
            <button type="button" onClick={() => commit(alignSelection(document, selection, 'bottom'), selection)} disabled={!selection.length} aria-label="Align bottom">Bottom</button>
            <button type="button" onClick={() => commit(distributeSelection(document, selection, 'horizontal'), selection)} disabled={selection.length < 3}>Distribute ↔</button>
            <button type="button" onClick={() => commit(distributeSelection(document, selection, 'vertical'), selection)} disabled={selection.length < 3}>Distribute ↕</button>
          </div>
          <div className="vector-button-row wrap">
            <button type="button" onClick={duplicate} disabled={!selection.length} aria-label="Duplicate selection">Duplicate</button>
            <button type="button" onClick={group} disabled={selection.length < 2}>Group</button>
            <button type="button" onClick={ungroup} disabled={primary?.type !== 'group'}>Ungroup</button>
            <button type="button" onClick={() => commit(removeSelection(document, selection), [], 'Selection deleted.')} disabled={!selection.length}>Delete</button>
          </div>
          <div className="vector-button-row wrap">
            <button type="button" onClick={() => commit(reorderSelection(document, selection, 'back'), selection)} disabled={!selection.length} aria-label="Send to back">Back</button>
            <button type="button" onClick={() => commit(reorderSelection(document, selection, 'backward'), selection)} disabled={!selection.length} aria-label="Send backward">Backward</button>
            <button type="button" onClick={() => commit(reorderSelection(document, selection, 'forward'), selection)} disabled={!selection.length} aria-label="Bring forward">Forward</button>
            <button type="button" onClick={() => commit(reorderSelection(document, selection, 'front'), selection)} disabled={!selection.length} aria-label="Bring to front">Front</button>
          </div>
          <div className="vector-button-row wrap">
            <button type="button" onClick={() => commit(mirrorSelection(document, selection, 'horizontal'), selection, 'Selection mirrored horizontally.')} disabled={!selection.length}>Mirror H</button>
            <button type="button" onClick={() => commit(mirrorSelection(document, selection, 'vertical'), selection, 'Selection mirrored vertically.')} disabled={!selection.length}>Mirror V</button>
            <button type="button" onClick={repeatGrid} disabled={!selection.length}>3×3 repeat</button>
            <button type="button" onClick={repeatRadial} disabled={!selection.length}>Radial ×8</button>
            <button type="button" onClick={createSymbol} disabled={!selection.length}>Make symbol</button>
          </div>
        </section>

        <section className="vector-panel">
          <h3>Appearance</h3>
          {primary ? <>
            <label>Fill style<select value={primary.fill.kind} onChange={(event) => setFillKind(event.target.value as VectorFill['kind'])}><option value="solid">Solid</option><option value="linear-gradient">Linear gradient</option><option value="radial-gradient">Radial gradient</option><option value="pattern">Pattern</option></select></label>
            {primary.fill.kind === 'solid' ? <label>Fill color<input type="color" value={primary.fill.color === 'none' ? '#ffffff' : primary.fill.color} onChange={(event) => changeFill({ color: event.target.value })}/></label> : null}
            {primary.fill.kind === 'linear-gradient' ? <><div className="vector-field-grid two"><label>Start<input type="color" value={primary.fill.start} onChange={(event) => changeFill({ start: event.target.value })}/></label><label>End<input type="color" value={primary.fill.end} onChange={(event) => changeFill({ end: event.target.value })}/></label></div><label>Gradient angle<input type="range" min="0" max="360" value={primary.fill.angle} onChange={(event) => changeFill({ angle: Number(event.target.value) })}/></label></> : null}
            {primary.fill.kind === 'radial-gradient' ? <div className="vector-field-grid two"><label>Center<input type="color" value={primary.fill.start} onChange={(event) => changeFill({ start: event.target.value })}/></label><label>Edge<input type="color" value={primary.fill.end} onChange={(event) => changeFill({ end: event.target.value })}/></label></div> : null}
            {primary.fill.kind === 'pattern' ? <><label>Pattern<select value={primary.fill.pattern} onChange={(event) => changeFill({ pattern: event.target.value })}><option value="stripes">Stripes</option><option value="dots">Dots</option><option value="grid">Grid</option></select></label><div className="vector-field-grid two"><label>Size<input type="number" min="2" value={primary.fill.size} onChange={(event) => changeFill({ size: Number(event.target.value) })}/></label><label>Angle<input type="number" value={primary.fill.rotation} onChange={(event) => changeFill({ rotation: Number(event.target.value) })}/></label></div></> : null}
            <div className="vector-swatch-row" aria-label="Document swatches">{document.swatches.map((swatch) => <button key={swatch} type="button" className="vector-swatch" style={{ background: swatch }} aria-label={`Apply ${swatch} fill`} onClick={() => updateSelected({ fill: { kind: 'solid', color: swatch } } as Partial<VectorElement>)}/>)}</div>
            <div className="vector-field-grid two"><label>Stroke<input type="color" value={primary.stroke.color} onChange={(event) => updateSelected({ stroke: { ...primary.stroke, color: event.target.value } } as Partial<VectorElement>)}/></label><label>Width<input type="number" min="0" step="0.5" value={primary.stroke.width} onChange={(event) => updateSelected({ stroke: { ...primary.stroke, width: Math.max(0, Number(event.target.value)) } } as Partial<VectorElement>)}/></label></div>
            <div className="vector-field-grid two"><label>Cap<select value={primary.stroke.linecap} onChange={(event) => updateSelected({ stroke: { ...primary.stroke, linecap: event.target.value as 'butt' | 'round' | 'square' } } as Partial<VectorElement>)}><option value="butt">Butt</option><option value="round">Round</option><option value="square">Square</option></select></label><label>Join<select value={primary.stroke.linejoin} onChange={(event) => updateSelected({ stroke: { ...primary.stroke, linejoin: event.target.value as 'miter' | 'round' | 'bevel' } } as Partial<VectorElement>)}><option value="miter">Miter</option><option value="round">Round</option><option value="bevel">Bevel</option></select></label></div>
            <label>Dash pattern<input placeholder="8 4" value={primary.stroke.dash} onChange={(event) => updateSelected({ stroke: { ...primary.stroke, dash: event.target.value } } as Partial<VectorElement>)}/></label>
            <label>Blend<select value={primary.blendMode} onChange={(event) => updateSelected({ blendMode: event.target.value as VectorElement['blendMode'] } as Partial<VectorElement>)}>{['normal','multiply','screen','overlay','darken','lighten','difference','exclusion'].map((mode) => <option key={mode}>{mode}</option>)}</select></label>
          </> : <p className="vector-empty">Appearance controls follow the selected object.</p>}
        </section>

        <section className="vector-panel">
          <h3>Accessible description</h3>
          <label>Object title<input value={primary?.title ?? ''} disabled={!primary} onChange={(event) => updateSelected({ title: event.target.value } as Partial<VectorElement>)}/></label>
          <label>Object description<textarea rows={2} value={primary?.description ?? ''} disabled={!primary} onChange={(event) => updateSelected({ description: event.target.value } as Partial<VectorElement>)}/></label>
        </section>
      </aside>

      <aside className={`vector-layers ${panel !== 'layers' ? 'vector-mobile-hidden' : ''}`} aria-label="Layers and artboard">
        <section className="vector-panel">
          <div className="vector-panel-heading"><h3>Layers</h3><span>{document.elements.length}</span></div>
          <div className="vector-layer-list">{[...document.elements].reverse().map((element) => <div key={element.id} data-testid="vector-layer" className={`vector-layer ${selection.includes(element.id) ? 'selected' : ''}`}>
            <button className="vector-layer-main" type="button" aria-pressed={selection.includes(element.id)} onClick={(event) => setSelection(event.shiftKey ? [...new Set([...selection, element.id])] : [element.id])}><span className="vector-layer-type">{element.type}</span><span>{element.name}</span></button>
            <button type="button" aria-label={`${element.visible ? 'Hide' : 'Show'} ${element.name}`} onClick={() => commit(updateElement(document, element.id, { visible: !element.visible } as Partial<VectorElement>), selection)}>{element.visible ? '◉' : '○'}</button>
            <button type="button" aria-label={`${element.locked ? 'Unlock' : 'Lock'} ${element.name}`} onClick={() => commit(updateElement(document, element.id, { locked: !element.locked } as Partial<VectorElement>), selection)}>{element.locked ? '🔒' : '◇'}</button>
          </div>)}</div>
        </section>
        <section className="vector-panel">
          <h3>Artboard</h3>
          <label>Preset<select defaultValue="custom" onChange={(event) => event.target.value !== 'custom' && applyPreset(event.target.value)}><option value="custom">Custom</option><option value="1920x1080">HD landscape</option><option value="1080x1080">Square social</option><option value="1080x1350">Portrait social</option><option value="512x512">App icon</option><option value="1200x628">Share card</option><option value="2480x3508">A4 at 300 ppi ratio</option></select></label>
          <div className="vector-field-grid two"><label>Width<input id="vector-artboard-width" type="number" min="1" max="100000" value={document.artboard.width} onChange={(event) => updateArtboard({ width: clamp(Number(event.target.value), 1, 100000) })}/></label><label>Height<input id="vector-artboard-height" type="number" min="1" max="100000" value={document.artboard.height} onChange={(event) => updateArtboard({ height: clamp(Number(event.target.value), 1, 100000) })}/></label></div>
          <label>Preview background<input type="color" value={document.artboard.background} onChange={(event) => updateArtboard({ background: event.target.value })}/></label>
          <label className="vector-check"><input type="checkbox" checked={document.artboard.gridVisible} onChange={(event) => updateArtboard({ gridVisible: event.target.checked })}/> Show grid</label>
          <label className="vector-check"><input type="checkbox" checked={document.artboard.snapToGrid} onChange={(event) => updateArtboard({ snapToGrid: event.target.checked })}/> Snap to grid</label>
          <label className="vector-check"><input type="checkbox" checked={document.artboard.snapToObjects} onChange={(event) => updateArtboard({ snapToObjects: event.target.checked })}/> Smart object guides</label>
          <label>Grid spacing<input type="number" min="2" max="1000" value={document.artboard.gridSize} onChange={(event) => updateArtboard({ gridSize: clamp(Number(event.target.value), 2, 1000) })}/></label>
        </section>
      </aside>

      <aside className={`vector-export-panel ${panel !== 'export' ? 'vector-mobile-hidden' : ''}`} aria-label="Export options">
        <section className="vector-panel">
          <div className="vector-panel-heading"><h3>Export</h3><span>Local</span></div>
          <label>Filename<input value={exportSettings.filename} onChange={(event) => setExportSettings((current) => ({ ...current, filename: event.target.value }))}/></label>
          <label>Format<select value={exportSettings.format} onChange={(event) => setExportSettings((current) => ({ ...current, format: event.target.value as VectorExportSettings['format'] }))}><option value="svg">SVG</option><option value="svg-optimized">Optimized SVG</option><option value="png">PNG</option><option value="jpeg">JPEG</option><option value="webp">WebP</option><option value="pdf">PDF</option><option value="json">Editable project JSON</option></select></label>
          {['png','jpeg','webp','pdf'].includes(exportSettings.format) ? <label>Scale<select value={exportSettings.scale} onChange={(event) => setExportSettings((current) => ({ ...current, scale: Number(event.target.value) }))}><option value="1">1×</option><option value="2">2×</option><option value="3">3×</option><option value="4">4×</option></select></label> : null}
          {['jpeg','webp'].includes(exportSettings.format) ? <label>Quality<input type="range" min="0.4" max="1" step="0.02" value={exportSettings.quality} onChange={(event) => setExportSettings((current) => ({ ...current, quality: Number(event.target.value) }))}/></label> : null}
          <label className="vector-check"><input type="checkbox" checked={exportSettings.includeBackground} onChange={(event) => setExportSettings((current) => ({ ...current, includeBackground: event.target.checked }))}/> Include artboard background</label>
          <label className="vector-check"><input type="checkbox" checked={exportSettings.responsive} disabled={!exportSettings.format.startsWith('svg')} onChange={(event) => setExportSettings((current) => ({ ...current, responsive: event.target.checked }))}/> Responsive SVG (viewBox only)</label>
          {exportSettings.format === 'pdf' ? <p className="vector-hint">PDF is a high-resolution print/share export. SVG remains the editable vector-fidelity format.</p> : null}
        </section>
        <section className="vector-panel">
          <h3>Document metadata</h3>
          <label>Title<input id="vector-export-title" value={document.metadata.title} onChange={(event) => commit({ ...document, metadata: { ...document.metadata, title: event.target.value } }, selection)}/></label>
          <label>Description<textarea rows={2} value={document.metadata.description} onChange={(event) => commit({ ...document, metadata: { ...document.metadata, description: event.target.value } }, selection)}/></label>
          <label>Creator<input value={document.metadata.creator} onChange={(event) => commit({ ...document, metadata: { ...document.metadata, creator: event.target.value } }, selection)}/></label>
          <label>Rights<input value={document.metadata.rights} onChange={(event) => commit({ ...document, metadata: { ...document.metadata, rights: event.target.value } }, selection)}/></label>
          <label>License<input value={document.metadata.license} onChange={(event) => commit({ ...document, metadata: { ...document.metadata, license: event.target.value } }, selection)}/></label>
          <label>Language<input value={document.metadata.language} onChange={(event) => commit({ ...document, metadata: { ...document.metadata, language: event.target.value } }, selection)}/></label>
          <label>Tags / keywords<input id="vector-export-tags" value={tagText} onChange={(event) => commit({ ...document, metadata: { ...document.metadata, tags: tagsFromInput(event.target.value) } }, selection)}/></label>
          <label>Custom metadata<textarea rows={2} value={document.metadata.custom} placeholder="project=fall-campaign" onChange={(event) => commit({ ...document, metadata: { ...document.metadata, custom: event.target.value } }, selection)}/></label>
        </section>
        <section className="vector-panel">
          <div className="vector-button-row wrap"><button className="vector-primary" type="button" onClick={() => void exportFile()}>Download</button><button type="button" onClick={previewSvg} aria-label="Preview SVG source">Preview SVG</button></div>
          <div className="vector-button-row wrap"><button type="button" onClick={() => void copy(serializeVectorSvg(document, { responsive: true }), 'SVG markup copied.')}>Copy SVG</button><button type="button" onClick={() => void copy(buildInlineEmbed(serializeVectorSvg(document, { responsive: true }), document.metadata.title || document.name), 'Inline embed copied.')}>Copy inline embed</button><button type="button" onClick={() => void copy(buildImageEmbed(serializeVectorSvg(document, { responsive: true }), document.metadata.description), 'Image embed copied.')}>Copy image embed</button><button type="button" onClick={() => void copy(buildSvgDataUri(serializeVectorSvg(document, { responsive: true })), 'SVG data URI copied.')}>Copy data URI</button></div>
          {sourcePreview ? <pre className="vector-source" tabIndex={0} aria-label="Vector SVG export source">{sourcePreview}</pre> : null}
        </section>
      </aside>
    </div>

    <div className="vector-status" role="status"><span>{status}</span><span>{document.elements.length} objects · {document.artboard.width} × {document.artboard.height}</span></div>
  </section>;
}

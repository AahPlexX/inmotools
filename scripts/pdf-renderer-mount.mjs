import fs from 'node:fs';

const path = 'src/tools/pdf/PdfWorkspace.tsx';
let source = fs.readFileSync(path, 'utf8');

if (source.includes("import PdfCanvas from './PdfCanvas';")) {
  console.log('PdfCanvas is already mounted; no patch needed.');
  process.exit(0);
}

const replaceOnce = (from, to, label) => {
  const first = source.indexOf(from);
  if (first < 0 || source.indexOf(from, first + from.length) >= 0) {
    throw new Error(`Expected exactly one ${label} anchor.`);
  }
  source = source.replace(from, to);
};

replaceOnce(
  "import PdfExportSummaryPanel from './PdfExportSummaryPanel';",
  "import PdfExportSummaryPanel from './PdfExportSummaryPanel';\nimport PdfCanvas from './PdfCanvas';",
  'renderer import',
);

replaceOnce(
  "  const [busy, setBusy] = useState(false);\n\n  const pageStates = useMemo(",
  "  const [busy, setBusy] = useState(false);\n  const [viewerSourceId, setViewerSourceId] = useState('');\n  const [viewerPage, setViewerPage] = useState(1);\n  const [viewerZoomPercent, setViewerZoomPercent] = useState(100);\n  const viewerItem = items.find((item) => item.id === viewerSourceId) ?? items[0];\n  const viewerPageCount = viewerItem?.inspection.pageCount ?? 0;\n  const resolvedViewerPage = viewerPageCount ? Math.min(Math.max(viewerPage, 1), viewerPageCount) : 1;\n\n  const pageStates = useMemo(",
  'renderer state',
);

const metricAnchor = "      {items.length ? <div className=\"metric-row\" style={{ marginTop: 18 }}><div className=\"metric\"><span>Documents</span><strong>{items.length}</strong></div><div className=\"metric\"><span>Output pages</span><strong>{hasPageError ? '—' : outputPageCount}</strong></div><div className=\"metric\"><span>Source size</span><strong>{bytesLabel(sourceBytes)}</strong></div></div> : null}\n\n";
const viewer = [
  '      {viewerItem ? <section className="notice" style={{ marginTop: 18 }} aria-labelledby="pdf-viewer-title">',
  '        <h3 id="pdf-viewer-title" style={{ margin: 0 }}>Document viewer</h3>',
  '        <p className="help-text">PDF.js renders the active source page locally with a bundled worker. Canvas pixels are only the visual layer; document operations continue to use PDF coordinates and deterministic source bytes.</p>',
  '        <div className="workspace-grid three" style={{ marginTop: 14 }}>',
  '          <div className="field"><label htmlFor="pdf-viewer-source">Preview source</label><select id="pdf-viewer-source" value={viewerItem.id} onChange={(event) => { setViewerSourceId(event.target.value); setViewerPage(1); }}>{items.map((item) => <option key={item.id} value={item.id}>{item.file.name}</option>)}</select></div>',
  '          <div className="field"><label htmlFor="pdf-viewer-page">Preview page</label><input id="pdf-viewer-page" type="number" min="1" max={viewerPageCount} step="1" value={resolvedViewerPage} onChange={(event) => { const next = Number(event.target.value); setViewerPage(Number.isFinite(next) ? Math.min(Math.max(Math.trunc(next), 1), viewerPageCount) : 1); }} /></div>',
  '          <div className="field"><label htmlFor="pdf-viewer-zoom">Preview zoom</label><input id="pdf-viewer-zoom" type="number" min="25" max="500" step="25" value={viewerZoomPercent} onChange={(event) => { const next = Number(event.target.value); setViewerZoomPercent(Number.isFinite(next) ? Math.min(Math.max(next, 25), 500) : 100); }} /><small>25%–500%; canvas backing pixels are independently capped for display-memory safety.</small></div>',
  '        </div>',
  '        <div className="button-row">',
  '          <button className="action-button secondary" type="button" aria-label="Previous preview page" disabled={resolvedViewerPage <= 1} onClick={() => setViewerPage((page) => Math.max(1, page - 1))}>Previous page</button>',
  '          <button className="action-button secondary" type="button" aria-label="Next preview page" disabled={resolvedViewerPage >= viewerPageCount} onClick={() => setViewerPage((page) => Math.min(viewerPageCount, page + 1))}>Next page</button>',
  '        </div>',
  '        <PdfCanvas file={viewerItem.file} pageNumber={resolvedViewerPage} zoom={viewerZoomPercent / 100} />',
  '      </section> : null}',
  '',
].join('\n');

replaceOnce(metricAnchor, metricAnchor + viewer + '\n', 'viewer insertion');
fs.writeFileSync(path, source);
console.log('Mounted PdfCanvas in PdfWorkspace.tsx.');

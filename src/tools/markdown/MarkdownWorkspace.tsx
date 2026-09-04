import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { unified } from 'unified';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import type { Root as MdastRoot } from 'mdast';
import { downloadBytes, downloadText } from '../../lib/download';
import { requestSupportPrompt } from '../../lib/support';
import MarkdownEditor from './MarkdownEditor';
import MarkdownPreview from './MarkdownPreview';
import { parseMarkdown } from './parse-engine';
import { computeScrollOffset } from './scroll-sync';
import { computeProseMetrics } from './prose-metrics-engine';
import { splitIntoSlides } from './slide-engine';
import { commitHistory, createHistory, redoHistory, undoHistory } from './state-engine';
import {
  createDraftRecord,
  createIndexedDbDraftStore,
  estimateStorageUsage,
  listDrafts,
  saveDraft,
  updateDraftRecord,
  type DraftStore,
} from './autosave-engine';
import { parseBibtex, parseCslJson, type FormattedCitations, formatCitations } from './citation-engine';
import {
  buildAstJson,
  buildEpubArchive,
  buildStandaloneMarkdownHtml,
  renderDocxToBytes,
} from './export-engine';
import type { CitationStyleId, DraftRecord, ProjectHistory } from './markdown-types';
// KaTeX's own stylesheet supplies its web fonts and layout rules; without
// it, math renders with broken/fallback glyphs despite correct HTML
// structure. Imported here (not globally in src/styles.css) so it is only
// fetched when this tool is actually opened, matching this catalog's
// per-tool lazy-loading convention.
import 'katex/dist/katex.css';

type ViewMode = 'source' | 'split';

const AUTOSAVE_DEBOUNCE_MS = 1200;
const CITATION_STYLES: { id: CitationStyleId; label: string }[] = [
  { id: 'apa', label: 'APA 7th' },
  { id: 'ieee', label: 'IEEE' },
  { id: 'chicago-author-date', label: 'Chicago (author-date)' },
  { id: 'mla', label: 'MLA 9th' },
];

const DEFAULT_SOURCE = `# Untitled document

Start writing here. This workbench supports **GFM** tables, math like $E = mc^2$, diagrams, and citations.

| Item | Qty | Price | Total |
| - | - | - | - |
| Widgets | 4 | 2.5 | =B2*C2 |
`;

const parseToMdast = (source: string): MdastRoot =>
  unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(source) as MdastRoot;

export default function MarkdownWorkspace() {
  const [view, setView] = useState<ViewMode>('split');
  const [history, setHistory] = useState<ProjectHistory<string>>(() => createHistory(DEFAULT_SOURCE));
  const source = history.present;

  const [status, setStatus] = useState('Ready.');
  const [lineWrapping, setLineWrapping] = useState(true);
  const [fontSize, setFontSize] = useState(13);
  const [vimMode, setVimMode] = useState(false);
  const [spellcheck, setSpellcheck] = useState(true);

  const [bibliographyText, setBibliographyText] = useState('');
  const [bibliographyFormat, setBibliographyFormat] = useState<'bib' | 'json'>('bib');
  const [citationStyle, setCitationStyle] = useState<CitationStyleId>('apa');
  const [citationResult, setCitationResult] = useState<FormattedCitations | null>(null);

  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [storageUsage, setStorageUsage] = useState<{ usageBytes: number | null; quotaBytes: number | null }>({
    usageBytes: null,
    quotaBytes: null,
  });
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const draftStoreRef = useRef<DraftStore | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const editorViewScrollRef = useRef<{ offsetTop: number; sourceLine: number }[]>([]);
  const previewHostRef = useRef<HTMLDivElement | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Draft store + storage estimate, initialized once on mount ---
  useEffect(() => {
    if (typeof indexedDB === 'undefined') return;
    draftStoreRef.current = createIndexedDbDraftStore();
    listDrafts(draftStoreRef.current).then(setDrafts).catch(() => setDrafts([]));
    estimateStorageUsage().then(setStorageUsage);
  }, []);

  // --- Debounced autosave ---
  useEffect(() => {
    if (!draftStoreRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      const store = draftStoreRef.current;
      if (!store) return;
      const now = Date.now();
      const draft = draftIdRef.current
        ? updateDraftRecord({ id: draftIdRef.current, name: 'Autosave', text: source, updatedAt: now }, source, now)
        : createDraftRecord('Autosave', source, now);
      draftIdRef.current = draft.id;
      saveDraft(store, draft)
        .then(() => {
          setLastSavedAt(now);
          return listDrafts(store);
        })
        .then(setDrafts)
        .catch(() => setStatus('Local autosave failed; your work is still in the editor.'));
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [source]);

  // --- Unsaved-changes warning ---
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);

  const setSource = useCallback((next: string) => {
    setHistory((current) => commitHistory(current, next));
  }, []);

  const undo = useCallback(() => setHistory((current) => undoHistory(current)), []);
  const redo = useCallback(() => setHistory((current) => redoHistory(current)), []);

  // --- Derived data (frontmatter, prose metrics, slides) ---
  const parsed = useMemo(() => parseMarkdown(source), [source]);
  const proseMetrics = useMemo(() => computeProseMetrics(source), [source]);
  const slides = useMemo(() => splitIntoSlides(source), [source]);

  // --- Citations ---
  const citationLibrary = useMemo(() => {
    if (!bibliographyText.trim()) return null;
    try {
      return bibliographyFormat === 'bib' ? parseBibtex(bibliographyText) : parseCslJson(bibliographyText);
    } catch {
      return null;
    }
  }, [bibliographyText, bibliographyFormat]);

  const citekeys = useMemo(() => {
    const matches = source.matchAll(/\[@([\w-]+)(?:[^\]]*)\]/g);
    const keys = new Set<string>();
    for (const match of matches) keys.add(match[1]);
    return [...keys];
  }, [source]);

  useEffect(() => {
    if (!citationLibrary || citekeys.length === 0) {
      setCitationResult(null);
      return;
    }
    let cancelled = false;
    formatCitations(citationLibrary, citekeys, citationStyle)
      .then((result) => { if (!cancelled) setCitationResult(result); })
      .catch(() => { if (!cancelled) setStatus('Citation formatting failed for the selected style.'); });
    return () => { cancelled = true; };
  }, [citationLibrary, citekeys, citationStyle]);

  // --- Scroll sync ---
  // Closely tracks visual position for documents with irregular block
  // heights (large diagrams, tables, images) by interpolating within the
  // actual bounding element's local offset range - this is not a claim of
  // guaranteed sub-pixel or zero-jitter alignment, since neither is a
  // measurable property of this feature.
  const handleAnchorsMeasured = useCallback((offsets: { sourceLine: number; offsetTop: number }[]) => {
    editorViewScrollRef.current = offsets;
  }, []);

  const handleCursorLineChange = useCallback((line: number) => {
    const anchors = editorViewScrollRef.current;
    if (anchors.length === 0) return;
    const targetOffset = computeScrollOffset(anchors, line);
    const scroller = previewHostRef.current?.querySelector<HTMLElement>('.markdown-workbench-preview');
    scroller?.scrollTo({ top: targetOffset, behavior: 'smooth' });
  }, []);

  // --- Exports ---
  const exportMarkdown = () => {
    downloadText(source, 'document.md');
    requestSupportPrompt({ key: 'markdown-workbench-export', message: 'Exported your document locally with no upload step. If Markdown Workbench saved you a subscription, support independent local-first tooling with a coffee.' });
  };

  const exportHtml = () => {
    const host = previewHostRef.current;
    const bodyHtml = host?.innerHTML ?? '';
    const html = buildStandaloneMarkdownHtml('Document', bodyHtml);
    downloadText(html, 'document.html', 'text/html;charset=utf-8');
    requestSupportPrompt({ key: 'markdown-workbench-export', message: 'Exported a standalone offline HTML file locally with no upload step. If Markdown Workbench saved you a subscription, support independent local-first tooling with a coffee.' });
  };

  const exportAstJson = () => {
    downloadText(buildAstJson(parsed.tree), 'document.ast.json', 'application/json;charset=utf-8');
  };

  const exportDocx = async () => {
    setStatus('Generating DOCX…');
    try {
      const tree = parseToMdast(source);
      const bytes = await renderDocxToBytes(tree);
      downloadBytes(bytes, 'document.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      setStatus('Exported document.docx. Math renders as plain text in Word, not as an editable equation.');
      requestSupportPrompt({ key: 'markdown-workbench-export', message: 'Exported your document locally with no upload step. If Markdown Workbench saved you a subscription, support independent local-first tooling with a coffee.' });
    } catch {
      setStatus('DOCX export failed.');
    }
  };

  const exportEpub = async () => {
    setStatus('Packaging EPUB…');
    try {
      const host = previewHostRef.current;
      const bodyHtml = host?.innerHTML ?? '';
      const bytes = await buildEpubArchive({ title: 'Document', author: '', identifier: `urn:uuid:${crypto.randomUUID()}` }, bodyHtml);
      downloadBytes(bytes, 'document.epub', 'application/epub+zip');
      setStatus('Packaged a structural EPUB (not EPUBCheck-validated).');
      requestSupportPrompt({ key: 'markdown-workbench-export', message: 'Packaged a structural EPUB locally with no upload step. If Markdown Workbench saved you a subscription, support independent local-first tooling with a coffee.' });
    } catch {
      setStatus('EPUB export failed.');
    }
  };

  const printDocument = () => {
    window.print();
  };

  const storageLabel = storageUsage.usageBytes !== null
    ? `Approximately ${(storageUsage.usageBytes / (1024 * 1024)).toFixed(1)} MB used of this browser's storage.`
    : 'Storage usage unavailable in this browser.';

  return (
    <div className="markdown-workbench">
      <div className="markdown-workbench-toolbar" role="toolbar" aria-label="Markdown Workbench controls">
        <div className="markdown-workbench-toolbar-group">
          <button type="button" onClick={() => setView('source')} aria-pressed={view === 'source'}>Source</button>
          <button type="button" onClick={() => setView('split')} aria-pressed={view === 'split'}>Split</button>
        </div>
        <div className="markdown-workbench-toolbar-group">
          <button type="button" onClick={undo} disabled={history.past.length === 0} aria-label="Undo">Undo</button>
          <button type="button" onClick={redo} disabled={history.future.length === 0} aria-label="Redo">Redo</button>
        </div>
        <div className="markdown-workbench-toolbar-group">
          <label className="markdown-workbench-check">
            <input type="checkbox" checked={lineWrapping} onChange={(event) => setLineWrapping(event.target.checked)} />
            Wrap lines
          </label>
          <label className="markdown-workbench-check">
            <input type="checkbox" checked={vimMode} onChange={(event) => setVimMode(event.target.checked)} />
            Vim keys
          </label>
          <label className="markdown-workbench-check">
            <input type="checkbox" checked={spellcheck} onChange={(event) => setSpellcheck(event.target.checked)} />
            Spellcheck
          </label>
          <label className="markdown-workbench-font-size">
            Font
            <input type="range" min={11} max={20} value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} />
          </label>
        </div>
        <div className="markdown-workbench-toolbar-group markdown-workbench-export-group">
          <button type="button" onClick={exportMarkdown}>Markdown</button>
          <button type="button" onClick={exportHtml}>Standalone HTML</button>
          <button type="button" onClick={printDocument}>Print / PDF</button>
          <button type="button" onClick={exportDocx}>DOCX</button>
          <button type="button" onClick={exportEpub}>EPUB (structural)</button>
          <button type="button" onClick={exportAstJson}>AST JSON</button>
        </div>
      </div>

      <div className={`markdown-workbench-body markdown-workbench-view-${view}`}>
        <div className="markdown-workbench-editor-pane">
          <MarkdownEditor
            value={source}
            onChange={setSource}
            onCursorLineChange={view === 'split' ? handleCursorLineChange : undefined}
            lineWrapping={lineWrapping}
            fontSize={fontSize}
            vimMode={vimMode}
            spellcheck={spellcheck}
          />
        </div>
        {view === 'split' ? (
          <div className="markdown-workbench-preview-pane" ref={previewHostRef}>
            <MarkdownPreview source={source} onAnchorsMeasured={handleAnchorsMeasured} />
          </div>
        ) : null}
      </div>

      <div className="markdown-workbench-status" role="status" aria-live="polite">
        <span>{status}</span>
        <span className="markdown-workbench-autosave-status">
          {lastSavedAt ? `Saved ${new Date(lastSavedAt).toLocaleTimeString()}` : 'Not yet saved locally'}
        </span>
      </div>

      <details className="markdown-workbench-panel">
        <summary>Document metrics</summary>
        <dl className="markdown-workbench-metrics">
          <div><dt>Words</dt><dd>{proseMetrics.words}</dd></div>
          <div><dt>Sentences</dt><dd>{proseMetrics.sentences}</dd></div>
          <div><dt>Reading time (estimate)</dt><dd>{proseMetrics.readingMinutes.toFixed(1)} min</dd></div>
          <div><dt>Speaking time (estimate)</dt><dd>{proseMetrics.speakingMinutes.toFixed(1)} min</dd></div>
          <div><dt>Fog index (heuristic)</dt><dd>{proseMetrics.fogIndex.toFixed(1)}</dd></div>
        </dl>
        <p className="markdown-workbench-hint">Reading/speaking time and the Fog index are heuristic estimates based on fixed rule-of-thumb constants, not measured facts about any individual reader.</p>
      </details>

      <details className="markdown-workbench-panel">
        <summary>Citations ({citekeys.length} referenced)</summary>
        <div className="markdown-workbench-citation-controls">
          <label>
            Bibliography format
            <select value={bibliographyFormat} onChange={(event) => setBibliographyFormat(event.target.value as 'bib' | 'json')}>
              <option value="bib">.bib (BibTeX)</option>
              <option value="json">CSL-JSON</option>
            </select>
          </label>
          <label>
            Citation style
            <select value={citationStyle} onChange={(event) => setCitationStyle(event.target.value as CitationStyleId)}>
              {CITATION_STYLES.map((style) => (
                <option key={style.id} value={style.id}>{style.label}</option>
              ))}
            </select>
          </label>
        </div>
        <textarea
          className="markdown-workbench-bibliography-input"
          aria-label="Bibliography source"
          placeholder="Paste .bib or CSL-JSON content here"
          value={bibliographyText}
          onChange={(event) => setBibliographyText(event.target.value)}
        />
        {citationResult ? (
          <div className="markdown-workbench-citation-preview">
            {citationResult.unresolved.length > 0 ? (
              <p className="markdown-workbench-citation-warning">
                Unresolved citation key{citationResult.unresolved.length === 1 ? '' : 's'}: {citationResult.unresolved.join(', ')}
              </p>
            ) : null}
            {citationResult.bibliographyHtml.length > 0 ? (
              <div
                className="markdown-workbench-bibliography-output"
                // The bibliography HTML originates from this tool's own citeproc-js
                // formatting call, not from arbitrary user-supplied markdown, so it
                // is not passed through the markdown sanitizer a second time here.
                dangerouslySetInnerHTML={{ __html: citationResult.bibliographyHtml.join('') }}
              />
            ) : null}
          </div>
        ) : null}
      </details>

      <details className="markdown-workbench-panel">
        <summary>Slides ({slides.length})</summary>
        <p className="markdown-workbench-hint">Split on --- thematic breaks. This is a lightweight view, not a full presentation framework.</p>
      </details>

      <details className="markdown-workbench-panel">
        <summary>Local drafts and storage</summary>
        <p className="markdown-workbench-hint">{storageLabel}</p>
        {drafts.length > 0 ? (
          <ul className="markdown-workbench-draft-list">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <button type="button" onClick={() => setSource(draft.text)}>
                  {draft.name} — {new Date(draft.updatedAt).toLocaleString()}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="markdown-workbench-hint">No local drafts saved yet.</p>
        )}
      </details>
    </div>
  );
}

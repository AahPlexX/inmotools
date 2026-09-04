import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
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
import { renderMarkdown } from './render-engine';
import { computeScrollOffset } from './scroll-sync';
import { computeProseMetrics } from './prose-metrics-engine';
import { splitIntoSlides } from './slide-engine';
import { buildOutline } from './outline-engine';
import { collectMathDiagnostics } from './math-engine';
import { prepareDocument, toFilenameStem } from './document-pipeline';
import { commitHistory, createHistory, redoHistory, undoHistory } from './state-engine';
import {
  createDraftRecord,
  createIndexedDbDraftStore,
  deleteDraft,
  estimateStorageUsage,
  listDrafts,
  saveDraft,
  updateDraftRecord,
  type DraftStore,
} from './autosave-engine';
import {
  extractCitekeys,
  parseBibtex,
  parseCslJson,
  type FormattedCitations,
  formatCitations,
} from './citation-engine';
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

const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function MarkdownWorkspace() {
  const [view, setView] = useState<ViewMode>('split');
  const [history, setHistory] = useState<ProjectHistory<string>>(() => createHistory(DEFAULT_SOURCE));
  const source = history.present;

  const [status, setStatus] = useState('Ready.');
  const [documentName, setDocumentName] = useState('');
  const [lineWrapping, setLineWrapping] = useState(true);
  const [fontSize, setFontSize] = useState(13);
  const [vimMode, setVimMode] = useState(false);
  const [spellcheck, setSpellcheck] = useState(true);
  const [revealRequest, setRevealRequest] = useState<{ line: number; nonce: number }>();

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
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bibInputRef = useRef<HTMLInputElement | null>(null);
  // The text most recently persisted to a local draft. Comparing against it is
  // what makes the unsaved-changes prompt truthful: previously the prompt was
  // armed unconditionally on mount, so closing the tab on an untouched
  // document still triggered the browser's "leave site?" dialog.
  const persistedTextRef = useRef<string>(DEFAULT_SOURCE);
  const [isDirty, setIsDirty] = useState(false);

  // --- Draft store + storage estimate, initialized once on mount ---
  useEffect(() => {
    if (typeof indexedDB === 'undefined') return;
    draftStoreRef.current = createIndexedDbDraftStore();
    listDrafts(draftStoreRef.current).then(setDrafts).catch(() => setDrafts([]));
    estimateStorageUsage().then(setStorageUsage);
  }, []);

  const refreshStorageEstimate = useCallback(() => {
    estimateStorageUsage().then(setStorageUsage).catch(() => undefined);
  }, []);

  const persistDraft = useCallback((text: string, name?: string) => {
    const store = draftStoreRef.current;
    if (!store) return Promise.resolve();
    const now = Date.now();
    const draft = draftIdRef.current
      ? updateDraftRecord(
        { id: draftIdRef.current, name: name ?? 'Autosave', text, updatedAt: now },
        text,
        now,
      )
      : createDraftRecord(name ?? 'Autosave', text, now);
    draftIdRef.current = draft.id;
    return saveDraft(store, draft)
      .then(() => {
        persistedTextRef.current = text;
        setIsDirty(false);
        setLastSavedAt(now);
        return listDrafts(store);
      })
      .then(setDrafts)
      .then(refreshStorageEstimate)
      .catch(() => setStatus('Local autosave failed; your work is still in the editor.'));
  }, [refreshStorageEstimate]);

  // --- Debounced autosave ---
  useEffect(() => {
    if (!draftStoreRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => { void persistDraft(source); }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [source, persistDraft]);

  useEffect(() => {
    setIsDirty(source !== persistedTextRef.current);
  }, [source]);

  // --- Unsaved-changes warning, armed only while there really are unsaved changes ---
  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const setSource = useCallback((next: string) => {
    setHistory((current) => commitHistory(current, next));
  }, []);

  const undo = useCallback(() => setHistory((current) => undoHistory(current)), []);
  const redo = useCallback(() => setHistory((current) => redoHistory(current)), []);

  // --- Derived data ---
  const parsed = useMemo(() => parseMarkdown(source), [source]);
  const proseMetrics = useMemo(() => computeProseMetrics(source), [source]);
  const slides = useMemo(() => splitIntoSlides(source), [source]);
  const outline = useMemo(() => buildOutline(source), [source]);
  const mathDiagnostics = useMemo(() => collectMathDiagnostics(source), [source]);

  const frontmatterEntries = useMemo(
    () => Object.entries(parsed.frontmatter.data),
    [parsed.frontmatter.data],
  );

  // A document's effective title: an explicit name the author typed, else a
  // `title` field from frontmatter, else the first heading, else a fallback.
  const effectiveTitle = useMemo(() => {
    if (documentName.trim()) return documentName.trim();
    const frontmatterTitle = parsed.frontmatter.data.title;
    if (typeof frontmatterTitle === 'string' && frontmatterTitle.trim()) return frontmatterTitle.trim();
    const firstHeading = outline[0]?.text.trim();
    if (firstHeading) return firstHeading;
    return 'Document';
  }, [documentName, parsed.frontmatter.data.title, outline]);

  const filenameStem = useMemo(() => toFilenameStem(effectiveTitle), [effectiveTitle]);

  // Read by the Ctrl/Cmd+S handler and the explicit save button, which must not
  // be re-created every time the title changes.
  const effectiveTitleRef = useRef(effectiveTitle);
  effectiveTitleRef.current = effectiveTitle;

  // --- Citations ---
  const citationLibrary = useMemo(() => {
    if (!bibliographyText.trim()) return null;
    try {
      return bibliographyFormat === 'bib' ? parseBibtex(bibliographyText) : parseCslJson(bibliographyText);
    } catch {
      return null;
    }
  }, [bibliographyText, bibliographyFormat]);

  const citekeys = useMemo(() => extractCitekeys(source), [source]);
  const citekeySignature = citekeys.join('\u0000');

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
    // citekeySignature stands in for the citekeys array so a re-render that
    // produces an equal-but-new array does not re-run citeproc.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citationLibrary, citekeySignature, citationStyle]);

  // The document as it actually reads once formulas are evaluated and
  // citations formatted. Every consumer - preview and all five exports -
  // works from this one value, which is what keeps their outputs identical.
  const preparedSource = useMemo(
    () => prepareDocument(source, citationResult?.inText),
    [source, citationResult],
  );

  // --- Scroll sync ---
  const handleAnchorsMeasured = useCallback((offsets: { sourceLine: number; offsetTop: number }[]) => {
    editorViewScrollRef.current = offsets;
  }, []);

  const scrollPreviewToLine = useCallback((line: number) => {
    const anchors = editorViewScrollRef.current;
    if (anchors.length === 0) return;
    const targetOffset = computeScrollOffset(anchors, line);
    const scroller = previewHostRef.current?.querySelector<HTMLElement>('.markdown-workbench-preview');
    scroller?.scrollTo({ top: targetOffset, behavior: 'smooth' });
  }, []);

  const revealLine = useCallback((line: number) => {
    setRevealRequest({ line, nonce: Date.now() });
    scrollPreviewToLine(line);
  }, [scrollPreviewToLine]);

  // --- Opening local files ---
  const loadMarkdownFile = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      setSource(text);
      setDocumentName(file.name.replace(/\.(md|markdown|txt)$/i, ''));
      setStatus(`Opened ${file.name} locally. Nothing was uploaded.`);
    } catch {
      setStatus('Could not read that file in this browser.');
    }
  }, [setSource]);

  const onFileInputChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) void loadMarkdownFile(file);
    event.target.value = '';
  }, [loadMarkdownFile]);

  const onBibInputChange = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      setBibliographyText(text);
      setBibliographyFormat(/\.json$/i.test(file.name) ? 'json' : 'bib');
      setStatus(`Loaded bibliography ${file.name} locally.`);
    } catch {
      setStatus('Could not read that bibliography file.');
    }
  }, []);

  const onEditorDrop = useCallback((event: DragEvent<HTMLDivElement>) => {
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    event.preventDefault();
    void loadMarkdownFile(file);
  }, [loadMarkdownFile]);

  const onEditorDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    if (event.dataTransfer?.types?.includes('Files')) event.preventDefault();
  }, []);

  // --- Export body HTML ---
  // Prefers the live preview (which contains rendered diagram SVG that only
  // exists after the async diagram pass) and falls back to rendering straight
  // from the prepared source. The fallback is what makes exporting from Source
  // view work at all: the preview pane is not mounted in that mode, so both
  // the HTML and EPUB exports used to silently write an empty document.
  const buildExportBodyHtml = useCallback((): { html: string; usedFallback: boolean } => {
    const live = previewHostRef.current
      ?.querySelector<HTMLElement>('.markdown-workbench-preview')
      ?.innerHTML;
    if (live && live.trim()) return { html: live, usedFallback: false };
    return { html: renderMarkdown(preparedSource).html, usedFallback: true };
  }, [preparedSource]);

  const noteExport = (message: string) => {
    requestSupportPrompt({ key: 'markdown-workbench-export', message });
  };

  const exportMarkdown = () => {
    downloadText(source, `${filenameStem}.md`);
    setStatus(`Exported ${filenameStem}.md (your original source, with formulas and citation markers intact).`);
    noteExport('Exported your document locally with no upload step. If Markdown Workbench saved you a subscription, support independent local-first tooling with a coffee.');
  };

  const exportRenderedMarkdown = () => {
    downloadText(preparedSource, `${filenameStem}.rendered.md`);
    setStatus(`Exported ${filenameStem}.rendered.md with table formulas evaluated and citations formatted.`);
    noteExport('Exported your document locally with no upload step. If Markdown Workbench saved you a subscription, support independent local-first tooling with a coffee.');
  };

  const exportHtml = () => {
    const { html: bodyHtml, usedFallback } = buildExportBodyHtml();
    const html = buildStandaloneMarkdownHtml(effectiveTitle, bodyHtml);
    downloadText(html, `${filenameStem}.html`, 'text/html;charset=utf-8');
    setStatus(usedFallback
      ? `Exported ${filenameStem}.html from the source. Open Split view first if you need rendered diagrams included.`
      : `Exported ${filenameStem}.html as a standalone offline file.`);
    noteExport('Exported a standalone offline HTML file locally with no upload step. If Markdown Workbench saved you a subscription, support independent local-first tooling with a coffee.');
  };

  const exportAstJson = () => {
    downloadText(buildAstJson(parseToMdast(preparedSource)), `${filenameStem}.ast.json`, 'application/json;charset=utf-8');
    setStatus(`Exported ${filenameStem}.ast.json for the prepared document (formulas evaluated, citations formatted).`);
  };

  const exportDocx = async () => {
    setStatus('Generating DOCX…');
    try {
      const bytes = await renderDocxToBytes(parseToMdast(preparedSource));
      downloadBytes(bytes, `${filenameStem}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      setStatus(`Exported ${filenameStem}.docx. Math renders as plain text in Word, not as an editable equation.`);
      noteExport('Exported your document locally with no upload step. If Markdown Workbench saved you a subscription, support independent local-first tooling with a coffee.');
    } catch {
      setStatus('DOCX export failed.');
    }
  };

  const exportEpub = async () => {
    setStatus('Packaging EPUB…');
    try {
      const { html: bodyHtml } = buildExportBodyHtml();
      const author = typeof parsed.frontmatter.data.author === 'string' ? parsed.frontmatter.data.author : '';
      const bytes = await buildEpubArchive(
        { title: effectiveTitle, author, identifier: `urn:uuid:${crypto.randomUUID()}` },
        bodyHtml,
      );
      downloadBytes(bytes, `${filenameStem}.epub`, 'application/epub+zip');
      setStatus(`Packaged ${filenameStem}.epub as a structural EPUB (not EPUBCheck-validated).`);
      noteExport('Packaged a structural EPUB locally with no upload step. If Markdown Workbench saved you a subscription, support independent local-first tooling with a coffee.');
    } catch {
      setStatus('EPUB export failed.');
    }
  };

  const printDocument = () => {
    // A dedicated print stylesheet scopes the printed output to the rendered
    // document only; the class below is what activates it.
    document.body.classList.add('markdown-workbench-printing');
    const cleanup = () => {
      document.body.classList.remove('markdown-workbench-printing');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    if (view !== 'split') {
      setStatus('Print uses the rendered preview. Switch to Split view so the preview is available, then print again.');
      cleanup();
      return;
    }
    window.print();
    // afterprint is not dispatched by every browser/print path, so the class is
    // also cleared on a timer as a backstop.
    window.setTimeout(cleanup, 1000);
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setStatus(`Copied ${label} to the clipboard.`);
    } catch {
      setStatus('This browser blocked clipboard access.');
    }
  };

  // --- Draft actions ---
  const saveDraftNow = useCallback(() => {
    if (!draftStoreRef.current) {
      setStatus('Local draft storage is unavailable in this browser.');
      return;
    }
    // Naming an explicitly saved draft after the document makes the draft list
    // identifiable, rather than a column of entries all called "Autosave".
    void persistDraft(source, effectiveTitleRef.current).then(() => setStatus('Saved a local draft.'));
  }, [persistDraft, source]);

  const startNewDraft = () => {
    draftIdRef.current = null;
    persistedTextRef.current = DEFAULT_SOURCE;
    setHistory(createHistory(DEFAULT_SOURCE));
    setDocumentName('');
    setLastSavedAt(null);
    setStatus('Started a new document. The previous draft is still listed below.');
  };

  const loadDraft = (draft: DraftRecord) => {
    draftIdRef.current = draft.id;
    persistedTextRef.current = draft.text;
    setSource(draft.text);
    setDocumentName(draft.name === 'Autosave' ? '' : draft.name);
    setStatus(`Loaded local draft from ${new Date(draft.updatedAt).toLocaleString()}.`);
  };

  const removeDraft = (draft: DraftRecord) => {
    const store = draftStoreRef.current;
    if (!store) return;
    void deleteDraft(store, draft.id)
      .then(() => {
        if (draftIdRef.current === draft.id) draftIdRef.current = null;
        return listDrafts(store);
      })
      .then(setDrafts)
      .then(refreshStorageEstimate)
      .then(() => setStatus('Deleted that local draft.'))
      .catch(() => setStatus('Could not delete that local draft.'));
  };

  // --- Keyboard shortcut: save a local draft ---
  // Deliberately limited to Ctrl/Cmd+S. Undo/redo are intentionally left to
  // CodeMirror's own keymap inside the editor so this tool never shadows the
  // editor's caret-preserving text history with a coarser document-level one.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        saveDraftNow();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [saveDraftNow]);

  const storageLabel = storageUsage.usageBytes !== null
    ? `Approximately ${formatBytes(storageUsage.usageBytes)} used${storageUsage.quotaBytes !== null ? ` of about ${formatBytes(storageUsage.quotaBytes)} available` : ''} in this browser. The browser reports this as an approximation, not an exact count.`
    : 'Storage usage is unavailable in this browser.';

  return (
    <div className="markdown-workbench" data-testid="markdown-workbench">
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
          <button type="button" onClick={() => fileInputRef.current?.click()}>Open .md</button>
          <button type="button" onClick={startNewDraft}>New</button>
          <button type="button" onClick={saveDraftNow}>Save draft</button>
          <input
            ref={fileInputRef}
            className="markdown-workbench-file-input"
            type="file"
            accept=".md,.markdown,.txt,text/markdown,text/plain"
            onChange={onFileInputChange}
            aria-label="Open a local Markdown file"
          />
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
          <button type="button" onClick={exportRenderedMarkdown}>Rendered Markdown</button>
          <button type="button" onClick={exportHtml}>Standalone HTML</button>
          <button type="button" onClick={printDocument}>Print / PDF</button>
          <button type="button" onClick={exportDocx}>DOCX</button>
          <button type="button" onClick={exportEpub}>EPUB (structural)</button>
          <button type="button" onClick={exportAstJson}>AST JSON</button>
        </div>
      </div>

      <div className="markdown-workbench-namebar">
        <label className="markdown-workbench-name-field">
          Document name
          <input
            type="text"
            value={documentName}
            placeholder={effectiveTitle}
            onChange={(event) => setDocumentName(event.target.value)}
          />
        </label>
        <span className="markdown-workbench-hint" data-testid="markdown-filename-preview">
          Exports as <code>{filenameStem}.*</code>
        </span>
        <div className="markdown-workbench-toolbar-group">
          <button type="button" onClick={() => void copyToClipboard(source, 'the Markdown source')}>Copy Markdown</button>
          <button type="button" onClick={() => void copyToClipboard(buildExportBodyHtml().html, 'the rendered HTML')}>Copy HTML</button>
        </div>
      </div>

      <div className={`markdown-workbench-body markdown-workbench-view-${view}`}>
        <div
          className="markdown-workbench-editor-pane"
          onDrop={onEditorDrop}
          onDragOver={onEditorDragOver}
        >
          <MarkdownEditor
            value={source}
            onChange={setSource}
            onCursorLineChange={view === 'split' ? scrollPreviewToLine : undefined}
            lineWrapping={lineWrapping}
            fontSize={fontSize}
            vimMode={vimMode}
            spellcheck={spellcheck}
            revealRequest={revealRequest}
          />
        </div>
        {view === 'split' ? (
          <div className="markdown-workbench-preview-pane" ref={previewHostRef}>
            <MarkdownPreview preparedSource={preparedSource} onAnchorsMeasured={handleAnchorsMeasured} />
          </div>
        ) : null}
      </div>

      <div className="markdown-workbench-status" role="status" aria-live="polite">
        <span data-testid="markdown-status">{status}</span>
        <span className="markdown-workbench-autosave-status" data-testid="markdown-save-state">
          {lastSavedAt
            ? `${isDirty ? 'Unsaved changes · last saved' : 'Saved'} ${new Date(lastSavedAt).toLocaleTimeString()}`
            : 'Not yet saved locally'}
        </span>
      </div>

      <details className="markdown-workbench-panel">
        <summary>Outline ({outline.length})</summary>
        {outline.length > 0 ? (
          <ul className="markdown-workbench-outline" data-testid="markdown-outline">
            {outline.map((entry) => (
              <li key={`${entry.id}-${entry.line}`} data-depth={entry.depth}>
                <button type="button" onClick={() => revealLine(entry.line)}>
                  {entry.text || '(untitled heading)'}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="markdown-workbench-hint">No headings yet. Add a line starting with # to build an outline.</p>
        )}
      </details>

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

      {parsed.frontmatter.format !== null ? (
        <details className="markdown-workbench-panel">
          <summary>Frontmatter ({parsed.frontmatter.format.toUpperCase()})</summary>
          {frontmatterEntries.length > 0 ? (
            <dl className="markdown-workbench-metrics" data-testid="markdown-frontmatter">
              {frontmatterEntries.map(([key, value]) => (
                <div key={key}>
                  <dt>{key}</dt>
                  <dd>{typeof value === 'string' ? value : JSON.stringify(value)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="markdown-workbench-hint">The frontmatter block parsed but contained no top-level fields.</p>
          )}
          <p className="markdown-workbench-hint">A <code>title</code> field here names your exports unless you set a document name above.</p>
        </details>
      ) : null}

      <details className="markdown-workbench-panel">
        <summary>Math check ({mathDiagnostics.length} {mathDiagnostics.length === 1 ? 'problem' : 'problems'})</summary>
        {mathDiagnostics.length > 0 ? (
          <ul className="markdown-workbench-diagnostics" data-testid="markdown-math-diagnostics">
            {mathDiagnostics.map((diagnostic) => (
              <li key={`${diagnostic.line}-${diagnostic.source}`}>
                <button type="button" onClick={() => revealLine(diagnostic.line)}>Line {diagnostic.line}</button>
                <code>{diagnostic.source}</code>
                <span>{diagnostic.error}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="markdown-workbench-hint">Every math expression in this document parses. Broken expressions render as flagged error text in the preview and are listed here.</p>
        )}
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
          <button type="button" onClick={() => bibInputRef.current?.click()}>Load .bib / CSL-JSON file</button>
          <input
            ref={bibInputRef}
            className="markdown-workbench-file-input"
            type="file"
            accept=".bib,.json,.txt,application/json,text/plain"
            onChange={(event) => void onBibInputChange(event)}
            aria-label="Load a local bibliography file"
          />
        </div>
        <textarea
          className="markdown-workbench-bibliography-input"
          aria-label="Bibliography source"
          placeholder="Paste .bib or CSL-JSON content here"
          value={bibliographyText}
          onChange={(event) => setBibliographyText(event.target.value)}
        />
        <p className="markdown-workbench-hint">
          Reference a source with <code>[@citekey]</code>. Resolved markers are replaced with formatted citations in the
          preview and in every export; an unresolved marker is left exactly as written so it stays visible.
        </p>
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
        <ol className="markdown-workbench-slide-list" data-testid="markdown-slide-list">
          {slides.map((slide) => {
            const heading = slide.source
              .split('\n')
              .map((line) => line.trim())
              .find((line) => line.length > 0);
            return (
              <li key={slide.index}>
                <button type="button" onClick={() => revealLine(slide.startLine)}>
                  {heading ? heading.replace(/^#+\s*/, '') : '(empty slide)'}
                </button>
              </li>
            );
          })}
        </ol>
        <p className="markdown-workbench-hint">Split on --- thematic breaks. This is a lightweight sectioning view, not a full presentation framework.</p>
      </details>

      <details className="markdown-workbench-panel">
        <summary>Local drafts and storage ({drafts.length})</summary>
        <p className="markdown-workbench-hint">{storageLabel}</p>
        {drafts.length > 0 ? (
          <ul className="markdown-workbench-draft-list" data-testid="markdown-draft-list">
            {drafts.map((draft) => (
              <li key={draft.id}>
                <button type="button" onClick={() => loadDraft(draft)}>
                  {draft.name} — {new Date(draft.updatedAt).toLocaleString()}
                </button>
                <button
                  type="button"
                  className="markdown-workbench-draft-delete"
                  onClick={() => removeDraft(draft)}
                  aria-label={`Delete draft saved ${new Date(draft.updatedAt).toLocaleString()}`}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="markdown-workbench-hint">No local drafts saved yet.</p>
        )}
        <p className="markdown-workbench-hint">Drafts are stored in this browser only (IndexedDB) and are never uploaded. Ctrl/Cmd+S saves one immediately.</p>
      </details>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';
import type { Root as MdastRoot } from 'mdast';
import { downloadBytes, downloadText } from '../../lib/download';
import { requestSupportPrompt } from '../../lib/support';
import MarkdownEditor from './MarkdownEditor';
import MarkdownPreview from './MarkdownPreview';
import { registerPreloadRecoveryGuard } from '../../lib/deployment-recovery';
import { revealDisclosureTarget } from './disclosure-dom';
import MarkdownSyntaxHelp from './MarkdownSyntaxHelp';
import { parseMarkdownTree, parseMarkdown } from './parse-engine';
import { collectMarkdownStyleSuggestions, MAX_STYLE_SUGGESTIONS } from './lint-engine';
import { renderMarkdown } from './render-engine';
import { renderDiagramBlocks } from './diagram-renderer';
import { highlightCodeBlocks } from './code-highlight-engine';
import { htmlToMarkdownDocument } from './html-import-engine';
import { computeScrollOffset, sourceLineForScrollOffset } from './scroll-sync';
import { toggleTaskListMarker } from './task-toggle';
import { countMarkdownTasks } from './task-progress';
import type { Root } from 'mdast';
import { computeProseMetrics } from './prose-metrics-engine';
import { splitIntoSlides } from './slide-engine';
import { buildOutline } from './outline-engine';
import { collectMathDiagnostics } from './math-engine';
import { applyPreparedCitations, prepareDocument, toFilenameStem } from './document-pipeline';
import { appendReferencesMarkdown } from './bibliography-engine';
import { commitHistory, createHistory, redoHistory, replaceHistoryPresent, undoHistory } from './state-engine';
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
import { bundleHtmlImages, inlineStylesheetAssets } from './export-assets';
import { createTableFormulaRunner, TableFormulaRunCancelled, type TableFormulaRunner } from './table-formula-runner';
import type { CitationStyleId, DraftRecord, ProjectHistory } from './markdown-types';
import katexExportCss from 'katex/dist/katex.css?inline';
import 'katex/dist/katex.css';
import './markdown-workbench.css';

type ViewMode = 'source' | 'split' | 'preview';

const AUTOSAVE_DEBOUNCE_MS = 1200;
const DOCUMENT_HISTORY_COALESCE_MS = 600;
const MARKDOWN_FILE_EXTENSION = /\.(md|markdown|txt)$/i;
const HTML_FILE_EXTENSION = /\.html?$/i;
const DOCUMENT_FILE_EXTENSION = /\.(md|markdown|txt|html?)$/i;
const MARKDOWN_MIME_TYPES = new Set(['text/markdown', 'text/plain']);
const HTML_MIME_TYPES = new Set(['text/html', 'application/xhtml+xml']);

type LocalDocumentKind = 'markdown' | 'html';

const localDocumentKind = (file: File): LocalDocumentKind | null => {
  if (MARKDOWN_FILE_EXTENSION.test(file.name) || MARKDOWN_MIME_TYPES.has(file.type)) return 'markdown';
  if (HTML_FILE_EXTENSION.test(file.name) || HTML_MIME_TYPES.has(file.type)) return 'html';
  return null;
};
const CITATION_STYLES: { id: CitationStyleId; label: string }[] = [
  { id: 'apa', label: 'APA 7th' },
  { id: 'ieee', label: 'IEEE' },
  { id: 'chicago-author-date', label: 'Chicago (author-date)' },
  { id: 'mla', label: 'MLA 9th' },
];

const PREFS_KEY = 'inmotools.markdown-workbench.prefs';

type EditorPrefs = {
  view: ViewMode;
  lineWrapping: boolean;
  fontSize: number;
  vimMode: boolean;
  spellcheck: boolean;
  syntaxSuggestions: boolean;
  darkMode: boolean;
  typewriterMode: boolean;
};

const loadEditorPrefs = (): Partial<EditorPrefs> => {
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const values = parsed as Record<string, unknown>;
    const prefs: Partial<EditorPrefs> = {};
    if (values.view === 'source' || values.view === 'split' || values.view === 'preview') prefs.view = values.view;
    if (typeof values.fontSize === 'number' && Number.isInteger(values.fontSize) && values.fontSize >= 11 && values.fontSize <= 20) {
      prefs.fontSize = values.fontSize;
    }
    for (const key of ['lineWrapping', 'vimMode', 'spellcheck', 'syntaxSuggestions', 'darkMode', 'typewriterMode'] as const) {
      if (typeof values[key] === 'boolean') prefs[key] = values[key];
    }
    return prefs;
  } catch {
    return {};
  }
};

const DEFAULT_SOURCE = `# Untitled document

Start writing here. Add **bold text**, tables, math like $E = mc^2$, diagrams, and citations.

| Item | Qty | Price | Total |
| - | - | - | - |
| Widgets | 4 | 2.5 | =B2*C2 |
`;

const parseToMdast = (source: string, references = ''): MdastRoot =>
  parseMarkdownTree(source, references);

const formatBytes = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function MarkdownWorkspace() {
  useEffect(() => {
    const workspaceRoute = window.location.hash;
    return registerPreloadRecoveryGuard(() => window.location.hash === workspaceRoute);
  }, []);
  const [view, setView] = useState<ViewMode>(() => loadEditorPrefs().view ?? 'split');
  const [history, setHistory] = useState<ProjectHistory<string>>(() => createHistory(DEFAULT_SOURCE));
  const source = history.present;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const fileReadRef = useRef(0);
  const lastEditorChangeAtRef = useRef(0);
  const formulaRunnerRef = useRef<TableFormulaRunner | null>(null);
  const [formulaEvaluation, setFormulaEvaluation] = useState({ source: DEFAULT_SOURCE, evaluated: DEFAULT_SOURCE });

  const [status, setStatus] = useState('Ready.');
  const [documentName, setDocumentName] = useState('');
  const [previewDocumentKey, setPreviewDocumentKey] = useState(0);
  const [taskEditRequest, setTaskEditRequest] = useState<{ before: string; after: string }>();
  const documentNameRef = useRef(documentName);
  documentNameRef.current = documentName;
  const [lineWrapping, setLineWrapping] = useState(() => loadEditorPrefs().lineWrapping ?? true);
  const [fontSize, setFontSize] = useState(() => loadEditorPrefs().fontSize ?? 13);
  const [vimMode, setVimMode] = useState(() => loadEditorPrefs().vimMode ?? false);
  const [spellcheck, setSpellcheck] = useState(() => loadEditorPrefs().spellcheck ?? true);
  const [syntaxSuggestions, setSyntaxSuggestions] = useState(() => loadEditorPrefs().syntaxSuggestions ?? true);
  const [darkMode, setDarkMode] = useState(() => loadEditorPrefs().darkMode ?? false);
  const [typewriterMode, setTypewriterMode] = useState(() => loadEditorPrefs().typewriterMode ?? false);
  const [focusMode, setFocusMode] = useState(false);
  const syncLockRef = useRef<'source' | 'preview' | null>(null);
  const ignorePreviewUntilRef = useRef(0);
  const programmaticPreviewTopRef = useRef(0);
  const lastPreviewTopRef = useRef(0);
  const lastCursorLineRef = useRef(0);

  useEffect(() => {
    const prefs: EditorPrefs = { view, lineWrapping, fontSize, vimMode, spellcheck, syntaxSuggestions, darkMode, typewriterMode };
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Private mode can reject storage. The session still works without remembered settings.
    }
  }, [view, lineWrapping, fontSize, vimMode, spellcheck, syntaxSuggestions, darkMode, typewriterMode]);

  const [outlineFilter, setOutlineFilter] = useState('');
  const [activeSourceLine, setActiveSourceLine] = useState(1);
  const [revealRequest, setRevealRequest] = useState<{ line: number; nonce: number; focus?: boolean }>();

  const [bibliographyText, setBibliographyText] = useState('');
  const [bibliographyFormat, setBibliographyFormat] = useState<'bib' | 'json'>('bib');
  const [citationStyle, setCitationStyle] = useState<CitationStyleId>('apa');
  const [citationFailureKey, setCitationFailureKey] = useState<string | null>(null);
  const [citationSnapshot, setCitationSnapshot] = useState<{
    readonly key: string;
    readonly result: FormattedCitations;
  } | null>(null);

  const [drafts, setDrafts] = useState<DraftRecord[]>([]);
  const [storageUsage, setStorageUsage] = useState<{ usageBytes: number | null; quotaBytes: number | null }>({
    usageBytes: null,
    quotaBytes: null,
  });
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);

  const draftStoreRef = useRef<DraftStore | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const editorViewScrollRef = useRef<{ offsetTop: number; sourceLine: number }[]>([]);
  // The latest line the preview was asked to follow. A request that lands while the preview is
  // re-rendering (no anchors yet) is re-applied once the anchors are measured, so it is not lost.
  const lastScrollSyncRef = useRef<{ line: number; at: number } | null>(null);
  const previewHostRef = useRef<HTMLDivElement | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bibInputRef = useRef<HTMLInputElement | null>(null);
  const persistedTextRef = useRef<string>(DEFAULT_SOURCE);
  const persistedDocumentNameRef = useRef('');
  const previewPendingRef = useRef(false);
  const previewWaitersRef = useRef<Array<() => void>>([]);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (typeof indexedDB === 'undefined') return;
    draftStoreRef.current = createIndexedDbDraftStore();
    listDrafts(draftStoreRef.current).then(setDrafts).catch(() => setDrafts([]));
    estimateStorageUsage().then(setStorageUsage);
  }, []);

  const refreshStorageEstimate = useCallback(() => {
    estimateStorageUsage().then(setStorageUsage).catch(() => undefined);
  }, []);

  const persistDraft = useCallback((text: string, name: string) => {
    const store = draftStoreRef.current;
    if (!store) return Promise.resolve(false);
    const now = Date.now();
    const documentNameSnapshot = documentNameRef.current;
    const draft = draftIdRef.current
      ? updateDraftRecord(
        { id: draftIdRef.current, name, text, updatedAt: now },
        text,
        now,
      )
      : createDraftRecord(name, text, now);
    draftIdRef.current = draft.id;
    return saveDraft(store, draft)
      .then(() => {
        if (draftIdRef.current === draft.id) {
          persistedTextRef.current = text;
          persistedDocumentNameRef.current = documentNameSnapshot;
          setIsDirty(
            sourceRef.current !== text
            || documentNameRef.current !== documentNameSnapshot,
          );
          setLastSavedAt(now);
        }
        return listDrafts(store);
      })
      .then(setDrafts)
      .then(refreshStorageEstimate)
      .then(() => true)
      .catch(() => { setStatus('Local autosave failed; your work is still in the editor.'); return false; });
  }, [refreshStorageEstimate]);

  useEffect(() => {
    setIsDirty(
      source !== persistedTextRef.current
      || documentName !== persistedDocumentNameRef.current,
    );
  }, [source, documentName]);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const commitSource = useCallback((next: string) => {
    lastEditorChangeAtRef.current = 0;
    setHistory((current) => commitHistory(current, next));
  }, []);

  const handleEditorSourceChange = useCallback((next: string) => {
    const now = performance.now();
    const shouldCoalesce =
      lastEditorChangeAtRef.current > 0
      && now - lastEditorChangeAtRef.current <= DOCUMENT_HISTORY_COALESCE_MS;
    lastEditorChangeAtRef.current = now;
    setHistory((current) =>
      shouldCoalesce ? replaceHistoryPresent(current, next) : commitHistory(current, next));
  }, []);

  const undo = useCallback(() => {
    lastEditorChangeAtRef.current = 0;
    setHistory((current) => undoHistory(current));
  }, []);
  const redo = useCallback(() => {
    lastEditorChangeAtRef.current = 0;
    setHistory((current) => redoHistory(current));
  }, []);

  const parsed = useMemo(() => parseMarkdown(source), [source]);
  const taskProgress = useMemo(() => countMarkdownTasks(parsed.tree as Root), [parsed]);
  const [styleChecksOpen, setStyleChecksOpen] = useState(false);
  const styleChecks = useMemo(
    () => styleChecksOpen ? collectMarkdownStyleSuggestions(source, parsed) : { suggestions: [], total: 0 },
    [source, parsed, styleChecksOpen],
  );
  const proseMetrics = useMemo(() => computeProseMetrics(source), [source]);
  const slides = useMemo(() => splitIntoSlides(source), [source]);
  const outline = useMemo(() => buildOutline(source), [source]);
  const filteredOutline = useMemo(() => {
    const query = outlineFilter.trim().toLocaleLowerCase();
    return query ? outline.filter((entry) => entry.text.toLocaleLowerCase().includes(query)) : outline;
  }, [outline, outlineFilter]);
  const activeOutlineId = useMemo(() => {
    let active: string | null = null;
    for (const entry of outline) {
      if (entry.line > activeSourceLine) break;
      active = entry.id;
    }
    return active;
  }, [outline, activeSourceLine]);
  const mathDiagnostics = useMemo(() => collectMathDiagnostics(source), [source]);

  const frontmatterEntries = useMemo(
    () => Object.entries(parsed.frontmatter.data),
    [parsed.frontmatter.data],
  );

  const effectiveTitle = useMemo(() => {
    if (documentName.trim()) return documentName.trim();
    const frontmatterTitle = parsed.frontmatter.data.title;
    if (typeof frontmatterTitle === 'string' && frontmatterTitle.trim()) return frontmatterTitle.trim();
    const firstHeading = outline[0]?.text.trim();
    if (firstHeading) return firstHeading;
    return 'Document';
  }, [documentName, parsed.frontmatter.data.title, outline]);

  const filenameStem = useMemo(() => toFilenameStem(effectiveTitle), [effectiveTitle]);
  const effectiveTitleRef = useRef(effectiveTitle);
  effectiveTitleRef.current = effectiveTitle;

  useEffect(() => {
    if (!draftStoreRef.current) return;
    if (source === persistedTextRef.current && documentName === persistedDocumentNameRef.current) return;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      void persistDraft(source, effectiveTitle);
    }, AUTOSAVE_DEBOUNCE_MS);
    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [source, documentName, effectiveTitle, persistDraft]);

  const citationParse = useMemo(() => {
    if (!bibliographyText.trim()) return { library: null, problem: null };
    try {
      const library = bibliographyFormat === 'bib' ? parseBibtex(bibliographyText) : parseCslJson(bibliographyText);
      if (library.entries.size === 0) {
        return {
          library: null,
          problem: bibliographyFormat === 'bib'
            ? 'No BibTeX entries were found. Each entry should start like @article{key, ...}.'
            : 'No CSL-JSON entries were found. Add an object or array of objects with an id field.',
        };
      }
      return { library, problem: null };
    } catch {
      return {
        library: null,
        problem: bibliographyFormat === 'json'
          ? 'Couldn’t read that CSL-JSON. Check the JSON syntax and try again.'
          : 'Couldn’t read that BibTeX. Check the entry syntax and try again.',
      };
    }
  }, [bibliographyText, bibliographyFormat]);
  const citationLibrary = citationParse.library;
  const citationProblem = citationParse.problem;

  const citekeys = useMemo(() => extractCitekeys(source, parsed), [source, parsed]);
  const citekeySignature = citekeys.join('\u0000');
  const citationRequestKey = useMemo(
    () => JSON.stringify([bibliographyFormat, bibliographyText, citationStyle, citekeySignature]),
    [bibliographyFormat, bibliographyText, citationStyle, citekeySignature],
  );
  // A formatting result is valid only for the exact bibliography/style/key
  // inputs that produced it. This makes stale async results unusable during
  // the render immediately following a style or bibliography change, before
  // the effect below has even had a chance to start the replacement request.
  const citationResult =
    citationLibrary && citationSnapshot?.key === citationRequestKey
      ? citationSnapshot.result
      : null;
  const citationFormatFailed = Boolean(citationLibrary && citationFailureKey === citationRequestKey);
  const citationsPending = Boolean(citationLibrary && citekeys.length > 0 && !citationResult && !citationFormatFailed);
  const citationExportBlocked = citationsPending || citationFormatFailed;

  useEffect(() => {
    if (!citationLibrary || citekeys.length === 0) {
      setCitationSnapshot(null);
      setCitationFailureKey(null);
      return;
    }
    setCitationFailureKey(null);
    let cancelled = false;
    const requestKey = citationRequestKey;
    formatCitations(citationLibrary, citekeys, citationStyle)
      .then((result) => {
        if (!cancelled) setCitationSnapshot({ key: requestKey, result });
      })
      .catch(() => {
        if (!cancelled) {
          setCitationSnapshot(null);
          setCitationFailureKey(requestKey);
          setStatus('Citation formatting failed for the selected style.');
        }
      });
    return () => { cancelled = true; };
    // citekeys is represented by citekeySignature so an equivalent key set
    // does not restart formatting merely because the source array identity changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [citationLibrary, citationRequestKey, citekeySignature, citationStyle]);

  useEffect(() => {
    const runner = formulaRunnerRef.current ?? createTableFormulaRunner();
    formulaRunnerRef.current = runner;
    let current = true;

    void runner.run(source)
      .then((evaluated) => {
        if (current) setFormulaEvaluation({ source, evaluated });
      })
      .catch((error) => {
        if (!current || error instanceof TableFormulaRunCancelled) return;
        setFormulaEvaluation({ source, evaluated: source });
        setStatus('Table formula preview could not be prepared in the background. Formula source is shown unchanged.');
      });

    return () => { current = false; };
  }, [source]);

  useEffect(() => () => {
    formulaRunnerRef.current?.dispose();
    formulaRunnerRef.current = null;
  }, []);

  const formulaPreparedSource =
    formulaEvaluation.source === source ? formulaEvaluation.evaluated : source;
  const preparedSource = useMemo(
    () => applyPreparedCitations(formulaPreparedSource, citationResult?.inText),
    [formulaPreparedSource, citationResult],
  );
  const generatedReferences = citationResult?.bibliographyMarkdown ?? '';

  const handlePreviewRenderStateChange = useCallback((pending: boolean) => {
    previewPendingRef.current = pending;
    if (!pending) {
      const waiters = previewWaitersRef.current.splice(0);
      waiters.forEach((resolve) => resolve());
    }
  }, []);

  const waitForPreviewSettled = useCallback((): Promise<void> => {
    if (!previewPendingRef.current) return Promise.resolve();
    return new Promise((resolve) => previewWaitersRef.current.push(resolve));
  }, []);

  const scrollPreviewToLine = useCallback((line: number, reveal = false) => {
    if (!reveal && syncLockRef.current === 'preview') return;
    lastScrollSyncRef.current = { line, at: Date.now() };
    const anchors = editorViewScrollRef.current;
    const scroller = previewHostRef.current?.querySelector<HTMLElement>('.markdown-workbench-preview');
    if (!scroller) return;
    const target = reveal ? scroller.querySelector<HTMLElement>(`[data-source-line="${line}"]`) : null;
    if (target) revealDisclosureTarget(target);
    if (!target && anchors.length === 0) return;
    const targetOffset = target ? target.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop : computeScrollOffset(anchors, line);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    ignorePreviewUntilRef.current = Date.now() + (reducedMotion ? 180 : 700);
    programmaticPreviewTopRef.current = Math.max(0, Math.min(targetOffset, scroller.scrollHeight - scroller.clientHeight));
    lastPreviewTopRef.current = scroller.scrollTop;
    scroller.scrollTo({ top: targetOffset, behavior: reducedMotion ? 'auto' : 'smooth' });
  }, []);

  const handlePreviewScroll = useCallback((offsetTop: number) => {
    if (view !== 'split') return;
    const previousTop = lastPreviewTopRef.current;
    lastPreviewTopRef.current = offsetTop;
    if (Date.now() < ignorePreviewUntilRef.current) {
      // The tool's own scroll only moves toward its target. A move away from it is the person scrolling:
      // they take over, and the pending source-driven position is dropped.
      const target = programmaticPreviewTopRef.current;
      if (Math.abs(offsetTop - target) <= Math.abs(previousTop - target) + 2) return;
      ignorePreviewUntilRef.current = 0;
    }
    lastScrollSyncRef.current = null;
    const line = sourceLineForScrollOffset(editorViewScrollRef.current, offsetTop);
    syncLockRef.current = 'preview';
    setActiveSourceLine(line);
    setRevealRequest({ line, nonce: Date.now(), focus: false });
    window.setTimeout(() => {
      if (syncLockRef.current === 'preview') syncLockRef.current = null;
    }, 180);
  }, [view]);

  const toggleTaskAtLine = useCallback((line: number) => {
    const next = toggleTaskListMarker(sourceRef.current, line);
    if (!next || next === sourceRef.current) {
      setStatus('That preview row is not a task checkbox.');
      return;
    }
    setTaskEditRequest({ before: sourceRef.current, after: next });
  }, []);

  const handleAnchorsMeasured = useCallback((offsets: { sourceLine: number; offsetTop: number }[]) => {
    editorViewScrollRef.current = offsets;
    const last = lastScrollSyncRef.current;
    if (!last || Date.now() - last.at >= 1500) return;
    const scroller = previewHostRef.current?.querySelector<HTMLElement>('.markdown-workbench-preview');
    const settled = Date.now() >= ignorePreviewUntilRef.current;
    // After the tool's own scroll has settled, a preview away from its target was moved by the person; leave it.
    if (scroller && settled && Math.abs(scroller.scrollTop - programmaticPreviewTopRef.current) > 4) return;
    scrollPreviewToLine(last.line);
  }, [scrollPreviewToLine]);

  const handleSourceLineChange = useCallback((line: number) => {
    setActiveSourceLine(line);
    if (view === 'split' && syncLockRef.current !== 'preview') scrollPreviewToLine(line);
  }, [view, scrollPreviewToLine]);

  // CodeMirror reports the caret on every selection update, including repeats for the same line; only a real move should scroll the preview.
  const handleCursorLineChange = useCallback((line: number) => {
    setActiveSourceLine(line);
    if (line === lastCursorLineRef.current) return;
    lastCursorLineRef.current = line;
    handleSourceLineChange(line);
  }, [handleSourceLineChange]);

  const revealLine = useCallback((line: number) => {
    setRevealRequest({ line, nonce: Date.now() });
    scrollPreviewToLine(line, true);
  }, [scrollPreviewToLine]);

  const loadMarkdownFile = useCallback(async (file: File) => {
    const kind = localDocumentKind(file);
    if (!kind) {
      setStatus(`"${file.name}" is not a supported document. Choose Markdown, plain text, or HTML (.md, .markdown, .txt, .html, .htm).`);
      return;
    }

    const request = ++fileReadRef.current;
    const original = sourceRef.current;
    const originalDocumentName = documentNameRef.current;
    try {
      const rawText = await file.text();
      const text = kind === 'html' ? await htmlToMarkdownDocument(rawText) : rawText;
      if (request !== fileReadRef.current) return;
      if (
        sourceRef.current !== original
        || documentNameRef.current !== originalDocumentName
      ) {
        setStatus('File opening cancelled because the document changed. Open the file again when ready.');
        return;
      }

      const currentDocumentIsDirty =
        original !== persistedTextRef.current
        || originalDocumentName !== persistedDocumentNameRef.current;
      if (currentDocumentIsDirty) {
        if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
        if (!await persistDraft(original, effectiveTitleRef.current)) {
          setStatus('Could not save the current document, so the selected file was not opened. Download Markdown before trying again.');
          return;
        }
        if (request !== fileReadRef.current) return;
        if (
          sourceRef.current !== original
          || documentNameRef.current !== originalDocumentName
        ) {
          setStatus('File opening cancelled because the document changed while it was being saved. Open the file again when ready.');
          return;
        }
      }

      const nextDocumentName = file.name.replace(DOCUMENT_FILE_EXTENSION, '');
      setPreviewDocumentKey(key => key + 1);
      draftIdRef.current = null;
      persistedTextRef.current = text;
      persistedDocumentNameRef.current = nextDocumentName;
      commitSource(text);
      setDocumentName(nextDocumentName);
      setLastSavedAt(null);
      setIsDirty(false);
      setStatus(kind === 'html'
        ? `Imported ${file.name} locally as Markdown. Complex HTML layout and styling may be simplified.`
        : `Opened ${file.name} locally. Nothing was uploaded.`);
    } catch {
      setStatus('Could not read that file in this browser.');
    }
  }, [commitSource, persistDraft]);

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

  const prepareExportSource = useCallback(
    () => prepareDocument(source, citationResult?.inText),
    [source, citationResult],
  );

  const buildExportBodyHtml = useCallback(async (): Promise<string> => {
    // Export is an explicit action rather than a per-keystroke path, so it can
    // synchronously prepare one exact snapshot without reintroducing editor
    // jank. Rendering into a detached host also guarantees Source view and a
    // still-settling live preview export the same current document.
    const scratch = document.createElement('div');
    scratch.innerHTML = renderMarkdown(prepareExportSource(), generatedReferences).html;
    await highlightCodeBlocks(scratch);
    await renderDiagramBlocks(scratch);
    return scratch.innerHTML;
  }, [prepareExportSource, generatedReferences]);

  const noteExport = (message: string) => {
    requestSupportPrompt({ key: 'markdown-workbench-export', message });
  };

  const exportMarkdown = () => {
    downloadText(source, `${filenameStem}.md`);
    setStatus(`Exported ${filenameStem}.md (your original source, with formulas and citation markers intact).`);
    noteExport('Exported your document locally with no upload step. If Markdown Workbench saved you a subscription, support independent local-first tooling with a coffee.');
  };

  const exportRenderedMarkdown = () => {
    downloadText(appendReferencesMarkdown(prepareExportSource(), generatedReferences), `${filenameStem}.rendered.md`);
    setStatus(`Exported ${filenameStem}.rendered.md with table formulas evaluated and citations formatted.`);
    noteExport('Exported your document locally with no upload step. If Markdown Workbench saved you a subscription, support independent local-first tooling with a coffee.');
  };

  const exportHtml = async () => {
    setStatus('Preparing standalone HTML and bundling its assets…');
    await waitForPreviewSettled();
    const bodyHtml = await buildExportBodyHtml();
    const [images, katexCss] = await Promise.all([
      bundleHtmlImages(bodyHtml, document.baseURI, 'inline'),
      inlineStylesheetAssets(katexExportCss, document.baseURI),
    ]);
    const unresolved = [...images.unresolved, ...katexCss.unresolved];
    if (unresolved.length > 0) {
      setStatus(`Standalone HTML export stopped: ${unresolved.length} referenced asset${unresolved.length === 1 ? '' : 's'} could not be bundled. Check image paths/network access and try again.`);
      return;
    }
    const html = buildStandaloneMarkdownHtml(effectiveTitle, images.html, { additionalCss: katexCss.css });
    downloadText(html, `${filenameStem}.html`, 'text/html;charset=utf-8');
    setStatus(`Exported ${filenameStem}.html as a self-contained offline file with rendered diagrams, KaTeX fonts, and images bundled.`);
    noteExport('Exported a self-contained offline HTML file locally with no upload step. If Markdown Workbench saved you a subscription, support independent local-first tooling with a coffee.');
  };

  const exportAstJson = () => {
    downloadText(buildAstJson(parseToMdast(prepareExportSource(), generatedReferences)), `${filenameStem}.ast.json`, 'application/json;charset=utf-8');
    setStatus(`Exported ${filenameStem}.ast.json for the prepared document (formulas evaluated, citations formatted).`);
  };

  const exportDocx = async () => {
    setStatus('Generating DOCX…');
    try {
      const bytes = await renderDocxToBytes(parseToMdast(prepareExportSource(), generatedReferences));
      downloadBytes(bytes, `${filenameStem}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      setStatus(`Exported ${filenameStem}.docx. Code blocks, blockquotes, ordered lists, links, and image references are preserved; math remains non-editable plain text unless rasterized.`);
      noteExport('Exported your document locally with no upload step. If Markdown Workbench saved you a subscription, support independent local-first tooling with a coffee.');
    } catch {
      setStatus('DOCX export failed.');
    }
  };

  const exportEpub = async () => {
    setStatus('Packaging EPUB and bundling referenced images…');
    try {
      await waitForPreviewSettled();
      const bodyHtml = await buildExportBodyHtml();
      const bundled = await bundleHtmlImages(bodyHtml, document.baseURI, 'epub');
      if (bundled.unresolved.length > 0) {
        setStatus(`EPUB export stopped: ${bundled.unresolved.length} referenced image${bundled.unresolved.length === 1 ? '' : 's'} could not be bundled.`);
        return;
      }
      const author = typeof parsed.frontmatter.data.author === 'string' ? parsed.frontmatter.data.author : '';
      const bytes = await buildEpubArchive(
        { title: effectiveTitle, author, identifier: `urn:uuid:${crypto.randomUUID()}` },
        bundled.html,
        bundled.assets,
      );
      downloadBytes(bytes, `${filenameStem}.epub`, 'application/epub+zip');
      setStatus(`Packaged ${filenameStem}.epub with XHTML-safe markup, required modification metadata, and referenced images bundled (not EPUBCheck-validated).`);
      noteExport('Packaged a structural EPUB locally with no upload step. If Markdown Workbench saved you a subscription, support independent local-first tooling with a coffee.');
    } catch {
      setStatus('EPUB export failed.');
    }
  };

  const printDocument = () => {
    document.body.classList.add('markdown-workbench-printing');
    const cleanup = () => {
      document.body.classList.remove('markdown-workbench-printing');
      window.removeEventListener('afterprint', cleanup);
    };
    window.addEventListener('afterprint', cleanup);
    if (view === 'source') {
      setStatus('Print uses the rendered preview. Switch to Split or Preview view, then print again.');
      cleanup();
      return;
    }
    window.print();
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

  const persistCurrentIfDirty = useCallback((text: string, name: string, currentDocumentName: string) => {
    if (text === persistedTextRef.current && currentDocumentName === persistedDocumentNameRef.current) return Promise.resolve(true);
    return persistDraft(text, name);
  }, [persistDraft]);

  const saveDraftNow = useCallback(() => {
    if (!draftStoreRef.current) {
      setStatus('Local draft storage is unavailable in this browser.');
      return;
    }
    void persistDraft(source, effectiveTitleRef.current).then((saved) => { if (saved) setStatus('Saved a local draft.'); });
  }, [persistDraft, source]);

  const startNewDraft = async () => {
    const request = ++fileReadRef.current;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    const previous = sourceRef.current;
    const previousDocumentName = documentNameRef.current;
    if (!await persistCurrentIfDirty(previous, effectiveTitleRef.current, previousDocumentName)) {
      setStatus('Could not save the current document. Download Markdown before starting a new document.');
      return;
    }
    if (request !== fileReadRef.current) return;
    if (
      sourceRef.current !== previous
      || documentNameRef.current !== previousDocumentName
    ) {
      setStatus('Document changed while saving. Choose New again when ready.');
      return;
    }
    draftIdRef.current = null;
    persistedTextRef.current = DEFAULT_SOURCE;
    setPreviewDocumentKey(key => key + 1);
    persistedDocumentNameRef.current = '';
    lastEditorChangeAtRef.current = 0;
    setHistory(createHistory(DEFAULT_SOURCE));
    setDocumentName('');
    setLastSavedAt(null);
    setIsDirty(false);
    setStatus('Started a new document. The previous draft is still listed below.');
  };

  const loadDraft = async (draft: DraftRecord) => {
    const request = ++fileReadRef.current;
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    const previous = sourceRef.current;
    const previousDocumentName = documentNameRef.current;
    if (!await persistCurrentIfDirty(previous, effectiveTitleRef.current, previousDocumentName)) {
      setStatus('Could not save the current document. Download Markdown before switching drafts.');
      return;
    }
    if (request !== fileReadRef.current) return;
    if (
      sourceRef.current !== previous
      || documentNameRef.current !== previousDocumentName
    ) {
      setStatus('Document changed while saving. Choose the draft again when ready.');
      return;
    }
    const restoredDocumentName = draft.name === 'Autosave' ? '' : draft.name;
    setPreviewDocumentKey(key => key + 1);
    draftIdRef.current = draft.id;
    persistedTextRef.current = draft.text;
    persistedDocumentNameRef.current = restoredDocumentName;
    commitSource(draft.text);
    setDocumentName(restoredDocumentName);
    setLastSavedAt(draft.updatedAt);
    setIsDirty(false);
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
    <div className={`markdown-workbench${darkMode ? ' markdown-workbench-theme-dark' : ''}${focusMode ? ' markdown-workbench-focus' : ''}`} data-testid="markdown-workbench">
      <div className="markdown-workbench-toolbar" role="toolbar" aria-label="Markdown Workbench controls">
        <div className="markdown-workbench-toolbar-section" role="group" aria-label="View and history">
          <span className="markdown-workbench-toolbar-label">View &amp; history</span>
          <div className="markdown-workbench-toolbar-group">
            <button type="button" onClick={() => setView('source')} aria-pressed={view === 'source'} title="Show only the Markdown source.">Source</button>
            <button type="button" onClick={() => setView('split')} aria-pressed={view === 'split'} title="Write on the left and follow the rendered document on the right. Scrolling either side moves the other.">Split</button>
            <button type="button" onClick={() => setView('preview')} aria-pressed={view === 'preview'} title="Show only the rendered document. The source stays mounted so your caret is kept.">Preview</button>
            <button type="button" onClick={undo} disabled={history.past.length === 0} aria-label="Undo document step" title="Undo one grouped document step. Ctrl/Cmd+Z inside the editor keeps CodeMirror's fine-grained text history.">Undo step</button>
            <button type="button" onClick={redo} disabled={history.future.length === 0} aria-label="Redo document step" title="Redo one grouped document step.">Redo step</button>
            <button type="button" className="markdown-workbench-focus-toggle" onClick={() => setFocusMode((current) => !current)} title="Hide export and panels so the page is mostly the document. Save state stays visible.">{focusMode ? 'Exit focus' : 'Focus writing'}</button>
          </div>
        </div>

        <div className="markdown-workbench-toolbar-section" role="group" aria-label="Document">
          <span className="markdown-workbench-toolbar-label">Document</span>
          <div className="markdown-workbench-toolbar-group">
            <button type="button" onClick={() => fileInputRef.current?.click()} title="Open a Markdown, text, or HTML file from this device. Nothing is uploaded.">Open document</button>
            <button type="button" onClick={startNewDraft} title="Save the current document if it changed, then start a blank one.">New</button>
            <button type="button" onClick={saveDraftNow} title="Save a local draft in this browser. Shortcut: Ctrl/Cmd+S." aria-keyshortcuts="Control+S Meta+S">Save draft</button>
            <input ref={fileInputRef} className="markdown-workbench-file-input" type="file" accept=".md,.markdown,.txt,.html,.htm,text/markdown,text/plain,text/html,application/xhtml+xml" onChange={onFileInputChange} aria-label="Open a local Markdown, text, or HTML file" />
          </div>
        </div>

        <div className="markdown-workbench-toolbar-section" role="group" aria-label="Editor">
          <span className="markdown-workbench-toolbar-label">Editor</span>
          <div className="markdown-workbench-toolbar-group">
            <label className="markdown-workbench-check"><input type="checkbox" checked={lineWrapping} onChange={(event) => setLineWrapping(event.target.checked)} />Wrap lines</label>
            <label className="markdown-workbench-check" title="Use Vim keybindings. In normal mode, :w or :write saves the current named draft locally."><input type="checkbox" checked={vimMode} onChange={(event) => setVimMode(event.target.checked)} />Vim keys</label>
            <label className="markdown-workbench-check"><input type="checkbox" checked={spellcheck} onChange={(event) => setSpellcheck(event.target.checked)} />Spellcheck</label>
            <label className="markdown-workbench-check"><input type="checkbox" checked={typewriterMode} onChange={(event) => setTypewriterMode(event.target.checked)} />Typewriter mode</label>
            <label className="markdown-workbench-check"><input type="checkbox" checked={syntaxSuggestions} onChange={(event) => setSyntaxSuggestions(event.target.checked)} />Syntax suggestions</label>
            <label className="markdown-workbench-check"><input type="checkbox" checked={darkMode} onChange={(event) => setDarkMode(event.target.checked)} />Dark workspace</label>
            <label className="markdown-workbench-font-size">Font size<input aria-label="Font size" type="range" min={11} max={20} value={fontSize} onChange={(event) => setFontSize(Number(event.target.value))} /><output data-testid="markdown-font-size-value">{fontSize} px</output></label>
            <MarkdownSyntaxHelp />
          </div>
        </div>

        <div className="markdown-workbench-toolbar-section markdown-workbench-export-section" role="group" aria-label="Export as">
          <span className="markdown-workbench-toolbar-label">Export as</span>
          <div className="markdown-workbench-toolbar-group markdown-workbench-export-group">
            <button type="button" onClick={exportMarkdown} title="Download the source you typed, with formulas and citation markers left as written.">Markdown</button>
            <button type="button" disabled={citationExportBlocked} onClick={exportRenderedMarkdown} title="Download Markdown with formulas evaluated, citations formatted and References included. Available when citation formatting finishes.">Rendered Markdown</button>
            <button type="button" disabled={citationExportBlocked} onClick={() => void exportHtml()} title="Download one HTML file with the rendered document, diagrams, and images bundled in. Available when citation formatting finishes.">Standalone HTML</button>
            <button type="button" disabled={citationExportBlocked} onClick={printDocument} title="Print the rendered preview, or save it as PDF from the print dialog. Switch out of Source view first. Available when citation formatting finishes.">Print / PDF</button>
            <button type="button" disabled={citationExportBlocked} onClick={() => void exportDocx()} title="Download a Word file. Math stays as plain text. Available when citation formatting finishes.">DOCX</button>
            <button type="button" disabled={citationExportBlocked} onClick={() => void exportEpub()} title="Package a structural EPUB on this device. It is not EPUBCheck-validated. Available when citation formatting finishes.">EPUB (structural)</button>
            <button type="button" disabled={citationExportBlocked} onClick={exportAstJson} title="Download the prepared document as a syntax tree, for inspection rather than reading. Available when citation formatting finishes.">AST JSON</button>
          </div>
        </div>
      </div>

      <div className="markdown-workbench-namebar">
        <label className="markdown-workbench-name-field">
          Document name
          <input type="text" value={documentName} placeholder={effectiveTitle} onChange={(event) => setDocumentName(event.target.value)} />
        </label>
        <span className="markdown-workbench-hint" data-testid="markdown-filename-preview">Exports as <code>{filenameStem}.*</code></span>
        <div className="markdown-workbench-toolbar-group">
          <button type="button" onClick={() => void copyToClipboard(source, 'the Markdown source')} title="Copy the source you typed.">Copy Markdown</button>
          <button type="button" onClick={() => { void buildExportBodyHtml().then((html) => copyToClipboard(html, 'the rendered HTML')); }} title="Copy the rendered HTML, including code colors.">Copy HTML</button>
        </div>
      </div>

      <div className={`markdown-workbench-body markdown-workbench-view-${view}`}>
        <div className="markdown-workbench-editor-pane" onDrop={onEditorDrop} onDragOver={onEditorDragOver}>
          <MarkdownEditor
            onFormatChange={commitSource}
            onSave={saveDraftNow}
            value={source}
            onChange={handleEditorSourceChange}
            onCursorLineChange={handleCursorLineChange}
            onViewportLineChange={handleSourceLineChange}
            onStatus={setStatus}
            lineWrapping={lineWrapping}
            fontSize={fontSize}
            vimMode={vimMode}
            spellcheck={spellcheck}
            syntaxSuggestions={syntaxSuggestions}
            darkMode={darkMode}
            typewriterMode={typewriterMode}
            revealRequest={revealRequest}
            taskEditRequest={taskEditRequest}
          />
        </div>
        {view !== 'source' ? (
          <div className="markdown-workbench-preview-pane" ref={previewHostRef}>
            <MarkdownPreview
              preparedSource={preparedSource}
              generatedReferences={generatedReferences}
              documentKey={previewDocumentKey}
              onNotice={setStatus}
              onAnchorsMeasured={handleAnchorsMeasured}
              onRenderStateChange={handlePreviewRenderStateChange}
              onPreviewScroll={handlePreviewScroll}
              onToggleTask={toggleTaskAtLine}
            />
          </div>
        ) : null}
      </div>

      <div className="markdown-workbench-status">
        <span data-testid="markdown-status" role="status" aria-live="polite">{status}</span>
        <span className="markdown-workbench-live-metrics" data-testid="markdown-live-metrics">{proseMetrics.words} words · {source ? source.split(/\r\n|\r|\n/).length : 0} lines · {proseMetrics.readingMinutes < 1 && proseMetrics.words > 0 ? '<1' : proseMetrics.readingMinutes.toFixed(0)} min read</span>
        <span className="markdown-workbench-task-progress" data-testid="markdown-task-progress" role="status" aria-live="polite" aria-atomic="true">
          <span>{taskProgress.total ? `Tasks: ${taskProgress.completed}/${taskProgress.total} complete` : 'Tasks: none'}</span>
          {taskProgress.total > 0 ? <progress aria-label="Completed tasks" aria-valuetext={`${taskProgress.completed} of ${taskProgress.total} tasks complete`} value={taskProgress.completed} max={taskProgress.total} /> : null}
        </span>
        <span className="markdown-workbench-autosave-status" data-testid="markdown-save-state" role="status" aria-live="polite">
          {lastSavedAt ? `${isDirty ? 'Unsaved changes · last saved' : 'Saved'} ${new Date(lastSavedAt).toLocaleTimeString()}` : 'Not yet saved locally'}
        </span>
      </div>

      <details className="markdown-workbench-panel" onToggle={(event) => setStyleChecksOpen(event.currentTarget.open)}>
        <summary>Markdown checks</summary>
        <p className="markdown-workbench-hint">Style suggestions for heading levels, adjacent bullet markers and unnecessary trailing whitespace. Valid Markdown can use different styles. These checks leave your source unchanged and preserve two-space hard breaks.</p>
        <ul className="markdown-workbench-diagnostics" data-testid="markdown-lint">
          {styleChecks.suggestions.map((suggestion) => (
            <li key={`${suggestion.line}-${suggestion.rule}`}>
              <button type="button" onClick={() => { setView('source'); revealLine(suggestion.line); }}>Line {suggestion.line}: {suggestion.message}</button>
            </li>
          ))}
        </ul>
        {styleChecksOpen && styleChecks.total === 0 ? <p>No style suggestions for these checks.</p> : null}
        {styleChecks.total > MAX_STYLE_SUGGESTIONS ? <p>Showing the first {MAX_STYLE_SUGGESTIONS} of {styleChecks.total} suggestions.</p> : null}
      </details>

      <details className="markdown-workbench-panel">
        <summary>Outline ({outline.length})</summary>
        {outline.length > 0 ? (
          <>
            <label className="markdown-workbench-outline-filter">
              Filter headings
              <input type="search" aria-label="Filter outline headings" value={outlineFilter} onChange={(event) => setOutlineFilter(event.target.value)} placeholder="Find a section" />
            </label>
            {filteredOutline.length > 0 ? (
              <ul className="markdown-workbench-outline" data-testid="markdown-outline">
                {filteredOutline.map((entry) => (
                  <li key={`${entry.id}-${entry.line}`} data-depth={entry.depth}>
                    <button type="button" onClick={() => revealLine(entry.line)} aria-current={entry.id === activeOutlineId ? 'location' : undefined}>{entry.text || '(untitled heading)'}</button>
                  </li>
                ))}
              </ul>
            ) : <p className="markdown-workbench-hint">No headings match that filter.</p>}
          </>
        ) : <p className="markdown-workbench-hint">No headings yet. Add a line starting with # to build an outline.</p>}
      </details>

      <details className="markdown-workbench-panel">
        <summary>Document metrics</summary>
        <dl className="markdown-workbench-metrics">
          <div><dt>Words</dt><dd>{proseMetrics.words}</dd></div>
          <div><dt>Characters</dt><dd>{proseMetrics.characters}</dd></div>
          <div><dt>Source characters</dt><dd>{source.length}</dd></div>
          <div><dt>Lines</dt><dd>{source ? source.split(/\r\n|\r|\n/).length : 0}</dd></div>
          <div><dt>Sentences</dt><dd>{proseMetrics.sentences}</dd></div>
          <div><dt>Reading time (estimate)</dt><dd>{proseMetrics.readingMinutes.toFixed(1)} min</dd></div>
          <div><dt>Speaking time (estimate)</dt><dd>{proseMetrics.speakingMinutes.toFixed(1)} min</dd></div>
          <div><dt>Fog index (heuristic)</dt><dd>{proseMetrics.fogIndex.toFixed(1)}</dd></div>
        </dl>
        <p className="markdown-workbench-hint">Characters counts letters and numbers in the prose, skipping spaces and Markdown marks. Source characters is the raw document length. Reading time, speaking time, and the Fog index are rule-of-thumb estimates, not a measure of any one reader.</p>
      </details>

      {parsed.frontmatter.format !== null ? (
        <details className="markdown-workbench-panel">
          <summary>Frontmatter ({parsed.frontmatter.format.toUpperCase()})</summary>
          {frontmatterEntries.length > 0 ? (
            <dl className="markdown-workbench-metrics" data-testid="markdown-frontmatter">
              {frontmatterEntries.map(([key, value]) => (
                <div key={key}><dt>{key}</dt><dd>{typeof value === 'string' ? value : JSON.stringify(value)}</dd></div>
              ))}
            </dl>
          ) : <p className="markdown-workbench-hint">The frontmatter block parsed but contained no top-level fields.</p>}
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
                <code>{diagnostic.source}</code><span>{diagnostic.error}</span>
              </li>
            ))}
          </ul>
        ) : <p className="markdown-workbench-hint">Every math expression in this document parses. Broken expressions render as flagged error text in the preview and are listed here.</p>}
      </details>

      <details className="markdown-workbench-panel">
        <summary>Citations ({citekeys.length} referenced)</summary>
        <p className="markdown-workbench-hint">Resolved document citations add a References section to preview and rendered exports. Original Markdown keeps your citation markers. Code examples, metadata and uncited library entries are excluded.</p>
        {citationsPending ? <p className="markdown-workbench-hint" role="status">Formatting citations… Rendered exports will be available when this finishes.</p> : null}
        {citationFormatFailed ? <p className="markdown-workbench-citation-warning" role="alert">Couldn’t format these citations. Check the bibliography or choose another style. Original Markdown is available.</p> : null}
        <div className="markdown-workbench-citation-controls">
          <label>
            Bibliography format
            <select value={bibliographyFormat} onChange={(event) => setBibliographyFormat(event.target.value as 'bib' | 'json')}>
              <option value="bib">.bib (BibTeX)</option><option value="json">CSL-JSON</option>
            </select>
          </label>
          <label>
            Citation style
            <select value={citationStyle} onChange={(event) => setCitationStyle(event.target.value as CitationStyleId)}>
              {CITATION_STYLES.map((style) => <option key={style.id} value={style.id}>{style.label}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => bibInputRef.current?.click()}>Load .bib / CSL-JSON file</button>
          <input ref={bibInputRef} className="markdown-workbench-file-input" type="file" accept=".bib,.json,.txt,application/json,text/plain" onChange={(event) => void onBibInputChange(event)} aria-label="Load a local bibliography file" />
        </div>
        <textarea
          className="markdown-workbench-bibliography-input"
          aria-label="Bibliography source"
          placeholder="Paste .bib or CSL-JSON content here"
          value={bibliographyText}
          onChange={(event) => setBibliographyText(event.target.value)}
        />
        <p className="markdown-workbench-hint">Reference a source with <code>[@citekey]</code>. Resolved markers are formatted in preview and rendered exports; unresolved markers remain visible. Original Markdown keeps the markers.</p>
        {citationProblem ? <p className="markdown-workbench-citation-warning" role="alert">{citationProblem}</p> : null}
        {citationResult ? (
          <div className="markdown-workbench-citation-preview">
            {citationResult.unresolved.length > 0 ? (
              <p className="markdown-workbench-citation-warning">Unresolved citation key{citationResult.unresolved.length === 1 ? '' : 's'}: {citationResult.unresolved.join(', ')}</p>
            ) : null}
            {citationResult.bibliographyHtml.length > 0 ? (
              <div className="markdown-workbench-bibliography-output" dangerouslySetInnerHTML={{ __html: citationResult.bibliographyHtml.join('') }} />
            ) : null}
          </div>
        ) : null}
      </details>

      <details className="markdown-workbench-panel">
        <summary>Slides ({slides.length})</summary>
        <ol className="markdown-workbench-slide-list" data-testid="markdown-slide-list">
          {slides.map((slide) => {
            const heading = slide.source.split('\n').map((line) => line.trim()).find((line) => line.length > 0);
            return <li key={slide.index}><button type="button" onClick={() => revealLine(slide.startLine)}>{heading ? heading.replace(/^#+\s*/, '') : '(empty slide)'}</button></li>;
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
                <button type="button" onClick={() => loadDraft(draft)}>{draft.name} — {new Date(draft.updatedAt).toLocaleString()}</button>
                <button type="button" className="markdown-workbench-draft-delete" onClick={() => removeDraft(draft)} aria-label={`Delete draft saved ${new Date(draft.updatedAt).toLocaleString()}`}>Delete</button>
              </li>
            ))}
          </ul>
        ) : <p className="markdown-workbench-hint">No local drafts saved yet.</p>}
        <p className="markdown-workbench-hint">Drafts are stored in this browser only (IndexedDB) and are never uploaded. Ctrl/Cmd+S saves one immediately.</p>
      </details>
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap, isolateHistory, invertedEffects } from '@codemirror/commands';
import { markdown, markdownKeymap } from '@codemirror/lang-markdown';
import { defaultHighlightStyle, HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { openSearchPanel, searchKeymap } from '@codemirror/search';
import { Annotation, Compartment, EditorState, StateEffect, StateField, Transaction } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { tags } from '@lezer/highlight';
import { getCM, vim } from '@replit/codemirror-vim';
import { markdownSyntaxCompletions } from './markdown-completions';
import { buildOutline } from './outline-engine';
import { HEADING_ID_PREFIX } from './heading-slug';
import MarkdownTableBuilder from './MarkdownTableBuilder';
import type { Root } from 'mdast';
import { findTableAtLine } from './csv-table-engine';
import { parseMarkdown } from './parse-engine';
import { astHighlightField, astHighlightTheme, selectAstRange, setAstHighlight } from './ast-highlight';
import type { AstRange } from './ast-inspector-engine';

const formattingChange = Annotation.define<boolean>();
const normalizedSource = (source: string) => source.replace(/\r\n?|\n/g, '\n');
const restoreSource = StateEffect.define<string>();
const sourceState = StateField.define<{ source: string; canonical: string }>({
  create: state => {
    const source = state.doc.toString();
    return { source, canonical: source };
  },
  update: (previous, transaction) => {
    for (const effect of transaction.effects) if (effect.is(restoreSource)) {
      return { source: effect.value, canonical: normalizedSource(effect.value) };
    }
    if (!transaction.docChanged) return previous;
    const source = transaction.newDoc.toString();
    return { source, canonical: source };
  },
});

// CodeMirror 6 markdown source editor, mirroring the wiring pattern already
// used by this catalog's other CodeMirror-based tools (see LatticeEditor.tsx,
// ShaderEditor.tsx): a host div ref, an EditorView held in a ref (not React
// state, since CodeMirror owns its own DOM), and an updateListener that
// reports changes back out via a stable callback ref so the effect that
// creates the view does not need to depend on the latest onChange closure.
//
// Every user-toggleable setting lives in a Compartment so it can be
// reconfigured in place. This matters for more than tidiness: recreating the
// view on each change dropped the caret, the selection, the scroll position,
// and CodeMirror's own undo history - which made the font-size slider
// unusable, since every step of a drag rebuilt the editor from scratch.

// Local-only image embedding: a pasted or dropped image never leaves the
// browser. Capped well under typical email/base64 bloat concerns so one
// large screenshot cannot silently balloon the document; past this, point
// people at the Image button's URL form instead of guessing at compression.
const MAX_EMBEDDED_IMAGE_BYTES = 5 * 1024 * 1024;

const readImageAsDataUrl = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read that image.'));
    reader.readAsDataURL(file);
  });

const insertPatternAtSelection = (
  view: EditorView,
  before: string,
  after: string,
  fallback: string,
  useSelection = true,
): boolean => {
  const { from, to } = view.state.selection.main;
  const selected = (useSelection ? view.state.sliceDoc(from, to) : '') || fallback;
  view.dispatch({
    changes: { from, to, insert: before + selected + after },
    selection: { anchor: from + before.length, head: from + before.length + selected.length },
    userEvent: 'input',
  });
  view.focus();
  return true;
};


const DARK_HIGHLIGHT_STYLE = HighlightStyle.define([
  { tag: tags.comment, color: '#aeb8c2', fontStyle: 'italic' },
  { tag: tags.keyword, color: '#9fb8ff', fontWeight: '700' },
  { tag: [tags.string, tags.literal], color: '#7ad9a5' },
  { tag: [tags.number, tags.bool, tags.atom], color: '#f2b36c' },
  { tag: [tags.typeName, tags.className, tags.namespace], color: '#d2adff' },
  { tag: [tags.propertyName, tags.labelName, tags.heading], color: '#8cc8ff' },
  { tag: [tags.meta, tags.operator, tags.punctuation], color: '#c7d0d9' },
  { tag: [tags.link, tags.url], color: '#8cc8ff', textDecoration: 'underline' },
  { tag: tags.invalid, color: '#ff8a80', textDecoration: 'underline wavy' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
]);

const markdownEditorTheme = (dark: boolean) => EditorView.theme({
  '&': { minHeight: '360px', height: '100%', backgroundColor: 'var(--surface)', color: 'var(--ink)' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
  '.cm-content': { minHeight: '340px', padding: '10px 0', caretColor: 'var(--ink)' },
  '.cm-gutters': { backgroundColor: 'var(--surface-strong)', color: 'var(--muted)', borderRight: '1px solid var(--line)' },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--signal-soft)' },
  '&.cm-focused': { outline: '2px solid var(--signal)', outlineOffset: '-2px' },
}, { dark });

const selectedEditorLines = (view: EditorView) => {
  const { from, to } = view.state.selection.main;
  const startLine = view.state.doc.lineAt(from).number;
  const endLine = view.state.doc.lineAt(to).number;
  const lines = [];
  for (let number = startLine; number <= endLine; number += 1) lines.push(view.state.doc.line(number));
  return lines;
};

const toggleLinePrefixInView = (view: EditorView, prefix: string): boolean => {
  const lines = selectedEditorLines(view);
  const allPrefixed = lines.every((line) => line.text.startsWith(prefix));
  view.dispatch({
    changes: lines.map((line) => allPrefixed
      ? { from: line.from, to: line.from + prefix.length, insert: '' }
      : { from: line.from, to: line.from, insert: prefix }),
    userEvent: 'input',
  });
  view.focus();
  return true;
};

const toggleOrderedListInView = (view: EditorView): boolean => {
  const lines = selectedEditorLines(view);
  const numbered = /^\d+\.\s/;
  const allNumbered = lines.every((line) => numbered.test(line.text));
  view.dispatch({
    changes: lines.map((line, index) => {
      const match = numbered.exec(line.text);
      return allNumbered && match
        ? { from: line.from, to: line.from + match[0].length, insert: '' }
        : { from: line.from, to: line.from, insert: `${index + 1}. ` };
    }),
    userEvent: 'input',
  });
  view.focus();
  return true;
};

interface MarkdownActionProps {
  readonly id: string;
  readonly label: string;
  readonly help: string;
  readonly onClick: () => void;
  readonly ariaKeyShortcuts?: string;
}

function MarkdownAction({ id, label, help, onClick, ariaKeyShortcuts }: MarkdownActionProps) {
  const [open, setOpen] = useState(false);
  const tooltipId = `markdown-format-tip-${id}`;
  return (
    <span className="markdown-workbench-format-action" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        onClick={onClick}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            setOpen(false);
          }
        }}
        aria-describedby={tooltipId}
        aria-keyshortcuts={ariaKeyShortcuts}
      >
        {label}
      </button>
      <span id={tooltipId} role="tooltip" className="markdown-workbench-format-tooltip" hidden={!open}>{help}</span>
    </span>
  );
}

export interface MarkdownEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onFormatChange?: (value: string) => void;
  readonly onSave?: () => void;
  readonly onCursorLineChange?: (line: number) => void;
  readonly onViewportLineChange?: (line: number) => void;
  readonly onStatus?: (message: string) => void;
  readonly lineWrapping: boolean;
  readonly fontSize: number;
  readonly vimMode: boolean;
  readonly spellcheck: boolean;
  readonly syntaxSuggestions: boolean;
  readonly darkMode: boolean;
  readonly typewriterMode?: boolean;
  // Incremented by the parent to request that a given line be scrolled into
  // view and focused (used by the document outline). A counter rather than a
  // bare line number so selecting the same heading twice still re-reveals it.
  readonly revealRequest?: { readonly line: number; readonly nonce: number; readonly focus?: boolean };
  readonly taskEditRequest?: { readonly before: string; readonly after: string };
  // Syntax-tree inspector: the chosen node's range is highlighted, and a request also selects and scrolls to it.
  readonly astHighlight?: AstRange | null;
  readonly astRangeRequest?: { readonly range: AstRange; readonly nonce: number };
}

export default function MarkdownEditor({
  value,
  onChange,
  onFormatChange,
  onSave,
  onCursorLineChange,
  onViewportLineChange,
  onStatus,
  lineWrapping,
  fontSize,
  vimMode,
  spellcheck,
  syntaxSuggestions,
  darkMode,
  typewriterMode = false,
  revealRequest,
  taskEditRequest,
  astHighlight = null,
  astRangeRequest,
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onFormatChangeRef = useRef(onFormatChange);
  onFormatChangeRef.current = onFormatChange;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const formatterRef = useRef<Worker | null>(null);
  const [formatting, setFormatting] = useState(false);
  const cancelFormatting = (message?: string) => {
    if (!formatterRef.current) return;
    formatterRef.current.terminate();
    formatterRef.current = null;
    setFormatting(false);
    if (message) onStatusRef.current?.(message);
  };
  const onCursorLineChangeRef = useRef(onCursorLineChange);
  const onViewportLineChangeRef = useRef(onViewportLineChange);
  const onStatusRef = useRef(onStatus);
  const typewriterRef = useRef(typewriterMode);
  const centerFrameRef = useRef<number | null>(null);
  typewriterRef.current = typewriterMode;
  const centerCaret = (view: EditorView) => {
    if (centerFrameRef.current !== null) cancelAnimationFrame(centerFrameRef.current);
    centerFrameRef.current = requestAnimationFrame(() => {
      centerFrameRef.current = null;
      if (typewriterRef.current && view.scrollDOM.isConnected) {
        view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'center' }) });
      }
    });
  };
  // Set around a programmatic dispatch (the value-sync effect below, used
  // when an external change - undo/redo, restoring a draft, opening a file -
  // replaces the document from outside the editor). Without this guard, that
  // dispatch fires the same updateListener a real keystroke does, which calls
  // onChange and re-commits the restored text as a brand-new edit, wiping out
  // the workspace's own redo stack on every undo.
  const isExternalSyncRef = useRef(false);

  const vimCompartment = useRef(new Compartment()).current;
  const wrapCompartment = useRef(new Compartment()).current;
  const attributesCompartment = useRef(new Compartment()).current;
  const suggestionsCompartment = useRef(new Compartment()).current;
  const themeCompartment = useRef(new Compartment()).current;
  const highlightCompartment = useRef(new Compartment()).current;

  // Latest-value refs let the mount effect below seed the initial state
  // without taking a dependency on props that must not trigger a rebuild.
  const valueRef = useRef(value);
  const fontSizeRef = useRef(fontSize);
  const spellcheckRef = useRef(spellcheck);
  const lineWrappingRef = useRef(lineWrapping);
  const vimModeRef = useRef(vimMode);
  const syntaxSuggestionsRef = useRef(syntaxSuggestions);
  const darkModeRef = useRef(darkMode);
  valueRef.current = value;
  fontSizeRef.current = fontSize;
  spellcheckRef.current = spellcheck;
  lineWrappingRef.current = lineWrapping;
  vimModeRef.current = vimMode;
  syntaxSuggestionsRef.current = syntaxSuggestions;
  darkModeRef.current = darkMode;

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onCursorLineChangeRef.current = onCursorLineChange; }, [onCursorLineChange]);
  useEffect(() => { onViewportLineChangeRef.current = onViewportLineChange; }, [onViewportLineChange]);
  useEffect(() => { onStatusRef.current = onStatus; }, [onStatus]);

  const insertImageAtSelection = async (view: EditorView, file: File, at?: number) => {
    if (file.size > MAX_EMBEDDED_IMAGE_BYTES) {
      onStatusRef.current?.(`"${file.name}" is larger than 5 MB and was not embedded. Resize it first, or use the Image button for an external URL instead.`);
      return;
    }
    let dataUrl: string;
    try {
      dataUrl = await readImageAsDataUrl(file);
    } catch {
      onStatusRef.current?.(`Could not read "${file.name}" as an image in this browser.`);
      return;
    }
    const markdown = `![${file.name.replace(/\.[^.]+$/, '')}](${dataUrl})`;
    const from = at ?? view.state.selection.main.from;
    const to = at !== undefined ? at : view.state.selection.main.to;
    view.dispatch({
      changes: { from, to, insert: markdown },
      selection: { anchor: from + markdown.length },
      userEvent: 'input',
    });
    view.focus();
    onStatusRef.current?.(`Embedded "${file.name}" as an inline image. Nothing was uploaded.`);
  };

  // Built once per mount. `value`, `fontSize`, `spellcheck`, `lineWrapping`,
  // `vimMode`, and `syntaxSuggestions` are intentionally absent from the
  // dependency list: the initial document is seeded here and every later
  // change is applied through the effects below instead of rebuilding the view.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const buildAttributes = (size: number, spell: boolean) => [
      EditorView.contentAttributes.of({
        'aria-label': 'Markdown source',
        tabindex: '0',
        spellcheck: spell ? 'true' : 'false',
        style: `font-size:${size}px`,
      }),
      EditorView.editorAttributes.of({ style: `font-size:${size}px` }),
    ];

    const buildSuggestions = (enabled: boolean) => enabled
      ? autocompletion({ override: [markdownSyntaxCompletions], activateOnTyping: true })
      : [];

    const state = EditorState.create({
      doc: valueRef.current,
      extensions: [
        // Kept first so vim's keymap keeps its precedence over the default
        // keymap when the compartment is reconfigured.
        vimCompartment.of(vimModeRef.current ? vim() : []),
        lineNumbers(),
        astHighlightField,
        astHighlightTheme,
        history(),
        sourceState.init(() => ({ source: valueRef.current, canonical: normalizedSource(valueRef.current) })),
        invertedEffects.of(transaction => {
          const before = transaction.startState.field(sourceState);
          return transaction.docChanged && (before.source !== before.canonical || transaction.effects.some(effect => effect.is(restoreSource)))
            ? [restoreSource.of(before.source)] : [];
        }),
        drawSelection(),
        highlightActiveLine(),
        closeBrackets(),
        markdown(),
        highlightCompartment.of(syntaxHighlighting(darkModeRef.current ? DARK_HIGHLIGHT_STYLE : defaultHighlightStyle)),
        themeCompartment.of(markdownEditorTheme(darkModeRef.current)),
        wrapCompartment.of(lineWrappingRef.current ? EditorView.lineWrapping : []),
        suggestionsCompartment.of(buildSuggestions(syntaxSuggestionsRef.current)),
        keymap.of([
          { key: 'Mod-b', run: (view) => insertPatternAtSelection(view, '**', '**', 'bold text') },
          { key: 'Mod-i', run: (view) => insertPatternAtSelection(view, '*', '*', 'italic text') },
          { key: 'Mod-e', run: (view) => insertPatternAtSelection(view, '`', '`', 'code') },
          { key: 'Mod-k', run: (view) => insertPatternAtSelection(view, '[', '](https://example.com)', 'link text') },
          {
            any: (view, event) => {
              if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey) return false;
              if (event.code === 'Digit7') return toggleOrderedListInView(view);
              if (event.code === 'Digit8') return toggleLinePrefixInView(view, '- ');
              if (event.code === 'Period') return toggleLinePrefixInView(view, '> ');
              return false;
            },
          },
          ...closeBracketsKeymap,
          ...markdownKeymap,
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
        ]),
        attributesCompartment.of(buildAttributes(fontSizeRef.current, spellcheckRef.current)),
        // Pasting or dropping an image embeds it as a data URI at the drop
        // point/selection. A non-image paste returns false so the browser's
        // normal text-paste still runs. A non-image *file* drop still
        // returns true (with no stopPropagation) so it bubbles to the
        // workspace's own file-drop handler (opening a dropped .md file):
        // CodeMirror's own built-in drop handling would otherwise read the
        // same file as text and race that handler to insert its raw
        // contents at the cursor instead of opening it as a new document.
        EditorView.domEventHandlers({
          paste: (event, view) => {
            const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith('image/'));
            if (!file) return false;
            event.preventDefault();
            void insertImageAtSelection(view, file);
            return true;
          },
          drop: (event, view) => {
            const files = Array.from(event.dataTransfer?.files ?? []);
            const imageFile = files.find((item) => item.type.startsWith('image/'));
            if (imageFile) {
              event.preventDefault();
              event.stopPropagation();
              const at = view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;
              void insertImageAtSelection(view, imageFile, at);
              return true;
            }
            if (files.length > 0) {
              event.preventDefault();
              return true;
            }
            return false;
          },
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged || update.selectionSet) cancelFormatting('Formatting cancelled because the document or caret changed. Run Auto-format again when ready.');
          if (update.docChanged && !isExternalSyncRef.current) {
            const report = update.transactions.some((transaction) => transaction.annotation(formattingChange) || transaction.isUserEvent('undo') || transaction.isUserEvent('redo'))
              ? onFormatChangeRef.current ?? onChangeRef.current : onChangeRef.current;
            report(update.state.field(sourceState).source);
          }
          if (update.viewportChanged) {
            const viewportPosition = update.view.visibleRanges[0]?.from ?? update.view.viewport.from;
            onViewportLineChangeRef.current?.(update.state.doc.lineAt(viewportPosition).number);
          }
          if (update.selectionSet || update.docChanged) {
            const line = update.state.doc.lineAt(update.state.selection.main.head).number;
            onCursorLineChangeRef.current?.(line);
          }
          if (typewriterRef.current && !isExternalSyncRef.current && (update.docChanged || update.selectionSet)) {
            centerCaret(update.view);
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    // Manual scrolling moves the split preview too. CodeMirror only reports viewport changes when its
    // rendered window shifts, which is far coarser than the user's scrolling, so listen to the scroller.
    const onScroll = () => {
      const topBlock = view.lineBlockAtHeight(view.scrollDOM.scrollTop);
      onViewportLineChangeRef.current?.(view.state.doc.lineAt(topBlock.from).number);
    };
    view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });
    const onResize = () => {
      host.style.setProperty('--markdown-typewriter-padding', `${Math.max(0, (view.scrollDOM.clientHeight - view.defaultLineHeight) / 2)}px`);
      if (typewriterRef.current) centerCaret(view);
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize);
    observer?.observe(view.scrollDOM);
    window.addEventListener('resize', onResize);
    onResize();
    return () => {
      formatterRef.current?.terminate();
      formatterRef.current = null;
      observer?.disconnect();
      window.removeEventListener('resize', onResize);
      if (centerFrameRef.current !== null) cancelAnimationFrame(centerFrameRef.current);
      view.scrollDOM.removeEventListener('scroll', onScroll);
      view.destroy();
      viewRef.current = null;
    };
  }, [vimCompartment, wrapCompartment, attributesCompartment, suggestionsCompartment, themeCompartment, highlightCompartment]);

  useEffect(() => {
    const view = viewRef.current;
    if (view && typewriterMode) centerCaret(view);
  }, [typewriterMode]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: vimCompartment.reconfigure(vimMode ? vim() : []),
    });
    const cm = getCM(view);
    if (!cm) return;
    // Built-in :w/:write delegates to this instance hook, keeping other
    // catalog editors' save behavior independent of this workspace.
    const previousSave = cm.save;
    cm.save = () => onSaveRef.current?.();
    return () => { cm.save = previousSave; };
  }, [vimMode, vimCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapCompartment.reconfigure(lineWrapping ? EditorView.lineWrapping : []),
    });
  }, [lineWrapping, wrapCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: suggestionsCompartment.reconfigure(
        syntaxSuggestions
          ? autocompletion({ override: [markdownSyntaxCompletions], activateOnTyping: true })
          : [],
      ),
    });
  }, [syntaxSuggestions, suggestionsCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: [
        themeCompartment.reconfigure(markdownEditorTheme(darkMode)),
        highlightCompartment.reconfigure(syntaxHighlighting(darkMode ? DARK_HIGHLIGHT_STYLE : defaultHighlightStyle)),
      ],
    });
  }, [darkMode, themeCompartment, highlightCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: attributesCompartment.reconfigure([
        EditorView.contentAttributes.of({
          'aria-label': 'Markdown source',
          tabindex: '0',
          spellcheck: spellcheck ? 'true' : 'false',
          style: `font-size:${fontSize}px`,
        }),
        EditorView.editorAttributes.of({ style: `font-size:${fontSize}px` }),
      ]),
    });
  }, [fontSize, spellcheck, attributesCompartment]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === normalizedSource(value)) {
      if (view.state.field(sourceState).source !== value) view.dispatch({ effects: restoreSource.of(value), annotations: Transaction.addToHistory.of(false) });
      return;
    }
    isExternalSyncRef.current = true;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      effects: restoreSource.of(value),
      // This tool keeps two deliberately separate levels of history:
      // CodeMirror's own fine-grained text history (Ctrl+Z inside the editor,
      // which preserves the caret) and the workspace's document-level
      // snapshots behind the toolbar's Undo/Redo. Keeping an externally
      // applied document swap out of CodeMirror's history is what stops the
      // two from fighting - otherwise pressing Ctrl+Z straight after a
      // toolbar Undo would "undo the undo" and reinstate the newer text.
      annotations: [Transaction.addToHistory.of(false)],
    });
    isExternalSyncRef.current = false;
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !taskEditRequest) return;
    const { before: originalBefore, after: originalAfter } = taskEditRequest;
    const before = normalizedSource(originalBefore); const after = normalizedSource(originalAfter);
    if (view.state.field(sourceState).source !== originalBefore || view.state.doc.toString() !== before) {
      onStatusRef.current?.('Task toggle cancelled because the source changed. Try this checkbox again.');
      return;
    }
    let from = 0;
    while (from < before.length && from < after.length && before[from] === after[from]) from++;
    let to = before.length; let end = after.length;
    while (to > from && end > from && before[to - 1] === after[end - 1]) { to--; end--; }
    if (from === to && from === end) return;
    // Keep task edits in both editor history and the workspace's isolated
    // document-change callback, as formatting edits already are.
    view.dispatch({
      changes: { from, to, insert: after.slice(from, end) },
      effects: restoreSource.of(originalAfter),
      annotations: [isolateHistory.of('full'), formattingChange.of(true)],
      userEvent: 'input.task',
    });
    onStatusRef.current?.('Toggled the task on that line. The change stays in this document.');
  }, [taskEditRequest]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !revealRequest) return;
    const lineCount = view.state.doc.lines;
    const target = Math.min(Math.max(revealRequest.line, 1), lineCount);
    const info = view.state.doc.line(target);
    const focus = revealRequest.focus !== false;
    // Without focus the caret stays where it is; re-sending the selection would report a caret move.
    view.dispatch(focus
      ? { selection: { anchor: info.from }, effects: EditorView.scrollIntoView(info.from, { y: 'start' }) }
      : { effects: EditorView.scrollIntoView(info.from, { y: 'start' }) });
    if (focus) view.focus();
  }, [revealRequest]);

  useEffect(() => {
    const view = viewRef.current;
    if (view) setAstHighlight(view, astHighlight);
  }, [astHighlight, value]);

  useEffect(() => {
    const view = viewRef.current;
    if (view && astRangeRequest) selectAstRange(view, astRangeRequest.range);
  }, [astRangeRequest]);

  const insertPattern = (before: string, after: string, fallback: string, useSelection = true) => {
    const view = viewRef.current;
    if (view) insertPatternAtSelection(view, before, after, fallback, useSelection);
  };

  const toggleLinePrefix = (prefix: string) => {
    const view = viewRef.current;
    if (view) toggleLinePrefixInView(view, prefix);
  };

  const toggleOrderedList = () => {
    const view = viewRef.current;
    if (view) toggleOrderedListInView(view);
  };

  // Cycles the caret's current line through H1 - H6, then back to a plain
  // paragraph, rather than a controlled level picker: this stays stateless
  // like every other formatting action here, with no extra render-tracked
  // cursor-position state to keep in sync.
  const cycleHeading = () => {
    const view = viewRef.current;
    if (!view) return;
    const line = view.state.doc.lineAt(view.state.selection.main.head);
    const match = /^(#{1,6})\s+/.exec(line.text);
    const level = match ? match[1].length : 0;
    const nextPrefix = level >= 6 ? '' : `${'#'.repeat(level + 1)} `;
    const stripLength = match ? match[0].length : 0;
    view.dispatch({
      changes: { from: line.from, to: line.from + stripLength, insert: nextPrefix },
      userEvent: 'input',
    });
    view.focus();
  };

  const insertHorizontalRule = () => {
    const view = viewRef.current;
    if (!view) return;
    const { to } = view.state.selection.main;
    const line = view.state.doc.lineAt(to);
    const insert = `${line.text.length > 0 ? '\n\n' : ''}---\n\n`;
    const at = line.to;
    view.dispatch({
      changes: { from: at, to: at, insert },
      selection: { anchor: at + insert.length },
      userEvent: 'input',
    });
    view.focus();
  };

  // Reuses the exact same GitHub-style slugs the rendered preview assigns to
  // each heading (heading-id-plugin.ts) with the same user-content- clobber
  // prefix rehype-sanitize applies, so every generated link actually lands
  // on its heading instead of going nowhere.
  const insertTableOfContents = () => {
    const view = viewRef.current;
    if (!view) return;
    const outline = buildOutline(view.state.doc.toString());
    if (outline.length === 0) {
      onStatusRef.current?.('Add at least one heading before inserting a table of contents.');
      return;
    }
    const minDepth = Math.min(...outline.map((entry) => entry.depth));
    const toc = outline
      .map((entry) => `${'  '.repeat(entry.depth - minDepth)}- [${entry.text || '(untitled heading)'}](#${HEADING_ID_PREFIX}${entry.id})`)
      .join('\n');
    const { from, to } = view.state.selection.main;
    const line = view.state.doc.lineAt(from);
    const insert = `${line.text.length > 0 ? '\n\n' : ''}${toc}\n\n`;
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: from + insert.length },
      userEvent: 'input',
    });
    view.focus();
  };

  const autoFormat = () => {
    const view = viewRef.current;
    if (!view || formatterRef.current) return;
    try {
      const worker = new Worker(new URL('./format-worker.ts', import.meta.url), { type: 'module' });
      formatterRef.current = worker;
      setFormatting(true);
      const snapshot = view.state.doc;
      worker.onmessage = (event: MessageEvent<{ result?: { formatted: string; cursorOffset: number }; error?: string }>) => {
        if (formatterRef.current !== worker || viewRef.current !== view) return;
        cancelFormatting();
        if (view.state.doc !== snapshot) {
          onStatusRef.current?.('Formatting cancelled because the document changed.');
          return;
        }
        const result = event.data.result;
        if (!result) {
          onStatusRef.current?.(event.data.error ?? 'Formatting failed. Your source is unchanged.');
          return;
        }
        if (result.formatted !== snapshot.toString()) {
          view.dispatch({
            changes: { from: 0, to: snapshot.length, insert: result.formatted },
            selection: { anchor: Math.max(0, Math.min(result.formatted.length, result.cursorOffset)) },
            annotations: [isolateHistory.of('full'), formattingChange.of(true)],
            userEvent: 'input.format',
          });
        }
        view.focus();
        onStatusRef.current?.('Markdown formatted. Undo restores the previous source.');
      };
      worker.onerror = () => cancelFormatting('Formatting failed. Your source is unchanged.');
      worker.postMessage({ source: snapshot.toString(), cursorOffset: view.state.selection.main.head });
    } catch {
      cancelFormatting();
      onStatusRef.current?.('Formatting could not start in this browser. Your source is unchanged.');
    }
  };

  return <>
    <div className="markdown-workbench-format-actions" role="group" aria-label="Insert Markdown">
      <MarkdownAction id="heading" label="Heading" help="Cycle the current line through heading levels 1–6, then back to body text." onClick={cycleHeading} />
      <MarkdownAction id="toc" label="Table of contents" help="Insert links to the headings in the current document at the cursor." onClick={insertTableOfContents} />
      <MarkdownAction id="bold" label="Bold" help="Wrap the selection in bold Markdown. Shortcut: Ctrl/Cmd+B." onClick={() => insertPattern('**', '**', 'bold text')} ariaKeyShortcuts="Control+B Meta+B" />
      <MarkdownAction id="italic" label="Italic" help="Wrap the selection in italic Markdown. Shortcut: Ctrl/Cmd+I." onClick={() => insertPattern('*', '*', 'italic text')} ariaKeyShortcuts="Control+I Meta+I" />
      <MarkdownAction id="strike" label="Strikethrough" help="Wrap the selection in GitHub-style strikethrough Markdown." onClick={() => insertPattern('~~', '~~', 'deleted text')} />
      <MarkdownAction id="inline-code" label="Inline code" help="Wrap the selection as inline code. Shortcut: Ctrl/Cmd+E." onClick={() => insertPattern('`', '`', 'code')} ariaKeyShortcuts="Control+E Meta+E" />
      <MarkdownAction id="code-block" label="Code block" help="Insert a fenced code block at the current selection." onClick={() => insertPattern('```\n', '\n```', 'code block', false)} />
      <MarkdownAction id="blockquote" label="Blockquote" help="Toggle a quote prefix on each selected line. Shortcut: Ctrl/Cmd+Shift+." onClick={() => toggleLinePrefix('> ')} ariaKeyShortcuts="Control+Shift+. Meta+Shift+." />
      <MarkdownAction id="bullets" label="Bullet list" help="Toggle bullet-list markers on the selected lines. Shortcut: Ctrl/Cmd+Shift+8." onClick={() => toggleLinePrefix('- ')} ariaKeyShortcuts="Control+Shift+8 Meta+Shift+8" />
      <MarkdownAction id="numbers" label="Numbered list" help="Toggle numbered-list markers on the selected lines. Shortcut: Ctrl/Cmd+Shift+7." onClick={toggleOrderedList} ariaKeyShortcuts="Control+Shift+7 Meta+Shift+7" />
      <MarkdownAction id="rule" label="Horizontal rule" help="Insert a thematic break on its own line." onClick={insertHorizontalRule} />
      <MarkdownAction id="link" label="Link" help="Wrap the selection as a link. Shortcut: Ctrl/Cmd+K." onClick={() => insertPattern('[', '](https://example.com)', 'link text')} ariaKeyShortcuts="Control+K Meta+K" />
      <MarkdownAction id="image" label="Image" help="Insert image Markdown using a URL. You can also paste or drop a local image to embed it." onClick={() => insertPattern('![', '](https://example.com/image.png)', 'alt text')} />
      <MarkdownAction id="task" label="Task" help="Insert an unchecked GitHub-style task-list item." onClick={() => insertPattern('\n\n- [ ] ', '\n', 'task')} />
      <MarkdownAction id="table" label="Table" help="Insert a two-column Markdown table starter." onClick={() => insertPattern('\n\n', '\n', '| Column | Value |\n| --- | --- |\n| Item | Text |', false)} />
      <MarkdownTableBuilder
        onInsert={(table) => insertPattern('\n\n', '\n', table, false)}
        readCursorTable={() => {
          const view = viewRef.current;
          if (!view) return null;
          const source = view.state.doc.toString();
          const parsed = parseMarkdown(source);
          const lineOffset = parsed.frontmatter.format === null ? 0 : parsed.frontmatter.bodyStartLine - 1;
          return findTableAtLine(parsed.tree as Root, source, view.state.doc.lineAt(view.state.selection.main.head).number, lineOffset);
        }}
      />
      <button type="button" onClick={autoFormat} disabled={formatting} title="Align tables and normalize Markdown spacing locally. Code and frontmatter stay intact; Undo restores the source.">{formatting ? 'Formatting…' : 'Auto-format'}</button>
      {formatting ? <button type="button" onClick={() => cancelFormatting('Formatting cancelled. Your source is unchanged.')}>Cancel formatting</button> : null}
      <MarkdownAction id="find" label="Find / replace" help="Open the editor’s find and replace controls for this document." onClick={() => { const view = viewRef.current; if (view) openSearchPanel(view); }} />
    </div>
    <div className="markdown-workbench-editor" data-typewriter-mode={typewriterMode} ref={hostRef} />
  </>;
}

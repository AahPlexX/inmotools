import { useEffect, useRef } from 'react';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownKeymap } from '@codemirror/lang-markdown';
import { searchKeymap } from '@codemirror/search';
import { Compartment, EditorState, Transaction } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { vim } from '@replit/codemirror-vim';

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

export interface MarkdownEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onCursorLineChange?: (line: number) => void;
  readonly lineWrapping: boolean;
  readonly fontSize: number;
  readonly vimMode: boolean;
  readonly spellcheck: boolean;
  // Incremented by the parent to request that a given line be scrolled into
  // view and focused (used by the document outline). A counter rather than a
  // bare line number so selecting the same heading twice still re-reveals it.
  readonly revealRequest?: { readonly line: number; readonly nonce: number };
}

export default function MarkdownEditor({
  value,
  onChange,
  onCursorLineChange,
  lineWrapping,
  fontSize,
  vimMode,
  spellcheck,
  revealRequest,
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onCursorLineChangeRef = useRef(onCursorLineChange);
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

  // Latest-value refs let the mount effect below seed the initial state
  // without taking a dependency on props that must not trigger a rebuild.
  const valueRef = useRef(value);
  const fontSizeRef = useRef(fontSize);
  const spellcheckRef = useRef(spellcheck);
  const lineWrappingRef = useRef(lineWrapping);
  const vimModeRef = useRef(vimMode);
  valueRef.current = value;
  fontSizeRef.current = fontSize;
  spellcheckRef.current = spellcheck;
  lineWrappingRef.current = lineWrapping;
  vimModeRef.current = vimMode;

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onCursorLineChangeRef.current = onCursorLineChange; }, [onCursorLineChange]);

  // Built once per mount. `value`, `fontSize`, `spellcheck`, `lineWrapping`
  // and `vimMode` are intentionally absent from the dependency list: the
  // initial document is seeded here and every later change is applied through
  // the effects below instead of by rebuilding the view.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const buildAttributes = (size: number, spell: boolean) => [
      EditorView.contentAttributes.of({
        'aria-label': 'Markdown source',
        spellcheck: spell ? 'true' : 'false',
        style: `font-size:${size}px`,
      }),
      EditorView.editorAttributes.of({ style: `font-size:${size}px` }),
    ];

    const state = EditorState.create({
      doc: valueRef.current,
      extensions: [
        // Kept first so vim's keymap keeps its precedence over the default
        // keymap when the compartment is reconfigured.
        vimCompartment.of(vimModeRef.current ? vim() : []),
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        closeBrackets(),
        markdown(),
        wrapCompartment.of(lineWrappingRef.current ? EditorView.lineWrapping : []),
        keymap.of([...closeBracketsKeymap, ...markdownKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        attributesCompartment.of(buildAttributes(fontSizeRef.current, spellcheckRef.current)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isExternalSyncRef.current) onChangeRef.current(update.state.doc.toString());
          if (update.selectionSet || update.docChanged) {
            const line = update.state.doc.lineAt(update.state.selection.main.head).number;
            onCursorLineChangeRef.current?.(line);
          }
        }),
        EditorView.theme({
          '&': { minHeight: '360px', height: '100%', backgroundColor: 'var(--surface)', color: 'var(--ink)' },
          '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' },
          '.cm-content': { minHeight: '340px', padding: '10px 0' },
          '.cm-gutters': { backgroundColor: 'var(--surface-strong)', color: 'var(--muted)', borderRight: '1px solid var(--line)' },
          '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--signal-soft)' },
          '&.cm-focused': { outline: '2px solid var(--signal)', outlineOffset: '-2px' },
        }),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    return () => { view.destroy(); viewRef.current = null; };
  }, [vimCompartment, wrapCompartment, attributesCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: vimCompartment.reconfigure(vimMode ? vim() : []),
    });
  }, [vimMode, vimCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: wrapCompartment.reconfigure(lineWrapping ? EditorView.lineWrapping : []),
    });
  }, [lineWrapping, wrapCompartment]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: attributesCompartment.reconfigure([
        EditorView.contentAttributes.of({
          'aria-label': 'Markdown source',
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
    if (current === value) return;
    isExternalSyncRef.current = true;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
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
    if (!view || !revealRequest) return;
    const lineCount = view.state.doc.lines;
    const target = Math.min(Math.max(revealRequest.line, 1), lineCount);
    const info = view.state.doc.line(target);
    view.dispatch({
      selection: { anchor: info.from },
      effects: EditorView.scrollIntoView(info.from, { y: 'start' }),
    });
    view.focus();
  }, [revealRequest]);

  return <div className="markdown-workbench-editor" ref={hostRef} />;
}

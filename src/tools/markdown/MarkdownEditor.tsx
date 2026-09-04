import { useEffect, useRef } from 'react';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { markdown, markdownKeymap } from '@codemirror/lang-markdown';
import { searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { vim } from '@replit/codemirror-vim';

// CodeMirror 6 markdown source editor, mirroring the exact wiring pattern
// already used by this catalog's other CodeMirror-based tools (see
// LatticeEditor.tsx, ShaderEditor.tsx): a host div ref, an EditorView held
// in a ref (not React state, since CodeMirror owns its own DOM), and an
// updateListener that reports changes back out via a stable callback ref so
// the effect that creates the view does not need to depend on the latest
// onChange closure.

export interface MarkdownEditorProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly onCursorLineChange?: (line: number) => void;
  readonly lineWrapping: boolean;
  readonly fontSize: number;
  readonly vimMode: boolean;
  readonly spellcheck: boolean;
}

export default function MarkdownEditor({ value, onChange, onCursorLineChange, lineWrapping, fontSize, vimMode, spellcheck }: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onCursorLineChangeRef = useRef(onCursorLineChange);
  // Set around a programmatic dispatch (the value-sync effect below, used
  // when an external change - undo/redo, restoring a draft - replaces the
  // document from outside the editor). Without this guard, that dispatch
  // fires the same updateListener a real keystroke does, which calls
  // onChange and re-commits the restored text as a brand-new edit,
  // wiping out the workspace's own redo stack on every undo.
  const isExternalSyncRef = useRef(false);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onCursorLineChangeRef.current = onCursorLineChange; }, [onCursorLineChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const state = EditorState.create({
      doc: value,
      extensions: [
        ...(vimMode ? [vim()] : []),
        lineNumbers(),
        history(),
        drawSelection(),
        highlightActiveLine(),
        closeBrackets(),
        markdown(),
        ...(lineWrapping ? [EditorView.lineWrapping] : []),
        keymap.of([...closeBracketsKeymap, ...markdownKeymap, ...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        EditorView.contentAttributes.of({
          'aria-label': 'Markdown source',
          spellcheck: spellcheck ? 'true' : 'false',
          style: `font-size:${fontSize}px`,
        }),
        EditorView.editorAttributes.of({ style: `font-size:${fontSize}px` }),
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
    // Recreated when vim mode, wrapping, font size, or spellcheck toggle -
    // these are configuration changes CodeMirror extensions don't cleanly
    // hot-swap for this tool's scope, matching this catalog's existing
    // editors (LatticeEditor recreates on format change for the same reason).
  }, [vimMode, lineWrapping, fontSize, spellcheck]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    isExternalSyncRef.current = true;
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    isExternalSyncRef.current = false;
  }, [value]);

  return <div className="markdown-workbench-editor" ref={hostRef} />;
}

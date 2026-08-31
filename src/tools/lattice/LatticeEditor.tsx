import { useEffect, useRef } from 'react';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { json, jsonParseLinter } from '@codemirror/lang-json';
import { lintGutter, linter } from '@codemirror/lint';
import { searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import type { StructuredFormat } from './format-engine';

export default function LatticeEditor({ value, format, onChange }: { value: string; format: StructuredFormat; onChange: (value: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const languageExtensions = format === 'json' ? [json(), linter(jsonParseLinter()), lintGutter()] : [];
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(), history(), drawSelection(), highlightActiveLine(),
        ...languageExtensions,
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        EditorView.contentAttributes.of({ 'aria-label': 'JSON Lattice source', spellcheck: 'false' }),
        EditorView.updateListener.of((update) => { if (update.docChanged) onChangeRef.current(update.state.doc.toString()); }),
        EditorView.theme({
          '&': { minHeight: '360px', height: '100%', backgroundColor: 'var(--surface)', color: 'var(--ink)', fontSize: '13px' },
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
  }, [format]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  return <div className="lattice-editor" ref={hostRef} />;
}

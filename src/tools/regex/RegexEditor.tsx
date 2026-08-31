import { useEffect, useRef } from 'react';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';

interface Props { readonly label: string; readonly value: string; readonly onChange: (value: string) => void; readonly compact?: boolean; }
const RegexEditor = ({ label, value, onChange, compact = false }: Props) => {
  const hostRef = useRef<HTMLDivElement>(null); const viewRef = useRef<EditorView | null>(null); const onChangeRef = useRef(onChange);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => {
    const host = hostRef.current; if (!host) return undefined;
    const state = EditorState.create({ doc: value, extensions: [compact ? [] : lineNumbers(), history(), drawSelection(), highlightActiveLine(), keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]), EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false' }), EditorView.updateListener.of((update) => { if (update.docChanged) onChangeRef.current(update.state.doc.toString()); }), EditorView.theme({ '&': { minHeight: compact ? '52px' : '220px', backgroundColor: 'transparent', color: 'var(--matrix-text)', fontSize: 'var(--matrix-code-size)' }, '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflow: 'auto' }, '.cm-content': { padding: compact ? '10px 12px' : '12px 8px' }, '.cm-gutters': { backgroundColor: 'var(--matrix-panel-strong)', color: 'var(--matrix-muted)', borderRight: '1px solid var(--matrix-line)' }, '&.cm-focused': { outline: '2px solid var(--matrix-accent)', outlineOffset: '-2px' } })] });
    const view = new EditorView({ state, parent: host }); viewRef.current = view; return () => { view.destroy(); viewRef.current = null; };
  }, [compact, label]);
  useEffect(() => { const view = viewRef.current; if (!view) return; const current = view.state.doc.toString(); if (current !== value) view.dispatch({ changes: { from: 0, to: current.length, insert: value } }); }, [value]);
  return <div className={`regex-editor${compact ? ' compact' : ''}`} ref={hostRef} />;
};
export default RegexEditor;

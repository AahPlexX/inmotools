import { useEffect, useRef } from 'react';
import { autocompletion, type CompletionSource } from '@codemirror/autocomplete';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { searchKeymap } from '@codemirror/search';
import { EditorState } from '@codemirror/state';
import { drawSelection, EditorView, highlightActiveLine, keymap, lineNumbers } from '@codemirror/view';
import { searchRegexReference } from './regex-reference';
import type { RegexFlavor } from './regex-types';

interface SelectionRequest { readonly from: number; readonly to: number; readonly revision: number; }
interface Props { readonly label: string; readonly value: string; readonly onChange: (value: string) => void; readonly compact?: boolean; readonly selectionRequest?: SelectionRequest; readonly flavor?: RegexFlavor; }

const buildRegexCompletionSource = (getFlavor: () => RegexFlavor | undefined): CompletionSource => (context) => {
  const flavor = getFlavor();
  if (!flavor) return null;
  const before = context.matchBefore(/[^\s]*/);
  if (!before || (!context.explicit && before.from === before.to)) return null;
  const rows = searchRegexReference(before.text, flavor).slice(0, 60);
  if (!rows.length) return null;
  return {
    from: before.from,
    options: rows.map((item) => ({ label: item.token, detail: item.label, info: item.description, type: 'keyword', apply: item.token })),
    validFor: /[^\s]*/,
  };
};

const RegexEditor = ({ label, value, onChange, compact = false, selectionRequest, flavor }: Props) => {
  const hostRef = useRef<HTMLDivElement>(null); const viewRef = useRef<EditorView | null>(null); const onChangeRef = useRef(onChange); const flavorRef = useRef(flavor);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { flavorRef.current = flavor; }, [flavor]);
  useEffect(() => {
    const host = hostRef.current; if (!host) return undefined;
    const completionExtension = compact && flavorRef.current ? autocompletion({ override: [buildRegexCompletionSource(() => flavorRef.current)] }) : [];
    const state = EditorState.create({ doc: value, extensions: [compact ? [] : lineNumbers(), history(), drawSelection(), highlightActiveLine(), completionExtension, keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]), EditorView.contentAttributes.of({ 'aria-label': label, spellcheck: 'false' }), EditorView.updateListener.of((update) => { if (update.docChanged) onChangeRef.current(update.state.doc.toString()); }), EditorView.theme({ '&': { minHeight: compact ? '52px' : '220px', backgroundColor: 'transparent', color: 'var(--matrix-text)', fontSize: 'var(--matrix-code-size)' }, '.cm-scroller': { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', overflow: 'auto' }, '.cm-content': { padding: compact ? '10px 12px' : '12px 8px' }, '.cm-gutters': { backgroundColor: 'var(--matrix-panel-strong)', color: 'var(--matrix-muted)', borderRight: '1px solid var(--matrix-line)' }, '&.cm-focused': { outline: '2px solid var(--matrix-accent)', outlineOffset: '-2px' } })] });
    const view = new EditorView({ state, parent: host }); view.scrollDOM.tabIndex = 0; view.scrollDOM.setAttribute('aria-label', compact ? 'Expression editor scroll area' : 'Subject editor scroll area'); viewRef.current = view; return () => { view.destroy(); viewRef.current = null; };
  }, [compact, label]);
  useEffect(() => { const view = viewRef.current; if (!view) return; const current = view.state.doc.toString(); if (current !== value) view.dispatch({ changes: { from: 0, to: current.length, insert: value } }); }, [value]);
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !selectionRequest) return;
    const from = Math.max(0, Math.min(selectionRequest.from, view.state.doc.length));
    const to = Math.max(from, Math.min(selectionRequest.to, view.state.doc.length));
    view.dispatch({ selection: { anchor: from, head: to }, scrollIntoView: true });
    view.focus();
  }, [selectionRequest]);
  return <div className={`regex-editor${compact ? ' compact' : ''}`} ref={hostRef} />;
};
export default RegexEditor;

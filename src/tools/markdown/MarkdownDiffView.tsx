import { useEffect, useRef } from 'react';
import { unifiedMergeView } from '@codemirror/merge';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { DIFF_CONFIG } from './diff-engine';

export interface MarkdownDiffViewProps {
  readonly baseline: string;
  readonly current: string;
}

const diffTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--surface)', color: 'var(--ink)', maxHeight: '320px', fontSize: '13px' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'var(--font-mono, ui-monospace, monospace)' },
  '.cm-gutters': { backgroundColor: 'var(--surface)', color: 'var(--muted)', border: 'none' },
});

// Read-only unified diff: the baseline is the "original", the current text is the document, so
// inserted or changed lines in the current text are highlighted and removed lines appear as struck blocks.
export default function MarkdownDiffView({ baseline, current }: MarkdownDiffViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: current,
        extensions: [
          EditorState.readOnly.of(true),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ 'aria-label': 'Differences between the baseline and the current text', 'aria-readonly': 'true' }),
          diffTheme,
          unifiedMergeView({
            original: baseline,
            mergeControls: false,
            gutter: true,
            highlightChanges: true,
            syntaxHighlightDeletions: false,
            diffConfig: DIFF_CONFIG,
            collapseUnchanged: { margin: 3, minSize: 8 },
          }),
        ],
      }),
    });
    return () => view.destroy();
  }, [baseline, current]);

  return <div ref={hostRef} className="markdown-workbench-diff-view" data-testid="markdown-diff-view" />;
}

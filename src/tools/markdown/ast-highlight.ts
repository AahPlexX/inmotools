import { StateEffect, StateField, type Text } from '@codemirror/state';
import { Decoration, EditorView, type DecorationSet } from '@codemirror/view';
import type { AstRange } from './ast-inspector-engine';

// Marks the source range of the node chosen in the syntax-tree inspector. It is a decoration
// rather than the selection, so it stays visible while the tree (not the editor) has focus.

interface OffsetRange {
  readonly from: number;
  readonly to: number;
}

const setHighlight = StateEffect.define<OffsetRange | null>();

const highlightMark = Decoration.mark({ class: 'cm-ast-highlight' });

export const astHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (decorations, transaction) => {
    let next = decorations.map(transaction.changes);
    for (const effect of transaction.effects) {
      if (!effect.is(setHighlight)) continue;
      next = effect.value && effect.value.to > effect.value.from
        ? Decoration.set([highlightMark.range(effect.value.from, effect.value.to)])
        : Decoration.none;
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export const astHighlightTheme = EditorView.baseTheme({
  '.cm-ast-highlight': {
    backgroundColor: 'rgba(255, 196, 0, 0.35)',
    outline: '1px solid rgba(214, 150, 0, 0.8)',
    borderRadius: '2px',
  },
});

const toOffset = (doc: Text, line: number, column: number): number => {
  const info = doc.line(Math.min(Math.max(line, 1), doc.lines));
  return Math.min(info.from + Math.max(column - 1, 0), info.to);
};

export const astRangeToOffsets = (doc: Text, range: AstRange): OffsetRange => {
  const from = toOffset(doc, range.startLine, range.startColumn);
  const to = toOffset(doc, range.endLine, range.endColumn);
  return { from, to: Math.max(from, to) };
};

export const setAstHighlight = (view: EditorView, range: AstRange | null): void => {
  view.dispatch({ effects: setHighlight.of(range ? astRangeToOffsets(view.state.doc, range) : null) });
};

// Selects the range and scrolls it into view without taking focus from the tree.
export const selectAstRange = (view: EditorView, range: AstRange): void => {
  const { from, to } = astRangeToOffsets(view.state.doc, range);
  view.dispatch({
    selection: { anchor: from, head: to },
    effects: [setHighlight.of({ from, to }), EditorView.scrollIntoView(from, { y: 'nearest', yMargin: 24 })],
  });
};

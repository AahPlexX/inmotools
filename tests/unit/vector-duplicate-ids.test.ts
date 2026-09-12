import { describe, expect, test } from 'vitest';
import { addElement, baseElement, createVectorDocument, duplicateSelection, groupSelection } from '../../src/tools/svg/vector-engine';
import type { VectorElement } from '../../src/tools/svg/vector-types';

function rect(id: string, x: number): VectorElement {
  return {
    ...baseElement('rect', id, x, 40, 80, 60),
    id,
    type: 'rect',
    cornerRadius: 8,
  };
}

function collectIds(element: VectorElement): string[] {
  if (element.type !== 'group') return [element.id];
  return [
    element.id,
    ...element.children.flatMap(collectIds),
    ...(element.composition ? collectIds(element.composition.shape) : []),
  ];
}

describe('Vector Studio duplicate identity', () => {
  test('refreshes every descendant id when duplicating nested groups', () => {
    let document = createVectorDocument();
    document = addElement(document, rect('a', 40));
    document = addElement(document, rect('b', 160));
    document = addElement(document, rect('c', 280));

    const inner = groupSelection(document, ['a', 'b']);
    const outer = groupSelection(inner.document, [inner.selection[0], 'c']);
    const duplicated = duplicateSelection(outer.document, outer.selection, 20, 20);
    const ids = duplicated.document.elements.flatMap(collectIds);

    expect(duplicated.document.elements).toHaveLength(2);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

import { describe, expect, test } from 'vitest';
import { addElement, baseElement, createVectorDocument, groupSelection, topLevelSelectionId } from '../../src/tools/svg/vector-engine';
import type { VectorElement } from '../../src/tools/svg/vector-types';

function rect(id: string, x: number): VectorElement {
  return {
    ...baseElement('rect', id, x, 40, 80, 60),
    id,
    type: 'rect',
    cornerRadius: 8,
  };
}

describe('Vector Studio selection ownership', () => {
  test('maps rendered descendants back to their owning top-level group', () => {
    let document = createVectorDocument();
    document = addElement(document, rect('child-a', 40));
    document = addElement(document, rect('child-b', 160));
    const grouped = groupSelection(document, ['child-a', 'child-b']);
    const groupId = grouped.selection[0];

    expect(topLevelSelectionId(grouped.document, groupId)).toBe(groupId);
    expect(topLevelSelectionId(grouped.document, 'child-a')).toBe(groupId);
    expect(topLevelSelectionId(grouped.document, 'child-b')).toBe(groupId);
    expect(topLevelSelectionId(grouped.document, 'missing')).toBeNull();
  });
});

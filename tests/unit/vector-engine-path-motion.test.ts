import { describe, expect, test } from 'vitest';
import {
  addElement,
  createVectorDocument,
  duplicateSelection,
  moveSelection,
} from '../../src/tools/svg/vector-engine';
import type { VectorElement } from '../../src/tools/svg/vector-types';

function pathElement(id: string, d: string): VectorElement {
  return {
    id,
    type: 'path',
    name: id,
    x: 10,
    y: 20,
    width: 70,
    height: 70,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fill: { kind: 'solid', color: 'none' },
    stroke: { color: '#111827', width: 2, linecap: 'round', linejoin: 'round', dash: '' },
    blendMode: 'normal',
    title: '',
    description: '',
    d,
    closed: false,
  };
}

describe('vector path motion', () => {
  test('moves absolute path coordinates while preserving relative segments', () => {
    const source = 'M 10 20 L 30 40 l 5 5 H 60 v 10 A 5 6 15 0 1 80 90 z';
    const document = addElement(createVectorDocument(), pathElement('path-a', source));

    const moved = moveSelection(document, ['path-a'], 7, -3);
    const element = moved.elements[0];
    expect(element.type).toBe('path');
    if (element.type !== 'path') throw new Error('Expected path');

    expect(element).toMatchObject({ x: 17, y: 17 });
    expect(element.d).toBe('M 17 17 L 37 37 l 5 5 H 67 v 10 A 5 6 15 0 1 87 87 z');
  });

  test('translates only the first relative moveto and keeps later relative commands unchanged', () => {
    const document = addElement(createVectorDocument(), pathElement('path-a', 'm 10 20 l 5 5 L 40 50'));

    const moved = moveSelection(document, ['path-a'], 7, -3);
    const element = moved.elements[0];
    expect(element.type).toBe('path');
    if (element.type !== 'path') throw new Error('Expected path');

    expect(element.d).toBe('m 17 17 l 5 5 L 47 47');
  });

  test('duplicates path geometry at the requested offset without changing the source path', () => {
    const source = 'M 10 20 L 30 40';
    const document = addElement(createVectorDocument(), pathElement('path-a', source));

    const duplicated = duplicateSelection(document, ['path-a'], 8, 12);
    const original = duplicated.document.elements[0];
    const copy = duplicated.document.elements[1];
    expect(original.type).toBe('path');
    expect(copy.type).toBe('path');
    if (original.type !== 'path' || copy.type !== 'path') throw new Error('Expected paths');

    expect(original.d).toBe(source);
    expect(copy.d).toBe('M 18 32 L 38 52');
    expect(copy).toMatchObject({ x: 18, y: 32 });
  });
});

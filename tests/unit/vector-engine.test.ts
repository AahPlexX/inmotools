import { describe, expect, test } from 'vitest';
import {
  addElement,
  alignSelection,
  createHistory,
  createPolygonPath,
  createStarPath,
  createVectorDocument,
  distributeSelection,
  duplicateSelection,
  groupSelection,
  mirrorSelection,
  moveSelection,
  pushHistory,
  radialRepeatSelection,
  redoHistory,
  reorderSelection,
  simplifyPoints,
  snapPoint,
  undoHistory,
  ungroupSelection,
  updateElement,
} from '../../src/tools/svg/vector-engine';
import type { VectorElement } from '../../src/tools/svg/vector-types';

function rect(id: string, x: number, y: number, width = 40, height = 20): VectorElement {
  return {
    id,
    type: 'rect',
    name: id,
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    visible: true,
    locked: false,
    fill: { kind: 'solid', color: '#2563eb' },
    stroke: { color: '#0f172a', width: 0, linecap: 'round', linejoin: 'round', dash: '' },
    blendMode: 'normal',
    cornerRadius: 0,
    title: '',
    description: '',
  };
}

describe('vector document engine', () => {
  test('creates an SVG-native starter document with editable metadata and artboard', () => {
    const document = createVectorDocument();
    expect(document.artboard).toMatchObject({ width: 1200, height: 800 });
    expect(document.metadata.tags).toEqual([]);
    expect(document.elements).toEqual([]);
    expect(document.swatches.length).toBeGreaterThanOrEqual(6);
  });

  test('adds, updates, moves and duplicates selected elements without mutating the source', () => {
    const base = addElement(createVectorDocument(), rect('a', 10, 20));
    const updated = updateElement(base, 'a', { opacity: 0.5 });
    const moved = moveSelection(updated, ['a'], 15, -5);
    const duplicated = duplicateSelection(moved, ['a'], 8, 8);

    expect(base.elements[0]).toMatchObject({ x: 10, y: 20, opacity: 1 });
    expect(moved.elements[0]).toMatchObject({ x: 25, y: 15, opacity: 0.5 });
    expect(duplicated.document.elements).toHaveLength(2);
    expect(duplicated.selection).toHaveLength(1);
    expect(duplicated.document.elements[1]).toMatchObject({ x: 33, y: 23 });
  });

  test('groups and ungroups elements while preserving child geometry', () => {
    const document = addElement(addElement(createVectorDocument(), rect('a', 10, 20)), rect('b', 80, 30));
    const grouped = groupSelection(document, ['a', 'b']);
    expect(grouped.selection).toHaveLength(1);
    const group = grouped.document.elements.find((element) => element.id === grouped.selection[0]);
    expect(group?.type).toBe('group');
    if (!group || group.type !== 'group') throw new Error('Expected group');
    expect(group.children).toHaveLength(2);

    const ungrouped = ungroupSelection(grouped.document, grouped.selection[0]);
    expect(ungrouped.document.elements.map((element) => element.id)).toEqual(['a', 'b']);
    expect(ungrouped.selection).toEqual(['a', 'b']);
  });

  test('aligns and distributes selections using visual bounds', () => {
    let document = createVectorDocument();
    document = addElement(document, rect('a', 10, 10, 20, 20));
    document = addElement(document, rect('b', 70, 30, 20, 20));
    document = addElement(document, rect('c', 150, 50, 20, 20));

    const aligned = alignSelection(document, ['a', 'b', 'c'], 'top');
    expect(aligned.elements.map((element) => element.y)).toEqual([10, 10, 10]);

    const distributed = distributeSelection(aligned, ['a', 'b', 'c'], 'horizontal');
    expect(distributed.elements.map((element) => Math.round(element.x))).toEqual([10, 80, 150]);
  });

  test('reorders selection without losing unrelated elements', () => {
    let document = createVectorDocument();
    document = addElement(document, rect('a', 0, 0));
    document = addElement(document, rect('b', 0, 0));
    document = addElement(document, rect('c', 0, 0));
    expect(reorderSelection(document, ['a'], 'front').elements.map((element) => element.id)).toEqual(['b', 'c', 'a']);
    expect(reorderSelection(document, ['c'], 'back').elements.map((element) => element.id)).toEqual(['c', 'a', 'b']);
  });

  test('mirrors geometry independently on each axis instead of faking a rotation', () => {
    const document = addElement(createVectorDocument(), rect('a', 10, 20, 80, 40));
    const horizontal = mirrorSelection(document, ['a'], 'horizontal');
    expect(horizontal.elements[0]).toMatchObject({ x: 10, y: 20, rotation: 0, flipX: true, flipY: false });

    const both = mirrorSelection(horizontal, ['a'], 'vertical');
    expect(both.elements[0]).toMatchObject({ x: 10, y: 20, rotation: 0, flipX: true, flipY: true });

    const restored = mirrorSelection(both, ['a'], 'horizontal');
    expect(restored.elements[0]).toMatchObject({ flipX: false, flipY: true });
  });

  test('snaps to grid and nearby object guides with deterministic thresholds', () => {
    const snapped = snapPoint({ x: 48, y: 53 }, { grid: 10, threshold: 4, guidesX: [25, 50], guidesY: [55] });
    expect(snapped).toEqual({ x: 50, y: 55, snappedX: true, snappedY: true });
  });

  test('creates closed polygon and star path data', () => {
    expect(createPolygonPath(100, 100, 50, 6)).toMatch(/^M .* Z$/);
    const star = createStarPath(100, 100, 50, 0.45, 5);
    expect(star).toMatch(/^M .* Z$/);
    expect(star.split(' L ')).toHaveLength(10);
  });

  test('simplifies freehand points while preserving endpoints', () => {
    const points = Array.from({ length: 30 }, (_, index) => ({ x: index, y: Math.sin(index / 3) }));
    const simplified = simplifyPoints(points, 0.75);
    expect(simplified.length).toBeLessThan(points.length);
    expect(simplified[0]).toEqual(points[0]);
    expect(simplified.at(-1)).toEqual(points.at(-1));
  });

  test('creates radial repeats as independent editable clones', () => {
    const document = addElement(createVectorDocument(), rect('a', 100, 100, 40, 20));
    const repeated = radialRepeatSelection(document, ['a'], 6, { x: 300, y: 300 });
    expect(repeated.document.elements).toHaveLength(6);
    expect(new Set(repeated.document.elements.map((element) => element.id)).size).toBe(6);
    expect(repeated.selection).toHaveLength(5);
  });

  test('supports bounded undo and redo history', () => {
    const start = createVectorDocument();
    const history = createHistory(start);
    const one = pushHistory(history, addElement(start, rect('a', 0, 0)));
    const two = pushHistory(one, addElement(one.present, rect('b', 10, 10)));
    const undone = undoHistory(two);
    expect(undone.present.elements.map((element) => element.id)).toEqual(['a']);
    expect(redoHistory(undone).present.elements.map((element) => element.id)).toEqual(['a', 'b']);
  });
});

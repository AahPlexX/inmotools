import { describe, expect, it } from 'vitest';
import { addComponent, createInitialDocument, mirrorComponent, moveComponent, rotateComponent } from '../../src/tools/logic/circuit-model';
import { componentBodyRect, findComponentAt } from '../../src/tools/logic/gate-shapes';
import { getComponentPorts } from '../../src/tools/logic/component-library';
import { componentOriginPixels, GRID_SIZE } from '../../src/tools/logic/geometry';
import type { LogicDocument } from '../../src/tools/logic/logic-types';

const px = (grid: number) => grid * GRID_SIZE;

describe('component hit testing', () => {
  it('reaches the lower of two switches placed the usual two rows apart', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'SWITCH', 1, 1);
    doc = addComponent(doc, 'SWITCH', 1, 3);
    const [upper, lower] = doc.components;
    // Both parts used to share a 72px box that overlapped their neighbor, so the upper one always won here.
    expect(findComponentAt(doc.components, { x: px(1.25), y: px(1) })?.id).toBe(upper!.id);
    expect(findComponentAt(doc.components, { x: px(1.25), y: px(3) })?.id).toBe(lower!.id);
  });

  it('hits every switch in a tall stack', () => {
    let doc: LogicDocument = createInitialDocument();
    for (let index = 0; index < 6; index += 1) doc = addComponent(doc, 'SWITCH', 1, 1 + index * 2);
    doc.components.forEach((component, index) => {
      expect(findComponentAt(doc.components, { x: px(1.25), y: px(1 + index * 2) })?.id).toBe(component.id);
    });
  });

  it('returns nothing for empty canvas, including just beyond the click slack', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'AND', 5, 5);
    expect(findComponentAt(doc.components, { x: px(20), y: px(20) })).toBeUndefined();
    const body = componentBodyRect(doc.components[0]!, getComponentPorts('AND', {}));
    const origin = componentOriginPixels(doc.components[0]!);
    expect(findComponentAt(doc.components, { x: origin.x + body.x + body.width + 20, y: origin.y + body.height / 2 })).toBeUndefined();
    expect(findComponentAt(doc.components, { x: origin.x + body.x + body.width + 3, y: origin.y + body.height / 2 })?.id).toBe(doc.components[0]!.id);
  });

  it('prefers the component drawn on top where two bodies overlap', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'AND', 5, 5);
    doc = addComponent(doc, 'AND', 5, 5);
    expect(findComponentAt(doc.components, { x: px(6), y: px(6) })?.id).toBe(doc.components[1]!.id);
  });

  it('follows a rotated block to where it is actually drawn', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'MUX', 10, 10);
    const id = doc.components[0]!.id;
    // Upright, the body runs right and down from the origin, so a point well left of it is empty.
    const leftOfOrigin = { x: px(10) - 30, y: px(10) };
    expect(findComponentAt(doc.components, leftOfOrigin)).toBeUndefined();
    // A quarter turn swings the 3-column width onto the y-axis and the height onto the negative x-axis.
    const turned = rotateComponent(doc, id);
    expect(findComponentAt(turned.components, leftOfOrigin)?.id).toBe(id);
    // ...and it no longer covers the far right where it used to extend.
    const farRight = { x: px(10) + 3 * GRID_SIZE - 4, y: px(10) };
    expect(findComponentAt(doc.components, farRight)?.id).toBe(id);
    expect(findComponentAt(turned.components, { x: px(10) + 3 * GRID_SIZE + 20, y: px(10) })).toBeUndefined();
  });

  it('follows a mirrored block to the left of its origin', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'MUX', 10, 10);
    const id = doc.components[0]!.id;
    const inside = { x: px(10) - GRID_SIZE, y: px(10) };
    expect(findComponentAt(doc.components, inside)).toBeUndefined();
    expect(findComponentAt(mirrorComponent(doc, id).components, inside)?.id).toBe(id);
  });

  it('still finds a component after it is moved', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'SWITCH', 1, 1);
    const id = doc.components[0]!.id;
    doc = moveComponent(doc, id, 8, 8);
    expect(findComponentAt(doc.components, { x: px(1.25), y: px(1) })).toBeUndefined();
    expect(findComponentAt(doc.components, { x: px(8.25), y: px(8) })?.id).toBe(id);
  });
});

import { describe, expect, it } from 'vitest';
import { runElectricalRuleCheck } from '../../src/tools/logic/analysis-engine';
import { addComponent, addWire, createInitialDocument, updateComponentParams } from '../../src/tools/logic/circuit-model';
import { COMPONENT_CATEGORIES, getComponentPorts, getSimulationPorts } from '../../src/tools/logic/component-library';
import { parseProject, renderSchematicSvg, serializeProject } from '../../src/tools/logic/export-engine';
import { componentBodyRect, blockCaption } from '../../src/tools/logic/gate-shapes';
import type { LogicDocument, LogicLevel, SimulationFrame } from '../../src/tools/logic/logic-types';
import {
  clampMatrixSize,
  colorNameOf,
  COLOR_HEX,
  matrixPorts,
  matrixSizeOf,
  matrixTitle,
  matrixWidthCols,
  pixelRects,
  restoreMatrixPixels,
  updateMatrixPixels,
} from '../../src/tools/logic/matrix-engine';
import { createInitialFrame, step } from '../../src/tools/logic/sim-engine';

const lastId = (doc: LogicDocument): string => doc.components[doc.components.length - 1]!.id;

describe('matrix size and pins', () => {
  it('snaps a size to 8 or 16 and falls back to 8', () => {
    expect(clampMatrixSize(8)).toBe(8);
    expect(clampMatrixSize(16)).toBe(16);
    expect(clampMatrixSize(11)).toBe(8);
    expect(clampMatrixSize(12)).toBe(16);
    expect(clampMatrixSize(999)).toBe(16);
    expect(clampMatrixSize(-4)).toBe(8);
    expect(clampMatrixSize('big')).toBe(8);
    expect(clampMatrixSize(Number.NaN)).toBe(8);
    expect(matrixSizeOf({})).toBe(8);
    expect(matrixTitle({ matrixSize: 16 })).toBe('RGB 16x16');
  });

  it('has a row pin, a column pin and three color pins for every size', () => {
    for (const size of [8, 16] as const) {
      const ports = getComponentPorts('RGB_MATRIX', { matrixSize: size });
      expect(ports).toHaveLength(size * 2 + 3);
      expect(ports.every((port) => port.direction === 'input')).toBe(true);
      expect(ports.filter((port) => port.id.startsWith('ROW'))).toHaveLength(size);
      expect(ports.filter((port) => port.id.startsWith('COL'))).toHaveLength(size);
      expect(['R', 'G', 'B'].every((id) => ports.some((port) => port.id === id))).toBe(true);
      const spots = ports.map((port) => `${port.x},${port.y}`);
      expect(new Set(spots).size).toBe(spots.length);
      expect(getSimulationPorts('RGB_MATRIX', { matrixSize: size })).toHaveLength(size * 2 + 3);
    }
  });

  it('puts rows and colors on the left, columns on the right, and sizes the body to hold them', () => {
    const ports = matrixPorts({ matrixSize: 16 });
    expect(ports.find((port) => port.id === 'ROW15')).toMatchObject({ x: 0, y: 15 });
    expect(ports.find((port) => port.id === 'B')).toMatchObject({ x: 0, y: 18 });
    expect(ports.find((port) => port.id === 'COL15')).toMatchObject({ x: matrixWidthCols(16), y: 15 });
    const doc = addComponent(createInitialDocument(), 'RGB_MATRIX', 0, 0);
    const component = doc.components[0]!;
    const body = componentBodyRect(component, getComponentPorts(component.type, component.params));
    expect(body.width).toBe(matrixWidthCols(8) * 24);
    expect(blockCaption(component)).toBe('RGB 8x8');
  });

  it('is offered in the palette', () => {
    const group = COMPONENT_CATEGORIES.find((category) => category.category === 'matrix');
    expect(group?.types).toEqual(['RGB_MATRIX']);
  });
});

describe('pixel layout', () => {
  it('lays out a square grid inside the body, clear of the pin-name margins', () => {
    for (const size of [8, 16] as const) {
      const body = { x: 0, y: -12, width: matrixWidthCols(size) * 24, height: (size + 3) * 24 };
      const rects = pixelRects(size, body);
      expect(rects).toHaveLength(size * size);
      const cell = rects[0]!.size;
      expect(rects.every((rect) => rect.size === cell)).toBe(true);
      expect(Math.min(...rects.map((rect) => rect.x))).toBeGreaterThanOrEqual(40);
      expect(Math.max(...rects.map((rect) => rect.x + rect.size))).toBeLessThanOrEqual(body.width - 40 + 0.001);
      expect(Math.min(...rects.map((rect) => rect.y))).toBeGreaterThanOrEqual(body.y);
      expect(Math.max(...rects.map((rect) => rect.y + rect.size))).toBeLessThanOrEqual(body.y + body.height);
      expect(cell).toBeGreaterThanOrEqual(14);
      // Row-major with rows going down and columns going right.
      expect(rects[1]!.x).toBeGreaterThan(rects[0]!.x);
      expect(rects[size]!.y).toBeGreaterThan(rects[0]!.y);
    }
  });
});

describe('pixel colors', () => {
  it('names every combination of red, green and blue', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7].map(colorNameOf)).toEqual(['off', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white']);
    expect(colorNameOf(9)).toBe('off');
    expect(new Set(COLOR_HEX.slice(1)).size).toBe(7);
  });

  it('restores saved pixels, ignoring anything that is not a color mask', () => {
    expect(restoreMatrixPixels(undefined, 8)).toHaveLength(64);
    expect(restoreMatrixPixels([1, 7, 8, -1, 2.5, 'x' as unknown as number], 2)).toEqual([1, 7, 0, 0]);
    expect(restoreMatrixPixels([1, 2, 3, 4], 8).slice(0, 5)).toEqual([1, 2, 3, 4, 0]);
  });
});

describe('driving the matrix', () => {
  const levels = (values: Record<string, LogicLevel>) => (id: string): LogicLevel => values[id] ?? 0;
  const zeros = (): Record<string, LogicLevel> => ({ R: 0, G: 0, B: 0 });

  it('lights only where an asserted column crosses the selected row, in the driven color', () => {
    const pixels = updateMatrixPixels({ params: { matrixSize: 8 }, previous: undefined, read: levels({ ...zeros(), ROW3: 1, COL5: 1, COL6: 1, G: 1, B: 1 }) });
    expect(pixels[3 * 8 + 5]).toBe(6);
    expect(pixels[3 * 8 + 6]).toBe(6);
    expect(pixels.filter((color) => color !== 0)).toHaveLength(2);
  });

  it('shows each color line as its own bit', () => {
    for (const [pins, expected] of [[{ R: 1 }, 1], [{ G: 1 }, 2], [{ B: 1 }, 4], [{ R: 1, G: 1 }, 3], [{ R: 1, G: 1, B: 1 }, 7], [{}, 0]] as const) {
      const pixels = updateMatrixPixels({ params: {}, previous: undefined, read: levels({ ...zeros(), ...pins, ROW0: 1, COL0: 1 }) });
      expect(pixels[0]).toBe(expected);
    }
  });

  it('keeps a pixel while its row is not selected, and replaces it when the row is selected again', () => {
    const first = updateMatrixPixels({ params: {}, previous: undefined, read: levels({ ...zeros(), ROW1: 1, COL2: 1, R: 1 }) });
    const held = updateMatrixPixels({ params: {}, previous: first, read: levels({ ...zeros(), ROW1: 0, COL2: 0, COL4: 1, B: 1 }) });
    expect(held[1 * 8 + 2]).toBe(1);
    expect(held[1 * 8 + 4]).toBe(0);
    const redrawn = updateMatrixPixels({ params: {}, previous: held, read: levels({ ...zeros(), ROW1: 1, COL4: 1, B: 1 }) });
    expect(redrawn[1 * 8 + 2]).toBe(0);
    expect(redrawn[1 * 8 + 4]).toBe(4);
  });

  it('turns a selected pixel off when its column is not asserted', () => {
    const on = updateMatrixPixels({ params: {}, previous: undefined, read: levels({ ...zeros(), ROW0: 1, COL0: 1, R: 1 }) });
    const off = updateMatrixPixels({ params: {}, previous: on, read: levels({ ...zeros(), ROW0: 1, COL0: 0, R: 1 }) });
    expect(off[0]).toBe(0);
  });

  it('leaves a pixel unlit for a floating or unknown column or color, and holds it for an unknown row', () => {
    const read = (overrides: Record<string, LogicLevel>) => levels({ ...zeros(), ROW0: 1, COL0: 1, R: 1, ...overrides });
    for (const bad of ['X', 'Z'] as const) {
      expect(updateMatrixPixels({ params: {}, previous: undefined, read: read({ COL0: bad }) })[0]).toBe(0);
      expect(updateMatrixPixels({ params: {}, previous: undefined, read: read({ R: bad }) })[0]).toBe(0);
    }
    const lit = updateMatrixPixels({ params: {}, previous: undefined, read: read({}) });
    expect(updateMatrixPixels({ params: {}, previous: lit, read: read({ ROW0: 'X' }) })[0]).toBe(1);
  });

  it('honors an active-low drive for rows and columns but not for the color lines', () => {
    const read = levels({ ...zeros(), R: 1, ROW0: 0, ROW1: 1, COL0: 0, COL1: 1 });
    const pixels = updateMatrixPixels({ params: { activeHigh: false }, previous: undefined, read });
    expect(pixels[0]).toBe(1);
    expect(pixels[1]).toBe(0);
    expect(pixels[8]).toBe(0);
    expect(pixels[9]).toBe(0);
  });

  it('draws a 16 by 16 picture', () => {
    const pixels = updateMatrixPixels({ params: { matrixSize: 16 }, previous: undefined, read: levels({ ...zeros(), ROW15: 1, COL15: 1, G: 1 }) });
    expect(pixels).toHaveLength(256);
    expect(pixels[255]).toBe(2);
  });
});

describe('matrix in a circuit', () => {
  interface Rig {
    readonly doc: LogicDocument;
    readonly matrix: string;
    readonly rows: readonly string[];
    readonly columns: readonly string[];
    readonly colors: readonly string[];
  }

  const buildRig = (size: 8 | 16): Rig => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'RGB_MATRIX', 20, 0);
    const matrix = lastId(doc);
    doc = updateComponentParams(doc, matrix, { matrixSize: size });
    const drive = (portId: string, x: number, y: number): string => {
      doc = addComponent(doc, 'SWITCH', x, y);
      const id = lastId(doc);
      doc = addWire(doc, { componentId: id, portId: 'Y' }, { componentId: matrix, portId });
      return id;
    };
    const rows = Array.from({ length: size }, (_, index) => drive(`ROW${index}`, 2, index * 2));
    const colors = ['R', 'G', 'B'].map((id, index) => drive(id, 2, size * 2 + index * 2));
    const columns = Array.from({ length: size }, (_, index) => drive(`COL${index}`, 50, index * 2));
    return { doc, matrix, rows, columns, colors };
  };

  const run = (rig: Rig, frame: SimulationFrame, interactions: Record<string, LogicLevel>): SimulationFrame =>
    step({ document: rig.doc, previous: frame, elapsedMs: 16, interactions });

  it('scans rows in turn and shows the whole picture at once', () => {
    const rig = buildRig(8);
    // A diagonal: each row is selected alone with its own column asserted.
    let frame = createInitialFrame(rig.doc);
    for (let row = 0; row < 8; row += 1) {
      const interactions: Record<string, LogicLevel> = { [rig.colors[0]!]: 1, [rig.colors[1]!]: 0, [rig.colors[2]!]: 0 };
      rig.rows.forEach((id, index) => {
        interactions[id] = index === row ? 1 : 0;
      });
      rig.columns.forEach((id, index) => {
        interactions[id] = index === row ? 1 : 0;
      });
      frame = run(rig, frame, interactions);
    }
    const pixels = frame.componentState[rig.matrix]?.matrixPixels ?? [];
    expect(pixels).toHaveLength(64);
    for (let row = 0; row < 8; row += 1) {
      for (let column = 0; column < 8; column += 1) expect(pixels[row * 8 + column], `pixel ${row},${column}`).toBe(row === column ? 1 : 0);
    }
  });

  it('holds the picture when every row is deselected, and shows only the selected row live', () => {
    const rig = buildRig(8);
    let frame = run(rig, createInitialFrame(rig.doc), { [rig.rows[2]!]: 1, [rig.columns[4]!]: 1, [rig.colors[2]!]: 1 });
    expect(frame.componentState[rig.matrix]?.matrixPixels?.[2 * 8 + 4]).toBe(4);
    frame = run(rig, frame, { [rig.rows[2]!]: 0 });
    frame = run(rig, frame, { [rig.columns[4]!]: 0 });
    expect(frame.componentState[rig.matrix]?.matrixPixels?.[2 * 8 + 4]).toBe(4);
  });

  it('drives a 16 by 16 matrix', () => {
    const rig = buildRig(16);
    const frame = run(rig, createInitialFrame(rig.doc), { [rig.rows[15]!]: 1, [rig.columns[0]!]: 1, [rig.colors[0]!]: 1, [rig.colors[1]!]: 1 });
    expect(frame.componentState[rig.matrix]?.matrixPixels?.[15 * 16]).toBe(3);
  });

  it('names its unwired pins in the electrical rule check', () => {
    const doc = addComponent(createInitialDocument(), 'RGB_MATRIX', 0, 0);
    const messages = runElectricalRuleCheck(doc).map((finding) => finding.message).join('\n');
    expect(messages).toContain('ROW7');
    expect(messages).toContain('COL0');
    expect(messages).toContain('.B');
  });

  it('drops wires to pins that a smaller size no longer has', () => {
    const rig = buildRig(16);
    const smaller = updateComponentParams(rig.doc, rig.matrix, { matrixSize: 8 });
    expect(smaller.wires.length).toBe(8 + 3 + 8);
    expect(rig.doc.wires.length).toBe(16 + 3 + 16);
  });

  it('saves and loads its size and polarity, and draws an unlit grid in the SVG export', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'RGB_MATRIX', 2, 2);
    doc = updateComponentParams(doc, lastId(doc), { matrixSize: 16, activeHigh: false });
    const restored = parseProject(serializeProject(doc));
    expect(restored.components[0]?.params).toMatchObject({ matrixSize: 16, activeHigh: false });
    const svg = renderSchematicSvg(doc);
    expect(svg).toContain('RGB 16x16');
    expect(svg.match(/rx="1.5" fill="#cbd5e1"/g)).toHaveLength(256);
    expect(svg).not.toContain('NaN');
  });
});

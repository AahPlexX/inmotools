import { describe, expect, it } from 'vitest';
import { addComponent, addWire, createInitialDocument, updateComponentParams } from '../../src/tools/logic/circuit-model';
import { COMPONENT_CATEGORIES, getComponentPorts, paletteLabel } from '../../src/tools/logic/component-library';
import {
  digitCountOf,
  displayPorts,
  displayTitle,
  displayWidthCols,
  isDisplayType,
  restoreSegmentLit,
  segmentIdsOf,
  updateSegmentLit,
  type DisplayType,
} from '../../src/tools/logic/display-engine';
import { parseProject, renderSchematicSvg, serializeProject } from '../../src/tools/logic/export-engine';
import { componentBodyRect } from '../../src/tools/logic/gate-shapes';
import type { ComponentParams, LogicDocument, LogicLevel } from '../../src/tools/logic/logic-types';
import { digitGeometries, drawableSegmentIds } from '../../src/tools/logic/segment-shapes';
import { createInitialFrame, step } from '../../src/tools/logic/sim-engine';

const TYPES: readonly DisplayType[] = ['SEVEN_SEGMENT', 'SEVEN_SEGMENT_4', 'SIXTEEN_SEGMENT'];

const litOf = (type: DisplayType, params: ComponentParams, pins: Record<string, LogicLevel>, previous?: readonly (0 | 1)[]) =>
  updateSegmentLit({ type, params, previous, read: (portId) => pins[portId] ?? 'Z' });

const lit = (type: DisplayType, values: readonly (0 | 1)[]) => segmentIdsOf(type).filter((_, index) => values[index] === 1);

describe('display-engine pin layout', () => {
  it('gives every display input pins only, one per segment plus the decimal point', () => {
    for (const type of TYPES) {
      const ports = displayPorts(type);
      expect(ports.every((port) => port.direction === 'input')).toBe(true);
      expect(new Set(ports.map((port) => port.id)).size).toBe(ports.length);
      for (const id of segmentIdsOf(type)) expect(ports.map((port) => port.id)).toContain(id);
    }
    expect(segmentIdsOf('SEVEN_SEGMENT')).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP']);
    expect(segmentIdsOf('SIXTEEN_SEGMENT')).toHaveLength(17);
  });

  it('adds four digit-select pins on the right edge of the multiplexed module', () => {
    const selects = displayPorts('SEVEN_SEGMENT_4').filter((port) => port.id.startsWith('DIG'));
    expect(selects.map((port) => port.id)).toEqual(['DIG1', 'DIG2', 'DIG3', 'DIG4']);
    expect(selects.every((port) => port.x === displayWidthCols('SEVEN_SEGMENT_4'))).toBe(true);
    expect(digitCountOf('SEVEN_SEGMENT_4')).toBe(4);
    expect(digitCountOf('SEVEN_SEGMENT')).toBe(1);
  });

  it('splits the 16-segment pins across both edges so the body is not a 17-row column', () => {
    const ports = displayPorts('SIXTEEN_SEGMENT');
    expect(ports.filter((port) => port.x === 0)).toHaveLength(9);
    expect(ports.filter((port) => port.x > 0)).toHaveLength(8);
    expect(Math.max(...ports.map((port) => port.y))).toBe(8);
  });

  it('never stacks two pins on the same edge row', () => {
    for (const type of TYPES) {
      for (const side of [(x: number) => x === 0, (x: number) => x > 0]) {
        const rows = displayPorts(type).filter((port) => side(port.x)).map((port) => port.y);
        expect(new Set(rows).size).toBe(rows.length);
      }
    }
  });

  it('is served by the library, offered in its own palette group, and titled', () => {
    for (const type of TYPES) {
      expect(isDisplayType(type)).toBe(true);
      expect(getComponentPorts(type, {})).toEqual(displayPorts(type));
    }
    expect(isDisplayType('LED')).toBe(false);
    expect(COMPONENT_CATEGORIES.find((group) => group.category === 'display')?.types).toEqual(TYPES);
    expect(displayTitle('SEVEN_SEGMENT_4')).toBe('4x 7-SEG');
    expect(paletteLabel('SEVEN_SEGMENT_4')).toBe('4-DIGIT 7-SEG');
    expect(paletteLabel('MUX')).toBe('MUX');
    expect(paletteLabel('D_FLIP_FLOP')).toBe('D FLIP FLOP');
  });
});

describe('display-engine lit segments', () => {
  it('lights the segments driven high and leaves the rest dark on an active-high digit', () => {
    const result = litOf('SEVEN_SEGMENT', {}, { A: 1, B: 1, C: 0, D: 0, E: 0, F: 0, G: 0, DP: 1 }, undefined);
    expect(lit('SEVEN_SEGMENT', result)).toEqual(['A', 'B', 'DP']);
  });

  it('inverts for a common-anode (active-low) display', () => {
    const result = litOf('SEVEN_SEGMENT', { activeHigh: false }, { A: 0, B: 1, C: 1, D: 1, E: 1, F: 1, G: 1, DP: 1 });
    expect(lit('SEVEN_SEGMENT', result)).toEqual(['A']);
  });

  it('leaves a floating or unknown segment pin unlit instead of guessing', () => {
    const result = litOf('SEVEN_SEGMENT', {}, { A: 'X', B: 'Z', C: 1 });
    expect(lit('SEVEN_SEGMENT', result)).toEqual(['C']);
  });

  it('follows every pin on the 16-segment digit', () => {
    const result = litOf('SIXTEEN_SEGMENT', {}, { A1: 1, K: 1, M: 1, DP: 1 });
    expect(lit('SIXTEEN_SEGMENT', result)).toEqual(['A1', 'K', 'M', 'DP']);
  });

  it('captures the shared segment pins only into the selected digit of the multiplexed module', () => {
    const first = litOf('SEVEN_SEGMENT_4', {}, { A: 1, B: 1, DIG1: 1 });
    expect(first.slice(0, 8)).toEqual([1, 1, 0, 0, 0, 0, 0, 0]);
    expect(first.slice(8)).toEqual(new Array(24).fill(0));
  });

  it('keeps an unselected digit showing what it last captured (persistence of vision)', () => {
    const scan1 = litOf('SEVEN_SEGMENT_4', {}, { A: 1, DIG1: 1 });
    const scan2 = litOf('SEVEN_SEGMENT_4', {}, { G: 1, DIG2: 1 }, scan1);
    expect(scan2.slice(0, 8)).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);
    expect(scan2.slice(8, 16)).toEqual([0, 0, 0, 0, 0, 0, 1, 0]);
    const idle = litOf('SEVEN_SEGMENT_4', {}, { B: 1 }, scan2);
    expect(idle).toEqual(scan2);
  });

  it('lets several selected digits capture the same pattern together', () => {
    const both = litOf('SEVEN_SEGMENT_4', {}, { C: 1, DIG1: 1, DIG3: 1 });
    expect(both[2]).toBe(1);
    expect(both[8 + 2]).toBe(0);
    expect(both[16 + 2]).toBe(1);
  });

  it('honors active-low digit selects independently of the segment polarity', () => {
    const result = litOf('SEVEN_SEGMENT_4', { digitActiveHigh: false }, { A: 1, DIG1: 1, DIG2: 0 });
    expect(result.slice(0, 8)[0]).toBe(0);
    expect(result.slice(8, 16)[0]).toBe(1);
  });

  it('restores a saved lit array to the right size and rejects non-lit values', () => {
    expect(restoreSegmentLit(undefined, 'SEVEN_SEGMENT')).toEqual(new Array(8).fill(0));
    expect(restoreSegmentLit([1, 'X', 0, 1], 'SEVEN_SEGMENT')).toEqual([1, 0, 0, 1, 0, 0, 0, 0]);
    expect(restoreSegmentLit(new Array(99).fill(1), 'SEVEN_SEGMENT_4')).toHaveLength(32);
  });
});

describe('segment geometry', () => {
  it.each(TYPES)('lays out every segment of %s inside the body with finite coordinates', (type) => {
    const body = componentBodyRect({ id: 'x', type, x: 0, y: 0, rotation: 0, mirrored: false, label: 'D', params: {} }, displayPorts(type));
    const digits = digitGeometries(type, body);
    expect(digits).toHaveLength(digitCountOf(type));
    for (const digit of digits) {
      expect(digit.segments.map((segment) => segment.id)).toEqual(drawableSegmentIds(type));
      for (const segment of digit.segments) {
        for (const point of segment.points) {
          expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
          expect(point.x).toBeGreaterThanOrEqual(body.x);
          expect(point.x).toBeLessThanOrEqual(body.x + body.width);
          expect(point.y).toBeGreaterThanOrEqual(body.y);
          expect(point.y).toBeLessThanOrEqual(body.y + body.height);
        }
      }
      expect(digit.dot.cx).toBeLessThan(body.x + body.width);
      expect(digit.dot.r).toBeGreaterThan(0);
    }
  });

  it('keeps the multiplexed digits side by side without overlapping', () => {
    const type: DisplayType = 'SEVEN_SEGMENT_4';
    const body = { x: 0, y: -12, width: displayWidthCols(type) * 24, height: 8 * 24 };
    const extents = digitGeometries(type, body).map((digit) => {
      const xs = digit.segments.flatMap((segment) => segment.points.map((point) => point.x));
      return { left: Math.min(...xs), right: Math.max(...xs) };
    });
    for (let index = 1; index < extents.length; index += 1) expect(extents[index]!.left).toBeGreaterThan(extents[index - 1]!.right);
  });

  it('keeps the glyph clear of the pin-name columns on both edges', () => {
    const type: DisplayType = 'SIXTEEN_SEGMENT';
    const body = { x: 0, y: -12, width: displayWidthCols(type) * 24, height: 9 * 24 };
    const xs = digitGeometries(type, body).flatMap((digit) => digit.segments.flatMap((segment) => segment.points.map((point) => point.x)));
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(18);
    expect(Math.max(...xs)).toBeLessThanOrEqual(body.width - 18);
  });

  it('never collapses when given a degenerate body', () => {
    const digits = digitGeometries('SEVEN_SEGMENT_4', { x: 0, y: 0, width: 0, height: 0 });
    for (const digit of digits) for (const segment of digit.segments) for (const point of segment.points) expect(Number.isFinite(point.x)).toBe(true);
  });
});

describe('display integration through the simulator, model, and export', () => {
  /** Four switches -> BCD decoder -> single 7-segment digit. */
  const build = () => {
    let doc: LogicDocument = createInitialDocument();
    for (let index = 0; index < 4; index += 1) doc = addComponent(doc, 'SWITCH', 0, index * 2);
    const switches = doc.components.map((component) => component.id);
    doc = addComponent(doc, 'BCD_7SEG', 6, 0);
    const decoder = doc.components[4]!.id;
    doc = addComponent(doc, 'SEVEN_SEGMENT', 14, 0);
    const display = doc.components[5]!.id;
    switches.forEach((id, index) => {
      doc = addWire(doc, { componentId: id, portId: 'Y' }, { componentId: decoder, portId: `D${index}` });
    });
    for (const segment of ['A', 'B', 'C', 'D', 'E', 'F', 'G']) {
      doc = addWire(doc, { componentId: decoder, portId: segment }, { componentId: display, portId: segment });
    }
    return { doc, switches, decoder, display };
  };

  const showDigit = (digit: number) => {
    const { doc, switches, display } = build();
    const interactions = Object.fromEntries(switches.map((id, index) => [id, ((digit >> index) & 1) as LogicLevel]));
    const frame = step({ document: doc, previous: createInitialFrame(doc), elapsedMs: 16, interactions });
    return lit('SEVEN_SEGMENT', restoreSegmentLit(frame.componentState[display]?.segmentLit, 'SEVEN_SEGMENT'));
  };

  it('shows each decimal digit end to end through a BCD decoder', () => {
    expect(showDigit(7)).toEqual(['A', 'B', 'C']);
    expect(showDigit(1)).toEqual(['B', 'C']);
    expect(showDigit(8)).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
    expect(showDigit(0)).toEqual(['A', 'B', 'C', 'D', 'E', 'F']);
  });

  it('blanks the display for an invalid BCD code', () => {
    expect(showDigit(12)).toEqual([]);
  });

  it('starts fully dark before the first step', () => {
    const { doc, display } = build();
    expect(createInitialFrame(doc).componentState[display]).toBeUndefined();
  });

  it('round-trips a project containing displays', () => {
    const { doc } = build();
    const restored = parseProject(serializeProject(doc));
    expect(restored.components.map((component) => component.type)).toContain('SEVEN_SEGMENT');
  });

  it('draws every digit into the exported SVG as polygons plus a decimal point', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'SEVEN_SEGMENT_4', 2, 2);
    const svg = renderSchematicSvg(doc);
    expect(svg).toContain('4x 7-SEG');
    expect((svg.match(/<polygon /g) ?? []).length).toBe(28);
    for (const label of ['A', 'DP', 'DIG1', 'DIG4']) expect(svg).toContain(`>${label}<`);
    expect(svg).not.toContain('NaN');
  });

  it('places a right-edge pin label outside the body on the right in the export', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'SEVEN_SEGMENT_4', 2, 2);
    const svg = renderSchematicSvg(doc);
    expect(svg).toMatch(/text-anchor="start"[^>]*>DIG1</);
    expect(svg).toMatch(/text-anchor="end"[^>]*>A</);
  });

  it('ignores extra params on a display and keeps its pins fixed', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'SEVEN_SEGMENT', 0, 0);
    doc = updateComponentParams(doc, doc.components[0]!.id, { selectBits: 4, bitWidth: 8, inputCount: 8 });
    expect(getComponentPorts('SEVEN_SEGMENT', doc.components[0]!.params)).toHaveLength(8);
  });
});

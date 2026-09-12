import { describe, expect, it } from 'vitest';
import { solveSketch } from '../../src/tools/cad/sketch-solver';
import type { CadSketch } from '../../src/tools/cad/sketch-types';

function point(result: ReturnType<typeof solveSketch>, id: string) {
  const entity = result.sketch.entities.find((candidate) => candidate.id === id);
  if (!entity || entity.type !== 'point') throw new Error(`Missing point '${id}'.`);
  return entity;
}

function distanceFromOriginToLine(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.abs(dx * -ay - dy * -ax) / Math.hypot(dx, dy);
}

describe('CAD exact line-to-curve tangency', () => {
  it('solves a free line tangent to an axis-aligned ellipse in normalized ellipse space', () => {
    const sketch: CadSketch = {
      id: 'ellipse-tangent',
      label: 'Ellipse tangent',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'center', type: 'point', x: 0, y: 0, construction: false },
        { id: 'major', type: 'point', x: 10, y: 0, construction: false },
        { id: 'a', type: 'point', x: -10, y: 6, construction: false },
        { id: 'b', type: 'point', x: 10, y: 6, construction: false },
        { id: 'ellipse', type: 'ellipse', centerPointId: 'center', majorAxisPointId: 'major', minorRadius: 5, construction: false },
        { id: 'line', type: 'line', startPointId: 'a', endPointId: 'b', construction: false },
      ],
      constraints: [
        { id: 'lock-ellipse', type: 'fixed-entity', entityId: 'ellipse', enabled: true },
        { id: 'tangent', type: 'tangent-curve', lineId: 'line', curveId: 'ellipse', enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    const a = point(result, 'a');
    const b = point(result, 'b');
    const normalizedDistance = distanceFromOriginToLine(a.x / 10, a.y / 5, b.x / 10, b.y / 5);

    expect(result.converged).toBe(true);
    expect(normalizedDistance).toBeCloseTo(1, 6);
  });

  it('solves tangency to a rotated ellipse using its local major/minor frame', () => {
    const root2 = Math.sqrt(2);
    const ux = 1 / root2;
    const uy = 1 / root2;
    const vx = -uy;
    const vy = ux;
    const localToWorld = (major: number, minor: number) => ({
      x: major * ux + minor * vx,
      y: major * uy + minor * vy,
    });
    const majorPoint = localToWorld(10, 0);
    const a0 = localToWorld(11, -5);
    const b0 = localToWorld(11, 5);
    const sketch: CadSketch = {
      id: 'rotated-ellipse-tangent',
      label: 'Rotated ellipse tangent',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'center', type: 'point', x: 0, y: 0, construction: false },
        { id: 'major', type: 'point', x: majorPoint.x, y: majorPoint.y, construction: false },
        { id: 'a', type: 'point', x: a0.x, y: a0.y, construction: false },
        { id: 'b', type: 'point', x: b0.x, y: b0.y, construction: false },
        { id: 'ellipse', type: 'ellipse', centerPointId: 'center', majorAxisPointId: 'major', minorRadius: 5, construction: false },
        { id: 'line', type: 'line', startPointId: 'a', endPointId: 'b', construction: false },
      ],
      constraints: [
        { id: 'lock-ellipse', type: 'fixed-entity', entityId: 'ellipse', enabled: true },
        { id: 'tangent', type: 'tangent-curve', lineId: 'line', curveId: 'ellipse', enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    const a = point(result, 'a');
    const b = point(result, 'b');
    const toNormalized = (x: number, y: number) => ({
      x: (x * ux + y * uy) / 10,
      y: (x * vx + y * vy) / 5,
    });
    const na = toNormalized(a.x, a.y);
    const nb = toNormalized(b.x, b.y);

    expect(result.converged).toBe(true);
    expect(distanceFromOriginToLine(na.x, na.y, nb.x, nb.y)).toBeCloseTo(1, 6);
  });

  it('rejects tangency whose contact lies on the excluded half of a circular arc', () => {
    const sketch: CadSketch = {
      id: 'arc-tangent-span',
      label: 'Arc tangent span',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'center', type: 'point', x: 0, y: 0, construction: false },
        { id: 'start', type: 'point', x: 5, y: 0, construction: false },
        { id: 'end', type: 'point', x: -5, y: 0, construction: false },
        { id: 'a', type: 'point', x: -10, y: -5, construction: false },
        { id: 'b', type: 'point', x: 10, y: -5, construction: false },
        { id: 'arc', type: 'arc', centerPointId: 'center', startPointId: 'start', endPointId: 'end', clockwise: false, construction: false },
        { id: 'line', type: 'line', startPointId: 'a', endPointId: 'b', construction: false },
      ],
      constraints: [
        { id: 'lock-arc', type: 'fixed-entity', entityId: 'arc', enabled: true },
        { id: 'lock-line', type: 'fixed-entity', entityId: 'line', enabled: true },
        { id: 'tangent', type: 'tangent-curve', lineId: 'line', curveId: 'arc', enabled: true },
      ],
    };

    const result = solveSketch(sketch);

    expect(result.converged).toBe(false);
    expect(result.conflicts).toContain('tangent');
  });

  it('rejects tangency whose contact lies on the excluded half of an elliptical arc', () => {
    const sketch: CadSketch = {
      id: 'elliptical-arc-tangent-span',
      label: 'Elliptical arc tangent span',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'center', type: 'point', x: 0, y: 0, construction: false },
        { id: 'major', type: 'point', x: 10, y: 0, construction: false },
        { id: 'start', type: 'point', x: 10, y: 0, construction: false },
        { id: 'end', type: 'point', x: -10, y: 0, construction: false },
        { id: 'a', type: 'point', x: -10, y: -5, construction: false },
        { id: 'b', type: 'point', x: 10, y: -5, construction: false },
        { id: 'earc', type: 'elliptical-arc', centerPointId: 'center', majorAxisPointId: 'major', minorRadius: 5, startPointId: 'start', endPointId: 'end', clockwise: false, construction: false },
        { id: 'line', type: 'line', startPointId: 'a', endPointId: 'b', construction: false },
      ],
      constraints: [
        { id: 'lock-earc', type: 'fixed-entity', entityId: 'earc', enabled: true },
        { id: 'lock-line', type: 'fixed-entity', entityId: 'line', enabled: true },
        { id: 'tangent', type: 'tangent-curve', lineId: 'line', curveId: 'earc', enabled: true },
      ],
    };

    const result = solveSketch(sketch);

    expect(result.converged).toBe(false);
    expect(result.conflicts).toContain('tangent');
  });
});

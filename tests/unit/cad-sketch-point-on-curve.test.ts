import { describe, expect, it } from 'vitest';
import { solveSketch } from '../../src/tools/cad/sketch-solver';
import type { CadSketch } from '../../src/tools/cad/sketch-types';

function point(result: ReturnType<typeof solveSketch>, id: string) {
  const entity = result.sketch.entities.find((candidate) => candidate.id === id);
  if (!entity || entity.type !== 'point') throw new Error(`Missing point '${id}'.`);
  return entity;
}

describe('CAD point-on-curve constraints', () => {
  it('keeps a point on the finite directed span of a circular arc', () => {
    const sketch: CadSketch = {
      id: 'point-on-arc',
      label: 'Point on arc',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'center', type: 'point', x: 0, y: 0, construction: false },
        { id: 'start', type: 'point', x: 5, y: 0, construction: false },
        { id: 'end', type: 'point', x: -5, y: 0, construction: false },
        { id: 'probe', type: 'point', x: 0, y: -5, construction: false },
        { id: 'arc', type: 'arc', centerPointId: 'center', startPointId: 'start', endPointId: 'end', clockwise: false, construction: false },
      ],
      constraints: [
        { id: 'lock-arc', type: 'fixed-entity', entityId: 'arc', enabled: true },
        { id: 'on-arc', type: 'point-on-curve', pointId: 'probe', curveId: 'arc', enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    const probe = point(result, 'probe');
    const radiusError = Math.abs(Math.hypot(probe.x, probe.y) - 5);

    expect(result.converged).toBe(true);
    expect(radiusError).toBeLessThan(1e-6);
    expect(probe.y).toBeGreaterThanOrEqual(-1e-6);
  });

  it('does not accept a fixed point on the excluded half of an arc', () => {
    const sketch: CadSketch = {
      id: 'arc-span-conflict',
      label: 'Arc span conflict',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'center', type: 'point', x: 0, y: 0, construction: false },
        { id: 'start', type: 'point', x: 5, y: 0, construction: false },
        { id: 'end', type: 'point', x: -5, y: 0, construction: false },
        { id: 'probe', type: 'point', x: 0, y: -5, construction: false },
        { id: 'arc', type: 'arc', centerPointId: 'center', startPointId: 'start', endPointId: 'end', clockwise: false, construction: false },
      ],
      constraints: [
        { id: 'lock-arc', type: 'fixed-entity', entityId: 'arc', enabled: true },
        { id: 'lock-probe', type: 'fixed-point', pointId: 'probe', x: 0, y: -5, enabled: true },
        { id: 'on-arc', type: 'point-on-curve', pointId: 'probe', curveId: 'arc', enabled: true },
      ],
    };

    const result = solveSketch(sketch);

    expect(result.converged).toBe(false);
    expect(result.conflicts).toContain('on-arc');
  });

  it('constrains a point to a rotated ellipse using its true local axes', () => {
    const root2 = Math.sqrt(2);
    const sketch: CadSketch = {
      id: 'point-on-ellipse',
      label: 'Point on ellipse',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'center', type: 'point', x: 0, y: 0, construction: false },
        { id: 'major', type: 'point', x: 10 / root2, y: 10 / root2, construction: false },
        { id: 'probe', type: 'point', x: 4, y: -1, construction: false },
        { id: 'ellipse', type: 'ellipse', centerPointId: 'center', majorAxisPointId: 'major', minorRadius: 5, construction: false },
      ],
      constraints: [
        { id: 'lock-ellipse', type: 'fixed-entity', entityId: 'ellipse', enabled: true },
        { id: 'on-ellipse', type: 'point-on-curve', pointId: 'probe', curveId: 'ellipse', enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    const probe = point(result, 'probe');
    const ux = 1 / root2;
    const uy = 1 / root2;
    const vx = -uy;
    const vy = ux;
    const localMajor = probe.x * ux + probe.y * uy;
    const localMinor = probe.x * vx + probe.y * vy;
    const implicit = (localMajor * localMajor) / 100 + (localMinor * localMinor) / 25;

    expect(result.converged).toBe(true);
    expect(implicit).toBeCloseTo(1, 6);
  });

  it('honors the directed span of an elliptical arc instead of its full ellipse', () => {
    const sketch: CadSketch = {
      id: 'point-on-elliptical-arc',
      label: 'Point on elliptical arc',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'center', type: 'point', x: 0, y: 0, construction: false },
        { id: 'major', type: 'point', x: 10, y: 0, construction: false },
        { id: 'start', type: 'point', x: 10, y: 0, construction: false },
        { id: 'end', type: 'point', x: -10, y: 0, construction: false },
        { id: 'probe', type: 'point', x: 0, y: -5, construction: false },
        { id: 'earc', type: 'elliptical-arc', centerPointId: 'center', majorAxisPointId: 'major', minorRadius: 5, startPointId: 'start', endPointId: 'end', clockwise: false, construction: false },
      ],
      constraints: [
        { id: 'lock-earc', type: 'fixed-entity', entityId: 'earc', enabled: true },
        { id: 'on-earc', type: 'point-on-curve', pointId: 'probe', curveId: 'earc', enabled: true },
      ],
    };

    const result = solveSketch(sketch);
    const probe = point(result, 'probe');
    const implicit = (probe.x * probe.x) / 100 + (probe.y * probe.y) / 25;

    expect(result.converged).toBe(true);
    expect(implicit).toBeCloseTo(1, 6);
    expect(probe.y).toBeGreaterThanOrEqual(-1e-6);
  });
});

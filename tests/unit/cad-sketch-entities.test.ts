import { describe, expect, it } from 'vitest';
import { sketchEntityTopology, validateSketchEntityGeometry } from '../../src/tools/cad/sketch-geometry';
import type {
  CadSketch,
  SketchArcEntity,
  SketchEllipseEntity,
  SketchEllipticalArcEntity,
  SketchSplineEntity,
} from '../../src/tools/cad/sketch-types';

function basePoints() {
  return [
    { id: 'center', type: 'point' as const, x: 0, y: 0, construction: false },
    { id: 'major', type: 'point' as const, x: 10, y: 0, construction: false },
    { id: 'start', type: 'point' as const, x: 5, y: 0, construction: false },
    { id: 'end', type: 'point' as const, x: 0, y: 5, construction: false },
    { id: 'fit-0', type: 'point' as const, x: 0, y: 0, construction: false },
    { id: 'fit-1', type: 'point' as const, x: 4, y: 6, construction: false },
    { id: 'fit-2', type: 'point' as const, x: 8, y: 1, construction: false },
  ];
}

describe('CAD advanced sketch entities', () => {
  it('models circular arcs using semantic center/start/end point references', () => {
    const arc: SketchArcEntity = {
      id: 'arc',
      type: 'arc',
      centerPointId: 'center',
      startPointId: 'start',
      endPointId: 'end',
      clockwise: false,
      construction: false,
    };

    expect(sketchEntityTopology(arc)).toEqual({ closed: false, endpointPointIds: ['start', 'end'] });
  });

  it('models full ellipses separately from elliptical arcs', () => {
    const ellipse: SketchEllipseEntity = {
      id: 'ellipse',
      type: 'ellipse',
      centerPointId: 'center',
      majorAxisPointId: 'major',
      minorRadius: 4,
      construction: false,
    };
    const ellipticalArc: SketchEllipticalArcEntity = {
      id: 'elliptical-arc',
      type: 'elliptical-arc',
      centerPointId: 'center',
      majorAxisPointId: 'major',
      minorRadius: 4,
      startPointId: 'start',
      endPointId: 'end',
      clockwise: false,
      construction: false,
    };

    expect(sketchEntityTopology(ellipse)).toEqual({ closed: true, endpointPointIds: [] });
    expect(sketchEntityTopology(ellipticalArc)).toEqual({ closed: false, endpointPointIds: ['start', 'end'] });
  });

  it('models open and closed interpolated splines with explicit fit-point order', () => {
    const open: SketchSplineEntity = {
      id: 'spline-open',
      type: 'spline',
      fitPointIds: ['fit-0', 'fit-1', 'fit-2'],
      degree: 3,
      closed: false,
      construction: false,
    };
    const closed: SketchSplineEntity = { ...open, id: 'spline-closed', closed: true };

    expect(sketchEntityTopology(open)).toEqual({ closed: false, endpointPointIds: ['fit-0', 'fit-2'] });
    expect(sketchEntityTopology(closed)).toEqual({ closed: true, endpointPointIds: [] });
  });

  it('rejects malformed advanced geometry instead of passing invalid curves downstream', () => {
    const sketch: CadSketch = {
      id: 'invalid-advanced',
      label: 'Invalid advanced entities',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        ...basePoints(),
        {
          id: 'bad-arc',
          type: 'arc',
          centerPointId: 'center',
          startPointId: 'start',
          endPointId: 'end',
          clockwise: false,
          construction: false,
        },
        {
          id: 'bad-ellipse',
          type: 'ellipse',
          centerPointId: 'center',
          majorAxisPointId: 'center',
          minorRadius: 0,
          construction: false,
        },
        {
          id: 'bad-spline',
          type: 'spline',
          fitPointIds: ['fit-0'],
          degree: 3,
          closed: false,
          construction: false,
        },
      ],
      constraints: [],
    };

    const issues = validateSketchEntityGeometry(sketch);

    expect(issues.map((issue) => issue.entityId)).toEqual(['bad-ellipse', 'bad-spline']);
    expect(issues[0]?.message).toMatch(/minor radius|major axis/i);
    expect(issues[1]?.message).toMatch(/fit points/i);
  });

  it('accepts well-formed arc, ellipse, elliptical arc, and spline geometry', () => {
    const sketch: CadSketch = {
      id: 'valid-advanced',
      label: 'Valid advanced entities',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        ...basePoints(),
        {
          id: 'arc',
          type: 'arc',
          centerPointId: 'center',
          startPointId: 'start',
          endPointId: 'end',
          clockwise: false,
          construction: false,
        },
        {
          id: 'ellipse',
          type: 'ellipse',
          centerPointId: 'center',
          majorAxisPointId: 'major',
          minorRadius: 4,
          construction: false,
        },
        {
          id: 'elliptical-arc',
          type: 'elliptical-arc',
          centerPointId: 'center',
          majorAxisPointId: 'major',
          minorRadius: 4,
          startPointId: 'start',
          endPointId: 'end',
          clockwise: false,
          construction: false,
        },
        {
          id: 'spline',
          type: 'spline',
          fitPointIds: ['fit-0', 'fit-1', 'fit-2'],
          degree: 3,
          closed: false,
          startTangent: { x: 1, y: 0 },
          endTangent: { x: 1, y: -0.25 },
          construction: false,
        },
      ],
      constraints: [],
    };

    expect(validateSketchEntityGeometry(sketch)).toEqual([]);
    expect(JSON.parse(JSON.stringify(sketch))).toEqual(sketch);
  });
});
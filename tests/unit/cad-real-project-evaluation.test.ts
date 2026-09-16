import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CadFeature, CadProject } from '../../src/tools/cad/cad-types';
import { evaluateCadFeatures } from '../../src/tools/cad/feature-evaluator';
import { createOcctCadKernelAdapter, type OcctCadKernelAdapter } from '../../src/tools/cad/occt-adapter';
import { createCadProject } from '../../src/tools/cad/project-engine';
import type { CadSketch } from '../../src/tools/cad/sketch-types';

/**
 * Every other G6 test verifies either the real kernel directly (bypassing
 * the evaluator) or the evaluator against a mocked kernel (bypassing real
 * geometry). Neither proves the full pipeline - a serializable project
 * replayed through the real evaluator against the real OCCT kernel -
 * produces correct geometry once several features depend on each other.
 * This exercises exactly that for a realistic part: an extruded plate with
 * one rounded corner and a blind hole cut from an offset datum plane.
 */
describe('CAD real project evaluation', () => {
  let kernel: OcctCadKernelAdapter;

  beforeAll(async () => {
    kernel = await createOcctCadKernelAdapter();
  });

  afterAll(() => {
    kernel.dispose();
  });

  function feature(overrides: Partial<CadFeature> & Pick<CadFeature, 'id' | 'type' | 'parameters'>): CadFeature {
    return {
      label: overrides.id,
      bodyId: 'body-main',
      dependsOn: [],
      topologyRefs: [],
      suppressed: false,
      status: 'dirty',
      diagnostic: null,
      ...overrides,
    };
  }

  it('evaluates an extrude -> fillet -> datum-plane -> hole part end to end against the real kernel', () => {
    // Probe the same box shape standalone to obtain a real, ephemeral fingerprint for one vertical edge,
    // exactly as a UI would after the first rebuild - not a hand-invented reference.
    const probeBox = kernel.box(20, 10, 5);
    const edgeCandidates = kernel.topologyCandidates(probeBox, 'extrude-1', 'edge');
    const verticalEdge = [...edgeCandidates].sort((left, right) => left.length! - right.length!)[0]!;
    kernel.release(probeBox);

    const plateSketch: CadSketch = {
      id: 'plate',
      label: 'Plate profile',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'p1', type: 'point', x: 0, y: 0, construction: false },
        { id: 'p2', type: 'point', x: 20, y: 0, construction: false },
        { id: 'p3', type: 'point', x: 20, y: 10, construction: false },
        { id: 'p4', type: 'point', x: 0, y: 10, construction: false },
        { id: 'bottom', type: 'line', startPointId: 'p1', endPointId: 'p2', construction: false },
        { id: 'right', type: 'line', startPointId: 'p2', endPointId: 'p3', construction: false },
        { id: 'top', type: 'line', startPointId: 'p3', endPointId: 'p4', construction: false },
        { id: 'left', type: 'line', startPointId: 'p4', endPointId: 'p1', construction: false },
      ],
      constraints: [],
    };
    const holeSketch: CadSketch = {
      id: 'hole-sketch',
      label: 'Hole position',
      plane: { kind: 'datum', datumId: 'top-face' },
      entities: [
        { id: 'hole-center', type: 'point', x: 10, y: 5, construction: false },
        { id: 'hole-circle', type: 'circle', centerPointId: 'hole-center', radius: 1, construction: false },
      ],
      constraints: [],
    };

    const project: CadProject = {
      ...createCadProject('Bracket integration fixture'),
      sketches: [plateSketch, holeSketch],
      features: [
        feature({
          id: 'extrude-1',
          type: 'extrude',
          parameters: { sketchId: 'plate', profileEntityIds: ['bottom', 'right', 'top', 'left'], distance: 5 },
        }),
        feature({
          id: 'fillet-1',
          type: 'fillet',
          dependsOn: ['extrude-1'],
          topologyRefs: [{
            id: 'ref-corner-edge',
            producerFeatureId: 'extrude-1',
            kind: 'edge',
            role: 'rounded-corner',
            curveType: verticalEdge.curveType,
            centroid: verticalEdge.centroid,
            length: verticalEdge.length,
            bounds: verticalEdge.bounds,
          }],
          parameters: { radius: 2 },
        }),
        feature({
          id: 'top-face',
          type: 'datum-plane',
          parameters: { basePlane: 'XY', distance: 5 },
        }),
        feature({
          id: 'hole-1',
          type: 'hole',
          dependsOn: ['fillet-1'],
          parameters: { sketchId: 'hole-sketch', profileEntityIds: ['hole-circle'], depth: 3 },
        }),
      ],
      bodies: [{ id: 'body-main', label: 'Bracket', featureIds: ['extrude-1', 'fillet-1', 'top-face', 'hole-1'], visible: true }],
    };

    const result = evaluateCadFeatures(project, kernel);
    expect(result.bodies).toHaveLength(1);
    const finalBody = result.bodies[0]!;
    expect(finalBody.sourceFeatureId).toBe('hole-1');

    try {
      const filletRemovedVolume = 5 * 2 ** 2 * (1 - Math.PI / 4);
      const holeRemovedVolume = Math.PI * 1 ** 2 * 3;
      const expectedVolume = 20 * 10 * 5 - filletRemovedVolume - holeRemovedVolume;
      expect(kernel.volume(finalBody.shape)).toBeCloseTo(expectedVolume, 4);

      const bounds = kernel.bounds(finalBody.shape);
      expect(bounds.min[2]).toBeCloseTo(0, 6);
      expect(bounds.max[2]).toBeCloseTo(5, 6);
    } finally {
      kernel.release(finalBody.shape);
    }
  });

  it('cuts a through-all hole exactly through the body regardless of the oversized cut tool', () => {
    const holeSketch: CadSketch = {
      id: 'hole-sketch',
      label: 'Hole position',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'hole-center', type: 'point', x: 10, y: 5, construction: false },
        { id: 'hole-circle', type: 'circle', centerPointId: 'hole-center', radius: 1, construction: false },
      ],
      constraints: [],
    };

    const project: CadProject = {
      ...createCadProject('Through-all hole fixture'),
      sketches: [holeSketch],
      features: [
        feature({
          id: 'box-1',
          type: 'primitive',
          parameters: { kind: 'box', width: 20, depth: 10, height: 5 },
        }),
        feature({
          id: 'hole-1',
          type: 'hole',
          dependsOn: ['box-1'],
          parameters: { sketchId: 'hole-sketch', profileEntityIds: ['hole-circle'], throughAll: true, reversed: true },
        }),
      ],
      bodies: [{ id: 'body-main', label: 'Plate', featureIds: ['box-1', 'hole-1'], visible: true }],
    };

    const result = evaluateCadFeatures(project, kernel);
    const finalBody = result.bodies[0]!;

    try {
      // The tool is sized well beyond the box's 5mm height, but the boolean cut only removes
      // what overlaps the box, so exactly one full-height cylinder should be gone - no more, no less.
      const expectedVolume = 20 * 10 * 5 - Math.PI * 1 ** 2 * 5;
      expect(kernel.volume(finalBody.shape)).toBeCloseTo(expectedVolume, 4);
    } finally {
      kernel.release(finalBody.shape);
    }
  });

  it('cuts a counterbore hole by fusing a wider shallow tool with the full-depth bore', () => {
    const holeSketch: CadSketch = {
      id: 'hole-sketch',
      label: 'Counterbore position',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'hole-center', type: 'point', x: 10, y: 5, construction: false },
        { id: 'hole-circle', type: 'circle', centerPointId: 'hole-center', radius: 1, construction: false },
        { id: 'cb-circle', type: 'circle', centerPointId: 'hole-center', radius: 2, construction: false },
      ],
      constraints: [],
    };

    const project: CadProject = {
      ...createCadProject('Counterbore hole fixture'),
      sketches: [holeSketch],
      features: [
        feature({
          id: 'box-1',
          type: 'primitive',
          parameters: { kind: 'box', width: 20, depth: 10, height: 5 },
        }),
        feature({
          id: 'hole-1',
          type: 'hole',
          dependsOn: ['box-1'],
          parameters: {
            sketchId: 'hole-sketch',
            profileEntityIds: ['hole-circle'],
            depth: 4,
            reversed: true,
            counterbore: { profileEntityIds: ['cb-circle'], depth: 1.5 },
          },
        }),
      ],
      bodies: [{ id: 'body-main', label: 'Plate', featureIds: ['box-1', 'hole-1'], visible: true }],
    };

    const result = evaluateCadFeatures(project, kernel);
    const finalBody = result.bodies[0]!;

    try {
      // Bore (r=1, full 4mm depth) union counterbore (r=2, 1.5mm shallow recess), coaxial:
      // the bore is a subset of the counterbore's radius within the overlap, so the union
      // volume is the bore's own volume plus only the counterbore's *extra* annular volume.
      const boreVolume = Math.PI * 1 ** 2 * 4;
      const counterboreExtraVolume = Math.PI * (2 ** 2 - 1 ** 2) * 1.5;
      const expectedVolume = 20 * 10 * 5 - boreVolume - counterboreExtraVolume;
      expect(kernel.volume(finalBody.shape)).toBeCloseTo(expectedVolume, 4);
    } finally {
      kernel.release(finalBody.shape);
    }
  });

  it('cuts a countersink hole by fusing a conical frustum with the full-depth bore', () => {
    const holeSketch: CadSketch = {
      id: 'hole-sketch',
      label: 'Countersink position',
      plane: { kind: 'origin', plane: 'XY' },
      entities: [
        { id: 'hole-center', type: 'point', x: 10, y: 5, construction: false },
        { id: 'hole-circle', type: 'circle', centerPointId: 'hole-center', radius: 1, construction: false },
        { id: 'cs-circle', type: 'circle', centerPointId: 'hole-center', radius: 2, construction: false },
      ],
      constraints: [],
    };

    const project: CadProject = {
      ...createCadProject('Countersink hole fixture'),
      sketches: [holeSketch],
      features: [
        feature({
          id: 'box-1',
          type: 'primitive',
          parameters: { kind: 'box', width: 20, depth: 10, height: 5 },
        }),
        feature({
          id: 'hole-1',
          type: 'hole',
          dependsOn: ['box-1'],
          parameters: {
            sketchId: 'hole-sketch',
            profileEntityIds: ['hole-circle'],
            depth: 4,
            reversed: true,
            countersink: { profileEntityIds: ['cs-circle'], angle: Math.PI / 2 },
          },
        }),
      ],
      bodies: [{ id: 'body-main', label: 'Plate', featureIds: ['box-1', 'hole-1'], visible: true }],
    };

    const result = evaluateCadFeatures(project, kernel);
    const finalBody = result.bodies[0]!;

    try {
      // 90 degree included angle (45 degree half-angle, tan = 1): csDepth = (2 - 1) / 1 = 1.
      // Volume alone can't distinguish "wide end at the surface" from "wide end buried inside" -
      // fusing a frustum with a coaxial full-depth bore of its own narrow-end radius removes
      // exactly the same total volume either way, since the bore is always a subset of the
      // frustum's swept solid. So this also probes orientation directly below.
      const csDepth = (2 - 1) / Math.tan(Math.PI / 2 / 2);
      const frustumVolume = (Math.PI * csDepth / 3) * (2 ** 2 + 2 * 1 + 1 ** 2);
      const remainingBoreVolume = Math.PI * 1 ** 2 * (4 - csDepth);
      const expectedVolume = 20 * 10 * 5 - frustumVolume - remainingBoreVolume;
      expect(kernel.volume(finalBody.shape)).toBeCloseTo(expectedVolume, 4);

      // Orientation proof: a short probe cylinder of radius 1.5 (strictly between the bore and
      // countersink radii) placed just inside the surface must find no material at all, since a
      // correctly-oriented countersink has already opened out past 1.5 well before this depth.
      // A backwards frustum (narrow end at the surface) would still have solid material there.
      const probeCylinder = kernel.cylinder(1.5, 0.05);
      let placedProbe;
      try {
        placedProbe = kernel.placeAlongAxis(probeCylinder, [10, 5, 0.02], [0, 0, 1]);
      } finally {
        kernel.release(probeCylinder);
      }
      try {
        const intersection = kernel.common(finalBody.shape, placedProbe);
        try {
          expect(kernel.volume(intersection)).toBeLessThan(0.01);
        } finally {
          kernel.release(intersection);
        }
      } finally {
        kernel.release(placedProbe);
      }
    } finally {
      kernel.release(finalBody.shape);
    }
  });

  it('adds a rib wall onto a body by fusing an extruded, thickened centerline', () => {
    const ribSketch: CadSketch = {
      id: 'rib-sketch',
      label: 'Rib centerline',
      plane: { kind: 'datum', datumId: 'top-face' },
      entities: [
        { id: 'p1', type: 'point', x: 5, y: 5, construction: false },
        { id: 'p2', type: 'point', x: 15, y: 5, construction: false },
        { id: 'centerline', type: 'line', startPointId: 'p1', endPointId: 'p2', construction: false },
      ],
      constraints: [],
    };

    const project: CadProject = {
      ...createCadProject('Rib fixture'),
      sketches: [ribSketch],
      features: [
        feature({
          id: 'box-1',
          type: 'primitive',
          parameters: { kind: 'box', width: 20, depth: 10, height: 5 },
        }),
        feature({
          id: 'top-face',
          type: 'datum-plane',
          parameters: { basePlane: 'XY', distance: 5 },
        }),
        feature({
          id: 'rib-1',
          type: 'rib',
          dependsOn: ['box-1'],
          parameters: { sketchId: 'rib-sketch', profileEntityIds: ['centerline'], thickness: 2, depth: 3 },
        }),
      ],
      bodies: [{ id: 'body-main', label: 'Plate', featureIds: ['box-1', 'top-face', 'rib-1'], visible: true }],
    };

    const result = evaluateCadFeatures(project, kernel);
    const finalBody = result.bodies[0]!;

    try {
      // The rib wall (length 10, thickness 2, depth 3) sits flush on the box's top face with
      // zero overlap volume, so the fused total is exactly the sum of the two solids.
      const boxVolume = 20 * 10 * 5;
      const ribVolume = 10 * 2 * 3;
      expect(kernel.volume(finalBody.shape)).toBeCloseTo(boxVolume + ribVolume, 6);

      const bounds = kernel.bounds(finalBody.shape);
      expect(bounds.min).toEqual([0, 0, 0]);
      expect(bounds.max[0]).toBeCloseTo(20, 6);
      expect(bounds.max[1]).toBeCloseTo(10, 6);
      expect(bounds.max[2]).toBeCloseTo(8, 6);
    } finally {
      kernel.release(finalBody.shape);
    }
  });
});

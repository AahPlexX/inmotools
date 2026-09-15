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
});

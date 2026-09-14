import { describe, expect, it, vi } from 'vitest';
import type { CadFeature, CadProject } from '../../src/tools/cad/cad-types';
import type { CadKernelShape } from '../../src/tools/cad/kernel-contract';
import {
  evaluateCadFeatures,
  type CadFeatureKernel,
} from '../../src/tools/cad/feature-evaluator';
import { createCadProject } from '../../src/tools/cad/project-engine';
import { buildSketchPath3d } from '../../src/tools/cad/sketch-profile';
import type { CadSketch } from '../../src/tools/cad/sketch-types';

function token(id: string): CadKernelShape {
  return { id } as unknown as CadKernelShape;
}

function circleSketch(id: string, plane: CadSketch['plane'] = { kind: 'origin', plane: 'YZ' }): CadSketch {
  return {
    id,
    label: id,
    plane,
    entities: [
      { id: `${id}-center`, type: 'point', x: 0, y: 0, construction: false },
      { id: `${id}-circle`, type: 'circle', centerPointId: `${id}-center`, radius: 2, construction: false },
    ],
    constraints: [],
  };
}

function pathSketch(): CadSketch {
  return {
    id: 'path',
    label: 'Sweep path',
    plane: { kind: 'origin', plane: 'XY' },
    entities: [
      { id: 'p0', type: 'point', x: 0, y: 0, construction: false },
      { id: 'p1', type: 'point', x: 10, y: 0, construction: false },
      { id: 'p2', type: 'point', x: 10, y: 5, construction: false },
      { id: 'leg-a', type: 'line', startPointId: 'p0', endPointId: 'p1', construction: false },
      { id: 'leg-b', type: 'line', startPointId: 'p1', endPointId: 'p2', construction: false },
    ],
    constraints: [],
  };
}

function feature(id: string, type: CadFeature['type'], parameters: Record<string, unknown>): CadFeature {
  return {
    id,
    label: id,
    type,
    bodyId: 'body-main',
    dependsOn: [],
    topologyRefs: [],
    parameters,
    suppressed: false,
    status: 'dirty',
    diagnostic: null,
  };
}

function project(sketches: CadSketch[], features: CadFeature[]): CadProject {
  return {
    ...createCadProject('Sweep and loft fixture'),
    sketches,
    features,
    bodies: [{ id: 'body-main', label: 'Main body', featureIds: features.map((item) => item.id), visible: true }],
  };
}

describe('CAD exact sweep and loft contracts', () => {
  it('orders a connected open sketch path into deterministic 3D wire edges', () => {
    expect(buildSketchPath3d(pathSketch(), ['leg-b', 'leg-a'])).toEqual({
      edges: [
        { kind: 'line', start: [0, 0, 0], end: [10, 0, 0] },
        { kind: 'line', start: [10, 0, 0], end: [10, 5, 0] },
      ],
    });
  });

  it('evaluates a sweep from a closed sketch wire and a separate open sketch path', () => {
    const profileWire = token('profile-wire');
    const pathWire = token('path-wire');
    const swept = token('swept');
    const wireQueue = [profileWire, pathWire];
    const kernel = {
      profileWire: vi.fn(() => wireQueue.shift()!),
      sweep: vi.fn(() => swept),
      release: vi.fn(),
    } as unknown as CadFeatureKernel;
    const input = project([circleSketch('profile'), pathSketch()], [
      feature('sweep-1', 'sweep', {
        sketchId: 'profile',
        profileEntityIds: ['profile-circle'],
        pathSketchId: 'path',
        pathEntityIds: ['leg-a', 'leg-b'],
      }),
    ]);

    const result = evaluateCadFeatures(input, kernel);

    expect(kernel.profileWire).toHaveBeenCalledTimes(2);
    expect(kernel.profileWire).toHaveBeenNthCalledWith(1, {
      normal: [1, 0, 0],
      edges: [{ kind: 'circle', center: [0, 0, 0], normal: [1, 0, 0], radius: 2 }],
    });
    expect(kernel.profileWire).toHaveBeenNthCalledWith(2, {
      edges: [
        { kind: 'line', start: [0, 0, 0], end: [10, 0, 0] },
        { kind: 'line', start: [10, 0, 0], end: [10, 5, 0] },
      ],
    });
    expect(kernel.sweep).toHaveBeenCalledWith(profileWire, pathWire);
    expect(kernel.release).toHaveBeenCalledWith(pathWire);
    expect(kernel.release).toHaveBeenCalledWith(profileWire);
    expect(kernel.release).not.toHaveBeenCalledWith(swept);
    expect(result.bodies).toEqual([{ bodyId: 'body-main', sourceFeatureId: 'sweep-1', shape: swept }]);
  });

  it('builds loft sections as exact wires and releases every temporary section', () => {
    const sectionA = token('section-a');
    const sectionB = token('section-b');
    const lofted = token('lofted');
    const sectionQueue = [sectionA, sectionB];
    const kernel = {
      profileWire: vi.fn(() => sectionQueue.shift()!),
      loft: vi.fn(() => lofted),
      release: vi.fn(),
    } as unknown as CadFeatureKernel;
    const input = project([
      circleSketch('section-a', { kind: 'origin', plane: 'XY' }),
      circleSketch('section-b', { kind: 'origin', plane: 'XZ' }),
    ], [
      feature('loft-1', 'loft', {
        solid: true,
        sections: [
          { sketchId: 'section-a', profileEntityIds: ['section-a-circle'] },
          { sketchId: 'section-b', profileEntityIds: ['section-b-circle'] },
        ],
      }),
    ]);

    const result = evaluateCadFeatures(input, kernel);

    expect(kernel.profileWire).toHaveBeenCalledTimes(2);
    expect(kernel.loft).toHaveBeenCalledWith([sectionA, sectionB], true);
    expect(kernel.release).toHaveBeenCalledWith(sectionA);
    expect(kernel.release).toHaveBeenCalledWith(sectionB);
    expect(kernel.release).not.toHaveBeenCalledWith(lofted);
    expect(result.bodies).toEqual([{ bodyId: 'body-main', sourceFeatureId: 'loft-1', shape: lofted }]);
  });
});

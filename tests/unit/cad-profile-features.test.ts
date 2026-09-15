import { describe, expect, it, vi } from 'vitest';
import type { CadFeature, CadProject } from '../../src/tools/cad/cad-types';
import type { CadKernelShape } from '../../src/tools/cad/kernel-contract';
import type { CadSketch } from '../../src/tools/cad/sketch-types';
import {
  CadFeatureEvaluationError,
  evaluateCadFeatures,
  type CadFeatureKernel,
} from '../../src/tools/cad/feature-evaluator';
import { createCadProject } from '../../src/tools/cad/project-engine';

function token(id: string): CadKernelShape {
  return { id } as unknown as CadKernelShape;
}

function rectangleSketch(): CadSketch {
  return {
    id: 'sketch-1',
    label: 'Profile',
    plane: { kind: 'origin', plane: 'XY' },
    entities: [
      { id: 'p1', type: 'point', x: 5, y: 0, construction: false },
      { id: 'p2', type: 'point', x: 15, y: 0, construction: false },
      { id: 'p3', type: 'point', x: 15, y: 10, construction: false },
      { id: 'p4', type: 'point', x: 5, y: 10, construction: false },
      { id: 'a1', type: 'point', x: 0, y: 0, construction: true },
      { id: 'a2', type: 'point', x: 0, y: 10, construction: true },
      { id: 'bottom', type: 'line', startPointId: 'p1', endPointId: 'p2', construction: false },
      { id: 'right', type: 'line', startPointId: 'p2', endPointId: 'p3', construction: false },
      { id: 'top', type: 'line', startPointId: 'p3', endPointId: 'p4', construction: false },
      { id: 'left', type: 'line', startPointId: 'p4', endPointId: 'p1', construction: false },
      { id: 'axis', type: 'line', startPointId: 'a1', endPointId: 'a2', construction: true },
    ],
    constraints: [],
  };
}

function feature(
  id: string,
  type: CadFeature['type'],
  parameters: Record<string, unknown>,
  dependsOn: string[] = [],
): CadFeature {
  return {
    id,
    label: id,
    type,
    bodyId: 'body-main',
    dependsOn,
    topologyRefs: [],
    parameters,
    suppressed: false,
    status: 'dirty',
    diagnostic: null,
  };
}

function circleSketch(): CadSketch {
  return {
    id: 'sketch-circle',
    label: 'Hole profile',
    plane: { kind: 'origin', plane: 'XY' },
    entities: [
      { id: 'center', type: 'point', x: 10, y: 5, construction: false },
      { id: 'circle', type: 'circle', centerPointId: 'center', radius: 2, construction: false },
    ],
    constraints: [],
  };
}

function project(featureItem: CadFeature): CadProject {
  return {
    ...createCadProject('Profile feature fixture'),
    sketches: [rectangleSketch()],
    features: [featureItem],
    bodies: [{ id: 'body-main', label: 'Main body', featureIds: [featureItem.id], visible: true }],
  };
}

function datumPlaneFeature(id: string, basePlane: string, distance: number): CadFeature {
  return feature(id, 'datum-plane', { basePlane, distance });
}

function kernelFixture() {
  const profile = token('profile');
  const result = token('result');
  const kernel = {
    profileFace: vi.fn(() => profile),
    extrude: vi.fn(() => result),
    revolve: vi.fn(() => result),
    cut: vi.fn(),
    box: vi.fn(),
    bounds: vi.fn(),
    release: vi.fn(),
  } as unknown as CadFeatureKernel;
  return { kernel, profile, result };
}

const profileEntityIds = ['top', 'bottom', 'left', 'right'];

describe('CAD sketch-driven exact features', () => {
  it('builds a solved sketch profile once and extrudes it along the sketch normal', () => {
    const { kernel, profile, result } = kernelFixture();
    const evaluation = evaluateCadFeatures(project(feature('extrude-1', 'extrude', {
      sketchId: 'sketch-1',
      profileEntityIds,
      distance: 5,
    })), kernel);

    expect(kernel.profileFace).toHaveBeenCalledOnce();
    expect(kernel.profileFace).toHaveBeenCalledWith({
      normal: [0, 0, 1],
      edges: [
        { kind: 'line', start: [5, 0, 0], end: [15, 0, 0] },
        { kind: 'line', start: [15, 0, 0], end: [15, 10, 0] },
        { kind: 'line', start: [15, 10, 0], end: [5, 10, 0] },
        { kind: 'line', start: [5, 10, 0], end: [5, 0, 0] },
      ],
    });
    expect(kernel.extrude).toHaveBeenCalledWith(profile, 5, [0, 0, 1]);
    expect(kernel.release).toHaveBeenCalledWith(profile);
    expect(evaluation.bodies).toEqual([{ bodyId: 'body-main', sourceFeatureId: 'extrude-1', shape: result }]);
  });

  it('revolves the same exact profile around a sketch construction line', () => {
    const { kernel, profile, result } = kernelFixture();
    const evaluation = evaluateCadFeatures(project(feature('revolve-1', 'revolve', {
      sketchId: 'sketch-1',
      profileEntityIds,
      axisLineId: 'axis',
      angle: Math.PI * 2,
    })), kernel);

    expect(kernel.revolve).toHaveBeenCalledWith(profile, [0, 0, 0], [0, 10, 0], Math.PI * 2);
    expect(kernel.release).toHaveBeenCalledWith(profile);
    expect(evaluation.bodies).toEqual([{ bodyId: 'body-main', sourceFeatureId: 'revolve-1', shape: result }]);
  });

  it('attributes an open-profile rejection to the feature being rebuilt', () => {
    const { kernel } = kernelFixture();
    let thrown: unknown;
    try {
      evaluateCadFeatures(project(feature('bad-extrude', 'extrude', {
        sketchId: 'sketch-1',
        profileEntityIds: ['bottom', 'right', 'top'],
        distance: 5,
      })), kernel);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CadFeatureEvaluationError);
    expect(thrown).toMatchObject({ featureId: 'bad-extrude' });
    expect((thrown as Error).message).toMatch(/closed profile/i);
    expect(kernel.profileFace).not.toHaveBeenCalled();
  });

  it('extrudes a sketch placed on a resolved offset datum plane', () => {
    const { kernel, profile, result } = kernelFixture();
    const datumSketch: CadSketch = { ...rectangleSketch(), id: 'sketch-datum', plane: { kind: 'datum', datumId: 'datum-1' } };
    const extrude = feature('extrude-1', 'extrude', { sketchId: 'sketch-datum', profileEntityIds, distance: 5 });
    const input: CadProject = {
      ...createCadProject('Datum plane fixture'),
      sketches: [datumSketch],
      features: [datumPlaneFeature('datum-1', 'XY', 12), extrude],
      bodies: [{ id: 'body-main', label: 'Main body', featureIds: ['datum-1', 'extrude-1'], visible: true }],
    };

    const evaluation = evaluateCadFeatures(input, kernel);

    expect(kernel.profileFace).toHaveBeenCalledWith({
      normal: [0, 0, 1],
      edges: [
        { kind: 'line', start: [5, 0, 12], end: [15, 0, 12] },
        { kind: 'line', start: [15, 0, 12], end: [15, 10, 12] },
        { kind: 'line', start: [15, 10, 12], end: [5, 10, 12] },
        { kind: 'line', start: [5, 10, 12], end: [5, 0, 12] },
      ],
    });
    expect(evaluation.bodies).toEqual([{ bodyId: 'body-main', sourceFeatureId: 'extrude-1', shape: result }]);
  });

  it('attributes an unresolved datum plane reference to the sketch-consuming feature', () => {
    const { kernel } = kernelFixture();
    const datumSketch: CadSketch = { ...rectangleSketch(), id: 'sketch-datum', plane: { kind: 'datum', datumId: 'missing-datum' } };
    const extrude = feature('extrude-1', 'extrude', { sketchId: 'sketch-datum', profileEntityIds, distance: 5 });
    const input: CadProject = {
      ...createCadProject('Missing datum plane fixture'),
      sketches: [datumSketch],
      features: [extrude],
      bodies: [{ id: 'body-main', label: 'Main body', featureIds: ['extrude-1'], visible: true }],
    };

    let thrown: unknown;
    try {
      evaluateCadFeatures(input, kernel);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CadFeatureEvaluationError);
    expect(thrown).toMatchObject({ featureId: 'extrude-1' });
    expect((thrown as Error).message).toMatch(/unresolved datum plane 'missing-datum'/i);
  });

  it('rejects an unsupported datum plane kind instead of guessing an orientation', () => {
    const { kernel } = kernelFixture();
    const input: CadProject = {
      ...createCadProject('Unsupported datum plane kind fixture'),
      sketches: [],
      features: [feature('datum-1', 'datum-plane', { kind: 'angle', basePlane: 'XY', distance: 0 })],
      bodies: [],
    };

    let thrown: unknown;
    try {
      evaluateCadFeatures(input, kernel);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CadFeatureEvaluationError);
    expect(thrown).toMatchObject({ featureId: 'datum-1' });
    expect((thrown as Error).message).toMatch(/only 'offset' is implemented/i);
  });

  it('cuts a blind hole by extruding its circular profile opposite the sketch normal', () => {
    const { kernel, profile } = kernelFixture();
    const box = token('box');
    (kernel.box as ReturnType<typeof vi.fn>).mockReturnValue(box);
    const tool = token('tool');
    const cutResult = token('cut-result');
    (kernel.extrude as ReturnType<typeof vi.fn>).mockReturnValue(tool);
    (kernel.cut as ReturnType<typeof vi.fn>).mockReturnValue(cutResult);

    const input: CadProject = {
      ...createCadProject('Hole fixture'),
      sketches: [circleSketch()],
      features: [
        feature('box-1', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
        feature('hole-1', 'hole', { sketchId: 'sketch-circle', profileEntityIds: ['circle'], depth: 3 }, ['box-1']),
      ],
      bodies: [{ id: 'body-main', label: 'Main body', featureIds: ['box-1', 'hole-1'], visible: true }],
    };

    const evaluation = evaluateCadFeatures(input, kernel);

    expect(kernel.extrude).toHaveBeenCalledWith(profile, 3, [0, 0, -1]);
    expect(kernel.cut).toHaveBeenCalledWith(box, tool);
    expect(kernel.release).toHaveBeenCalledWith(tool);
    expect(evaluation.bodies).toEqual([{ bodyId: 'body-main', sourceFeatureId: 'hole-1', shape: cutResult }]);
  });

  it('reverses a hole to bore along the sketch normal when requested', () => {
    const { kernel, profile } = kernelFixture();
    (kernel.box as ReturnType<typeof vi.fn>).mockReturnValue(token('box'));
    (kernel.extrude as ReturnType<typeof vi.fn>).mockReturnValue(token('tool'));
    (kernel.cut as ReturnType<typeof vi.fn>).mockReturnValue(token('cut-result'));

    const input: CadProject = {
      ...createCadProject('Reversed hole fixture'),
      sketches: [circleSketch()],
      features: [
        feature('box-1', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
        feature('hole-1', 'hole', { sketchId: 'sketch-circle', profileEntityIds: ['circle'], depth: 3, reversed: true }, ['box-1']),
      ],
      bodies: [{ id: 'body-main', label: 'Main body', featureIds: ['box-1', 'hole-1'], visible: true }],
    };

    evaluateCadFeatures(input, kernel);

    expect(kernel.extrude).toHaveBeenCalledWith(profile, 3, [0, 0, 1]);
  });

  it('sizes a through-all hole from the dependency body bounds instead of a fixed depth', () => {
    const { kernel } = kernelFixture();
    const box = token('box');
    (kernel.box as ReturnType<typeof vi.fn>).mockReturnValue(box);
    (kernel.bounds as ReturnType<typeof vi.fn>).mockReturnValue({ min: [0, 0, 0], max: [20, 10, 5] });
    (kernel.extrude as ReturnType<typeof vi.fn>).mockReturnValue(token('tool'));
    (kernel.cut as ReturnType<typeof vi.fn>).mockReturnValue(token('cut-result'));

    const input: CadProject = {
      ...createCadProject('Through-all hole fixture'),
      sketches: [circleSketch()],
      features: [
        feature('box-1', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
        feature('hole-1', 'hole', { sketchId: 'sketch-circle', profileEntityIds: ['circle'], throughAll: true }, ['box-1']),
      ],
      bodies: [{ id: 'body-main', label: 'Main body', featureIds: ['box-1', 'hole-1'], visible: true }],
    };

    evaluateCadFeatures(input, kernel);

    expect(kernel.bounds).toHaveBeenCalledWith(box);
    // Diagonal of a 20x10x5 box is sqrt(20^2+10^2+5^2) ~= 22.913; through-all adds a safety margin on top.
    const diagonal = Math.sqrt(20 ** 2 + 10 ** 2 + 5 ** 2);
    const [, calledDepth] = (kernel.extrude as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(calledDepth).toBeGreaterThan(diagonal);
    expect(calledDepth).toBeLessThan(diagonal * 1.5);
  });

  it('rejects a hole with neither depth nor throughAll specified', () => {
    const { kernel } = kernelFixture();
    (kernel.box as ReturnType<typeof vi.fn>).mockReturnValue(token('box'));

    const input: CadProject = {
      ...createCadProject('Underspecified hole fixture'),
      sketches: [circleSketch()],
      features: [
        feature('box-1', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
        feature('hole-1', 'hole', { sketchId: 'sketch-circle', profileEntityIds: ['circle'] }, ['box-1']),
      ],
      bodies: [{ id: 'body-main', label: 'Main body', featureIds: ['box-1', 'hole-1'], visible: true }],
    };

    let thrown: unknown;
    try {
      evaluateCadFeatures(input, kernel);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CadFeatureEvaluationError);
    expect(thrown).toMatchObject({ featureId: 'hole-1' });
    expect((thrown as Error).message).toMatch(/depth.*throughAll|throughAll.*depth/i);
  });
});

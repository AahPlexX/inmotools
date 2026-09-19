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

function lineSketch(): CadSketch {
  return {
    id: 'sketch-line',
    label: 'Rib centerline',
    plane: { kind: 'origin', plane: 'XY' },
    entities: [
      { id: 'p1', type: 'point', x: 0, y: 5, construction: false },
      { id: 'p2', type: 'point', x: 20, y: 5, construction: false },
      { id: 'centerline', type: 'line', startPointId: 'p1', endPointId: 'p2', construction: false },
      { id: 'c1', type: 'point', x: 10, y: 5, construction: false },
      { id: 'arc-centerline', type: 'arc', centerPointId: 'c1', startPointId: 'p1', endPointId: 'p2', clockwise: false, construction: false },
    ],
    constraints: [],
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
    fuse: vi.fn(),
    cone: vi.fn(),
    placeAlongAxis: vi.fn(),
    box: vi.fn(),
    bounds: vi.fn(),
    release: vi.fn(),
  } as unknown as CadFeatureKernel;
  return { kernel, profile, result };
}

function circleSketchWithCounterbore(): CadSketch {
  const base = circleSketch();
  return {
    ...base,
    entities: [
      ...base.entities,
      { id: 'cb-circle', type: 'circle', centerPointId: 'center', radius: 4, construction: false },
    ],
  };
}

function circleSketchWithCountersink(): CadSketch {
  const base = circleSketch();
  return {
    ...base,
    entities: [
      ...base.entities,
      { id: 'cs-circle', type: 'circle', centerPointId: 'center', radius: 4, construction: false },
    ],
  };
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
    expect((thrown as Error).message).toMatch(/only 'offset' and 'three-point' are implemented/i);
  });

  it('rejects a three-point datum plane whose points are collinear instead of guessing an orientation', () => {
    const { kernel } = kernelFixture();
    const input: CadProject = {
      ...createCadProject('Collinear three-point datum plane fixture'),
      sketches: [],
      features: [feature('datum-1', 'datum-plane', {
        kind: 'three-point', point1: [0, 0, 0], point2: [1, 0, 0], point3: [2, 0, 0],
      })],
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
    expect((thrown as Error).message).toMatch(/collinear/i);
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

  it('fuses a wider shallow counterbore tool with the full-depth bore before cutting', () => {
    const { kernel, profile } = kernelFixture();
    const box = token('box');
    (kernel.box as ReturnType<typeof vi.fn>).mockReturnValue(box);
    const boreTool = token('bore-tool');
    const counterboreTool = token('counterbore-tool');
    const fusedTool = token('fused-tool');
    const cutResult = token('cut-result');
    (kernel.extrude as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(boreTool)
      .mockReturnValueOnce(counterboreTool);
    (kernel.fuse as ReturnType<typeof vi.fn>).mockReturnValue(fusedTool);
    (kernel.cut as ReturnType<typeof vi.fn>).mockReturnValue(cutResult);

    const input: CadProject = {
      ...createCadProject('Counterbore hole fixture'),
      sketches: [circleSketchWithCounterbore()],
      features: [
        feature('box-1', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
        feature('hole-1', 'hole', {
          sketchId: 'sketch-circle',
          profileEntityIds: ['circle'],
          depth: 4,
          counterbore: { profileEntityIds: ['cb-circle'], depth: 1.5 },
        }, ['box-1']),
      ],
      bodies: [{ id: 'body-main', label: 'Main body', featureIds: ['box-1', 'hole-1'], visible: true }],
    };

    const evaluation = evaluateCadFeatures(input, kernel);

    expect(kernel.extrude).toHaveBeenNthCalledWith(1, profile, 4, [0, 0, -1]);
    expect(kernel.extrude).toHaveBeenNthCalledWith(2, profile, 1.5, [0, 0, -1]);
    expect(kernel.fuse).toHaveBeenCalledWith(boreTool, counterboreTool);
    expect(kernel.cut).toHaveBeenCalledWith(box, fusedTool);
    expect(kernel.release).toHaveBeenCalledWith(boreTool);
    expect(kernel.release).toHaveBeenCalledWith(counterboreTool);
    expect(kernel.release).toHaveBeenCalledWith(fusedTool);
    expect(evaluation.bodies).toEqual([{ bodyId: 'body-main', sourceFeatureId: 'hole-1', shape: cutResult }]);
  });

  it('allows a counterbore on a through-all hole without comparing it against a fixed depth', () => {
    const { kernel } = kernelFixture();
    const box = token('box');
    (kernel.box as ReturnType<typeof vi.fn>).mockReturnValue(box);
    (kernel.bounds as ReturnType<typeof vi.fn>).mockReturnValue({ min: [0, 0, 0], max: [20, 10, 5] });
    (kernel.extrude as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(token('bore-tool'))
      .mockReturnValueOnce(token('counterbore-tool'));
    (kernel.fuse as ReturnType<typeof vi.fn>).mockReturnValue(token('fused-tool'));
    (kernel.cut as ReturnType<typeof vi.fn>).mockReturnValue(token('cut-result'));

    const input: CadProject = {
      ...createCadProject('Through-all counterbore fixture'),
      sketches: [circleSketchWithCounterbore()],
      features: [
        feature('box-1', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
        feature('hole-1', 'hole', {
          sketchId: 'sketch-circle',
          profileEntityIds: ['circle'],
          throughAll: true,
          counterbore: { profileEntityIds: ['cb-circle'], depth: 1.5 },
        }, ['box-1']),
      ],
      bodies: [{ id: 'body-main', label: 'Main body', featureIds: ['box-1', 'hole-1'], visible: true }],
    };

    expect(() => evaluateCadFeatures(input, kernel)).not.toThrow();
    expect(kernel.fuse).toHaveBeenCalled();
  });

  it('rejects a counterbore at least as deep as the hole itself', () => {
    const { kernel } = kernelFixture();
    (kernel.box as ReturnType<typeof vi.fn>).mockReturnValue(token('box'));

    const input: CadProject = {
      ...createCadProject('Overdeep counterbore fixture'),
      sketches: [circleSketchWithCounterbore()],
      features: [
        feature('box-1', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
        feature('hole-1', 'hole', {
          sketchId: 'sketch-circle',
          profileEntityIds: ['circle'],
          depth: 3,
          counterbore: { profileEntityIds: ['cb-circle'], depth: 3 },
        }, ['box-1']),
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
    expect((thrown as Error).message).toMatch(/counterbore depth/i);
  });

  it('rejects a counterbore missing profileEntityIds', () => {
    const { kernel } = kernelFixture();
    (kernel.box as ReturnType<typeof vi.fn>).mockReturnValue(token('box'));

    const input: CadProject = {
      ...createCadProject('Malformed counterbore fixture'),
      sketches: [circleSketchWithCounterbore()],
      features: [
        feature('box-1', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
        feature('hole-1', 'hole', {
          sketchId: 'sketch-circle',
          profileEntityIds: ['circle'],
          depth: 3,
          counterbore: { depth: 1 },
        }, ['box-1']),
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
    expect((thrown as Error).message).toMatch(/profileEntityIds/i);
  });

  it('fuses a conical frustum with the full-depth bore for a countersink', () => {
    const { kernel, profile } = kernelFixture();
    const box = token('box');
    (kernel.box as ReturnType<typeof vi.fn>).mockReturnValue(box);
    const boreTool = token('bore-tool');
    const cone = token('cone');
    const placedCone = token('placed-cone');
    const fusedTool = token('fused-tool');
    const cutResult = token('cut-result');
    (kernel.extrude as ReturnType<typeof vi.fn>).mockReturnValueOnce(boreTool);
    (kernel.cone as ReturnType<typeof vi.fn>).mockReturnValue(cone);
    (kernel.placeAlongAxis as ReturnType<typeof vi.fn>).mockReturnValue(placedCone);
    (kernel.fuse as ReturnType<typeof vi.fn>).mockReturnValue(fusedTool);
    (kernel.cut as ReturnType<typeof vi.fn>).mockReturnValue(cutResult);

    const input: CadProject = {
      ...createCadProject('Countersink hole fixture'),
      sketches: [circleSketchWithCountersink()],
      features: [
        feature('box-1', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
        feature('hole-1', 'hole', {
          sketchId: 'sketch-circle',
          profileEntityIds: ['circle'],
          depth: 4,
          countersink: { profileEntityIds: ['cs-circle'], angle: Math.PI / 2 },
        }, ['box-1']),
      ],
      bodies: [{ id: 'body-main', label: 'Main body', featureIds: ['box-1', 'hole-1'], visible: true }],
    };

    const evaluation = evaluateCadFeatures(input, kernel);

    // circle radius 2 (bore) and cs-circle radius 4 (countersink), 90 degree included angle
    // (45 degree half-angle, tan = 1): csDepth = (4 - 2) / 1 = 2.
    expect(kernel.cone).toHaveBeenCalledWith(4, 2, expect.closeTo(2, 10));
    expect(kernel.placeAlongAxis).toHaveBeenCalledWith(cone, [10, 5, 0], [0, 0, -1]);
    expect(kernel.fuse).toHaveBeenCalledWith(boreTool, placedCone);
    expect(kernel.cut).toHaveBeenCalledWith(box, fusedTool);
    expect(kernel.release).toHaveBeenCalledWith(cone);
    expect(kernel.release).toHaveBeenCalledWith(boreTool);
    expect(kernel.release).toHaveBeenCalledWith(placedCone);
    expect(kernel.release).toHaveBeenCalledWith(fusedTool);
    expect(evaluation.bodies).toEqual([{ bodyId: 'body-main', sourceFeatureId: 'hole-1', shape: cutResult }]);
  });

  it('rejects a hole with both a counterbore and a countersink', () => {
    const { kernel } = kernelFixture();
    (kernel.box as ReturnType<typeof vi.fn>).mockReturnValue(token('box'));

    const input: CadProject = {
      ...createCadProject('Conflicting termination fixture'),
      sketches: [{
        ...circleSketchWithCounterbore(),
        entities: [
          ...circleSketchWithCounterbore().entities,
          { id: 'cs-circle', type: 'circle', centerPointId: 'center', radius: 4, construction: false },
        ],
      }],
      features: [
        feature('box-1', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
        feature('hole-1', 'hole', {
          sketchId: 'sketch-circle',
          profileEntityIds: ['circle'],
          depth: 3,
          counterbore: { profileEntityIds: ['cb-circle'], depth: 1 },
          countersink: { profileEntityIds: ['cs-circle'], angle: Math.PI / 2 },
        }, ['box-1']),
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
    expect((thrown as Error).message).toMatch(/counterbore.*countersink|countersink.*counterbore/i);
  });

  it('rejects a countersink diameter no larger than the hole diameter', () => {
    const { kernel } = kernelFixture();
    (kernel.box as ReturnType<typeof vi.fn>).mockReturnValue(token('box'));

    const input: CadProject = {
      ...createCadProject('Undersized countersink fixture'),
      sketches: [{
        ...circleSketchWithCountersink(),
        entities: circleSketchWithCountersink().entities.map((entity) => (
          entity.id === 'cs-circle' ? { ...entity, radius: 2 } : entity
        )),
      }],
      features: [
        feature('box-1', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
        feature('hole-1', 'hole', {
          sketchId: 'sketch-circle',
          profileEntityIds: ['circle'],
          depth: 3,
          countersink: { profileEntityIds: ['cs-circle'], angle: Math.PI / 2 },
        }, ['box-1']),
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
    expect((thrown as Error).message).toMatch(/countersink diameter/i);
  });

  it('rejects a countersink angle outside (0, pi)', () => {
    const { kernel } = kernelFixture();
    (kernel.box as ReturnType<typeof vi.fn>).mockReturnValue(token('box'));

    const input: CadProject = {
      ...createCadProject('Invalid angle countersink fixture'),
      sketches: [circleSketchWithCountersink()],
      features: [
        feature('box-1', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
        feature('hole-1', 'hole', {
          sketchId: 'sketch-circle',
          profileEntityIds: ['circle'],
          depth: 3,
          countersink: { profileEntityIds: ['cs-circle'], angle: Math.PI },
        }, ['box-1']),
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
    expect((thrown as Error).message).toMatch(/angle/i);
  });

  it('rejects a countersink profile that is not a single circle entity', () => {
    const { kernel } = kernelFixture();
    (kernel.box as ReturnType<typeof vi.fn>).mockReturnValue(token('box'));

    const input: CadProject = {
      ...createCadProject('Non-circle countersink fixture'),
      sketches: [{
        ...circleSketch(),
        entities: [...circleSketch().entities, ...rectangleSketch().entities],
      }],
      features: [
        feature('box-1', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
        feature('hole-1', 'hole', {
          sketchId: 'sketch-circle',
          profileEntityIds: ['circle'],
          depth: 3,
          // A closed rectangle is a valid profile, just not a circle - this must fail
          // countersink's own "must be a circle" check, not the earlier closed-loop check.
          countersink: { profileEntityIds: ['top', 'bottom', 'left', 'right'], angle: Math.PI / 2 },
        }, ['box-1']),
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
    expect((thrown as Error).message).toMatch(/circle/i);
  });

  it('rejects a countersink missing profileEntityIds', () => {
    const { kernel } = kernelFixture();
    (kernel.box as ReturnType<typeof vi.fn>).mockReturnValue(token('box'));

    const input: CadProject = {
      ...createCadProject('Malformed countersink fixture'),
      sketches: [circleSketchWithCountersink()],
      features: [
        feature('box-1', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
        feature('hole-1', 'hole', {
          sketchId: 'sketch-circle',
          profileEntityIds: ['circle'],
          depth: 3,
          countersink: { angle: Math.PI / 2 },
        }, ['box-1']),
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
    expect((thrown as Error).message).toMatch(/profileEntityIds/i);
  });

  it('extrudes a thickened wall along a straight centerline and fuses it onto the body', () => {
    const { kernel } = kernelFixture();
    const box = token('box');
    const face = token('rib-face');
    const tool = token('rib-tool');
    const fused = token('fused-body');
    (kernel.box as ReturnType<typeof vi.fn>).mockReturnValue(box);
    (kernel.profileFace as ReturnType<typeof vi.fn>).mockReturnValue(face);
    (kernel.extrude as ReturnType<typeof vi.fn>).mockReturnValue(tool);
    (kernel.fuse as ReturnType<typeof vi.fn>).mockReturnValue(fused);

    const input: CadProject = {
      ...createCadProject('Rib fixture'),
      sketches: [lineSketch()],
      features: [
        feature('box-1', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
        feature('rib-1', 'rib', {
          sketchId: 'sketch-line',
          profileEntityIds: ['centerline'],
          thickness: 2,
          depth: 3,
        }, ['box-1']),
      ],
      bodies: [{ id: 'body-main', label: 'Main body', featureIds: ['box-1', 'rib-1'], visible: true }],
    };

    const evaluation = evaluateCadFeatures(input, kernel);

    // Centerline (0,5,0) -> (20,5,0) on the XY plane, thickness 2 (halfThickness 1): the
    // in-plane perpendicular to the line direction is [0,1,0], so the wall spans y in [4,6].
    expect(kernel.profileFace).toHaveBeenCalledWith({
      normal: [0, 0, 1],
      edges: [
        { kind: 'line', start: [0, 6, 0], end: [20, 6, 0] },
        { kind: 'line', start: [20, 6, 0], end: [20, 4, 0] },
        { kind: 'line', start: [20, 4, 0], end: [0, 4, 0] },
        { kind: 'line', start: [0, 4, 0], end: [0, 6, 0] },
      ],
    });
    expect(kernel.extrude).toHaveBeenCalledWith(face, 3, [0, 0, 1]);
    expect(kernel.fuse).toHaveBeenCalledWith(box, tool);
    expect(kernel.release).toHaveBeenCalledWith(face);
    expect(kernel.release).toHaveBeenCalledWith(tool);
    expect(evaluation.bodies).toEqual([{ bodyId: 'body-main', sourceFeatureId: 'rib-1', shape: fused }]);
  });

  it('reverses a rib to extrude opposite the sketch normal when requested', () => {
    const { kernel } = kernelFixture();
    (kernel.box as ReturnType<typeof vi.fn>).mockReturnValue(token('box'));
    (kernel.profileFace as ReturnType<typeof vi.fn>).mockReturnValue(token('rib-face'));
    (kernel.extrude as ReturnType<typeof vi.fn>).mockReturnValue(token('rib-tool'));
    (kernel.fuse as ReturnType<typeof vi.fn>).mockReturnValue(token('fused-body'));

    const input: CadProject = {
      ...createCadProject('Reversed rib fixture'),
      sketches: [lineSketch()],
      features: [
        feature('box-1', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
        feature('rib-1', 'rib', {
          sketchId: 'sketch-line',
          profileEntityIds: ['centerline'],
          thickness: 2,
          depth: 3,
          reversed: true,
        }, ['box-1']),
      ],
      bodies: [{ id: 'body-main', label: 'Main body', featureIds: ['box-1', 'rib-1'], visible: true }],
    };

    evaluateCadFeatures(input, kernel);

    expect(kernel.extrude).toHaveBeenCalledWith(token('rib-face'), 3, [0, 0, -1]);
  });

  it('rejects a rib centerline referencing more than one entity', () => {
    const { kernel } = kernelFixture();
    (kernel.box as ReturnType<typeof vi.fn>).mockReturnValue(token('box'));

    const input: CadProject = {
      ...createCadProject('Multi-entity rib fixture'),
      sketches: [lineSketch()],
      features: [
        feature('box-1', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
        feature('rib-1', 'rib', {
          sketchId: 'sketch-line',
          profileEntityIds: ['centerline', 'arc-centerline'],
          thickness: 2,
          depth: 3,
        }, ['box-1']),
      ],
      bodies: [{ id: 'body-main', label: 'Main body', featureIds: ['box-1', 'rib-1'], visible: true }],
    };

    let thrown: unknown;
    try {
      evaluateCadFeatures(input, kernel);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CadFeatureEvaluationError);
    expect(thrown).toMatchObject({ featureId: 'rib-1' });
    expect((thrown as Error).message).toMatch(/exactly one/i);
  });

  it('rejects a rib centerline that is not a straight line entity', () => {
    const { kernel } = kernelFixture();
    (kernel.box as ReturnType<typeof vi.fn>).mockReturnValue(token('box'));

    const input: CadProject = {
      ...createCadProject('Arc centerline rib fixture'),
      sketches: [lineSketch()],
      features: [
        feature('box-1', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
        feature('rib-1', 'rib', {
          sketchId: 'sketch-line',
          profileEntityIds: ['arc-centerline'],
          thickness: 2,
          depth: 3,
        }, ['box-1']),
      ],
      bodies: [{ id: 'body-main', label: 'Main body', featureIds: ['box-1', 'rib-1'], visible: true }],
    };

    let thrown: unknown;
    try {
      evaluateCadFeatures(input, kernel);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CadFeatureEvaluationError);
    expect(thrown).toMatchObject({ featureId: 'rib-1' });
    expect((thrown as Error).message).toMatch(/straight line/i);
  });
});

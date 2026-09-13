import { describe, expect, it, vi } from 'vitest';
import type { CadFeature, CadProject } from '../../src/tools/cad/cad-types';
import type { CadKernelShape } from '../../src/tools/cad/kernel-contract';
import {
  CadFeatureEvaluationError,
  evaluateCadFeatures,
  type CadFeatureKernel,
} from '../../src/tools/cad/feature-evaluator';
import { createCadProject } from '../../src/tools/cad/project-engine';

function token(id: string): CadKernelShape {
  return { id } as unknown as CadKernelShape;
}

function feature(
  id: string,
  type: CadFeature['type'],
  parameters: Record<string, unknown>,
  dependsOn: string[] = [],
  suppressed = false,
): CadFeature {
  return {
    id,
    label: id,
    type,
    bodyId: 'body-main',
    dependsOn,
    topologyRefs: [],
    parameters,
    suppressed,
    status: suppressed ? 'suppressed' : 'dirty',
    diagnostic: null,
  };
}

function project(features: CadFeature[]): CadProject {
  return {
    ...createCadProject('Evaluator fixture'),
    features,
    bodies: [{ id: 'body-main', label: 'Main body', featureIds: features.map((item) => item.id), visible: true }],
  };
}

function fakeKernel() {
  const shapes = {
    box: token('box'),
    cylinder: token('cylinder'),
    sphere: token('sphere'),
    cone: token('cone'),
    torus: token('torus'),
    cut: token('cut'),
  };
  const kernel = {
    box: vi.fn(() => shapes.box),
    cylinder: vi.fn(() => shapes.cylinder),
    sphere: vi.fn(() => shapes.sphere),
    cone: vi.fn(() => shapes.cone),
    torus: vi.fn(() => shapes.torus),
    cut: vi.fn(() => shapes.cut),
    fuse: vi.fn(),
    common: vi.fn(),
    section: vi.fn(),
    release: vi.fn(),
  } as unknown as CadFeatureKernel;
  return { kernel, shapes };
}

describe('CAD exact feature evaluator', () => {
  it('evaluates exact primitive parameters into the owning body', () => {
    const { kernel, shapes } = fakeKernel();
    const result = evaluateCadFeatures(project([
      feature('box-1', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
    ]), kernel);

    expect(kernel.box).toHaveBeenCalledWith(20, 10, 5);
    expect(result.bodies).toEqual([{ bodyId: 'body-main', sourceFeatureId: 'box-1', shape: shapes.box }]);
    expect(result.warnings).toEqual([]);
    expect(kernel.release).not.toHaveBeenCalled();
  });

  it('skips suppressed features without constructing native geometry', () => {
    const { kernel } = fakeKernel();
    const result = evaluateCadFeatures(project([
      feature('box-1', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }, [], true),
    ]), kernel);

    expect(result.bodies).toEqual([]);
    expect(kernel.box).not.toHaveBeenCalled();
  });

  it('evaluates boolean dependencies in feature order and releases intermediate native shapes', () => {
    const { kernel, shapes } = fakeKernel();
    const result = evaluateCadFeatures(project([
      feature('box-1', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
      feature('tool-1', 'primitive', { kind: 'cylinder', radius: 2, height: 5 }),
      feature('cut-1', 'boolean', { operation: 'cut' }, ['box-1', 'tool-1']),
    ]), kernel);

    expect(kernel.cut).toHaveBeenCalledWith(shapes.box, shapes.cylinder);
    expect(result.bodies).toEqual([{ bodyId: 'body-main', sourceFeatureId: 'cut-1', shape: shapes.cut }]);
    expect(kernel.release).toHaveBeenCalledTimes(2);
    expect(kernel.release).toHaveBeenCalledWith(shapes.box);
    expect(kernel.release).toHaveBeenCalledWith(shapes.cylinder);
  });

  it('surfaces invalid feature parameters with the failing feature id and releases prior geometry', () => {
    const { kernel, shapes } = fakeKernel();
    const input = project([
      feature('box-1', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
      feature('bad-cylinder', 'primitive', { kind: 'cylinder', radius: 0, height: 5 }),
    ]);

    let thrown: unknown;
    try {
      evaluateCadFeatures(input, kernel);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CadFeatureEvaluationError);
    expect(thrown).toMatchObject({ featureId: 'bad-cylinder' });
    expect((thrown as Error).message).toMatch(/radius/i);
    expect(kernel.release).toHaveBeenCalledWith(shapes.box);
  });
});

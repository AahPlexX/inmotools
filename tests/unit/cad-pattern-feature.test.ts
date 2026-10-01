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

function project(features: CadFeature[]): CadProject {
  return {
    ...createCadProject('Pattern fixture'),
    features,
    bodies: [{ id: 'body-main', label: 'Main body', featureIds: features.map((item) => item.id), visible: true }],
  };
}

function kernelFixture() {
  const box = token('box');
  const kernel = {
    box: vi.fn(() => box),
    translate: vi.fn(),
    rotateAroundAxis: vi.fn(),
    compound: vi.fn(),
    release: vi.fn(),
  } as unknown as CadFeatureKernel;
  return { kernel, box };
}

describe('CAD pattern feature', () => {
  it('translates the seed shape by an increasing multiple of the step vector for a linear pattern', () => {
    const { kernel, box } = kernelFixture();
    const t0 = token('t0');
    const t1 = token('t1');
    const t2 = token('t2');
    const combined = token('combined');
    (kernel.translate as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(t0)
      .mockReturnValueOnce(t1)
      .mockReturnValueOnce(t2);
    (kernel.compound as ReturnType<typeof vi.fn>).mockReturnValue(combined);

    const result = evaluateCadFeatures(project([
      feature('base', 'primitive', { kind: 'box', width: 2, depth: 2, height: 2 }),
      feature('pattern-1', 'pattern', { kind: 'linear', count: 3, step: [5, 0, 0] }, ['base']),
    ]), kernel);

    expect(kernel.translate).toHaveBeenNthCalledWith(1, box, [0, 0, 0]);
    expect(kernel.translate).toHaveBeenNthCalledWith(2, box, [5, 0, 0]);
    expect(kernel.translate).toHaveBeenNthCalledWith(3, box, [10, 0, 0]);
    expect(kernel.compound).toHaveBeenCalledWith([t0, t1, t2]);
    expect(kernel.release).toHaveBeenCalledWith(t0);
    expect(kernel.release).toHaveBeenCalledWith(t1);
    expect(kernel.release).toHaveBeenCalledWith(t2);
    expect(result.bodies).toEqual([{ bodyId: 'body-main', sourceFeatureId: 'pattern-1', shape: combined }]);
  });

  it('rotates the seed shape by an increasing multiple of the angle step for a circular pattern', () => {
    const { kernel, box } = kernelFixture();
    const r0 = token('r0');
    const r1 = token('r1');
    const combined = token('combined');
    (kernel.rotateAroundAxis as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(r0)
      .mockReturnValueOnce(r1);
    (kernel.compound as ReturnType<typeof vi.fn>).mockReturnValue(combined);

    const result = evaluateCadFeatures(project([
      feature('base', 'primitive', { kind: 'box', width: 2, depth: 2, height: 2 }),
      feature('pattern-1', 'pattern', {
        kind: 'circular', count: 2, axisOrigin: [0, 0, 0], axisDirection: [0, 0, 1], angleStep: Math.PI / 2,
      }, ['base']),
    ]), kernel);

    expect(kernel.rotateAroundAxis).toHaveBeenNthCalledWith(1, box, [0, 0, 0], [0, 0, 1], 0);
    expect(kernel.rotateAroundAxis).toHaveBeenNthCalledWith(2, box, [0, 0, 0], [0, 0, 1], Math.PI / 2);
    expect(kernel.compound).toHaveBeenCalledWith([r0, r1]);
    expect(result.bodies).toEqual([{ bodyId: 'body-main', sourceFeatureId: 'pattern-1', shape: combined }]);
  });

  it('uses a reusable datum axis for a circular pattern', () => {
    const { kernel, box } = kernelFixture();
    const r0 = token('r0');
    const r1 = token('r1');
    const combined = token('combined');
    (kernel.rotateAroundAxis as ReturnType<typeof vi.fn>)
      .mockReturnValueOnce(r0)
      .mockReturnValueOnce(r1);
    (kernel.compound as ReturnType<typeof vi.fn>).mockReturnValue(combined);

    const result = evaluateCadFeatures(project([
      feature('axis-1', 'datum-axis', {
        kind: 'two-point',
        point1: [0, 0, 0],
        point2: [0, 0, 10],
      }),
      feature('base', 'primitive', { kind: 'box', width: 2, depth: 2, height: 2 }),
      feature('pattern-1', 'pattern', {
        kind: 'circular',
        count: 2,
        axisFeatureId: 'axis-1',
        angleStep: Math.PI / 2,
      }, ['base']),
    ]), kernel);

    expect(kernel.rotateAroundAxis).toHaveBeenNthCalledWith(1, box, [0, 0, 0], [0, 0, 1], 0);
    expect(kernel.rotateAroundAxis).toHaveBeenNthCalledWith(2, box, [0, 0, 0], [0, 0, 1], Math.PI / 2);
    expect(kernel.compound).toHaveBeenCalledWith([r0, r1]);
    expect(result.bodies).toEqual([{ bodyId: 'body-main', sourceFeatureId: 'pattern-1', shape: combined }]);
  });

  it('rejects a pattern with an unsupported kind', () => {
    const { kernel } = kernelFixture();

    let thrown: unknown;
    try {
      evaluateCadFeatures(project([
        feature('base', 'primitive', { kind: 'box', width: 2, depth: 2, height: 2 }),
        feature('pattern-1', 'pattern', { kind: 'grid', count: 3 }, ['base']),
      ]), kernel);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CadFeatureEvaluationError);
    expect(thrown).toMatchObject({ featureId: 'pattern-1' });
    expect((thrown as Error).message).toMatch(/linear.*circular|circular.*linear/i);
  });

  it('rejects a non-positive or non-integer count', () => {
    const { kernel } = kernelFixture();

    let thrown: unknown;
    try {
      evaluateCadFeatures(project([
        feature('base', 'primitive', { kind: 'box', width: 2, depth: 2, height: 2 }),
        feature('pattern-1', 'pattern', { kind: 'linear', count: 1.5, step: [5, 0, 0] }, ['base']),
      ]), kernel);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CadFeatureEvaluationError);
    expect(thrown).toMatchObject({ featureId: 'pattern-1' });
    expect((thrown as Error).message).toMatch(/positive integer/i);
  });

  it('rejects a linear pattern with an all-zero step vector', () => {
    const { kernel } = kernelFixture();

    let thrown: unknown;
    try {
      evaluateCadFeatures(project([
        feature('base', 'primitive', { kind: 'box', width: 2, depth: 2, height: 2 }),
        feature('pattern-1', 'pattern', { kind: 'linear', count: 3, step: [0, 0, 0] }, ['base']),
      ]), kernel);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CadFeatureEvaluationError);
    expect(thrown).toMatchObject({ featureId: 'pattern-1' });
    expect((thrown as Error).message).toMatch(/non-zero/i);
  });

  it('rejects a circular pattern with a zero angle step', () => {
    const { kernel } = kernelFixture();

    let thrown: unknown;
    try {
      evaluateCadFeatures(project([
        feature('base', 'primitive', { kind: 'box', width: 2, depth: 2, height: 2 }),
        feature('pattern-1', 'pattern', {
          kind: 'circular', count: 3, axisOrigin: [0, 0, 0], axisDirection: [0, 0, 1], angleStep: 0,
        }, ['base']),
      ]), kernel);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CadFeatureEvaluationError);
    expect(thrown).toMatchObject({ featureId: 'pattern-1' });
    expect((thrown as Error).message).toMatch(/non-zero/i);
  });
});

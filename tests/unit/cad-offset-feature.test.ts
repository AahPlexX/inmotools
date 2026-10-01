import { describe, expect, it, vi } from 'vitest';
import type { CadFeature, CadProject } from '../../src/tools/cad/cad-types';
import type { CadKernelShape } from '../../src/tools/cad/kernel-contract';
import { CadFeatureEvaluationError, evaluateCadFeatures, type CadFeatureKernel } from '../../src/tools/cad/feature-evaluator';
import { createCadProject } from '../../src/tools/cad/project-engine';

function token(id: string): CadKernelShape {
  return { id } as unknown as CadKernelShape;
}

function feature(id: string, type: CadFeature['type'], parameters: Record<string, unknown>, dependsOn: string[] = []): CadFeature {
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
    ...createCadProject('Offset fixture'),
    features,
    bodies: [{ id: 'body-main', label: 'Main body', featureIds: features.map((item) => item.id), visible: true }],
  };
}

describe('CAD exact offset feature', () => {
  it('offsets one earlier exact feature by a signed non-zero distance', () => {
    const base = token('base');
    const offset = token('offset');
    const kernel = {
      box: vi.fn(() => base),
      offset: vi.fn(() => offset),
      release: vi.fn(),
    } as unknown as CadFeatureKernel;

    const result = evaluateCadFeatures(project([
      feature('base', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
      feature('offset', 'offset', { distance: -1.5 }, ['base']),
    ]), kernel);

    expect(kernel.offset).toHaveBeenCalledWith(base, -1.5);
    expect(kernel.release).toHaveBeenCalledWith(base);
    expect(kernel.release).not.toHaveBeenCalledWith(offset);
    expect(result.bodies).toEqual([{ bodyId: 'body-main', sourceFeatureId: 'offset', shape: offset }]);
  });

  it('rejects missing dependencies and zero-distance no-op offsets with feature attribution', () => {
    const kernel = { release: vi.fn() } as unknown as CadFeatureKernel;

    expect(() => evaluateCadFeatures(project([
      feature('offset', 'offset', { distance: 1 }, []),
    ]), kernel)).toThrow(CadFeatureEvaluationError);

    try {
      evaluateCadFeatures(project([
        feature('offset', 'offset', { distance: 0 }, ['missing']),
      ]), kernel);
      throw new Error('Expected offset validation to fail.');
    } catch (error) {
      expect(error).toBeInstanceOf(CadFeatureEvaluationError);
      expect(error).toMatchObject({ featureId: 'offset' });
      expect((error as Error).message).toMatch(/distance/i);
    }
  });
});

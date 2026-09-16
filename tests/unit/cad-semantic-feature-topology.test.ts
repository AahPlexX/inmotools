import { describe, expect, it, vi } from 'vitest';
import type { CadFeature, CadProject } from '../../src/tools/cad/cad-types';
import type { CadKernelShape } from '../../src/tools/cad/kernel-contract';
import type { TopologyCandidate } from '../../src/tools/cad/topology-ref';
import { CadFeatureEvaluationError, evaluateCadFeatures, type CadFeatureKernel } from '../../src/tools/cad/feature-evaluator';
import { createCadProject } from '../../src/tools/cad/project-engine';

function token(id: string): CadKernelShape {
  return { id } as unknown as CadKernelShape;
}

function feature(
  id: string,
  type: CadFeature['type'],
  parameters: Record<string, unknown>,
  dependsOn: string[] = [],
  topologyRefs: CadFeature['topologyRefs'] = [],
): CadFeature {
  return {
    id,
    label: id,
    type,
    bodyId: 'body-main',
    dependsOn,
    topologyRefs,
    parameters,
    suppressed: false,
    status: 'dirty',
    diagnostic: null,
  };
}

function project(features: CadFeature[]): CadProject {
  return {
    ...createCadProject('Semantic topology fixture'),
    features,
    bodies: [{ id: 'body-main', label: 'Main body', featureIds: features.map((item) => item.id), visible: true }],
  };
}

const edgeCandidates: TopologyCandidate[] = [
  {
    id: 'topo:edge:0',
    producerFeatureId: 'base',
    kind: 'edge',
    curveType: 'line',
    centroid: [5, 0, 0],
    length: 10,
    bounds: { min: [0, 0, 0], max: [10, 0, 0] },
  },
  {
    id: 'topo:edge:1',
    producerFeatureId: 'base',
    kind: 'edge',
    curveType: 'line',
    centroid: [10, 5, 0],
    length: 20,
    bounds: { min: [10, 0, 0], max: [10, 20, 0] },
  },
];

const faceCandidates: TopologyCandidate[] = [
  {
    id: 'topo:face:0',
    producerFeatureId: 'base',
    kind: 'face',
    centroid: [10, 5, 5],
    bounds: { min: [0, 0, 5], max: [20, 10, 5] },
  },
  {
    id: 'topo:face:1',
    producerFeatureId: 'base',
    kind: 'face',
    centroid: [10, 5, 0],
    bounds: { min: [0, 0, 0], max: [20, 10, 0] },
  },
];

function topFaceRef(): CadFeature['topologyRefs'][number] {
  return {
    id: 'ref-face-top',
    producerFeatureId: 'base',
    kind: 'face',
    role: 'top-face',
    centroid: [10, 5, 5],
    bounds: { min: [0, 0, 5], max: [20, 10, 5] },
  };
}

function longEdgeRef(): CadFeature['topologyRefs'][number] {
  return {
    id: 'ref-edge-long',
    producerFeatureId: 'base',
    kind: 'edge',
    role: 'outer-long-edge',
    curveType: 'line',
    centroid: [10, 5, 0],
    length: 20,
    bounds: { min: [10, 0, 0], max: [10, 20, 0] },
  };
}

describe('CAD semantic topology feature resolution', () => {
  it('resolves a fillet edge from persisted fingerprints before invoking the exact kernel', () => {
    const base = token('base');
    const filleted = token('filleted');
    const topologyCandidates = vi.fn(() => edgeCandidates);
    const fillet = vi.fn(() => filleted);
    const kernel = {
      box: vi.fn(() => base),
      topologyCandidates,
      fillet,
      release: vi.fn(),
    } as unknown as CadFeatureKernel;

    const result = evaluateCadFeatures(project([
      feature('base', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
      feature('round', 'fillet', { radius: 2 }, ['base'], [longEdgeRef()]),
    ]), kernel);

    expect(topologyCandidates).toHaveBeenCalledWith(base, 'base', 'edge');
    expect(fillet).toHaveBeenCalledWith(base, ['topo:edge:1'], 2);
    expect(kernel.release).toHaveBeenCalledWith(base);
    expect(result.bodies).toEqual([{ bodyId: 'body-main', sourceFeatureId: 'round', shape: filleted }]);
  });

  it('uses the same semantic edge resolver for chamfer rather than persisting edge ordinals', () => {
    const base = token('base');
    const chamfered = token('chamfered');
    const topologyCandidates = vi.fn(() => edgeCandidates);
    const chamfer = vi.fn(() => chamfered);
    const kernel = {
      box: vi.fn(() => base),
      topologyCandidates,
      chamfer,
      release: vi.fn(),
    } as unknown as CadFeatureKernel;

    const result = evaluateCadFeatures(project([
      feature('base', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
      feature('bevel', 'chamfer', { distance: 1.25 }, ['base'], [longEdgeRef()]),
    ]), kernel);

    expect(topologyCandidates).toHaveBeenCalledWith(base, 'base', 'edge');
    expect(chamfer).toHaveBeenCalledWith(base, ['topo:edge:1'], 1.25);
    expect(result.bodies).toEqual([{ bodyId: 'body-main', sourceFeatureId: 'bevel', shape: chamfered }]);
  });

  it('resolves a shell face from persisted fingerprints before invoking the exact kernel', () => {
    const base = token('base');
    const shelled = token('shelled');
    const topologyCandidates = vi.fn(() => faceCandidates);
    const shell = vi.fn(() => shelled);
    const kernel = {
      box: vi.fn(() => base),
      topologyCandidates,
      shell,
      release: vi.fn(),
    } as unknown as CadFeatureKernel;

    const result = evaluateCadFeatures(project([
      feature('base', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
      feature('hollow', 'shell', { thickness: 1 }, ['base'], [topFaceRef()]),
    ]), kernel);

    expect(topologyCandidates).toHaveBeenCalledWith(base, 'base', 'face');
    expect(shell).toHaveBeenCalledWith(base, ['topo:face:0'], 1);
    expect(kernel.release).toHaveBeenCalledWith(base);
    expect(result.bodies).toEqual([{ bodyId: 'body-main', sourceFeatureId: 'hollow', shape: shelled }]);
  });

  it('resolves defeature faces from persisted fingerprints before invoking the exact kernel', () => {
    const base = token('base');
    const defeatured = token('defeatured');
    const topologyCandidates = vi.fn(() => faceCandidates);
    const defeature = vi.fn(() => defeatured);
    const kernel = {
      box: vi.fn(() => base),
      topologyCandidates,
      defeature,
      release: vi.fn(),
    } as unknown as CadFeatureKernel;

    const result = evaluateCadFeatures(project([
      feature('base', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
      feature('clean', 'defeature', {}, ['base'], [topFaceRef()]),
    ]), kernel);

    expect(topologyCandidates).toHaveBeenCalledWith(base, 'base', 'face');
    expect(defeature).toHaveBeenCalledWith(base, ['topo:face:0']);
    expect(kernel.release).toHaveBeenCalledWith(base);
    expect(result.bodies).toEqual([{ bodyId: 'body-main', sourceFeatureId: 'clean', shape: defeatured }]);
  });

  it('resolves a single draft face from persisted fingerprints before invoking the exact kernel', () => {
    const base = token('base');
    const drafted = token('drafted');
    const topologyCandidates = vi.fn(() => faceCandidates);
    const draft = vi.fn(() => drafted);
    const kernel = {
      box: vi.fn(() => base),
      topologyCandidates,
      draft,
      release: vi.fn(),
    } as unknown as CadFeatureKernel;

    const result = evaluateCadFeatures(project([
      feature('base', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
      feature('taper', 'draft', { angle: 0.1, direction: [0, 0, 1] }, ['base'], [topFaceRef()]),
    ]), kernel);

    expect(topologyCandidates).toHaveBeenCalledWith(base, 'base', 'face');
    expect(draft).toHaveBeenCalledWith(base, ['topo:face:0'], 0.1, [0, 0, 1]);
    expect(kernel.release).toHaveBeenCalledWith(base);
    expect(result.bodies).toEqual([{ bodyId: 'body-main', sourceFeatureId: 'taper', shape: drafted }]);
  });

  it('drafts multiple faces sequentially, resolving each against the shape the previous draft produced', () => {
    const base = token('base');
    const afterFirstDraft = token('after-first-draft');
    const afterSecondDraft = token('after-second-draft');
    const topologyCandidates = vi.fn(() => faceCandidates);
    const draft = vi.fn()
      .mockReturnValueOnce(afterFirstDraft)
      .mockReturnValueOnce(afterSecondDraft);
    const kernel = {
      box: vi.fn(() => base),
      topologyCandidates,
      draft,
      release: vi.fn(),
    } as unknown as CadFeatureKernel;
    const secondFaceRef: CadFeature['topologyRefs'][number] = {
      id: 'ref-face-bottom',
      producerFeatureId: 'base',
      kind: 'face',
      role: 'bottom-face',
      centroid: [10, 5, 0],
      bounds: { min: [0, 0, 0], max: [20, 10, 0] },
    };

    const result = evaluateCadFeatures(project([
      feature('base', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
      feature('taper', 'draft', { angle: 0.1, direction: [0, 0, 1] }, ['base'], [topFaceRef(), secondFaceRef]),
    ]), kernel);

    // The second face is resolved against the FIRST draft's own output, not the original
    // shape - re-resolving fingerprints per step is what makes sequential drafting safe at
    // all, since OCCT's raw subshape ordinals aren't stable across an operation like this.
    expect(topologyCandidates).toHaveBeenNthCalledWith(1, base, 'base', 'face');
    expect(topologyCandidates).toHaveBeenNthCalledWith(2, afterFirstDraft, 'base', 'face');
    expect(draft).toHaveBeenNthCalledWith(1, base, ['topo:face:0'], 0.1, [0, 0, 1]);
    expect(draft).toHaveBeenNthCalledWith(2, afterFirstDraft, ['topo:face:1'], 0.1, [0, 0, 1]);
    expect(kernel.release).toHaveBeenCalledWith(afterFirstDraft);
    expect(result.bodies).toEqual([{ bodyId: 'body-main', sourceFeatureId: 'taper', shape: afterSecondDraft }]);
  });

  it('rejects a draft feature with no persisted face references', () => {
    const base = token('base');
    const draft = vi.fn();
    const kernel = {
      box: vi.fn(() => base),
      topologyCandidates: vi.fn(() => faceCandidates),
      draft,
      release: vi.fn(),
    } as unknown as CadFeatureKernel;

    let thrown: unknown;
    try {
      evaluateCadFeatures(project([
        feature('base', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
        feature('taper', 'draft', { angle: 0.1, direction: [0, 0, 1] }, ['base'], []),
      ]), kernel);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CadFeatureEvaluationError);
    expect(thrown).toMatchObject({ featureId: 'taper' });
    expect((thrown as Error).message).toMatch(/at least one/i);
    expect(draft).not.toHaveBeenCalled();
  });

  it('stops an ambiguous topology reference instead of guessing a raw subshape index', () => {
    const base = token('base');
    const topologyCandidates = vi.fn(() => edgeCandidates);
    const fillet = vi.fn();
    const kernel = {
      box: vi.fn(() => base),
      topologyCandidates,
      fillet,
      release: vi.fn(),
    } as unknown as CadFeatureKernel;
    const ambiguousRef: CadFeature['topologyRefs'][number] = {
      id: 'ref-ambiguous',
      producerFeatureId: 'base',
      kind: 'edge',
      role: 'edge',
    };

    let thrown: unknown;
    try {
      evaluateCadFeatures(project([
        feature('base', 'primitive', { kind: 'box', width: 20, depth: 10, height: 5 }),
        feature('round', 'fillet', { radius: 2 }, ['base'], [ambiguousRef]),
      ]), kernel);
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(CadFeatureEvaluationError);
    expect(thrown).toMatchObject({ featureId: 'round' });
    expect((thrown as Error).message).toMatch(/ambiguous/i);
    expect(fillet).not.toHaveBeenCalled();
    expect(kernel.release).toHaveBeenCalledWith(base);
  });
});

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CadKernelShape } from '../../src/tools/cad/kernel-contract';
import { createOcctCadKernelAdapter, type OcctCadKernelAdapter } from '../../src/tools/cad/occt-adapter';

describe('CAD OCCT semantic topology bridge', () => {
  let kernel: OcctCadKernelAdapter;
  let box: CadKernelShape;

  beforeAll(async () => {
    kernel = await createOcctCadKernelAdapter();
    box = kernel.box(20, 10, 5);
  });

  afterAll(() => {
    kernel.dispose();
  });

  it('enumerates serializable edge fingerprints without exposing native handles', () => {
    const candidates = kernel.topologyCandidates(box, 'box-feature', 'edge');

    expect(candidates).toHaveLength(12);
    expect(new Set(candidates.map((candidate) => candidate.id)).size).toBe(12);
    expect(candidates.every((candidate) => candidate.producerFeatureId === 'box-feature')).toBe(true);
    expect(candidates.every((candidate) => candidate.kind === 'edge')).toBe(true);
    expect(candidates.every((candidate) => candidate.curveType === 'line')).toBe(true);
    expect(candidates.every((candidate) => Number.isFinite(candidate.length) && candidate.length! > 0)).toBe(true);
    expect(candidates.every((candidate) => candidate.centroid?.every(Number.isFinite))).toBe(true);
    expect(candidates.every((candidate) => candidate.bounds !== undefined)).toBe(true);
  });

  it('feeds only ephemeral resolved edge ids into a real exact fillet', () => {
    const candidates = kernel.topologyCandidates(box, 'box-feature', 'edge');
    const shortest = [...candidates].sort((left, right) => left.length! - right.length!)[0]!;
    const filleted = kernel.fillet(box, [shortest.id], 1);

    try {
      expect(kernel.volume(filleted)).toBeGreaterThan(0);
      expect(kernel.volume(filleted)).toBeLessThan(1000);
    } finally {
      kernel.release(filleted);
    }
  });
});

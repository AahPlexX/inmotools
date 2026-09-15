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

  it('enumerates serializable face fingerprints and feeds resolved ids into a real exact shell', () => {
    const candidates = kernel.topologyCandidates(box, 'box-feature', 'face');

    expect(candidates).toHaveLength(6);
    expect(candidates.every((candidate) => candidate.kind === 'face')).toBe(true);

    const top = [...candidates].sort((left, right) => right.centroid![2]! - left.centroid![2]!)[0]!;
    const shelled = kernel.shell(box, [top.id], 1);

    try {
      const wallVolume = kernel.volume(shelled);
      expect(wallVolume).toBeGreaterThan(0);
      expect(wallVolume).toBeLessThan(1000);
      // A 1mm-thick open-top shell of a 20x10x5 box: 1000 - (18*8*4) = 424 mm^3.
      expect(wallVolume).toBeCloseTo(1000 - 18 * 8 * 4, 5);
    } finally {
      kernel.release(shelled);
    }
  });

  it('feeds a resolved face id into a real exact draft and changes the solid volume', () => {
    const candidates = kernel.topologyCandidates(box, 'box-feature', 'face');
    const side = [...candidates].sort((left, right) => right.centroid![0]! - left.centroid![0]!)[0]!;
    const drafted = kernel.draft(box, [side.id], 0.1, [0, 0, 1]);

    try {
      const draftedVolume = kernel.volume(drafted);
      expect(Number.isFinite(draftedVolume)).toBe(true);
      expect(draftedVolume).toBeGreaterThan(0);
      expect(draftedVolume).not.toBeCloseTo(1000, 5);
    } finally {
      kernel.release(drafted);
    }
  });

  it('rejects a draft call given more than one resolved face', () => {
    const candidates = kernel.topologyCandidates(box, 'box-feature', 'face');
    const [first, second] = candidates;
    expect(() => kernel.draft(box, [first!.id, second!.id], 0.1, [0, 0, 1])).toThrow(/exactly one face/i);
  });
});

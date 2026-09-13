import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { CadKernelShape } from '../../src/tools/cad/kernel-contract';
import {
  createOcctCadKernelAdapter,
  type OcctCadKernelAdapter,
} from '../../src/tools/cad/occt-adapter';

describe('CAD exact OCCT adapter', () => {
  let kernel: OcctCadKernelAdapter;
  let box: CadKernelShape;

  beforeAll(async () => {
    kernel = await createOcctCadKernelAdapter();
    box = kernel.box(20, 10, 5);
  });

  afterAll(() => {
    kernel.dispose();
  });

  it('creates an analytic 20 × 10 × 5 box with exact engineering queries', () => {
    expect(kernel.volume(box)).toBeCloseTo(1000, 8);
    expect(kernel.area(box)).toBeCloseTo(700, 8);
    expect(kernel.centerOfMass(box)).toEqual([10, 5, 2.5]);
    expect(kernel.bounds(box)).toEqual({ min: [0, 0, 0], max: [20, 10, 5] });

    const mesh = kernel.tessellate(box, { linearDeflection: 0.1, angularDeflection: 0.5 });
    expect(mesh.positions.length).toBeGreaterThan(0);
    expect(mesh.normals.length).toBe(mesh.positions.length);
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(mesh.indices.length % 3).toBe(0);
  });

  it('performs a real OCCT cylindrical cut that reduces exact volume', () => {
    const tool = kernel.cylinder(2, 5);
    const cut = kernel.cut(box, tool);
    const cutVolume = kernel.volume(cut);

    expect(cutVolume).toBeGreaterThan(0);
    expect(cutVolume).toBeLessThan(1000);
  });

  it('round-trips exact geometry through STEP without losing box volume', () => {
    const step = kernel.exportStep([box]);
    expect(step.byteLength).toBeGreaterThan(100);

    const [roundTripped] = kernel.importStep(step);
    expect(roundTripped).toBeDefined();
    expect(kernel.volume(roundTripped!)).toBeCloseTo(1000, 6);
  });

  it('round-trips exact geometry through binary BREP without losing box volume', () => {
    const brep = kernel.exportBrep([box]);
    expect(brep.byteLength).toBeGreaterThan(100);

    const [roundTripped] = kernel.importBrep(brep);
    expect(roundTripped).toBeDefined();
    expect(kernel.volume(roundTripped!)).toBeCloseTo(1000, 8);
  });
});

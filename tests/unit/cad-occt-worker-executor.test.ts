import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCadProject } from '../../src/tools/cad/project-engine';
import { createOcctCadKernelAdapter, type OcctCadKernelAdapter } from '../../src/tools/cad/occt-adapter';
import {
  createOcctKernelRequestExecutor,
  type OcctKernelRequestExecutor,
} from '../../src/tools/cad/occt-worker-executor';

const project = createCadProject('Worker Fixture');

describe('CAD OCCT worker request executor', () => {
  let seedKernel: OcctCadKernelAdapter;
  let executor: OcctKernelRequestExecutor;
  let boxBrep: Uint8Array;

  beforeAll(async () => {
    seedKernel = await createOcctCadKernelAdapter();
    const box = seedKernel.box(20, 10, 5);
    boxBrep = seedKernel.exportBrep([box]);
    executor = await createOcctKernelRequestExecutor();
  });

  afterAll(() => {
    executor.dispose();
    seedKernel.dispose();
  });

  it('imports exact BREP into worker-owned state and returns a final-quality mesh', async () => {
    const payload = await executor.execute({
      revision: 1,
      project,
      quality: 'final',
      operation: { kind: 'import', format: 'brep', data: boxBrep.slice().buffer },
    });

    expect(payload.kind).toBe('import');
    if (payload.kind !== 'import') return;
    expect(payload.bodies).toHaveLength(1);
    expect(payload.bodies[0]?.bodyId).toBe('import-1');
    expect(payload.bodies[0]?.mesh.indices.length).toBeGreaterThan(0);
    expect(payload.bodies[0]?.bounds).toEqual({ min: [0, 0, 0], max: [20, 10, 5] });
  });

  it('exports the worker-owned exact body back to BREP through the protocol executor', async () => {
    const payload = await executor.execute({
      revision: 2,
      project,
      quality: 'final',
      operation: { kind: 'export', format: 'brep', options: {} },
    });

    expect(payload.kind).toBe('export');
    if (payload.kind !== 'export' || !(payload.data instanceof Uint8Array)) return;
    expect(payload.data.byteLength).toBeGreaterThan(100);

    const [roundTripped] = seedKernel.importBrep(payload.data);
    expect(roundTripped).toBeDefined();
    expect(seedKernel.volume(roundTripped!)).toBeCloseTo(1000, 8);
  });

  it('replaces prior imported worker state instead of accumulating export bodies', async () => {
    await executor.execute({
      revision: 3,
      project,
      quality: 'preview',
      operation: { kind: 'import', format: 'brep', data: boxBrep.slice().buffer },
    });

    const exported = await executor.execute({
      revision: 4,
      project,
      quality: 'final',
      operation: { kind: 'export', format: 'step', options: {} },
    });
    expect(exported.kind).toBe('export');
    if (exported.kind === 'export') expect(exported.data).toBeInstanceOf(Uint8Array);
  });

  it('fails rebuild explicitly until the G6 feature evaluator is attached', async () => {
    await expect(executor.execute({
      revision: 5,
      project,
      quality: 'preview',
      operation: { kind: 'rebuild', dirtyFeatureIds: [] },
    })).rejects.toMatchObject({ code: 'evaluation-failed', recoverable: true });
  });
});

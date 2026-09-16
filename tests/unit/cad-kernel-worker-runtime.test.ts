import { describe, expect, it, vi } from 'vitest';
import {
  CadKernelRuntimeError,
  CadKernelWorkerRuntime,
  type CadKernelWorkerRuntimePort,
} from '../../src/tools/cad/kernel-worker-runtime';
import type { CadProject } from '../../src/tools/cad/cad-types';
import type { CadKernelRequest, CadKernelResponse } from '../../src/tools/cad/kernel-contract';

function project(): CadProject {
  return {
    schemaVersion: 1,
    id: 'runtime-project',
    name: 'Runtime fixture',
    metadata: {
      title: '', creator: '', organization: '', description: '', revision: '', partNumber: '', projectNumber: '',
      material: '', rights: '', license: '', tags: [], createdAt: '', modifiedAt: '', custom: {},
    },
    units: { length: 'mm', angle: 'rad' },
    parameters: [], sketches: [], features: [], bodies: [], materials: [], configurations: [], components: [],
    assemblyRelations: [], namedViews: [], snapshots: [], viewport: {}, exportDefaults: {},
  };
}

function request(revision: number): CadKernelRequest {
  return {
    revision,
    project: project(),
    quality: 'final',
    operation: { kind: 'rebuild', dirtyFeatureIds: [] },
  };
}

class FakePort implements CadKernelWorkerRuntimePort {
  posted: Array<{ response: CadKernelResponse; transfer: Transferable[] }> = [];

  postMessage(response: CadKernelResponse, transfer: Transferable[] = []): void {
    this.posted.push({ response, transfer });
  }
}

describe('CAD kernel worker runtime', () => {
  it('rejects malformed requests before lazy kernel initialization', async () => {
    const port = new FakePort();
    const initialize = vi.fn(() => vi.fn());
    const runtime = new CadKernelWorkerRuntime(port, initialize);

    await runtime.handle({ ...request(1), revision: -1 });

    expect(initialize).not.toHaveBeenCalled();
    expect(port.posted[0]?.response).toMatchObject({
      revision: 0,
      ok: false,
      error: { code: 'invalid-request', recoverable: true },
    });
  });

  it('initializes its executor once and echoes each valid request revision', async () => {
    const port = new FakePort();
    const execute = vi.fn(async () => ({ kind: 'rebuild' as const, bodies: [], warnings: [] }));
    const initialize = vi.fn(async () => execute);
    const runtime = new CadKernelWorkerRuntime(port, initialize);

    await runtime.handle(request(4));
    await runtime.handle(request(5));

    expect(initialize).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(port.posted.map((entry) => entry.response.revision)).toEqual([4, 5]);
    expect(port.posted.every((entry) => entry.response.ok)).toBe(true);
  });

  it('preserves explicit initialization capability failures', async () => {
    const port = new FakePort();
    const runtime = new CadKernelWorkerRuntime(port, async () => {
      throw new CadKernelRuntimeError('unsupported-browser', 'Required WebAssembly features are unavailable.', false);
    });

    await runtime.handle(request(8));

    expect(port.posted[0]?.response).toEqual({
      revision: 8,
      ok: false,
      error: {
        code: 'unsupported-browser',
        message: 'Required WebAssembly features are unavailable.',
        recoverable: false,
      },
    });
  });

  it('maps executor failures to the request operation while preserving revision', async () => {
    const port = new FakePort();
    const runtime = new CadKernelWorkerRuntime(port, async () => async () => {
      throw new Error('writer failed');
    });
    const exportRequest: CadKernelRequest = {
      ...request(12),
      operation: { kind: 'export', format: 'step', options: {} },
    };

    await runtime.handle(exportRequest);

    expect(port.posted[0]?.response).toMatchObject({
      revision: 12,
      ok: false,
      error: { code: 'export-failed', message: 'writer failed', recoverable: true },
    });
  });

  it('posts tessellation buffers as transferables exactly once', async () => {
    const port = new FakePort();
    const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
    const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]);
    const indices = new Uint32Array([0, 1, 2]);
    const runtime = new CadKernelWorkerRuntime(port, async () => async () => ({
      kind: 'rebuild' as const,
      warnings: [],
      bodies: [{
        bodyId: 'body-1',
        mesh: { positions, normals, indices },
        bounds: { min: [0, 0, 0], max: [1, 1, 0] },
      }],
    }));

    await runtime.handle(request(15));

    expect(port.posted[0]?.transfer).toEqual([positions.buffer, normals.buffer, indices.buffer]);
  });
});

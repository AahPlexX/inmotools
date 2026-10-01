import { describe, expect, it, vi } from 'vitest';
import { createCadProject } from '../../src/tools/cad/project-engine';
import type { CadKernelRequest, CadKernelResponse } from '../../src/tools/cad/kernel-contract';
import { installCadKernelWorker, type CadKernelWorkerScope } from '../../src/tools/cad/cad.worker';

class FakeWorkerScope implements CadKernelWorkerScope {
  onmessage: ((event: MessageEvent<unknown>) => void) | null = null;
  posted: CadKernelResponse[] = [];

  postMessage(response: CadKernelResponse): void {
    this.posted.push(response);
  }

  async dispatch(request: CadKernelRequest): Promise<void> {
    await this.onmessage?.({ data: request } as MessageEvent<unknown>);
    await Promise.resolve();
    await Promise.resolve();
  }
}

function request(revision: number): CadKernelRequest {
  return {
    revision,
    project: createCadProject('Worker fixture'),
    quality: 'final',
    operation: { kind: 'rebuild', dirtyFeatureIds: [] },
  };
}

const supported = {
  webAssembly: true,
  simd: true,
  tailCalls: true,
  exceptions: true,
} as const;

describe('CAD dedicated browser worker entry', () => {
  it('reports unsupported browsers without initializing the exact kernel executor', async () => {
    const scope = new FakeWorkerScope();
    const createExecutor = vi.fn();

    installCadKernelWorker(scope, {
      probeCapabilities: async () => ({ ...supported, tailCalls: false }),
      createExecutor,
    });

    await scope.dispatch(request(7));

    expect(createExecutor).not.toHaveBeenCalled();
    expect(scope.posted[0]).toMatchObject({
      revision: 7,
      ok: false,
      error: {
        code: 'unsupported-browser',
        recoverable: false,
      },
    });
  });

  it('lazily initializes one executor and forwards later requests through the same worker lifetime', async () => {
    const scope = new FakeWorkerScope();
    const execute = vi.fn(async () => ({ kind: 'rebuild' as const, bodies: [], warnings: [] }));
    const createExecutor = vi.fn(async () => ({ execute, dispose: vi.fn() }));

    installCadKernelWorker(scope, {
      probeCapabilities: async () => supported,
      createExecutor,
    });

    await scope.dispatch(request(10));
    await scope.dispatch(request(11));

    expect(createExecutor).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledTimes(2);
    expect(scope.posted.map((response) => response.revision)).toEqual([10, 11]);
    expect(scope.posted.every((response) => response.ok)).toBe(true);
  });
});

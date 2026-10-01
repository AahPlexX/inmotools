import { describe, expect, it, vi } from 'vitest';
import { CadKernelWorkerClient, type CadKernelWorkerLike } from '../../src/tools/cad/kernel-worker-client';
import type { CadProject } from '../../src/tools/cad/cad-types';
import type { CadKernelResponse } from '../../src/tools/cad/kernel-contract';

function project(): CadProject {
  return {
    schemaVersion: 1,
    id: 'worker-client-project',
    name: 'Worker client fixture',
    metadata: {
      title: '', creator: '', organization: '', description: '', revision: '', partNumber: '', projectNumber: '',
      material: '', rights: '', license: '', tags: [], createdAt: '', modifiedAt: '', custom: {},
    },
    units: { length: 'mm', angle: 'rad' },
    parameters: [], sketches: [], features: [], bodies: [], materials: [], configurations: [], components: [],
    assemblyRelations: [], namedViews: [], snapshots: [], viewport: {}, exportDefaults: {},
  };
}

function response(revision: number): CadKernelResponse {
  return { revision, ok: true, payload: { kind: 'rebuild', bodies: [], warnings: [] } };
}

class FakeWorker implements CadKernelWorkerLike {
  onmessage: ((event: MessageEvent<CadKernelResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  posted: Array<{ message: unknown; transfer: Transferable[] }> = [];
  terminated = false;

  postMessage(message: unknown, transfer: Transferable[] = []): void {
    this.posted.push({ message, transfer });
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(message: CadKernelResponse): void {
    this.onmessage?.({ data: message } as MessageEvent<CadKernelResponse>);
  }
}

describe('CAD kernel worker client', () => {
  it('commits only the latest response from the active worker generation', () => {
    const workers: FakeWorker[] = [];
    const accepted = vi.fn();
    const client = new CadKernelWorkerClient(
      () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
      { onResponse: accepted },
    );

    const first = client.request(project(), 'preview', { kind: 'rebuild', dirtyFeatureIds: [] });
    const second = client.request(project(), 'final', { kind: 'rebuild', dirtyFeatureIds: ['f1'] });
    workers[0]!.emit(response(first.revision));
    workers[0]!.emit(response(second.revision));

    expect(accepted).toHaveBeenCalledTimes(1);
    expect(accepted).toHaveBeenCalledWith(response(second.revision));
  });

  it('hard restart terminates the old worker and rejects every late response from that generation', () => {
    const workers: FakeWorker[] = [];
    const accepted = vi.fn();
    const client = new CadKernelWorkerClient(
      () => {
        const worker = new FakeWorker();
        workers.push(worker);
        return worker;
      },
      { onResponse: accepted },
    );

    const oldRequest = client.request(project(), 'final', { kind: 'rebuild', dirtyFeatureIds: [] });
    const restart = client.restart();
    expect(workers[0]!.terminated).toBe(true);
    expect(workers).toHaveLength(2);
    workers[0]!.emit(response(oldRequest.revision));

    const replacement = client.request(project(), 'final', { kind: 'rebuild', dirtyFeatureIds: [] });
    workers[1]!.emit(response(replacement.revision));

    expect(restart.generation).toBe(1);
    expect(accepted).toHaveBeenCalledTimes(1);
    expect(accepted).toHaveBeenCalledWith(response(replacement.revision));
  });

  it('transfers imported ArrayBuffers without copying and invalidation suppresses the pending result', () => {
    const worker = new FakeWorker();
    const accepted = vi.fn();
    const client = new CadKernelWorkerClient(() => worker, { onResponse: accepted });
    const data = new Uint8Array([1, 2, 3]).buffer;

    const issued = client.request(project(), 'final', { kind: 'import', format: 'brep', data });
    expect(worker.posted[0]?.transfer).toEqual([data]);
    client.invalidate();
    worker.emit({ revision: issued.revision, ok: true, payload: { kind: 'import', bodies: [], warnings: [] } });
    expect(accepted).not.toHaveBeenCalled();
  });

  it('disposal terminates the worker and prevents further requests', () => {
    const worker = new FakeWorker();
    const client = new CadKernelWorkerClient(() => worker, { onResponse: vi.fn() });
    client.dispose();

    expect(worker.terminated).toBe(true);
    expect(() => client.request(project(), 'preview', { kind: 'rebuild', dirtyFeatureIds: [] })).toThrow(/disposed/i);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { GltfWorkerClient } from '../../src/tools/gltf/gltf-worker-client';
import type { GltfOptimizeOptions, GltfOptimizeResult } from '../../src/tools/gltf/gltf-engine';

type FakeReply = { requestId: number; type: string; [key: string]: unknown };

class FakeWorker {
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onerror: ((event: { message?: string }) => void) | null = null;
  onmessageerror: ((event: unknown) => void) | null = null;
  posted: Array<{ requestId: number; bytes: Uint8Array; options: unknown }> = [];
  terminate = vi.fn();
  postMessage(message: { requestId: number; bytes: Uint8Array; options: unknown }) { this.posted.push(message); }
}

let worker: FakeWorker | null = null;
const install = () => { vi.stubGlobal('Worker', class { constructor() { worker = new FakeWorker(); return worker; } }); };
const current = () => { if (!worker) throw new Error('No worker was created.'); return worker; };
const reply = (data: FakeReply) => current().onmessage?.({ data });
const result = (outputBytes = 8): GltfOptimizeResult => ({ bytes: new Uint8Array(outputBytes), inputBytes: 16, outputBytes, before: {} as never, after: {} as never, options: {} as GltfOptimizeOptions, report: {} as never });
const options: GltfOptimizeOptions = { targetRatio: .5, maxTextureDimension: 1024, textureFormat: 'preserve' };

afterEach(() => { vi.unstubAllGlobals(); worker = null; });

describe('GltfWorkerClient', () => {
  it('resolves a completed run and terminates its worker', async () => {
    install();
    const client = new GltfWorkerClient();
    const run = client.run(new Uint8Array([1, 2, 3]), options);
    reply({ requestId: current().posted[0].requestId, type: 'completed', result: result() });
    await expect(run.promise).resolves.toMatchObject({ outputBytes: 8 });
    expect(current().terminate).toHaveBeenCalledOnce();
    client.dispose();
  });

  it('relays progress for the active run only', async () => {
    install();
    const client = new GltfWorkerClient();
    const onProgress = vi.fn();
    const run = client.run(new Uint8Array([1]), options, onProgress);
    const requestId = current().posted[0].requestId;
    reply({ requestId, type: 'progress', value: .4, stage: 'Simplifying' });
    reply({ requestId: requestId + 99, type: 'progress', value: .9, stage: 'Stale' });
    reply({ requestId, type: 'completed', result: result() });
    await run.promise;
    expect(onProgress).toHaveBeenCalledTimes(1);
    expect(onProgress).toHaveBeenCalledWith(.4, 'Simplifying');
    client.dispose();
  });

  it('ignores a late reply that arrives after cancellation', async () => {
    install();
    const client = new GltfWorkerClient();
    const onProgress = vi.fn();
    const run = client.run(new Uint8Array([1]), options, onProgress);
    const requestId = current().posted[0].requestId;
    run.cancel();
    reply({ requestId, type: 'completed', result: result() });
    reply({ requestId, type: 'progress', value: 1, stage: 'Late' });
    await expect(run.promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(onProgress).not.toHaveBeenCalled();
    expect(current().terminate).toHaveBeenCalledOnce();
    client.dispose();
  });

  it('treats cancel after completion as a no-op', async () => {
    install();
    const client = new GltfWorkerClient();
    const run = client.run(new Uint8Array([1]), options);
    reply({ requestId: current().posted[0].requestId, type: 'completed', result: result() });
    await expect(run.promise).resolves.toBeTruthy();
    const terminated = current().terminate.mock.calls.length;
    run.cancel();
    expect(current().terminate.mock.calls.length).toBe(terminated);
    client.dispose();
  });

  it('rejects with the worker error message when the worker fails', async () => {
    install();
    const client = new GltfWorkerClient();
    const run = client.run(new Uint8Array([1]), options);
    current().onerror?.({ message: 'decoder crashed' });
    await expect(run.promise).rejects.toThrow(/decoder crashed/);
    expect(current().terminate).toHaveBeenCalledOnce();
    client.dispose();
  });

  it('rejects when the worker reports an engine error', async () => {
    install();
    const client = new GltfWorkerClient();
    const run = client.run(new Uint8Array([1]), options);
    reply({ requestId: current().posted[0].requestId, type: 'error', message: 'Transformation is blocked.' });
    await expect(run.promise).rejects.toThrow(/Transformation is blocked/);
    client.dispose();
  });

  it('rejects and releases the worker when the message cannot be cloned or posted', async () => {
    vi.stubGlobal('Worker', class { constructor() { const fake = new FakeWorker(); fake.postMessage = vi.fn(() => { throw new Error('clone failed'); }); worker = fake; return fake; } });
    const client = new GltfWorkerClient();
    await expect(client.run(new Uint8Array([1]), options).promise).rejects.toThrow(/clone failed/);
    expect(current().terminate).toHaveBeenCalledOnce();
    client.dispose();
  });

  it('rejects pending work when disposed mid-run', async () => {
    install();
    const client = new GltfWorkerClient();
    const run = client.run(new Uint8Array([1]), options);
    client.dispose();
    await expect(run.promise).rejects.toThrow(/released|canceled/i);
  });

  it('refuses to start a run when the browser has no Worker support', async () => {
    vi.stubGlobal('Worker', undefined);
    const client = new GltfWorkerClient();
    await expect(client.run(new Uint8Array([1]), options).promise).rejects.toThrow(/worker/i);
    expect(() => client.dispose()).not.toThrow();
  });

  it('sends the requested source bytes and a clone-safe options object', async () => {
    install();
    const client = new GltfWorkerClient();
    const source = new Uint8Array([9, 8, 7]);
    const run = client.run(source, options);
    const message = current().posted[0];
    expect(message.options).toStrictEqual({ targetRatio: .5, maxTextureDimension: 1024, textureFormat: 'preserve' });
    reply({ requestId: message.requestId, type: 'completed', result: result() });
    await run.promise;
    expect(Array.from(source)).toEqual([9, 8, 7]);
    client.dispose();
  });
});

import type { GltfOptimizeOptions, GltfOptimizeResult } from './gltf-engine';
import type { GltfRunHandle, GltfWorkerRequest, GltfWorkerResponse } from './gltf-worker-protocol';

const RELEASED = 'The GLB optimization worker has been released.';

/**
 * Owns one optimization worker at a time.
 *
 * Cancellation terminates the worker rather than asking the computation to stop, because the mesh
 * transform is synchronous WebAssembly that cannot observe a message while it runs. A terminated
 * worker can never post again, which is what makes a late reply impossible to accept.
 */
export class GltfWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private disposed = false;
  private pending: (() => void) | null = null;

  run(bytes: Uint8Array, options: GltfOptimizeOptions, onProgress?: (value: number, stage: string) => void): GltfRunHandle {
    if (this.disposed) return { promise: Promise.reject(new Error(RELEASED)), cancel: () => {} };
    if (typeof Worker === 'undefined') {
      return { promise: Promise.reject(new Error('This browser cannot run GLB optimization because it does not support Web Workers.')), cancel: () => {} };
    }
    const requestId = this.nextId++;
    let worker: Worker;
    try { worker = new Worker(new URL('./gltf.worker.ts', import.meta.url), { type: 'module' }); }
    catch (error) { return { promise: Promise.reject(error instanceof Error ? error : new Error('The GLB optimization worker could not start.')), cancel: () => {} }; }
    this.worker = worker;

    let settle: ((outcome: { ok: true; result: GltfOptimizeResult } | { ok: false; error: Error }) => void) | null = null;
    let settled = false;
    const release = () => { if (this.worker === worker) this.worker = null; if (this.pending === cancelPending) this.pending = null; worker.terminate(); };
    const finish = (outcome: { ok: true; result: GltfOptimizeResult } | { ok: false; error: Error }) => {
      if (settled) return;
      settled = true; release(); settle?.(outcome);
    };
    // Disposal must settle an in-flight run, or unmounting the workspace would leave it pending forever.
    const cancelPending = () => finish({ ok: false, error: new Error(RELEASED) });
    this.pending = cancelPending;
    const promise = new Promise<GltfOptimizeResult>((resolve, reject) => {
      settle = (outcome) => { outcome.ok ? resolve(outcome.result) : reject(outcome.error); };
      worker.onmessage = (event: MessageEvent<GltfWorkerResponse>) => {
        const message = event.data;
        if (settled || message?.requestId !== requestId) return;
        if (message.type === 'progress') { onProgress?.(message.value, message.stage); return; }
        if (message.type === 'completed') { finish({ ok: true, result: message.result }); return; }
        finish({ ok: false, error: new Error(message.message || 'GLB optimization failed in the worker.') });
      };
      worker.onerror = (event: ErrorEvent) => finish({ ok: false, error: new Error(event.message || 'The GLB optimization worker stopped unexpectedly.') });
      worker.onmessageerror = () => finish({ ok: false, error: new Error('The GLB optimization worker sent an unreadable message.') });
      try { worker.postMessage({ type: 'optimize', requestId, bytes, options } satisfies GltfWorkerRequest); }
      catch (error) { finish({ ok: false, error: error instanceof Error ? error : new Error('The GLB model could not be sent to the optimization worker.') }); }
    });

    return { promise, cancel: () => finish({ ok: false, error: new DOMException('Optimization canceled.', 'AbortError') }) };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pending?.();
    this.pending = null;
    this.worker?.terminate();
    this.worker = null;
  }
}

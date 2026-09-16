import type { CadKernelWorkerFactory, CadKernelWorkerLike } from './kernel-worker-client';

export interface BrowserCadKernelWorkerOptions {
  /** Test seam; production intentionally uses Vite's literal module-worker pattern below. */
  createWorker?: (url: URL, options: WorkerOptions) => CadKernelWorkerLike;
  /** Explicit capability override for deterministic tests. */
  workerSupported?: boolean;
}

const WORKER_OPTIONS: WorkerOptions = {
  type: 'module',
  name: 'inmotools-cad-kernel',
};

/**
 * Creates the replaceable exact-kernel browser worker. Keeping the production
 * constructor in this literal form allows Vite to discover, split, and rewrite
 * the worker entry and its route-lazy WebAssembly dependencies.
 */
export function createBrowserCadKernelWorker(
  options: BrowserCadKernelWorkerOptions = {},
): CadKernelWorkerLike {
  const workerSupported = options.workerSupported
    ?? (options.createWorker !== undefined || typeof Worker !== 'undefined');

  if (!workerSupported) {
    throw new Error('CAD Studio requires browser workers for the exact geometry kernel.');
  }

  if (options.createWorker) {
    return options.createWorker(new URL('./cad.worker.ts', import.meta.url), WORKER_OPTIONS);
  }

  return new Worker(new URL('./cad.worker.ts', import.meta.url), {
    type: 'module',
    name: 'inmotools-cad-kernel',
  });
}

export function createBrowserCadKernelWorkerFactory(): CadKernelWorkerFactory {
  return () => createBrowserCadKernelWorker();
}

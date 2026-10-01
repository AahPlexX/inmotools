import { substituteFormulaValues } from './table-formula-engine';

type WorkerReply = { readonly id: number; readonly result?: string; readonly error?: string };
type WorkerRequest = { readonly id: number; readonly source: string };

export interface TableFormulaWorkerPort {
  onmessage: ((event: MessageEvent<WorkerReply>) => void) | null;
  onerror: (() => void) | null;
  onmessageerror: (() => void) | null;
  postMessage(message: WorkerRequest): void;
  terminate(): void;
}

export class TableFormulaRunCancelled extends Error {
  constructor() {
    super('The table-formula preparation run was cancelled.');
    this.name = 'TableFormulaRunCancelled';
  }
}

export interface TableFormulaRunner {
  run(source: string): Promise<string>;
  dispose(): void;
}

type WorkerFactory = () => TableFormulaWorkerPort;

let requestCounter = 0;

const browserWorkerFactory = (): TableFormulaWorkerPort =>
  new Worker(new URL('./table-formula.worker.ts', import.meta.url), { type: 'module' }) as unknown as TableFormulaWorkerPort;

// One runner is intended to live for the workspace lifetime. Completed runs
// reuse the same worker, avoiding per-keystroke module startup. If a new source
// arrives while evaluation is still running, the busy worker is terminated so
// obsolete work cannot delay the document the user is actively editing.
export const createTableFormulaRunner = (workerFactory?: WorkerFactory): TableFormulaRunner => {
  let worker: TableFormulaWorkerPort | null = null;
  let active: {
    readonly id: number;
    readonly resolve: (value: string) => void;
    readonly reject: (reason: unknown) => void;
  } | null = null;
  let disposed = false;

  const terminateWorker = (target: TableFormulaWorkerPort | null = worker) => {
    if (!target) return;
    // Detach callbacks before termination. Besides avoiding retained closures,
    // this guarantees a queued callback from a superseded worker cannot act on
    // a later request that happens to be active when the callback is delivered.
    target.onmessage = null;
    target.onerror = null;
    target.onmessageerror = null;
    target.terminate();
    if (worker === target) worker = null;
  };

  const cancelActive = () => {
    if (!active) return;
    const pending = active;
    active = null;
    terminateWorker(worker);
    pending.reject(new TableFormulaRunCancelled());
  };

  const attachWorker = (): TableFormulaWorkerPort => {
    const next = (workerFactory ?? browserWorkerFactory)();
    worker = next;

    next.onmessage = (event) => {
      if (worker !== next || !active || event.data.id !== active.id) return;
      const pending = active;
      active = null;
      if (event.data.error) pending.reject(new Error(event.data.error));
      else if (typeof event.data.result === 'string') pending.resolve(event.data.result);
      else pending.reject(new Error('The table-formula worker returned no result.'));
    };
    next.onerror = () => {
      if (worker !== next || !active) return;
      const pending = active;
      active = null;
      terminateWorker(next);
      pending.reject(new Error('The table-formula worker failed to start.'));
    };
    next.onmessageerror = () => {
      if (worker !== next || !active) return;
      const pending = active;
      active = null;
      terminateWorker(next);
      pending.reject(new Error('The table-formula worker response could not be read.'));
    };

    return next;
  };

  return {
    run(source: string): Promise<string> {
      if (disposed) return Promise.reject(new Error('The table-formula runner has been disposed.'));

      if (active) cancelActive();

      // Keep the previous synchronous behavior for runtimes that do not expose
      // Workers, and for browsers where Worker exists but construction is
      // blocked (for example by policy). A custom injected factory still
      // rejects on construction failure so tests/callers can observe its error.
      if (!workerFactory && typeof Worker === 'undefined') {
        try {
          return Promise.resolve(substituteFormulaValues(source));
        } catch (error) {
          return Promise.reject(error);
        }
      }

      let currentWorker = worker;
      if (!currentWorker) {
        try {
          currentWorker = attachWorker();
        } catch (error) {
          if (workerFactory) return Promise.reject(error);
          try {
            return Promise.resolve(substituteFormulaValues(source));
          } catch (fallbackError) {
            return Promise.reject(fallbackError);
          }
        }
      }

      const id = ++requestCounter;

      return new Promise<string>((resolve, reject) => {
        active = { id, resolve, reject };
        try {
          currentWorker.postMessage({ id, source });
        } catch (error) {
          if (active?.id === id) active = null;
          terminateWorker(currentWorker);
          reject(error);
        }
      });
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      cancelActive();
      terminateWorker(worker);
    },
  };
};

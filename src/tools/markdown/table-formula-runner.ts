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

  const terminateWorker = () => {
    worker?.terminate();
    worker = null;
  };

  const cancelActive = () => {
    if (!active) return;
    const pending = active;
    active = null;
    pending.reject(new TableFormulaRunCancelled());
    terminateWorker();
  };

  const attachWorker = (): TableFormulaWorkerPort => {
    const next = (workerFactory ?? browserWorkerFactory)();
    next.onmessage = (event) => {
      if (!active || event.data.id !== active.id) return;
      const pending = active;
      active = null;
      if (event.data.error) pending.reject(new Error(event.data.error));
      else if (typeof event.data.result === 'string') pending.resolve(event.data.result);
      else pending.reject(new Error('The table-formula worker returned no result.'));
    };
    next.onerror = () => {
      if (!active) return;
      const pending = active;
      active = null;
      terminateWorker();
      pending.reject(new Error('The table-formula worker failed to start.'));
    };
    next.onmessageerror = () => {
      if (!active) return;
      const pending = active;
      active = null;
      terminateWorker();
      pending.reject(new Error('The table-formula worker response could not be read.'));
    };
    worker = next;
    return next;
  };

  return {
    run(source: string): Promise<string> {
      if (disposed) return Promise.reject(new Error('The table-formula runner has been disposed.'));

      if (active) cancelActive();

      // Keep the previous synchronous behavior only for runtimes that do not
      // expose Web Workers (for example non-browser tests or unusual embedded
      // browsers). Normal app execution takes the worker path below.
      if (!workerFactory && typeof Worker === 'undefined') {
        try {
          return Promise.resolve(substituteFormulaValues(source));
        } catch (error) {
          return Promise.reject(error);
        }
      }

      const currentWorker = worker ?? attachWorker();
      const id = ++requestCounter;

      return new Promise<string>((resolve, reject) => {
        active = { id, resolve, reject };
        try {
          currentWorker.postMessage({ id, source });
        } catch (error) {
          active = null;
          terminateWorker();
          reject(error);
        }
      });
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      cancelActive();
      terminateWorker();
    },
  };
};

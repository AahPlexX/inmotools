import type { RegexRunResult } from './regex-types';

const ENGINE = 'Python re · Pyodide · WebAssembly';
const INIT_TIMEOUT_MS = 30_000;
let workerPromise: Promise<Worker> | null = null;
let requestId = 0;
let runQueue: Promise<void> = Promise.resolve();

const resetWorker = (worker?: Worker) => {
  if (worker) worker.terminate();
  workerPromise = null;
};

const getWorker = (): Promise<Worker> => {
  if (workerPromise) return workerPromise;
  workerPromise = new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./python-worker.ts', import.meta.url), { type: 'module' });
    const timer = window.setTimeout(() => {
      resetWorker(worker);
      reject(new Error(`Python runtime initialization exceeded ${INIT_TIMEOUT_MS / 1000} seconds.`));
    }, INIT_TIMEOUT_MS);
    const cleanup = () => {
      window.clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    };
    const onMessage = (event: MessageEvent<{ type: string; error?: string }>) => {
      if (event.data.type === 'ready') { cleanup(); resolve(worker); }
      if (event.data.type === 'init-error') { cleanup(); resetWorker(worker); reject(new Error(event.data.error ?? 'Python runtime failed to initialize.')); }
    };
    const onError = () => { cleanup(); resetWorker(worker); reject(new Error('Python runtime worker failed to initialize.')); };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ type: 'init' });
  });
  return workerPromise;
};

const runOnce = async (pattern: string, flags: string, subject: string, timeoutMs: number): Promise<RegexRunResult> => {
  let worker: Worker;
  try { worker = await getWorker(); } catch (error) {
    return { engine: ENGINE, capability: 'execution', matches: [], durationMs: 0, error: error instanceof Error ? error.message : String(error) };
  }
  return new Promise((resolve) => {
    const id = ++requestId;
    const cleanup = () => {
      window.clearTimeout(timer);
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
    };
    const onMessage = (event: MessageEvent<{ type: string; requestId?: number; result?: RegexRunResult }>) => {
      if (event.data.type !== 'result' || event.data.requestId !== id || !event.data.result) return;
      cleanup();
      resolve(event.data.result);
    };
    const onError = () => {
      cleanup();
      resetWorker(worker);
      resolve({ engine: ENGINE, capability: 'execution', matches: [], durationMs: 0, error: 'Python runtime worker failed during execution.' });
    };
    const timer = window.setTimeout(() => {
      cleanup();
      resetWorker(worker);
      resolve({ engine: ENGINE, capability: 'execution', matches: [], durationMs: timeoutMs, error: `Execution stopped by the ${timeoutMs} ms watchdog target.`, timedOut: true });
    }, timeoutMs);
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    worker.postMessage({ type: 'run', requestId: id, pattern, flags, subject });
  });
};

export const executePythonRegexWithWatchdog = (pattern: string, flags: string, subject: string, timeoutMs = 500): Promise<RegexRunResult> => {
  const task = runQueue.then(() => runOnce(pattern, flags, subject, timeoutMs));
  runQueue = task.then(() => undefined, () => undefined);
  return task;
};

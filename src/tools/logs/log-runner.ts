import { structureLogLines, type LogPatternFlags, type LogScanMode, type StructuredLogs } from './log-engine';

// Worker orchestration for log structuring.
//
// One worker is kept alive across runs. The tool re-structures on every
// debounced edit, and constructing a worker per run paid module load and
// startup each time. An idle worker is reused; a worker is replaced only when
// it cannot be trusted to answer the next request promptly: the deadline
// passed (a runaway pattern may still be spinning inside it), it crashed, its
// reply could not be read, or a run was cancelled while it was still busy
// (the next request would otherwise queue behind work nobody wants).
//
// The deadline exists because a pattern that backtracks catastrophically never
// returns, so waiting for a response that cannot arrive would pin the worker.
// Exceeding it terminates the worker and reports it, which is the only
// actionable outcome available.

export const DEFAULT_TIMEOUT_MS = 4000;

export class LogStructuringTimeout extends Error {
  constructor(readonly timeoutMs: number) {
    // Deliberately describes the deadline rather than asserting a cause. A miss
    // can equally mean a very large input or a slow cold start, and naming
    // backtracking as the reason every time would misdirect the one user whose
    // pattern is fine.
    super(
      `The pattern did not finish within ${Math.round(timeoutMs / 1000)} seconds and was stopped. `
      + 'A pattern that nests quantifiers, such as (a+)+, can take effectively forever on a long line; '
      + 'a very large input can also simply need more time.',
    );
    this.name = 'LogStructuringTimeout';
  }
}

// Cancelling settles the promise instead of stranding it. A promise that never
// settles would make the consumer's freedom from stale writes depend on
// handlers silently never running, which breaks the moment anything awaits a
// cancelled handle.
export class LogStructuringCancelled extends Error {
  constructor() {
    super('The log structuring run was cancelled.');
    this.name = 'LogStructuringCancelled';
  }
}

export const isCancellation = (reason: unknown): reason is LogStructuringCancelled =>
  reason instanceof LogStructuringCancelled;

export interface LogRunHandle {
  readonly promise: Promise<StructuredLogs>;
  cancel(): void;
}

// Correlation ids come from a counter rather than crypto.randomUUID, which is
// undefined outside a secure context - serving a preview build over plain HTTP
// on a LAN address is the everyday case, and a throw here would leave the
// caller believing a run had started.
let requestCounter = 0;

const workersAvailable = (): boolean => typeof Worker !== 'undefined';

interface PooledWorker {
  readonly worker: Worker;
  // Settles the in-flight run as cancelled. Set while a request is
  // outstanding, null while the worker is idle.
  abort: (() => void) | null;
}

let pooled: PooledWorker | null = null;

const retire = (entry: PooledWorker) => {
  entry.worker.terminate();
  if (pooled === entry) pooled = null;
};

const acquireWorker = (): PooledWorker => {
  if (pooled && pooled.abort === null) return pooled;
  // Reached with a busy worker only if a caller started a run without
  // cancelling the previous one. That run is settled as cancelled rather than
  // left pending, and its worker is replaced because it is still occupied.
  pooled?.abort?.();
  const entry: PooledWorker = { worker: new Worker(new URL('./log.worker.ts', import.meta.url), { type: 'module' }), abort: null };
  pooled = entry;
  return entry;
};

/**
 * Terminates the shared worker, settling any in-flight run as cancelled.
 * Called when the workspace unmounts so a closed tool holds no thread.
 */
export function disposeLogStructuringWorker(): void {
  const entry = pooled;
  if (!entry) return;
  if (entry.abort) entry.abort();
  else retire(entry);
}

export function runLogStructuring(
  input: string,
  pattern: string,
  flags: LogPatternFlags,
  mode: LogScanMode = 'line',
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): LogRunHandle {
  // Without a worker the tool would produce nothing at all, which is worse than
  // the main-thread behaviour it replaced. Structuring synchronously restores
  // the old contract, including its exposure to a runaway pattern, and is the
  // same fallback DedupeWorkspace applies.
  if (!workersAvailable()) {
    return {
      promise: (async () => structureLogLines(input, pattern, flags, mode))(),
      cancel: () => undefined,
    };
  }

  const id = `log-${(requestCounter += 1)}`;
  const entry = acquireWorker();
  const { worker } = entry;
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Declared before the promise: the executor runs synchronously and assigns
  // this, so declaring it afterwards would put it in the temporal dead zone at
  // the moment of assignment.
  let cancelRun: () => void = () => undefined;

  const promise = new Promise<StructuredLogs>((resolve, reject) => {
    // `reusable` is true only when the worker answered this request, so it is
    // idle and known to be healthy.
    const finish = (reusable: boolean, act: () => void) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      entry.abort = null;
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      if (!reusable) retire(entry);
      act();
    };

    timer = setTimeout(() => finish(false, () => reject(new LogStructuringTimeout(timeoutMs))), timeoutMs);

    worker.onmessage = (event: MessageEvent<{ id: string; result?: StructuredLogs; error?: string }>) => {
      if (event.data.id !== id) return;
      finish(true, () => {
        if (event.data.error) reject(new Error(event.data.error));
        else if (event.data.result) resolve(event.data.result);
        else reject(new Error('The worker returned no result.'));
      });
    };

    worker.onerror = () => finish(false, () => reject(new Error('The log structuring worker failed to start.')));
    // A row set that cannot be structured-cloned would otherwise hang the run
    // until the deadline with no explanation.
    worker.onmessageerror = () => finish(false, () => reject(new Error('The worker response could not be read.')));

    // Cancelling a run that already settled is a no-op, so an idle worker
    // survives it; cancelling one still in flight replaces the worker.
    cancelRun = () => finish(false, () => reject(new LogStructuringCancelled()));
    entry.abort = cancelRun;
    worker.postMessage({ id, input, pattern, flags, mode });
  });

  return { promise, cancel: () => cancelRun() };
}

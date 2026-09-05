import { structureLogLines, type LogPatternFlags, type LogScanMode, type StructuredLogs } from './log-engine';

// Worker orchestration for log structuring, following the request-correlation
// and terminate-on-completion pattern already used by this catalog's other
// worker-backed tools (see dedupe.worker.ts's caller and diagram-engine.ts).
//
// The addition here is a deadline. A pattern that backtracks catastrophically
// never returns, so waiting for a response that cannot arrive would leak a
// pinned worker per keystroke. Exceeding the deadline terminates the worker and
// reports it, which is the only actionable outcome available.

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
  const worker = new Worker(new URL('./log.worker.ts', import.meta.url), { type: 'module' });
  let settled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Declared before the promise: the executor runs synchronously and assigns
  // this, so declaring it afterwards would put it in the temporal dead zone at
  // the moment of assignment.
  let cancelRun: () => void = () => undefined;

  const promise = new Promise<StructuredLogs>((resolve, reject) => {
    const finish = (act: () => void) => {
      if (settled) return;
      settled = true;
      if (timer !== undefined) clearTimeout(timer);
      worker.terminate();
      act();
    };

    timer = setTimeout(() => finish(() => reject(new LogStructuringTimeout(timeoutMs))), timeoutMs);

    worker.onmessage = (event: MessageEvent<{ id: string; result?: StructuredLogs; error?: string }>) => {
      if (event.data.id !== id) return;
      finish(() => {
        if (event.data.error) reject(new Error(event.data.error));
        else if (event.data.result) resolve(event.data.result);
        else reject(new Error('The worker returned no result.'));
      });
    };

    worker.onerror = () => finish(() => reject(new Error('The log structuring worker failed to start.')));
    // A row set that cannot be structured-cloned would otherwise hang the run
    // until the deadline with no explanation.
    worker.onmessageerror = () => finish(() => reject(new Error('The worker response could not be read.')));

    cancelRun = () => finish(() => reject(new LogStructuringCancelled()));
    worker.postMessage({ id, input, pattern, flags, mode });
  });

  return { promise, cancel: () => cancelRun() };
}

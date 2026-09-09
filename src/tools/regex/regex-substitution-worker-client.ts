export interface ReplacementPreviewResult {
  readonly output: string | null;
  readonly error: string | null;
  readonly durationMs: number;
  readonly timedOut?: boolean;
  readonly cancelled?: boolean;
}

export interface ReplacementPreviewTask {
  readonly promise: Promise<ReplacementPreviewResult>;
  readonly cancel: () => void;
}

let requestId = 0;

export const startEcmaReplacementPreview = (
  pattern: string,
  flags: string,
  subject: string,
  replacement: string,
  timeoutMs = 500,
): ReplacementPreviewTask => {
  const worker = new Worker(new URL('./regex-substitution-worker.ts', import.meta.url), { type: 'module' });
  const id = ++requestId;
  const started = performance.now();
  let settled = false;
  let resolveResult!: (result: ReplacementPreviewResult) => void;

  const promise = new Promise<ReplacementPreviewResult>((resolve) => {
    resolveResult = resolve;
  });

  const finish = (result: ReplacementPreviewResult) => {
    if (settled) return;
    settled = true;
    window.clearTimeout(timer);
    worker.terminate();
    resolveResult(result);
  };

  const timer = window.setTimeout(() => {
    finish({
      output: null,
      error: `Replacement preview stopped by the ${timeoutMs} ms watchdog target.`,
      durationMs: timeoutMs,
      timedOut: true,
    });
  }, timeoutMs);

  worker.onmessage = (event: MessageEvent<{ requestId: number; output: string | null; error: string | null; durationMs: number }>) => {
    if (event.data.requestId !== id) return;
    finish({ output: event.data.output, error: event.data.error, durationMs: event.data.durationMs });
  };

  worker.onerror = () => {
    finish({ output: null, error: 'Replacement preview worker failed to initialize.', durationMs: performance.now() - started });
  };

  worker.postMessage({ requestId: id, pattern, flags, subject, replacement });

  return {
    promise,
    cancel: () => finish({ output: null, error: 'Replacement preview cancelled.', durationMs: performance.now() - started, cancelled: true }),
  };
};

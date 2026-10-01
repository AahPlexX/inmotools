import type { EcmaRegexExecutionOptions } from './regex-engine';
import type { RegexRunResult } from './regex-types';
import { executePythonRegexWithWatchdog } from './python-worker-client';

export type RegexExecutionFlavor = 'ecmascript' | 'pcre2' | 'oniguruma' | 'python';
let requestId = 0;

// Engine startup (a fresh worker plus a WebAssembly load for PCRE2 and
// Oniguruma) is bounded separately from pattern execution. The execution
// watchdog exists to stop runaway patterns; charging startup against it made a
// trivial pattern fail with a watchdog error whenever the device was busy.
export const ENGINE_STARTUP_TIMEOUT_MS = 30_000;

const engineLabel = (flavor: RegexExecutionFlavor) =>
  flavor === 'pcre2' ? 'PCRE2 10.47.5 · WebAssembly' : flavor === 'oniguruma' ? 'Oniguruma · WebAssembly (vscode-oniguruma 2.0.1)' : 'ECMAScript · browser RegExp';

type WorkerReply =
  | { requestId: number; phase: 'executing' }
  | { requestId: number; result: RegexRunResult };

export const executeRegexWithWatchdog = (
  flavor: RegexExecutionFlavor,
  pattern: string,
  flags: string,
  subject: string,
  timeoutMs = 500,
  ecmaOptions?: EcmaRegexExecutionOptions,
): Promise<RegexRunResult> => {
  if (flavor === 'python') return executePythonRegexWithWatchdog(pattern, flags, subject, timeoutMs);
  return new Promise((resolve) => {
    const id = ++requestId;
    const worker = new Worker(new URL('./regex-worker.ts', import.meta.url), { type: 'module' });
    let timer = 0;
    const fail = (error: string, durationMs: number, timedOut = false) => {
      window.clearTimeout(timer);
      worker.terminate();
      resolve({
        engine: engineLabel(flavor),
        capability: 'execution',
        matches: [],
        durationMs,
        startupMs: 0,
        executionMs: durationMs,
        offsetUnit: 'utf16-code-unit',
        error,
        ...(timedOut ? { timedOut: true } : {}),
      });
    };
    timer = window.setTimeout(() => fail(`The ${engineLabel(flavor)} engine did not start within ${ENGINE_STARTUP_TIMEOUT_MS / 1000} seconds.`, 0), ENGINE_STARTUP_TIMEOUT_MS);
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      if (event.data.requestId !== id) return;
      if ('phase' in event.data) {
        // The engine is loaded; only now does the execution watchdog start.
        window.clearTimeout(timer);
        timer = window.setTimeout(() => fail(`Execution stopped by the ${timeoutMs} ms watchdog target.`, timeoutMs, true), timeoutMs);
        return;
      }
      window.clearTimeout(timer);
      worker.terminate();
      resolve({ ...event.data.result, offsetUnit: event.data.result.offsetUnit ?? 'utf16-code-unit' });
    };
    worker.onerror = () => fail('Local regex worker failed to initialize.', 0);
    worker.postMessage({ requestId: id, flavor, pattern, flags, subject, ecmaOptions });
  });
};

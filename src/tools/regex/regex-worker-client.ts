import type { RegexRunResult } from './regex-types';
import { executePythonRegexWithWatchdog } from './python-worker-client';
export type RegexExecutionFlavor = 'ecmascript' | 'pcre2' | 'oniguruma' | 'python';
let requestId = 0;
export const executeRegexWithWatchdog = (flavor: RegexExecutionFlavor, pattern: string, flags: string, subject: string, timeoutMs = 500): Promise<RegexRunResult> => {
  if (flavor === 'python') return executePythonRegexWithWatchdog(pattern, flags, subject, timeoutMs);
  return new Promise((resolve) => {
  const id = ++requestId;
  const worker = new Worker(new URL('./regex-worker.ts', import.meta.url), { type: 'module' });
  const timer = window.setTimeout(() => { worker.terminate(); resolve({ engine: flavor === 'pcre2' ? 'PCRE2 10.47.5 · WebAssembly' : flavor === 'oniguruma' ? 'Oniguruma · WebAssembly (vscode-oniguruma 2.0.1)' : 'ECMAScript · browser RegExp', capability: 'execution', matches: [], durationMs: timeoutMs, error: `Execution stopped by the ${timeoutMs} ms watchdog target.`, timedOut: true }); }, timeoutMs);
  worker.onmessage = (event: MessageEvent<{ requestId: number; result: RegexRunResult }>) => { if (event.data.requestId !== id) return; window.clearTimeout(timer); worker.terminate(); resolve(event.data.result); };
  worker.onerror = () => { window.clearTimeout(timer); worker.terminate(); resolve({ engine: flavor === 'pcre2' ? 'PCRE2 10.47.5 · WebAssembly' : flavor === 'oniguruma' ? 'Oniguruma · WebAssembly (vscode-oniguruma 2.0.1)' : 'ECMAScript · browser RegExp', capability: 'execution', matches: [], durationMs: 0, error: 'Local regex worker failed to initialize.' }); };
  worker.postMessage({ requestId: id, flavor, pattern, flags, subject });
  });
};

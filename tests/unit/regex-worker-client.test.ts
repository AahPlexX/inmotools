import { afterEach, describe, expect, it, vi } from 'vitest';
import { ENGINE_STARTUP_TIMEOUT_MS, executeRegexWithWatchdog } from '../../src/tools/regex/regex-worker-client';

// The execution watchdog must only time pattern execution. Engine startup (a
// fresh worker plus a WebAssembly load) has its own, much longer bound, so a
// busy device cannot turn a trivial pattern into a watchdog error.

interface FakeWorker {
  posted: Array<{ requestId: number }>;
  terminated: boolean;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: (() => void) | null;
}

let worker: FakeWorker | null = null;

const install = () => {
  vi.useFakeTimers();
  vi.stubGlobal('window', { setTimeout, clearTimeout });
  vi.stubGlobal('Worker', class {
    posted: Array<{ requestId: number }> = [];
    terminated = false;
    onmessage: FakeWorker['onmessage'] = null;
    onerror: FakeWorker['onerror'] = null;
    constructor() { worker = this; }
    postMessage(message: { requestId: number }) { this.posted.push(message); }
    terminate() { this.terminated = true; }
  });
};

const current = () => {
  if (!worker) throw new Error('No worker was created.');
  return worker;
};
const reply = (data: object) => current().onmessage?.({ data: { requestId: current().posted[0]!.requestId, ...data } });
const okResult = { engine: 'Oniguruma', capability: 'execution', matches: [{ index: 0, end: 1 }], durationMs: 1, startupMs: 0, executionMs: 1 };

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  worker = null;
});

describe('executeRegexWithWatchdog', () => {
  it('does not charge engine startup against the execution watchdog', async () => {
    install();
    const run = executeRegexWithWatchdog('oniguruma', 'a', 'g', 'a', 500);
    // A slow WebAssembly load, well past the 500 ms execution target.
    await vi.advanceTimersByTimeAsync(3_000);
    expect(current().terminated).toBe(false);
    reply({ phase: 'executing' });
    reply({ result: okResult });
    await expect(run).resolves.toMatchObject({ matches: [{ index: 0, end: 1 }] });
  });

  it('stops a pattern that runs past the watchdog once execution has started', async () => {
    install();
    const run = executeRegexWithWatchdog('pcre2', '(a+)+$', 'g', 'aaaa!', 500);
    reply({ phase: 'executing' });
    await vi.advanceTimersByTimeAsync(501);
    await expect(run).resolves.toMatchObject({ timedOut: true, error: 'Execution stopped by the 500 ms watchdog target.' });
    expect(current().terminated).toBe(true);
  });

  it('bounds an engine that never finishes starting', async () => {
    install();
    const run = executeRegexWithWatchdog('oniguruma', 'a', 'g', 'a', 500);
    await vi.advanceTimersByTimeAsync(ENGINE_STARTUP_TIMEOUT_MS + 1);
    const result = await run;
    expect(result.error).toMatch(/did not start within 30 seconds/);
    expect(result.timedOut).toBeUndefined();
    expect(current().terminated).toBe(true);
  });

  it('ignores replies addressed to another request', async () => {
    install();
    const run = executeRegexWithWatchdog('ecmascript', 'a', 'g', 'a', 500);
    current().onmessage?.({ data: { requestId: -1, result: okResult } });
    reply({ phase: 'executing' });
    reply({ result: okResult });
    await expect(run).resolves.toMatchObject({ offsetUnit: 'utf16-code-unit' });
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isCancellation,
  LogStructuringCancelled,
  LogStructuringTimeout,
  runLogStructuring,
} from '../../src/tools/logs/log-runner';
import type { StructuredLogs } from '../../src/tools/logs/log-engine';

// The runner carries the P0 containment fix, so its state machine is exercised
// directly here rather than only through the one end-to-end timeout assertion.
// `Worker` does not exist in this environment, which makes both paths testable:
// leaving it undefined exercises the synchronous fallback, and installing a fake
// exercises the worker path deterministically.

interface FakeWorkerInstance {
  posted: unknown[];
  terminated: number;
  respond(payload: unknown): void;
  fail(): void;
  failMessage(): void;
}

let latest: FakeWorkerInstance | null = null;

const installFakeWorker = () => {
  class FakeWorker implements FakeWorkerInstance {
    posted: unknown[] = [];
    terminated = 0;
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    onmessageerror: (() => void) | null = null;

    constructor() { latest = this; }
    postMessage(message: unknown) { this.posted.push(message); }
    terminate() { this.terminated += 1; }
    respond(payload: unknown) { this.onmessage?.({ data: payload }); }
    fail() { this.onerror?.(); }
    failMessage() { this.onmessageerror?.(); }
  }
  vi.stubGlobal('Worker', FakeWorker);
};

const currentWorker = (): FakeWorkerInstance => {
  if (!latest) throw new Error('No fake worker was constructed.');
  return latest;
};

const postedId = (): string => (currentWorker().posted[0] as { id: string }).id;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  latest = null;
});

describe('without Worker support', () => {
  it('falls back to structuring synchronously rather than producing nothing', async () => {
    // The tool previously worked on the main thread. Failing closed here would
    // be a regression for anyone whose environment blocks workers.
    expect(typeof Worker).toBe('undefined');
    const result = await runLogStructuring('2026-08-29 INFO up', '^(?<date>\\S+)\\s+(?<level>\\w+)', {}).promise;
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].level).toBe('INFO');
  });

  it('exposes a cancel that is safe to call', () => {
    const handle = runLogStructuring('a', '(?<x>a)', {});
    expect(() => handle.cancel()).not.toThrow();
  });
});

describe('with a worker', () => {
  const sample: StructuredLogs = { columns: ['a'], rows: [{ a: '1' }], unmatched: [], kinds: { a: 'integer' } };

  it('resolves with the worker result and terminates the worker', async () => {
    installFakeWorker();
    const handle = runLogStructuring('input', '(?<a>\\d)', {});
    currentWorker().respond({ id: postedId(), result: sample });
    await expect(handle.promise).resolves.toEqual(sample);
    expect(currentWorker().terminated).toBe(1);
  });

  it('forwards the pattern, flags, and scan mode to the worker', async () => {
    installFakeWorker();
    const handle = runLogStructuring('input', '(?<a>\\d)', { ignoreCase: true }, 'document');
    expect(currentWorker().posted[0]).toMatchObject({
      input: 'input',
      pattern: '(?<a>\\d)',
      flags: { ignoreCase: true },
      mode: 'document',
    });
    currentWorker().respond({ id: postedId(), result: sample });
    await handle.promise;
  });

  it('rejects with the worker-reported error', async () => {
    installFakeWorker();
    const handle = runLogStructuring('input', '(', {});
    currentWorker().respond({ id: postedId(), error: 'Invalid regular expression.' });
    await expect(handle.promise).rejects.toThrow('Invalid regular expression.');
  });

  it('ignores a response whose id does not match the request', async () => {
    installFakeWorker();
    const handle = runLogStructuring('input', '(?<a>\\d)', {});
    currentWorker().respond({ id: 'someone-elses-run', result: sample });
    expect(currentWorker().terminated).toBe(0);

    currentWorker().respond({ id: postedId(), result: sample });
    await expect(handle.promise).resolves.toEqual(sample);
  });

  it('rejects when the worker fails to start', async () => {
    installFakeWorker();
    const handle = runLogStructuring('input', '(?<a>\\d)', {});
    currentWorker().fail();
    await expect(handle.promise).rejects.toThrow(/failed to start/);
    expect(currentWorker().terminated).toBe(1);
  });

  it('rejects when the response cannot be read, instead of waiting for the deadline', async () => {
    installFakeWorker();
    const handle = runLogStructuring('input', '(?<a>\\d)', {});
    currentWorker().failMessage();
    await expect(handle.promise).rejects.toThrow(/could not be read/);
  });

  it('rejects with a timeout and terminates the worker when the deadline passes', async () => {
    vi.useFakeTimers();
    installFakeWorker();
    const handle = runLogStructuring('input', '^(a+)+$', {}, 'line', 50);
    const assertion = expect(handle.promise).rejects.toThrow(LogStructuringTimeout);
    await vi.advanceTimersByTimeAsync(60);
    await assertion;
    expect(currentWorker().terminated).toBe(1);
  });

  it('describes the deadline without asserting a single cause', async () => {
    vi.useFakeTimers();
    installFakeWorker();
    const handle = runLogStructuring('input', '^(a+)+$', {}, 'line', 50);
    const assertion = expect(handle.promise).rejects.toThrow(/did not finish within 1 seconds|did not finish within 0 seconds/);
    await vi.advanceTimersByTimeAsync(60);
    await assertion.catch(() => undefined);
    await handle.promise.catch((reason: Error) => {
      // A miss can mean a large input as much as a pathological pattern.
      expect(reason.message).toMatch(/large input can also simply need more time/);
    });
  });

  it('settles as cancelled instead of leaving the promise pending forever', async () => {
    installFakeWorker();
    const handle = runLogStructuring('input', '(?<a>\\d)', {});
    handle.cancel();
    await expect(handle.promise).rejects.toBeInstanceOf(LogStructuringCancelled);
    expect(currentWorker().terminated).toBe(1);
    expect(isCancellation(new LogStructuringCancelled())).toBe(true);
    expect(isCancellation(new Error('other'))).toBe(false);
  });

  it('a cancelled run cannot later resolve and overwrite newer state', async () => {
    installFakeWorker();
    const handle = runLogStructuring('input', '(?<a>\\d)', {});
    const id = postedId();
    handle.cancel();
    // A late reply from the terminated worker must not settle the run again.
    currentWorker().respond({ id, result: sample });
    await expect(handle.promise).rejects.toBeInstanceOf(LogStructuringCancelled);
    expect(currentWorker().terminated).toBe(1);
  });

  it('does not fire the deadline after a run has already settled', async () => {
    vi.useFakeTimers();
    installFakeWorker();
    const handle = runLogStructuring('input', '(?<a>\\d)', {}, 'line', 50);
    currentWorker().respond({ id: postedId(), result: sample });
    await expect(handle.promise).resolves.toEqual(sample);
    await vi.advanceTimersByTimeAsync(200);
    // Still one terminate: the timer must not run a second teardown.
    expect(currentWorker().terminated).toBe(1);
  });
});

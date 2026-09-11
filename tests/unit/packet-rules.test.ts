import { afterEach, expect, it, vi } from 'vitest';
import { runPacketRules } from '../../src/tools/hardware/rule-runner';

let latest: FakeWorker;
class FakeWorker {
  onmessage?: (event: { data: unknown }) => void;
  onerror?: () => void;
  onmessageerror?: () => void;
  terminate = vi.fn();
  postMessage = vi.fn();
  constructor() { latest = this; }
}
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it('terminates an unresponsive matcher and rejects instead of leaving the UI pending', async () => {
  vi.useFakeTimers();
  vi.stubGlobal('Worker', FakeWorker);
  const run = runPacketRules([{ id: 1, text: 'a'.repeat(35) + '!', hex: '' }], [{ label: 'bad', pattern: '(a+)+$' }], 50);
  const result = expect(run.promise).rejects.toThrow(/time limit/);
  await vi.advanceTimersByTimeAsync(50);
  await result;
  expect(latest.terminate).toHaveBeenCalledOnce();
});

it('settles cancellation and ignores late responses', async () => {
  vi.stubGlobal('Worker', FakeWorker);
  const run = runPacketRules([], [{ label: 'ok', pattern: 'OK' }]);
  run.cancel();
  latest.onmessage?.({ data: { labels: [[1, 'old']] } });
  await expect(run.promise).rejects.toThrow(/cancelled/);
  expect(latest.terminate).toHaveBeenCalledOnce();
});

it('returns complete labels and releases the worker', async () => {
  vi.stubGlobal('Worker', FakeWorker);
  const run = runPacketRules([], [{ label: 'ok', pattern: 'OK' }]);
  latest.onmessage?.({ data: { labels: [[1, 'ok']] } });
  await expect(run.promise).resolves.toEqual([[1, 'ok']]);
  expect(latest.terminate).toHaveBeenCalledOnce();
});

it('fails closed when workers are unavailable without evaluating a pattern on the UI thread', async () => {
  vi.stubGlobal('Worker', undefined);
  await expect(runPacketRules([{ id: 1, text: 'a'.repeat(35) + '!', hex: '' }], [{ label: 'bad', pattern: '(a+)+$' }]).promise).rejects.toThrow(/requires browser workers/);
});

it('releases a worker when posting input fails', async () => {
  vi.stubGlobal('Worker', class extends FakeWorker { postMessage = vi.fn(() => { throw new Error('clone failed'); }); });
  await expect(runPacketRules([], [{ label: 'ok', pattern: 'OK' }]).promise).rejects.toThrow(/send capture/);
  expect(latest.terminate).toHaveBeenCalledOnce();
});

it('finishes an in-flight snapshot before starting only the newest queued capture', async () => {
  const { createPacketRuleQueue } = await import('../../src/tools/hardware/rule-runner');
  vi.stubGlobal('Worker', FakeWorker);
  const receive = vi.fn();
  const queue = createPacketRuleQueue([{ label: 'ok', pattern: 'OK' }], receive);
  const first = [{ id: 1, text: 'OK', hex: '' }];
  const second = [...first, { id: 2, text: 'OK', hex: '' }];
  const third = [...second, { id: 3, text: 'OK', hex: '' }];
  queue.update(first);
  const firstWorker = latest;
  queue.update(second);
  queue.update(third);
  expect(latest).toBe(firstWorker);
  expect(firstWorker.terminate).not.toHaveBeenCalled();
  firstWorker.onmessage?.({ data: { labels: [[1, 'ok']] } });
  await Promise.resolve();
  expect(receive).toHaveBeenCalledWith(first, [[1, 'ok']], '');
  expect(latest).not.toBe(firstWorker);
  expect(latest.postMessage).toHaveBeenCalledWith({ entries: third, rules: [{ label: 'ok', pattern: 'OK' }] });
  queue.cancel();
});

it('keeps the timeout visible instead of restarting on incoming captures', async () => {
  const { createPacketRuleQueue } = await import('../../src/tools/hardware/rule-runner');
  vi.useFakeTimers();
  vi.stubGlobal('Worker', FakeWorker);
  const receive = vi.fn();
  const queue = createPacketRuleQueue([{ label: 'ok', pattern: 'OK' }], receive);
  queue.update([{ id: 1, text: 'x', hex: '' }]);
  const first = latest;
  await vi.advanceTimersByTimeAsync(1500);
  queue.update([{ id: 2, text: 'y', hex: '' }]);
  expect(latest).toBe(first);
  expect(receive).toHaveBeenCalledWith(expect.any(Array), [], expect.stringContaining('time limit'));
  queue.cancel();
});

it('exports unlabelled capture without workers when all rules are removed', async () => {
  vi.stubGlobal('Worker', undefined);
  const run = runPacketRules([{ id: 1, text: 'data', hex: '' }], []);
  await expect(run.promise).resolves.toEqual([]);
  expect(() => run.cancel()).not.toThrow();
});

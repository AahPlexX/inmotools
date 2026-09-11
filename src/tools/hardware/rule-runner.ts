import type { LineRule } from './packet-engine';

export type RuleEntry = { id: number; text: string; hex: string };
export type RuleLabels = Array<[number, string]>;

export function runPacketRules(entries: readonly RuleEntry[], rules: readonly LineRule[], timeoutMs = 1500) {
  if (!rules.length) return { promise: Promise.resolve<RuleLabels>([]), cancel: () => {} };
  let cancel = () => {};
  const promise = new Promise<RuleLabels>((resolve, reject) => {
    let worker: Worker;
    try {
      worker = new Worker(new URL('./rules.worker.ts', import.meta.url), { type: 'module' });
    } catch {
      reject(new Error('Rule matching requires browser workers. Capture remains available.'));
      return;
    }
    let settled = false;
    const finish = (error?: Error, labels?: RuleLabels) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      worker.terminate();
      if (error) reject(error);
      else resolve(labels ?? []);
    };
    const timer = setTimeout(() => finish(new Error('Rule matching stopped after the time limit. Simplify or remove the rules.')), timeoutMs);
    cancel = () => finish(new Error('Rule matching cancelled.'));
    worker.onmessage = (event: MessageEvent<{ labels?: RuleLabels; error?: string }>) => {
      if (event.data.error) finish(new Error(event.data.error));
      else if (Array.isArray(event.data.labels)) finish(undefined, event.data.labels);
      else finish(new Error('Rule matching returned an unreadable result.'));
    };
    worker.onerror = () => finish(new Error('Rule matching failed. Capture remains available.'));
    worker.onmessageerror = () => finish(new Error('Rule matching returned an unreadable result.'));
    try { worker.postMessage({ entries, rules }); }
    catch { finish(new Error('Could not send capture data for rule matching.')); }
  });
  return { promise, cancel: () => cancel() };
}

// One in-flight job prevents a busy serial stream from perpetually resetting
// the deadline. Only the newest queued snapshot needs to be processed next.
export function createPacketRuleQueue(
  rules: readonly LineRule[],
  receive: (entries: readonly RuleEntry[], labels: RuleLabels, error: string) => void,
) {
  let active = true;
  let failed = false;
  let latest: readonly RuleEntry[] | null = null;
  let completed: readonly RuleEntry[] | null = null;
  let running: ReturnType<typeof runPacketRules> | null = null;
  const start = () => {
    if (!active || failed || running || !latest || latest === completed) return;
    const entries = latest;
    const job = runPacketRules(entries, rules);
    running = job;
    job.promise.then(
      (labels) => {
        if (!active) return;
        completed = entries;
        running = null;
        receive(entries, labels, '');
        start();
      },
      (error: Error) => {
        if (!active) return;
        failed = true;
        running = null;
        receive(entries, [], error.message);
      },
    );
  };
  return {
    update(entries: readonly RuleEntry[]) { latest = entries; start(); },
    cancel() { active = false; running?.cancel(); },
  };
}

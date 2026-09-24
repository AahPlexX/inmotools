import { describe, expect, it } from 'vitest';
import {
  TableFormulaRunCancelled,
  createTableFormulaRunner,
  type TableFormulaWorkerPort,
} from '../../src/tools/markdown/table-formula-runner';

class FakeWorker implements TableFormulaWorkerPort {
  onmessage: ((event: MessageEvent<{ id: number; result?: string; error?: string }>) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  readonly posted: Array<{ id: number; source: string }> = [];
  terminated = false;

  postMessage(message: { id: number; source: string }) {
    this.posted.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  resolveLatest(result: string) {
    const request = this.posted[this.posted.length - 1];
    this.onmessage?.({ data: { id: request.id, result } } as MessageEvent<{ id: number; result: string }>);
  }
}

describe('table formula worker runner', () => {
  it('reuses an idle worker for sequential formula substitutions', async () => {
    const workers: FakeWorker[] = [];
    const runner = createTableFormulaRunner(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });

    const first = runner.run('| A |\n| - |\n| =1+1 |');
    expect(workers).toHaveLength(1);
    workers[0].resolveLatest('| A |\n| - |\n| 2 |');
    await expect(first).resolves.toContain('| 2 |');

    const second = runner.run('| A |\n| - |\n| =2+2 |');
    expect(workers).toHaveLength(1);
    workers[0].resolveLatest('| A |\n| - |\n| 4 |');
    await expect(second).resolves.toContain('| 4 |');

    runner.dispose();
    expect(workers[0].terminated).toBe(true);
  });

  it('cancels stale work by replacing a busy worker before starting the newer source', async () => {
    const workers: FakeWorker[] = [];
    const runner = createTableFormulaRunner(() => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    });

    const stale = runner.run('old source');
    const latest = runner.run('new source');

    expect(workers).toHaveLength(2);
    expect(workers[0].terminated).toBe(true);
    await expect(stale).rejects.toBeInstanceOf(TableFormulaRunCancelled);

    workers[1].resolveLatest('new prepared source');
    await expect(latest).resolves.toBe('new prepared source');

    runner.dispose();
  });
});

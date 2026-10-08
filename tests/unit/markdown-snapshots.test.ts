import { describe, expect, it } from 'vitest';
import {
  AUTO_SNAPSHOT_INTERVAL_MS,
  MAX_SNAPSHOTS,
  recordSnapshot,
  removeDraftSnapshots,
  snapshotsForDraft,
  type SnapshotStore,
} from '../../src/tools/markdown/snapshot-engine';
import type { SnapshotRecord } from '../../src/tools/markdown/markdown-types';

class MemorySnapshotStore implements SnapshotStore {
  records = new Map<string, SnapshotRecord>();
  async list() { return [...this.records.values()]; }
  async save(record: SnapshotRecord) { this.records.set(record.id, record); }
  async remove(ids: readonly string[]) { for (const id of ids) this.records.delete(id); }
}

describe('draft snapshots', () => {
  it('keeps the first version when a second manual save follows', async () => {
    const store = new MemorySnapshotStore();
    await recordSnapshot(store, 'd1', 'Doc', 'first', 'manual', 1000);
    const next = await recordSnapshot(store, 'd1', 'Doc', 'second', 'manual', 1001);
    expect(next.map((snapshot) => snapshot.text)).toEqual(['second', 'first']);
  });

  it('does not store the same text twice in a row', async () => {
    const store = new MemorySnapshotStore();
    await recordSnapshot(store, 'd1', 'Doc', 'same', 'manual', 1000);
    const next = await recordSnapshot(store, 'd1', 'Doc', 'same', 'manual', 2000);
    expect(next).toHaveLength(1);
  });

  it('limits automatic snapshots to one per interval but always keeps manual ones', async () => {
    const store = new MemorySnapshotStore();
    await recordSnapshot(store, 'd1', 'Doc', 'a', 'auto', 1000);
    expect(await recordSnapshot(store, 'd1', 'Doc', 'b', 'auto', 1000 + AUTO_SNAPSHOT_INTERVAL_MS - 1)).toHaveLength(1);
    expect(await recordSnapshot(store, 'd1', 'Doc', 'c', 'auto', 1000 + AUTO_SNAPSHOT_INTERVAL_MS)).toHaveLength(2);
    expect(await recordSnapshot(store, 'd1', 'Doc', 'd', 'manual', 1000 + AUTO_SNAPSHOT_INTERVAL_MS + 1)).toHaveLength(3);
  });

  it('orders versions saved in the same millisecond newest first', async () => {
    const store = new MemorySnapshotStore();
    await recordSnapshot(store, 'd1', 'Doc', 'one', 'manual', 5);
    const next = await recordSnapshot(store, 'd1', 'Doc', 'two', 'manual', 5);
    expect(next[0]?.text).toBe('two');
    expect(snapshotsForDraft([...store.records.values()], 'd1')[0]?.text).toBe('two');
  });

  it('keeps only the newest versions per draft and leaves other drafts alone', async () => {
    const store = new MemorySnapshotStore();
    await recordSnapshot(store, 'other', 'Other', 'keep', 'manual', 1);
    for (let index = 0; index < MAX_SNAPSHOTS + 5; index += 1) {
      await recordSnapshot(store, 'd1', 'Doc', `v${index}`, 'manual', 100 + index);
    }
    const kept = snapshotsForDraft([...store.records.values()], 'd1');
    expect(kept).toHaveLength(MAX_SNAPSHOTS);
    expect(kept[0]?.text).toBe(`v${MAX_SNAPSHOTS + 4}`);
    expect(kept.at(-1)?.text).toBe('v5');
    expect(snapshotsForDraft([...store.records.values()], 'other')).toHaveLength(1);
  });

  it('removes only the versions of the deleted draft', async () => {
    const store = new MemorySnapshotStore();
    await recordSnapshot(store, 'd1', 'Doc', 'x', 'manual', 1);
    await recordSnapshot(store, 'd2', 'Doc', 'y', 'manual', 2);
    await removeDraftSnapshots(store, 'd1');
    expect([...store.records.values()].map((snapshot) => snapshot.draftId)).toEqual(['d2']);
  });
});

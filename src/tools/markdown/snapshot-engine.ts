import { openMarkdownDb, SNAPSHOT_STORE_NAME } from './autosave-engine';
import type { SnapshotRecord } from './markdown-types';

// Earlier versions of a draft. Manual saves always add a version; automatic
// saves add one at most every AUTO_SNAPSHOT_INTERVAL_MS. Identical text is
// never stored twice in a row and each draft keeps its newest MAX_SNAPSHOTS.

export const MAX_SNAPSHOTS = 20;
export const AUTO_SNAPSHOT_INTERVAL_MS = 60_000;

export interface SnapshotStore {
  list(): Promise<SnapshotRecord[]>;
  save(record: SnapshotRecord): Promise<void>;
  remove(ids: readonly string[]): Promise<void>;
}

export type SaveKind = 'manual' | 'auto';

const newestFirst = (a: SnapshotRecord, b: SnapshotRecord): number => b.createdAt - a.createdAt;

export const snapshotsForDraft = (all: readonly SnapshotRecord[], draftId: string): SnapshotRecord[] =>
  all.filter((snapshot) => snapshot.draftId === draftId).sort(newestFirst);

export const shouldSnapshot = (
  existing: readonly SnapshotRecord[],
  text: string,
  kind: SaveKind,
  now: number,
): boolean => {
  const latest = existing[0];
  if (!latest) return true;
  if (latest.text === text) return false;
  return kind === 'manual' || now - latest.createdAt >= AUTO_SNAPSHOT_INTERVAL_MS;
};

export const createSnapshotRecord = (
  draftId: string,
  name: string,
  text: string,
  now: number,
  existing: readonly SnapshotRecord[],
): SnapshotRecord => ({
  id: typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `snapshot-${now}-${Math.random().toString(36).slice(2)}`,
  draftId,
  name,
  text,
  createdAt: Math.max(now, (existing[0]?.createdAt ?? 0) + 1),
});

export const snapshotsToPrune = (snapshots: readonly SnapshotRecord[]): string[] =>
  [...snapshots].sort(newestFirst).slice(MAX_SNAPSHOTS).map((snapshot) => snapshot.id);

// Records a version of the draft when the rules allow it and returns the
// draft's snapshots, newest first.
export const recordSnapshot = async (
  store: SnapshotStore,
  draftId: string,
  name: string,
  text: string,
  kind: SaveKind,
  now: number,
): Promise<SnapshotRecord[]> => {
  const existing = snapshotsForDraft(await store.list(), draftId);
  if (!shouldSnapshot(existing, text, kind, now)) return existing;
  const record = createSnapshotRecord(draftId, name, text, now, existing);
  await store.save(record);
  const next = [record, ...existing];
  const pruned = snapshotsToPrune(next);
  if (pruned.length) await store.remove(pruned);
  return next.filter((snapshot) => !pruned.includes(snapshot.id));
};

export const removeDraftSnapshots = async (store: SnapshotStore, draftId: string): Promise<void> => {
  const ids = snapshotsForDraft(await store.list(), draftId).map((snapshot) => snapshot.id);
  if (ids.length) await store.remove(ids);
};

export const createIndexedDbSnapshotStore = (): SnapshotStore => ({
  async list() {
    const db = await openMarkdownDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(SNAPSHOT_STORE_NAME, 'readonly').objectStore(SNAPSHOT_STORE_NAME).getAll();
      request.onsuccess = () => resolve(request.result as SnapshotRecord[]);
      request.onerror = () => reject(request.error);
    });
  },
  async save(record) {
    const db = await openMarkdownDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE_NAME, 'readwrite');
      tx.objectStore(SNAPSHOT_STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
  async remove(ids) {
    const db = await openMarkdownDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SNAPSHOT_STORE_NAME, 'readwrite');
      for (const id of ids) tx.objectStore(SNAPSHOT_STORE_NAME).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },
});

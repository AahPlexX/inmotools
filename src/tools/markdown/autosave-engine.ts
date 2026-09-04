import type { DraftRecord, StorageUsageEstimate } from './markdown-types';

// Local, per-document draft storage for this tool only. This is
// deliberately separate from src/lib/persistence.ts, which is reserved for
// cross-tool favorites/recents - individual tools that need their own
// autosave (this one, plus floorplan and lattice elsewhere in this catalog)
// implement it themselves.
//
// The storage backend is injected as a small async interface so the pure
// shaping logic below (creating/updating a draft record) and the
// orchestration functions (saveDraft/listDrafts/deleteDraft) can be unit
// tested against an in-memory fake, without requiring a real IndexedDB
// implementation in the test environment. The real IndexedDB-backed adapter
// is a thin, separately-exercised implementation of the same interface.

export interface DraftStore {
  list(): Promise<DraftRecord[]>;
  save(record: DraftRecord): Promise<void>;
  remove(id: string): Promise<void>;
}

const generateDraftId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export const createDraftRecord = (name: string, text: string, now: number): DraftRecord => ({
  id: generateDraftId(),
  name,
  text,
  updatedAt: now,
});

export const updateDraftRecord = (draft: DraftRecord, text: string, now: number): DraftRecord => ({
  ...draft,
  text,
  updatedAt: now,
});

export const saveDraft = async (store: DraftStore, draft: DraftRecord): Promise<void> => {
  await store.save(draft);
};

export const listDrafts = async (store: DraftStore): Promise<DraftRecord[]> => {
  const drafts = await store.list();
  return [...drafts].sort((a, b) => b.updatedAt - a.updatedAt);
};

export const deleteDraft = async (store: DraftStore, id: string): Promise<void> => {
  await store.remove(id);
};

const DB_NAME = 'inmotools.markdown-workbench';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

// A real, browser-only IndexedDB-backed implementation of DraftStore.
// IndexedDB has no equivalent in the plain Node-based Vitest environment
// this project runs unit tests in, so this adapter's actual persistence
// behavior is exercised through the tool's own end-to-end test and manual
// verification, not a Vitest unit test - the shaping and orchestration
// logic above it is what carries unit test coverage.
export const createIndexedDbDraftStore = (): DraftStore => {
  const openDb = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

  return {
    async list() {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).getAll();
        request.onsuccess = () => resolve(request.result as DraftRecord[]);
        request.onerror = () => reject(request.error);
      });
    },
    async save(record) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
    async remove(id) {
      const db = await openDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    },
  };
};

// Wraps the browser's storage-estimate API. The browser's own documentation
// describes the reported usage/quota as a conservative approximation, not
// an exact byte count - callers must present it as such, not as a precise
// figure. Returns null fields when the API is unavailable rather than
// throwing, since this is a "nice to have" status indicator, not a
// requirement for the rest of the tool to function.
export const estimateStorageUsage = async (): Promise<StorageUsageEstimate> => {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usageBytes: null, quotaBytes: null };
  }
  try {
    const estimate = await navigator.storage.estimate();
    return {
      usageBytes: typeof estimate.usage === 'number' ? estimate.usage : null,
      quotaBytes: typeof estimate.quota === 'number' ? estimate.quota : null,
    };
  } catch {
    return { usageBytes: null, quotaBytes: null };
  }
};

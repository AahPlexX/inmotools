import { describe, expect, test } from 'vitest';
import { DEFAULT_RECIPE } from '../../src/tools/photo/photo-engine';
import {
  PhotoProjectStoreError,
  createPhotoProjectStore,
  migratePhotoProjectRecord,
  type PhotoProjectBinaryAdapter,
  type PhotoProjectRecordAdapter,
  type PhotoProjectStoreCoordinator,
} from '../../src/tools/photo/photo-project-store';
import type { PhotoProjectRecord, PhotoProjectSaveInput } from '../../src/tools/photo/photo-project-types';

class MemoryRecords implements PhotoProjectRecordAdapter {
  projects = new Map<string, unknown>();
  sources = new Map<string, Blob>();

  async listProjects() { return [...this.projects.values()]; }
  async getProject(id: string) { return this.projects.get(id); }
  async putProject(record: PhotoProjectRecord) { this.projects.set(record.id, structuredClone(record)); }
  async removeProject(id: string) { this.projects.delete(id); }
  async getSource(key: string) { return this.sources.get(key); }
  async putSource(key: string, source: Blob) { this.sources.set(key, source); }
  async removeSource(key: string) { this.sources.delete(key); }
  async listSourceKeys() { return [...this.sources.keys()]; }
}

class MemoryBinaries implements PhotoProjectBinaryAdapter {
  sources = new Map<string, Blob>();
  failWrites = false;

  async get(key: string) { return this.sources.get(key); }
  async put(key: string, source: Blob) {
    if (this.failWrites) throw new DOMException('OPFS unavailable', 'UnknownError');
    this.sources.set(key, source);
  }
  async remove(key: string) { this.sources.delete(key); }
  async listKeys() { return [...this.sources.keys()]; }
}

class DeferredRecords extends MemoryRecords {
  blockNextProjectWrite = false;
  private releaseProjectWrite: (() => void) | null = null;
  private projectWriteStarted: (() => void) | null = null;
  readonly nextProjectWriteStarted = new Promise<void>((resolve) => {
    this.projectWriteStarted = resolve;
  });

  override async putProject(record: PhotoProjectRecord) {
    if (this.blockNextProjectWrite) {
      this.blockNextProjectWrite = false;
      this.projectWriteStarted?.();
      await new Promise<void>((resolve) => { this.releaseProjectWrite = resolve; });
    }
    await super.putProject(record);
  }

  release() {
    this.releaseProjectWrite?.();
  }
}

function input(id = 'project-1'): PhotoProjectSaveInput {
  const sourceBlob = new Blob(['pixels'], { type: 'image/png' });
  return {
    id,
    name: 'Portrait project',
    createdAt: 100,
    source: {
      name: 'portrait.png',
      type: 'image/png',
      size: sourceBlob.size,
      lastModified: 50,
      width: 320,
      height: 240,
    },
    sourceBlob,
    history: {
      past: [DEFAULT_RECIPE],
      present: { ...DEFAULT_RECIPE, exposure: 1 },
      future: [{ ...DEFAULT_RECIPE, exposure: 2 }],
      limit: 80,
    },
    snapshots: [],
  };
}

function sharedCoordinator(): PhotoProjectStoreCoordinator {
  let queue: Promise<void> = Promise.resolve();
  return <T>(operation: () => Promise<T>) => {
    const result = queue.then(operation, operation);
    queue = result.then(() => undefined, () => undefined);
    return result;
  };
}

describe('Photo project store', () => {
  test('saves serializable metadata in IndexedDB and the source in OPFS when available', async () => {
    const records = new MemoryRecords();
    const opfs = new MemoryBinaries();
    const store = createPhotoProjectStore(records, opfs, () => 200);

    const saved = await store.save(input());
    expect(saved.schemaVersion).toBe(1);
    expect(saved.updatedAt).toBe(200);
    expect(saved.source.storage).toBe('opfs');
    expect(records.sources.size).toBe(0);
    expect(opfs.sources.get(saved.source.key)?.size).toBe(6);

    const loaded = await store.load(saved.id);
    expect(loaded.project.history.present.exposure).toBe(1);
    expect(loaded.project.history.past).toHaveLength(1);
    expect(loaded.project.history.future).toHaveLength(1);
    expect(loaded.sourceFile.name).toBe('portrait.png');
    expect(await loaded.sourceFile.text()).toBe('pixels');
  });

  test('falls back to the IndexedDB blob store when OPFS writing is unavailable', async () => {
    const records = new MemoryRecords();
    const opfs = new MemoryBinaries();
    opfs.failWrites = true;
    const store = createPhotoProjectStore(records, opfs, () => 200);

    const saved = await store.save(input());
    expect(saved.source.storage).toBe('indexeddb');
    expect(records.sources.has(saved.source.key)).toBe(true);
    await expect(store.load(saved.id)).resolves.toMatchObject({
      project: { id: 'project-1' },
      sourceFile: { name: 'portrait.png' },
    });
  });

  test('autosave updates the recipe without rewriting an unchanged immutable source', async () => {
    const records = new MemoryRecords();
    const opfs = new MemoryBinaries();
    const store = createPhotoProjectStore(records, opfs, () => 200);
    const first = await store.save(input());
    const source = opfs.sources.get(first.source.key);

    const updated = await store.save({
      ...input(),
      sourceBlob: undefined,
      history: { past: [], present: { ...DEFAULT_RECIPE, contrast: 0.5 }, future: [], limit: 80 },
    });
    expect(updated.source.key).toBe(first.source.key);
    expect(opfs.sources.get(first.source.key)).toBe(source);
    expect(updated.history.present.contrast).toBe(0.5);
  });

  test('migrates a legacy version-zero project into the current schema', () => {
    const migrated = migratePhotoProjectRecord({
      version: 0,
      id: 'legacy',
      name: 'Legacy project',
      createdAt: 10,
      updatedAt: 20,
      sourceKey: 'legacy-source',
      sourceName: 'legacy.jpg',
      sourceType: 'image/jpeg',
      sourceSize: 12,
      width: 40,
      height: 30,
      recipe: { ...DEFAULT_RECIPE, exposure: 99 },
      snapshots: [],
    });

    expect(migrated.schemaVersion).toBe(1);
    expect(migrated.source).toMatchObject({ key: 'legacy-source', storage: 'indexeddb', name: 'legacy.jpg' });
    expect(migrated.history.present.exposure).toBe(5);
  });

  test('classifies quota failures and does not leave an orphaned source', async () => {
    const records = new MemoryRecords();
    records.putProject = async () => { throw new DOMException('full', 'QuotaExceededError'); };
    const opfs = new MemoryBinaries();
    const store = createPhotoProjectStore(records, opfs);

    await expect(store.save(input())).rejects.toMatchObject<Partial<PhotoProjectStoreError>>({ code: 'quota' });
    expect(opfs.sources.size).toBe(0);
  });

  test('preserves the previous valid source when replacement metadata fails', async () => {
    const records = new MemoryRecords();
    const opfs = new MemoryBinaries();
    const store = createPhotoProjectStore(records, opfs);
    const saved = await store.save(input());
    records.putProject = async () => { throw new DOMException('full', 'QuotaExceededError'); };

    await expect(store.save({
      ...input(),
      source: { ...input().source, name: 'replacement.png' },
      sourceBlob: new Blob(['newpix'], { type: 'image/png' }),
    })).rejects.toMatchObject<Partial<PhotoProjectStoreError>>({ code: 'quota' });

    expect(opfs.sources.size).toBe(1);
    expect(await opfs.sources.get(saved.source.key)?.text()).toBe('pixels');
  });

  test('explicit delete removes metadata and its source while cleanup removes only orphans', async () => {
    const records = new MemoryRecords();
    const opfs = new MemoryBinaries();
    const store = createPhotoProjectStore(records, opfs);
    const saved = await store.save(input());
    opfs.sources.set('orphan', new Blob(['unused']));
    records.sources.set('idb-orphan', new Blob(['unused']));

    expect(await store.cleanup()).toBe(2);
    expect(opfs.sources.has(saved.source.key)).toBe(true);
    await store.delete(saved.id);
    expect(records.projects.size).toBe(0);
    expect(opfs.sources.size).toBe(0);
  });

  test('finishes project deletion when source cleanup leaves a harmless orphan', async () => {
    const records = new MemoryRecords();
    const opfs = new MemoryBinaries();
    const store = createPhotoProjectStore(records, opfs);
    const saved = await store.save(input());
    opfs.remove = async () => { throw new DOMException('busy', 'InvalidStateError'); };

    await expect(store.delete(saved.id)).resolves.toBeUndefined();
    expect(records.projects.size).toBe(0);
    expect(opfs.sources.has(saved.source.key)).toBe(true);
  });

  test('refuses destructive cleanup when any project metadata is unreadable', async () => {
    const records = new MemoryRecords();
    const opfs = new MemoryBinaries();
    const store = createPhotoProjectStore(records, opfs);
    const saved = await store.save(input());
    records.projects.set(saved.id, { ...saved, history: null });
    opfs.sources.set('orphan', new Blob(['unused']));

    await expect(store.cleanup()).rejects.toMatchObject<Partial<PhotoProjectStoreError>>({ code: 'corrupt-project' });
    expect(opfs.sources.has(saved.source.key)).toBe(true);
    expect(opfs.sources.has('orphan')).toBe(true);
  });

  test('rejects invalid current-schema source metadata before cleanup can delete its blob', async () => {
    const records = new MemoryRecords();
    const opfs = new MemoryBinaries();
    const store = createPhotoProjectStore(records, opfs);
    const saved = await store.save(input());
    records.projects.set(saved.id, {
      ...saved,
      source: { ...saved.source, storage: 'unknown' },
    });

    await expect(store.cleanup()).rejects.toMatchObject<Partial<PhotoProjectStoreError>>({ code: 'corrupt-project' });
    expect(opfs.sources.has(saved.source.key)).toBe(true);
  });

  test('serializes cleanup across store instances behind an in-flight source and metadata save', async () => {
    const records = new DeferredRecords();
    const opfs = new MemoryBinaries();
    const coordinate = sharedCoordinator();
    const savingStore = createPhotoProjectStore(records, opfs, Date.now, coordinate);
    const cleanupStore = createPhotoProjectStore(records, opfs, Date.now, coordinate);
    records.blockNextProjectWrite = true;

    const save = savingStore.save(input());
    await records.nextProjectWriteStarted;
    const cleanup = cleanupStore.cleanup();
    records.release();

    const saved = await save;
    expect(await cleanup).toBe(0);
    await expect(cleanupStore.load(saved.id)).resolves.toMatchObject({ project: { id: saved.id } });
  });

  test('reports a missing persisted source without returning a partial project', async () => {
    const records = new MemoryRecords();
    const store = createPhotoProjectStore(records);
    const saved = await store.save(input());
    records.sources.delete(saved.source.key);

    await expect(store.load(saved.id)).rejects.toMatchObject<Partial<PhotoProjectStoreError>>({ code: 'missing-source' });
  });
});

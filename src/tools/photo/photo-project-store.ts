import { createHistory, normalizeRecipe } from './photo-engine';
import {
  PHOTO_PROJECT_SCHEMA_VERSION,
  type LoadedPhotoProject,
  type PhotoProjectRecord,
  type PhotoProjectSaveInput,
  type PhotoProjectSourceDescriptor,
  type PhotoStorageStatus,
  type PhotoProjectVirtualCopyInput,
  type PhotoUserPresetRecord,
  type PhotoUserPresetSaveInput,
} from './photo-project-types';
import type { PhotoHistory, PhotoRecipe, PhotoSnapshot } from './photo-types';

const DB_NAME = 'inmotools.photo-studio';
const DB_VERSION = 2;
const PROJECT_STORE = 'projects';
const SOURCE_STORE = 'sources';
const PRESET_STORE = 'presets';
const OPFS_DIRECTORY = 'inmotools-photo-studio';

export type PhotoProjectStoreErrorCode =
  | 'unsupported'
  | 'quota'
  | 'corrupt-project'
  | 'missing-source'
  | 'storage-failed';

export class PhotoProjectStoreError extends Error {
  readonly code: PhotoProjectStoreErrorCode;

  constructor(code: PhotoProjectStoreErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'PhotoProjectStoreError';
    this.code = code;
  }
}

export interface PhotoProjectRecordAdapter {
  listProjects(): Promise<unknown[]>;
  getProject(id: string): Promise<unknown | undefined>;
  putProject(record: PhotoProjectRecord): Promise<void>;
  removeProject(id: string): Promise<void>;
  listPresets(): Promise<unknown[]>;
  getPreset(id: string): Promise<unknown | undefined>;
  putPreset(record: PhotoUserPresetRecord): Promise<void>;
  removePreset(id: string): Promise<void>;
  getSource(key: string): Promise<Blob | undefined>;
  putSource(key: string, source: Blob): Promise<void>;
  removeSource(key: string): Promise<void>;
  listSourceKeys(): Promise<string[]>;
}

export interface PhotoProjectBinaryAdapter {
  get(key: string): Promise<Blob | undefined>;
  put(key: string, source: Blob): Promise<void>;
  remove(key: string): Promise<void>;
  listKeys(): Promise<string[]>;
}

export interface PhotoProjectStore {
  readonly opfsAvailable: boolean;
  list(): Promise<PhotoProjectRecord[]>;
  load(id: string): Promise<LoadedPhotoProject>;
  latest(): Promise<LoadedPhotoProject | null>;
  save(input: PhotoProjectSaveInput): Promise<PhotoProjectRecord>;
  createVirtualCopy(sourceProjectId: string, input: PhotoProjectVirtualCopyInput): Promise<PhotoProjectRecord>;
  delete(id: string): Promise<void>;
  listPresets(): Promise<PhotoUserPresetRecord[]>;
  savePreset(input: PhotoUserPresetSaveInput): Promise<PhotoUserPresetRecord>;
  deletePreset(id: string): Promise<void>;
  cleanup(): Promise<number>;
}

export type PhotoProjectStoreCoordinator = <T>(operation: () => Promise<T>) => Promise<T>;

interface StorageManagerLike {
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
  getDirectory?: () => Promise<FileSystemDirectoryHandle>;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function finiteNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new PhotoProjectStoreError('corrupt-project', `The saved project has an invalid ${field}.`);
  }
  return value;
}

function normalizedSnapshots(value: unknown): PhotoSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isObject(entry) || !isObject(entry.recipe)) return [];
    const id = typeof entry.id === 'string' ? entry.id : '';
    const name = typeof entry.name === 'string' ? entry.name : '';
    const createdAt = typeof entry.createdAt === 'string' ? entry.createdAt : '';
    if (!id || !name || !createdAt) return [];
    return [{ id, name, createdAt, recipe: normalizeRecipe(entry.recipe as unknown as PhotoRecipe) }];
  });
}

function normalizedHistory(value: unknown): PhotoHistory {
  if (!isObject(value) || !isObject(value.present)) {
    throw new PhotoProjectStoreError('corrupt-project', 'The saved project is missing its edit history.');
  }
  const recipes = (entries: unknown): PhotoRecipe[] => Array.isArray(entries)
    ? entries.flatMap((entry) => isObject(entry)
      ? [normalizeRecipe(entry as unknown as PhotoRecipe)]
      : [])
    : [];
  const limit = Math.max(1, Math.min(200, Math.round(finiteNumber(value.limit, 80))));
  return {
    past: recipes(value.past).slice(-limit),
    present: normalizeRecipe(value.present as unknown as PhotoRecipe),
    future: recipes(value.future).slice(0, limit),
    limit,
  };
}

export function migratePhotoProjectRecord(value: unknown): PhotoProjectRecord {
  if (!isObject(value)) {
    throw new PhotoProjectStoreError('corrupt-project', 'The saved project record is not readable.');
  }

  const schemaVersion = value.schemaVersion ?? value.version ?? 0;
  if (schemaVersion !== 0 && schemaVersion !== PHOTO_PROJECT_SCHEMA_VERSION) {
    throw new PhotoProjectStoreError('corrupt-project', `Unsupported Photo project schema version: ${String(schemaVersion)}.`);
  }

  const id = requiredString(value.id, 'project id');
  const historyValue = isObject(value.history)
    ? value.history
    : isObject(value.recipe)
      ? createHistory(normalizeRecipe(value.recipe as unknown as PhotoRecipe))
      : null;
  if (!historyValue) {
    throw new PhotoProjectStoreError('corrupt-project', 'The saved project is missing its edit recipe.');
  }

  const currentSchema = schemaVersion === PHOTO_PROJECT_SCHEMA_VERSION;
  if (currentSchema && !isObject(value.source)) {
    throw new PhotoProjectStoreError('corrupt-project', 'The saved project is missing its source descriptor.');
  }
  const sourceValue = isObject(value.source) ? value.source : {};
  let sourceStorage: PhotoProjectSourceDescriptor['storage'];
  if (currentSchema) {
    if (sourceValue.storage !== 'opfs' && sourceValue.storage !== 'indexeddb') {
      throw new PhotoProjectStoreError('corrupt-project', 'The saved project has an invalid source storage location.');
    }
    sourceStorage = sourceValue.storage;
  } else {
    sourceStorage = sourceValue.storage === 'opfs' ? 'opfs' : 'indexeddb';
  }
  const sourceKey = currentSchema
    ? requiredString(sourceValue.key, 'source key')
    : typeof sourceValue.key === 'string' && sourceValue.key
      ? sourceValue.key
      : typeof value.sourceKey === 'string' && value.sourceKey
        ? value.sourceKey
        : `photo-source-${id}`;
  const createdAt = finiteNumber(value.createdAt, Date.now());

  return {
    schemaVersion: PHOTO_PROJECT_SCHEMA_VERSION,
    id,
    name: typeof value.name === 'string' && value.name.trim() ? value.name : 'Recovered photo',
    createdAt,
    updatedAt: finiteNumber(value.updatedAt, createdAt),
    source: {
      key: sourceKey,
      storage: sourceStorage,
      name: requiredString(sourceValue.name ?? value.sourceName, 'source name'),
      type: typeof (sourceValue.type ?? value.sourceType) === 'string'
        ? String(sourceValue.type ?? value.sourceType)
        : '',
      size: finiteNumber(sourceValue.size ?? value.sourceSize),
      lastModified: finiteNumber(sourceValue.lastModified),
      width: finiteNumber(sourceValue.width ?? value.width),
      height: finiteNumber(sourceValue.height ?? value.height),
      ...(typeof sourceValue.sha256 === 'string' && /^[0-9a-f]{64}$/.test(sourceValue.sha256) ? { sha256: sourceValue.sha256 } : {}),
    },
    history: normalizedHistory(historyValue),
    snapshots: normalizedSnapshots(value.snapshots),
  };
}

export function migratePhotoUserPresetRecord(value: unknown): PhotoUserPresetRecord {
  if (!isObject(value)) {
    throw new PhotoProjectStoreError('corrupt-project', 'The saved user preset record is not readable.');
  }
  if (value.schemaVersion !== PHOTO_PROJECT_SCHEMA_VERSION) {
    throw new PhotoProjectStoreError('corrupt-project', `Unsupported Photo preset schema version: ${String(value.schemaVersion)}.`);
  }
  if (!Number.isFinite(value.createdAt) || !Number.isFinite(value.updatedAt)) {
    throw new PhotoProjectStoreError('corrupt-project', 'The saved user preset has invalid timestamps.');
  }
  if (!isObject(value.recipe)) {
    throw new PhotoProjectStoreError('corrupt-project', 'The saved user preset is missing its edit recipe.');
  }
  return {
    schemaVersion: PHOTO_PROJECT_SCHEMA_VERSION,
    id: requiredString(value.id, 'preset id'),
    name: requiredString(value.name, 'preset name').trim(),
    createdAt: value.createdAt as number,
    updatedAt: value.updatedAt as number,
    recipe: normalizeRecipe(value.recipe as unknown as PhotoRecipe),
  };
}

function sourceMatches(
  descriptor: PhotoProjectSourceDescriptor,
  input: PhotoProjectSaveInput['source'],
): boolean {
  return descriptor.name === input.name
    && descriptor.type === input.type
    && descriptor.size === input.size
    && descriptor.lastModified === input.lastModified
    && descriptor.width === input.width
    && descriptor.height === input.height;
}

let sourceKeySequence = 0;

function sourceKey(input: PhotoProjectSaveInput): string {
  const nonce = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${(sourceKeySequence += 1).toString(36)}`;
  return `source-${input.id}-${nonce}`;
}

function storageError(error: unknown, fallback: string): PhotoProjectStoreError {
  if (error instanceof PhotoProjectStoreError) return error;
  const name = isObject(error) && typeof error.name === 'string' ? error.name : '';
  if (name === 'QuotaExceededError') {
    return new PhotoProjectStoreError(
      'quota',
      'Browser storage is full. Delete an older local project or free site storage, then save again.',
      { cause: error },
    );
  }
  return new PhotoProjectStoreError('storage-failed', fallback, { cause: error });
}

export function createPhotoProjectStore(
  records: PhotoProjectRecordAdapter,
  opfs?: PhotoProjectBinaryAdapter,
  now: () => number = Date.now,
  coordinate: PhotoProjectStoreCoordinator = (operation) => operation(),
  cleanupEnabled = true,
): PhotoProjectStore {
  let operationQueue: Promise<void> = Promise.resolve();

  function enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const coordinated = () => coordinate(operation);
    const result = operationQueue.then(coordinated, coordinated);
    operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  async function readRecord(id: string): Promise<PhotoProjectRecord> {
    const raw = await records.getProject(id);
    if (raw === undefined) {
      throw new PhotoProjectStoreError('corrupt-project', 'That local Photo project no longer exists.');
    }
    return migratePhotoProjectRecord(raw);
  }

  async function readSource(project: PhotoProjectRecord): Promise<Blob> {
    const blob = project.source.storage === 'opfs'
      ? await opfs?.get(project.source.key)
      : await records.getSource(project.source.key);
    if (!blob) {
      throw new PhotoProjectStoreError(
        'missing-source',
        `The source image for “${project.name}” is missing. Delete the damaged local project and reopen the original photo.`,
      );
    }
    return blob;
  }

  async function listProjects(): Promise<PhotoProjectRecord[]> {
    const projects = (await records.listProjects()).flatMap((entry) => {
      try {
        return [migratePhotoProjectRecord(entry)];
      } catch {
        return [];
      }
    });
    return projects.sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async function sourceIsStillReferenced(source: PhotoProjectSourceDescriptor): Promise<boolean> {
    const rawProjects = await records.listProjects();
    for (const rawProject of rawProjects) {
      try {
        const project = migratePhotoProjectRecord(rawProject);
        if (project.source.storage === source.storage && project.source.key === source.key) return true;
      } catch {
        // An unreadable record could reference this source. Retaining an orphan is
        // harmless; removing a live image is not.
        return true;
      }
    }
    return false;
  }

  async function loadProject(id: string): Promise<LoadedPhotoProject> {
    const project = await readRecord(id);
    const blob = await readSource(project);
    return {
      project,
      sourceFile: new File([blob], project.source.name, {
        type: project.source.type || blob.type,
        lastModified: project.source.lastModified,
      }),
    };
  }

  return {
    opfsAvailable: Boolean(opfs),

    async list() {
      return enqueue(async () => {
        try {
          return await listProjects();
        } catch (error) {
          throw storageError(error, 'Could not list local Photo projects.');
        }
      });
    },

    async load(id) {
      return enqueue(async () => {
        try {
          return await loadProject(id);
        } catch (error) {
          throw storageError(error, 'Could not load that local Photo project.');
        }
      });
    },

    async latest() {
      return enqueue(async () => {
        try {
          const projects = await listProjects();
          return projects.length ? await loadProject(projects[0].id) : null;
        } catch (error) {
          throw storageError(error, 'Could not load the latest local Photo project.');
        }
      });
    },

    async save(input) {
      return enqueue(async () => {
        let existing: PhotoProjectRecord | undefined;
        const rawExisting = await records.getProject(input.id);
        if (rawExisting !== undefined) existing = migratePhotoProjectRecord(rawExisting);

        let descriptor = existing?.source;
        let wroteSource: { key: string; storage: 'indexeddb' | 'opfs' } | null = null;
        if (!descriptor || !sourceMatches(descriptor, input.source)) {
          if (!input.sourceBlob) {
            throw new PhotoProjectStoreError('missing-source', 'The source image must be available before this project can be saved.');
          }
          const key = sourceKey(input);
          let storage: 'indexeddb' | 'opfs' = 'indexeddb';
          if (opfs) {
            try {
              await opfs.put(key, input.sourceBlob);
              storage = 'opfs';
            } catch {
              try {
                await records.putSource(key, input.sourceBlob);
              } catch (error) {
                throw storageError(error, 'Could not store the Photo project source image.');
              }
            }
          } else {
            try {
              await records.putSource(key, input.sourceBlob);
            } catch (error) {
              throw storageError(error, 'Could not store the Photo project source image.');
            }
          }
          wroteSource = { key, storage };
          descriptor = { ...input.source, key, storage };
        } else if (!descriptor.sha256 && input.source.sha256) {
          // Same stored bytes, first time a fingerprint is known: record it for duplicate checks.
          descriptor = { ...descriptor, sha256: input.source.sha256 };
        }

        const project: PhotoProjectRecord = {
          schemaVersion: PHOTO_PROJECT_SCHEMA_VERSION,
          id: input.id,
          name: input.name.trim() || input.source.name,
          createdAt: input.createdAt,
          updatedAt: now(),
          source: descriptor,
          history: normalizedHistory(input.history),
          snapshots: normalizedSnapshots(input.snapshots),
        };

        try {
          await records.putProject(project);
        } catch (error) {
          if (wroteSource) {
            try {
              if (wroteSource.storage === 'opfs') await opfs?.remove(wroteSource.key);
              else await records.removeSource(wroteSource.key);
            } catch { /* Best-effort rollback; cleanup() catches any orphan left behind. */ }
          }
          throw storageError(error, 'Could not save the Photo project metadata.');
        }

        if (existing && wroteSource && existing.source.key !== wroteSource.key
          && !await sourceIsStillReferenced(existing.source)) {
          try {
            if (existing.source.storage === 'opfs') await opfs?.remove(existing.source.key);
            else await records.removeSource(existing.source.key);
          } catch { /* The new project is valid; cleanup() can remove the old orphan later. */ }
        }
        return project;
      });
    },

    async createVirtualCopy(sourceProjectId, input) {
      return enqueue(async () => {
        try {
          const original = await readRecord(sourceProjectId);
          if (input.id === sourceProjectId) {
            throw new PhotoProjectStoreError('corrupt-project', 'A virtual copy must use a new project id.');
          }
          if (await records.getProject(input.id) !== undefined) {
            throw new PhotoProjectStoreError('corrupt-project', 'A local Photo project already uses that id.');
          }
          const createdAt = input.createdAt === undefined ? now() : finiteNumber(input.createdAt, now());
          const copy: PhotoProjectRecord = {
            schemaVersion: PHOTO_PROJECT_SCHEMA_VERSION,
            id: requiredString(input.id, 'project id'),
            name: input.name.trim() || `${original.name} copy`,
            createdAt,
            updatedAt: now(),
            // Sources are immutable. Copies intentionally point at exactly the
            // same persisted blob rather than duplicating image bytes.
            source: { ...original.source },
            history: normalizedHistory(original.history),
            snapshots: normalizedSnapshots(original.snapshots),
          };
          await records.putProject(copy);
          return copy;
        } catch (error) {
          throw storageError(error, 'Could not create a virtual Photo project copy.');
        }
      });
    },

    async delete(id) {
      return enqueue(async () => {
        try {
          const raw = await records.getProject(id);
          const project = raw === undefined ? undefined : migratePhotoProjectRecord(raw);
          await records.removeProject(id);
          if (!project) return;
          if (await sourceIsStillReferenced(project.source)) return;
          try {
            if (project.source.storage === 'opfs') await opfs?.remove(project.source.key);
            else await records.removeSource(project.source.key);
          } catch { /* Metadata deletion succeeded; cleanup() can remove the harmless orphan later. */ }
        } catch (error) {
          throw storageError(error, 'Could not delete that local Photo project.');
        }
      });
    },

    async listPresets() {
      return enqueue(async () => {
        try {
          const presets = (await records.listPresets()).flatMap((entry) => {
            try {
              return [migratePhotoUserPresetRecord(entry)];
            } catch {
              return [];
            }
          });
          return presets.sort((left, right) => right.updatedAt - left.updatedAt);
        } catch (error) {
          throw storageError(error, 'Could not list local Photo user presets.');
        }
      });
    },

    async savePreset(input) {
      return enqueue(async () => {
        try {
          const id = requiredString(input.id, 'preset id');
          const name = requiredString(input.name, 'preset name').trim();
          if (!isObject(input.recipe)) {
            throw new PhotoProjectStoreError('corrupt-project', 'A user preset must include an edit recipe.');
          }
          const rawExisting = await records.getPreset(id);
          const existing = rawExisting === undefined ? undefined : migratePhotoUserPresetRecord(rawExisting);
          const createdAt = existing?.createdAt
            ?? (input.createdAt === undefined ? now() : finiteNumber(input.createdAt, now()));
          const preset: PhotoUserPresetRecord = {
            schemaVersion: PHOTO_PROJECT_SCHEMA_VERSION,
            id,
            name,
            createdAt,
            updatedAt: now(),
            recipe: normalizeRecipe(input.recipe),
          };
          await records.putPreset(preset);
          return preset;
        } catch (error) {
          throw storageError(error, 'Could not save the local Photo user preset.');
        }
      });
    },

    async deletePreset(id) {
      return enqueue(async () => {
        try {
          await records.removePreset(id);
        } catch (error) {
          throw storageError(error, 'Could not delete the local Photo user preset.');
        }
      });
    },

    async cleanup() {
      return enqueue(async () => {
        try {
          if (!cleanupEnabled) return 0;
          // Cleanup must be conservative: one unreadable record means no source can
          // safely be classified as orphaned.
          const projects = (await records.listProjects()).map(migratePhotoProjectRecord);
          const referenced = new Set(projects.map((project) => `${project.source.storage}:${project.source.key}`));
          let removed = 0;
          for (const key of await records.listSourceKeys()) {
            if (!referenced.has(`indexeddb:${key}`)) {
              await records.removeSource(key);
              removed += 1;
            }
          }
          if (opfs) {
            for (const key of await opfs.listKeys()) {
              if (!referenced.has(`opfs:${key}`)) {
                await opfs.remove(key);
                removed += 1;
              }
            }
          }
          return removed;
        } catch (error) {
          throw storageError(error, 'Could not clean up unused Photo project data.');
        }
      });
    },
  };
}

function openPhotoDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new PhotoProjectStoreError('unsupported', 'IndexedDB is unavailable in this browser.'));
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE)) {
        db.createObjectStore(PROJECT_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(SOURCE_STORE)) {
        db.createObjectStore(SOURCE_STORE);
      }
      if (!db.objectStoreNames.contains(PRESET_STORE)) {
        db.createObjectStore(PRESET_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed.'));
    request.onblocked = () => reject(new Error('Photo project storage is blocked by another open tab.'));
  });
}

async function requestResult<T>(store: string, action: (objectStore: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openPhotoDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(store, 'readonly');
      const request = action(transaction.objectStore(store));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? transaction.error);
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    });
  } finally {
    db.close();
  }
}

async function mutateStore(store: string, action: (objectStore: IDBObjectStore) => void): Promise<void> {
  const db = await openPhotoDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(store, 'readwrite');
      action(transaction.objectStore(store));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('IndexedDB transaction failed.'));
      transaction.onabort = () => reject(transaction.error ?? new Error('IndexedDB transaction aborted.'));
    });
  } finally {
    db.close();
  }
}

export function createIndexedDbPhotoProjectAdapter(): PhotoProjectRecordAdapter {
  return {
    listProjects: () => requestResult(PROJECT_STORE, (store) => store.getAll()),
    getProject: (id) => requestResult(PROJECT_STORE, (store) => store.get(id)),
    putProject: (record) => mutateStore(PROJECT_STORE, (store) => { store.put(record); }),
    removeProject: (id) => mutateStore(PROJECT_STORE, (store) => { store.delete(id); }),
    listPresets: () => requestResult(PRESET_STORE, (store) => store.getAll()),
    getPreset: (id) => requestResult(PRESET_STORE, (store) => store.get(id)),
    putPreset: (record) => mutateStore(PRESET_STORE, (store) => { store.put(record); }),
    removePreset: (id) => mutateStore(PRESET_STORE, (store) => { store.delete(id); }),
    getSource: (key) => requestResult(SOURCE_STORE, (store) => store.get(key)),
    putSource: (key, source) => mutateStore(SOURCE_STORE, (store) => { store.put(source, key); }),
    removeSource: (key) => mutateStore(SOURCE_STORE, (store) => { store.delete(key); }),
    listSourceKeys: async () => (await requestResult(SOURCE_STORE, (store) => store.getAllKeys())).map(String),
  };
}

async function createOpfsAdapter(storage: StorageManagerLike | undefined): Promise<PhotoProjectBinaryAdapter | undefined> {
  if (!storage?.getDirectory) return undefined;
  try {
    const root = await storage.getDirectory();
    const directory = await root.getDirectoryHandle(OPFS_DIRECTORY, { create: true });
    return {
      async get(key) {
        try {
          return await (await directory.getFileHandle(key)).getFile();
        } catch (error) {
          if (isObject(error) && error.name === 'NotFoundError') return undefined;
          throw error;
        }
      },
      async put(key, source) {
        const handle = await directory.getFileHandle(key, { create: true });
        const writable = await handle.createWritable();
        try {
          await writable.write(source);
          await writable.close();
        } catch (error) {
          await writable.abort().catch(() => undefined);
          throw error;
        }
      },
      async remove(key) {
        try {
          await directory.removeEntry(key);
        } catch (error) {
          if (!isObject(error) || error.name !== 'NotFoundError') throw error;
        }
      },
      async listKeys() {
        const keys: string[] = [];
        for await (const key of directory.keys()) keys.push(key);
        return keys;
      },
    };
  } catch {
    return undefined;
  }
}

function browserStorage(): StorageManagerLike | undefined {
  return typeof navigator === 'undefined' ? undefined : navigator.storage as StorageManagerLike | undefined;
}

function browserProjectCoordinator(): PhotoProjectStoreCoordinator | undefined {
  if (typeof navigator === 'undefined' || !navigator.locks?.request) return undefined;
  return (operation) => navigator.locks.request(DB_NAME, { mode: 'exclusive' }, operation);
}

export async function createBrowserPhotoProjectStore(): Promise<PhotoProjectStore> {
  if (typeof indexedDB === 'undefined') {
    throw new PhotoProjectStoreError('unsupported', 'Local Photo projects are unavailable because IndexedDB is disabled.');
  }
  const coordinator = browserProjectCoordinator();
  return createPhotoProjectStore(
    createIndexedDbPhotoProjectAdapter(),
    await createOpfsAdapter(browserStorage()),
    Date.now,
    coordinator,
    Boolean(coordinator),
  );
}

export async function inspectPhotoStorage(): Promise<PhotoStorageStatus> {
  const storage = browserStorage();
  const status: PhotoStorageStatus = {
    indexedDbAvailable: typeof indexedDB !== 'undefined',
    opfsAvailable: Boolean(storage?.getDirectory),
    persisted: null,
    usageBytes: null,
    quotaBytes: null,
  };
  if (!storage) return status;
  const [persisted, estimate] = await Promise.all([
    storage.persisted?.().catch(() => null) ?? null,
    storage.estimate?.().catch(() => null) ?? null,
  ]);
  status.persisted = typeof persisted === 'boolean' ? persisted : null;
  status.usageBytes = typeof estimate?.usage === 'number' ? estimate.usage : null;
  status.quotaBytes = typeof estimate?.quota === 'number' ? estimate.quota : null;
  return status;
}

export async function requestPhotoStoragePersistence(): Promise<boolean | null> {
  const persist = browserStorage()?.persist;
  if (!persist) return null;
  try {
    return await persist.call(browserStorage());
  } catch {
    return null;
  }
}

export function photoProjectErrorMessage(error: unknown): string {
  return error instanceof PhotoProjectStoreError
    ? error.message
    : `Local project storage failed${error instanceof Error && error.message ? `: ${error.message}` : '.'}`;
}

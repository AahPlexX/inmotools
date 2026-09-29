import Dexie, { type Table } from 'dexie';
import { importTacticalProjectJson, migrateTacticalProject } from './project-io';
import { MAX_NAMED_SNAPSHOTS } from './session-bounds';
import type { TacticalProject } from './tactics-types';

type SnapshotKind = 'autosave' | 'named';

interface StoredProjectRecord {
  id: string;
  title: string;
  modifiedAt: string;
  project: TacticalProject;
}

export interface TacticalSnapshotRecord {
  id: string;
  projectId: string;
  kind: SnapshotKind;
  label: string;
  createdAtMs: number;
  project: TacticalProject;
}

interface VaultOptions {
  databaseName?: string;
  indexedDB?: IDBFactory;
  IDBKeyRange?: typeof globalThis.IDBKeyRange;
  autosaveLimit?: number;
}

class TacticalVaultDatabase extends Dexie {
  projects!: Table<StoredProjectRecord, string>;
  snapshots!: Table<TacticalSnapshotRecord, string>;

  constructor(options: Required<Pick<VaultOptions, 'databaseName'>> & Omit<VaultOptions, 'databaseName'>) {
    super(options.databaseName, options.indexedDB && options.IDBKeyRange
      ? { indexedDB: options.indexedDB, IDBKeyRange: options.IDBKeyRange }
      : undefined);
    this.version(1).stores({
      projects: 'id, title, modifiedAt',
      snapshots: 'id, projectId, kind, createdAtMs, [projectId+kind]',
    });
  }
}

function cloneProject(project: TacticalProject): TacticalProject {
  return structuredClone(migrateTacticalProject(project));
}

export class TacticalProjectVault {
  readonly databaseName: string;
  readonly autosaveLimit: number;
  private readonly db: TacticalVaultDatabase;
  private lastTimestamp = 0;

  constructor(options: VaultOptions = {}) {
    this.databaseName = options.databaseName ?? 'inmotools-tactical-matchboard';
    this.autosaveLimit = options.autosaveLimit ?? 20;
    if (!Number.isInteger(this.autosaveLimit) || this.autosaveLimit < 1 || this.autosaveLimit > 200) {
      throw new RangeError('Autosave limit must be an integer between 1 and 200.');
    }
    this.db = new TacticalVaultDatabase({
      databaseName: this.databaseName,
      indexedDB: options.indexedDB,
      IDBKeyRange: options.IDBKeyRange,
    });
  }

  private nextTimestamp(): number {
    const now = Date.now();
    this.lastTimestamp = Math.max(now, this.lastTimestamp + 1);
    return this.lastTimestamp;
  }

  async saveProject(project: TacticalProject): Promise<TacticalProject> {
    const current = cloneProject(project);
    const record: StoredProjectRecord = {
      id: current.id,
      title: current.metadata.title,
      modifiedAt: current.metadata.modifiedAt,
      project: current,
    };
    await this.db.transaction('rw', this.db.projects, async () => {
      await this.db.projects.put(record);
    });
    return structuredClone(current);
  }

  async getProject(projectId: string): Promise<TacticalProject | undefined> {
    const record = await this.db.projects.get(projectId);
    return record ? structuredClone(record.project) : undefined;
  }

  async listProjects(): Promise<TacticalProject[]> {
    const records = await this.db.projects.toArray();
    return records
      .sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt) || a.id.localeCompare(b.id))
      .map((record) => structuredClone(record.project));
  }

  private async createSnapshotRecord(
    project: TacticalProject,
    kind: SnapshotKind,
    label: string,
  ): Promise<TacticalSnapshotRecord> {
    const current = cloneProject(project);
    const createdAtMs = this.nextTimestamp();
    const record: TacticalSnapshotRecord = {
      id: `${current.id}:${kind}:${createdAtMs}:${crypto.randomUUID()}`,
      projectId: current.id,
      kind,
      label,
      createdAtMs,
      project: current,
    };
    await this.db.snapshots.put(record);
    return structuredClone(record);
  }

  async saveAutosave(project: TacticalProject): Promise<TacticalSnapshotRecord> {
    return this.db.transaction('rw', this.db.snapshots, async () => {
      const record = await this.createSnapshotRecord(project, 'autosave', 'Autosave');
      const autosaves = (await this.db.snapshots.where('[projectId+kind]')
        .equals([project.id, 'autosave'])
        .toArray())
        .sort((a, b) => b.createdAtMs - a.createdAtMs || b.id.localeCompare(a.id));
      const expired = autosaves.slice(this.autosaveLimit).map((item) => item.id);
      if (expired.length) await this.db.snapshots.bulkDelete(expired);
      return record;
    });
  }

  async createSnapshot(project: TacticalProject, rawLabel: string): Promise<TacticalSnapshotRecord> {
    const label = rawLabel.trim();
    if (!label) throw new Error('Snapshot label is required.');
    return this.db.transaction('rw', this.db.snapshots, async () => {
      const existing = await this.db.snapshots.where('[projectId+kind]').equals([project.id, 'named']).count();
      if (existing >= MAX_NAMED_SNAPSHOTS) {
        throw new Error(`Named snapshot limit is ${MAX_NAMED_SNAPSHOTS}. Remove a snapshot before creating another.`);
      }
      return this.createSnapshotRecord(project, 'named', label);
    });
  }

  private async listSnapshots(projectId: string, kind: SnapshotKind): Promise<TacticalSnapshotRecord[]> {
    const items = await this.db.snapshots.where('[projectId+kind]').equals([projectId, kind]).toArray();
    return items
      .sort((a, b) => b.createdAtMs - a.createdAtMs || b.id.localeCompare(a.id))
      .map((item) => structuredClone(item));
  }

  listAutosaves(projectId: string): Promise<TacticalSnapshotRecord[]> {
    return this.listSnapshots(projectId, 'autosave');
  }

  listNamedSnapshots(projectId: string): Promise<TacticalSnapshotRecord[]> {
    return this.listSnapshots(projectId, 'named');
  }

  async getLatestRecovery(projectId: string): Promise<TacticalSnapshotRecord | undefined> {
    return (await this.listAutosaves(projectId))[0];
  }

  async restoreSnapshot(snapshotId: string): Promise<TacticalProject | undefined> {
    const record = await this.db.snapshots.get(snapshotId);
    return record ? structuredClone(record.project) : undefined;
  }

  async deleteProject(projectId: string): Promise<void> {
    await this.db.transaction('rw', this.db.projects, this.db.snapshots, async () => {
      await this.db.projects.delete(projectId);
      const snapshots = await this.db.snapshots.where('projectId').equals(projectId).primaryKeys();
      if (snapshots.length) await this.db.snapshots.bulkDelete(snapshots);
    });
  }

  async importJson(text: string, sourceName: string): Promise<TacticalProject> {
    const imported = importTacticalProjectJson(text, sourceName);
    return this.saveProject(imported);
  }

  close(): void {
    this.db.close();
  }
}

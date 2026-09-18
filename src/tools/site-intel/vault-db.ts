// Feature 38 — Zero-Database Offline Report Vault (IndexedDB).
// Local-only persistence for every generated audit, using Dexie the same way
// the Typing Workstation tool already does elsewhere in this app.

import Dexie, { type Table } from 'dexie';
import type { AuditRecord } from './site-intel-types';

class SiteIntelDb extends Dexie {
  audits!: Table<AuditRecord, number>;
  settings!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('inmotools-site-intelligence');
    this.version(1).stores({
      audits: '++id, url, createdAt, updatedAt, *tags',
      settings: 'key',
    });
  }
}

let dbInstance: SiteIntelDb | null = null;
function getDb(): SiteIntelDb {
  if (!dbInstance) dbInstance = new SiteIntelDb();
  return dbInstance;
}

export async function saveAudit(record: AuditRecord): Promise<number> {
  const db = getDb();
  const now = Date.now();
  if (record.id) {
    await db.audits.update(record.id, { ...record, updatedAt: now });
    return record.id;
  }
  return db.audits.add({ ...record, createdAt: now, updatedAt: now });
}

export async function listAudits(): Promise<AuditRecord[]> {
  return getDb().audits.orderBy('updatedAt').reverse().toArray();
}

export async function getAudit(id: number): Promise<AuditRecord | undefined> {
  return getDb().audits.get(id);
}

export async function deleteAudit(id: number): Promise<void> {
  await getDb().audits.delete(id);
}

export async function searchAudits(query: string): Promise<AuditRecord[]> {
  const all = await listAudits();
  const needle = query.trim().toLowerCase();
  if (!needle) return all;
  return all.filter((a) => a.url.toLowerCase().includes(needle) || a.notes.toLowerCase().includes(needle) || a.tags.some((t) => t.toLowerCase().includes(needle)));
}

export async function purgeAllAudits(): Promise<void> {
  await getDb().audits.clear();
}

export async function getSetting<T>(key: string): Promise<T | undefined> {
  const row = await getDb().settings.get(key);
  return row?.value as T | undefined;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await getDb().settings.put({ key, value });
}

// IndexedDB vault for Geo Intelligence Hub (Dexie). Scoped to its own database
// name so it cannot collide with any other InMo Tools suite.

import Dexie, { type Table } from 'dexie';
import type { ExportMetadata, LocationProfile } from '../core/types';
import { EMPTY_METADATA } from '../core/types';
import type { CachedEntry, ResponseCache } from './http';

export const HISTORY_LIMIT = 50;
export const RESPONSE_CACHE_LIMIT = 2_000;

export interface StoredProfile {
  id: string;
  name: string;
  starred: boolean;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  profile: LocationProfile;
  metadata: ExportMetadata;
}

export interface StoredSetting {
  key: string;
  value: unknown;
}

class GeoIntelDb extends Dexie {
  responses!: Table<CachedEntry, string>;
  profiles!: Table<StoredProfile, string>;
  settings!: Table<StoredSetting, string>;

  constructor() {
    super('inmotools-geo-intelligence-hub');
    this.version(1).stores({
      responses: 'key, storedAt, source',
      profiles: 'id, updatedAt, starred, *tags',
      settings: 'key',
    });
  }
}

let instance: GeoIntelDb | null = null;
const db = () => (instance ??= new GeoIntelDb());

export function resetGeoIntelDbForTests(): void {
  instance?.close();
  instance = null;
}

export class DexieResponseCache implements ResponseCache {
  private writes = 0;
  async get(key: string) { return db().responses.get(key); }
  async set(entry: CachedEntry) {
    await db().responses.put(entry);
    this.writes += 1;
    if (this.writes % 50 === 0) await pruneResponses();
  }
}

export async function pruneResponses(limit = RESPONSE_CACHE_LIMIT): Promise<number> {
  const count = await db().responses.count();
  if (count <= limit) return 0;
  const excess = await db().responses.orderBy('storedAt').limit(count - limit).primaryKeys();
  await db().responses.bulkDelete(excess);
  return excess.length;
}

export async function clearResponseCache(): Promise<void> {
  await db().responses.clear();
}

export async function responseCacheStats(): Promise<{ entries: number; bySource: Record<string, number> }> {
  const bySource: Record<string, number> = {};
  await db().responses.each((entry) => { bySource[entry.source] = (bySource[entry.source] ?? 0) + 1; });
  return { entries: Object.values(bySource).reduce((a, b) => a + b, 0), bySource };
}

// ---------------- Profiles (history + saved) ----------------

/** Adds or refreshes a profile, then trims unstarred history to HISTORY_LIMIT. */
export async function recordProfile(profile: LocationProfile, now = Date.now()): Promise<StoredProfile> {
  const existing = await db().profiles.get(profile.id);
  const record: StoredProfile = existing
    ? { ...existing, profile, updatedAt: now }
    : { id: profile.id, name: profile.label, starred: false, tags: [], createdAt: now, updatedAt: now, profile, metadata: { ...EMPTY_METADATA } };
  await db().profiles.put(record);
  await trimHistory();
  return record;
}

export async function trimHistory(limit = HISTORY_LIMIT): Promise<number> {
  const unstarred = await db().profiles.filter((item) => !item.starred).toArray();
  if (unstarred.length <= limit) return 0;
  const remove = unstarred.sort((a, b) => b.updatedAt - a.updatedAt).slice(limit).map((item) => item.id);
  await db().profiles.bulkDelete(remove);
  return remove.length;
}

export async function listProfiles(): Promise<StoredProfile[]> {
  const all = await db().profiles.toArray();
  return all.sort((a, b) => Number(b.starred) - Number(a.starred) || b.updatedAt - a.updatedAt);
}

export async function getProfile(id: string): Promise<StoredProfile | undefined> {
  return db().profiles.get(id);
}

export async function updateProfileMeta(id: string, patch: Partial<Pick<StoredProfile, 'name' | 'starred' | 'tags' | 'metadata'>>): Promise<StoredProfile | undefined> {
  const existing = await db().profiles.get(id);
  if (!existing) return undefined;
  const tags = patch.tags ? normalizeTags(patch.tags) : existing.tags;
  const next: StoredProfile = { ...existing, ...patch, tags, name: (patch.name ?? existing.name).trim() || existing.profile.label, updatedAt: Date.now() };
  await db().profiles.put(next);
  if (patch.starred === false) await trimHistory();
  return next;
}

export async function deleteProfile(id: string): Promise<void> {
  await db().profiles.delete(id);
}

export async function clearHistory(keepStarred = true): Promise<void> {
  if (!keepStarred) { await db().profiles.clear(); return; }
  const ids = await db().profiles.filter((item) => !item.starred).primaryKeys();
  await db().profiles.bulkDelete(ids);
}

export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags) {
    const tag = raw.trim().replace(/\s+/g, ' ').slice(0, 40);
    const key = tag.toLowerCase();
    if (tag && !seen.has(key)) { seen.add(key); out.push(tag); }
  }
  return out.slice(0, 20);
}

export const parseTagInput = (text: string) => normalizeTags(text.split(','));

// ---------------- Settings ----------------

export interface GeoIntelSettings {
  nominatimEnabled: boolean;
  defaultPostalCountry: string;
  units: 'metric' | 'imperial' | 'both';
  choroplethIndicator: string;
}

export const DEFAULT_SETTINGS: GeoIntelSettings = {
  nominatimEnabled: false,
  defaultPostalCountry: 'US',
  units: 'both',
  choroplethIndicator: 'EN.POP.DNST',
};

export async function loadSettings(): Promise<GeoIntelSettings> {
  const row = await db().settings.get('settings');
  const value = (row?.value ?? {}) as Partial<GeoIntelSettings>;
  return {
    nominatimEnabled: value.nominatimEnabled === true,
    defaultPostalCountry: typeof value.defaultPostalCountry === 'string' && /^[A-Z]{2}$/.test(value.defaultPostalCountry) ? value.defaultPostalCountry : DEFAULT_SETTINGS.defaultPostalCountry,
    units: value.units === 'metric' || value.units === 'imperial' ? value.units : 'both',
    choroplethIndicator: typeof value.choroplethIndicator === 'string' ? value.choroplethIndicator : DEFAULT_SETTINGS.choroplethIndicator,
  };
}

export async function saveSettings(settings: GeoIntelSettings): Promise<void> {
  await db().settings.put({ key: 'settings', value: settings });
}

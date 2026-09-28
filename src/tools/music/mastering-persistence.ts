/**
 * Project persistence for the Audio Mastering workstation (ledgers 18, 81).
 *
 * - `parseMasteringDocument` is the one gate every stored or imported project
 *   passes: it checks the shape, drops what it cannot trust, and returns a
 *   document the rest of the tool can use as is.
 * - Autosave keeps one session per open tab in IndexedDB. A session is the
 *   document plus the original bytes of every source file, written in a single
 *   transaction so a crash leaves either the previous save or the new one,
 *   never a mix. Recovery re-decodes the stored files.
 * - Backups are a ZIP with `project.json` (versioned) and a `sources/` folder
 *   holding the original files, so a project moves between browsers intact.
 * - Master-chain presets live in their own store and are normalized on load.
 */
import { normalizeMasterSettings, type MasterSettings } from './dsp/master-chain';
import type { AudioEdit, MasteringMarker, MasteringRegion } from './mastering-engine';
import { FADE_CURVES, MAX_TRACKS, type ClipFade, type MasteringClip, type MasteringDocument, type MasteringSourceReference, type MasteringTrack } from './mastering-project';

// --- SECTION: document validation ---

const EDIT_TYPES = new Set<AudioEdit['type']>([
  'crop', 'declick', 'declip', 'decrackle', 'deess', 'dehum', 'deleteRange', 'denoise', 'deplosive', 'dualMono',
  'extractChannel', 'foldDownMono', 'gain', 'hissGate', 'insertSilence', 'invertPolarity', 'normalizeLevel',
  'normalizePeak', 'pitchShift', 'quantize', 'removeDc', 'repairBurst', 'reverse', 'roomTone', 'samplePatch',
  'spectralAttenuate', 'spectralHeal', 'swapStereo', 'timeStretch',
]);
const CURVES = new Set(FADE_CURVES.map((option) => option.value));

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, fallback = '', max = 200) => (typeof value === 'string' ? value.slice(0, max) : fallback);
const number = (value: unknown, fallback = 0) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const nonNegative = (value: unknown) => Math.max(0, number(value));
const clamp = (value: unknown, low: number, high: number, fallback: number) => Math.min(high, Math.max(low, number(value, fallback)));
const bool = (value: unknown) => value === true;

class ProjectFormatError extends Error {
  constructor(message: string) { super(message); this.name = 'ProjectFormatError'; }
}

const fail = (message: string): never => { throw new ProjectFormatError(message); };

function parseFade(value: unknown): ClipFade {
  const fade = isObject(value) ? value : {};
  const curve = typeof fade.curve === 'string' && CURVES.has(fade.curve as ClipFade['curve']) ? fade.curve as ClipFade['curve'] : 'equalPower';
  return { durationSeconds: nonNegative(fade.durationSeconds), curve };
}

function parseEdit(value: unknown, clipName: string): AudioEdit {
  if (!isObject(value) || typeof value.type !== 'string' || !EDIT_TYPES.has(value.type as AudioEdit['type'])) {
    return fail(`The project has an edit on ${clipName} this version does not recognise.`);
  }
  // Edits are plain data; a JSON round trip drops functions, prototypes, and undefined.
  return JSON.parse(JSON.stringify(value)) as AudioEdit;
}

function parseSource(value: unknown, index: number): MasteringSourceReference {
  if (!isObject(value) || typeof value.id !== 'string' || !value.id) return fail(`Source ${index + 1} in the project has no id.`);
  return {
    id: value.id.slice(0, 120),
    name: text(value.name, `Source ${index + 1}`),
    sampleRate: clamp(value.sampleRate, 1, 768_000, 48_000),
    channelCount: clamp(value.channelCount, 1, 2, 1),
    frameCount: Math.round(nonNegative(value.frameCount)),
    fileSize: nonNegative(value.fileSize),
    lastModified: nonNegative(value.lastModified),
    codec: text(value.codec, 'unknown', 60),
  };
}

function parseClip(value: unknown, sources: ReadonlySet<string>, seen: Set<string>): MasteringClip {
  if (!isObject(value) || typeof value.id !== 'string' || !value.id) return fail('A clip in the project has no id.');
  const id = value.id.slice(0, 120);
  if (seen.has(id)) return fail('Two clips in the project share one id.');
  seen.add(id);
  const name = text(value.name, 'Clip', 120);
  if (typeof value.sourceId !== 'string' || !sources.has(value.sourceId)) return fail(`${name} points to audio that is not in the project.`);
  const edits = Array.isArray(value.edits) ? value.edits.map((edit) => parseEdit(edit, name)) : [];
  return {
    id,
    name,
    sourceId: value.sourceId,
    startSeconds: nonNegative(value.startSeconds),
    edits,
    gainDb: clamp(value.gainDb, -96, 24, 0),
    pan: clamp(value.pan, -1, 1, 0),
    muted: bool(value.muted),
    solo: bool(value.solo),
    fadeIn: parseFade(value.fadeIn),
    fadeOut: parseFade(value.fadeOut),
  };
}

function parseTrack(value: unknown, index: number, sources: ReadonlySet<string>, clipIds: Set<string>): MasteringTrack {
  if (!isObject(value) || typeof value.id !== 'string' || !value.id) return fail(`Track ${index + 1} in the project has no id.`);
  return {
    id: value.id.slice(0, 120),
    name: text(value.name, `Track ${index + 1}`, 120),
    gainDb: clamp(value.gainDb, -96, 24, 0),
    pan: clamp(value.pan, -1, 1, 0),
    muted: bool(value.muted),
    solo: bool(value.solo),
    clips: Array.isArray(value.clips) ? value.clips.map((clip) => parseClip(clip, sources, clipIds)) : [],
  };
}

const parseMarker = (value: unknown, index: number): MasteringMarker | null => (isObject(value)
  ? { id: text(value.id, `marker-${index}`, 120) || `marker-${index}`, label: text(value.label, `Marker ${index + 1}`, 120), seconds: nonNegative(value.seconds) }
  : null);

function parseRegion(value: unknown, index: number): MasteringRegion | null {
  if (!isObject(value)) return null;
  const startSeconds = nonNegative(value.startSeconds);
  const endSeconds = nonNegative(value.endSeconds);
  if (endSeconds <= startSeconds) return null;
  return { id: text(value.id, `region-${index}`, 120) || `region-${index}`, label: text(value.label, `Region ${index + 1}`, 120), startSeconds, endSeconds };
}

/**
 * Validates an untrusted project (from storage or a backup file) and returns a clean document.
 * Values outside their ranges are clamped; structural damage (unknown edits, clips pointing at
 * missing audio, repeated ids) is refused with a message that says what is wrong.
 * @throws {Error} when the value is not a version 2 Audio Mastering project.
 */
export function parseMasteringDocument(value: unknown): MasteringDocument {
  if (!isObject(value) || value.version !== 2) return fail('This is not an Audio Mastering project, or it was saved by a newer version.');
  const sources = Array.isArray(value.sources) ? value.sources.map(parseSource) : [];
  const sourceIds = new Set(sources.map((source) => source.id));
  if (sourceIds.size !== sources.length) return fail('Two audio sources in the project share one id.');
  const rawTracks = Array.isArray(value.tracks) ? value.tracks : [];
  if (rawTracks.length > MAX_TRACKS) return fail(`The project has ${rawTracks.length} tracks; this tool holds up to ${MAX_TRACKS}.`);
  const clipIds = new Set<string>();
  const tracks = rawTracks.map((track, index) => parseTrack(track, index, sourceIds, clipIds));
  const trackIds = new Set(tracks.map((track) => track.id));
  if (trackIds.size !== tracks.length) return fail('Two tracks in the project share one id.');
  const sampleRate = value.sampleRate === null ? null : clamp(value.sampleRate, 1, 768_000, 48_000);
  if (sampleRate === null && tracks.some((track) => track.clips.length)) return fail('The project has audio but no sample rate.');
  const selection = isObject(value.selection) ? value.selection : {};
  const start = nonNegative(selection.startSeconds);
  const end = nonNegative(selection.endSeconds);
  const markers = (Array.isArray(value.markers) ? value.markers : []).map(parseMarker).filter((marker): marker is MasteringMarker => marker !== null);
  if (new Set(markers.map((marker) => marker.id)).size !== markers.length) return fail('Two markers in the project share one id.');
  const regions = (Array.isArray(value.regions) ? value.regions : []).map(parseRegion).filter((region): region is MasteringRegion => region !== null);
  if (new Set(regions.map((region) => region.id)).size !== regions.length) return fail('Two regions in the project share one id.');
  const metadataEdits: Record<string, string> = {};
  if (isObject(value.metadataEdits)) for (const [key, entry] of Object.entries(value.metadataEdits)) if (typeof entry === 'string') metadataEdits[key.slice(0, 60)] = entry.slice(0, 2000);
  const activeClipId = typeof value.activeClipId === 'string' ? value.activeClipId.slice(0, 120) : null;
  return {
    version: 2,
    sampleRate,
    sources,
    tracks,
    activeClipId: activeClipId && clipIds.has(activeClipId) ? activeClipId : null,
    selection: { startSeconds: Math.min(start, end), endSeconds: Math.max(start, end) },
    playhead: nonNegative(value.playhead),
    markers,
    regions,
    metadataEdits,
    master: normalizeMasterSettings(isObject(value.master) ? value.master as Partial<MasterSettings> : undefined),
  };
}

// --- SECTION: IndexedDB store ---

const DB_NAME = 'inmotools.audio-mastering';
const DB_VERSION = 1;
const SESSIONS = 'sessions';
const SOURCES = 'sources';
const PRESETS = 'presets';
/** Older tab sessions beyond this count are removed with their audio. */
export const MAX_SESSIONS = 5;

export interface StoredSession {
  id: string;
  savedAt: number;
  document: MasteringDocument;
  /** Names of the sources whose bytes are stored, for the recovery prompt. */
  sourceNames: string[];
}

export interface MasterPreset {
  id: string;
  name: string;
  savedAt: number;
  settings: MasterSettings;
}

const request = <T>(operation: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  operation.onsuccess = () => resolve(operation.result);
  operation.onerror = () => reject(operation.error ?? new Error('Browser storage request failed.'));
});

const done = (transaction: IDBTransaction) => new Promise<void>((resolve, reject) => {
  transaction.oncomplete = () => resolve();
  transaction.onabort = () => reject(transaction.error ?? new Error('Browser storage write was cancelled.'));
  transaction.onerror = () => reject(transaction.error ?? new Error('Browser storage write failed.'));
});

/** True when the error means the browser refused more data, so the UI can say storage is full. */
export const isQuotaError = (error: unknown) => error instanceof DOMException && (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');

const sourceKey = (sessionId: string, sourceId: string) => `${sessionId}/${sourceId}`;

/** IndexedDB-backed session, source, and preset storage. One instance per workspace. */
export class MasteringStore {
  private constructor(private readonly db: IDBDatabase) {}

  /**
   * Opens (or creates) the database.
   * @throws {Error} when IndexedDB is unavailable, for example in some private windows.
   */
  static async open(factory: IDBFactory | undefined = globalThis.indexedDB): Promise<MasteringStore> {
    if (!factory) throw new Error('This browser does not offer local storage for projects.');
    const opening = factory.open(DB_NAME, DB_VERSION);
    opening.onupgradeneeded = () => {
      const db = opening.result;
      if (!db.objectStoreNames.contains(SESSIONS)) db.createObjectStore(SESSIONS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(SOURCES)) db.createObjectStore(SOURCES);
      if (!db.objectStoreNames.contains(PRESETS)) db.createObjectStore(PRESETS, { keyPath: 'id' });
    };
    const db = await request(opening);
    // Another tab upgrading the schema must not be blocked by this one.
    db.onversionchange = () => db.close();
    return new MasteringStore(db);
  }

  close() { this.db.close(); }

  /** Source ids known to be stored per session, so a save issues every write at once. */
  private readonly storedSources = new Map<string, Set<string>>();

  /**
   * Saves a tab's session: document plus any source bytes not stored yet, and removes
   * this session's stored sources the document no longer uses. Every write is issued
   * synchronously in one transaction, with no read first, so a save started while the
   * page unloads still commits as a whole.
   */
  async saveSession(sessionId: string, document: MasteringDocument, sources: ReadonlyMap<string, Blob>): Promise<void> {
    const transaction = this.db.transaction([SESSIONS, SOURCES], 'readwrite');
    const finished = done(transaction);
    const sourceStore = transaction.objectStore(SOURCES);
    const known = this.storedSources.get(sessionId) ?? new Set<string>();
    const needed = new Set(document.sources.map((source) => source.id));
    const nextKnown = new Set<string>();
    for (const id of known) if (!needed.has(id)) sourceStore.delete(sourceKey(sessionId, id));
    for (const id of needed) {
      if (known.has(id)) { nextKnown.add(id); continue; }
      const blob = sources.get(id);
      if (blob) { sourceStore.put(blob, sourceKey(sessionId, id)); nextKnown.add(id); }
    }
    const record: StoredSession = { id: sessionId, savedAt: Date.now(), document, sourceNames: document.sources.map((source) => source.name) };
    transaction.objectStore(SESSIONS).put(record);
    // Commit now rather than when the event loop idles: during pagehide there may be no later turn.
    transaction.commit?.();
    await finished;
    this.storedSources.set(sessionId, nextKnown);
  }

  /** Every stored session, newest first. Records that fail validation are skipped, not thrown. */
  async listSessions(): Promise<StoredSession[]> {
    const transaction = this.db.transaction(SESSIONS, 'readonly');
    const raw = await request(transaction.objectStore(SESSIONS).getAll());
    const sessions: StoredSession[] = [];
    for (const item of raw as unknown[]) {
      if (!isObject(item) || typeof item.id !== 'string') continue;
      try {
        sessions.push({ id: item.id, savedAt: number(item.savedAt), document: parseMasteringDocument(item.document), sourceNames: Array.isArray(item.sourceNames) ? item.sourceNames.map((name) => text(name)) : [] });
      } catch { /* a damaged record is left for deleteSession or pruning */ }
    }
    return sessions.sort((a, b) => b.savedAt - a.savedAt);
  }

  /** The stored bytes for each of a session's sources; missing ones are simply absent. */
  async loadSources(sessionId: string, sourceIds: readonly string[]): Promise<Map<string, Blob>> {
    const transaction = this.db.transaction(SOURCES, 'readonly');
    const store = transaction.objectStore(SOURCES);
    const entries = await Promise.all(sourceIds.map(async (id) => [id, await request(store.get(sourceKey(sessionId, id)))] as const));
    const found = new Map(entries.filter((entry): entry is readonly [string, Blob] => entry[1] instanceof Blob));
    // A restored session keeps saving under its id; its stored audio need not be written again.
    this.storedSources.set(sessionId, new Set(found.keys()));
    return found;
  }

  async deleteSession(sessionId: string): Promise<void> {
    const transaction = this.db.transaction([SESSIONS, SOURCES], 'readwrite');
    const finished = done(transaction);
    transaction.objectStore(SESSIONS).delete(sessionId);
    transaction.objectStore(SOURCES).delete(IDBKeyRange.bound(`${sessionId}/`, `${sessionId}/\uffff`));
    await finished;
    this.storedSources.delete(sessionId);
  }

  /** Keeps the newest {@link MAX_SESSIONS} sessions (always keeping `keep`) and deletes the rest. */
  async pruneSessions(keep: string): Promise<number> {
    const sessions = await this.listSessionIds();
    const removable = sessions.filter((session) => session.id !== keep).slice(Math.max(0, MAX_SESSIONS - 1));
    for (const session of removable) await this.deleteSession(session.id);
    return removable.length;
  }

  private async listSessionIds(): Promise<Array<{ id: string; savedAt: number }>> {
    const transaction = this.db.transaction(SESSIONS, 'readonly');
    const raw = await request(transaction.objectStore(SESSIONS).getAll()) as unknown[];
    return raw.filter(isObject).filter((item) => typeof item.id === 'string')
      .map((item) => ({ id: item.id as string, savedAt: number(item.savedAt) }))
      .sort((a, b) => b.savedAt - a.savedAt);
  }

  // --- presets ---

  async listPresets(): Promise<MasterPreset[]> {
    const transaction = this.db.transaction(PRESETS, 'readonly');
    const raw = await request(transaction.objectStore(PRESETS).getAll()) as unknown[];
    return raw.filter(isObject).filter((item) => typeof item.id === 'string' && typeof item.name === 'string')
      .map((item) => ({ id: item.id as string, name: text(item.name, 'Preset', 80), savedAt: number(item.savedAt), settings: normalizeMasterSettings(isObject(item.settings) ? item.settings as Partial<MasterSettings> : undefined) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Saves a preset; a name that already exists (ignoring case) is replaced rather than duplicated. */
  async savePreset(name: string, settings: MasterSettings): Promise<MasterPreset> {
    const trimmed = name.trim().slice(0, 80);
    if (!trimmed) throw new Error('Give the preset a name.');
    const existing = (await this.listPresets()).find((preset) => preset.name.toLowerCase() === trimmed.toLowerCase());
    const preset: MasterPreset = { id: existing?.id ?? `preset-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`, name: trimmed, savedAt: Date.now(), settings: normalizeMasterSettings(settings) };
    const transaction = this.db.transaction(PRESETS, 'readwrite');
    const finished = done(transaction);
    transaction.objectStore(PRESETS).put(preset);
    await finished;
    return preset;
  }

  async deletePreset(id: string): Promise<void> {
    const transaction = this.db.transaction(PRESETS, 'readwrite');
    const finished = done(transaction);
    transaction.objectStore(PRESETS).delete(id);
    await finished;
  }
}

// --- SECTION: backup files ---

export const BACKUP_FORMAT = 'inmotools-audio-mastering';
export const BACKUP_VERSION = 1;

interface BackupManifest {
  format: typeof BACKUP_FORMAT;
  version: number;
  savedAt: string;
  document: MasteringDocument;
  /** Path inside the ZIP for each source id. */
  files: Record<string, string>;
}

/**
 * Packs the project and its original audio into one ZIP.
 * @throws {Error} naming the first source whose audio is not available to include.
 */
export async function buildProjectBackup(document: MasteringDocument, sources: ReadonlyMap<string, Blob>, savedAt = new Date()): Promise<Uint8Array> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const files: Record<string, string> = {};
  for (const [index, source] of document.sources.entries()) {
    const blob = sources.get(source.id);
    if (!blob) throw new Error(`The audio for ${source.name} is not available to include. Open the file again, then save the backup.`);
    const safe = source.name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').slice(0, 100) || 'audio';
    const path = `sources/${String(index + 1).padStart(2, '0')} ${safe}`;
    files[source.id] = path;
    zip.file(path, await blob.arrayBuffer(), { compression: 'STORE' });
  }
  const manifest: BackupManifest = { format: BACKUP_FORMAT, version: BACKUP_VERSION, savedAt: savedAt.toISOString(), document, files };
  zip.file('project.json', JSON.stringify(manifest, null, 2), { compression: 'DEFLATE' });
  return zip.generateAsync({ type: 'uint8array' });
}

export interface RestoredBackup {
  document: MasteringDocument;
  sources: Map<string, Blob>;
  savedAt: string;
}

/**
 * Reads a backup ZIP made by {@link buildProjectBackup}.
 * @throws {Error} when the file is not a backup, is from a newer version, or misses audio it lists.
 */
export async function readProjectBackup(data: Blob | Uint8Array | ArrayBuffer): Promise<RestoredBackup> {
  const { default: JSZip } = await import('jszip');
  let zip;
  try { zip = await JSZip.loadAsync(data); } catch { return fail('This file is not a project backup (it is not a ZIP).'); }
  const manifestFile = zip.file('project.json');
  if (!manifestFile) return fail('This ZIP has no project.json, so it is not a project backup.');
  let manifest: unknown;
  try { manifest = JSON.parse(await manifestFile.async('string')); } catch { return fail('The backup\'s project.json is damaged.'); }
  if (!isObject(manifest) || manifest.format !== BACKUP_FORMAT) return fail('This ZIP is not an Audio Mastering project backup.');
  if (typeof manifest.version !== 'number' || manifest.version > BACKUP_VERSION) return fail('This backup was saved by a newer version of the tool.');
  const document = parseMasteringDocument(manifest.document);
  const paths = isObject(manifest.files) ? manifest.files : {};
  const sources = new Map<string, Blob>();
  for (const source of document.sources) {
    const path = paths[source.id];
    const file = typeof path === 'string' ? zip.file(path) : null;
    if (!file) return fail(`The backup is missing the audio for ${source.name}.`);
    sources.set(source.id, new Blob([await file.async('arraybuffer')]));
  }
  return { document, sources, savedAt: text(manifest.savedAt, '', 40) };
}

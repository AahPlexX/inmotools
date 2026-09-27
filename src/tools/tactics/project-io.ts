import JSZip from 'jszip';
import { createNormalizedPoint } from './pitch-engine';
import { TACTICS_SCHEMA_VERSION, validateTacticalProject } from './tactics-engine';
import type {
  ImportProvenance,
  TacticalKeyframe,
  TacticalProject,
  TimelineTrack,
} from './tactics-types';

const TACTICAL_PROJECT_TOOL_ID = 'inmotools-tactical-matchboard';
const TRAJECTORY_TOOL_ID = 'inmotools-tactical-trajectory';
const TRAJECTORY_SCHEMA_VERSION = 1 as const;
const MAX_PROJECT_JSON_BYTES = 20 * 1024 * 1024;
const MAX_PROJECT_ZIP_BYTES = 256 * 1024 * 1024;
const MAX_ASSET_BYTES = 128 * 1024 * 1024;
const MAX_TRAJECTORY_SAMPLES = 100_000;
const ZIP_DATE = new Date('1980-01-01T00:00:00.000Z');

export interface PortableTrajectorySample {
  targetId: string;
  timeMs: number;
  position: { x: number; y: number };
}

export interface TacticalZipAsset {
  mediaId: string;
  path: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface TacticalZipManifest {
  tool: typeof TACTICAL_PROJECT_TOOL_ID;
  schemaVersion: number;
  projectFile: 'project.json';
  assets: TacticalZipAsset[];
}

export interface ImportedTacticalZip {
  project: TacticalProject;
  manifest: TacticalZipManifest;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`);
  return value;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function portableProject(project: TacticalProject): TacticalProject {
  return JSON.parse(JSON.stringify(project, (key, value) => (
    key === 'blob' && typeof Blob !== 'undefined' && value instanceof Blob ? undefined : value
  ))) as TacticalProject;
}

function appendProvenance(
  project: TacticalProject,
  sourceType: ImportProvenance['sourceType'],
  sourceName: string,
): TacticalProject {
  const provenance: ImportProvenance = {
    sourceType,
    sourceName,
    importedAt: new Date().toISOString(),
  };
  return {
    ...project,
    importProvenance: [...project.importProvenance.map((item) => ({ ...item })), provenance],
  };
}

function assertRequiredProjectShape(value: Record<string, unknown>): void {
  if (typeof value.id !== 'string' || !value.id.trim()) throw new Error('Invalid tactical project: project id is missing.');
  for (const key of [
    'metadata', 'ruleset', 'pitch', 'ball', 'timeline', 'analysisSettings',
    'sessionPlan', 'exportPreferences',
  ]) as const {
    asRecord(value[key], `Tactical project ${key}`);
  }
  for (const key of [
    'teams', 'playerTokens', 'officials', 'equipment', 'scenes', 'formationStates',
    'annotations', 'cameraStates', 'media', 'importProvenance',
  ]) as const {
    if (!Array.isArray(value[key])) throw new Error(`Invalid tactical project: ${key} must be an array.`);
  }
}

export function migrateTacticalProject(raw: unknown): TacticalProject {
  const source = asRecord(structuredClone(raw), 'Tactical project');
  const schemaVersion = source.schemaVersion;
  if (!Number.isInteger(schemaVersion)) throw new Error('Tactical project schema version is missing.');
  if ((schemaVersion as number) > TACTICS_SCHEMA_VERSION) {
    throw new Error(`Unsupported future tactical project schema version: ${String(schemaVersion)}.`);
  }
  if ((schemaVersion as number) < 1) {
    throw new Error(`Unsupported tactical project schema version: ${String(schemaVersion)}.`);
  }

  if (schemaVersion === 1) {
    const timeline = asRecord(source.timeline, 'Tactical project timeline');
    source.timeline = {
      ...timeline,
      possessionEvents: Array.isArray(timeline.possessionEvents) ? timeline.possessionEvents : [],
    };
    source.schemaVersion = 2;
  }

  if (source.schemaVersion !== TACTICS_SCHEMA_VERSION) {
    throw new Error(`Unsupported tactical project schema version: ${String(source.schemaVersion)}.`);
  }

  assertRequiredProjectShape(source);
  const candidate = source as unknown as TacticalProject;
  let errors: string[];
  try {
    errors = validateTacticalProject(candidate);
  } catch (error) {
    throw new Error(`Invalid tactical project structure: ${error instanceof Error ? error.message : 'validation failed'}`);
  }
  if (errors.length) throw new Error(`Invalid tactical project: ${errors.join(' ')}`);
  return candidate;
}

function parseProjectText(
  text: string,
  sourceType: 'project-json' | 'project-zip',
  sourceName: string,
): TacticalProject {
  if (utf8Bytes(text) > MAX_PROJECT_JSON_BYTES) throw new Error('Tactical project JSON exceeds the local import size limit.');
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Tactical project JSON is not valid JSON.');
  }
  return appendProvenance(migrateTacticalProject(parsed), sourceType, sourceName);
}

export function exportTacticalProjectJson(project: TacticalProject): string {
  const current = migrateTacticalProject(project);
  return JSON.stringify(portableProject(current), null, 2);
}

export function importTacticalProjectJson(text: string, sourceName: string): TacticalProject {
  return parseProjectText(text, 'project-json', sourceName);
}

function safeSegment(value: string, fallback: string): string {
  const normalized = value.normalize('NFKC')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^\.+/, '')
    .replace(/_+/g, '_')
    .slice(0, 96);
  return normalized || fallback;
}

function assetPath(mediaId: string, name: string): string {
  return `assets/${safeSegment(mediaId, 'media')}-${safeSegment(name, 'asset.bin')}`;
}

function assertSafeZipEntry(name: string, unsafeOriginalName?: string): void {
  const original = unsafeOriginalName ?? name;
  if (
    original !== name
    || original.startsWith('/')
    || original.startsWith('\\')
    || original.includes('\\')
    || original.split('/').some((segment) => segment === '..' || segment === '.')
  ) {
    throw new Error(`Unsafe ZIP path rejected: ${original}`);
  }
}

export async function exportTacticalProjectZip(project: TacticalProject): Promise<Uint8Array> {
  const current = migrateTacticalProject(project);
  const zip = new JSZip();
  const assets: TacticalZipAsset[] = [];

  for (const media of [...current.media].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!media.blob) continue;
    if (media.blob.size > MAX_ASSET_BYTES) throw new Error(`Local asset ${media.name} exceeds the ZIP asset size limit.`);
    const path = assetPath(media.id, media.name);
    assets.push({
      mediaId: media.id,
      path,
      name: media.name,
      mimeType: media.mimeType || media.blob.type || 'application/octet-stream',
      sizeBytes: media.blob.size,
    });
    zip.file(path, new Uint8Array(await media.blob.arrayBuffer()), { date: ZIP_DATE, createFolders: true });
  }

  const manifest: TacticalZipManifest = {
    tool: TACTICAL_PROJECT_TOOL_ID,
    schemaVersion: TACTICS_SCHEMA_VERSION,
    projectFile: 'project.json',
    assets,
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2), { date: ZIP_DATE, createFolders: false });
  zip.file('project.json', exportTacticalProjectJson(current), { date: ZIP_DATE, createFolders: false });

  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    platform: 'DOS',
  });
}

function parseManifest(text: string): TacticalZipManifest {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Tactical ZIP manifest is not valid JSON.');
  }
  const record = asRecord(value, 'Tactical ZIP manifest');
  if (record.tool !== TACTICAL_PROJECT_TOOL_ID) throw new Error('Tactical ZIP manifest belongs to a different tool.');
  if (record.projectFile !== 'project.json') throw new Error('Tactical ZIP manifest project path is invalid.');
  if (!Number.isInteger(record.schemaVersion) || (record.schemaVersion as number) > TACTICS_SCHEMA_VERSION) {
    throw new Error('Tactical ZIP manifest schema version is unsupported.');
  }
  if (!Array.isArray(record.assets)) throw new Error('Tactical ZIP manifest assets must be an array.');
  const assets = record.assets.map((asset, index) => {
    const item = asRecord(asset, `Tactical ZIP asset ${index + 1}`);
    const parsed: TacticalZipAsset = {
      mediaId: requireString(item.mediaId, 'Asset media id'),
      path: requireString(item.path, 'Asset path'),
      name: requireString(item.name, 'Asset name'),
      mimeType: requireString(item.mimeType, 'Asset MIME type'),
      sizeBytes: Number(item.sizeBytes),
    };
    assertSafeZipEntry(parsed.path);
    if (!Number.isInteger(parsed.sizeBytes) || parsed.sizeBytes < 0 || parsed.sizeBytes > MAX_ASSET_BYTES) {
      throw new Error(`Asset ${parsed.name} has an invalid declared size.`);
    }
    return parsed;
  });
  return {
    tool: TACTICAL_PROJECT_TOOL_ID,
    schemaVersion: record.schemaVersion as number,
    projectFile: 'project.json',
    assets,
  };
}

export async function importTacticalProjectZip(
  data: Uint8Array | ArrayBuffer | Blob,
  sourceName: string,
): Promise<ImportedTacticalZip> {
  const inputSize = data instanceof Blob ? data.size : data.byteLength;
  if (inputSize > MAX_PROJECT_ZIP_BYTES) throw new Error('Tactical project ZIP exceeds the local import size limit.');

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data, { checkCRC32: true, createFolders: false });
  } catch {
    throw new Error('Tactical project ZIP could not be decoded.');
  }

  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue;
    assertSafeZipEntry(entry.name, entry.unsafeOriginalName);
  }

  const manifestEntry = zip.file('manifest.json');
  const projectEntry = zip.file('project.json');
  if (!manifestEntry || !projectEntry) throw new Error('Tactical project ZIP must contain manifest.json and project.json.');

  const manifest = parseManifest(await manifestEntry.async('string'));
  let project = parseProjectText(await projectEntry.async('string'), 'project-zip', sourceName);

  const assetsById = new Map<string, { blob: Blob; sizeBytes: number }>();
  let totalAssetBytes = 0;
  for (const asset of manifest.assets) {
    const entry = zip.file(asset.path);
    if (!entry) throw new Error(`Tactical ZIP is missing asset ${asset.path}.`);
    const bytes = await entry.async('uint8array');
    if (bytes.byteLength !== asset.sizeBytes) throw new Error(`Tactical ZIP asset ${asset.name} size does not match its manifest.`);
    totalAssetBytes += bytes.byteLength;
    if (totalAssetBytes > MAX_PROJECT_ZIP_BYTES) throw new Error('Tactical ZIP expanded assets exceed the local import size limit.');
    assetsById.set(asset.mediaId, {
      blob: new Blob([bytes], { type: asset.mimeType }),
      sizeBytes: bytes.byteLength,
    });
  }

  project = {
    ...project,
    media: project.media.map((media) => {
      const asset = assetsById.get(media.id);
      return asset ? { ...media, blob: asset.blob, sizeBytes: asset.sizeBytes } : { ...media };
    }),
  };
  return { project, manifest };
}

function trajectorySamples(project: TacticalProject): PortableTrajectorySample[] {
  return project.timeline.tracks
    .flatMap((track) => track.keyframes
      .filter((keyframe) => keyframe.position)
      .map((keyframe) => ({
        targetId: track.targetId,
        timeMs: keyframe.timeMs,
        position: { ...keyframe.position! },
      })))
    .sort((left, right) => left.targetId.localeCompare(right.targetId) || left.timeMs - right.timeMs);
}

function csvEscape(value: string): string {
  if (!/[",\r\n]/.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

export function exportTrajectoryCsv(project: TacticalProject): string {
  const rows = trajectorySamples(project).map((sample) => (
    [csvEscape(sample.targetId), sample.timeMs, sample.position.x, sample.position.y].join(',')
  ));
  return ['targetId,timeMs,x,y', ...rows].join('\n');
}

export function exportTrajectoryJson(project: TacticalProject): string {
  return JSON.stringify({
    tool: TRAJECTORY_TOOL_ID,
    schemaVersion: TRAJECTORY_SCHEMA_VERSION,
    samples: trajectorySamples(project),
  }, null, 2);
}

function parseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') {
      if (field) throw new Error('Trajectory CSV contains an invalid quote.');
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && text[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.length)) rows.push(row);
      row = [];
      field = '';
    } else field += char;
  }
  if (quoted) throw new Error('Trajectory CSV contains an unterminated quoted field.');
  if (field || row.length) {
    row.push(field);
    if (row.some((value) => value.length)) rows.push(row);
  }
  return rows;
}

function validateTrajectorySamples(samples: unknown[], sourceName: string): PortableTrajectorySample[] {
  if (samples.length > MAX_TRAJECTORY_SAMPLES) throw new Error('Trajectory import exceeds the sample-count limit.');
  const result = samples.map((raw, index) => {
    const record = asRecord(raw, `Trajectory sample ${index + 1}`);
    const targetId = requireString(record.targetId, 'Trajectory target id').trim();
    if (!targetId) throw new Error('Trajectory target id cannot be empty.');
    const timeMs = Number(record.timeMs);
    if (!Number.isInteger(timeMs) || timeMs < 0) throw new Error(`Trajectory sample time must be a non-negative integer in ${sourceName}.`);
    const positionRecord = record.position && typeof record.position === 'object'
      ? asRecord(record.position, 'Trajectory position')
      : { x: record.x, y: record.y };
    const position = createNormalizedPoint(Number(positionRecord.x), Number(positionRecord.y));
    return { targetId, timeMs, position };
  });
  const seen = new Set<string>();
  for (const sample of result) {
    const key = `${sample.targetId}: ${sample.timeMs}`;
    if (seen.has(key)) throw new Error(`Trajectory import has duplicate time ${sample.timeMs} for target ${sample.targetId}.`);
    seen.add(key);
  }
  return result.sort((left, right) => left.targetId.localeCompare(right.targetId) || left.timeMs - right.timeMs);
}

export function parseTrajectoryCsv(text: string, sourceName: string): PortableTrajectorySample[] {
  if (utf8Bytes(text) > MAX_PROJECT_JSON_BYTES) throw new Error('Trajectory CSV exceeds the local import size limit.');
  const rows = parseCsvRows(text);
  const header = rows.shift();
  if (!header || header.length !== 4 || header.join(',') !== 'targetId,timeMs,x,y') {
    throw new Error('Trajectory CSV header must be targetId,timeMs,x,y.');
  }
  return validateTrajectorySamples(rows.map((row) => {
    if (row.length !== 4) throw new Error('Trajectory CSV rows must contain exactly four fields.');
    return { targetId: row[0], timeMs: row[1], x: row[2], y: row[3] };
  }), sourceName);
}

export function parseTrajectoryJson(text: string, sourceName: string): PortableTrajectorySample[] {
  if (utf8Bytes(text) > MAX_PROJECT_JSON_BYTES) throw new Error('Trajectory JSON exceeds the local import size limit.');
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('Trajectory JSON is not valid JSON.');
  }
  const record = asRecord(value, 'Trajectory JSON');
  if (record.tool !== TRAJECTORY_TOOL_ID || record.schemaVersion !== TRAJECTORY_SCHEMA_VERSION) {
    throw new Error('Trajectory JSON tool or schema version is unsupported.');
  }
  if (!Array.isArray(record.samples)) throw new Error('Trajectory JSON samples must be an array.');
  return validateTrajectorySamples(record.samples, sourceName);
}

function knownPositionTargets(project: TacticalProject): Set<string> {
  return new Set([
    'ball',
    ...project.playerTokens.map((item) => item.id),
    ...project.officials.map((item) => item.id),
    ...project.equipment.map((item) => item.id),
    ...project.scenes.flatMap((scene) => scene.objects.map((item) => item.id)),
  ]);
}

function keyframeHasNonPositionState(keyframe: TacticalKeyframe): boolean {
  return keyframe.rotationDeg !== undefined || keyframe.visible !== undefined;
}

export function applyTrajectoryImport(
  project: TacticalProject,
  samplesInput: PortableTrajectorySample[],
  sourceType: 'trajectory-csv' | 'trajectory-json',
  sourceName: string,
): TacticalProject {
  const samples = validateTrajectorySamples(samplesInput, sourceName);
  const targets = knownPositionTargets(project);
  for (const sample of samples) {
    if (!targets.has(sample.targetId)) throw new Error(`Trajectory target ${sample.targetId} does not exist in this project.`);
  }

  const grouped = new Map<string, PortableTrajectorySample[]>();
  for (const sample of samples) {
    const items = grouped.get(sample.targetId) ?? [];
    items.push(sample);
    grouped.set(sample.targetId, items);
  }

  const remainingTracks = project.timeline.tracks.filter((track) => !grouped.has(track.targetId));
  const importedTracks: TimelineTrack[] = [];
  for (const [targetId, items] of grouped) {
    const existing = project.timeline.tracks.find((track) => track.targetId === targetId);
    const nonPositionByTime = new Map<number, TacticalKeyframe>();
    for (const keyframe of existing?.keyframes ?? []) {
      const preserved: TacticalKeyframe = {
        ...keyframe,
        position: undefined,
        motionPath: undefined,
      };
      if (keyframeHasNonPositionState(preserved)) nonPositionByTime.set(preserved.timeMs, preserved);
    }
    for (const [index, sample] of items.entries()) {
      const preserved = nonPositionByTime.get(sample.timeMs);
      nonPositionByTime.set(sample.timeMs, {
        ...(preserved ?? {
          id: `import-${safeSegment(targetId, 'target')}-${sample.timeMs}-${index + 1}`,
          timeMs: sample.timeMs,
          interpolation: index === items.length - 1 ? 'hold' : 'linear',
        }),
        position: { ...sample.position },
        interpolation: index === items.length - 1 ? 'hold' : preserved?.interpolation ?? 'linear',
      });
    }
    importedTracks.push({
      id: existing?.id ?? `track-${safeSegment(targetId, 'target')}`,
      targetId,
      keyframes: [...nonPositionByTime.values()].sort((a, b) => a.timeMs - b.timeMs || a.id.localeCompare(b.id)),
    });
  }

  const maxImportedTime = samples.reduce((max, sample) => Math.max(max, sample.timeMs), 0);
  return appendProvenance({
    ...project,
    timeline: {
      ...project.timeline,
      durationMs: Math.max(project.timeline.durationMs, maxImportedTime),
      tracks: [...remainingTracks, ...importedTracks],
    },
  }, sourceType, sourceName);
}

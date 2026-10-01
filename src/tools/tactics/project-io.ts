import JSZip from 'jszip';
import Papa from 'papaparse';
import { createNormalizedPoint, ensureStoredTrainingMarkings, metersToNormalized } from './pitch-engine';
import { MAX_TIMELINE_DURATION_MS, MAX_ZIP_ENTRIES } from './session-bounds';
import { TACTICS_SCHEMA_VERSION, validateTacticalProject } from './tactics-engine';
import { createEmptyVideoReview } from './video-review-engine';
import {
  TIMELINE_MARKER_KINDS,
  type ImportProvenance,
  type PitchDimensions,
  type TacticalKeyframe,
  type TacticalProject,
  type TimelineTrack,
} from './tactics-types';

const TACTICAL_PROJECT_TOOL_ID = 'inmotools-tactical-matchboard';
const TRAJECTORY_TOOL_ID = 'inmotools-tactical-trajectory';
const TRAJECTORY_SCHEMA_VERSION = 1 as const;
const MAX_PROJECT_JSON_BYTES = 20 * 1024 * 1024;
const MAX_PROJECT_ZIP_BYTES = 256 * 1024 * 1024;
export const MAX_ASSET_BYTES = 128 * 1024 * 1024;
const MAX_TRAJECTORY_SAMPLES = 100_000;
const ZIP_DATE = new Date('1980-01-01T00:00:00.000Z');

export type TrajectoryCoordinateSystem = 'normalized' | 'meters';

export interface PortableTrajectorySample {
  targetId: string;
  timeMs: number;
  position: { x: number; y: number };
  teamId?: string;
  zMeters?: number;
  orientationDeg?: number;
  event?: string;
  coordinateSystem: TrajectoryCoordinateSystem;
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

const CSV_FORMULA_PREFIX = /^[=+\-@\t\r]/;

function csvFormulaSafe(value: string): string {
  return CSV_FORMULA_PREFIX.test(value) ? `'${value}` : value;
}

function csvFormulaRestore(value: string): string {
  if (value.startsWith("'") && CSV_FORMULA_PREFIX.test(value.slice(1))) return value.slice(1);
  return value;
}

function zipBytes(data: Uint8Array | ArrayBuffer | Blob): Uint8Array | Promise<Uint8Array> {
  if (data instanceof Uint8Array) return data;
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return data.arrayBuffer().then((buffer) => new Uint8Array(buffer));
}

function readU16(bytes: Uint8Array, offset: number): number {
  return bytes[offset]! | (bytes[offset + 1]! << 8);
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]!
    | (bytes[offset + 1]! << 8)
    | (bytes[offset + 2]! << 16)
    | (bytes[offset + 3]! << 24)
  ) >>> 0;
}

function readZipDirectory(bytes: Uint8Array): Array<{ name: string; uncompressedSize: number }> {
  const minimum = Math.max(0, bytes.length - (22 + 0xffff));
  let endOffset = -1;
  for (let offset = bytes.length - 22; offset >= minimum; offset -= 1) {
    if (
      bytes[offset] !== 0x50
      || bytes[offset + 1] !== 0x4b
      || bytes[offset + 2] !== 0x05
      || bytes[offset + 3] !== 0x06
    ) continue;
    const commentLength = readU16(bytes, offset + 20);
    if (offset + 22 + commentLength !== bytes.length) continue;
    endOffset = offset;
    break;
  }
  if (endOffset < 0) throw new Error('Tactical project ZIP could not be decoded.');
  const declaredCount = readU16(bytes, endOffset + 10);
  if (declaredCount > MAX_ZIP_ENTRIES) {
    throw new Error(`Tactical ZIP entry count exceeds the ${MAX_ZIP_ENTRIES} entry limit.`);
  }
  let offset = readU32(bytes, endOffset + 16);
  const decoder = new TextDecoder();
  const entries: Array<{ name: string; uncompressedSize: number }> = [];
  while (offset + 46 <= endOffset && readU32(bytes, offset) === 0x02014b50) {
    if (entries.length >= MAX_ZIP_ENTRIES) {
      throw new Error(`Tactical ZIP entry count exceeds the ${MAX_ZIP_ENTRIES} entry limit.`);
    }
    const uncompressedSize = readU32(bytes, offset + 24);
    const nameLength = readU16(bytes, offset + 28);
    const extraLength = readU16(bytes, offset + 30);
    const commentLength = readU16(bytes, offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (nameEnd + extraLength + commentLength > endOffset) {
      throw new Error('Tactical project ZIP could not be decoded.');
    }
    entries.push({
      name: decoder.decode(bytes.subarray(nameStart, nameEnd)),
      uncompressedSize,
    });
    offset = nameEnd + extraLength + commentLength;
  }
  if (declaredCount > 0 && entries.length === 0) {
    throw new Error('Tactical project ZIP could not be decoded.');
  }
  return entries;
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
  for (const key of ([
    'metadata', 'ruleset', 'pitch', 'ball', 'timeline', 'analysisSettings',
    'sessionPlan', 'exportPreferences',
  ] as const)) {
    asRecord(value[key], `Tactical project ${key}`);
  }
  for (const key of ([
    'teams', 'playerTokens', 'officials', 'equipment', 'scenes', 'formationStates',
    'scenarios', 'annotations', 'cameraStates', 'media', 'importProvenance',
  ] as const)) {
    if (!Array.isArray(value[key])) throw new Error(`Invalid tactical project: ${key} must be an array.`);
  }
  asRecord(value.videoReview, 'Tactical project videoReview');
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
    const scenes = Array.isArray(source.scenes) ? source.scenes : [];
    const firstScene = asRecord(scenes[0], 'Legacy tactical scene');
    const sceneId = requireString(firstScene.id, 'Legacy scene id');
    const layers = Array.isArray(firstScene.layers) ? firstScene.layers : [];
    const firstLayer = asRecord(layers[0], 'Legacy tactical layer');
    const layerId = requireString(firstLayer.id, 'Legacy layer id');

    const withOwnership = (value: unknown, label: string): Record<string, unknown> => {
      const item = asRecord(value, label);
      return {
        ...item,
        sceneId: typeof item.sceneId === 'string' && item.sceneId ? item.sceneId : sceneId,
        layerId: typeof item.layerId === 'string' && item.layerId ? item.layerId : layerId,
      };
    };

    if (Array.isArray(source.playerTokens)) {
      source.playerTokens = source.playerTokens.map((item, index) => withOwnership(item, 'Legacy player token ' + (index + 1)));
    }
    if (Array.isArray(source.officials)) {
      source.officials = source.officials.map((item, index) => withOwnership(item, 'Legacy official ' + (index + 1)));
    }
    if (Array.isArray(source.equipment)) {
      source.equipment = source.equipment.map((item, index) => withOwnership(item, 'Legacy equipment ' + (index + 1)));
    }
    if (Array.isArray(source.annotations)) {
      source.annotations = source.annotations.map((item, index) => withOwnership(item, 'Legacy annotation ' + (index + 1)));
    }

    const timeline = asRecord(source.timeline, 'Tactical project timeline');
    const markers = Array.isArray(timeline.markers)
      ? timeline.markers.map((value, index) => {
          const marker = asRecord(value, 'Legacy timeline marker ' + (index + 1));
          const rawKind = typeof marker.kind === 'string' ? marker.kind : '';
          const kind = TIMELINE_MARKER_KINDS.includes(rawKind as (typeof TIMELINE_MARKER_KINDS)[number])
            ? rawKind
            : 'coaching-cue';
          return { ...marker, kind };
        })
      : [];
    source.timeline = {
      ...timeline,
      markers,
      possessionEvents: Array.isArray(timeline.possessionEvents) ? timeline.possessionEvents : [],
    };
    source.schemaVersion = 2;
  }

  if (source.videoReview == null) source.videoReview = createEmptyVideoReview();
  if (!Array.isArray(source.scenarios)) source.scenarios = [];

  if (source.schemaVersion !== TACTICS_SCHEMA_VERSION) {
    throw new Error(`Unsupported tactical project schema version: ${String(source.schemaVersion)}.`);
  }

  assertRequiredProjectShape(source);
  const candidate = source as unknown as TacticalProject;
  const stored: TacticalProject = {
    ...candidate,
    pitch: ensureStoredTrainingMarkings(candidate.pitch),
  };
  let errors: string[];
  try {
    errors = validateTacticalProject(stored);
  } catch (error) {
    throw new Error(`Invalid tactical project structure: ${error instanceof Error ? error.message : 'validation failed'}`);
  }
  if (errors.length) throw new Error(`Invalid tactical project: ${errors.join(' ')}`);
  return stored;
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
    // JSZip stamps auto-created folders with the current time; a fixed date keeps exports byte-identical.
    if (!assets.length) zip.file('assets/', null, { dir: true, date: ZIP_DATE });
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
  const bytes = await zipBytes(data);
  if (bytes.byteLength > MAX_PROJECT_ZIP_BYTES) throw new Error('Tactical project ZIP exceeds the local import size limit.');
  let declaredTotal = 0;
  for (const entry of readZipDirectory(bytes)) {
    if (entry.name.endsWith('/')) continue;
    const textEntry = entry.name === 'project.json' || entry.name === 'manifest.json';
    const oversized = entry.uncompressedSize === 0xffffffff
      || (textEntry && entry.uncompressedSize > MAX_PROJECT_JSON_BYTES)
      || (!textEntry && entry.uncompressedSize > MAX_ASSET_BYTES);
    if (oversized) {
      throw new Error(`Tactical ZIP ${entry.name} exceeds the local import size limit before decompression.`);
    }
    declaredTotal += entry.uncompressedSize;
    if (declaredTotal > MAX_PROJECT_ZIP_BYTES) {
      throw new Error('Tactical ZIP expanded size exceeds the local import size limit before decompression.');
    }
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes, { checkCRC32: true, createFolders: false });
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
      blob: new Blob([Uint8Array.from(bytes).buffer], { type: asset.mimeType }),
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

const RICH_TRAJECTORY_COLUMNS = [
  'timestamp_ms', 'entity_id', 'team_id', 'x', 'y', 'z',
  'orientation_deg', 'event', 'coordinate_system',
] as const;
const LEGACY_TRAJECTORY_COLUMNS = ['targetId', 'timeMs', 'x', 'y'] as const;

function trajectorySamples(project: TacticalProject): PortableTrajectorySample[] {
  const teamByTarget = new Map(project.playerTokens.map((token) => [token.id, token.teamId]));
  return project.timeline.tracks
    .flatMap((track) => track.keyframes
      .filter((keyframe) => keyframe.position)
      .map((keyframe) => ({
        targetId: track.targetId,
        timeMs: keyframe.timeMs,
        position: { ...keyframe.position! },
        teamId: teamByTarget.get(track.targetId),
        zMeters: keyframe.elevationMeters,
        orientationDeg: keyframe.rotationDeg,
        event: keyframe.event,
        coordinateSystem: 'normalized' as const,
      })))
    .sort((left, right) => left.targetId.localeCompare(right.targetId) || left.timeMs - right.timeMs);
}

function optionalText(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function optionalNumber(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label} must be a finite number.`);
  return number;
}

export function exportTrajectoryCsv(project: TacticalProject): string {
  const rows = trajectorySamples(project).map((sample) => ({
    timestamp_ms: sample.timeMs,
    entity_id: csvFormulaSafe(sample.targetId),
    team_id: csvFormulaSafe(sample.teamId ?? ''),
    x: sample.position.x,
    y: sample.position.y,
    z: sample.zMeters ?? '',
    orientation_deg: sample.orientationDeg ?? '',
    event: csvFormulaSafe(sample.event ?? ''),
    coordinate_system: sample.coordinateSystem,
  }));
  return Papa.unparse(rows, {
    columns: [...RICH_TRAJECTORY_COLUMNS],
    header: true,
    newline: '\n',
  });
}

export function exportTrajectoryJson(project: TacticalProject): string {
  return JSON.stringify({
    tool: TRAJECTORY_TOOL_ID,
    schemaVersion: TRAJECTORY_SCHEMA_VERSION,
    mapping: {
      timestamp: 'milliseconds',
      coordinateSystem: 'normalized',
      physicalUnit: 'meters',
    },
    samples: trajectorySamples(project),
  }, null, 2);
}

function sameColumns(actual: string[] | undefined, expected: readonly string[]): boolean {
  return Boolean(actual)
    && actual!.length === expected.length
    && expected.every((column, index) => actual![index] === column);
}

function normalizedOrientation(value: number): number {
  return ((value % 360) + 360) % 360;
}

function validateTrajectorySamples(
  samples: unknown[],
  sourceName: string,
  pitch?: PitchDimensions,
): PortableTrajectorySample[] {
  if (samples.length > MAX_TRAJECTORY_SAMPLES) throw new Error('Trajectory import exceeds the sample-count limit.');
  const result = samples.map((raw, index) => {
    const record = asRecord(raw, `Trajectory sample ${index + 1}`);
    const targetId = csvFormulaRestore(String(record.targetId ?? record.entity_id ?? '').trim());
    if (!targetId) throw new Error('Trajectory target id cannot be empty.');

    const timeMs = Number(record.timeMs ?? record.timestamp_ms);
    if (!Number.isInteger(timeMs) || timeMs < 0) {
      throw new Error(`Trajectory sample time must be a non-negative integer in ${sourceName}.`);
    }
    if (timeMs > MAX_TIMELINE_DURATION_MS) {
      throw new Error(`Trajectory sample time exceeds the ${MAX_TIMELINE_DURATION_MS} millisecond session limit.`);
    }

    const rawSystem = String(record.coordinateSystem ?? record.coordinate_system ?? 'normalized');
    if (rawSystem !== 'normalized' && rawSystem !== 'meters') {
      throw new Error(`Trajectory coordinate system must be normalized or meters in ${sourceName}.`);
    }
    const coordinateSystem: TrajectoryCoordinateSystem = rawSystem;
    const hasCanonicalPosition = Boolean(record.position && typeof record.position === 'object');
    const positionRecord = hasCanonicalPosition
      ? asRecord(record.position, 'Trajectory position')
      : { x: record.x, y: record.y };
    const x = Number(positionRecord.x);
    const y = Number(positionRecord.y);
    let position: PortableTrajectorySample['position'];
    if (hasCanonicalPosition) {
      position = createNormalizedPoint(x, y);
    } else if (rawSystem === 'meters') {
      if (!pitch) throw new Error('Physical trajectory coordinates require pitch dimensions.');
      if (x < 0 || y < 0 || x > pitch.lengthMeters || y > pitch.widthMeters) {
        throw new Error('Physical trajectory coordinates must stay within the selected pitch dimensions.');
      }
      position = metersToNormalized({ xMeters: x, yMeters: y }, pitch);
    } else {
      position = createNormalizedPoint(x, y);
    }

    const zMeters = optionalNumber(record.zMeters ?? record.z, 'Trajectory Z');
    if (zMeters !== undefined && zMeters < 0) throw new Error('Trajectory Z must be non-negative.');
    const orientation = optionalNumber(record.orientationDeg ?? record.orientation_deg, 'Trajectory orientation');
    const event = optionalText(record.event);
    const teamId = optionalText(record.teamId ?? record.team_id);
    return {
      targetId,
      timeMs,
      position,
      teamId: teamId === undefined ? undefined : csvFormulaRestore(teamId),
      zMeters,
      orientationDeg: orientation === undefined ? undefined : normalizedOrientation(orientation),
      event: event === undefined ? undefined : csvFormulaRestore(event),
      coordinateSystem,
    };
  });
  const seen = new Set<string>();
  for (const sample of result) {
    const key = `${sample.targetId}: ${sample.timeMs}`;
    if (seen.has(key)) throw new Error(`Trajectory import has duplicate time ${sample.timeMs} for target ${sample.targetId}.`);
    seen.add(key);
  }
  return result.sort((left, right) => left.targetId.localeCompare(right.targetId) || left.timeMs - right.timeMs);
}

export function parseTrajectoryCsv(
  text: string,
  sourceName: string,
  pitch?: PitchDimensions,
): PortableTrajectorySample[] {
  if (utf8Bytes(text) > MAX_PROJECT_JSON_BYTES) throw new Error('Trajectory CSV exceeds the local import size limit.');
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), {
    header: true,
    skipEmptyLines: 'greedy',
  });
  if (parsed.errors.length) {
    throw new Error(`Trajectory CSV could not be parsed: ${parsed.errors[0]!.message}`);
  }
  const fields = parsed.meta.fields;
  const rich = sameColumns(fields, RICH_TRAJECTORY_COLUMNS);
  const legacy = sameColumns(fields, LEGACY_TRAJECTORY_COLUMNS);
  if (!rich && !legacy) {
    throw new Error(
      `Trajectory CSV header must be ${RICH_TRAJECTORY_COLUMNS.join(',')} or ${LEGACY_TRAJECTORY_COLUMNS.join(',')}.`,
    );
  }
  return validateTrajectorySamples(parsed.data, sourceName, pitch);
}

export function parseTrajectoryJson(
  text: string,
  sourceName: string,
  pitch?: PitchDimensions,
): PortableTrajectorySample[] {
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
  return validateTrajectorySamples(record.samples, sourceName, pitch);
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
  return keyframe.rotationDeg !== undefined
    || keyframe.elevationMeters !== undefined
    || keyframe.event !== undefined
    || keyframe.visible !== undefined;
}

export function applyTrajectoryImport(
  project: TacticalProject,
  samplesInput: PortableTrajectorySample[],
  sourceType: 'trajectory-csv' | 'trajectory-json',
  sourceName: string,
): TacticalProject {
  const samples = validateTrajectorySamples(samplesInput, sourceName, project.pitch.dimensions);
  const targets = knownPositionTargets(project);
  for (const sample of samples) {
    if (!targets.has(sample.targetId)) throw new Error(`Trajectory target ${sample.targetId} does not exist in this project.`);
    if (sample.teamId) {
      if (!project.teams.some((team) => team.id === sample.teamId)) {
        throw new Error(`Trajectory team ${sample.teamId} does not exist in this project.`);
      }
      const token = project.playerTokens.find((item) => item.id === sample.targetId);
      if (token && token.teamId !== sample.teamId) {
        throw new Error(`Trajectory team ${sample.teamId} does not match target ${sample.targetId}.`);
      }
    }
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
        rotationDeg: sample.orientationDeg ?? preserved?.rotationDeg,
        elevationMeters: sample.zMeters ?? preserved?.elevationMeters,
        event: sample.event ?? preserved?.event,
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

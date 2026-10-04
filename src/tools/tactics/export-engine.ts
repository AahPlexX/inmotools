import JSZip from 'jszip';
import { computeConvexTeamGeometry, measureTrajectory, sampleAuthoredTrajectory } from './analysis-engine';
import { serializeTacticalBoardSvg } from './board-engine';
import {
  ANALYTICS_CLAIM_BOUNDARY,
  MEDIABUNNY_CONTAINER_CODECS,
  RASTER_STILL_FORMATS,
  SOCIAL_STILL_PRESETS,
  VIDEO_EXPORT_CANDIDATES,
  type AnalyticsReportRow,
  type ExportMetadata,
  type ExportMetadataDraft,
  type RasterMime,
  type RasterSurface,
  type SocialStillPresetId,
  type VideoEncodeRequest,
  type VideoExportCandidate,
} from './export-types';
import { sampleTacticalProjectAtTime } from './timeline-engine';
import type { TacticalProject } from './tactics-types';

export type { AnalyticsReportRow, ExportMetadata, ExportMetadataDraft, RasterMime, RasterSurface, VideoEncodeRequest, VideoExportCandidate } from './export-types';
export { ANALYTICS_CLAIM_BOUNDARY, MEDIABUNNY_CONTAINER_CODECS, MEDIABUNNY_PIN, RASTER_STILL_FORMATS, SOCIAL_STILL_PRESETS, VIDEO_EXPORT_CANDIDATES } from './export-types';

const ZIP_DATE = new Date('1980-01-01T00:00:00.000Z');
const TOOL_ID = 'inmotools-tactical-matchboard';
const ANALYTICS_SAMPLE_STEP_MS = 100;
export const MAX_FRAME_SEQUENCE_FRAMES = 48;
export const MAX_VIDEO_EXPORT_FRAMES = 60;
const MAX_STILL_DIMENSION = 4096;

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function assertPassiveSvg(svg: string): void {
  if (/<script|javascript:|\son[a-z]+\s*=/i.test(svg)) {
    throw new Error('Export rejected active SVG content.');
  }
}

function requirePlainText(value: string, label: string, max: number, singleLine: boolean): string {
  const trimmed = value.trim();
  if (trimmed.length > max) throw new RangeError(`${label} must be ${max} characters or fewer.`);
  if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(trimmed)) {
    throw new Error(`${label} contains unsupported control characters.`);
  }
  if (singleLine && /[\r\n]/.test(trimmed)) throw new Error(`${label} must be a single line.`);
  return trimmed;
}

function requireIsoInstant(value: string, label: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) {
    throw new Error(`${label} must be a UTC timestamp.`);
  }
  if (Number.isNaN(new Date(value).getTime())) throw new Error(`${label} must be a UTC timestamp.`);
  return value;
}

function parseTags(value: string): string[] {
  const tags: string[] = [];
  for (const part of value.split(/[,\n]/)) {
    const tag = requirePlainText(part, 'Tag', 40, true);
    if (!tag || tags.includes(tag)) continue;
    if (tags.length >= 24) throw new RangeError('Export metadata accepts at most 24 tags.');
    tags.push(tag);
  }
  return tags;
}

function requireLanguage(value: string): string {
  const language = requirePlainText(value, 'Language', 32, true);
  if (!language) return '';
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})*$/.test(language)) {
    throw new Error('Language must be a BCP 47 language tag.');
  }
  return language;
}

export function exportFileStem(title: string): string {
  const stem = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return stem || 'tactical-project';
}

export function readExportMetadata(project: TacticalProject): ExportMetadata {
  return {
    title: project.metadata.title,
    description: project.metadata.description,
    creator: project.metadata.creator,
    club: project.metadata.club,
    ageGroup: project.metadata.ageGroup,
    sessionType: project.metadata.sessionType,
    tacticalTheme: project.metadata.tacticalTheme,
    tags: [...project.metadata.tags],
    rights: project.metadata.rights,
    license: project.metadata.license,
    language: project.metadata.language,
    createdAt: project.metadata.createdAt,
    modifiedAt: project.metadata.modifiedAt,
    notes: project.metadata.notes,
  };
}

export function applyExportMetadata(
  project: TacticalProject,
  draft: ExportMetadataDraft,
  modifiedAt: string,
): TacticalProject {
  const metadata: ExportMetadata = {
    title: requirePlainText(draft.title, 'Title', 120, true),
    description: requirePlainText(draft.description, 'Description', 500, false),
    creator: requirePlainText(draft.creator, 'Creator', 120, true),
    club: requirePlainText(draft.club, 'Club', 120, true),
    ageGroup: requirePlainText(draft.ageGroup, 'Age group', 40, true),
    sessionType: requirePlainText(draft.sessionType, 'Session type', 80, true),
    tacticalTheme: requirePlainText(draft.tacticalTheme, 'Tactical theme', 80, true),
    tags: parseTags(draft.tagsText),
    rights: requirePlainText(draft.rights, 'Rights', 200, true),
    license: requirePlainText(draft.license, 'License', 120, true),
    language: requireLanguage(draft.language),
    createdAt: project.metadata.createdAt,
    modifiedAt: requireIsoInstant(modifiedAt, 'Modified date'),
    notes: requirePlainText(draft.notes, 'Notes', 4000, false),
  };
  return {
    ...project,
    metadata: { ...project.metadata, ...metadata },
  };
}

function requireScene(project: TacticalProject, sceneId: string): void {
  if (!project.scenes.some((scene) => scene.id === sceneId)) {
    throw new Error(`Scene "${sceneId}" does not exist.`);
  }
}

function requireEvenDimension(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 2 || value > MAX_STILL_DIMENSION || value % 2 !== 0) {
    throw new RangeError(`${label} must be an even integer from 2 to ${MAX_STILL_DIMENSION}.`);
  }
  return value;
}

export function sampleExportTimes(durationMs: number, frameRate: number, maxFrames: number): number[] {
  if (!Number.isInteger(durationMs) || durationMs < 0) {
    throw new RangeError('Export duration must be a non-negative integer millisecond value.');
  }
  if (!Number.isInteger(frameRate) || frameRate < 1 || frameRate > 60) {
    throw new RangeError('Export frame rate must be an integer from 1 to 60.');
  }
  if (!Number.isInteger(maxFrames) || maxFrames < 1 || maxFrames > 240) {
    throw new RangeError('Export frame cap must be an integer from 1 to 240.');
  }
  if (durationMs === 0) return [0];
  const stepMs = Math.max(1, Math.round(1000 / frameRate));
  const estimated = Math.floor(durationMs / stepMs) + 1;
  const count = Math.min(maxFrames, Math.max(2, estimated));
  const times: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const timeMs = index === count - 1 ? durationMs : Math.round((durationMs * index) / (count - 1));
    if (times[times.length - 1] !== timeMs) times.push(timeMs);
  }
  return times;
}

export function composeFramedSvg(
  project: TacticalProject,
  sceneId: string,
  options: { width: number; height: number; showCaption: boolean },
): string {
  const width = requireEvenDimension(options.width, 'Frame width');
  const height = requireEvenDimension(options.height, 'Frame height');
  const board = serializeTacticalBoardSvg(project, sceneId).trim();
  assertPassiveSvg(board);
  const viewBox = board.match(/viewBox="0 0 ([0-9.]+) ([0-9.]+)"/);
  const boardWidth = Number(viewBox?.[1] ?? 1000);
  const boardHeight = Number(viewBox?.[2] ?? 680);
  const metadata = readExportMetadata(project);
  const captionHeight = options.showCaption ? Math.max(96, Math.round(height * 0.14)) : 0;
  const margin = Math.round(Math.min(width, height) * 0.04);
  const availableWidth = Math.max(2, width - margin * 2);
  const availableHeight = Math.max(2, height - captionHeight - margin * 2);
  const scale = Math.min(availableWidth / boardWidth, availableHeight / boardHeight);
  const drawnWidth = Math.max(1, Math.round(boardWidth * scale));
  const drawnHeight = Math.max(1, Math.round(boardHeight * scale));
  const x = Math.round((width - drawnWidth) / 2);
  const y = captionHeight + Math.round((availableHeight - drawnHeight) / 2);
  const inner = board.replace('<svg ', `<svg x="${x}" y="${y}" width="${drawnWidth}" height="${drawnHeight}" `);
  const title = metadata.title || 'Untitled tactical project';
  const caption = [metadata.club, metadata.tacticalTheme, metadata.ageGroup].filter(Boolean).join(' · ');
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img">`,
    `<title>${escapeText(title)}</title>`,
    `<metadata>${escapeText([title, metadata.creator, metadata.club, metadata.notes].filter(Boolean).join('\n'))}</metadata>`,
    `<rect width="${width}" height="${height}" fill="#0b1220"/>`,
  ];
  if (options.showCaption) {
    parts.push(
      `<text x="${margin}" y="${Math.round(captionHeight * 0.46)}" fill="#f8fafc" font-family="system-ui, sans-serif" font-size="${Math.max(28, Math.round(captionHeight * 0.28))}" font-weight="700">${escapeText(title)}</text>`,
    );
    if (caption) {
      parts.push(
        `<text x="${margin}" y="${Math.round(captionHeight * 0.78)}" fill="#cbd5e1" font-family="system-ui, sans-serif" font-size="${Math.max(18, Math.round(captionHeight * 0.18))}">${escapeText(caption)}</text>`,
      );
    }
  }
  parts.push(inner, '</svg>');
  const svg = parts.join('');
  assertPassiveSvg(svg);
  return svg;
}

export function composeSocialCardSvg(
  project: TacticalProject,
  sceneId: string,
  presetId: SocialStillPresetId,
): string {
  const preset = SOCIAL_STILL_PRESETS[presetId];
  if (!preset) throw new Error(`Social card shape "${presetId}" does not exist.`);
  return composeFramedSvg(project, sceneId, { width: preset.width, height: preset.height, showCaption: true });
}

function safeJsonForHtml(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

const PLAYBACK_SCRIPT = `
const payload = JSON.parse(document.getElementById('tactical-playback-data').textContent || '{}');
const frame = document.getElementById('tactical-playback-frame');
const clock = document.getElementById('tactical-playback-clock');
const button = document.getElementById('tactical-playback-toggle');
const frames = Array.isArray(payload.frames) ? payload.frames : [];
let index = 0;
let playing = false;
let last = 0;
let elapsed = 0;
function show(next) {
  index = next;
  const current = frames[index];
  frame.replaceChildren();
  if (!current || typeof current.svg !== 'string') {
    clock.textContent = 'No frame';
    return;
  }
  const parsed = new DOMParser().parseFromString(current.svg, 'image/svg+xml');
  const svg = parsed.documentElement;
  if (!svg || svg.localName !== 'svg' || parsed.querySelector('parsererror')) {
    clock.textContent = 'Frame could not be read';
    return;
  }
  frame.append(document.importNode(svg, true));
  clock.textContent = String(current.timeMs) + ' ms';
}
function stop() {
  playing = false;
  button.textContent = 'Play';
  button.setAttribute('aria-pressed', 'false');
}
button.addEventListener('click', () => {
  if (!frames.length) return;
  playing = !playing;
  button.textContent = playing ? 'Pause' : 'Play';
  button.setAttribute('aria-pressed', playing ? 'true' : 'false');
  if (playing) {
    elapsed = 0;
    last = 0;
    requestAnimationFrame(tick);
  }
});
function tick(now) {
  if (!playing) return;
  if (!last) last = now;
  elapsed += now - last;
  last = now;
  const frameDuration = 1000 / Math.max(1, Number(payload.frameRate) || 1);
  while (elapsed >= frameDuration) {
    elapsed -= frameDuration;
    if (index >= frames.length - 1) {
      stop();
      return;
    }
    show(index + 1);
  }
  requestAnimationFrame(tick);
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stop();
});
show(0);
`.trim();

export function buildExportFrames(
  project: TacticalProject,
  sceneId: string,
  options: { width: number; height: number; frameRate: number; maxFrames: number; showCaption: boolean },
): Array<{ timeMs: number; svg: string }> {
  requireScene(project, sceneId);
  const times = sampleExportTimes(project.timeline.durationMs, options.frameRate, options.maxFrames);
  return times.map((timeMs) => ({
    timeMs,
    svg: composeFramedSvg(sampleTacticalProjectAtTime(project, timeMs), sceneId, {
      width: options.width,
      height: options.height,
      showCaption: options.showCaption,
    }),
  }));
}

export function buildStandalonePlaybackHtml(
  project: TacticalProject,
  sceneId: string,
  options?: { maxFrames?: number; frameRate?: number },
): string {
  const frameRate = options?.frameRate ?? project.exportPreferences.frameRate;
  const frames = buildExportFrames(project, sceneId, {
    width: 1280,
    height: 720,
    frameRate,
    maxFrames: options?.maxFrames ?? 16,
    showCaption: true,
  });
  const metadata = readExportMetadata(project);
  const title = metadata.title || 'Untitled tactical project';
  const language = metadata.language || 'en';
  const subtitle = [metadata.club, metadata.tacticalTheme, metadata.ageGroup].filter(Boolean).join(' · ');
  const payload = safeJsonForHtml({ frameRate, notes: metadata.notes, frames });
  return [
    '<!DOCTYPE html>',
    `<html lang="${escapeAttribute(language)}">`,
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeText(title)}</title>`,
    '<style>',
    'body{margin:0;background:#0b1220;color:#f8fafc;font-family:system-ui,sans-serif;}',
    'main{padding:clamp(12px,3vw,28px);display:grid;gap:clamp(10px,2vw,16px);}',
    'h1{margin:0;font-size:clamp(1.25rem,2.4vw,2rem);}',
    '#tactical-playback-frame{max-width:100%;}',
    '#tactical-playback-frame svg{width:100%;height:auto;display:block;}',
    '.transport{display:flex;flex-wrap:wrap;gap:12px;align-items:center;}',
    'button{min-height:44px;min-width:44px;padding:0 16px;font:inherit;}',
    '@media (max-width: 720px){.transport{display:grid;}}',
    '@media (prefers-reduced-motion: reduce){*{scroll-behavior:auto;}}',
    '@media (prefers-color-scheme: light){body{background:#f7f8fa;color:#0b1220;}}',
    '</style>',
    '</head>',
    '<body>',
    '<main>',
    `<h1>${escapeText(title)}</h1>`,
    subtitle ? `<p>${escapeText(subtitle)}</p>` : '',
    metadata.notes ? `<p>${escapeText(metadata.notes)}</p>` : '',
    '<div id="tactical-playback-frame"></div>',
    '<div class="transport">',
    '<button id="tactical-playback-toggle" type="button" aria-pressed="false">Play</button>',
    '<p id="tactical-playback-clock">0 ms</p>',
    '</div>',
    '<p>Local playback of authored frames. This file does not load remote media.</p>',
    '</main>',
    `<script type="application/json" id="tactical-playback-data">${payload}</script>`,
    `<script>${PLAYBACK_SCRIPT}</script>`,
    '</body>',
    '</html>',
  ].filter(Boolean).join('\n');
}

function signatureMatches(bytes: Uint8Array, mime: RasterMime): boolean {
  if (mime === 'image/png') {
    return bytes.length >= 8
      && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47
      && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (mime === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.length >= 12
    && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
}

export function rasterSignatureMatches(bytes: Uint8Array, mime: RasterMime): boolean {
  return signatureMatches(bytes, mime);
}

export async function probeRasterFormats(
  probe: (mime: RasterMime) => Promise<boolean>,
): Promise<Array<(typeof RASTER_STILL_FORMATS)[number]>> {
  const supported = [];
  for (const format of RASTER_STILL_FORMATS) {
    if (await probe(format.mime) === true) supported.push(format);
  }
  return supported;
}

async function canvasSurface(width: number, height: number): Promise<RasterSurface> {
  if (typeof document === 'undefined') throw new Error('Canvas rendering is unavailable in this browser.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas rendering is unavailable in this browser.');
  return {
    width,
    height,
    async drawSvg(svg: string) {
      const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      try {
        const image = new Image();
        image.decoding = 'async';
        image.src = url;
        await image.decode();
        context.fillStyle = '#0b1220';
        context.fillRect(0, 0, width, height);
        const sourceWidth = image.naturalWidth || width;
        const sourceHeight = image.naturalHeight || height;
        const scale = Math.min(width / sourceWidth, height / sourceHeight);
        const drawWidth = sourceWidth * scale;
        const drawHeight = sourceHeight * scale;
        context.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
      } finally {
        URL.revokeObjectURL(url);
      }
    },
    toBlob(mime, quality) {
      return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), mime, quality));
    },
  };
}

export async function rasterizeSvg(
  svg: string,
  options: {
    mime: RasterMime;
    width: number;
    height: number;
    quality: number;
    createSurface?: (width: number, height: number) => RasterSurface | Promise<RasterSurface>;
  },
): Promise<Blob> {
  assertPassiveSvg(svg);
  const width = requireEvenDimension(options.width, 'Raster width');
  const height = requireEvenDimension(options.height, 'Raster height');
  if (!Number.isFinite(options.quality) || options.quality <= 0 || options.quality > 1) {
    throw new RangeError('Raster quality must be greater than 0 and at most 1.');
  }
  if (!RASTER_STILL_FORMATS.some((format) => format.mime === options.mime)) {
    throw new Error('Raster format is not available.');
  }
  const surface = await (options.createSurface ?? canvasSurface)(width, height);
  await surface.drawSvg(svg);
  const blob = await surface.toBlob(options.mime, options.quality);
  if (!blob) throw new Error(`${options.mime} export is unavailable in this browser.`);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!signatureMatches(bytes, options.mime)) {
    throw new Error(`${options.mime} export did not produce a ${options.mime} file.`);
  }
  return new Blob([bytes], { type: options.mime });
}

export async function browserSupportsRasterMime(mime: RasterMime): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  try {
    const blob = await rasterizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#123456"/></svg>',
      { mime, width: 2, height: 2, quality: 0.92 },
    );
    return blob.size > 0;
  } catch {
    return false;
  }
}

function decimal(value: number): string {
  if (!Number.isFinite(value)) throw new Error('Analytics value must be finite.');
  return String(Math.round(value * 1000) / 1000);
}

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function trajectorySource(project: TacticalProject): 'authored' | 'imported' {
  return project.importProvenance.some((entry) => entry.sourceType === 'trajectory-csv' || entry.sourceType === 'trajectory-json')
    ? 'imported'
    : 'authored';
}

export function buildAnalyticsReport(project: TacticalProject, sceneId: string) {
  requireScene(project, sceneId);
  const sampled = sampleTacticalProjectAtTime(project, project.timeline.playheadMs);
  const source = trajectorySource(project);
  const rows: AnalyticsReportRow[] = [
    {
      section: 'pitch',
      subjectId: 'pitch',
      metric: 'length_meters',
      value: project.pitch.dimensions.lengthMeters,
      unit: 'meters',
      source: 'geometric',
      claimBoundary: ANALYTICS_CLAIM_BOUNDARY,
    },
    {
      section: 'pitch',
      subjectId: 'pitch',
      metric: 'width_meters',
      value: project.pitch.dimensions.widthMeters,
      unit: 'meters',
      source: 'geometric',
      claimBoundary: ANALYTICS_CLAIM_BOUNDARY,
    },
  ];

  for (const track of project.timeline.tracks) {
    const positionTimes = track.keyframes.filter((keyframe) => keyframe.position).map((keyframe) => keyframe.timeMs);
    if (positionTimes.length < 2) continue;
    const startMs = Math.min(...positionTimes);
    const endMs = Math.max(...positionTimes);
    const samples = sampleAuthoredTrajectory(track, startMs, endMs, ANALYTICS_SAMPLE_STEP_MS);
    const metrics = measureTrajectory(samples, project.pitch.dimensions, source);
    const measurements: Array<[string, number, string]> = [
      ['distance_meters', metrics.distanceMeters, 'meters'],
      ['duration_milliseconds', metrics.durationMs, 'milliseconds'],
      ['average_speed_meters_per_second', metrics.averageSpeedMetersPerSecond, 'meters_per_second'],
      ['max_segment_speed_meters_per_second', metrics.maxSegmentSpeedMetersPerSecond, 'meters_per_second'],
    ];
    for (const [metric, value, unit] of measurements) {
      rows.push({
        section: 'trajectory',
        subjectId: track.targetId,
        metric,
        value,
        unit,
        source,
        claimBoundary: ANALYTICS_CLAIM_BOUNDARY,
      });
    }
  }

  const tokensByTeam = new Map<string, typeof sampled.playerTokens>();
  for (const token of sampled.playerTokens) {
    if (token.sceneId !== sceneId || !token.visible) continue;
    const scene = sampled.scenes.find((candidate) => candidate.id === sceneId);
    if (scene?.layers.find((layer) => layer.id === token.layerId)?.visible !== true) continue;
    const team = sampled.teams.find((candidate) => candidate.id === token.teamId);
    const player = team?.roster.find((candidate) => candidate.id === token.playerId);
    if (!sampled.analysisSettings.includeGoalkeepers && player?.role?.toLowerCase() === 'goalkeeper') continue;
    const group = tokensByTeam.get(token.teamId) ?? [];
    group.push(token);
    tokensByTeam.set(token.teamId, group);
  }
  for (const [teamId, tokens] of tokensByTeam) {
    if (!tokens.length) continue;
    const geometry = computeConvexTeamGeometry(tokens.map((token) => token.position), project.pitch.dimensions);
    const measurements: Array<[string, number, string]> = [
      ['width_meters', geometry.widthMeters, 'meters'],
      ['depth_meters', geometry.depthMeters, 'meters'],
      ['area_square_meters', geometry.areaSquareMeters, 'square_meters'],
      ['perimeter_meters', geometry.perimeterMeters, 'meters'],
    ];
    for (const [metric, value, unit] of measurements) {
      rows.push({
        section: 'team-geometry',
        subjectId: teamId,
        metric,
        value,
        unit,
        source: 'geometric',
        claimBoundary: ANALYTICS_CLAIM_BOUNDARY,
      });
    }
  }

  return {
    tool: TOOL_ID,
    kind: 'analytics-report' as const,
    schemaVersion: 1 as const,
    honesty: ANALYTICS_CLAIM_BOUNDARY,
    playheadMs: project.timeline.playheadMs,
    pitch: { ...project.pitch.dimensions },
    trajectoryProvenance: source,
    rows,
  };
}

export function exportAnalyticsCsv(report: ReturnType<typeof buildAnalyticsReport>): string {
  const lines = ['section,subject_id,metric,value,unit,source,claim_boundary'];
  for (const row of report.rows) {
    lines.push([
      row.section,
      row.subjectId,
      row.metric,
      decimal(row.value),
      row.unit,
      row.source,
      csvField(row.claimBoundary),
    ].join(','));
  }
  return `${lines.join('\n')}\n`;
}

export function exportAnalyticsJson(report: ReturnType<typeof buildAnalyticsReport>): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

async function zipBytes(files: Array<{ name: string; data: string | Uint8Array }>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const file of files) {
    // JSZip stamps auto-created folders with the current time; explicit folder entries keep exports byte-identical.
    const parts = file.name.split('/').slice(0, -1);
    for (let depth = 1; depth <= parts.length; depth += 1) {
      const folder = `${parts.slice(0, depth).join('/')}/`;
      if (!zip.files[folder]) zip.file(folder, null, { dir: true, date: ZIP_DATE });
    }
    zip.file(file.name, file.data, { date: ZIP_DATE, createFolders: false });
  }
  return zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    platform: 'DOS',
  });
}

export async function exportFrameSequenceZip(
  project: TacticalProject,
  sceneId: string,
  options?: { maxFrames?: number; frameRate?: number },
): Promise<Uint8Array> {
  const frameRate = options?.frameRate ?? project.exportPreferences.frameRate;
  const frames = buildExportFrames(project, sceneId, {
    width: 1920,
    height: 1080,
    frameRate,
    maxFrames: options?.maxFrames ?? MAX_FRAME_SEQUENCE_FRAMES,
    showCaption: true,
  });
  const manifest = {
    tool: TOOL_ID,
    kind: 'frame-sequence',
    schemaVersion: 1,
    note: 'Portable vector frames. This archive is not a playable video file.',
    frameRateRequested: frameRate,
    frames: frames.map((frame, index) => ({
      file: `frames/${String(index).padStart(3, '0')}.svg`,
      timeMs: frame.timeMs,
    })),
  };
  return zipBytes([
    { name: 'manifest.json', data: JSON.stringify(manifest, null, 2) },
    { name: 'metadata.json', data: JSON.stringify(readExportMetadata(project), null, 2) },
    ...frames.map((frame, index) => ({
      name: `frames/${String(index).padStart(3, '0')}.svg`,
      data: frame.svg,
    })),
  ]);
}

function containerAllows(candidate: VideoExportCandidate): boolean {
  const allowed: readonly string[] = MEDIABUNNY_CONTAINER_CODECS[candidate.container];
  return allowed.includes(candidate.codec)
    && Number.isInteger(candidate.width)
    && Number.isInteger(candidate.height)
    && candidate.width >= 2
    && candidate.height >= 2
    && candidate.width % 2 === 0
    && candidate.height % 2 === 0
    && candidate.width <= MAX_STILL_DIMENSION
    && candidate.height <= MAX_STILL_DIMENSION
    && Number.isInteger(candidate.frameRate)
    && candidate.frameRate >= 1
    && candidate.frameRate <= 60
    && Number.isInteger(candidate.bitrate)
    && candidate.bitrate > 0;
}

export async function negotiateVideoExports(
  probe: {
    canEncodeVideo: (
      codec: VideoExportCandidate['codec'],
      options: { width: number; height: number; bitrate: number },
    ) => Promise<boolean>;
  },
  candidates: readonly VideoExportCandidate[] = VIDEO_EXPORT_CANDIDATES,
): Promise<VideoExportCandidate[]> {
  const negotiated: VideoExportCandidate[] = [];
  for (const candidate of candidates) {
    if (!containerAllows(candidate)) continue;
    const supported = await probe.canEncodeVideo(candidate.codec, {
      width: candidate.width,
      height: candidate.height,
      bitrate: candidate.bitrate,
    });
    if (supported === true) negotiated.push(candidate);
  }
  return negotiated;
}

export function requireNegotiatedCandidate(
  candidateId: string,
  negotiated: readonly VideoExportCandidate[],
): VideoExportCandidate {
  const match = negotiated.find((candidate) => candidate.id === candidateId);
  if (!match) throw new Error('Video format is not available until the encoder confirms it.');
  return match;
}

export function videoContainerTags(metadata: ExportMetadata): {
  title?: string;
  description?: string;
  artist?: string;
  comment?: string;
  date?: Date;
} {
  const tags: { title?: string; description?: string; artist?: string; comment?: string; date?: Date } = {};
  if (metadata.title) tags.title = metadata.title;
  if (metadata.description) tags.description = metadata.description;
  if (metadata.creator) tags.artist = metadata.creator;
  if (metadata.notes) tags.comment = metadata.notes;
  const created = new Date(metadata.createdAt);
  if (!Number.isNaN(created.getTime())) tags.date = created;
  return tags;
}

export async function exportNegotiatedVideo(options: {
  project: TacticalProject;
  sceneId: string;
  candidateId: string;
  negotiated: readonly VideoExportCandidate[];
  maxFrames?: number;
  encode: (request: VideoEncodeRequest) => Promise<Uint8Array>;
}): Promise<Uint8Array> {
  const candidate = requireNegotiatedCandidate(options.candidateId, options.negotiated);
  const frames = buildExportFrames(options.project, options.sceneId, {
    width: candidate.width,
    height: candidate.height,
    frameRate: candidate.frameRate,
    maxFrames: options.maxFrames ?? MAX_VIDEO_EXPORT_FRAMES,
    showCaption: false,
  });
  const bytes = await options.encode({
    candidate,
    frames,
    tags: videoContainerTags(readExportMetadata(options.project)),
  });
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 4) {
    throw new Error('Video export produced no playable bytes. Download the frame-sequence ZIP instead.');
  }
  return bytes;
}

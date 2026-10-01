import { createNormalizedPoint, isNormalizedPoint } from './pitch-engine';
import type {
  AngleSyncAnchor,
  ImportProvenance,
  LocalMediaReference,
  MatchEventKind,
  MatchEventTag,
  NormalizedPoint,
  OverlayInterpolation,
  OverlayTrack,
  OverlayTrackAnchor,
  TacticalProject,
  TelestrationKind,
  TelestrationStroke,
  VideoClip,
  VideoPlaylist,
  VideoReviewDocument,
} from './tactics-types';

export const VIDEO_IMPORT_MAX_BYTES = 128 * 1024 * 1024;
export const SUPPORTED_LOCAL_VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'] as const;
export const VIDEO_PLAYBACK_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const;
export const MAX_TELESTRATION_POINTS = 2_000;

const TELESTRATION_KINDS = new Set<TelestrationKind>(['freehand', 'line', 'arrow', 'circle', 'text']);
const OVERLAY_INTERPOLATIONS = new Set<OverlayInterpolation>(['hold', 'linear']);
const MATCH_EVENT_KINDS = new Set<MatchEventKind>([
  'goal', 'shot', 'chance', 'turnover', 'foul', 'set-piece', 'press', 'transition', 'coaching-note',
]);
const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export interface LocalVideoFileInput {
  name: string;
  mimeType: string;
  sizeBytes: number;
}

export interface VideoPresentationTrackSample {
  track: OverlayTrack;
  position: NormalizedPoint | null;
}

export interface VideoPresentationSample {
  timeMs: number;
  mediaId: string;
  telestrations: TelestrationStroke[];
  tracks: VideoPresentationTrackSample[];
  events: MatchEventTag[];
}

export interface PlaylistLocation {
  clipId: string;
  mediaTimeMs: number;
}

export interface PlaylistPlaybackCursor {
  index: number;
  mediaTimeMs: number;
  complete: boolean;
}

export interface LocalMediaObjectBinding {
  mediaId: string;
  objectUrl: string;
}

export interface LocalMediaObjectRegistry {
  readonly size: number;
  bind: (mediaId: string, blob: Blob) => LocalMediaObjectBinding;
  release: (binding: LocalMediaObjectBinding | null) => void;
  releaseAll: () => void;
}

export interface MediaListenerTarget {
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
}

export interface MediaListenerHandlers {
  onLoadedMetadata: () => void;
  onTimeUpdate: () => void;
  onError: () => void;
  onEnded: () => void;
}

const MEDIA_LISTENER_EVENTS = [
  ['onLoadedMetadata', 'loadedmetadata'],
  ['onTimeUpdate', 'timeupdate'],
  ['onError', 'error'],
  ['onEnded', 'ended'],
] as const;

export function createEmptyVideoReview(): VideoReviewDocument {
  return {
    activeMediaId: null,
    comparisonMediaId: null,
    telestrations: [],
    overlayTracks: [],
    events: [],
    clips: [],
    playlists: [],
    syncAnchors: [],
  };
}

function cloneReview(review: VideoReviewDocument): VideoReviewDocument {
  return structuredClone(review);
}

function requireReviewMs(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer millisecond value.`);
  }
  return value;
}

function requireId(id: string, label: string): string {
  const trimmed = id.trim();
  if (!trimmed) throw new Error(`${label} id is required.`);
  return trimmed;
}

function requireLabel(label: string, name: string): string {
  const trimmed = label.trim();
  if (!trimmed) throw new Error(`${name} label is required.`);
  return trimmed;
}

function requireUnique(ids: readonly string[], id: string, label: string): void {
  if (ids.includes(id)) throw new Error(`${label} id ${id} already exists.`);
}

function requireTimeRange(startMs: number, endMs: number, allowEqual: boolean): void {
  requireReviewMs(startMs, 'Start time');
  requireReviewMs(endMs, 'End time');
  if (allowEqual ? endMs < startMs : endMs <= startMs) {
    throw new RangeError('Time range must stay inside the local video.');
  }
}

function requireColor(color: string): string {
  if (!COLOR_PATTERN.test(color)) throw new Error('Telestration color must be a #RRGGBB value.');
  return color;
}

function requirePoint(point: NormalizedPoint): NormalizedPoint {
  if (!point || !isNormalizedPoint(point)) {
    throw new RangeError('Overlay position must use normalized [0, 1] coordinates.');
  }
  return createNormalizedPoint(point.x, point.y);
}

function requirePoints(kind: TelestrationKind, points: readonly NormalizedPoint[]): NormalizedPoint[] {
  const normalized = points.map((point) => requirePoint(point));
  const expected = kind === 'freehand' ? null : kind === 'text' ? 1 : 2;
  if (kind === 'freehand' && (normalized.length < 2 || normalized.length > MAX_TELESTRATION_POINTS)) {
    throw new RangeError(`Freehand telestration must contain 2 to ${MAX_TELESTRATION_POINTS} points.`);
  }
  if (expected !== null && normalized.length !== expected) {
    throw new RangeError(`${kind} telestration requires ${expected} normalized point${expected === 1 ? '' : 's'}.`);
  }
  return normalized;
}

const EXTENSION_MIME_TYPES: Record<string, (typeof SUPPORTED_LOCAL_VIDEO_MIME_TYPES)[number]> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  webm: 'video/webm',
  ogv: 'video/ogg',
  ogg: 'video/ogg',
  mov: 'video/quicktime',
};

export function resolveLocalVideoMimeType(name: string, reportedMimeType: string): string {
  const reported = reportedMimeType.trim().toLowerCase();
  if (SUPPORTED_LOCAL_VIDEO_MIME_TYPES.includes(reported as (typeof SUPPORTED_LOCAL_VIDEO_MIME_TYPES)[number])) {
    return reported;
  }
  if (reported && reported !== 'application/octet-stream') return reported;
  const extension = name.trim().toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? '';
  return EXTENSION_MIME_TYPES[extension] ?? reported;
}

export function assertSupportedLocalVideo(file: LocalVideoFileInput): void {
  if (!file.name.trim()) throw new Error('Local video name is required.');
  const mimeType = file.mimeType.trim().toLowerCase();
  if (!SUPPORTED_LOCAL_VIDEO_MIME_TYPES.includes(mimeType as (typeof SUPPORTED_LOCAL_VIDEO_MIME_TYPES)[number])) {
    throw new Error(`${file.mimeType || 'This file type'} is not a supported local video format.`);
  }
  if (!Number.isInteger(file.sizeBytes) || file.sizeBytes < 0) {
    throw new RangeError('Local video size must be a non-negative integer byte count.');
  }
  if (file.sizeBytes === 0) throw new Error('The local video file is empty.');
  if (file.sizeBytes > VIDEO_IMPORT_MAX_BYTES) {
    throw new Error(`The local video exceeds the ${VIDEO_IMPORT_MAX_BYTES}-byte local asset size limit.`);
  }
}

export function secondsToReviewMs(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds < 0) {
    throw new RangeError('Video time must be a finite non-negative duration.');
  }
  return Math.round(seconds * 1000);
}

export function reviewMsToSeconds(timeMs: number): number {
  return requireReviewMs(timeMs, 'Review time') / 1000;
}

export function reviewStepMs(frameRate: number): number {
  if (!Number.isInteger(frameRate) || frameRate < 1 || frameRate > 120) {
    throw new RangeError('Review frame rate must be an integer from 1 to 120.');
  }
  return Math.round(1000 / frameRate);
}

export function seekReviewTime(timeMs: number, durationMs: number): number {
  const duration = requireReviewMs(durationMs, 'Video duration');
  const time = requireReviewMs(timeMs, 'Review time');
  return Math.min(time, duration);
}

export function stepReviewTime(timeMs: number, durationMs: number, frames: number, frameRate: number): number {
  if (!Number.isInteger(frames) || frames === 0) {
    throw new RangeError('Frame step must be a non-zero integer.');
  }
  const current = seekReviewTime(timeMs, durationMs);
  const next = current + reviewStepMs(frameRate) * frames;
  if (next < 0) return 0;
  return Math.min(next, requireReviewMs(durationMs, 'Video duration'));
}

export function assertPlaybackRate(rate: number): (typeof VIDEO_PLAYBACK_RATES)[number] {
  if (!VIDEO_PLAYBACK_RATES.includes(rate as (typeof VIDEO_PLAYBACK_RATES)[number])) {
    throw new RangeError('Playback speed must be one of the local review speeds.');
  }
  return rate as (typeof VIDEO_PLAYBACK_RATES)[number];
}

export function mediaErrorMessage(code: number | null): string {
  switch (code) {
    case 1:
      return 'Video loading was interrupted before the local file could be reviewed.';
    case 2:
      return 'The local video file could not be read.';
    case 3:
      return 'The local video could not be decoded.';
    case 4:
      return 'This browser cannot play that video format.';
    default:
      return 'The local video could not be reviewed.';
  }
}

export function addTelestration(review: VideoReviewDocument, stroke: TelestrationStroke): VideoReviewDocument {
  const next = cloneReview(review);
  const id = requireId(stroke.id, 'Telestration');
  requireUnique(next.telestrations.map((item) => item.id), id, 'Telestration');
  if (!stroke.mediaId.trim()) throw new Error('Telestration media id is required.');
  if (!TELESTRATION_KINDS.has(stroke.kind)) throw new Error('Telestration kind is not supported.');
  requireTimeRange(stroke.startMs, stroke.endMs, true);
  const label = stroke.label?.trim();
  if (stroke.kind === 'text' && !label) throw new Error('Text telestration label is required.');
  next.telestrations.push({
    id,
    mediaId: stroke.mediaId.trim(),
    kind: stroke.kind,
    startMs: stroke.startMs,
    endMs: stroke.endMs,
    points: requirePoints(stroke.kind, stroke.points),
    color: requireColor(stroke.color),
    ...(label ? { label } : {}),
  });
  return next;
}

export function removeTelestration(review: VideoReviewDocument, strokeId: string): VideoReviewDocument {
  if (!review.telestrations.some((stroke) => stroke.id === strokeId)) {
    throw new Error(`Telestration ${strokeId} does not exist.`);
  }
  const next = cloneReview(review);
  next.telestrations = next.telestrations.filter((stroke) => stroke.id !== strokeId);
  return next;
}

export function addOverlayTrack(review: VideoReviewDocument, track: OverlayTrack): VideoReviewDocument {
  const next = cloneReview(review);
  const id = requireId(track.id, 'Overlay track');
  requireUnique(next.overlayTracks.map((item) => item.id), id, 'Overlay track');
  if (!track.mediaId.trim()) throw new Error('Overlay track media id is required.');
  if (!OVERLAY_INTERPOLATIONS.has(track.interpolation)) throw new Error('Overlay interpolation must be hold or linear.');
  requireTimeRange(track.startMs, track.endMs, false);
  if (track.anchors.length) throw new Error('Add overlay anchors after the track exists.');
  next.overlayTracks.push({
    id,
    mediaId: track.mediaId.trim(),
    label: requireLabel(track.label, 'Overlay track'),
    startMs: track.startMs,
    endMs: track.endMs,
    interpolation: track.interpolation,
    anchors: [],
  });
  return next;
}

export function addOverlayAnchor(
  review: VideoReviewDocument,
  trackId: string,
  anchor: OverlayTrackAnchor,
): VideoReviewDocument {
  const next = cloneReview(review);
  const track = next.overlayTracks.find((item) => item.id === trackId);
  if (!track) throw new Error(`Overlay track ${trackId} does not exist.`);
  const id = requireId(anchor.id, 'Overlay anchor');
  requireUnique(track.anchors.map((item) => item.id), id, 'Overlay anchor');
  const timeMs = requireReviewMs(anchor.timeMs, 'Anchor time');
  if (timeMs < track.startMs || timeMs > track.endMs) {
    throw new RangeError('Anchor time must stay inside the overlay track range.');
  }
  if (track.anchors.some((item) => item.timeMs === timeMs)) {
    throw new Error(`Anchor time ${timeMs} already exists on this overlay track.`);
  }
  track.anchors.push({ id, timeMs, position: requirePoint(anchor.position) });
  track.anchors.sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id));
  return next;
}

export function sampleOverlayPosition(track: OverlayTrack, timeMs: number): NormalizedPoint | null {
  if (!Number.isInteger(timeMs) || timeMs < track.startMs || timeMs > track.endMs) return null;
  const anchors = [...track.anchors].sort((left, right) => left.timeMs - right.timeMs);
  if (!anchors.length || timeMs < anchors[0]!.timeMs) return null;
  let previousIndex = -1;
  for (let index = 0; index < anchors.length; index += 1) {
    if (anchors[index]!.timeMs <= timeMs) previousIndex = index;
  }
  const previous = previousIndex >= 0 ? anchors[previousIndex] : undefined;
  if (!previous) return null;
  const next = anchors[previousIndex + 1];
  if (!next || track.interpolation === 'hold' || previous.timeMs === timeMs) {
    return { ...previous.position };
  }
  const span = next.timeMs - previous.timeMs;
  const progress = span === 0 ? 0 : (timeMs - previous.timeMs) / span;
  return createNormalizedPoint(
    previous.position.x + (next.position.x - previous.position.x) * progress,
    previous.position.y + (next.position.y - previous.position.y) * progress,
  );
}

export function addMatchEvent(review: VideoReviewDocument, event: MatchEventTag): VideoReviewDocument {
  const next = cloneReview(review);
  const id = requireId(event.id, 'Match event');
  requireUnique(next.events.map((item) => item.id), id, 'Match event');
  if (!event.mediaId.trim()) throw new Error('Match event media id is required.');
  if (!MATCH_EVENT_KINDS.has(event.kind)) throw new Error('Match event kind is not supported.');
  next.events.push({
    id,
    mediaId: event.mediaId.trim(),
    timeMs: requireReviewMs(event.timeMs, 'Event time'),
    kind: event.kind,
    label: requireLabel(event.label, 'Match event'),
  });
  next.events.sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id));
  return next;
}

export function removeMatchEvent(review: VideoReviewDocument, eventId: string): VideoReviewDocument {
  if (!review.events.some((event) => event.id === eventId)) throw new Error(`Match event ${eventId} does not exist.`);
  const next = cloneReview(review);
  next.events = next.events.filter((event) => event.id !== eventId);
  return next;
}

export function addVideoClip(review: VideoReviewDocument, clip: VideoClip): VideoReviewDocument {
  const next = cloneReview(review);
  const id = requireId(clip.id, 'Clip');
  requireUnique(next.clips.map((item) => item.id), id, 'Clip');
  if (!clip.mediaId.trim()) throw new Error('Clip media id is required.');
  requireTimeRange(clip.startMs, clip.endMs, false);
  next.clips.push({
    id,
    mediaId: clip.mediaId.trim(),
    label: requireLabel(clip.label, 'Clip'),
    startMs: clip.startMs,
    endMs: clip.endMs,
  });
  return next;
}

export function removeVideoClip(review: VideoReviewDocument, clipId: string): VideoReviewDocument {
  if (!review.clips.some((clip) => clip.id === clipId)) throw new Error(`Clip ${clipId} does not exist.`);
  const next = cloneReview(review);
  next.clips = next.clips.filter((clip) => clip.id !== clipId);
  next.playlists = next.playlists.map((playlist) => ({
    ...playlist,
    clipIds: playlist.clipIds.filter((id) => id !== clipId),
  }));
  return next;
}

export function createVideoPlaylist(review: VideoReviewDocument, playlist: VideoPlaylist): VideoReviewDocument {
  const next = cloneReview(review);
  const id = requireId(playlist.id, 'Playlist');
  requireUnique(next.playlists.map((item) => item.id), id, 'Playlist');
  const clipIds = playlist.clipIds.map((clipId) => requireId(clipId, 'Playlist clip'));
  if (new Set(clipIds).size !== clipIds.length) throw new Error('Playlist clip ids must be unique.');
  for (const clipId of clipIds) {
    if (!next.clips.some((clip) => clip.id === clipId)) throw new Error(`Playlist references missing clip ${clipId}.`);
  }
  next.playlists.push({ id, name: requireLabel(playlist.name, 'Playlist'), clipIds });
  return next;
}

export function movePlaylistClip(
  review: VideoReviewDocument,
  playlistId: string,
  clipId: string,
  direction: -1 | 1,
): VideoReviewDocument {
  if (direction !== -1 && direction !== 1) throw new RangeError('Playlist move direction must be -1 or 1.');
  const next = cloneReview(review);
  const playlist = next.playlists.find((item) => item.id === playlistId);
  if (!playlist) throw new Error(`Playlist ${playlistId} does not exist.`);
  const index = playlist.clipIds.indexOf(clipId);
  const target = index + direction;
  if (index < 0) throw new Error(`Playlist clip ${clipId} does not exist.`);
  if (target < 0 || target >= playlist.clipIds.length) return review;
  const reordered = [...playlist.clipIds];
  const [moved] = reordered.splice(index, 1);
  reordered.splice(target, 0, moved!);
  playlist.clipIds = reordered;
  return next;
}

export function orderedPlaylistClips(review: VideoReviewDocument, playlistId: string): VideoClip[] {
  const playlist = review.playlists.find((item) => item.id === playlistId);
  if (!playlist) throw new Error(`Playlist ${playlistId} does not exist.`);
  return playlist.clipIds.map((clipId) => {
    const clip = review.clips.find((item) => item.id === clipId);
    if (!clip) throw new Error(`Playlist references missing clip ${clipId}.`);
    return structuredClone(clip);
  });
}

export function locatePlaylistTime(clips: readonly VideoClip[], sequenceMs: number): PlaylistLocation | null {
  if (!clips.length || !Number.isInteger(sequenceMs) || sequenceMs < 0) return null;
  let cursor = 0;
  for (let index = 0; index < clips.length; index += 1) {
    const clip = clips[index]!;
    const span = clip.endMs - clip.startMs;
    const sequenceEnd = cursor + span;
    const isLast = index === clips.length - 1;
    if (sequenceMs < sequenceEnd || (isLast && sequenceMs === sequenceEnd)) {
      return { clipId: clip.id, mediaTimeMs: clip.startMs + (sequenceMs - cursor) };
    }
    cursor = sequenceEnd;
  }
  return null;
}

export function startPlaylistPlayback(clips: readonly VideoClip[]): PlaylistPlaybackCursor | null {
  const first = clips[0];
  if (!first) return null;
  return { index: 0, mediaTimeMs: first.startMs, complete: false };
}

export function advancePlaylistPlayback(
  clips: readonly VideoClip[],
  index: number,
  mediaTimeMs: number,
): PlaylistPlaybackCursor {
  const clip = clips[index];
  if (!clip || !Number.isInteger(index) || index < 0) throw new Error('Playlist playback index is outside the playlist.');
  const timeMs = requireReviewMs(mediaTimeMs, 'Playlist time');
  if (timeMs < clip.endMs) return { index, mediaTimeMs: timeMs, complete: false };
  const next = clips[index + 1];
  if (!next) return { index, mediaTimeMs: clip.endMs, complete: true };
  return { index: index + 1, mediaTimeMs: next.startMs, complete: false };
}

export function setAngleSyncAnchor(review: VideoReviewDocument, anchor: AngleSyncAnchor): VideoReviewDocument {
  const next = cloneReview(review);
  const mediaId = requireId(anchor.mediaId, 'Sync angle');
  const normalized: AngleSyncAnchor = {
    mediaId,
    mediaTimeMs: requireReviewMs(anchor.mediaTimeMs, 'Angle time'),
    sharedTimeMs: requireReviewMs(anchor.sharedTimeMs, 'Shared time'),
  };
  next.syncAnchors = [...next.syncAnchors.filter((item) => item.mediaId !== mediaId), normalized];
  return next;
}

export function mediaTimeForSharedClock(
  anchor: AngleSyncAnchor,
  sharedTimeMs: number,
  durationMs: number | null,
): number {
  const shared = requireReviewMs(sharedTimeMs, 'Shared time');
  const offset = requireReviewMs(anchor.mediaTimeMs, 'Angle time') - requireReviewMs(anchor.sharedTimeMs, 'Anchor shared time');
  const raw = shared + offset;
  const bounded = raw < 0 ? 0 : raw;
  if (durationMs === null) return bounded;
  return Math.min(bounded, requireReviewMs(durationMs, 'Video duration'));
}

export function sharedTimeForMedia(anchor: AngleSyncAnchor, mediaTimeMs: number): number {
  const offset = requireReviewMs(anchor.mediaTimeMs, 'Angle time') - requireReviewMs(anchor.sharedTimeMs, 'Anchor shared time');
  return requireReviewMs(mediaTimeMs, 'Angle time') - offset;
}

export function sampleVideoPresentation(
  review: VideoReviewDocument,
  mediaId: string,
  timeMs: number,
): VideoPresentationSample {
  const sampleTime = requireReviewMs(timeMs, 'Review time');
  return structuredClone({
    timeMs: sampleTime,
    mediaId,
    telestrations: review.telestrations.filter((stroke) => (
      stroke.mediaId === mediaId && stroke.startMs <= sampleTime && sampleTime <= stroke.endMs
    )),
    tracks: review.overlayTracks
      .filter((track) => track.mediaId === mediaId)
      .map((track) => ({ track, position: sampleOverlayPosition(track, sampleTime) })),
    events: review.events.filter((event) => event.mediaId === mediaId && event.timeMs === sampleTime),
  });
}

function mediaById(project: TacticalProject, mediaId: string): LocalMediaReference | undefined {
  return project.media.find((item) => item.id === mediaId);
}

export function attachLocalVideo(
  project: TacticalProject,
  input: LocalVideoFileInput & { id: string; durationMs?: number | null; blob?: Blob; role: 'primary' | 'comparison' },
  now: () => string = () => new Date().toISOString(),
): TacticalProject {
  assertSupportedLocalVideo(input);
  const id = requireId(input.id, 'Local video');
  if (project.media.some((item) => item.id === id)) throw new Error(`Local video id ${id} already exists.`);
  const review = project.videoReview ?? createEmptyVideoReview();
  if (input.role === 'primary' && review.activeMediaId) {
    throw new Error('Remove the current local video before opening another.');
  }
  if (input.role === 'comparison' && review.comparisonMediaId) {
    throw new Error('Remove the comparison angle before opening another.');
  }
  if (!review.activeMediaId && input.role === 'comparison') {
    throw new Error('Open a primary local video before adding a comparison angle.');
  }
  const durationMs = input.durationMs == null ? undefined : requireReviewMs(input.durationMs, 'Video duration');
  const media: LocalMediaReference = {
    id,
    name: input.name.trim(),
    mimeType: input.mimeType.trim().toLowerCase(),
    sizeBytes: input.sizeBytes,
    ...(durationMs === undefined ? {} : { durationMs }),
    ...(input.blob ? { blob: input.blob } : {}),
  };
  const provenance: ImportProvenance = {
    sourceType: 'local-media',
    sourceName: media.name,
    importedAt: now(),
  };
  return {
    ...project,
    media: [...project.media, media],
    videoReview: {
      ...review,
      activeMediaId: input.role === 'primary' ? id : review.activeMediaId,
      comparisonMediaId: input.role === 'comparison' ? id : review.comparisonMediaId,
    },
    importProvenance: [...project.importProvenance, provenance],
  };
}

export function recordLocalVideoDuration(project: TacticalProject, mediaId: string, durationMs: number): TacticalProject {
  const duration = requireReviewMs(durationMs, 'Video duration');
  const media = mediaById(project, mediaId);
  if (!media) throw new Error(`Local video ${mediaId} does not exist.`);
  if (media.durationMs === duration) return project;
  return {
    ...project,
    media: project.media.map((item) => item.id === mediaId ? { ...item, durationMs: duration } : item),
  };
}

export function detachLocalVideo(project: TacticalProject, mediaId: string): TacticalProject {
  if (!mediaById(project, mediaId)) throw new Error(`Local video ${mediaId} does not exist.`);
  const review = project.videoReview ?? createEmptyVideoReview();
  const removedClipIds = new Set(review.clips.filter((clip) => clip.mediaId === mediaId).map((clip) => clip.id));
  return {
    ...project,
    media: project.media.filter((item) => item.id !== mediaId),
    videoReview: {
      ...review,
      activeMediaId: review.activeMediaId === mediaId ? null : review.activeMediaId,
      comparisonMediaId: review.comparisonMediaId === mediaId ? null : review.comparisonMediaId,
      telestrations: review.telestrations.filter((item) => item.mediaId !== mediaId),
      overlayTracks: review.overlayTracks.filter((item) => item.mediaId !== mediaId),
      events: review.events.filter((item) => item.mediaId !== mediaId),
      clips: review.clips.filter((item) => item.mediaId !== mediaId),
      playlists: review.playlists.map((playlist) => ({
        ...playlist,
        clipIds: playlist.clipIds.filter((clipId) => !removedClipIds.has(clipId)),
      })),
      syncAnchors: review.syncAnchors.filter((item) => item.mediaId !== mediaId),
    },
  };
}

export function nextVideoReviewId(prefix: string, ids: readonly string[]): string {
  const safePrefix = prefix.trim() || 'video';
  let index = ids.length + 1;
  let candidate = `${safePrefix}-${index}`;
  const taken = new Set(ids);
  while (taken.has(candidate)) {
    index += 1;
    candidate = `${safePrefix}-${index}`;
  }
  return candidate;
}

function pushReviewError(errors: string[], condition: boolean, message: string): void {
  if (condition) errors.push(message);
}

function validateMediaReference(
  errors: string[],
  project: TacticalProject,
  mediaId: string,
  label: string,
): LocalMediaReference | undefined {
  const media = mediaById(project, mediaId);
  if (!media) {
    errors.push(`${label} references missing media ${mediaId}.`);
    return undefined;
  }
  const mimeType = media.mimeType.trim().toLowerCase();
  if (!SUPPORTED_LOCAL_VIDEO_MIME_TYPES.includes(mimeType as (typeof SUPPORTED_LOCAL_VIDEO_MIME_TYPES)[number])) {
    errors.push(`${label} references unsupported local video ${mediaId}.`);
  }
  return media;
}

function withinDuration(errors: string[], media: LocalMediaReference | undefined, timeMs: number, label: string): void {
  if (!Number.isInteger(timeMs) || timeMs < 0) {
    errors.push(`${label} must be a non-negative integer millisecond value.`);
    return;
  }
  if (media?.durationMs !== undefined && timeMs > media.durationMs) {
    errors.push(`${label} exceeds the local video duration.`);
  }
}

export function validateVideoReview(project: TacticalProject): string[] {
  const errors: string[] = [];
  const review = project.videoReview;
  if (!review) {
    errors.push('Video review state is missing.');
    return errors;
  }

  const mediaIds = new Set<string>();
  for (const media of project.media ?? []) {
    pushReviewError(errors, !media.id?.trim(), 'Local media id is required.');
    if (media.id) {
      pushReviewError(errors, mediaIds.has(media.id), `Local media id ${media.id} is duplicated.`);
      mediaIds.add(media.id);
    }
    pushReviewError(errors, !Number.isInteger(media.sizeBytes) || media.sizeBytes < 0, `Local media ${media.id || 'asset'} size must be a non-negative integer.`);
    if (media.durationMs !== undefined && (!Number.isInteger(media.durationMs) || media.durationMs < 0)) {
      errors.push(`Local media ${media.id || 'asset'} duration must be a non-negative integer millisecond value.`);
    }
  }

  if (review.activeMediaId) validateMediaReference(errors, project, review.activeMediaId, 'Primary video');
  if (review.comparisonMediaId) validateMediaReference(errors, project, review.comparisonMediaId, 'Comparison video');
  pushReviewError(
    errors,
    Boolean(review.activeMediaId) && review.activeMediaId === review.comparisonMediaId,
    'Comparison video must be a different local file.',
  );

  const strokeIds = new Set<string>();
  for (const stroke of review.telestrations ?? []) {
    pushReviewError(errors, !stroke.id?.trim() || strokeIds.has(stroke.id), `Telestration id ${stroke.id || 'value'} is missing or duplicated.`);
    strokeIds.add(stroke.id);
    const media = validateMediaReference(errors, project, stroke.mediaId, `Telestration ${stroke.id || 'stroke'}`);
    if (!TELESTRATION_KINDS.has(stroke.kind)) errors.push(`Telestration ${stroke.id} kind is not supported.`);
    withinDuration(errors, media, stroke.startMs, `Telestration ${stroke.id} start`);
    withinDuration(errors, media, stroke.endMs, `Telestration ${stroke.id} end`);
    if (Number.isInteger(stroke.startMs) && Number.isInteger(stroke.endMs) && stroke.endMs < stroke.startMs) {
      errors.push(`Telestration ${stroke.id} time range is reversed.`);
    }
    if (!COLOR_PATTERN.test(stroke.color ?? '')) errors.push(`Telestration ${stroke.id} color must be a #RRGGBB value.`);
    for (const point of stroke.points ?? []) {
      if (!isNormalizedPoint(point)) errors.push(`Telestration ${stroke.id} position must use normalized [0, 1] coordinates.`);
    }
  }

  const trackIds = new Set<string>();
  for (const track of review.overlayTracks ?? []) {
    pushReviewError(errors, !track.id?.trim() || trackIds.has(track.id), `Overlay track id ${track.id || 'value'} is missing or duplicated.`);
    trackIds.add(track.id);
    const media = validateMediaReference(errors, project, track.mediaId, `Overlay track ${track.id || 'track'}`);
    if (!track.label?.trim()) errors.push(`Overlay track ${track.id} label is required.`);
    if (!OVERLAY_INTERPOLATIONS.has(track.interpolation)) errors.push(`Overlay track ${track.id} interpolation must be hold or linear.`);
    withinDuration(errors, media, track.startMs, `Overlay track ${track.id} start`);
    withinDuration(errors, media, track.endMs, `Overlay track ${track.id} end`);
    const anchorTimes = new Set<number>();
    for (const anchor of track.anchors ?? []) {
      withinDuration(errors, media, anchor.timeMs, `Overlay anchor ${anchor.id || 'time'}`);
      if (Number.isInteger(anchor.timeMs) && (anchor.timeMs < track.startMs || anchor.timeMs > track.endMs)) {
        errors.push(`Overlay anchor ${anchor.id} is outside track ${track.id}.`);
      }
      if (anchorTimes.has(anchor.timeMs)) errors.push(`Anchor time ${anchor.timeMs} is duplicated on track ${track.id}.`);
      anchorTimes.add(anchor.timeMs);
      if (!anchor.position || !isNormalizedPoint(anchor.position)) {
        errors.push(`Overlay anchor ${anchor.id} position must use normalized [0, 1] coordinates.`);
      }
    }
  }

  const eventIds = new Set<string>();
  for (const event of review.events ?? []) {
    pushReviewError(errors, !event.id?.trim() || eventIds.has(event.id), `Match event id ${event.id || 'value'} is missing or duplicated.`);
    eventIds.add(event.id);
    const media = validateMediaReference(errors, project, event.mediaId, `Match event ${event.id || 'event'}`);
    if (!MATCH_EVENT_KINDS.has(event.kind)) errors.push(`Match event ${event.id} kind is not supported.`);
    if (!event.label?.trim()) errors.push(`Match event ${event.id} label is required.`);
    withinDuration(errors, media, event.timeMs, `Match event ${event.id}`);
  }

  const clipIds = new Set<string>();
  for (const clip of review.clips ?? []) {
    pushReviewError(errors, !clip.id?.trim() || clipIds.has(clip.id), `Clip id ${clip.id || 'value'} is missing or duplicated.`);
    clipIds.add(clip.id);
    const media = validateMediaReference(errors, project, clip.mediaId, `Clip ${clip.id || 'clip'}`);
    if (!clip.label?.trim()) errors.push(`Clip ${clip.id} label is required.`);
    withinDuration(errors, media, clip.startMs, `Clip ${clip.id} start`);
    withinDuration(errors, media, clip.endMs, `Clip ${clip.id} end`);
    if (Number.isInteger(clip.startMs) && Number.isInteger(clip.endMs) && clip.endMs <= clip.startMs) {
      errors.push(`Clip ${clip.id} time range is reversed.`);
    }
  }

  const playlistIds = new Set<string>();
  for (const playlist of review.playlists ?? []) {
    pushReviewError(errors, !playlist.id?.trim() || playlistIds.has(playlist.id), `Playlist id ${playlist.id || 'value'} is missing or duplicated.`);
    playlistIds.add(playlist.id);
    if (!playlist.name?.trim()) errors.push(`Playlist ${playlist.id} name is required.`);
    const seen = new Set<string>();
    for (const clipId of playlist.clipIds ?? []) {
      if (!clipIds.has(clipId)) errors.push(`Playlist ${playlist.id} references missing clip ${clipId}.`);
      if (seen.has(clipId)) errors.push(`Playlist ${playlist.id} repeats clip ${clipId}.`);
      seen.add(clipId);
    }
  }

  const synced = new Set<string>();
  for (const anchor of review.syncAnchors ?? []) {
    const media = validateMediaReference(errors, project, anchor.mediaId, 'Sync anchor');
    if (synced.has(anchor.mediaId)) errors.push(`Sync anchor for ${anchor.mediaId} is duplicated.`);
    synced.add(anchor.mediaId);
    withinDuration(errors, media, anchor.mediaTimeMs, `Sync anchor ${anchor.mediaId} angle time`);
    if (!Number.isInteger(anchor.sharedTimeMs) || anchor.sharedTimeMs < 0) {
      errors.push(`Sync anchor ${anchor.mediaId} shared time must be a non-negative integer millisecond value.`);
    }
  }

  return errors;
}

export function createLocalMediaObjectRegistry(
  createObjectUrl: (blob: Blob) => string,
  revokeObjectUrl: (url: string) => void,
): LocalMediaObjectRegistry {
  const bindings: LocalMediaObjectBinding[] = [];
  return {
    get size() {
      return bindings.length;
    },
    bind(mediaId: string, blob: Blob) {
      if (!mediaId.trim()) throw new Error('Local video id is required.');
      if (!(blob instanceof Blob) || blob.size < 1) throw new Error('Local video data is empty.');
      const objectUrl = createObjectUrl(blob);
      if (!objectUrl) throw new Error('The browser did not provide an object URL for the local video.');
      const binding = { mediaId: mediaId.trim(), objectUrl };
      bindings.push(binding);
      return binding;
    },
    release(binding: LocalMediaObjectBinding | null) {
      if (!binding) return;
      const index = bindings.findIndex((item) => item.mediaId === binding.mediaId && item.objectUrl === binding.objectUrl);
      if (index < 0) return;
      bindings.splice(index, 1);
      revokeObjectUrl(binding.objectUrl);
    },
    releaseAll() {
      while (bindings.length) {
        const binding = bindings.shift();
        if (binding) revokeObjectUrl(binding.objectUrl);
      }
    },
  };
}

export interface HiddenPlaybackDocument {
  visibilityState: 'visible' | 'hidden' | 'prerender' | 'unloaded';
  addEventListener(type: 'visibilitychange', listener: () => void): void;
  removeEventListener(type: 'visibilitychange', listener: () => void): void;
}

export function bindHiddenDocumentPause(
  documentTarget: HiddenPlaybackDocument,
  pause: () => void,
): () => void {
  const onChange = () => {
    if (documentTarget.visibilityState === 'hidden') pause();
  };
  documentTarget.addEventListener('visibilitychange', onChange);
  return () => documentTarget.removeEventListener('visibilitychange', onChange);
}

export function bindMediaElementListeners(target: MediaListenerTarget, handlers: MediaListenerHandlers): () => void {
  const entries = MEDIA_LISTENER_EVENTS.map(([handlerName, eventName]) => {
    const listener = handlers[handlerName];
    target.addEventListener(eventName, listener);
    return { eventName, listener };
  });
  let detached = false;
  return () => {
    if (detached) return;
    detached = true;
    for (const entry of entries) target.removeEventListener(entry.eventName, entry.listener);
  };
}

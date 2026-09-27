/**
 * Serializable Audio Mastering document and its revision operations.
 *
 * The document never holds PCM. Sources are references; each clip owns an
 * ordered edit list applied to its source; tracks place clips on a sample-frame
 * timeline. Every operation here is pure and returns a new document so the
 * bounded undo/redo history can store whole revisions (ledger 17).
 *
 * Model decisions are recorded in
 * docs/superpowers/plans/2026-09-27-audio-mastering-completion.md.
 */
import {
  clampSelection,
  estimateEditedFrameCount,
  type AudioEdit,
  type MasteringMarker,
  type MasteringRegion,
  type TimeSelection,
} from './mastering-engine';

// --- SECTION: types ---

export type FadeCurve = 'linear' | 'equalPower' | 'exponential' | 'logarithmic' | 'sCurve';

export const FADE_CURVES: ReadonlyArray<{ value: FadeCurve; label: string }> = [
  { value: 'linear', label: 'Linear' },
  { value: 'equalPower', label: 'Equal power' },
  { value: 'exponential', label: 'Exponential' },
  { value: 'logarithmic', label: 'Logarithmic' },
  { value: 'sCurve', label: 'S-curve' },
];

export interface ClipFade {
  durationSeconds: number;
  curve: FadeCurve;
}

/** A decoded file referenced by clips. `frameCount` is measured at the project sample rate. */
export interface MasteringSourceReference {
  id: string;
  name: string;
  /** Sample rate of the original file before any import-time conversion. */
  sampleRate: number;
  channelCount: number;
  frameCount: number;
  fileSize: number;
  lastModified: number;
  codec: string;
}

export interface MasteringClip {
  id: string;
  name: string;
  sourceId: string;
  /** Timeline position of the clip's first frame. Always on the project frame grid. */
  startSeconds: number;
  edits: AudioEdit[];
  gainDb: number;
  /** -1 (left) to 1 (right). Balance law with unity at centre. */
  pan: number;
  muted: boolean;
  /** When any clip or track is soloed, only soloed clips and clips on soloed tracks play. */
  solo: boolean;
  fadeIn: ClipFade;
  fadeOut: ClipFade;
}

export interface MasteringTrack {
  id: string;
  name: string;
  gainDb: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  clips: MasteringClip[];
}

export interface MasteringDocument {
  version: 2;
  /** Project rate; set by the first imported source. Other sources are converted to it on import. */
  sampleRate: number | null;
  sources: MasteringSourceReference[];
  tracks: MasteringTrack[];
  activeClipId: string | null;
  selection: TimeSelection;
  playhead: number;
  markers: MasteringMarker[];
  regions: MasteringRegion[];
  metadataEdits: Record<string, string>;
}

export interface MasteringProjectHistory {
  past: MasteringDocument[];
  present: MasteringDocument;
  future: MasteringDocument[];
}

export const MAX_TRACKS = 8;
const HISTORY_LIMIT = 100;
const NO_FADE: ClipFade = { durationSeconds: 0, curve: 'equalPower' };

// --- SECTION: numeric helpers ---

const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const nonNegative = (value: number) => Math.max(0, finite(value));
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

/** Rounds seconds to the project frame grid; documents without a rate keep raw non-negative seconds. */
function frameTime(document: MasteringDocument, seconds: number): number {
  const rate = document.sampleRate;
  if (!rate) return nonNegative(seconds);
  return Math.min(Number.MAX_SAFE_INTEGER, Math.round(nonNegative(seconds) * rate)) / rate;
}

// --- SECTION: cloning ---

const cloneClip = (clip: MasteringClip): MasteringClip => ({
  ...clip,
  edits: clip.edits.map((edit) => structuredEditClone(edit)),
  fadeIn: { ...clip.fadeIn },
  fadeOut: { ...clip.fadeOut },
});

/** Edits are plain data; a JSON round trip keeps nested arrays (sample-pen patches) independent between revisions. */
function structuredEditClone(edit: AudioEdit): AudioEdit {
  return JSON.parse(JSON.stringify(edit)) as AudioEdit;
}

export function cloneDocument(document: MasteringDocument): MasteringDocument {
  return {
    ...document,
    sources: document.sources.map((source) => ({ ...source })),
    tracks: document.tracks.map((track) => ({ ...track, clips: track.clips.map(cloneClip) })),
    selection: { ...document.selection },
    markers: document.markers.map((marker) => ({ ...marker })),
    regions: document.regions.map((region) => ({ ...region })),
    metadataEdits: { ...document.metadataEdits },
  };
}

// --- SECTION: construction and lookup ---

export function createMasteringDocument(): MasteringDocument {
  return {
    version: 2,
    sampleRate: null,
    sources: [],
    tracks: [],
    activeClipId: null,
    selection: { startSeconds: 0, endSeconds: 0 },
    playhead: 0,
    markers: [],
    regions: [],
    metadataEdits: {},
  };
}

export function findClip(document: MasteringDocument, clipId: string | null): { track: MasteringTrack; clip: MasteringClip; trackIndex: number; clipIndex: number } | null {
  if (!clipId) return null;
  for (let trackIndex = 0; trackIndex < document.tracks.length; trackIndex += 1) {
    const track = document.tracks[trackIndex];
    const clipIndex = track.clips.findIndex((clip) => clip.id === clipId);
    if (clipIndex >= 0) return { track, clip: track.clips[clipIndex], trackIndex, clipIndex };
  }
  return null;
}

/** The clip range edits act on: the explicit active clip, otherwise the first clip in the project. */
export function activeClip(document: MasteringDocument): MasteringClip | null {
  return findClip(document, document.activeClipId)?.clip ?? document.tracks.flatMap((track) => track.clips)[0] ?? null;
}

export function clipFrameCount(document: MasteringDocument, clip: MasteringClip): number {
  const source = document.sources.find((candidate) => candidate.id === clip.sourceId);
  if (!source || !document.sampleRate) return 0;
  return estimateEditedFrameCount(source.frameCount, document.sampleRate, clip.edits);
}

export function clipDurationSeconds(document: MasteringDocument, clip: MasteringClip): number {
  return document.sampleRate ? clipFrameCount(document, clip) / document.sampleRate : 0;
}

export function clipEndSeconds(document: MasteringDocument, clip: MasteringClip): number {
  return frameTime(document, clip.startSeconds + clipDurationSeconds(document, clip));
}

/** Length of the arrangement: the end of the last clip on any track. */
export function estimateDocumentDuration(document: MasteringDocument): number {
  let end = 0;
  for (const track of document.tracks) for (const clip of track.clips) end = Math.max(end, clipEndSeconds(document, clip));
  return end;
}

// --- SECTION: sources and tracks ---

export interface SourcePlacement {
  source: MasteringSourceReference;
  trackId: string;
  clipId: string;
}

/**
 * Adds each source on its own new track with one clip at the timeline start.
 *
 * The first source of an empty project sets the project rate. Callers must
 * already have converted later sources to that rate and report `frameCount`
 * at the project rate.
 *
 * @throws {RangeError} when the result would exceed {@link MAX_TRACKS} tracks, or a source is invalid.
 */
export function addSourceTracksRevision(document: MasteringDocument, placements: readonly SourcePlacement[]): MasteringDocument {
  if (!placements.length) return cloneDocument(document);
  if (document.tracks.length + placements.length > MAX_TRACKS) {
    throw new RangeError(`A project holds up to ${MAX_TRACKS} tracks. ${document.tracks.length} are in use, so ${MAX_TRACKS - document.tracks.length} more can be added.`);
  }
  for (const { source } of placements) {
    if (!Number.isFinite(source.sampleRate) || source.sampleRate <= 0) throw new RangeError('A source needs a positive finite sample rate.');
    if (!Number.isInteger(source.frameCount) || source.frameCount <= 0) throw new RangeError(`${source.name} has no audio frames.`);
    if (source.channelCount < 1 || source.channelCount > 2) throw new RangeError(`${source.name} has ${source.channelCount} channels. Tracks hold mono or stereo audio.`);
  }
  const next = cloneDocument(document);
  if (!next.sampleRate) next.sampleRate = placements[0].source.sampleRate;
  const usedNames = new Set(next.tracks.map((track) => track.name));
  let trackNumber = next.tracks.length;
  for (const { source, trackId, clipId } of placements) {
    trackNumber += 1;
    let name = `Track ${trackNumber}`;
    while (usedNames.has(name)) { trackNumber += 1; name = `Track ${trackNumber}`; }
    usedNames.add(name);
    next.sources.push({ ...source });
    next.tracks.push({
      id: trackId,
      name,
      gainDb: 0,
      pan: 0,
      muted: false,
      solo: false,
      clips: [{
        id: clipId,
        name: source.name,
        sourceId: source.id,
        startSeconds: 0,
        edits: [],
        gainDb: 0,
        pan: 0,
        muted: false,
        solo: false,
        fadeIn: { ...NO_FADE },
        fadeOut: { ...NO_FADE },
      }],
    });
  }
  next.activeClipId = next.activeClipId ?? placements[0].clipId;
  if (document.tracks.length === 0) {
    next.selection = { startSeconds: 0, endSeconds: estimateDocumentDuration(next) };
    next.playhead = 0;
  }
  return next;
}

/** Removes sources no clip references, keeping the document small and backups honest. */
function pruneSources(document: MasteringDocument): MasteringDocument {
  const used = new Set(document.tracks.flatMap((track) => track.clips.map((clip) => clip.sourceId)));
  const sources = document.sources.filter((source) => used.has(source.id));
  const activeStillExists = findClip(document, document.activeClipId);
  return {
    ...document,
    sources,
    sampleRate: sources.length ? document.sampleRate : null,
    activeClipId: activeStillExists ? document.activeClipId : document.tracks.flatMap((track) => track.clips)[0]?.id ?? null,
  };
}

export type TrackPatch = Partial<Pick<MasteringTrack, 'name' | 'gainDb' | 'pan' | 'muted' | 'solo'>>;

export function updateTrackRevision(document: MasteringDocument, trackId: string, patch: TrackPatch): MasteringDocument {
  const next = cloneDocument(document);
  const track = next.tracks.find((candidate) => candidate.id === trackId);
  if (!track) return next;
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name) track.name = name.slice(0, 80);
  }
  if (patch.gainDb !== undefined) track.gainDb = clamp(finite(patch.gainDb), -60, 24);
  if (patch.pan !== undefined) track.pan = clamp(finite(patch.pan), -1, 1);
  if (patch.muted !== undefined) track.muted = patch.muted;
  if (patch.solo !== undefined) track.solo = patch.solo;
  return next;
}

/** Moves a track one position up (`-1`) or down (`1`). Out-of-range moves are no-ops. */
export function moveTrackRevision(document: MasteringDocument, trackId: string, direction: -1 | 1): MasteringDocument {
  const next = cloneDocument(document);
  const index = next.tracks.findIndex((track) => track.id === trackId);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= next.tracks.length) return next;
  [next.tracks[index], next.tracks[target]] = [next.tracks[target], next.tracks[index]];
  return next;
}

export function removeTrackRevision(document: MasteringDocument, trackId: string): MasteringDocument {
  const next = cloneDocument(document);
  next.tracks = next.tracks.filter((track) => track.id !== trackId);
  const pruned = pruneSources(next);
  const duration = estimateDocumentDuration(pruned);
  return {
    ...pruned,
    selection: clampSelection(pruned.selection, duration),
    playhead: Math.min(duration, pruned.playhead),
    markers: pruned.tracks.length ? pruned.markers : [],
    regions: pruned.tracks.length ? pruned.regions : [],
  };
}

// --- SECTION: clip placement operations (ledger 11, 13) ---

export type ClipPatch = Partial<Pick<MasteringClip, 'name' | 'gainDb' | 'pan' | 'muted' | 'solo'>>;

export function updateClipRevision(document: MasteringDocument, clipId: string, patch: ClipPatch): MasteringDocument {
  const next = cloneDocument(document);
  const found = findClip(next, clipId);
  if (!found) return next;
  const { clip } = found;
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (name) clip.name = name.slice(0, 120);
  }
  if (patch.gainDb !== undefined) clip.gainDb = clamp(finite(patch.gainDb), -60, 24);
  if (patch.pan !== undefined) clip.pan = clamp(finite(patch.pan), -1, 1);
  if (patch.muted !== undefined) clip.muted = patch.muted;
  if (patch.solo !== undefined) clip.solo = patch.solo;
  return next;
}

export function moveClipRevision(document: MasteringDocument, clipId: string, startSeconds: number): MasteringDocument {
  const next = cloneDocument(document);
  const found = findClip(next, clipId);
  if (found) found.clip.startSeconds = frameTime(next, startSeconds);
  return next;
}

export function nudgeClipRevision(document: MasteringDocument, clipId: string, deltaSeconds: number): MasteringDocument {
  const found = findClip(document, clipId);
  return found ? moveClipRevision(document, clipId, found.clip.startSeconds + finite(deltaSeconds)) : cloneDocument(document);
}

/** Moves a clip to another track at the same timeline position. */
export function moveClipToTrackRevision(document: MasteringDocument, clipId: string, trackId: string): MasteringDocument {
  const next = cloneDocument(document);
  const found = findClip(next, clipId);
  const target = next.tracks.find((track) => track.id === trackId);
  if (!found || !target || found.track.id === trackId) return next;
  found.track.clips.splice(found.clipIndex, 1);
  target.clips.push(found.clip);
  return next;
}

/**
 * Copies a clip (edits, gain, fades) without copying PCM. The copy lands right
 * after the original on the same track unless a start time is supplied.
 */
export function duplicateClipRevision(document: MasteringDocument, clipId: string, nextClipId: string, startSeconds?: number): MasteringDocument {
  const next = cloneDocument(document);
  if (!nextClipId || findClip(next, nextClipId)) return next;
  const found = findClip(next, clipId);
  if (!found) return next;
  const copy = cloneClip(found.clip);
  copy.id = nextClipId;
  copy.name = `${found.clip.name} copy`.slice(0, 120);
  copy.startSeconds = frameTime(next, startSeconds ?? clipEndSeconds(next, found.clip));
  found.track.clips.splice(found.clipIndex + 1, 0, copy);
  next.activeClipId = nextClipId;
  return next;
}

export function deleteClipRevision(document: MasteringDocument, clipId: string): MasteringDocument {
  const next = cloneDocument(document);
  const found = findClip(next, clipId);
  if (!found) return next;
  found.track.clips.splice(found.clipIndex, 1);
  const pruned = pruneSources(next);
  const duration = estimateDocumentDuration(pruned);
  return { ...pruned, selection: clampSelection(pruned.selection, duration), playhead: Math.min(duration, pruned.playhead) };
}

/**
 * Splits a clip at a timeline time into two clips that reference the same
 * source. Each half gets one crop appended to the original edit list, so the
 * halves render exactly the frames on either side of the boundary.
 */
export function splitClipRevision(document: MasteringDocument, clipId: string, atSeconds: number, nextClipId: string): MasteringDocument {
  const next = cloneDocument(document);
  if (!nextClipId || findClip(next, nextClipId) || !next.sampleRate) return next;
  const found = findClip(next, clipId);
  if (!found) return next;
  const { clip, track, clipIndex } = found;
  const duration = clipDurationSeconds(next, clip);
  const local = frameTime(next, atSeconds - clip.startSeconds);
  if (local <= 0 || local >= duration) return next;
  const left: MasteringClip = {
    ...cloneClip(clip),
    edits: [...clip.edits.map(structuredEditClone), { type: 'crop', startSeconds: 0, endSeconds: local }],
    fadeOut: { ...NO_FADE },
    fadeIn: { ...clip.fadeIn, durationSeconds: Math.min(clip.fadeIn.durationSeconds, local) },
  };
  const right: MasteringClip = {
    ...cloneClip(clip),
    id: nextClipId,
    startSeconds: frameTime(next, clip.startSeconds + local),
    edits: [...clip.edits.map(structuredEditClone), { type: 'crop', startSeconds: local, endSeconds: duration }],
    fadeIn: { ...NO_FADE },
    fadeOut: { ...clip.fadeOut, durationSeconds: Math.min(clip.fadeOut.durationSeconds, duration - local) },
  };
  track.clips.splice(clipIndex, 1, left, right);
  next.activeClipId = nextClipId;
  return next;
}

// --- SECTION: fades and crossfades (ledger 14, 15) ---

/** Sets one fade, clamped so the fade-in and fade-out never overlap inside the clip. */
export function setClipFadeRevision(document: MasteringDocument, clipId: string, edge: 'in' | 'out', fade: ClipFade): MasteringDocument {
  const next = cloneDocument(document);
  const found = findClip(next, clipId);
  if (!found) return next;
  const { clip } = found;
  const duration = clipDurationSeconds(next, clip);
  const other = edge === 'in' ? clip.fadeOut : clip.fadeIn;
  const durationSeconds = frameTime(next, clamp(nonNegative(fade.durationSeconds), 0, Math.max(0, duration - other.durationSeconds)));
  const curve = FADE_CURVES.some((option) => option.value === fade.curve) ? fade.curve : 'equalPower';
  if (edge === 'in') clip.fadeIn = { durationSeconds, curve };
  else clip.fadeOut = { durationSeconds, curve };
  return next;
}

/**
 * Creates or edits a crossfade between two clips on one track.
 *
 * The right clip is moved so the overlap equals `durationSeconds`, and the left
 * fade-out and right fade-in are set to that duration with the same curve.
 * Editing either value later goes through this function again, which keeps the
 * two fades synchronized.
 *
 * @throws {RangeError} when the clips are on different tracks or the overlap cannot fit.
 */
export function crossfadeClipsRevision(document: MasteringDocument, leftClipId: string, rightClipId: string, durationSeconds: number, curve: FadeCurve): MasteringDocument {
  const next = cloneDocument(document);
  const left = findClip(next, leftClipId);
  const right = findClip(next, rightClipId);
  if (!left || !right || left.clip.id === right.clip.id) throw new RangeError('Choose two different clips.');
  if (left.track.id !== right.track.id) throw new RangeError('Crossfades join two clips on the same track.');
  const leftDuration = clipDurationSeconds(next, left.clip);
  const rightDuration = clipDurationSeconds(next, right.clip);
  const overlap = frameTime(next, nonNegative(durationSeconds));
  const maximum = Math.min(leftDuration - left.clip.fadeIn.durationSeconds, rightDuration - right.clip.fadeOut.durationSeconds);
  if (overlap <= 0) throw new RangeError('A crossfade needs a duration greater than zero.');
  if (overlap > maximum) throw new RangeError(`The longest crossfade these clips allow is ${maximum.toFixed(3)} seconds.`);
  const leftEnd = clipEndSeconds(next, left.clip);
  right.clip.startSeconds = frameTime(next, leftEnd - overlap);
  if (right.clip.startSeconds < left.clip.startSeconds) throw new RangeError('The right clip would start before the left clip.');
  left.clip.fadeOut = { durationSeconds: overlap, curve };
  right.clip.fadeIn = { durationSeconds: overlap, curve };
  return next;
}

// --- SECTION: clip-local range edits with ripple (ledger 11, 17) ---

interface ActiveClipContext {
  next: MasteringDocument;
  clip: MasteringClip;
  track: MasteringTrack;
  start: number;
  duration: number;
}

function activeContext(document: MasteringDocument): ActiveClipContext | null {
  if (!document.sampleRate) return null;
  const next = cloneDocument(document);
  const clip = activeClip(next);
  if (!clip) return null;
  const found = findClip(next, clip.id);
  if (!found) return null;
  return { next, clip: found.clip, track: found.track, start: clip.startSeconds, duration: clipDurationSeconds(next, clip) };
}

/** Converts a timeline range to clip-local seconds, clipped to the clip and aligned to frames. */
function localRange(context: ActiveClipContext, range: TimeSelection): TimeSelection {
  const ordered = clampSelection({ startSeconds: range.startSeconds - context.start, endSeconds: range.endSeconds - context.start }, context.duration);
  return {
    startSeconds: frameTime(context.next, ordered.startSeconds),
    endSeconds: frameTime(context.next, ordered.endSeconds),
  };
}

/**
 * Shifts later clips on the edited track by the change in the edited clip's
 * length. Clips that started at or after the old clip end move; clips that
 * start earlier (including overlapping ones) stay put.
 */
function rippleTrack(context: ActiveClipContext, oldEnd: number, delta: number) {
  if (!delta) return;
  for (const other of context.track.clips) {
    if (other.id === context.clip.id) continue;
    if (other.startSeconds >= oldEnd - 1e-12) other.startSeconds = frameTime(context.next, Math.max(0, other.startSeconds + delta));
  }
}

function remapAnnotations(document: MasteringDocument, mapTime: (seconds: number) => number, keepMarker: (seconds: number) => boolean) {
  document.markers = document.markers
    .map((marker) => ({ ...marker, seconds: frameTime(document, marker.seconds) }))
    .filter((marker) => keepMarker(marker.seconds))
    .map((marker) => ({ ...marker, seconds: mapTime(marker.seconds) }));
  document.regions = document.regions.flatMap((region) => {
    const startSeconds = mapTime(frameTime(document, region.startSeconds));
    const endSeconds = mapTime(frameTime(document, region.endSeconds));
    return endSeconds > startSeconds ? [{ ...region, startSeconds, endSeconds }] : [];
  });
}

/** Keeps only the selected part of the active clip; the clip stays anchored at its start and later clips ripple. */
export function cropProjectRevision(document: MasteringDocument, startSeconds: number, endSeconds: number): MasteringDocument {
  const context = activeContext(document);
  if (!context) return cloneDocument(document);
  const range = localRange(context, { startSeconds, endSeconds });
  const kept = frameTime(context.next, range.endSeconds - range.startSeconds);
  if (kept <= 0 || (range.startSeconds === 0 && kept === context.duration)) return cloneDocument(document);
  const { next, clip, start, duration } = context;
  const oldEnd = frameTime(next, start + duration);
  const absStart = frameTime(next, start + range.startSeconds);
  const absEnd = frameTime(next, start + range.endSeconds);
  const delta = kept - duration;
  clip.edits.push({ type: 'crop', startSeconds: range.startSeconds, endSeconds: range.endSeconds });
  clip.fadeIn = { ...clip.fadeIn, durationSeconds: Math.min(clip.fadeIn.durationSeconds, kept) };
  clip.fadeOut = { ...clip.fadeOut, durationSeconds: Math.min(clip.fadeOut.durationSeconds, kept - clip.fadeIn.durationSeconds) };
  rippleTrack(context, oldEnd, delta);
  const mapTime = (seconds: number) => {
    if (seconds <= start) return seconds;
    if (seconds >= oldEnd) return frameTime(next, seconds + delta);
    return frameTime(next, start + clamp(seconds, absStart, absEnd) - absStart);
  };
  remapAnnotations(next, mapTime, (seconds) => seconds < start || seconds > oldEnd || (seconds >= absStart && seconds <= absEnd));
  next.selection = { startSeconds: start, endSeconds: frameTime(next, start + kept) };
  next.playhead = mapTime(frameTime(next, document.playhead));
  return next;
}

/** Removes a range from the active clip, closing the gap and rippling later clips and annotations. */
export function deleteRangeRevision(document: MasteringDocument, startSeconds: number, endSeconds: number): MasteringDocument {
  const context = activeContext(document);
  if (!context) return cloneDocument(document);
  const range = localRange(context, { startSeconds, endSeconds });
  const removed = frameTime(context.next, range.endSeconds - range.startSeconds);
  if (removed <= 0 || removed >= context.duration) return cloneDocument(document);
  const { next, clip, start, duration } = context;
  const oldEnd = frameTime(next, start + duration);
  const absStart = frameTime(next, start + range.startSeconds);
  const absEnd = frameTime(next, start + range.endSeconds);
  clip.edits.push({ type: 'deleteRange', startSeconds: range.startSeconds, endSeconds: range.endSeconds });
  const remaining = duration - removed;
  clip.fadeIn = { ...clip.fadeIn, durationSeconds: Math.min(clip.fadeIn.durationSeconds, remaining) };
  clip.fadeOut = { ...clip.fadeOut, durationSeconds: Math.min(clip.fadeOut.durationSeconds, remaining - clip.fadeIn.durationSeconds) };
  rippleTrack(context, oldEnd, -removed);
  const mapTime = (seconds: number) => seconds <= absStart ? seconds : seconds >= absEnd ? frameTime(next, seconds - removed) : absStart;
  remapAnnotations(next, mapTime, (seconds) => seconds <= absStart || seconds >= absEnd);
  const duration2 = estimateDocumentDuration(next);
  next.selection = clampSelection({
    startSeconds: mapTime(frameTime(next, document.selection.startSeconds)),
    endSeconds: mapTime(frameTime(next, document.selection.endSeconds)),
  }, duration2);
  next.playhead = Math.min(duration2, mapTime(frameTime(next, document.playhead)));
  return next;
}

/** Inserts exact silence into the active clip at a timeline time (ledger 31). */
export function insertSilenceRevision(document: MasteringDocument, atSeconds: number, durationSeconds: number): MasteringDocument {
  const context = activeContext(document);
  if (!context) return cloneDocument(document);
  const { next, clip, start, duration } = context;
  const local = frameTime(next, clamp(finite(atSeconds) - start, 0, duration));
  const amount = frameTime(next, durationSeconds);
  if (amount <= 0) return cloneDocument(document);
  const oldEnd = frameTime(next, start + duration);
  const at = frameTime(next, start + local);
  clip.edits.push({ type: 'insertSilence', atSeconds: local, durationSeconds: amount });
  rippleTrack(context, oldEnd, amount);
  const shift = (seconds: number) => seconds >= at ? frameTime(next, seconds + amount) : seconds;
  remapAnnotations(next, shift, () => true);
  next.selection = {
    startSeconds: shift(frameTime(next, document.selection.startSeconds)),
    endSeconds: shift(frameTime(next, document.selection.endSeconds)),
  };
  next.playhead = shift(frameTime(next, document.playhead));
  return next;
}

/** Edits whose `startSeconds`/`endSeconds` are timeline ranges that must be mapped into clip time. */
const RANGE_EDIT_TYPES = new Set<AudioEdit['type']>(['reverse', 'roomTone']);

/**
 * Appends a length-preserving edit to the active clip. Range edits are given in
 * timeline seconds and mapped into the clip; ranges outside the clip or shorter
 * than one frame are rejected by returning an unchanged document. Room-tone
 * edits map their capture range the same way.
 */
export function appendAudioEditRevision(document: MasteringDocument, edit: AudioEdit): MasteringDocument {
  const context = activeContext(document);
  if (!context) return cloneDocument(document);
  if (edit.type === 'timeStretch') return stretchClipRevision(document, edit.ratio);
  let normalized: AudioEdit = structuredEditClone(edit);
  if (RANGE_EDIT_TYPES.has(edit.type) && 'startSeconds' in edit && 'endSeconds' in edit) {
    const range = localRange(context, edit);
    if (range.endSeconds <= range.startSeconds) return cloneDocument(document);
    normalized = { ...normalized, startSeconds: range.startSeconds, endSeconds: range.endSeconds } as AudioEdit;
  }
  if (normalized.type === 'roomTone') {
    const capture = localRange(context, { startSeconds: normalized.captureStartSeconds, endSeconds: normalized.captureEndSeconds });
    if (capture.endSeconds <= capture.startSeconds) return cloneDocument(document);
    normalized = { ...normalized, captureStartSeconds: capture.startSeconds, captureEndSeconds: capture.endSeconds };
  }
  context.clip.edits.push(normalized);
  return context.next;
}

/**
 * Time-stretches the active clip by `ratio` (ledger 29). Later clips on the
 * track ripple by the length change; markers, regions, selection, and playhead
 * inside the clip scale with it, and later ones shift.
 */
export function stretchClipRevision(document: MasteringDocument, ratio: number): MasteringDocument {
  const context = activeContext(document);
  if (!context || !Number.isFinite(ratio) || ratio <= 0 || Math.abs(ratio - 1) < 1e-9) return cloneDocument(document);
  const { next, clip, start, duration } = context;
  const oldEnd = frameTime(next, start + duration);
  clip.edits.push({ type: 'timeStretch', ratio });
  const newDuration = clipDurationSeconds(next, clip);
  if (newDuration <= 0) return cloneDocument(document);
  const delta = newDuration - duration;
  const scale = newDuration / duration;
  clip.fadeIn = { ...clip.fadeIn, durationSeconds: frameTime(next, clip.fadeIn.durationSeconds * scale) };
  clip.fadeOut = { ...clip.fadeOut, durationSeconds: frameTime(next, Math.min(clip.fadeOut.durationSeconds * scale, newDuration - clip.fadeIn.durationSeconds)) };
  rippleTrack(context, oldEnd, delta);
  const mapTime = (seconds: number) => seconds <= start ? seconds : seconds >= oldEnd ? frameTime(next, seconds + delta) : frameTime(next, start + (seconds - start) * scale);
  remapAnnotations(next, mapTime, () => true);
  next.selection = { startSeconds: mapTime(frameTime(next, document.selection.startSeconds)), endSeconds: mapTime(frameTime(next, document.selection.endSeconds)) };
  next.playhead = mapTime(frameTime(next, document.playhead));
  return next;
}

/** Clears the active clip's edits, restoring it to its source while keeping placement. */
export function resetClipEditsRevision(document: MasteringDocument): MasteringDocument {
  const context = activeContext(document);
  if (!context || !context.clip.edits.length) return cloneDocument(document);
  const { next, clip, start, duration } = context;
  const oldEnd = frameTime(next, start + duration);
  clip.edits = [];
  const delta = clipDurationSeconds(next, clip) - duration;
  rippleTrack(context, oldEnd, delta);
  const total = estimateDocumentDuration(next);
  next.selection = clampSelection(next.selection, total);
  next.playhead = Math.min(total, next.playhead);
  return next;
}

// --- SECTION: history ---

export function createProjectHistory(document = createMasteringDocument()): MasteringProjectHistory {
  return { past: [], present: cloneDocument(document), future: [] };
}

export function commitProjectRevision(history: MasteringProjectHistory, next: MasteringDocument): MasteringProjectHistory {
  const past = [...history.past, cloneDocument(history.present)].slice(-HISTORY_LIMIT);
  return { past, present: cloneDocument(next), future: [] };
}

export function undoProjectRevision(history: MasteringProjectHistory): MasteringProjectHistory {
  if (!history.past.length) return history;
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: cloneDocument(previous),
    future: [cloneDocument(history.present), ...history.future.map(cloneDocument)],
  };
}

export function redoProjectRevision(history: MasteringProjectHistory): MasteringProjectHistory {
  if (!history.future.length) return history;
  const [next, ...future] = history.future;
  return {
    past: [...history.past, cloneDocument(history.present)].slice(-HISTORY_LIMIT),
    present: cloneDocument(next),
    future: future.map(cloneDocument),
  };
}

/** Updates view state (selection, playhead, active clip) without creating an undo step. */
export function replaceProjectView(
  history: MasteringProjectHistory,
  patch: Partial<Pick<MasteringDocument, 'selection' | 'playhead' | 'activeClipId'>>,
): MasteringProjectHistory {
  const duration = estimateDocumentDuration(history.present);
  const selection = patch.selection ? clampSelection(patch.selection, duration) : history.present.selection;
  const playhead = patch.playhead === undefined ? history.present.playhead : Math.min(duration, nonNegative(patch.playhead));
  const activeClipId = patch.activeClipId !== undefined && findClip(history.present, patch.activeClipId)
    ? patch.activeClipId
    : history.present.activeClipId;
  return { ...history, present: { ...history.present, selection: { ...selection }, playhead, activeClipId } };
}

import {
  clampSelection,
  type AudioEdit,
  type MasteringMarker,
  type MasteringRegion,
  type TimeSelection,
} from './mastering-engine';

export interface MasteringSourceReference {
  id: string;
  name: string;
  durationSeconds: number;
  sampleRate: number;
}

export interface MasteringClipState {
  id: string;
  sourceId: string;
  timelineStartSeconds: number;
  sourceStartSeconds: number;
  sourceEndSeconds: number;
  gainDb: number;
}

export interface MasteringDocumentTrack {
  id: string;
  name: string;
  sourceId: string;
  gainDb: number;
  pan: number;
  muted: boolean;
  solo: boolean;
  clips: MasteringClipState[];
}
export interface MasteringDocument {
  version: 1;
  source: MasteringSourceReference | null;
  edits: AudioEdit[];
  selection: TimeSelection;
  playhead: number;
  markers: MasteringMarker[];
  regions: MasteringRegion[];
  tracks: MasteringDocumentTrack[];
  metadataEdits: Record<string, string>;
}

export interface MasteringProjectHistory {
  past: MasteringDocument[];
  present: MasteringDocument;
  future: MasteringDocument[];
}

const HISTORY_LIMIT = 100;
const finite = (value: number, fallback = 0) => Number.isFinite(value) ? value : fallback;
const nonNegative = (value: number) => Math.max(0, finite(value));
const sampleFrameTime = (seconds: number, sampleRate: number) => Math.min(Number.MAX_SAFE_INTEGER, Math.round(nonNegative(seconds) * sampleRate)) / sampleRate;

function cloneDocument(document: MasteringDocument): MasteringDocument {
  return {
    ...document,
    source: document.source ? { ...document.source } : null,
    edits: document.edits.map((edit) => ({ ...edit })),
    selection: { ...document.selection },
    markers: document.markers.map((marker) => ({ ...marker })),
    regions: document.regions.map((region) => ({ ...region })),
    tracks: document.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => ({ ...clip })),
    })),
    metadataEdits: { ...document.metadataEdits },
  };
}

export function createMasteringDocument(source: MasteringSourceReference | null = null): MasteringDocument {
  if (source && (!Number.isFinite(source.sampleRate) || source.sampleRate <= 0)) {
    throw new RangeError('A mastering source requires a positive finite sample rate.');
  }
  const duration = source ? sampleFrameTime(source.durationSeconds, source.sampleRate) : 0;
  return {
    version: 1,
    source: source ? { ...source, durationSeconds: duration } : null,
    edits: [],
    selection: { startSeconds: 0, endSeconds: duration },
    playhead: 0,
    markers: [],
    regions: [],
    tracks: source && duration > 0 ? [{
      id: `${source.id}:track:1`,
      name: 'Track 1',
      sourceId: source.id,
      gainDb: 0,
      pan: 0,
      muted: false,
      solo: false,
      clips: [{
        id: `${source.id}:clip:1`,
        sourceId: source.id,
        timelineStartSeconds: 0,
        sourceStartSeconds: 0,
        sourceEndSeconds: duration,
        gainDb: 0,
      }],
    }] : [],
    metadataEdits: {},
  };
}

export function createProjectHistory(document = createMasteringDocument()): MasteringProjectHistory {
  return { past: [], present: cloneDocument(document), future: [] };
}

export function splitClipRevision(
  document: MasteringDocument,
  clipId: string,
  splitAtSeconds: number,
  nextClipId: string,
): MasteringDocument {
  if (!nextClipId || document.tracks.some((track) => track.clips.some((clip) => clip.id === nextClipId))) {
    return cloneDocument(document);
  }
  const sampleRate = document.source?.sampleRate;
  if (!sampleRate) return cloneDocument(document);
  const at = sampleFrameTime(splitAtSeconds, sampleRate);
  let changed = false;
  const tracks = document.tracks.map((track) => {
    const index = track.clips.findIndex((clip) => clip.id === clipId);
    if (index < 0) return track;
    const clip = track.clips[index];
    const clipStart = sampleFrameTime(clip.timelineStartSeconds, sampleRate);
    const sourceStart = sampleFrameTime(clip.sourceStartSeconds, sampleRate);
    const sourceBoundary = sourceStart + at - clipStart;
    if (at <= clipStart || sourceBoundary >= sampleFrameTime(clip.sourceEndSeconds, sampleRate)) return track;
    changed = true;
    return {
      ...track,
      clips: [
        ...track.clips.slice(0, index),
        { ...clip, sourceEndSeconds: sourceBoundary },
        { ...clip, id: nextClipId, timelineStartSeconds: at, sourceStartSeconds: sourceBoundary },
        ...track.clips.slice(index + 1),
      ],
    };
  });
  return changed ? { ...cloneDocument(document), tracks } : cloneDocument(document);
}

export function moveClipRevision(
  document: MasteringDocument,
  clipId: string,
  timelineStartSeconds: number,
): MasteringDocument {
  const sampleRate = document.source?.sampleRate;
  if (!sampleRate) return cloneDocument(document);
  const nextStart = sampleFrameTime(timelineStartSeconds, sampleRate);
  let changed = false;
  const tracks = document.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (clip.id !== clipId || clip.timelineStartSeconds === nextStart) return clip;
      changed = true;
      return { ...clip, timelineStartSeconds: nextStart };
    }),
  }));
  return changed ? { ...cloneDocument(document), tracks } : cloneDocument(document);
}

export function duplicateClipRevision(
  document: MasteringDocument,
  clipId: string,
  nextClipId: string,
  timelineStartSeconds?: number,
): MasteringDocument {
  if (!nextClipId || document.tracks.some((track) => track.clips.some((clip) => clip.id === nextClipId))) {
    return cloneDocument(document);
  }
  const sampleRate = document.source?.sampleRate;
  if (!sampleRate) return cloneDocument(document);
  let changed = false;
  const tracks = document.tracks.map((track) => {
    const index = track.clips.findIndex((clip) => clip.id === clipId);
    if (index < 0) return track;
    changed = true;
    const clip = track.clips[index];
    const start = sampleFrameTime(timelineStartSeconds === undefined
      ? clip.timelineStartSeconds + clip.sourceEndSeconds - clip.sourceStartSeconds
      : timelineStartSeconds, sampleRate);
    return {
      ...track,
      clips: [...track.clips.slice(0, index + 1), { ...clip, id: nextClipId, timelineStartSeconds: start }, ...track.clips.slice(index + 1)],
    };
  });
  return changed ? { ...cloneDocument(document), tracks } : cloneDocument(document);
}

export function nudgeClipRevision(
  document: MasteringDocument,
  clipId: string,
  deltaSeconds: number,
): MasteringDocument {
  const clip = document.tracks.flatMap((track) => track.clips).find((candidate) => candidate.id === clipId);
  return clip
    ? moveClipRevision(document, clipId, clip.timelineStartSeconds + finite(deltaSeconds))
    : cloneDocument(document);
}

function sourceSampleRate(document: MasteringDocument): number | null {
  const sampleRate = document.source?.sampleRate;
  return typeof sampleRate === 'number' && Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : null;
}

function timelineFrameTime(document: MasteringDocument, seconds: number): number {
  const sampleRate = sourceSampleRate(document);
  return sampleRate ? sampleFrameTime(seconds, sampleRate) : nonNegative(seconds);
}

function timelineRange(
  document: MasteringDocument,
  range: TimeSelection,
  duration: number,
): TimeSelection {
  const selected = clampSelection(range, duration);
  const sampleRate = sourceSampleRate(document);
  return sampleRate ? clampSelection({
    startSeconds: sampleFrameTime(selected.startSeconds, sampleRate),
    endSeconds: sampleFrameTime(selected.endSeconds, sampleRate),
  }, duration) : selected;
}

function normalizeAudioEdit(document: MasteringDocument, edit: AudioEdit): AudioEdit | null {
  const duration = estimateDocumentDuration(document);
  switch (edit.type) {
    case 'crop':
    case 'deleteRange':
    case 'reverse': {
      const range = timelineRange(document, edit, duration);
      return range.endSeconds > range.startSeconds ? { ...edit, ...range } : null;
    }
    case 'insertSilence': {
      const atSeconds = Math.min(duration, timelineFrameTime(document, Math.min(duration, edit.atSeconds)));
      const durationSeconds = timelineFrameTime(document, edit.durationSeconds);
      return durationSeconds > 0 ? { ...edit, atSeconds, durationSeconds } : null;
    }
    default:
      return { ...edit };
  }
}

export function estimateDocumentDuration(document: MasteringDocument): number {
  let duration = document.source ? timelineFrameTime(document, document.source.durationSeconds) : 0;
  for (const edit of document.edits) {
    if (edit.type === 'crop') {
      const range = timelineRange(document, edit, duration);
      duration = timelineFrameTime(document, range.endSeconds - range.startSeconds);
    } else if (edit.type === 'deleteRange') {
      const range = timelineRange(document, edit, duration);
      duration = timelineFrameTime(document, duration - (range.endSeconds - range.startSeconds));
    } else if (edit.type === 'insertSilence') {
      duration = timelineFrameTime(document, duration + timelineFrameTime(document, edit.durationSeconds));
    }
  }
  return duration;
}

export function commitProjectRevision(
  history: MasteringProjectHistory,
  next: MasteringDocument,
): MasteringProjectHistory {
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
export function replaceProjectView(
  history: MasteringProjectHistory,
  patch: Partial<Pick<MasteringDocument, 'selection' | 'playhead'>>,
): MasteringProjectHistory {
  const duration = estimateDocumentDuration(history.present);
  const selection = patch.selection
    ? clampSelection(patch.selection, duration)
    : history.present.selection;
  const playhead = patch.playhead === undefined
    ? history.present.playhead
    : Math.min(duration, nonNegative(patch.playhead));
  return {
    ...history,
    present: {
      ...history.present,
      selection: { ...selection },
      playhead,
    },
  };
}

export function cropProjectRevision(
  document: MasteringDocument,
  startSeconds: number,
  endSeconds: number,
): MasteringDocument {
  const duration = estimateDocumentDuration(document);
  const selected = timelineRange(document, { startSeconds, endSeconds }, duration);
  const nextDuration = timelineFrameTime(document, selected.endSeconds - selected.startSeconds);
  if (nextDuration <= 0) return cloneDocument(document);
  return {
    ...cloneDocument(document),
    edits: [...document.edits.map((edit) => ({ ...edit })), {
      type: 'crop',
      startSeconds: selected.startSeconds,
      endSeconds: selected.endSeconds,
    }],
    markers: document.markers
      .map((marker) => ({ ...marker, seconds: timelineFrameTime(document, marker.seconds) }))
      .filter((marker) => marker.seconds >= selected.startSeconds && marker.seconds <= selected.endSeconds)
      .map((marker) => ({ ...marker, seconds: marker.seconds - selected.startSeconds })),
    regions: document.regions.flatMap((region) => {
      const regionStart = timelineFrameTime(document, region.startSeconds);
      const regionEnd = timelineFrameTime(document, region.endSeconds);
      const start = Math.max(regionStart, selected.startSeconds);
      const end = Math.min(regionEnd, selected.endSeconds);
      return end > start ? [{
        ...region,
        startSeconds: start - selected.startSeconds,
        endSeconds: end - selected.startSeconds,
      }] : [];
    }),
    selection: { startSeconds: 0, endSeconds: nextDuration },
    playhead: Math.min(nextDuration, Math.max(0, timelineFrameTime(document, document.playhead) - selected.startSeconds)),
  };
}

export function deleteRangeRevision(
  document: MasteringDocument,
  startSeconds: number,
  endSeconds: number,
): MasteringDocument {
  const duration = estimateDocumentDuration(document);
  const selected = timelineRange(document, { startSeconds, endSeconds }, duration);
  const removed = timelineFrameTime(document, selected.endSeconds - selected.startSeconds);
  if (removed <= 0) return cloneDocument(document);
  const mapTime = (seconds: number) => {
    const frameTime = timelineFrameTime(document, seconds);
    return frameTime <= selected.startSeconds
      ? frameTime
      : frameTime >= selected.endSeconds
        ? frameTime - removed
        : selected.startSeconds;
  };
  const nextDuration = timelineFrameTime(document, duration - removed);
  const selection = timelineRange(document, document.selection, duration);
  const nextSelection = clampSelection({
    startSeconds: mapTime(selection.startSeconds),
    endSeconds: mapTime(selection.endSeconds),
  }, nextDuration);
  return {
    ...cloneDocument(document),
    edits: [...document.edits.map((edit) => ({ ...edit })), {
      type: 'deleteRange',
      startSeconds: selected.startSeconds,
      endSeconds: selected.endSeconds,
    }],
    markers: document.markers
      .map((marker) => ({ ...marker, seconds: timelineFrameTime(document, marker.seconds) }))
      .filter((marker) => marker.seconds <= selected.startSeconds || marker.seconds >= selected.endSeconds)
      .map((marker) => ({ ...marker, seconds: mapTime(marker.seconds) })),
    regions: document.regions.flatMap((region) => {
      const start = mapTime(region.startSeconds);
      const end = mapTime(region.endSeconds);
      return end > start ? [{ ...region, startSeconds: start, endSeconds: end }] : [];
    }),
    selection: nextSelection,
    playhead: Math.min(nextDuration, Math.max(0, mapTime(timelineFrameTime(document, document.playhead)))),
  };
}

export function insertSilenceRevision(
  document: MasteringDocument,
  atSeconds: number,
  durationSeconds: number,
): MasteringDocument {
  const duration = estimateDocumentDuration(document);
  const at = Math.min(duration, timelineFrameTime(document, Math.min(duration, nonNegative(atSeconds))));
  const amount = timelineFrameTime(document, durationSeconds);
  if (amount <= 0) return cloneDocument(document);
  const shift = (seconds: number) => {
    const frameTime = timelineFrameTime(document, seconds);
    return frameTime >= at ? frameTime + amount : frameTime;
  };
  return {
    ...cloneDocument(document),
    edits: [...document.edits.map((edit) => ({ ...edit })), {
      type: 'insertSilence',
      atSeconds: at,
      durationSeconds: amount,
    }],
    markers: document.markers.map((marker) => ({ ...marker, seconds: shift(marker.seconds) })),
    regions: document.regions.map((region) => ({
      ...region,
      startSeconds: shift(region.startSeconds),
      endSeconds: shift(region.endSeconds),
    })),
    selection: {
      startSeconds: shift(document.selection.startSeconds),
      endSeconds: shift(document.selection.endSeconds),
    },
    playhead: shift(document.playhead),
  };
}

export function appendAudioEditRevision(
  document: MasteringDocument,
  edit: AudioEdit,
): MasteringDocument {
  const normalized = normalizeAudioEdit(document, edit);
  return normalized ? {
    ...cloneDocument(document),
    edits: [...document.edits.map((existing) => ({ ...existing })), normalized],
  } : cloneDocument(document);
}

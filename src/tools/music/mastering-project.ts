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
  const duration = source ? nonNegative(source.durationSeconds) : 0;
  return {
    version: 1,
    source: source ? { ...source, durationSeconds: duration } : null,
    edits: [],
    selection: { startSeconds: 0, endSeconds: duration },
    playhead: 0,
    markers: [],
    regions: [],
    tracks: [],
    metadataEdits: {},
  };
}

export function createProjectHistory(document = createMasteringDocument()): MasteringProjectHistory {
  return { past: [], present: cloneDocument(document), future: [] };
}

export function estimateDocumentDuration(document: MasteringDocument): number {
  let duration = document.source ? nonNegative(document.source.durationSeconds) : 0;
  for (const edit of document.edits) {
    if (edit.type === 'crop') {
      const range = clampSelection({ startSeconds: edit.startSeconds, endSeconds: edit.endSeconds }, duration);
      duration = range.endSeconds - range.startSeconds;
    } else if (edit.type === 'insertSilence') {
      duration += nonNegative(edit.durationSeconds);
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
  const selected = clampSelection({ startSeconds, endSeconds }, duration);
  const nextDuration = selected.endSeconds - selected.startSeconds;
  if (nextDuration <= 0) return cloneDocument(document);
  return {
    ...cloneDocument(document),
    edits: [...document.edits.map((edit) => ({ ...edit })), {
      type: 'crop',
      startSeconds: selected.startSeconds,
      endSeconds: selected.endSeconds,
    }],
    markers: document.markers
      .filter((marker) => marker.seconds >= selected.startSeconds && marker.seconds <= selected.endSeconds)
      .map((marker) => ({ ...marker, seconds: marker.seconds - selected.startSeconds })),
    regions: document.regions.flatMap((region) => {
      const start = Math.max(region.startSeconds, selected.startSeconds);
      const end = Math.min(region.endSeconds, selected.endSeconds);
      return end > start ? [{
        ...region,
        startSeconds: start - selected.startSeconds,
        endSeconds: end - selected.startSeconds,
      }] : [];
    }),
    selection: { startSeconds: 0, endSeconds: nextDuration },
    playhead: Math.min(nextDuration, Math.max(0, document.playhead - selected.startSeconds)),
  };
}

export function insertSilenceRevision(
  document: MasteringDocument,
  atSeconds: number,
  durationSeconds: number,
): MasteringDocument {
  const duration = estimateDocumentDuration(document);
  const at = Math.min(duration, nonNegative(atSeconds));
  const amount = nonNegative(durationSeconds);
  if (amount <= 0) return cloneDocument(document);
  const shift = (seconds: number) => seconds >= at ? seconds + amount : seconds;
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
  return {
    ...cloneDocument(document),
    edits: [...document.edits.map((existing) => ({ ...existing })), { ...edit }],
  };
}

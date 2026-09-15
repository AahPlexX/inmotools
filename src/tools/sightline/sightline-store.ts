/**
 * Reader state.
 *
 * Everything the reader would be annoyed to lose lives in one versioned record
 * in `localStorage`: their engine settings, bookmarks, highlights, margin
 * notes, and the exact token position they stopped at. Sessions and the
 * vocabulary bank go to IndexedDB instead, because they grow without bound.
 *
 * The record is keyed by a fingerprint of the document — title, format, byte
 * length, and token count — so a different document does not inherit another
 * one's bookmarks, and reopening the same file does.
 */

import type { DocumentModel } from './sightline-types';
import type { PacingConfig } from './pacing-engine';
import type { ChunkConfig } from './chunk-engine';
import type { DrillConfig } from './drill-engine';
import type { MetronomeConfig } from './metronome-engine';
import type { ReaderAppearance } from './palette-engine';
import type { PeripheralConfig } from './peripheral-engine';
import type { GradientOptions } from './gradient-engine';
import type { EmphasisConfig } from './typography-engine';
import type { PacerConfig } from './pacer-engine';

export const STORAGE_KEY = 'inmotools.sightline.v1';
export const STATE_VERSION = 1 as const;

export type EngineId = 'rsvp' | 'chunk' | 'page' | 'peripheral' | 'drill';

export interface Bookmark {
  readonly id: string;
  readonly tokenIndex: number;
  readonly label: string;
  readonly chapterIndex: number;
  readonly createdAt: number;
}

export type HighlightColor = 'amber' | 'mint' | 'sky' | 'rose' | 'violet';

export interface Highlight {
  readonly id: string;
  readonly startToken: number;
  readonly endToken: number;
  readonly color: HighlightColor;
  readonly createdAt: number;
}

export interface MarginNote {
  readonly id: string;
  readonly tokenIndex: number;
  readonly text: string;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface ReaderSettings {
  readonly engine: EngineId;
  readonly pacing: PacingConfig;
  readonly chunk: ChunkConfig;
  readonly drill: DrillConfig;
  readonly metronome: MetronomeConfig;
  readonly appearance: ReaderAppearance;
  readonly peripheral: PeripheralConfig;
  readonly gradient: GradientOptions;
  readonly gradientPalette: string;
  readonly emphasis: EmphasisConfig;
  readonly pacer: PacerConfig;
  readonly speechEnabled: boolean;
  readonly metronomeEnabled: boolean;
  readonly ttsVoiceName: string;
  readonly proseOnly: boolean;
  readonly includeNotes: boolean;
  readonly showMetrics: boolean;
}

export interface DocumentProgress {
  readonly documentId: string;
  readonly title: string;
  readonly format: string;
  readonly tokenIndex: number;
  readonly tokenCount: number;
  readonly chapterIndex: number;
  readonly wpm: number;
  readonly updatedAt: number;
}

export interface SightlineState {
  readonly version: typeof STATE_VERSION;
  readonly settings: ReaderSettings;
  readonly bookmarks: readonly Bookmark[];
  readonly highlights: readonly Highlight[];
  readonly notes: readonly MarginNote[];
  readonly progress: readonly DocumentProgress[];
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  engine: 'rsvp',
  pacing: {
    wpm: 300,
    respectBreaks: true,
    periodMultiplier: 2.5,
    clauseMultiplier: 1.8,
    paragraphMultiplier: 2,
    chapterMultiplier: 3.2,
    compensator: 'syllable',
    ramp: null,
  },
  chunk: { wordsPerChunk: 3, splitPolicy: 'punctuation' },
  drill: { flashMs: 120, wordsPerFlash: 1, gapMs: 900, flashCount: 20, repeatAfter: 5, seed: 1, preferWeakWords: false },
  metronome: { bpm: 300, accentEvery: 4, toneHz: 1100, clickMs: 18, volume: 0.35, channel: 'audio' },
  appearance: {
    theme: 'parchment',
    font: 'atkinson',
    fontScale: 1,
    lineHeight: 1.7,
    letterSpacing: 0,
    wordSpacing: 0,
    focalMarker: 'crosshair',
    anchorAccent: 'accent',
    reduceMotion: false,
    dyslexiaSpacing: false,
    highlightCurrentWord: true,
  },
  peripheral: { columns: 3, columnChars: 24, gapRatio: 0.6, spread: 0.9, wordsPerColumn: 12, edgeFade: true },
  gradient: { direction: 'horizontal', intensity: 1, wash: false },
  gradientPalette: 'horizon',
  emphasis: { level: 3, fraction: 0.4, maxLetters: 4, minLetters: 1 },
  pacer: { shape: 'underline', anchorFraction: 0.45, barWidth: 96, feather: 24, glideSeconds: 0.06 },
  speechEnabled: false,
  metronomeEnabled: false,
  ttsVoiceName: '',
  proseOnly: false,
  includeNotes: false,
  showMetrics: true,
};

export const createDefaultState = (): SightlineState => ({
  version: STATE_VERSION,
  settings: DEFAULT_SETTINGS,
  bookmarks: [],
  highlights: [],
  notes: [],
  progress: [],
});

/** Stable fingerprint for a document, used to scope bookmarks and progress. */
export const documentId = (model: Pick<DocumentModel, 'format' | 'byteLength' | 'tokens' | 'metadata' | 'fileName'>): string => {
  const title = model.metadata.title || model.fileName;
  return `${model.format}:${model.byteLength}:${model.tokens.length}:${hashString(title)}`;
};

const hashString = (value: string): string => {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return (hash >>> 0).toString(36);
};

export const readState = (storage: Pick<Storage, 'getItem'>): SightlineState => {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return createDefaultState();
    const parsed = JSON.parse(raw) as Partial<SightlineState>;
    if (parsed.version !== STATE_VERSION) return createDefaultState();
    const defaults = createDefaultState();
    return {
      version: STATE_VERSION,
      settings: { ...defaults.settings, ...(parsed.settings ?? {}) },
      bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
      highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes : [],
      progress: Array.isArray(parsed.progress) ? parsed.progress : [],
    };
  } catch {
    return createDefaultState();
  }
};

export const writeState = (storage: Pick<Storage, 'setItem'>, state: SightlineState): void => {
  storage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const updateSettings = (state: SightlineState, patch: Partial<ReaderSettings>): SightlineState => ({
  ...state,
  settings: { ...state.settings, ...patch },
});

export const makeId = (prefix: string, at = Date.now()): string =>
  `${prefix}-${at.toString(36)}-${Math.round(Math.random() * 1e6).toString(36)}`;

export const addBookmark = (
  state: SightlineState,
  bookmark: { tokenIndex: number; label: string; chapterIndex: number; createdAt?: number },
): SightlineState => ({
  ...state,
  bookmarks: [
    ...state.bookmarks.filter((entry) => entry.tokenIndex !== bookmark.tokenIndex),
    {
      id: makeId('bookmark', bookmark.createdAt),
      tokenIndex: bookmark.tokenIndex,
      label: bookmark.label,
      chapterIndex: bookmark.chapterIndex,
      createdAt: bookmark.createdAt ?? Date.now(),
    },
  ].sort((left, right) => left.tokenIndex - right.tokenIndex),
});

export const removeBookmark = (state: SightlineState, id: string): SightlineState => ({
  ...state,
  bookmarks: state.bookmarks.filter((entry) => entry.id !== id),
});

export const addHighlight = (
  state: SightlineState,
  highlight: { startToken: number; endToken: number; color: HighlightColor; createdAt?: number },
): SightlineState => {
  const start = Math.min(highlight.startToken, highlight.endToken);
  const end = Math.max(highlight.startToken, highlight.endToken);
  // Overlapping highlights replace each other rather than stacking, so removing
  // a highlight always restores the original text colour.
  const remaining = state.highlights.filter((entry) => end < entry.startToken || start > entry.endToken);
  return {
    ...state,
    highlights: [...remaining, {
      id: makeId('highlight', highlight.createdAt),
      startToken: start,
      endToken: end,
      color: highlight.color,
      createdAt: highlight.createdAt ?? Date.now(),
    }].sort((left, right) => left.startToken - right.startToken),
  };
};

export const removeHighlight = (state: SightlineState, id: string): SightlineState => ({
  ...state,
  highlights: state.highlights.filter((entry) => entry.id !== id),
});

export const upsertNote = (
  state: SightlineState,
  note: { id?: string; tokenIndex: number; text: string; at?: number },
): SightlineState => {
  const at = note.at ?? Date.now();
  const existing = note.id ? state.notes.find((entry) => entry.id === note.id) : undefined;
  if (existing) {
    return {
      ...state,
      notes: state.notes.map((entry) => (entry.id === existing.id
        ? { ...entry, text: note.text, tokenIndex: note.tokenIndex, updatedAt: at }
        : entry)),
    };
  }
  return {
    ...state,
    notes: [...state.notes, {
      id: note.id ?? makeId('note', at),
      tokenIndex: note.tokenIndex,
      text: note.text,
      createdAt: at,
      updatedAt: at,
    }].sort((left, right) => left.tokenIndex - right.tokenIndex),
  };
};

export const removeNote = (state: SightlineState, id: string): SightlineState => ({
  ...state,
  notes: state.notes.filter((entry) => entry.id !== id),
});

/** Record where the reader stopped, keeping one entry per document. */
export const saveProgress = (
  state: SightlineState,
  progress: Omit<DocumentProgress, 'updatedAt'> & { updatedAt?: number },
): SightlineState => ({
  ...state,
  progress: [
    ...state.progress.filter((entry) => entry.documentId !== progress.documentId),
    { ...progress, updatedAt: progress.updatedAt ?? Date.now() },
  ].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 40),
});

export const progressFor = (state: SightlineState, id: string): DocumentProgress | undefined =>
  state.progress.find((entry) => entry.documentId === id);

/** Nearest bookmark at or before a position, for the resume control. */
export const nearestBookmark = (state: SightlineState, tokenIndex: number): Bookmark | undefined =>
  [...state.bookmarks]
    .filter((bookmark) => bookmark.tokenIndex <= tokenIndex)
    .sort((left, right) => right.tokenIndex - left.tokenIndex)[0]
    ?? state.bookmarks[0];

export const highlightFor = (state: SightlineState, tokenIndex: number): Highlight | undefined =>
  state.highlights.find((entry) => tokenIndex >= entry.startToken && tokenIndex <= entry.endToken);

export const notesFor = (state: SightlineState, tokenIndex: number): MarginNote[] =>
  state.notes.filter((entry) => Math.abs(entry.tokenIndex - tokenIndex) <= 1);

/** State as a downloadable JSON document. */
export const exportState = (state: SightlineState): string => JSON.stringify(state, null, 2);

export interface ImportResult {
  readonly state: SightlineState;
  readonly message: string;
}

/** Read a state file back, keeping the current state if the file is unusable. */
export const importState = (current: SightlineState, payload: string): ImportResult => {
  try {
    const parsed = JSON.parse(payload) as Partial<SightlineState>;
    if (parsed.version !== STATE_VERSION) {
      return { state: current, message: 'That file was written by a different version of this tool, so nothing was imported.' };
    }
    const defaults = createDefaultState();
    return {
      state: {
        version: STATE_VERSION,
        settings: { ...defaults.settings, ...(parsed.settings ?? {}) },
        bookmarks: Array.isArray(parsed.bookmarks) ? parsed.bookmarks : [],
        highlights: Array.isArray(parsed.highlights) ? parsed.highlights : [],
        notes: Array.isArray(parsed.notes) ? parsed.notes : [],
        progress: Array.isArray(parsed.progress) ? parsed.progress : [],
      },
      message: 'Reader state imported.',
    };
  } catch {
    return { state: current, message: 'That file could not be read as a reader-state file.' };
  }
};

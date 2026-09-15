/**
 * Session tracking.
 *
 * Everything the reader sees about their own reading — words per minute,
 * time left, how far through the document they are — is computed here from the
 * events the presentation engines emit. Nothing is inferred from typing
 * behaviour, and nothing leaves the browser: a session is a plain object that
 * the analytics store may keep locally.
 *
 * The realised rate is measured, not assumed. It counts the words actually
 * presented and divides by the time that actually passed, so a paused session
 * reports the rate it achieved rather than the rate that was requested.
 */

import type { DocumentModel } from './sightline-types';

export interface SessionState {
  /** Identifier used by the local warehouse. */
  readonly id: string;
  readonly documentTitle: string;
  readonly format: string;
  /** Milliseconds of reading time, excluding pauses. */
  elapsedMs: number;
  /** Tokens presented so far. */
  tokensRead: number;
  /** Position in the document model. */
  position: number;
  startedAt: number;
  lastEventAt: number;
  paused: boolean;
  pausedMs: number;
  /** Highest rate reached during the session, for the ramp report. */
  peakWpm: number;
  readonly lagSamples: number[];
}

export interface SessionEvent {
  /** Token index that was presented. */
  readonly tokenIndex: number;
  /** Wall-clock time of the event, in milliseconds since the epoch. */
  readonly at: number;
  /** Rate used for this token. */
  readonly wpm: number;
}

export const createSession = (
  model: DocumentModel,
  at = Date.now(),
  id = `sightline-${at}-${Math.round(Math.random() * 1e6)}`,
): SessionState => ({
  id,
  documentTitle: model.metadata.title || model.fileName.replace(/\.[^.]+$/, ''),
  format: model.format,
  elapsedMs: 0,
  tokensRead: 0,
  position: 0,
  startedAt: at,
  lastEventAt: at,
  paused: false,
  pausedMs: 0,
  peakWpm: 0,
  lagSamples: [],
});

export interface SessionTick {
  readonly tokensRead: number;
  readonly elapsedMs: number;
  readonly wpm: number;
  /** Milliseconds of reading still ahead at the current realised rate. */
  readonly remainingMs: number;
  /** Fraction of the document read, 0–1. */
  readonly progress: number;
  /** Estimated time of arrival, as a wall-clock timestamp. */
  readonly eta: number;
}

export const advanceSession = (
  state: SessionState,
  totalTokens: number,
  event: SessionEvent,
): SessionState => {
  const deltaMs = Math.max(0, event.at - state.lastEventAt);
  const tokens = Math.max(state.tokensRead + 1, event.tokenIndex + 1);
  return {
    ...state,
    elapsedMs: state.elapsedMs + (state.paused ? 0 : deltaMs),
    pausedMs: state.pausedMs + (state.paused ? deltaMs : 0),
    tokensRead: tokens,
    position: event.tokenIndex,
    lastEventAt: event.at,
    peakWpm: Math.max(state.peakWpm, event.wpm),
  };
};

/** Record the gap between the requested rate and the rate actually achieved. */
export const recordLag = (state: SessionState, requestedWpm: number, realisedWpm: number): SessionState => ({
  ...state,
  lagSamples: [...state.lagSamples.slice(-199), Math.max(-400, Math.min(400, realisedWpm - requestedWpm))],
});

export const pauseSession = (state: SessionState, at = Date.now()): SessionState => ({
  ...state,
  paused: true,
  pausedMs: state.pausedMs + Math.max(0, at - state.lastEventAt),
  lastEventAt: at,
});

export const resumeSession = (state: SessionState, at = Date.now()): SessionState => ({
  ...state,
  paused: false,
  // The span spent paused counts toward paused time, not reading time.
  pausedMs: state.pausedMs + Math.max(0, at - state.lastEventAt),
  lastEventAt: at,
});

/** Reading rate measured over the time actually spent reading. */
export const realisedWpm = (state: SessionState): number => {
  if (state.elapsedMs <= 0) return 0;
  return Math.round((state.tokensRead * 60_000) / state.elapsedMs);
};

export const sessionTick = (state: SessionState, totalTokens: number, now = Date.now()): SessionTick => {
  const wpm = realisedWpm(state);
  const remainingTokens = Math.max(0, totalTokens - state.tokensRead);
  const remainingMs = wpm > 0 ? Math.round((remainingTokens * 60_000) / wpm) : 0;
  return {
    tokensRead: state.tokensRead,
    elapsedMs: state.elapsedMs,
    wpm,
    remainingMs,
    progress: totalTokens === 0 ? 0 : Math.min(1, state.tokensRead / totalTokens),
    eta: now + remainingMs,
  };
};

/** Format a duration for the status bar. */
export const formatDuration = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${seconds.toString().padStart(2, '0')}s`;
  return `${seconds}s`;
};

export const formatEta = (timestamp: number, now = Date.now()): string => {
  const remaining = Math.max(0, timestamp - now);
  if (remaining < 30_000) return 'almost done';
  return `about ${formatDuration(remaining)} left`;
};

export interface SessionSummary {
  readonly id: string;
  readonly documentTitle: string;
  readonly format: string;
  readonly tokensRead: number;
  readonly elapsedMs: number;
  readonly pausedMs: number;
  readonly averageWpm: number;
  readonly peakWpm: number;
  readonly startedAt: number;
  readonly finishedAt: number;
  /** Mean of the lag samples, which shows how far the engine drifted. */
  readonly meanLagWpm: number;
}

export const summariseSession = (state: SessionState, finishedAt = Date.now()): SessionSummary => ({
  id: state.id,
  documentTitle: state.documentTitle,
  format: state.format,
  tokensRead: state.tokensRead,
  elapsedMs: state.elapsedMs,
  pausedMs: state.pausedMs,
  averageWpm: realisedWpm(state),
  peakWpm: state.peakWpm,
  startedAt: state.startedAt,
  finishedAt,
  meanLagWpm: state.lagSamples.length === 0
    ? 0
    : Math.round((state.lagSamples.reduce((total, sample) => total + sample, 0) / state.lagSamples.length) * 10) / 10,
});

/**
 * Suggest the next session's target rate. The rule is deliberately
 * conservative: raise the target only when the realised rate reached it, and
 * lower it when the reader fell consistently short, because a target the reader
 * cannot hold is worse than a slower one they can.
 */
export const suggestNextWpm = (state: SessionState, requestedWpm: number): number => {
  const realised = realisedWpm(state);
  if (realised === 0) return requestedWpm;
  const ratio = realised / Math.max(1, requestedWpm);
  if (ratio >= 0.98 && state.lagSamples.every((sample) => sample >= -40)) return Math.min(1600, requestedWpm + 25);
  if (ratio < 0.8) return Math.max(40, requestedWpm - 25);
  return requestedWpm;
};

/** Reading streak over the last days of recorded sessions. */
export const readingStreak = (
  sessions: readonly { readonly startedAt: number }[],
  now = Date.now(),
): number => {
  if (sessions.length === 0) return 0;
  const dayKey = (timestamp: number): string => new Date(timestamp).toISOString().slice(0, 10);
  const days = new Set(sessions.map((session) => dayKey(session.startedAt)));
  let streak = 0;
  const cursor = new Date(now);
  while (streak < 400) {
    if (!days.has(dayKey(cursor.getTime()))) break;
    streak += 1;
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  }
  return streak;
};

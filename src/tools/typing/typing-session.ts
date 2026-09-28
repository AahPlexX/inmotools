import type { FinishReason } from './typing-engine';

export type SessionStatus = 'ready' | 'running' | 'paused' | 'finished';

export interface SessionClock {
  status: SessionStatus;
  accumulatedPausedMs: number;
  pausedAtReal: number | null;
  finishReason: FinishReason | null;
}

export function createSessionClock(): SessionClock {
  return {
    status: 'ready',
    accumulatedPausedMs: 0,
    pausedAtReal: null,
    finishReason: null,
  };
}

export function effectiveSessionNow(clock: SessionClock, realNow: number): number {
  const currentPause = clock.status === 'paused' && clock.pausedAtReal != null
    ? Math.max(0, realNow - clock.pausedAtReal)
    : 0;
  return realNow - clock.accumulatedPausedMs - currentPause;
}

export function startSession(clock: SessionClock): SessionClock {
  if (clock.status !== 'ready') return clock;
  return { ...clock, status: 'running', finishReason: null };
}

export function pauseSession(clock: SessionClock, realNow: number): SessionClock {
  if (clock.status !== 'running') return clock;
  return { ...clock, status: 'paused', pausedAtReal: realNow };
}

export function resumeSession(clock: SessionClock, realNow: number): SessionClock {
  if (clock.status !== 'paused' || clock.pausedAtReal == null) return clock;
  return {
    ...clock,
    status: 'running',
    accumulatedPausedMs: clock.accumulatedPausedMs + Math.max(0, realNow - clock.pausedAtReal),
    pausedAtReal: null,
  };
}

export function finishSession(clock: SessionClock, reason: FinishReason, realNow: number): SessionClock {
  if (clock.status === 'finished') return clock;
  const resumed = clock.status === 'paused' ? resumeSession(clock, realNow) : clock;
  return { ...resumed, status: 'finished', pausedAtReal: null, finishReason: reason };
}

export function resetSession(): SessionClock {
  return createSessionClock();
}

export function isSessionActive(clock: SessionClock): boolean {
  return clock.status === 'running' || clock.status === 'paused';
}

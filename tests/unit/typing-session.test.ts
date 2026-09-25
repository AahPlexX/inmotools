import { describe, expect, it } from 'vitest';
import {
  createSessionClock,
  effectiveSessionNow,
  finishSession,
  pauseSession,
  resetSession,
  resumeSession,
  startSession,
} from '../../src/tools/typing/typing-session';

describe('typing session clock', () => {
  it('freezes effective time while paused and excludes pause duration after resume', () => {
    let clock = startSession(createSessionClock());
    expect(effectiveSessionNow(clock, 1000)).toBe(1000);

    clock = pauseSession(clock, 1200);
    expect(effectiveSessionNow(clock, 2200)).toBe(1200);

    clock = resumeSession(clock, 2200);
    expect(effectiveSessionNow(clock, 2500)).toBe(1500);
  });

  it('accumulates multiple pauses without making effective time move backward', () => {
    let clock = startSession(createSessionClock());
    clock = pauseSession(clock, 100);
    clock = resumeSession(clock, 400);
    clock = pauseSession(clock, 700);
    expect(effectiveSessionNow(clock, 900)).toBe(400);
    clock = resumeSession(clock, 900);
    expect(effectiveSessionNow(clock, 1000)).toBe(500);
  });

  it('finishes from a paused state without counting the paused span', () => {
    let clock = startSession(createSessionClock());
    clock = pauseSession(clock, 500);
    const frozen = effectiveSessionNow(clock, 1200);
    const finished = finishSession(clock, 'stopped', 1200);
    expect(finished.status).toBe('finished');
    expect(finished.finishReason).toBe('stopped');
    expect(effectiveSessionNow(finished, 1200)).toBe(frozen);
  });

  it('reset clears pause accounting and restores ready state', () => {
    let clock = startSession(createSessionClock());
    clock = pauseSession(clock, 100);
    clock = resumeSession(clock, 300);
    expect(resetSession()).toEqual(createSessionClock());
  });
});

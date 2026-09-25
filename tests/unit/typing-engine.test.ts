import { describe, expect, it } from 'vitest';
import {
  computeMetrics,
  finish,
  generateDrill,
  generateWords,
  ghostSeries,
  initState,
  isCleanlyCompleted,
  ngramLatencies,
  perKeyStats,
  pressKey,
  weakKeys,
  wpmSeries,
} from '../../src/tools/typing/typing-engine';

function typeString(text: string, target: string, startAtT = 0, dtMs = 100) {
  let state = initState(target);
  let t = startAtT;
  for (const ch of text) {
    t += dtMs;
    state = pressKey(state, ch, `Key${ch.toUpperCase()}`, t);
  }
  return { state, endT: t };
}

describe('typing engine — reducer', () => {
  it('explicitly starts the timer without creating a keystroke and is idempotent', () => {
    const initial = initState('hello');
    const started = start(initial, 125);
    expect(started.startedAt).toBe(125);
    expect(started.events).toHaveLength(0);
    expect(start(started, 500)).toBe(started);
  });

  it('records an intentional stopped finish separately from aborts and failures', () => {
    const stopped = finish(start(initState('hello'), 100), 'stopped', 600);
    expect(stopped.finished).toBe(true);
    expect(stopped.finishReason).toBe('stopped');
    expect(stopped.endedAt).toBe(600);
  });

  it('advances the cursor on correct keystrokes and reports clean completion', () => {
    const { state, endT } = typeString('hello', 'hello');
    expect(state.cursor).toBe(5);
    expect(isCleanlyCompleted(state)).toBe(true);
    expect(state.correctKeystrokes).toBe(5);
    expect(endT).toBeGreaterThan(0);
  });

  it('records incorrect keystrokes without advancing past target width when strict', () => {
    let state = initState('cat', { errorMode: 'strict' });
    state = pressKey(state, 'c', 'KeyC', 100);
    state = pressKey(state, 'x', 'KeyX', 200); // wrong for expected 'a'
    expect(state.correctKeystrokes).toBe(1);
    expect(state.incorrectKeystrokes).toBe(1);
    expect(state.finished).toBe(false);
  });

  it('fails the test immediately in master mode', () => {
    let state = initState('cat', { errorMode: 'master' });
    state = pressKey(state, 'c', 'KeyC', 100);
    state = pressKey(state, 'x', 'KeyX', 200);
    expect(state.finished).toBe(true);
    expect(state.finishReason).toBe('failed');
  });

  it('rewinds on backspace when allowed', () => {
    let state = initState('ok');
    state = pressKey(state, 'o', 'KeyO', 10);
    state = pressKey(state, 'x', 'KeyX', 20);
    state = pressKey(state, 'Backspace', 'Backspace', 30);
    expect(state.cursor).toBe(1);
    expect(state.cells[1]?.state).toBe('pending');
    expect(state.backspaces).toBe(1);
  });

  it('disables backspace in confidence mode', () => {
    let state = initState('ok', { errorMode: 'confidence' });
    expect(state.options.allowBackspace).toBe(false);
    state = pressKey(state, 'o', 'KeyO', 10);
    state = pressKey(state, 'x', 'KeyX', 20);
    state = pressKey(state, 'Backspace', 'Backspace', 30);
    expect(state.cursor).toBe(2);
    expect(state.backspaces).toBe(1);
  });

  it('appends extras beyond target width when allowed', () => {
    let state = initState('hi', { allowExtraChars: true });
    state = pressKey(state, 'h', 'KeyH', 10);
    state = pressKey(state, 'i', 'KeyI', 20);
    state = pressKey(state, '!', 'Digit1', 30);
    expect(state.cells.length).toBe(3);
    expect(state.cells[2]?.state).toBe('extra');
    expect(state.extraKeystrokes).toBe(1);
  });
});

describe('metrics', () => {
  it('computes WPM and accuracy for a clean run', () => {
    const target = 'the quick brown fox';
    const { state, endT } = typeString(target, target, 0, 100);
    const finished = finish(state, 'completed', endT);
    const metrics = computeMetrics(finished);
    expect(metrics.correctChars).toBe(target.length);
    expect(metrics.accuracy).toBe(100);
    expect(metrics.netWpm).toBeGreaterThan(0);
    expect(metrics.grossWpm).toBeGreaterThan(0);
  });

  it('drops accuracy when there are typing errors', () => {
    let state = initState('abcd');
    state = pressKey(state, 'a', 'KeyA', 100);
    state = pressKey(state, 'x', 'KeyX', 200);
    state = pressKey(state, 'b', 'KeyB', 300); // strict-mode correction
    state = pressKey(state, 'c', 'KeyC', 400);
    state = pressKey(state, 'd', 'KeyD', 500);
    state = finish(state, 'completed', 600);
    const metrics = computeMetrics(state);
    expect(metrics.accuracy).toBeLessThan(100);
    expect(metrics.incorrectChars).toBe(1);
    expect(metrics.correctChars).toBe(4);
  });

  it('produces a wpm series with per-second samples', () => {
    const { state } = typeString('the quick brown fox jumps over', 'the quick brown fox jumps over', 0, 40);
    finish(state, 'completed', 2000);
    const samples = wpmSeries(state, 2000);
    expect(samples.length).toBeGreaterThan(0);
    expect(samples[0]?.seconds).toBe(1);
  });
});

describe('n-gram analytics', () => {
  it('groups bigrams and trigrams with mean latency', () => {
    const { state } = typeString('the the the', 'the the the', 0, 60);
    const bigrams = ngramLatencies(state.events, 2);
    const trigrams = ngramLatencies(state.events, 3);
    expect(bigrams.length).toBeGreaterThan(0);
    expect(trigrams.length).toBeGreaterThan(0);
    const th = bigrams.find((b) => b.gram === 'th');
    expect(th?.count).toBeGreaterThan(0);
  });
});

describe('per-key stats and weak keys', () => {
  it('lists per-key error rates and picks the weakest', () => {
    let state = initState('abcabcabcabc');
    // Alternating wrong on 'b' expected slots.
    const keys = ['a', 'x', 'c', 'a', 'x', 'c', 'a', 'x', 'c', 'a', 'x', 'c'];
    keys.forEach((k, i) => { state = pressKey(state, k, `Key${k.toUpperCase()}`, (i + 1) * 100); });
    const stats = perKeyStats(state.events);
    expect(stats.length).toBeGreaterThan(0);
    const weak = weakKeys(state.events, 3);
    expect(weak.length).toBeGreaterThan(0);
  });
});

describe('drill and word generation', () => {
  it('produces a deterministic drill for a given seed', () => {
    const pool = ['the', 'quick', 'brown', 'fox', 'jumps', 'over', 'lazy', 'dog', 'trump', 'team'];
    const drillA = generateDrill({ weakKeys: ['t'], wordPool: pool, targetLength: 60, seed: 7 });
    const drillB = generateDrill({ weakKeys: ['t'], wordPool: pool, targetLength: 60, seed: 7 });
    expect(drillA).toBe(drillB);
    expect(drillA.length).toBeGreaterThan(0);
  });

  it('produces deterministic words for a given seed', () => {
    const pool = ['alpha', 'beta', 'gamma', 'delta'];
    const a = generateWords(pool, 10, 42);
    const b = generateWords(pool, 10, 42);
    expect(a).toBe(b);
    expect(a.split(' ').length).toBe(10);
  });
});

describe('ghost series', () => {
  it('produces per-second cumulative correct-char samples', () => {
    const { state } = typeString('hello world', 'hello world', 0, 80);
    const g = ghostSeries(state.events);
    expect(g.length).toBeGreaterThan(0);
    expect(g[g.length - 1]?.correctChars).toBe(11);
  });
});
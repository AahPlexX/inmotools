import { describe, expect, it } from 'vitest';
import {
  channelCandidates,
  clampTicksPerPixel,
  clampTimeView,
  createSampleBuffer,
  defaultChannels,
  edgesOf,
  firstTick,
  followLatest,
  formatDuration,
  gridStepTicks,
  indexAtOrBefore,
  lastTick,
  latestLevel,
  levelAtTick,
  MAX_ANALYZER_CHANNELS,
  MAX_TICKS_PER_PIXEL,
  measureCursors,
  MIN_TICKS_PER_PIXEL,
  normalizeChannels,
  recordSample,
  sameChannels,
  sampleAt,
  sampleCount,
  snapToRecordedTick,
  tickToX,
  visibleTicks,
  xToTick,
  zoomTimeView,
  type AnalyzerChannel,
  type SampleBuffer,
  type TimeView,
} from '../../src/tools/logic/analyzer-engine';
import { addComponent, addWire, createInitialDocument, setDelayMode, updateComponentParams } from '../../src/tools/logic/circuit-model';
import type { LogicDocument, LogicLevel, PortKey } from '../../src/tools/logic/logic-types';
import { createInitialFrame, readLevel, step } from '../../src/tools/logic/sim-engine';

const channel = (name: string): AnalyzerChannel => ({ key: `${name}:A` as PortKey, label: name });

/** A buffer of one channel fed a level per tick starting at tick 1. */
const bufferOf = (levels: readonly LogicLevel[], capacity = 64): SampleBuffer => {
  const buffer = createSampleBuffer([channel('S')], capacity);
  levels.forEach((level, index) => recordSample(buffer, index + 1, () => level));
  return buffer;
};

describe('analyzer channels', () => {
  const build = () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'SWITCH', 0, 0);
    doc = addComponent(doc, 'AND', 4, 0);
    doc = addComponent(doc, 'PROBE', 10, 0);
    doc = addComponent(doc, 'LED', 10, 4);
    doc = addComponent(doc, 'COUNTER', 4, 8);
    return doc;
  };

  it('lists probes and LEDs first, keyed on their input pin', () => {
    const doc = build();
    const candidates = channelCandidates(doc);
    expect(candidates.slice(0, 2).map((candidate) => candidate.kind)).toEqual(['probe', 'probe']);
    expect(candidates[0]!.key).toBe(`${doc.components[2]!.id}:A`);
    expect(candidates[1]!.key).toBe(`${doc.components[3]!.id}:A`);
  });

  it('labels a single-output part by its name and a multi-output part as name.pin', () => {
    const doc = build();
    const labels = channelCandidates(doc).map((candidate) => candidate.label);
    expect(labels).toContain(doc.components[0]!.label);
    expect(labels).toContain(`${doc.components[4]!.label}.Q0`);
    expect(labels).toContain(`${doc.components[4]!.label}.TC`);
  });

  it('defaults to every probe and LED and to nothing when there are none', () => {
    expect(defaultChannels(build())).toHaveLength(2);
    expect(defaultChannels(createInitialDocument())).toEqual([]);
  });

  it('caps the defaults at the channel limit', () => {
    let doc: LogicDocument = createInitialDocument();
    for (let index = 0; index < MAX_ANALYZER_CHANNELS + 5; index += 1) doc = addComponent(doc, 'PROBE', 0, index * 2);
    expect(defaultChannels(doc)).toHaveLength(MAX_ANALYZER_CHANNELS);
  });

  it('drops a stale key, collapses duplicates, keeps order, and caps a hand-made selection', () => {
    let doc: LogicDocument = createInitialDocument();
    for (let index = 0; index < 20; index += 1) doc = addComponent(doc, 'PROBE', 0, index * 2);
    const keys = doc.components.map((component) => `${component.id}:A`);
    const chosen = normalizeChannels(doc, ['gone:A', keys[3]!, keys[1]!, keys[3]!, ...keys]);
    expect(chosen[0]!.key).toBe(keys[3]);
    expect(chosen[1]!.key).toBe(keys[1]);
    expect(new Set(chosen.map((entry) => entry.key)).size).toBe(chosen.length);
    expect(chosen).toHaveLength(MAX_ANALYZER_CHANNELS);
  });

  it('treats a null selection as "no choice yet" and an empty one as "none"', () => {
    const doc = build();
    expect(normalizeChannels(doc, null)).toEqual(defaultChannels(doc));
    expect(normalizeChannels(doc, [])).toEqual([]);
  });

  it('compares channel sets by key and label', () => {
    expect(sameChannels([channel('a')], [channel('a')])).toBe(true);
    expect(sameChannels([channel('a')], [channel('b')])).toBe(false);
    expect(sameChannels([channel('a')], [])).toBe(false);
    expect(sameChannels([{ ...channel('a'), label: 'renamed' }], [channel('a')])).toBe(false);
  });
});

describe('analyzer sample buffer', () => {
  it('starts empty and answers safely', () => {
    const buffer = createSampleBuffer([channel('S')], 8);
    expect(sampleCount(buffer)).toBe(0);
    expect(firstTick(buffer)).toBeUndefined();
    expect(lastTick(buffer)).toBeUndefined();
    expect(sampleAt(buffer, 0, 0)).toBeUndefined();
    expect(latestLevel(buffer, 0)).toBeUndefined();
    expect(levelAtTick(buffer, 0, 5)).toBeUndefined();
    expect(snapToRecordedTick(buffer, 3)).toBeUndefined();
    expect(edgesOf(buffer, 0, 0, 100)).toEqual([]);
  });

  it('records samples in order with their ticks and all four levels', () => {
    const buffer = bufferOf([0, 1, 'Z', 'X']);
    expect([0, 1, 2, 3].map((index) => sampleAt(buffer, 0, index))).toEqual([
      { tick: 1, level: 0 },
      { tick: 2, level: 1 },
      { tick: 3, level: 'Z' },
      { tick: 4, level: 'X' },
    ]);
    expect(firstTick(buffer)).toBe(1);
    expect(lastTick(buffer)).toBe(4);
    expect(latestLevel(buffer, 0)).toBe('X');
  });

  it('keeps only the newest samples once the ring is full, oldest first', () => {
    const buffer = bufferOf([0, 1, 0, 1, 0, 1, 0], 4);
    expect(sampleCount(buffer)).toBe(4);
    expect(firstTick(buffer)).toBe(4);
    expect(lastTick(buffer)).toBe(7);
    expect([0, 1, 2, 3].map((index) => sampleAt(buffer, 0, index)!.tick)).toEqual([4, 5, 6, 7]);
    expect(sampleAt(buffer, 0, 4)).toBeUndefined();
    expect(sampleAt(buffer, 0, -1)).toBeUndefined();
  });

  it('drops the old history when the simulation restarts at an earlier tick', () => {
    const buffer = bufferOf([0, 1, 1, 0]);
    recordSample(buffer, 1, () => 1);
    expect(sampleCount(buffer)).toBe(1);
    expect(firstTick(buffer)).toBe(1);
    recordSample(buffer, 1, () => 0);
    expect(sampleCount(buffer)).toBe(1);
    expect(latestLevel(buffer, 0)).toBe(0);
  });

  it('ignores a non-finite tick and unknown levels decode safely', () => {
    const buffer = bufferOf([1]);
    recordSample(buffer, Number.NaN, () => 0);
    recordSample(buffer, Infinity, () => 0);
    expect(sampleCount(buffer)).toBe(1);
  });

  it('records several channels independently', () => {
    const buffer = createSampleBuffer([channel('a'), channel('b')], 8);
    recordSample(buffer, 1, (key) => (key === 'a:A' ? 1 : 0));
    recordSample(buffer, 2, (key) => (key === 'a:A' ? 0 : 'Z'));
    expect([latestLevel(buffer, 0), latestLevel(buffer, 1)]).toEqual([0, 'Z']);
    expect(sampleAt(buffer, 0, 5)).toBeUndefined();
    expect(sampleAt(buffer, 2, 0)).toBeUndefined();
  });

  it('limits a buffer to the channel maximum', () => {
    const many = Array.from({ length: 30 }, (_, index) => channel(`c${index}`));
    expect(createSampleBuffer(many).channels).toHaveLength(MAX_ANALYZER_CHANNELS);
  });

  it('finds the sample at or before a tick and treats samples as a held step function', () => {
    const buffer = bufferOf([0, 0, 1, 1, 0]);
    expect(indexAtOrBefore(buffer, 0)).toBeUndefined();
    expect(indexAtOrBefore(buffer, 1)).toBe(0);
    expect(indexAtOrBefore(buffer, 3.5)).toBe(2);
    expect(indexAtOrBefore(buffer, 99)).toBe(4);
    expect(levelAtTick(buffer, 0, 3)).toBe(1);
    expect(levelAtTick(buffer, 0, 4.9)).toBe(1);
    expect(levelAtTick(buffer, 0, 5)).toBe(0);
  });

  it('finds the right sample after the ring has wrapped', () => {
    const buffer = bufferOf([0, 1, 0, 1, 0, 1, 0, 1], 4);
    expect(indexAtOrBefore(buffer, 3)).toBeUndefined();
    // Ticks 5-8 are what a 4-slot ring keeps out of 1-8.
    expect(indexAtOrBefore(buffer, 5)).toBe(0);
    expect(indexAtOrBefore(buffer, 7.5)).toBe(2);
    expect(levelAtTick(buffer, 0, 6)).toBe(1);
  });
});

describe('analyzer edges and measurements', () => {
  it('reports rising and falling edges at the tick the new level first appears', () => {
    const buffer = bufferOf([0, 0, 1, 1, 0, 0, 1]);
    expect(edgesOf(buffer, 0, 0, 100).map((edge) => [edge.tick, edge.kind])).toEqual([
      [3, 'rising'],
      [5, 'falling'],
      [7, 'rising'],
    ]);
  });

  it('reports a change involving Z or X as unknown, never as a clean edge', () => {
    const buffer = bufferOf([1, 'Z', 'Z', 0, 'X', 1]);
    expect(edgesOf(buffer, 0, 0, 100).map((edge) => [edge.tick, edge.kind])).toEqual([
      [2, 'unknown'],
      [4, 'unknown'],
      [5, 'unknown'],
      [6, 'unknown'],
    ]);
  });

  it('honors the tick window and reports nothing for a constant signal', () => {
    const buffer = bufferOf([0, 1, 0, 1, 0]);
    expect(edgesOf(buffer, 0, 3, 4).map((edge) => edge.tick)).toEqual([3, 4]);
    expect(edgesOf(bufferOf([1, 1, 1, 1]), 0, 0, 100)).toEqual([]);
    expect(edgesOf(bufferOf([0, 1]), 0, 10, 20)).toEqual([]);
  });

  it('measures the distance between cursors regardless of order, with nanoseconds only in realistic mode', () => {
    expect(measureCursors(10, 25, 'realistic')).toEqual({ ticks: 15, nanoseconds: 1500 });
    expect(measureCursors(25, 10, 'realistic')).toEqual({ ticks: 15, nanoseconds: 1500 });
    expect(measureCursors(10, 25, 'ideal')).toEqual({ ticks: 15, nanoseconds: undefined });
    expect(measureCursors(7, 7, 'realistic')).toEqual({ ticks: 0, nanoseconds: 0 });
  });

  it('formats durations in the smallest readable unit', () => {
    expect(formatDuration(0)).toBe('0 ns');
    expect(formatDuration(300)).toBe('300 ns');
    expect(formatDuration(1500)).toBe('1.5 µs');
    expect(formatDuration(2_000_000)).toBe('2 ms');
    expect(formatDuration(1234.5678)).toBe('1.235 µs');
  });
});

describe('analyzer time axis', () => {
  const view: TimeView = { startTick: 100, ticksPerPixel: 0.5, widthPx: 400 };

  it('maps ticks to pixels and back', () => {
    expect(tickToX(view, 100)).toBe(0);
    expect(tickToX(view, 150)).toBe(100);
    expect(xToTick(view, 100)).toBe(150);
    for (const tick of [100, 123.5, 300]) expect(xToTick(view, tickToX(view, tick))).toBeCloseTo(tick, 9);
    expect(visibleTicks(view)).toBe(200);
  });

  it('zooms about a column, keeping the tick under it, and clamps the scale', () => {
    for (const factor of [0.5, 0.9, 2, 3]) {
      const zoomed = zoomTimeView(view, 120, factor);
      expect(xToTick(zoomed, 120)).toBeCloseTo(xToTick(view, 120), 9);
    }
    expect(zoomTimeView(view, 0, 1e9).ticksPerPixel).toBe(MIN_TICKS_PER_PIXEL);
    expect(zoomTimeView(view, 0, 1e-9).ticksPerPixel).toBe(MAX_TICKS_PER_PIXEL);
    expect(zoomTimeView(view, 0, Number.NaN).ticksPerPixel).toBe(view.ticksPerPixel);
    expect(zoomTimeView(view, 0, -2).ticksPerPixel).toBe(view.ticksPerPixel);
    expect(clampTicksPerPixel(Number.NaN)).toBe(1);
    expect(clampTicksPerPixel(-1)).toBe(1);
  });

  it('keeps the window over recorded data', () => {
    const buffer = bufferOf(Array.from({ length: 300 }, (_, index) => (index % 2) as LogicLevel), 512);
    const narrow: TimeView = { startTick: 0, ticksPerPixel: 1, widthPx: 100 };
    expect(clampTimeView({ ...narrow, startTick: -50 }, buffer).startTick).toBe(1);
    expect(clampTimeView({ ...narrow, startTick: 10_000 }, buffer).startTick).toBe(201);
    expect(clampTimeView({ ...narrow, startTick: 50 }, buffer).startTick).toBe(50);
    // A window wider than the data can only sit at the first sample.
    expect(clampTimeView({ startTick: 40, ticksPerPixel: 1, widthPx: 1000 }, buffer).startTick).toBe(1);
    expect(clampTimeView({ ...narrow, startTick: 9 }, createSampleBuffer([channel('S')])).startTick).toBe(0);
  });

  it('follows the newest sample, ending the window on it', () => {
    const buffer = bufferOf(Array.from({ length: 300 }, () => 0 as LogicLevel), 512);
    const followed = followLatest({ startTick: 0, ticksPerPixel: 1, widthPx: 100 }, buffer);
    expect(followed.startTick + visibleTicks(followed) - 1).toBe(300);
    const untouched: TimeView = { startTick: 5, ticksPerPixel: 1, widthPx: 100 };
    expect(followLatest(untouched, createSampleBuffer([channel('S')]))).toEqual(untouched);
  });

  it('snaps a cursor to the nearest recorded tick and clamps it into the data', () => {
    const buffer = bufferOf([0, 1, 0, 1, 0]);
    expect(snapToRecordedTick(buffer, 2.4)).toBe(2);
    expect(snapToRecordedTick(buffer, 2.6)).toBe(3);
    expect(snapToRecordedTick(buffer, -50)).toBe(1);
    expect(snapToRecordedTick(buffer, 999)).toBe(5);
  });

  it('picks a grid step of 1, 2, or 5 times a power of ten that keeps labels apart', () => {
    for (const ticksPerPixel of [MIN_TICKS_PER_PIXEL, 0.125, 0.5, 1, 3, MAX_TICKS_PER_PIXEL]) {
      const step = gridStepTicks(ticksPerPixel);
      expect(step / ticksPerPixel).toBeGreaterThanOrEqual(64 - 1e-9);
      expect(/^[125]0*$/.test(String(step))).toBe(true);
    }
    expect(gridStepTicks(1)).toBe(100);
    expect(gridStepTicks(0.01)).toBe(1);
  });
});

describe('analyzer measuring a real simulation', () => {
  /** SWITCH -> NOT (delayNs) -> PROBE, in realistic mode; toggles the switch and records every step. */
  const measureInverter = (delayNs: number) => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'SWITCH', 0, 0);
    doc = addComponent(doc, 'NOT', 4, 0);
    doc = addComponent(doc, 'PROBE', 10, 0);
    const [source, inverter, probe] = doc.components.map((component) => component.id);
    doc = updateComponentParams(doc, inverter!, { delayNs });
    doc = addWire(doc, { componentId: source!, portId: 'Y' }, { componentId: inverter!, portId: 'A' });
    doc = addWire(doc, { componentId: inverter!, portId: 'Y' }, { componentId: probe!, portId: 'A' });
    doc = setDelayMode(doc, 'realistic');

    const buffer = createSampleBuffer([
      { key: `${source}:Y` as PortKey, label: 'in' },
      { key: `${probe}:A` as PortKey, label: 'out' },
    ]);
    let frame = createInitialFrame(doc);
    const advance = (interactions: Record<string, LogicLevel> = {}) => {
      frame = step({ document: doc, previous: frame, elapsedMs: 16, interactions });
      recordSample(buffer, frame.tick, (key) => frame.portLevels[key] ?? 'Z');
    };
    for (let index = 0; index < 4; index += 1) advance({ [source!]: 0 });
    advance({ [source!]: 1 });
    for (let index = 0; index < 8; index += 1) advance();
    return { buffer, doc, readOut: () => readLevel(frame, probe!, 'A') };
  };

  it('measures a gate delay between the input edge and the output edge in ticks and nanoseconds', () => {
    const { buffer } = measureInverter(300);
    const inputFall = edgesOf(buffer, 0, 0, 100).find((edge) => edge.kind === 'rising')!;
    const outputFall = edgesOf(buffer, 1, 0, 100).find((edge) => edge.kind === 'falling')!;
    expect(inputFall).toBeDefined();
    expect(outputFall).toBeDefined();
    const measurement = measureCursors(inputFall.tick, outputFall.tick, 'realistic');
    expect(measurement.ticks).toBe(3);
    expect(measurement.nanoseconds).toBe(300);
    expect(formatDuration(measurement.nanoseconds!)).toBe('300 ns');
  });

  it('shows a longer delay as a proportionally longer gap', () => {
    const short = measureInverter(200).buffer;
    const long = measureInverter(600).buffer;
    const gap = (buffer: SampleBuffer) =>
      edgesOf(buffer, 1, 0, 100).find((edge) => edge.kind === 'falling')!.tick - edgesOf(buffer, 0, 0, 100).find((edge) => edge.kind === 'rising')!.tick;
    expect(gap(short)).toBe(2);
    expect(gap(long)).toBe(6);
  });
});

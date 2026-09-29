import { getSimulationPorts } from './component-library';
import { DELAY_SCALE_NS } from './sim-engine';
import { flattenDocument } from './subcircuit-engine';
import { portKey, type DelayMode, type LogicDocument, type LogicLevel, type PortKey } from './logic-types';

/**
 * Pure, framework-independent model of the logic-analyzer dock: which signals
 * are captured, the rolling sample buffer they are captured into, the edges
 * and cursor measurements read back out of it, and the time-axis math the
 * timing diagram is drawn with.
 *
 * Samples are keyed to simulation ticks, not wall-clock time: one sample per
 * simulation step, so the diagram shows exactly what the simulator computed
 * and stays identical regardless of how fast the machine ran it. In the
 * realistic-delay mode one tick is `DELAY_SCALE_NS` nanoseconds, which is what
 * lets a cursor measurement report a propagation delay in real units.
 */

export const MAX_ANALYZER_CHANNELS = 16;
export const DEFAULT_ANALYZER_CAPACITY = 2048;

// --- SECTION: channels ---

export interface AnalyzerChannel {
  readonly key: PortKey;
  readonly label: string;
}

export interface ChannelCandidate extends AnalyzerChannel {
  /** `probe` for logic probes and LEDs (the intended measurement points); `signal` for any other output pin. */
  readonly kind: 'probe' | 'signal';
}

const isObserver = (type: string): boolean => type === 'PROBE' || type === 'LED' || type === 'PORT_OUT';

/**
 * Every signal the analyzer can capture: the input pin of each probe and LED,
 * then the output pins of every other component. A single-output part is
 * labeled by its own name; a multi-output part gets `name.pin`.
 */
export const channelCandidates = (source: LogicDocument): ChannelCandidate[] => {
  const document = flattenDocument(source);
  const probes: ChannelCandidate[] = [];
  const signals: ChannelCandidate[] = [];
  for (const component of document.components) {
    const ports = getSimulationPorts(component.type, component.params);
    if (isObserver(component.type)) {
      probes.push({ key: portKey(component.id, 'A'), label: component.label, kind: 'probe' });
      continue;
    }
    const outputs = ports.filter((port) => port.direction === 'output');
    for (const port of outputs) {
      signals.push({
        key: portKey(component.id, port.id),
        label: outputs.length === 1 ? component.label : `${component.label}.${port.label}`,
        kind: 'signal',
      });
    }
  }
  return [...probes, ...signals];
};

/** The channels captured when the user has not chosen any: every probe and LED, up to the limit. */
export const defaultChannels = (document: LogicDocument): AnalyzerChannel[] =>
  channelCandidates(document)
    .filter((candidate) => candidate.kind === 'probe')
    .slice(0, MAX_ANALYZER_CHANNELS)
    .map(({ key, label }) => ({ key, label }));

/**
 * Resolves a saved selection against the circuit as it is now: keys whose
 * component or pin is gone are dropped, duplicates collapse, order is kept,
 * and the total is capped at the channel limit. `null` means "no choice yet".
 */
export const normalizeChannels = (document: LogicDocument, selected: readonly string[] | null): AnalyzerChannel[] => {
  if (selected === null) return defaultChannels(document);
  const byKey = new Map(channelCandidates(document).map((candidate) => [candidate.key, candidate] as const));
  const seen = new Set<string>();
  const channels: AnalyzerChannel[] = [];
  for (const key of selected) {
    const candidate = byKey.get(key as PortKey);
    if (!candidate || seen.has(key)) continue;
    seen.add(key);
    channels.push({ key: candidate.key, label: candidate.label });
    if (channels.length === MAX_ANALYZER_CHANNELS) break;
  }
  return channels;
};

export const sameChannels = (a: readonly AnalyzerChannel[], b: readonly AnalyzerChannel[]): boolean =>
  a.length === b.length && a.every((channel, index) => channel.key === b[index]!.key && channel.label === b[index]!.label);

// --- SECTION: rolling sample buffer ---

const LEVEL_CODES: Readonly<Record<string, number>> = { 0: 0, 1: 1, Z: 2, X: 3 };
const CODE_LEVELS: readonly LogicLevel[] = [0, 1, 'Z', 'X'];

const encode = (level: LogicLevel): number => LEVEL_CODES[String(level)] ?? 3;
const decode = (code: number): LogicLevel => CODE_LEVELS[code] ?? 'X';

/**
 * A fixed-size ring of the most recent samples for a fixed set of channels.
 * It is mutated in place as the simulation runs (recording is on the hot
 * path, once per step); changing the channel set means making a new buffer.
 */
export interface SampleBuffer {
  readonly capacity: number;
  readonly channels: readonly AnalyzerChannel[];
  readonly ticks: Float64Array;
  readonly levels: readonly Uint8Array[];
  /** Ring slot the next sample is written to. */
  head: number;
  count: number;
}

export const createSampleBuffer = (channels: readonly AnalyzerChannel[], capacity: number = DEFAULT_ANALYZER_CAPACITY): SampleBuffer => {
  const size = Math.max(2, Math.floor(capacity));
  return {
    capacity: size,
    channels: channels.slice(0, MAX_ANALYZER_CHANNELS),
    ticks: new Float64Array(size),
    levels: channels.slice(0, MAX_ANALYZER_CHANNELS).map(() => new Uint8Array(size)),
    head: 0,
    count: 0,
  };
};

const slotOf = (buffer: SampleBuffer, index: number): number => (buffer.head - buffer.count + index + buffer.capacity * 2) % buffer.capacity;

export const sampleCount = (buffer: SampleBuffer): number => buffer.count;

/** The tick of the oldest sample, or `undefined` for an empty buffer. */
export const firstTick = (buffer: SampleBuffer): number | undefined => (buffer.count === 0 ? undefined : buffer.ticks[slotOf(buffer, 0)]);

export const lastTick = (buffer: SampleBuffer): number | undefined => (buffer.count === 0 ? undefined : buffer.ticks[slotOf(buffer, buffer.count - 1)]);

/**
 * Appends one sample per channel for `tick`. A tick that does not advance
 * past the newest one means the simulation restarted (a new or reloaded
 * circuit), so the old history no longer describes this run and is dropped.
 */
export const recordSample = (buffer: SampleBuffer, tick: number, read: (key: PortKey) => LogicLevel): void => {
  if (!Number.isFinite(tick)) return;
  const newest = lastTick(buffer);
  if (newest !== undefined && tick <= newest) {
    buffer.count = 0;
    buffer.head = 0;
  }
  const slot = buffer.head;
  buffer.ticks[slot] = tick;
  buffer.channels.forEach((channel, index) => {
    buffer.levels[index]![slot] = encode(read(channel.key));
  });
  buffer.head = (slot + 1) % buffer.capacity;
  buffer.count = Math.min(buffer.capacity, buffer.count + 1);
};

export interface Sample {
  readonly tick: number;
  readonly level: LogicLevel;
}

/** Sample `index` of a channel, where 0 is the oldest kept. */
export const sampleAt = (buffer: SampleBuffer, channel: number, index: number): Sample | undefined => {
  if (index < 0 || index >= buffer.count || channel < 0 || channel >= buffer.channels.length) return undefined;
  const slot = slotOf(buffer, index);
  return { tick: buffer.ticks[slot]!, level: decode(buffer.levels[channel]![slot]!) };
};

/** The newest recorded level of a channel. */
export const latestLevel = (buffer: SampleBuffer, channel: number): LogicLevel | undefined => sampleAt(buffer, channel, buffer.count - 1)?.level;

/** Index of the newest sample whose tick is at or before `tick`, or `undefined` when `tick` precedes every sample. */
export const indexAtOrBefore = (buffer: SampleBuffer, tick: number): number | undefined => {
  let low = 0;
  let high = buffer.count - 1;
  let found: number | undefined;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (buffer.ticks[slotOf(buffer, middle)]! <= tick) {
      found = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found;
};

/** The level a channel holds at `tick`: a sample holds until the next one, so this is a step function. */
export const levelAtTick = (buffer: SampleBuffer, channel: number, tick: number): LogicLevel | undefined => {
  const index = indexAtOrBefore(buffer, tick);
  return index === undefined ? undefined : sampleAt(buffer, channel, index)?.level;
};

// --- SECTION: edges and measurements ---

export type EdgeKind = 'rising' | 'falling' | 'unknown';

export interface Edge {
  readonly tick: number;
  readonly from: LogicLevel;
  readonly to: LogicLevel;
  readonly kind: EdgeKind;
}

const edgeKindOf = (from: LogicLevel, to: LogicLevel): EdgeKind => {
  if (from === 0 && to === 1) return 'rising';
  if (from === 1 && to === 0) return 'falling';
  return 'unknown';
};

/**
 * Every level change of a channel between two ticks (inclusive of a change
 * that lands on either end). A transition into or out of Z or X is reported as
 * `unknown` rather than guessed to be a rising or falling edge.
 */
export const edgesOf = (buffer: SampleBuffer, channel: number, fromTick: number, toTick: number): Edge[] => {
  const edges: Edge[] = [];
  let previous: Sample | undefined;
  for (let index = 0; index < buffer.count; index += 1) {
    const sample = sampleAt(buffer, channel, index);
    if (!sample) continue;
    if (previous && previous.level !== sample.level && sample.tick >= fromTick && sample.tick <= toTick) {
      edges.push({ tick: sample.tick, from: previous.level, to: sample.level, kind: edgeKindOf(previous.level, sample.level) });
    }
    previous = sample;
  }
  return edges;
};

export interface CursorMeasurement {
  readonly ticks: number;
  /** Nanoseconds between the cursors; only meaningful (and only given) in the realistic-delay mode, where a tick is a fixed time. */
  readonly nanoseconds: number | undefined;
}

/** The distance between two cursor ticks, always non-negative and independent of which cursor is left. */
export const measureCursors = (tickA: number, tickB: number, delayMode: DelayMode): CursorMeasurement => {
  const ticks = Math.abs(tickB - tickA);
  return { ticks, nanoseconds: delayMode === 'realistic' ? ticks * DELAY_SCALE_NS : undefined };
};

/** `40 ns`, `1.5 µs`, `2 ms`: the smallest unit that keeps the number readable. */
export const formatDuration = (nanoseconds: number): string => {
  const trim = (value: number): string => String(Number(value.toFixed(3)));
  if (nanoseconds >= 1_000_000) return `${trim(nanoseconds / 1_000_000)} ms`;
  if (nanoseconds >= 1_000) return `${trim(nanoseconds / 1_000)} µs`;
  return `${trim(nanoseconds)} ns`;
};

// --- SECTION: time axis ---

/** The visible window: the tick at the left edge, and how many ticks fit across one pixel. */
export interface TimeView {
  readonly startTick: number;
  readonly ticksPerPixel: number;
  readonly widthPx: number;
}

/** From 16 pixels per tick (each tick clearly separable) to 8 ticks per pixel (a long run at a glance). */
export const MIN_TICKS_PER_PIXEL = 1 / 16;
export const MAX_TICKS_PER_PIXEL = 8;

export const clampTicksPerPixel = (value: number): number =>
  Number.isFinite(value) && value > 0 ? Math.min(MAX_TICKS_PER_PIXEL, Math.max(MIN_TICKS_PER_PIXEL, value)) : 1;

export const tickToX = (view: TimeView, tick: number): number => (tick - view.startTick) / view.ticksPerPixel;

export const xToTick = (view: TimeView, x: number): number => view.startTick + x * view.ticksPerPixel;

export const visibleTicks = (view: TimeView): number => view.widthPx * view.ticksPerPixel;

/** Zooms about a pixel column, keeping the tick under it in place. */
export const zoomTimeView = (view: TimeView, anchorX: number, factor: number): TimeView => {
  const anchorTick = xToTick(view, anchorX);
  const ticksPerPixel = clampTicksPerPixel(view.ticksPerPixel / (Number.isFinite(factor) && factor > 0 ? factor : 1));
  return { ...view, ticksPerPixel, startTick: anchorTick - anchorX * ticksPerPixel };
};

/**
 * Keeps the window over recorded data: it may not start before the oldest
 * sample, nor scroll so far right that the newest sample leaves the window.
 */
export const clampTimeView = (view: TimeView, buffer: SampleBuffer): TimeView => {
  const first = firstTick(buffer);
  const last = lastTick(buffer);
  if (first === undefined || last === undefined) return { ...view, startTick: 0 };
  const latestStart = Math.max(first, last + 1 - visibleTicks(view));
  return { ...view, startTick: Math.min(latestStart, Math.max(first, view.startTick)) };
};

/** The window that ends on the newest sample, so a running simulation stays in view. */
export const followLatest = (view: TimeView, buffer: SampleBuffer): TimeView => {
  const last = lastTick(buffer);
  return last === undefined ? view : clampTimeView({ ...view, startTick: last + 1 - visibleTicks(view) }, buffer);
};

/** The nearest recorded tick to `tick`, so a cursor always sits on a real sample. */
export const snapToRecordedTick = (buffer: SampleBuffer, tick: number): number | undefined => {
  const first = firstTick(buffer);
  const last = lastTick(buffer);
  if (first === undefined || last === undefined) return undefined;
  return Math.min(last, Math.max(first, Math.round(tick)));
};

/**
 * A grid spacing (in ticks) that keeps labelled gridlines at least
 * `minSpacingPx` apart: the smallest of 1, 2, 5, 10, 20, 50, ... that fits.
 */
export const gridStepTicks = (ticksPerPixel: number, minSpacingPx: number = 64): number => {
  const wanted = Math.max(1, ticksPerPixel * minSpacingPx);
  const magnitude = 10 ** Math.floor(Math.log10(wanted));
  for (const multiple of [1, 2, 5, 10]) {
    if (magnitude * multiple >= wanted) return magnitude * multiple;
  }
  return magnitude * 10;
};

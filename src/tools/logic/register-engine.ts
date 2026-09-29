import { BLOCK_WIDTH_COLS } from './block-engine';
import type { ComponentParams, ComponentType, LogicLevel, PortDefinition } from './logic-types';

/**
 * Pure, framework-independent model of the multi-bit sequential parts: binary
 * counters and parallel-load registers.
 *
 * A part is described by one bit width (`bitWidth`, 2-8). This module owns the
 * pin layout (`registerPorts`), the clocked behavior (`stepRegister`), and the
 * value each output pin shows (`registerOutputs`). The simulator, both
 * renderers, and the inspector read from here so pins, behavior, and the drawn
 * body cannot drift apart.
 *
 * Asynchronous (ripple) counters are modeled by *when* each output bit takes
 * its new value: after a clock edge, bit 0 changes first and every higher bit
 * follows one simulation tick later, so a 0111 -> 1000 roll-over passes
 * through 0110, 0100, 0000 exactly as a real ripple chain does. In the ideal
 * zero-delay mode every bit changes together, which is what a synchronous
 * counter always does.
 */

export type RegisterType = 'COUNTER' | 'REGISTER';

export const MIN_BIT_WIDTH = 2;
export const MAX_BIT_WIDTH = 8;
export const DEFAULT_BIT_WIDTH = 4;

export const isRegisterType = (type: ComponentType): type is RegisterType => type === 'COUNTER' || type === 'REGISTER';

/**
 * Coerces an untrusted `bitWidth` (a hand-edited or imported project can carry
 * any JSON value) into the supported range, so the number of pins a part
 * exposes is always bounded and finite.
 */
export const clampBitWidth = (value: unknown, fallback: number = DEFAULT_BIT_WIDTH): number => {
  const raw = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(MAX_BIT_WIDTH, Math.max(MIN_BIT_WIDTH, Math.round(raw)));
};

export const bitWidthOf = (params: ComponentParams): number => clampBitWidth(params.bitWidth);

export const hasEnablePin = (params: ComponentParams): boolean => params.hasEnable === true;

/** Only counters can load; a register always takes its data inputs on the clock edge. */
export const hasLoadPin = (type: RegisterType, params: ComponentParams): boolean => type === 'COUNTER' && params.hasLoad === true;

const hasDataPins = (type: RegisterType, params: ComponentParams): boolean => type === 'REGISTER' || hasLoadPin(type, params);

const range = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

const leftPin = (id: string, y: number): PortDefinition => ({ id, direction: 'input', label: id, x: 0, y });
const rightPin = (id: string, y: number): PortDefinition => ({ id, direction: 'output', label: id, x: BLOCK_WIDTH_COLS, y });

/**
 * Control pins sit above the data pins on the left edge; the count/data bits
 * run down the right edge, with the terminal-count flag under the last bit.
 */
export const registerPorts = (type: RegisterType, params: ComponentParams): readonly PortDefinition[] => {
  const width = bitWidthOf(params);
  const left: PortDefinition[] = [];
  const push = (id: string): void => {
    left.push(leftPin(id, left.length));
  };
  push('CLK');
  if (hasEnablePin(params)) push('EN');
  push('RST');
  if (hasLoadPin(type, params)) push('LOAD');
  if (hasDataPins(type, params)) for (const index of range(width)) push(`D${index}`);

  const right: PortDefinition[] = range(width).map((index) => rightPin(`Q${index}`, index));
  if (type === 'COUNTER') right.push(rightPin('TC', width));
  return [...left, ...right];
};

/** Short caption drawn above the body, such as `CTR 4b UP` or `REG 8b`. */
export const registerTitle = (type: RegisterType, params: ComponentParams): string => {
  const width = bitWidthOf(params);
  if (type === 'REGISTER') return `REG ${width}b`;
  return `${params.asyncRipple === true ? 'RIP' : 'CTR'} ${width}b ${params.countDown === true ? 'DN' : 'UP'}`;
};

export const registerSizeLabel = (bits: number): string => `${bits}-bit`;

// --- SECTION: runtime state ---

/** The per-part state the simulator carries between ticks. Bits are least-significant first. */
export interface RegisterRuntime {
  readonly bits: readonly LogicLevel[];
  /** What the outputs showed before the latest clock edge; low bits already on `bits` are drawn from `bits` instead. */
  readonly previousBits: readonly LogicLevel[];
  /** How many low-order bits have taken their new value; equal to the width once the ripple has finished. */
  readonly rippleStage: number;
  readonly lastClockLevel: LogicLevel | undefined;
}

const zeros = (width: number): LogicLevel[] => range(width).map(() => 0 as LogicLevel);

/** Pads or truncates a saved bit list so a part resized between ticks never reads out of range. */
const fitBits = (bits: readonly LogicLevel[] | undefined, width: number): LogicLevel[] =>
  range(width).map((index) => bits?.[index] ?? 0);

export const initialRegisterRuntime = (width: number): RegisterRuntime => ({
  bits: zeros(width),
  previousBits: zeros(width),
  rippleStage: width,
  lastClockLevel: undefined,
});

/** Rebuilds a runtime from saved fields, tolerating a missing or differently sized record. */
export const restoreRegisterRuntime = (
  saved: { readonly registerBits?: readonly LogicLevel[]; readonly registerPreviousBits?: readonly LogicLevel[]; readonly rippleStage?: number; readonly lastClockLevel?: LogicLevel } | undefined,
  width: number,
): RegisterRuntime => ({
  bits: fitBits(saved?.registerBits, width),
  previousBits: fitBits(saved?.registerPreviousBits, width),
  rippleStage: Math.min(width, Math.max(0, saved?.rippleStage ?? width)),
  lastClockLevel: saved?.lastClockLevel,
});

/** True while a ripple counter still has higher bits waiting to change, so the loop must keep stepping. */
export const isRippling = (runtime: RegisterRuntime, width: number): boolean => runtime.rippleStage < width;

/** The value each output bit shows right now, which lags `bits` during a ripple. */
export const shownBits = (runtime: RegisterRuntime, width: number): LogicLevel[] =>
  range(width).map((index) => (index < runtime.rippleStage ? runtime.bits[index] : runtime.previousBits[index]) ?? 0);

// --- SECTION: clocked behavior ---

const toBit = (level: LogicLevel): 0 | 1 | undefined => (level === 0 || level === 1 ? level : undefined);

const isAsserted = (level: LogicLevel, activeHigh: boolean | undefined): boolean => {
  const bit = toBit(level);
  if (bit === undefined) return false;
  return activeHigh === false ? bit === 0 : bit === 1;
};

/**
 * An edge needs a known previous level: the very first sample after start-up
 * or a resize is only a starting level, so it can never count or load.
 */
const isClockEdge = (previous: LogicLevel | undefined, current: LogicLevel, edge: ComponentParams['edge']): boolean => {
  if (previous === undefined) return false;
  return edge === 'falling' ? toBit(previous) === 1 && toBit(current) === 0 : toBit(previous) === 0 && toBit(current) === 1;
};

/** A stored bit is a determinate 0/1 or an indeterminate X, never high-Z: a floating data pin is stored as X. */
const asStoredBit = (level: LogicLevel): LogicLevel => (toBit(level) === undefined ? 'X' : level);

const bitsToValue = (bits: readonly LogicLevel[]): number | undefined => {
  let value = 0;
  for (let index = 0; index < bits.length; index += 1) {
    const bit = toBit(bits[index] ?? 'X');
    if (bit === undefined) return undefined;
    value += bit * 2 ** index;
  }
  return value;
};

const valueToBits = (value: number, width: number): LogicLevel[] => range(width).map((index) => (Math.floor(value / 2 ** index) % 2) as LogicLevel);

const sameBits = (a: readonly LogicLevel[], b: readonly LogicLevel[]): boolean => a.length === b.length && a.every((level, index) => level === b[index]);

export interface StepRegisterInput {
  readonly type: RegisterType;
  readonly params: ComponentParams;
  readonly runtime: RegisterRuntime;
  /** The resolved level on one of this part's input pins. */
  readonly read: (portId: string) => LogicLevel;
  /** True in the zero-delay mode, where a ripple counter's bits all change together. */
  readonly ideal: boolean;
}

/**
 * Advances one part by one simulation tick: finishes any ripple already under
 * way, samples the clock, applies the count/load/store action on an active
 * edge, then lets an asserted reset clear the part regardless of the clock.
 */
export const stepRegister = ({ type, params, runtime, read, ideal }: StepRegisterInput): RegisterRuntime => {
  const width = bitWidthOf(params);
  const activeHigh = params.activeHigh;

  // A ripple advances one stage per tick, before this tick's edge can restart it.
  const stage = Math.min(width, runtime.rippleStage + (isRippling(runtime, width) ? 1 : 0));
  let current: RegisterRuntime = { ...runtime, rippleStage: stage };

  const clockLevel = read('CLK');
  const edge = isClockEdge(runtime.lastClockLevel, clockLevel, params.edge);
  current = { ...current, lastClockLevel: clockLevel };

  if (edge) {
    const shown = shownBits(current, width);
    const next = nextBitsOnEdge(type, params, current.bits, read, width, activeHigh);
    if (!sameBits(next, current.bits)) {
      const ripples = type === 'COUNTER' && params.asyncRipple === true && !ideal;
      current = { ...current, bits: next, previousBits: shown, rippleStage: ripples ? 1 : width };
    }
  }

  // Asynchronous clear dominates the clock, like a flip-flop's RST.
  if (isAsserted(read('RST'), activeHigh)) {
    current = { ...current, bits: zeros(width), previousBits: zeros(width), rippleStage: width };
  }
  return current;
};

const nextBitsOnEdge = (
  type: RegisterType,
  params: ComponentParams,
  bits: readonly LogicLevel[],
  read: (portId: string) => LogicLevel,
  width: number,
  activeHigh: boolean | undefined,
): LogicLevel[] => {
  if (hasEnablePin(params)) {
    const enable = toBit(read('EN'));
    // A floating or unknown enable leaves it undecided whether the part
    // advanced, so every bit becomes unknown rather than guessing either way.
    if (enable === undefined) return range(width).map(() => 'X' as LogicLevel);
    if (enable === 0) return [...bits];
  }

  if (type === 'REGISTER') return range(width).map((index) => asStoredBit(read(`D${index}`)));

  if (hasLoadPin(type, params) && isAsserted(read('LOAD'), activeHigh)) {
    return range(width).map((index) => asStoredBit(read(`D${index}`)));
  }

  const value = bitsToValue(bits);
  if (value === undefined) return range(width).map(() => 'X' as LogicLevel);
  const modulus = 2 ** width;
  const stepped = params.countDown === true ? (value - 1 + modulus) % modulus : (value + 1) % modulus;
  return valueToBits(stepped, width);
};

// --- SECTION: outputs ---

/**
 * Terminal count: high at the last state of the counting direction (all ones
 * counting up, all zeros counting down), unknown while any bit is unknown.
 */
const terminalCount = (params: ComponentParams, shown: readonly LogicLevel[]): LogicLevel => {
  const value = bitsToValue(shown);
  if (value === undefined) return 'X';
  const terminal = params.countDown === true ? 0 : 2 ** shown.length - 1;
  return value === terminal ? 1 : 0;
};

/** The level on every output pin of a part, keyed by port id (`Q0`..`Qn-1`, plus `TC` on a counter). */
export const registerOutputs = (type: RegisterType, params: ComponentParams, runtime: RegisterRuntime): Record<string, LogicLevel> => {
  const width = bitWidthOf(params);
  const shown = shownBits(runtime, width);
  const outputs: Record<string, LogicLevel> = {};
  shown.forEach((level, index) => {
    outputs[`Q${index}`] = level;
  });
  if (type === 'COUNTER') outputs.TC = terminalCount(params, shown);
  return outputs;
};

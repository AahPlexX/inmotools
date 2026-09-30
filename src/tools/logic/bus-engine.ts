import type { LogicLevel, PortDefinition } from './logic-types';

/**
 * Pure, framework-independent rules for multi-bit buses.
 *
 * The simulator only ever sees single pins. A bus port is a wireable pin that
 * stands for a group of them (`PortDefinition.bus.bits`), and wiring one bus
 * port to another joins the two groups bit by bit. This module decides which
 * connections are legal, and turns a group of levels into the readouts a
 * person wants: binary, hexadecimal, and decimal, with unknown bits shown as
 * unknown rather than guessed.
 */

export const MIN_BUS_WIDTH = 2;
/** 32 bits: the widest memory address bus (ledger item 9). */
export const MAX_BUS_WIDTH = 32;
export const DEFAULT_BUS_WIDTH = 4;

/** Coerces an untrusted bus width (an imported project can hold any JSON value) into 2-32. */
export const clampBusWidth = (value: unknown, fallback: number = DEFAULT_BUS_WIDTH): number => {
  const raw = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(MAX_BUS_WIDTH, Math.max(MIN_BUS_WIDTH, Math.round(raw)));
};

/** A port marker's width: 1 for a single signal, otherwise a bus width. */
export const clampSignalWidth = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 2 ? clampBusWidth(value) : 1;

export const isBusPort = (port: PortDefinition): boolean => port.bus !== undefined;

/** The single pins a port stands for: its own bits for a bus port, otherwise just itself. */
export const portBits = (port: PortDefinition): readonly string[] => port.bus?.bits ?? [port.id];

export const portWidth = (port: PortDefinition): number => port.bus?.bits.length ?? 1;

/** `D[3:0]`: a bus port's label with its bit range. */
export const busLabel = (name: string, width: number): string => `${name}[${width - 1}:0]`;

export type WireCheck = { readonly ok: true } | { readonly ok: false; readonly reason: string };

/**
 * Whether two ports may be wired together. Buses connect only to buses of the
 * same width, and a bus never joins a single pin directly (a splitter does
 * that job); the existing rule against wiring two inputs together still holds.
 */
export const checkWireEnds = (from: PortDefinition, to: PortDefinition): WireCheck => {
  const fromWidth = portWidth(from);
  const toWidth = portWidth(to);
  if (isBusPort(from) !== isBusPort(to)) {
    return { ok: false, reason: 'A bus cannot connect straight to a single pin. Use a bus splitter to gather or separate the bits.' };
  }
  if (fromWidth !== toWidth) {
    return { ok: false, reason: `Bus widths differ: a ${fromWidth}-bit bus cannot connect to a ${toWidth}-bit bus.` };
  }
  if (from.direction === 'input' && to.direction === 'input') {
    return { ok: false, reason: 'Two inputs cannot be wired together: nothing would drive them.' };
  }
  return { ok: true };
};

// --- SECTION: levels ---

/** The level of every bit of a port, least significant first. */
export const busLevels = (port: PortDefinition, levelOf: (pinId: string) => LogicLevel): LogicLevel[] => portBits(port).map((bit) => levelOf(bit));

export type BusState = 'known' | 'unknown' | 'floating';

/**
 * How a whole bus reads: `known` when every bit is 0 or 1, `floating` when
 * every bit is undriven (Z), and `unknown` for anything else, including a mix,
 * because a partly driven bus has no single value to report.
 */
export const busState = (levels: readonly LogicLevel[]): BusState => {
  if (levels.every((level) => level === 0 || level === 1)) return 'known';
  if (levels.every((level) => level === 'Z')) return 'floating';
  return 'unknown';
};

/** One level standing in for a whole bus, for drawing: `X` if any bit is unknown, `Z` if it is not fully driven, otherwise `1`. */
export const aggregateLevel = (levels: readonly LogicLevel[]): LogicLevel => {
  if (levels.some((level) => level === 'X')) return 'X';
  if (levels.some((level) => level === 'Z')) return 'Z';
  return 1;
};

// --- SECTION: readouts ---

export type Radix = 'binary' | 'hex' | 'decimal';

const bitChar = (level: LogicLevel): string => String(level);

/** MSB first, one character per bit, `X` and `Z` shown as they are. */
export const formatBinary = (levels: readonly LogicLevel[]): string => [...levels].reverse().map(bitChar).join('');

/**
 * Hexadecimal, four bits per digit from the least significant end. A digit
 * whose bits are not all 0/1 is shown as `Z` if every bit in it is undriven
 * and `X` otherwise, so one bad bit spoils only its own digit.
 */
export const formatHex = (levels: readonly LogicLevel[]): string => {
  const digits: string[] = [];
  for (let start = 0; start < levels.length; start += 4) {
    const nibble = levels.slice(start, start + 4);
    if (nibble.every((level) => level === 0 || level === 1)) {
      digits.push(nibble.reduce<number>((total, level, index) => total + (level === 1 ? 2 ** index : 0), 0).toString(16).toUpperCase());
    } else {
      digits.push(nibble.every((level) => level === 'Z') ? 'Z' : 'X');
    }
  }
  return digits.reverse().join('');
};

/** The unsigned value, or `X` / `Z` when the bus has no single value. */
export const formatDecimal = (levels: readonly LogicLevel[]): string => {
  const state = busState(levels);
  if (state === 'floating') return 'Z';
  if (state === 'unknown') return 'X';
  return String(levels.reduce<number>((total, level, index) => total + (level === 1 ? 2 ** index : 0), 0));
};

export const formatBusValue = (levels: readonly LogicLevel[], radix: Radix): string => {
  if (radix === 'binary') return formatBinary(levels);
  if (radix === 'hex') return `0x${formatHex(levels)}`;
  return formatDecimal(levels);
};

/** All three readouts on one line, as shown in a hover tooltip. */
export const describeBus = (name: string, levels: readonly LogicLevel[]): string =>
  `${busLabel(name, levels.length)} = ${formatBinary(levels)} (${formatBusValue(levels, 'hex')}, ${formatDecimal(levels)})`;

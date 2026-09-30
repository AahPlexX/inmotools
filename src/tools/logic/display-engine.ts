import type { ComponentParams, ComponentType, LogicLevel, PortDefinition } from './logic-types';

/**
 * Pure, framework-independent model of the segment displays: a single
 * 7-segment digit, a multiplexed 4-digit 7-segment module, and a 16-segment
 * alphanumeric digit.
 *
 * A display is a sink: it has input pins only and drives nothing. This module
 * owns the pin layout (`displayPorts`) and the one piece of behavior a display
 * has, deciding which segments are lit (`updateSegmentLit`). Both renderers
 * read the lit segments the simulator stores for the part, so the canvas and
 * the exported schematic agree on what a pin layout means.
 *
 * The multiplexed module models persistence of vision: a digit takes the
 * segment pattern present on the shared segment pins whenever its select pin
 * is asserted, and keeps showing that pattern until it is selected again.
 * That is what makes a scanned display read as four steady digits.
 */

export type DisplayType = 'SEVEN_SEGMENT' | 'SEVEN_SEGMENT_4' | 'SIXTEEN_SEGMENT';

export const isDisplayType = (type: ComponentType): type is DisplayType =>
  type === 'SEVEN_SEGMENT' || type === 'SEVEN_SEGMENT_4' || type === 'SIXTEEN_SEGMENT';

const SEVEN_SEGMENT_PINS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'DP'] as const;
const SIXTEEN_SEGMENT_PINS = ['A1', 'A2', 'B', 'C', 'D1', 'D2', 'E', 'F', 'G1', 'G2', 'H', 'I', 'J', 'K', 'L', 'M', 'DP'] as const;

/** The segment pins of one digit, in the order the lit array stores them. */
export const segmentIdsOf = (type: DisplayType): readonly string[] => (type === 'SIXTEEN_SEGMENT' ? SIXTEEN_SEGMENT_PINS : SEVEN_SEGMENT_PINS);

export const digitCountOf = (type: DisplayType): number => (type === 'SEVEN_SEGMENT_4' ? 4 : 1);

/** Body width in grid units; the multiplexed module needs room for four digits. */
export const displayWidthCols = (type: DisplayType): number => {
  if (type === 'SEVEN_SEGMENT_4') return 7;
  if (type === 'SIXTEEN_SEGMENT') return 5;
  return 3;
};

const digitSelectId = (digit: number): string => `DIG${digit + 1}`;

const pin = (id: string, x: number, y: number): PortDefinition => ({ id, direction: 'input', label: id, x, y });

/**
 * Segment pins run down the left edge. The 4-digit module puts its digit
 * selects on the right edge; the 16-segment digit splits its 17 pins across
 * both edges so the body stays a usable shape instead of a 17-row column.
 */
export const displayPorts = (type: DisplayType): readonly PortDefinition[] => {
  const width = displayWidthCols(type);
  if (type === 'SEVEN_SEGMENT') return SEVEN_SEGMENT_PINS.map((id, index) => pin(id, 0, index));
  if (type === 'SEVEN_SEGMENT_4') {
    return [
      ...SEVEN_SEGMENT_PINS.map((id, index) => pin(id, 0, index)),
      ...Array.from({ length: 4 }, (_, digit) => pin(digitSelectId(digit), width, digit)),
    ];
  }
  const leftCount = 9;
  return SIXTEEN_SEGMENT_PINS.map((id, index) => (index < leftCount ? pin(id, 0, index) : pin(id, width, index - leftCount)));
};

/** Short caption drawn above the body. */
export const displayTitle = (type: DisplayType): string => {
  if (type === 'SEVEN_SEGMENT_4') return '4x 7-SEG';
  if (type === 'SIXTEEN_SEGMENT') return '16-SEG';
  return '7-SEG';
};

// --- SECTION: lit segments ---

type Lit = 0 | 1;

const isAsserted = (level: LogicLevel, activeHigh: boolean): boolean => (activeHigh ? level === 1 : level === 0);

export interface UpdateSegmentLitInput {
  readonly type: DisplayType;
  readonly params: ComponentParams;
  /** The lit segments from the previous tick (digit-major), used to hold a multiplexed digit between selects. */
  readonly previous: readonly Lit[] | undefined;
  /** The resolved level on one of the display's input pins. */
  readonly read: (portId: string) => LogicLevel;
}

/**
 * Returns which segments are lit, digit-major: `digit * segmentCount + index`
 * over `segmentIdsOf(type)`. A floating or unknown segment pin is unlit: a
 * display cannot show "unknown", and lighting it would suggest a definite 1.
 */
export const updateSegmentLit = ({ type, params, previous, read }: UpdateSegmentLitInput): Lit[] => {
  const ids = segmentIdsOf(type);
  const digits = digitCountOf(type);
  const segmentsActiveHigh = params.activeHigh !== false;
  const selectsActiveHigh = params.digitActiveHigh !== false;
  const lit: Lit[] = [];

  for (let digit = 0; digit < digits; digit += 1) {
    // A single-digit display has no select pin: it always follows its pins.
    const selected = digits === 1 || isAsserted(read(digitSelectId(digit)), selectsActiveHigh);
    for (let index = 0; index < ids.length; index += 1) {
      const held = previous?.[digit * ids.length + index] ?? 0;
      lit.push(selected ? (isAsserted(read(ids[index]!), segmentsActiveHigh) ? 1 : 0) : held);
    }
  }
  return lit;
};

/** Restores a saved lit array, tolerating a missing record or one from before a display change. */
export const restoreSegmentLit = (saved: readonly LogicLevel[] | undefined, type: DisplayType): Lit[] => {
  const size = segmentIdsOf(type).length * digitCountOf(type);
  return Array.from({ length: size }, (_, index) => (saved?.[index] === 1 ? 1 : 0));
};

import { busLabel } from './bus-engine';
import type { ComponentParams, LogicLevel, PortDefinition } from './logic-types';

/**
 * Pure, framework-independent model of the arithmetic logic unit: a
 * combinational 4, 8, or 16-bit part with two operand buses, a 3-bit operation
 * code, and a result bus with status flags.
 *
 * The part is built the way the hardware is: every operation is a per-bit
 * network of four-valued gates (a ripple-carry adder, bitwise gates, a barrel
 * shifter), so an unknown or floating input bit spreads exactly as far as it
 * would in a real circuit and no further. A known 0 still forces an AND to 0,
 * a shift by a known amount still moves known bits, and the comparator still
 * answers once a higher bit has decided the result.
 *
 * Pins: operand buses `A` and `B`, operation `OP0`-`OP2`, and `CIN` on the left;
 * result bus `Y` and the flags `COUT`, `Z`, `N`, `V`, `EQ`, `LT`, `GT` on the
 * right. The single-bit pins behind each bus exist but are hidden, exactly as on
 * a bus-pin register, so the simulator and the analyzer keep working on them.
 */

/** Body width in grid units: wide enough for two bus labels such as `A[15:0]` and `Y[15:0]` to sit side by side. */
export const ALU_WIDTH_COLS = 5;

export const ALU_WIDTHS = [4, 8, 16] as const;
export type AluWidth = (typeof ALU_WIDTHS)[number];
export const DEFAULT_ALU_WIDTH: AluWidth = 4;

/** The eight operations, indexed by the value on `OP2 OP1 OP0`. */
export const ALU_OPERATIONS = ['ADD', 'SUB', 'AND', 'OR', 'XOR', 'SHL', 'SHR', 'SAR'] as const;
export type AluOperation = (typeof ALU_OPERATIONS)[number];

export const ALU_OPERATION_HELP: Readonly<Record<AluOperation, string>> = {
  ADD: 'A + B + CIN',
  SUB: 'A - B - CIN (CIN is the borrow in)',
  AND: 'A AND B, bit by bit',
  OR: 'A OR B, bit by bit',
  XOR: 'A XOR B, bit by bit',
  SHL: 'A shifted left by B, zeros in',
  SHR: 'A shifted right by B, zeros in',
  SAR: 'A shifted right by B, the sign bit copied in',
};

/** Snaps an untrusted width (an imported project can carry any JSON value) to the nearest supported one. */
export const clampAluWidth = (value: unknown): AluWidth => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_ALU_WIDTH;
  return ALU_WIDTHS.reduce<AluWidth>((best, candidate) => (Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best), DEFAULT_ALU_WIDTH);
};

export const aluWidthOf = (params: ComponentParams): AluWidth => clampAluWidth(params.aluWidth);

/** How many low bits of B select the shift amount: log2 of the width. */
export const shiftBitsOf = (width: number): number => Math.log2(width);

const range = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

export const ALU_FLAG_IDS = ['COUT', 'Z', 'N', 'V', 'EQ', 'LT', 'GT'] as const;

export const aluPorts = (params: ComponentParams): readonly PortDefinition[] => {
  const width = aluWidthOf(params);
  const aBits = range(width).map((index) => `A${index}`);
  const bBits = range(width).map((index) => `B${index}`);
  const yBits = range(width).map((index) => `Y${index}`);
  const left = (id: string, y: number): PortDefinition => ({ id, direction: 'input', label: id, x: 0, y });
  const right = (id: string, y: number): PortDefinition => ({ id, direction: 'output', label: id, x: ALU_WIDTH_COLS, y });
  return [
    { id: 'A', direction: 'input', label: busLabel('A', width), x: 0, y: 0, bus: { bits: aBits } },
    { id: 'B', direction: 'input', label: busLabel('B', width), x: 0, y: 1, bus: { bits: bBits } },
    left('OP0', 2),
    left('OP1', 3),
    left('OP2', 4),
    left('CIN', 5),
    { id: 'Y', direction: 'output', label: busLabel('Y', width), x: ALU_WIDTH_COLS, y: 0, bus: { bits: yBits } },
    ...ALU_FLAG_IDS.map((id, index) => right(id, index + 1)),
    ...aBits.map((id): PortDefinition => ({ id, direction: 'input', label: id, x: 0, y: 0, hidden: true })),
    ...bBits.map((id): PortDefinition => ({ id, direction: 'input', label: id, x: 0, y: 1, hidden: true })),
    ...yBits.map((id): PortDefinition => ({ id, direction: 'output', label: id, x: ALU_WIDTH_COLS, y: 0, hidden: true })),
  ];
};

export const aluTitle = (params: ComponentParams): string => `ALU ${aluWidthOf(params)}b`;

export const aluSizeLabel = (width: number): string => `${width}-bit ALU`;

// --- SECTION: four-valued bit arithmetic ---

/** A bit the ALU reasons about: determinate, or unknown. High-impedance is unknown here, because a gate input cannot tell it from X. */
type Bit = 0 | 1 | 'X';

const bitOf = (level: LogicLevel | undefined): Bit => (level === 0 || level === 1 ? level : 'X');

const not = (a: Bit): Bit => (a === 'X' ? 'X' : a === 1 ? 0 : 1);
const and = (a: Bit, b: Bit): Bit => (a === 0 || b === 0 ? 0 : a === 1 && b === 1 ? 1 : 'X');
const or = (a: Bit, b: Bit): Bit => (a === 1 || b === 1 ? 1 : a === 0 && b === 0 ? 0 : 'X');
const xor = (a: Bit, b: Bit): Bit => (a === 'X' || b === 'X' ? 'X' : a === b ? 0 : 1);

/** One full-adder stage. `carry` is unknown only when it cannot be determined from the inputs, so a known pair of equal bits still fixes the carry. */
const fullAdd = (a: Bit, b: Bit, carryIn: Bit): { readonly sum: Bit; readonly carry: Bit } => ({
  sum: xor(xor(a, b), carryIn),
  carry: or(and(a, b), and(carryIn, xor(a, b))),
});

interface Sum {
  readonly bits: Bit[];
  readonly carryOut: Bit;
  /** The carry into the top bit, kept so signed overflow can be read as `carryIn(msb) XOR carryOut`. */
  readonly carryIntoTop: Bit;
}

const rippleAdd = (a: readonly Bit[], b: readonly Bit[], carryIn: Bit): Sum => {
  const bits: Bit[] = [];
  let carry = carryIn;
  let carryIntoTop: Bit = carryIn;
  for (let index = 0; index < a.length; index += 1) {
    if (index === a.length - 1) carryIntoTop = carry;
    const stage = fullAdd(a[index]!, b[index]!, carry);
    bits.push(stage.sum);
    carry = stage.carry;
  }
  return { bits, carryOut: carry, carryIntoTop };
};

/** Zero flag: any set bit makes it 0, all clear makes it 1, and otherwise it cannot be known. */
const isZero = (bits: readonly Bit[]): Bit => {
  if (bits.some((bit) => bit === 1)) return 0;
  return bits.every((bit) => bit === 0) ? 1 : 'X';
};

/** The shift amount as a number, or undefined while any select bit is unknown. */
const shiftAmount = (b: readonly Bit[], width: number): number | undefined => {
  let amount = 0;
  for (let index = 0; index < shiftBitsOf(width); index += 1) {
    const bit = b[index]!;
    if (bit === 'X') return undefined;
    amount += bit * 2 ** index;
  }
  return amount;
};

interface Shifted {
  readonly bits: Bit[];
  /** The last bit shifted out, like a CPU's carry flag after a shift; 0 when nothing moved. */
  readonly carryOut: Bit;
}

const shift = (a: readonly Bit[], amount: number, direction: 'left' | 'right', fill: Bit): Shifted => {
  const width = a.length;
  if (amount === 0) return { bits: [...a], carryOut: 0 };
  const bits = range(width).map((index): Bit => {
    const source = direction === 'left' ? index - amount : index + amount;
    return source >= 0 && source < width ? a[source]! : fill;
  });
  const carryOut = direction === 'left' ? a[width - amount]! : a[amount - 1]!;
  return { bits, carryOut };
};

interface Comparison {
  readonly eq: Bit;
  readonly lt: Bit;
  readonly gt: Bit;
}

/**
 * Unsigned comparison from the top bit down. The first position where the
 * operands differ decides it; an unknown bit reached before that leaves all
 * three answers unknown, because either operand could be the larger.
 */
const compare = (a: readonly Bit[], b: readonly Bit[]): Comparison => {
  for (let index = a.length - 1; index >= 0; index -= 1) {
    const left = a[index]!;
    const right = b[index]!;
    if (left === 'X' || right === 'X') return { eq: 'X', lt: 'X', gt: 'X' };
    if (left !== right) return left < right ? { eq: 0, lt: 1, gt: 0 } : { eq: 0, lt: 0, gt: 1 };
  }
  return { eq: 1, lt: 0, gt: 0 };
};

// --- SECTION: evaluation ---

/** The operation named by the three operation pins, or undefined while any of them is unknown. */
export const operationOf = (inputs: Readonly<Record<string, LogicLevel>>): AluOperation | undefined => {
  let code = 0;
  for (let index = 0; index < 3; index += 1) {
    const level = inputs[`OP${index}`];
    if (level !== 0 && level !== 1) return undefined;
    code += level * 2 ** index;
  }
  return ALU_OPERATIONS[code];
};

/**
 * Evaluates the ALU from its resolved input-pin levels (a missing pin reads as
 * floating). Returns a level for every single-bit output pin: `Y0`..`Yn-1` and
 * the flags. The comparison flags depend only on A and B, so they stay valid
 * while the operation code is still unknown.
 */
export const evaluateAlu = (params: ComponentParams, inputs: Readonly<Record<string, LogicLevel>>): Record<string, LogicLevel> => {
  const width = aluWidthOf(params);
  const a = range(width).map((index) => bitOf(inputs[`A${index}`]));
  const b = range(width).map((index) => bitOf(inputs[`B${index}`]));
  const carryIn = bitOf(inputs.CIN);
  const comparison = compare(a, b);
  const operation = operationOf(inputs);

  let result: Bit[] = range(width).map(() => 'X' as Bit);
  let carryOut: Bit = 'X';
  let overflow: Bit = 'X';

  if (operation === 'ADD') {
    const sum = rippleAdd(a, b, carryIn);
    result = sum.bits;
    carryOut = sum.carryOut;
    overflow = xor(sum.carryIntoTop, sum.carryOut);
  } else if (operation === 'SUB') {
    // A - B - borrow = A + NOT B + NOT borrow; the carry out of that sum is the inverse of the borrow out.
    const sum = rippleAdd(a, b.map(not), not(carryIn));
    result = sum.bits;
    carryOut = not(sum.carryOut);
    overflow = xor(sum.carryIntoTop, sum.carryOut);
  } else if (operation === 'AND' || operation === 'OR' || operation === 'XOR') {
    const gate = operation === 'AND' ? and : operation === 'OR' ? or : xor;
    result = a.map((bit, index) => gate(bit, b[index]!));
    carryOut = 0;
    overflow = 0;
  } else if (operation === 'SHL' || operation === 'SHR' || operation === 'SAR') {
    const amount = shiftAmount(b, width);
    if (amount !== undefined) {
      const shifted = shift(a, amount, operation === 'SHL' ? 'left' : 'right', operation === 'SAR' ? a[width - 1]! : 0);
      result = shifted.bits;
      carryOut = shifted.carryOut;
      overflow = 0;
    }
  }

  const outputs: Record<string, LogicLevel> = {};
  result.forEach((bit, index) => {
    outputs[`Y${index}`] = bit;
  });
  outputs.COUT = carryOut;
  outputs.Z = isZero(result);
  outputs.N = result[width - 1]!;
  outputs.V = overflow;
  outputs.EQ = comparison.eq;
  outputs.LT = comparison.lt;
  outputs.GT = comparison.gt;
  return outputs;
};

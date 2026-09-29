import type { ComponentParams, ComponentType, LogicLevel, PortDefinition } from './logic-types';

/**
 * Pure, framework-independent model of the multi-pin combinational blocks:
 * multiplexers, demultiplexers, binary decoders, and priority encoders.
 *
 * Every block is described by one address/select width `n` (`selectBits`,
 * 1-4) and exposes `2^n` data lines. This module owns three things and
 * nothing else: the pin layout (`blockPorts`), the four-valued behavior
 * (`evaluateBlock`), and small display helpers. The simulator, both
 * renderers, and the inspector all read from here so a block's pins,
 * behavior, and drawn body can never drift apart.
 */

export type BlockType = 'MUX' | 'DEMUX' | 'DECODER' | 'PRIORITY_ENCODER' | 'BCD_7SEG';

/** Body width, in grid units, shared by the pin layout and both renderers. */
export const BLOCK_WIDTH_COLS = 3;

export const MIN_SELECT_BITS = 1;
export const MAX_SELECT_BITS = 4;

export const isBlockType = (type: ComponentType): type is BlockType =>
  type === 'MUX' || type === 'DEMUX' || type === 'DECODER' || type === 'PRIORITY_ENCODER' || type === 'BCD_7SEG';

/** An 8-to-3 priority encoder is the familiar default; the others default to the 4-way (2-bit) size. */
export const defaultSelectBits = (type: BlockType): number => (type === 'PRIORITY_ENCODER' ? 3 : 2);

/**
 * Coerces an untrusted `selectBits` (a hand-edited or imported project can
 * carry any JSON value) into the supported 1-4 range, so the number of pins
 * a block exposes is always bounded and finite.
 */
export const clampSelectBits = (value: unknown, fallback: number = 2): number => {
  const raw = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(MAX_SELECT_BITS, Math.max(MIN_SELECT_BITS, Math.round(raw)));
};

export const selectBitsOf = (type: BlockType, params: ComponentParams): number =>
  clampSelectBits(params.selectBits, defaultSelectBits(type));

/** Whether this block type can expose an EN pin at all (priority encoders report validity through `V` instead). */
export const supportsEnable = (type: BlockType): boolean => type !== 'PRIORITY_ENCODER';

/** Whether the block's size comes from `selectBits`; the BCD-to-7-segment decoder is always 4 bits in, 7 segments out. */
export const hasSelectableSize = (type: BlockType): boolean => type !== 'BCD_7SEG';

/** The seven segment lines, in the order a display's pins use. */
export const SEVEN_SEGMENT_IDS = ['A', 'B', 'C', 'D', 'E', 'F', 'G'] as const;

/** Lit segments (A-G) for the decimal digits 0-9; every other 4-bit code blanks the display. */
const BCD_SEGMENT_PATTERNS: readonly (readonly (0 | 1)[])[] = [
  [1, 1, 1, 1, 1, 1, 0],
  [0, 1, 1, 0, 0, 0, 0],
  [1, 1, 0, 1, 1, 0, 1],
  [1, 1, 1, 1, 0, 0, 1],
  [0, 1, 1, 0, 0, 1, 1],
  [1, 0, 1, 1, 0, 1, 1],
  [1, 0, 1, 1, 1, 1, 1],
  [1, 1, 1, 0, 0, 0, 0],
  [1, 1, 1, 1, 1, 1, 1],
  [1, 1, 1, 1, 0, 1, 1],
];

export const hasEnablePin = (type: BlockType, params: ComponentParams): boolean =>
  supportsEnable(type) && params.hasEnable === true;

const range = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

const leftPin = (id: string, y: number): PortDefinition => ({ id, direction: 'input', label: id, x: 0, y });
const rightPin = (id: string, y: number): PortDefinition => ({ id, direction: 'output', label: id, x: BLOCK_WIDTH_COLS, y });

export const blockPorts = (type: BlockType, params: ComponentParams): readonly PortDefinition[] => {
  if (type === 'BCD_7SEG') {
    return [
      ...range(4).map((index) => leftPin(`D${index}`, index)),
      ...(hasEnablePin(type, params) ? [leftPin('EN', 4)] : []),
      ...SEVEN_SEGMENT_IDS.map((id, index) => rightPin(id, index)),
    ];
  }
  const bits = selectBitsOf(type, params);
  const lines = 1 << bits;
  const enable = hasEnablePin(type, params);

  if (type === 'MUX') {
    const inputs = [
      ...range(lines).map((index) => leftPin(`D${index}`, index)),
      ...range(bits).map((index) => leftPin(`S${index}`, lines + index)),
      ...(enable ? [leftPin('EN', lines + bits)] : []),
    ];
    const rows = inputs.length;
    return [...inputs, rightPin('Y', Math.floor((rows - 1) / 2))];
  }

  if (type === 'DEMUX') {
    const inputs = [
      leftPin('D', 0),
      ...range(bits).map((index) => leftPin(`S${index}`, 1 + index)),
      ...(enable ? [leftPin('EN', 1 + bits)] : []),
    ];
    return [...inputs, ...range(lines).map((index) => rightPin(`Y${index}`, index))];
  }

  if (type === 'DECODER') {
    const inputs = [
      ...range(bits).map((index) => leftPin(`A${index}`, index)),
      ...(enable ? [leftPin('EN', bits)] : []),
    ];
    return [...inputs, ...range(lines).map((index) => rightPin(`Y${index}`, index))];
  }

  return [
    ...range(lines).map((index) => leftPin(`I${index}`, index)),
    ...range(bits).map((index) => rightPin(`Y${index}`, index)),
    rightPin('V', bits),
  ];
};

/** A short caption for the body, such as `MUX 4:1`, `DEMUX 1:8`, `DEC 3:8`, or `ENC 8:3`. */
export const blockTitle = (type: BlockType, params: ComponentParams): string => {
  if (type === 'BCD_7SEG') return 'BCD-7SEG';
  const bits = selectBitsOf(type, params);
  const lines = 1 << bits;
  if (type === 'MUX') return `MUX ${lines}:1`;
  if (type === 'DEMUX') return `DEMUX 1:${lines}`;
  if (type === 'DECODER') return `DEC ${bits}:${lines}`;
  return `ENC ${lines}:${bits}`;
};

/** The label shown for one selectable size in the inspector. */
export const blockSizeLabel = (type: BlockType, bits: number): string => {
  if (type === 'BCD_7SEG') return '4-bit BCD to 7 segments';
  const lines = 1 << clampSelectBits(bits, defaultSelectBits(type));
  if (type === 'MUX') return `${lines}:1 multiplexer`;
  if (type === 'DEMUX') return `1:${lines} demultiplexer`;
  if (type === 'DECODER') return `${clampSelectBits(bits)}-to-${lines} decoder`;
  return `${lines}-to-${clampSelectBits(bits)} priority encoder`;
};

type Bit = 0 | 1;

const toBit = (level: LogicLevel | undefined): Bit | undefined => (level === 0 || level === 1 ? level : undefined);

/** Three-valued AND: a determinate 0 dominates; anything unknown that is not overruled by a 0 is X. */
const and3 = (a: LogicLevel | undefined, b: LogicLevel | undefined): Bit | 'X' => {
  const left = toBit(a);
  const right = toBit(b);
  if (left === 0 || right === 0) return 0;
  return left === 1 && right === 1 ? 1 : 'X';
};

const invert = (level: Bit | 'X'): Bit | 'X' => (level === 'X' ? 'X' : level === 1 ? 0 : 1);

interface SelectAnalysis {
  /** Whether every select bit is a determinate 0/1. */
  readonly known: boolean;
  /** Every data-line index the select bits could be addressing (exactly one when `known`). */
  readonly candidates: readonly number[];
}

/**
 * Expands select bits (LSB first) into the set of indices they could
 * address. A determinate select yields one index; an unknown or floating
 * select bit doubles the set, which is how X propagates honestly instead
 * of the block guessing a value.
 */
const analyseSelect = (bits: readonly (LogicLevel | undefined)[]): SelectAnalysis => {
  let candidates: number[] = [0];
  let known = true;
  bits.forEach((level, position) => {
    const bit = toBit(level);
    if (bit === undefined) {
      known = false;
      candidates = candidates.flatMap((value) => [value, value | (1 << position)]);
    } else if (bit === 1) {
      candidates = candidates.map((value) => value | (1 << position));
    }
  });
  return { known, candidates };
};

const selectLevels = (inputs: Readonly<Record<string, LogicLevel>>, prefix: string, bits: number): LogicLevel[] =>
  range(bits).map((index) => inputs[`${prefix}${index}`] ?? 'Z');

const evaluateMux = (inputs: Readonly<Record<string, LogicLevel>>, bits: number, enable: boolean): Record<string, LogicLevel> => {
  const select = analyseSelect(selectLevels(inputs, 'S', bits));
  const selected = select.candidates.map((index) => toBit(inputs[`D${index}`]));
  const first = selected[0];
  const value: Bit | 'X' = first !== undefined && selected.every((candidate) => candidate === first) ? first : 'X';
  return { Y: enable ? and3(inputs.EN, value) : value };
};

/** Shared by the demultiplexer and decoder: routes `data` to the addressed output, holding every other output at 0. */
const routeToOutputs = (data: Bit | 'X', select: SelectAnalysis, lines: number): Record<string, Bit | 'X'> => {
  const outputs: Record<string, Bit | 'X'> = {};
  for (let index = 0; index < lines; index += 1) {
    if (!select.candidates.includes(index)) outputs[`Y${index}`] = 0;
    else if (select.known) outputs[`Y${index}`] = data;
    else outputs[`Y${index}`] = data === 0 ? 0 : 'X';
  }
  return outputs;
};

const evaluateDemux = (inputs: Readonly<Record<string, LogicLevel>>, bits: number, enable: boolean): Record<string, LogicLevel> => {
  const data = enable ? and3(inputs.D, inputs.EN) : (toBit(inputs.D) ?? 'X');
  return routeToOutputs(data, analyseSelect(selectLevels(inputs, 'S', bits)), 1 << bits);
};

const evaluateDecoder = (inputs: Readonly<Record<string, LogicLevel>>, bits: number, enable: boolean, activeHigh: boolean): Record<string, LogicLevel> => {
  const data: Bit | 'X' = enable ? (toBit(inputs.EN) ?? 'X') : 1;
  const routed = routeToOutputs(data, analyseSelect(selectLevels(inputs, 'A', bits)), 1 << bits);
  if (activeHigh) return routed;
  const inverted: Record<string, LogicLevel> = {};
  for (const [id, level] of Object.entries(routed)) inverted[id] = invert(level);
  return inverted;
};

/**
 * The highest-numbered asserted input wins. An unknown input above every
 * asserted one makes the result indeterminate (a real device cannot know
 * which request would have won), so every output reports X instead.
 */
const evaluatePriorityEncoder = (inputs: Readonly<Record<string, LogicLevel>>, bits: number): Record<string, LogicLevel> => {
  const outputs: Record<string, LogicLevel> = {};
  const setIndex = (index: number, valid: Bit | 'X'): void => {
    for (let position = 0; position < bits; position += 1) outputs[`Y${position}`] = valid === 'X' ? 'X' : (((index >> position) & 1) as Bit);
    outputs.V = valid;
  };
  for (let index = (1 << bits) - 1; index >= 0; index -= 1) {
    const request = toBit(inputs[`I${index}`]);
    if (request === 1) {
      setIndex(index, 1);
      return outputs;
    }
    if (request === undefined) {
      setIndex(0, 'X');
      return outputs;
    }
  }
  setIndex(0, 0);
  return outputs;
};

/**
 * BCD-to-7-segment decoding. Codes 10-15 blank the display, and an unknown
 * input bit makes every segment unknown (a real decoder's glyph for that
 * code would be a guess). A low EN blanks the display whatever the data is.
 */
const evaluateBcdDecoder = (inputs: Readonly<Record<string, LogicLevel>>, enable: boolean, activeHigh: boolean): Record<string, LogicLevel> => {
  const enabled = enable ? toBit(inputs.EN) : 1;
  const digits = range(4).map((index) => toBit(inputs[`D${index}`]));
  let lit: readonly (Bit | 'X')[];
  if (enabled === 0) lit = SEVEN_SEGMENT_IDS.map(() => 0 as Bit);
  else if (enabled === undefined || digits.some((digit) => digit === undefined)) lit = SEVEN_SEGMENT_IDS.map(() => 'X' as const);
  else {
    const code = digits.reduce<number>((total, digit, index) => total + (digit as Bit) * (1 << index), 0);
    lit = BCD_SEGMENT_PATTERNS[code] ?? SEVEN_SEGMENT_IDS.map(() => 0 as Bit);
  }
  const outputs: Record<string, LogicLevel> = {};
  SEVEN_SEGMENT_IDS.forEach((id, index) => {
    const segment = lit[index] ?? 0;
    outputs[id] = segment === 'X' ? 'X' : activeHigh ? segment : invert(segment);
  });
  return outputs;
};

/**
 * Evaluates one block from its resolved input-pin levels (missing pins read
 * as floating). Returns a level for every output pin of `blockPorts`.
 */
export const evaluateBlock = (type: BlockType, params: ComponentParams, inputs: Readonly<Record<string, LogicLevel>>): Record<string, LogicLevel> => {
  const bits = selectBitsOf(type, params);
  const enable = hasEnablePin(type, params);
  if (type === 'BCD_7SEG') return evaluateBcdDecoder(inputs, enable, params.activeHigh !== false);
  if (type === 'MUX') return evaluateMux(inputs, bits, enable);
  if (type === 'DEMUX') return evaluateDemux(inputs, bits, enable);
  if (type === 'DECODER') return evaluateDecoder(inputs, bits, enable, params.activeHigh !== false);
  return evaluatePriorityEncoder(inputs, bits);
};

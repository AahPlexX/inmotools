import { busLabel } from './bus-engine';
import type { ComponentParams, ComponentType, LogicLevel, PortDefinition } from './logic-types';

/**
 * Pure, framework-independent model of the memory parts: read-only memory
 * (ROM) and random-access memory (RAM) with a 4 to 32-bit address space.
 *
 * Contents are sparse. Only the words that differ from the part's fill value
 * are stored, so a 32-bit address space (four billion words) costs exactly as
 * much as the words a person or a circuit has actually written, and a file
 * holding a 64-word program stays 64 words long.
 *
 * Two sets of contents exist for a RAM. The *stored* contents live in the
 * part's parameters, are what the editor changes, and are saved with the
 * project. The *live* contents are the words the running circuit has written
 * since the simulation started; they sit in the simulator's per-part state as
 * an overlay on the stored contents. Reading always sees the overlay first.
 *
 * Reading is combinational, like an asynchronous SRAM: the data pins follow
 * the address pins. A RAM writes on the active clock edge while write enable
 * is asserted. Neither part guesses: an unknown address gives unknown data,
 * and a write that cannot be carried out (unknown address, data or enable at
 * the clock edge) is skipped and reported instead of silently corrupting a
 * word.
 */

/** Body width in grid units: wide enough for `ADDR[31:0]` on the left and `DOUT[31:0]` on the right. */
export const MEMORY_WIDTH_COLS = 6;

export type MemoryType = 'RAM' | 'ROM';

export const isMemoryType = (type: ComponentType): type is MemoryType => type === 'RAM' || type === 'ROM';

export const MIN_ADDRESS_BITS = 4;
export const MAX_ADDRESS_BITS = 32;
export const DEFAULT_ADDRESS_BITS = 8;

export const DATA_WIDTHS = [4, 8, 16, 32] as const;
export type DataWidth = (typeof DATA_WIDTHS)[number];
export const DEFAULT_DATA_BITS: DataWidth = 8;

/** The most non-fill words one part stores, which bounds a project file and the editor's memory use. */
export const MAX_STORED_CELLS = 262_144;

/** The most words a binary export covers (it starts at address 0 and runs to the last non-fill word). */
export const MAX_EXPORT_WORDS = 1_048_576;

/** Coerces an untrusted address width into 4-32, so the pin count and address space are always bounded. */
export const clampAddressBits = (value: unknown, fallback: number = DEFAULT_ADDRESS_BITS): number => {
  const raw = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(MAX_ADDRESS_BITS, Math.max(MIN_ADDRESS_BITS, Math.round(raw)));
};

/** Snaps an untrusted word width to the nearest supported one; halfway values go to the narrower. */
export const clampDataBits = (value: unknown): DataWidth => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_DATA_BITS;
  return DATA_WIDTHS.reduce<DataWidth>((best, candidate) => (Math.abs(candidate - value) < Math.abs(best - value) ? candidate : best), DATA_WIDTHS[0]);
};

export const addressBitsOf = (params: ComponentParams): number => clampAddressBits(params.addressBits);
export const dataBitsOf = (params: ComponentParams): DataWidth => clampDataBits(params.dataBits);

/** Plain arithmetic rather than shifts: a 32-bit value does not survive JavaScript's signed bitwise operators. */
export const wordCount = (addressBits: number): number => 2 ** addressBits;
export const wordMask = (dataBits: number): number => 2 ** dataBits - 1;

/** A stored word forced into `dataBits`, or undefined when the value is not a number at all. */
export const normalizeWord = (value: unknown, dataBits: number): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  const modulus = 2 ** dataBits;
  return ((Math.trunc(value) % modulus) + modulus) % modulus;
};

export const fillOf = (params: ComponentParams): number => normalizeWord(params.memoryFill, dataBitsOf(params)) ?? 0;

export const hasOutputEnable = (params: ComponentParams): boolean => params.hasEnable === true;

// --- SECTION: pins ---

const range = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

/**
 * The address, data-in and data-out pins are bus ports; the single-bit pins behind them are hidden so the
 * simulator and the analyzer keep working on single bits, exactly as on a bus-pin register.
 */
export const memoryPorts = (type: MemoryType, params: ComponentParams): readonly PortDefinition[] => {
  const addressBits = addressBitsOf(params);
  const dataBits = dataBitsOf(params);
  const addressIds = range(addressBits).map((index) => `ADDR${index}`);
  const dataInIds = range(dataBits).map((index) => `DIN${index}`);
  const dataOutIds = range(dataBits).map((index) => `DOUT${index}`);
  const left = (id: string, y: number): PortDefinition => ({ id, direction: 'input', label: id, x: 0, y });

  const visible: PortDefinition[] = [{ id: 'ADDR', direction: 'input', label: busLabel('ADDR', addressBits), x: 0, y: 0, bus: { bits: addressIds } }];
  const hidden: PortDefinition[] = addressIds.map((id): PortDefinition => ({ id, direction: 'input', label: id, x: 0, y: 0, hidden: true }));

  if (type === 'RAM') {
    visible.push({ id: 'DIN', direction: 'input', label: busLabel('DIN', dataBits), x: 0, y: 1, bus: { bits: dataInIds } });
    visible.push(left('CLK', 2), left('WE', 3));
    hidden.push(...dataInIds.map((id): PortDefinition => ({ id, direction: 'input', label: id, x: 0, y: 1, hidden: true })));
    if (hasOutputEnable(params)) visible.push(left('OE', 4));
  } else if (hasOutputEnable(params)) {
    visible.push(left('OE', 1));
  }

  // A ROM has one input row, so its data pin sits on the second row to keep the body two rows tall.
  const dataOutY = type === 'ROM' ? 1 : 0;
  visible.push({ id: 'DOUT', direction: 'output', label: busLabel('DOUT', dataBits), x: MEMORY_WIDTH_COLS, y: dataOutY, bus: { bits: dataOutIds } });
  hidden.push(...dataOutIds.map((id): PortDefinition => ({ id, direction: 'output', label: id, x: MEMORY_WIDTH_COLS, y: dataOutY, hidden: true })));
  return [...visible, ...hidden];
};

/** `64K`, `1M`, `4G`, or a plain count: how many words the address space holds. */
export const formatWordCount = (count: number): string => {
  if (count >= 2 ** 30 && count % 2 ** 30 === 0) return `${count / 2 ** 30}G`;
  if (count >= 2 ** 20 && count % 2 ** 20 === 0) return `${count / 2 ** 20}M`;
  if (count >= 2 ** 10 && count % 2 ** 10 === 0) return `${count / 2 ** 10}K`;
  return String(count);
};

/** Short caption drawn above the body, such as `RAM 256x8` or `ROM 64Kx16`. */
export const memoryTitle = (type: MemoryType, params: ComponentParams): string =>
  `${type} ${formatWordCount(wordCount(addressBitsOf(params)))}x${dataBitsOf(params)}`;

// --- SECTION: contents ---

export type Cells = Readonly<Record<string, number>>;

const ADDRESS_KEY = /^(0|[1-9]\d*)$/;

/**
 * Cleans a cell map into its canonical sparse form: keys are addresses inside
 * the address space, values fit the word, and words equal to the fill are not
 * stored. Anything else in an untrusted map is dropped.
 */
export const canonicalCells = (cells: unknown, addressBits: number, dataBits: number, fill: number): Record<string, number> => {
  const clean: Record<string, number> = {};
  if (typeof cells !== 'object' || cells === null || Array.isArray(cells)) return clean;
  const limit = wordCount(addressBits);
  for (const [key, raw] of Object.entries(cells)) {
    if (!ADDRESS_KEY.test(key) || Number(key) >= limit) continue;
    const value = normalizeWord(raw, dataBits);
    if (value === undefined || value === fill) continue;
    clean[key] = value;
  }
  return clean;
};

/** The parameter changes that keep stored contents valid after the size or fill of a part changed. */
export const normalizeMemoryParams = (params: ComponentParams): ComponentParams => {
  const addressBits = addressBitsOf(params);
  const dataBits = dataBitsOf(params);
  const fill = fillOf(params);
  return { ...params, addressBits, dataBits, memoryFill: fill, memoryCells: canonicalCells(params.memoryCells, addressBits, dataBits, fill) };
};

/**
 * Whether an imported part's contents are usable as they are: an object of
 * integer addresses inside the address space mapped to integer words inside
 * the word width, no more than `MAX_STORED_CELLS` of them. A hand-edited file
 * that breaks this is refused rather than quietly repaired.
 */
export const isValidMemoryParams = (params: Readonly<Record<string, unknown>>): boolean => {
  const addressBits = clampAddressBits(params.addressBits);
  const dataBits = clampDataBits(params.dataBits);
  const mask = wordMask(dataBits);
  const isWord = (value: unknown): boolean => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= mask;
  if (params.memoryFill !== undefined && !isWord(params.memoryFill)) return false;
  const cells = params.memoryCells;
  if (cells === undefined) return true;
  if (typeof cells !== 'object' || cells === null || Array.isArray(cells)) return false;
  const entries = Object.entries(cells);
  if (entries.length > MAX_STORED_CELLS) return false;
  const limit = wordCount(addressBits);
  return entries.every(([key, value]) => ADDRESS_KEY.test(key) && Number(key) < limit && isWord(value));
};

/** The word at `address`: a live write first, then the stored contents, then the fill. */
export const readWord = (params: ComponentParams, live: Cells | undefined, address: number): number => {
  const key = String(address);
  const written = live?.[key];
  if (written !== undefined) return written;
  return normalizeWord(params.memoryCells?.[key], dataBitsOf(params)) ?? fillOf(params);
};

/** Stored contents with the live writes laid over them, in canonical form. */
export const mergeLive = (params: ComponentParams, live: Cells | undefined): Record<string, number> => {
  const addressBits = addressBitsOf(params);
  const dataBits = dataBitsOf(params);
  return canonicalCells({ ...(params.memoryCells ?? {}), ...(live ?? {}) }, addressBits, dataBits, fillOf(params));
};

export interface WordEdit {
  readonly address: number;
  readonly value: number;
}

export type EditResult = { readonly ok: true; readonly cells: Record<string, number> } | { readonly ok: false; readonly reason: string };

/** Applies word edits to a cell map, refusing an edit outside the address space or one that would store too many words. */
export const applyWordEdits = (params: ComponentParams, cells: Cells, edits: readonly WordEdit[]): EditResult => {
  const addressBits = addressBitsOf(params);
  const dataBits = dataBitsOf(params);
  const fill = fillOf(params);
  const limit = wordCount(addressBits);
  const next: Record<string, number> = { ...cells };
  for (const edit of edits) {
    if (!Number.isInteger(edit.address) || edit.address < 0 || edit.address >= limit) return { ok: false, reason: `Address ${edit.address} is outside this memory's ${formatWordCount(limit)}-word address space.` };
    const value = normalizeWord(edit.value, dataBits);
    if (value === undefined) return { ok: false, reason: 'That is not a number.' };
    if (value === fill) delete next[String(edit.address)];
    else next[String(edit.address)] = value;
  }
  if (Object.keys(next).length > MAX_STORED_CELLS) return { ok: false, reason: `A memory keeps at most ${MAX_STORED_CELLS.toLocaleString('en-US')} words that differ from its fill value.` };
  return { ok: true, cells: next };
};

// --- SECTION: reading and writing in the simulator ---

const toBit = (level: LogicLevel | undefined): 0 | 1 | undefined => (level === 0 || level === 1 ? level : undefined);

const bitsToNumber = (levels: readonly (LogicLevel | undefined)[]): number | undefined => {
  let value = 0;
  for (let index = 0; index < levels.length; index += 1) {
    const bit = toBit(levels[index]);
    if (bit === undefined) return undefined;
    value += bit * 2 ** index;
  }
  return value;
};

const numberToBits = (value: number, width: number): LogicLevel[] => range(width).map((index) => (Math.floor(value / 2 ** index) % 2) as LogicLevel);

const allLevels = (width: number, level: LogicLevel): Record<string, LogicLevel> => {
  const outputs: Record<string, LogicLevel> = {};
  for (let index = 0; index < width; index += 1) outputs[`DOUT${index}`] = level;
  return outputs;
};

const isAsserted = (level: LogicLevel | undefined, activeHigh: boolean): boolean | undefined => {
  const bit = toBit(level);
  if (bit === undefined) return undefined;
  return activeHigh ? bit === 1 : bit === 0;
};

/**
 * The data pins for the current inputs. An unknown address makes every data
 * bit unknown (any word could be selected); a deasserted output enable
 * releases the pins to high-impedance so several parts can share a bus.
 */
export const memoryOutputs = (params: ComponentParams, live: Cells | undefined, inputs: Readonly<Record<string, LogicLevel>>): Record<string, LogicLevel> => {
  const dataBits = dataBitsOf(params);
  if (hasOutputEnable(params)) {
    const enabled = isAsserted(inputs.OE, params.activeHigh !== false);
    if (enabled === undefined) return allLevels(dataBits, 'X');
    if (!enabled) return allLevels(dataBits, 'Z');
  }
  const address = bitsToNumber(range(addressBitsOf(params)).map((index) => inputs[`ADDR${index}`]));
  if (address === undefined) return allLevels(dataBits, 'X');
  const bits = numberToBits(readWord(params, live, address), dataBits);
  const outputs: Record<string, LogicLevel> = {};
  bits.forEach((level, index) => {
    outputs[`DOUT${index}`] = level;
  });
  return outputs;
};

export interface MemoryRuntime {
  /** Words the running circuit has written, keyed by address. */
  readonly writes: Cells;
  readonly lastClockLevel: LogicLevel | undefined;
  /** Why the latest clock edge did not write, or undefined when it did (or no write was asked for). */
  readonly fault: string | undefined;
}

export const restoreMemoryRuntime = (saved: { readonly memoryWrites?: Cells; readonly lastClockLevel?: LogicLevel; readonly memoryFault?: string } | undefined): MemoryRuntime => ({
  writes: saved?.memoryWrites ?? {},
  lastClockLevel: saved?.lastClockLevel,
  fault: saved?.memoryFault,
});

/** An edge needs a known previous level: the first sample after start-up is only a starting level and never writes. */
const isClockEdge = (previous: LogicLevel | undefined, current: LogicLevel, edge: ComponentParams['edge']): boolean => {
  if (previous === undefined) return false;
  return edge === 'falling' ? toBit(previous) === 1 && toBit(current) === 0 : toBit(previous) === 0 && toBit(current) === 1;
};

export interface StepMemoryInput {
  readonly params: ComponentParams;
  readonly runtime: MemoryRuntime;
  /** The resolved level on one of the part's input pins. */
  readonly read: (portId: string) => LogicLevel;
}

/** Advances a RAM by one tick: on an active clock edge with write enable asserted, stores the data word at the address. */
export const stepMemoryWrite = ({ params, runtime, read }: StepMemoryInput): MemoryRuntime => {
  const clock = read('CLK');
  const edge = isClockEdge(runtime.lastClockLevel, clock, params.edge);
  if (!edge) return { ...runtime, lastClockLevel: clock };

  const writeEnabled = isAsserted(read('WE'), params.activeHigh !== false);
  if (writeEnabled === false) return { writes: runtime.writes, lastClockLevel: clock, fault: undefined };
  if (writeEnabled === undefined) return { ...runtime, lastClockLevel: clock, fault: 'Write enable was unknown at the clock edge, so nothing was written.' };

  const address = bitsToNumber(range(addressBitsOf(params)).map((index) => read(`ADDR${index}`)));
  if (address === undefined) return { ...runtime, lastClockLevel: clock, fault: 'The address had unknown bits at the clock edge, so nothing was written.' };
  const value = bitsToNumber(range(dataBitsOf(params)).map((index) => read(`DIN${index}`)));
  if (value === undefined) return { ...runtime, lastClockLevel: clock, fault: 'The data had unknown bits at the clock edge, so nothing was written.' };
  return { writes: { ...runtime.writes, [String(address)]: value }, lastClockLevel: clock, fault: undefined };
};

/** The live writes with the given addresses removed (or all of them when no addresses are named). */
export const withoutWrites = (writes: Cells | undefined, addresses?: readonly number[]): Cells => {
  if (!writes) return {};
  if (addresses === undefined) return {};
  const next: Record<string, number> = { ...writes };
  for (const address of addresses) delete next[String(address)];
  return next;
};

// --- SECTION: editor text ---

/** Words per editor row: a row is at most 16 bytes wide, so wider words mean fewer per row. */
export const wordsPerRow = (dataBits: number): number => (dataBits <= 8 ? 16 : dataBits === 16 ? 8 : 4);

export const hexDigitsFor = (bits: number): number => Math.ceil(bits / 4);

export const formatWord = (value: number, dataBits: number): string => value.toString(16).toUpperCase().padStart(hexDigitsFor(dataBits), '0');

export const formatAddress = (address: number, addressBits: number): string => address.toString(16).toUpperCase().padStart(hexDigitsFor(addressBits), '0');

/** A hexadecimal word as typed (with or without `0x`), or undefined if it is not one or does not fit. */
export const parseHexWord = (text: string, dataBits: number): number | undefined => {
  const trimmed = text.trim().replace(/^0x/i, '');
  if (!/^[0-9a-f]+$/i.test(trimmed) || trimmed.length > hexDigitsFor(dataBits)) return undefined;
  const value = Number.parseInt(trimmed, 16);
  return value <= wordMask(dataBits) ? value : undefined;
};

/** A hexadecimal address as typed, or undefined if it is not one or is outside the address space. */
export const parseHexAddress = (text: string, addressBits: number): number | undefined => {
  const trimmed = text.trim().replace(/^0x/i, '');
  if (!/^[0-9a-f]+$/i.test(trimmed) || trimmed.length > hexDigitsFor(addressBits)) return undefined;
  const value = Number.parseInt(trimmed, 16);
  return value < wordCount(addressBits) ? value : undefined;
};

const bytesPerWord = (dataBits: number): number => Math.max(1, dataBits / 8);

/** The word as bytes, most significant first, so it reads left to right in the ASCII column. */
const wordBytes = (value: number, dataBits: number): number[] => {
  const count = bytesPerWord(dataBits);
  return range(count).map((index) => Math.floor(value / 2 ** (8 * (count - 1 - index))) % 256);
};

const printable = (byte: number): string => (byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.');

/** The printable characters a word spells, `.` standing in for anything else. */
export const asciiOf = (value: number, dataBits: number): string => wordBytes(value, dataBits).map(printable).join('');

/**
 * Words typed as text: each character is one byte (a character above 255
 * becomes `?`), and bytes group into words most significant first. A last
 * partial word is padded with zero bytes on the right.
 */
export const wordsFromAscii = (text: string, dataBits: number): number[] => {
  const size = bytesPerWord(dataBits);
  const bytes = Array.from(text, (character) => (character.charCodeAt(0) <= 255 ? character.charCodeAt(0) : 0x3f));
  const words: number[] = [];
  for (let start = 0; start < bytes.length; start += size) {
    let value = 0;
    for (let index = 0; index < size; index += 1) value = value * 256 + (bytes[start + index] ?? 0);
    words.push(normalizeWord(value, dataBits) ?? 0);
  }
  return words;
};

/**
 * A row of words after the person typed over its ASCII text. Only a character
 * that differs from what the row already shows changes its byte, so the `.`
 * that stands for an unprintable byte keeps that byte unless it is replaced.
 * Characters beyond the row's width are ignored.
 */
export const applyAsciiText = (words: readonly number[], text: string, dataBits: number): number[] => {
  const size = bytesPerWord(dataBits);
  const bytes = words.flatMap((word) => wordBytes(word, dataBits));
  const shown = bytes.map(printable);
  const typed = Array.from(text);
  for (let index = 0; index < Math.min(typed.length, bytes.length); index += 1) {
    if (typed[index] === shown[index]) continue;
    const code = typed[index]!.charCodeAt(0);
    bytes[index] = code <= 255 ? code : 0x3f;
  }
  return words.map((_, wordIndex) => {
    let value = 0;
    for (let index = 0; index < size; index += 1) value = value * 256 + (bytes[wordIndex * size + index] ?? 0);
    return normalizeWord(value, dataBits) ?? 0;
  });
};

/** The address the address pins currently hold, or undefined while any of them is unknown. */
export const addressFromPins = (params: ComponentParams, read: (portId: string) => LogicLevel): number | undefined =>
  bitsToNumber(range(addressBitsOf(params)).map((index) => read(`ADDR${index}`)));

// --- SECTION: binary import and export ---

export type ImportResult =
  | { readonly ok: true; readonly cells: Record<string, number>; readonly words: number; readonly truncated: boolean }
  | { readonly ok: false; readonly reason: string };

/**
 * Turns a raw binary file into contents, from address 0. Words up to 8 bits
 * take one byte each (the low bits); 16-bit and 32-bit words take two and four
 * bytes, least significant byte first (little-endian, as most tools write it).
 * A file longer than the address space is cut off at its end and reported.
 */
export const importBinary = (bytes: Uint8Array, params: ComponentParams): ImportResult => {
  const addressBits = addressBitsOf(params);
  const dataBits = dataBitsOf(params);
  const fill = fillOf(params);
  const size = bytesPerWord(dataBits);
  const totalWords = Math.ceil(bytes.length / size);
  const capacity = wordCount(addressBits);
  const words = Math.min(totalWords, capacity);
  const cells: Record<string, number> = {};
  let stored = 0;
  for (let address = 0; address < words; address += 1) {
    let value = 0;
    for (let index = size - 1; index >= 0; index -= 1) value = value * 256 + (bytes[address * size + index] ?? 0);
    const word = normalizeWord(value, dataBits) ?? 0;
    if (word === fill) continue;
    stored += 1;
    if (stored > MAX_STORED_CELLS) return { ok: false, reason: `This file has more than ${MAX_STORED_CELLS.toLocaleString('en-US')} words that differ from the fill value, which is more than a memory keeps.` };
    cells[String(address)] = word;
  }
  return { ok: true, cells, words, truncated: totalWords > capacity };
};

export type ExportResult =
  | { readonly ok: true; readonly bytes: Uint8Array; readonly words: number }
  | { readonly ok: false; readonly reason: string };

/** Contents as raw bytes from address 0 to the last word that differs from the fill, in the layout `importBinary` reads. */
export const exportBinary = (params: ComponentParams, cells: Cells): ExportResult => {
  const dataBits = dataBitsOf(params);
  const fill = fillOf(params);
  const addresses = Object.keys(cells).map(Number);
  if (addresses.length === 0) return { ok: false, reason: 'This memory holds only its fill value, so there is nothing to export.' };
  const words = Math.max(...addresses) + 1;
  if (words > MAX_EXPORT_WORDS) return { ok: false, reason: `The last stored word is at address ${words - 1}, past the ${MAX_EXPORT_WORDS.toLocaleString('en-US')} words a binary export covers.` };
  const size = bytesPerWord(dataBits);
  const bytes = new Uint8Array(words * size);
  for (let address = 0; address < words; address += 1) {
    const value = cells[String(address)] ?? fill;
    for (let index = 0; index < size; index += 1) bytes[address * size + index] = Math.floor(value / 2 ** (8 * index)) % 256;
  }
  return { ok: true, bytes, words };
};

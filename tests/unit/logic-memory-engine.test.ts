import { describe, expect, it } from 'vitest';
import { checkTruthTableAvailability, runElectricalRuleCheck } from '../../src/tools/logic/analysis-engine';
import { addComponent, addWire, createInitialDocument, updateComponentParams } from '../../src/tools/logic/circuit-model';
import { getComponentPorts, getSimulationPorts, isCombinationalLogic, isStatefulPart } from '../../src/tools/logic/component-library';
import { parseProject, renderSchematicSvg, serializeProject } from '../../src/tools/logic/export-engine';
import type { ComponentParams, LogicDocument, LogicLevel, SimulationFrame } from '../../src/tools/logic/logic-types';
import {
  addressFromPins,
  applyAsciiText,
  applyWordEdits,
  asciiOf,
  canonicalCells,
  clampAddressBits,
  clampDataBits,
  exportBinary,
  fillOf,
  formatAddress,
  formatWord,
  formatWordCount,
  importBinary,
  isValidMemoryParams,
  MAX_STORED_CELLS,
  memoryOutputs,
  memoryPorts,
  memoryTitle,
  mergeLive,
  normalizeMemoryParams,
  normalizeWord,
  parseHexAddress,
  parseHexWord,
  readWord,
  restoreMemoryRuntime,
  stepMemoryWrite,
  withoutWrites,
  wordCount,
  wordMask,
  wordsFromAscii,
  wordsPerRow,
} from '../../src/tools/logic/memory-engine';
import { createInitialFrame, readLevel, step } from '../../src/tools/logic/sim-engine';

const lastId = (doc: LogicDocument): string => doc.components[doc.components.length - 1]!.id;
const bitsOf = (value: number, width: number): LogicLevel[] => Array.from({ length: width }, (_, index) => (Math.floor(value / 2 ** index) % 2) as LogicLevel);

describe('memory sizes and words', () => {
  it('clamps the address width to 4-32 and snaps the data width to 4, 8, 16 or 32', () => {
    expect(clampAddressBits(1)).toBe(4);
    expect(clampAddressBits(99)).toBe(32);
    expect(clampAddressBits(9.4)).toBe(9);
    expect(clampAddressBits('big')).toBe(8);
    expect(clampAddressBits(Number.NaN)).toBe(8);
    expect(clampDataBits(4)).toBe(4);
    expect(clampDataBits(9)).toBe(8);
    expect(clampDataBits(12)).toBe(8);
    expect(clampDataBits(13)).toBe(16);
    expect(clampDataBits(64)).toBe(32);
    expect(clampDataBits(undefined)).toBe(8);
  });

  it('counts words and masks without signed 32-bit overflow', () => {
    expect(wordCount(4)).toBe(16);
    expect(wordCount(32)).toBe(4_294_967_296);
    expect(wordMask(32)).toBe(4_294_967_295);
    expect(normalizeWord(4_294_967_295, 32)).toBe(4_294_967_295);
    expect(normalizeWord(4_294_967_296, 32)).toBe(0);
    expect(normalizeWord(-1, 8)).toBe(255);
    expect(normalizeWord(3.9, 8)).toBe(3);
    expect(normalizeWord('7', 8)).toBeUndefined();
    expect(normalizeWord(Number.NaN, 8)).toBeUndefined();
  });

  it('names the size in the caption', () => {
    expect(memoryTitle('RAM', { addressBits: 8, dataBits: 8 })).toBe('RAM 256x8');
    expect(memoryTitle('ROM', { addressBits: 16, dataBits: 16 })).toBe('ROM 64Kx16');
    expect(memoryTitle('ROM', { addressBits: 20, dataBits: 4 })).toBe('ROM 1Mx4');
    expect(memoryTitle('RAM', { addressBits: 32, dataBits: 32 })).toBe('RAM 4Gx32');
    expect(formatWordCount(16)).toBe('16');
    expect(formatWordCount(1024)).toBe('1K');
  });
});

describe('memory pins', () => {
  it('gives a ROM an address bus and a data bus, plus an output enable when asked', () => {
    expect(getComponentPorts('ROM', {}).map((port) => port.id)).toEqual(['ADDR', 'DOUT']);
    expect(getComponentPorts('ROM', { hasEnable: true }).map((port) => port.id)).toEqual(['ADDR', 'OE', 'DOUT']);
    const rom = getComponentPorts('ROM', { addressBits: 12, dataBits: 16 });
    expect(rom.find((port) => port.id === 'ADDR')?.label).toBe('ADDR[11:0]');
    expect(rom.find((port) => port.id === 'DOUT')?.label).toBe('DOUT[15:0]');
  });

  it('gives a RAM a data-in bus, a clock and a write enable', () => {
    expect(getComponentPorts('RAM', {}).map((port) => port.id)).toEqual(['ADDR', 'DIN', 'CLK', 'WE', 'DOUT']);
    expect(getComponentPorts('RAM', { hasEnable: true }).map((port) => port.id)).toEqual(['ADDR', 'DIN', 'CLK', 'WE', 'OE', 'DOUT']);
  });

  it('keeps one hidden pin per address and data bit, up to a 32-bit address space', () => {
    const single = getSimulationPorts('RAM', { addressBits: 32, dataBits: 32 });
    expect(single.filter((port) => /^ADDR\d+$/.test(port.id))).toHaveLength(32);
    expect(single.filter((port) => /^DIN\d+$/.test(port.id))).toHaveLength(32);
    expect(single.filter((port) => /^DOUT\d+$/.test(port.id))).toHaveLength(32);
    expect(single.some((port) => port.bus !== undefined)).toBe(false);
  });

  it('never overlaps two visible pins', () => {
    for (const type of ['RAM', 'ROM'] as const) {
      const visible = memoryPorts(type, { hasEnable: true }).filter((port) => port.hidden !== true);
      const spots = visible.map((port) => `${port.x},${port.y}`);
      expect(new Set(spots).size).toBe(spots.length);
    }
  });

  it('classifies a ROM as combinational and a RAM as stateful', () => {
    expect(isCombinationalLogic('ROM')).toBe(true);
    expect(isCombinationalLogic('RAM')).toBe(false);
    expect(isStatefulPart('RAM')).toBe(true);
    expect(isStatefulPart('ROM')).toBe(false);
  });
});

describe('memory contents', () => {
  it('keeps only words that differ from the fill, inside the address space and word width', () => {
    const cells = canonicalCells({ 0: 5, 1: 0, 15: 300, 16: 9, '-1': 3, x: 4, 2: 'no', 3.5: 1 }, 4, 8, 0);
    expect(cells).toEqual({ '0': 5, '15': 44 });
    expect(canonicalCells({ 0: 255, 1: 3 }, 4, 8, 255)).toEqual({ '1': 3 });
    expect(canonicalCells(undefined, 4, 8, 0)).toEqual({});
    expect(canonicalCells([1, 2], 4, 8, 0)).toEqual({});
  });

  it('reads a live write before the stored word, and the stored word before the fill', () => {
    const params: ComponentParams = { addressBits: 4, dataBits: 8, memoryFill: 0xff, memoryCells: { '3': 7 } };
    expect(readWord(params, undefined, 3)).toBe(7);
    expect(readWord(params, undefined, 4)).toBe(0xff);
    expect(readWord(params, { '3': 9, '4': 1 }, 3)).toBe(9);
    expect(readWord(params, { '3': 9, '4': 1 }, 4)).toBe(1);
    expect(fillOf(params)).toBe(255);
    expect(fillOf({ memoryFill: 999, dataBits: 8 })).toBe(231);
  });

  it('merges live writes into the stored contents', () => {
    const params: ComponentParams = { addressBits: 4, dataBits: 8, memoryCells: { '1': 1, '2': 2 } };
    expect(mergeLive(params, { '2': 0, '5': 5 })).toEqual({ '1': 1, '5': 5 });
    expect(mergeLive(params, undefined)).toEqual({ '1': 1, '2': 2 });
  });

  it('applies edits, dropping a word that becomes the fill, and refuses one outside the address space', () => {
    const params: ComponentParams = { addressBits: 4, dataBits: 8, memoryCells: { '1': 1 } };
    const edited = applyWordEdits(params, { '1': 1 }, [{ address: 2, value: 200 }, { address: 1, value: 0 }]);
    expect(edited).toEqual({ ok: true, cells: { '2': 200 } });
    const outside = applyWordEdits(params, {}, [{ address: 16, value: 1 }]);
    expect(outside.ok).toBe(false);
    if (!outside.ok) expect(outside.reason).toContain('outside');
    expect(applyWordEdits(params, {}, [{ address: 0, value: Number.NaN }]).ok).toBe(false);
    expect(applyWordEdits(params, {}, [{ address: 0, value: 511 }])).toEqual({ ok: true, cells: { '0': 255 } });
  });

  it('refuses an edit that would store more words than a memory keeps', () => {
    const params: ComponentParams = { addressBits: 32, dataBits: 8 };
    const crowded: Record<string, number> = {};
    for (let address = 0; address < MAX_STORED_CELLS; address += 1) crowded[String(address)] = 1;
    const result = applyWordEdits(params, crowded, [{ address: MAX_STORED_CELLS, value: 1 }]);
    expect(result.ok).toBe(false);
  });

  it('re-normalizes contents when a memory is resized or re-filled', () => {
    const params: ComponentParams = { addressBits: 8, dataBits: 16, memoryFill: 0, memoryCells: { '3': 0x1234, '200': 5 } };
    const smaller = normalizeMemoryParams({ ...params, addressBits: 4, dataBits: 8 });
    expect(smaller.memoryCells).toEqual({ '3': 0x34 });
    const refilled = normalizeMemoryParams({ ...params, memoryFill: 5 });
    expect(refilled.memoryCells).toEqual({ '3': 0x1234 });
  });

  it('removes live writes for the given addresses, or all of them', () => {
    expect(withoutWrites({ '1': 1, '2': 2 }, [1])).toEqual({ '2': 2 });
    expect(withoutWrites({ '1': 1, '2': 2 })).toEqual({});
    expect(withoutWrites(undefined, [1])).toEqual({});
  });
});

describe('memory editor text', () => {
  it('lays out 16, 8 or 4 words per row and pads hex to the word width', () => {
    expect(wordsPerRow(4)).toBe(16);
    expect(wordsPerRow(8)).toBe(16);
    expect(wordsPerRow(16)).toBe(8);
    expect(wordsPerRow(32)).toBe(4);
    expect(formatWord(10, 4)).toBe('A');
    expect(formatWord(10, 8)).toBe('0A');
    expect(formatWord(0xbeef, 16)).toBe('BEEF');
    expect(formatWord(1, 32)).toBe('00000001');
    expect(formatAddress(255, 8)).toBe('FF');
    expect(formatAddress(1, 20)).toBe('00001');
  });

  it('parses hexadecimal words and addresses, refusing anything that does not fit', () => {
    expect(parseHexWord('ff', 8)).toBe(255);
    expect(parseHexWord('0xFF', 8)).toBe(255);
    expect(parseHexWord(' 7 ', 4)).toBe(7);
    expect(parseHexWord('100', 8)).toBeUndefined();
    expect(parseHexWord('1F', 4)).toBeUndefined();
    expect(parseHexWord('', 8)).toBeUndefined();
    expect(parseHexWord('zz', 8)).toBeUndefined();
    expect(parseHexWord('-1', 8)).toBeUndefined();
    expect(parseHexAddress('ff', 8)).toBe(255);
    expect(parseHexAddress('100', 8)).toBeUndefined();
    expect(parseHexAddress('FFFFFFFF', 32)).toBe(4_294_967_295);
  });

  it('spells words as characters, most significant byte first', () => {
    expect(asciiOf(0x41, 8)).toBe('A');
    expect(asciiOf(0x1f, 8)).toBe('.');
    expect(asciiOf(0x4142, 16)).toBe('AB');
    expect(asciiOf(0x48454c4c, 32)).toBe('HELL');
    expect(asciiOf(5, 4)).toBe('.');
  });

  it('turns typed text back into words and round-trips printable text', () => {
    expect(wordsFromAscii('AB', 8)).toEqual([0x41, 0x42]);
    expect(wordsFromAscii('ABC', 16)).toEqual([0x4142, 0x4300]);
    expect(wordsFromAscii('HELLO', 32)).toEqual([0x48454c4c, 0x4f000000]);
    expect(wordsFromAscii('A€B', 8)).toEqual([0x41, 0x3f, 0x42]);
    expect(wordsFromAscii('', 8)).toEqual([]);
    for (const width of [8, 16, 32] as const) {
      const words = wordsFromAscii('Hello, world!!!!', width);
      expect(words.map((word) => asciiOf(word, width)).join('')).toBe('Hello, world!!!!');
    }
  });
});

describe('typing over a row of ASCII text', () => {
  it('changes only the characters that differ and keeps unprintable bytes behind a dot', () => {
    expect(applyAsciiText([0x41, 0x1f, 0x43], 'AXC', 8)).toEqual([0x41, 0x58, 0x43]);
    expect(applyAsciiText([0x41, 0x1f, 0x43], 'A.C', 8)).toEqual([0x41, 0x1f, 0x43]);
    expect(applyAsciiText([0x41, 0x42], 'Z', 8)).toEqual([0x5a, 0x42]);
    expect(applyAsciiText([0x41, 0x42], 'ABCDEF', 8)).toEqual([0x41, 0x42]);
  });

  it('edits single bytes inside wider words', () => {
    expect(applyAsciiText([0x4142, 0x4344], 'AXCD', 16)).toEqual([0x4158, 0x4344]);
    expect(applyAsciiText([0x48454c4c], 'HELP', 32)).toEqual([0x48454c50]);
  });

  it('turns a character above 255 into a question mark', () => {
    expect(applyAsciiText([0x41], '\u20ac', 8)).toEqual([0x3f]);
  });

  it('reads the address from the pins, unknown while any is unknown', () => {
    const levels: Record<string, LogicLevel> = { ADDR0: 1, ADDR1: 0, ADDR2: 1, ADDR3: 1 };
    expect(addressFromPins({ addressBits: 4 }, (id) => levels[id] ?? 'Z')).toBe(13);
    expect(addressFromPins({ addressBits: 4 }, (id) => (id === 'ADDR2' ? 'X' : levels[id] ?? 'Z'))).toBeUndefined();
  });
});

describe('binary import and export', () => {
  it('imports one byte per word up to 8 bits and masks a 4-bit word', () => {
    const eight = importBinary(Uint8Array.from([1, 0, 3, 255]), { addressBits: 8, dataBits: 8 });
    expect(eight).toEqual({ ok: true, cells: { '0': 1, '2': 3, '3': 255 }, words: 4, truncated: false });
    const four = importBinary(Uint8Array.from([0xff, 0x12]), { addressBits: 8, dataBits: 4 });
    expect(four.ok && four.cells).toEqual({ '0': 15, '1': 2 });
  });

  it('imports 16 and 32-bit words little-endian and pads a last partial word with zeros', () => {
    const sixteen = importBinary(Uint8Array.from([0x34, 0x12, 0xcd]), { addressBits: 8, dataBits: 16 });
    expect(sixteen).toEqual({ ok: true, cells: { '0': 0x1234, '1': 0x00cd }, words: 2, truncated: false });
    const thirtyTwo = importBinary(Uint8Array.from([0x78, 0x56, 0x34, 0xf2]), { addressBits: 8, dataBits: 32 });
    expect(thirtyTwo.ok && thirtyTwo.cells).toEqual({ '0': 0xf2345678 });
  });

  it('cuts a file at the end of the address space and says so', () => {
    const result = importBinary(Uint8Array.from(Array.from({ length: 40 }, (_, index) => index + 1)), { addressBits: 4, dataBits: 8 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.words).toBe(16);
      expect(result.truncated).toBe(true);
      expect(Object.keys(result.cells)).toHaveLength(16);
    }
  });

  it('does not store words equal to the fill, so an erased flash image stays small', () => {
    const image = new Uint8Array(1000).fill(0xff);
    image[500] = 7;
    const result = importBinary(image, { addressBits: 12, dataBits: 8, memoryFill: 0xff });
    expect(result.ok && result.cells).toEqual({ '500': 7 });
  });

  it('refuses a file with more differing words than a memory keeps', () => {
    const big = new Uint8Array(MAX_STORED_CELLS + 1).fill(1);
    const result = importBinary(big, { addressBits: 32, dataBits: 8 });
    expect(result.ok).toBe(false);
  });

  it('exports what it imports, byte for byte, at every word width', () => {
    for (const dataBits of [4, 8, 16, 32] as const) {
      const params: ComponentParams = { addressBits: 12, dataBits };
      const size = Math.max(1, dataBits / 8);
      const source = Uint8Array.from(Array.from({ length: size * 37 }, (_, index) => (dataBits === 4 ? (index * 7 + 1) & 0x0f : (index * 37 + 11) & 0xff)));
      const imported = importBinary(source, params);
      expect(imported.ok).toBe(true);
      if (!imported.ok) continue;
      const exported = exportBinary(params, imported.cells);
      expect(exported.ok).toBe(true);
      if (exported.ok) expect(Array.from(exported.bytes)).toEqual(Array.from(source.subarray(0, exported.bytes.length)));
    }
  });

  it('exports gaps as the fill and refuses an empty memory or a sparse one that runs too far', () => {
    const exported = exportBinary({ addressBits: 8, dataBits: 8, memoryFill: 0xee }, { '2': 1 });
    expect(exported.ok && Array.from(exported.bytes)).toEqual([0xee, 0xee, 1]);
    expect(exportBinary({ addressBits: 8, dataBits: 8 }, {}).ok).toBe(false);
    expect(exportBinary({ addressBits: 32, dataBits: 8 }, { '4000000000': 1 }).ok).toBe(false);
  });
});

describe('reading and writing a memory', () => {
  const ROM: ComponentParams = { addressBits: 4, dataBits: 8, memoryCells: { '5': 0xa5 }, memoryFill: 0x11 };

  const addressLevels = (address: number, width = 4): Record<string, LogicLevel> =>
    Object.fromEntries(bitsOf(address, width).map((level, index) => [`ADDR${index}`, level]));

  it('drives the addressed word onto the data pins', () => {
    const outputs = memoryOutputs(ROM, undefined, addressLevels(5));
    expect(Array.from({ length: 8 }, (_, index) => outputs[`DOUT${index}`])).toEqual(bitsOf(0xa5, 8));
    const other = memoryOutputs(ROM, undefined, addressLevels(6));
    expect(Array.from({ length: 8 }, (_, index) => other[`DOUT${index}`])).toEqual(bitsOf(0x11, 8));
  });

  it('makes every data bit unknown while an address bit is unknown or floating', () => {
    for (const level of ['X', 'Z'] as const) {
      const outputs = memoryOutputs(ROM, undefined, { ...addressLevels(5), ADDR2: level });
      for (let index = 0; index < 8; index += 1) expect(outputs[`DOUT${index}`]).toBe('X');
    }
  });

  it('releases the data pins when the output enable is off, and makes them unknown when it is unknown', () => {
    const params: ComponentParams = { ...ROM, hasEnable: true };
    expect(memoryOutputs(params, undefined, { ...addressLevels(5), OE: 0 }).DOUT0).toBe('Z');
    expect(memoryOutputs(params, undefined, { ...addressLevels(5), OE: 1 }).DOUT0).toBe(1);
    expect(memoryOutputs(params, undefined, { ...addressLevels(5), OE: 'X' }).DOUT0).toBe('X');
    expect(memoryOutputs(params, undefined, addressLevels(5)).DOUT0).toBe('X');
    expect(memoryOutputs({ ...params, activeHigh: false }, undefined, { ...addressLevels(5), OE: 0 }).DOUT0).toBe(1);
  });

  it('reads through a 32-bit address bus', () => {
    const params: ComponentParams = { addressBits: 32, dataBits: 8, memoryCells: { '4294967295': 0x7e }, memoryFill: 0 };
    const outputs = memoryOutputs(params, undefined, addressLevels(4_294_967_295, 32));
    expect(Array.from({ length: 8 }, (_, index) => outputs[`DOUT${index}`])).toEqual(bitsOf(0x7e, 8));
  });

  describe('RAM writes', () => {
    const RAM: ComponentParams = { addressBits: 4, dataBits: 4, edge: 'rising', activeHigh: true };
    const read = (levels: Record<string, LogicLevel>) => (id: string): LogicLevel => levels[id] ?? 'Z';
    const inputs = (address: number, data: number, we: LogicLevel, clk: LogicLevel): Record<string, LogicLevel> => ({
      ...addressLevels(address),
      ...Object.fromEntries(bitsOf(data, 4).map((level, index) => [`DIN${index}`, level])),
      WE: we,
      CLK: clk,
    });

    it('writes on the rising edge while write enable is high, and not before', () => {
      let runtime = restoreMemoryRuntime(undefined);
      runtime = stepMemoryWrite({ params: RAM, runtime, read: read(inputs(2, 9, 1, 0)) });
      expect(runtime.writes).toEqual({});
      runtime = stepMemoryWrite({ params: RAM, runtime, read: read(inputs(2, 9, 1, 1)) });
      expect(runtime.writes).toEqual({ '2': 9 });
      expect(runtime.fault).toBeUndefined();
    });

    it('does not write while write enable is low, and clears an earlier fault', () => {
      let runtime = restoreMemoryRuntime(undefined);
      runtime = stepMemoryWrite({ params: RAM, runtime, read: read(inputs(2, 9, 'X', 0)) });
      runtime = stepMemoryWrite({ params: RAM, runtime, read: read(inputs(2, 9, 'X', 1)) });
      expect(runtime.fault).toContain('Write enable');
      runtime = stepMemoryWrite({ params: RAM, runtime, read: read(inputs(2, 9, 0, 0)) });
      runtime = stepMemoryWrite({ params: RAM, runtime, read: read(inputs(2, 9, 0, 1)) });
      expect(runtime.writes).toEqual({});
      expect(runtime.fault).toBeUndefined();
    });

    it('writes on the falling edge when configured, and honors an active-low write enable', () => {
      const params: ComponentParams = { ...RAM, edge: 'falling', activeHigh: false };
      let runtime = restoreMemoryRuntime(undefined);
      runtime = stepMemoryWrite({ params, runtime, read: read(inputs(1, 5, 0, 1)) });
      runtime = stepMemoryWrite({ params, runtime, read: read(inputs(1, 5, 0, 0)) });
      expect(runtime.writes).toEqual({ '1': 5 });
    });

    it('never treats the first sample as an edge', () => {
      const runtime = stepMemoryWrite({ params: RAM, runtime: restoreMemoryRuntime(undefined), read: read(inputs(2, 9, 1, 1)) });
      expect(runtime.writes).toEqual({});
    });

    it('skips a write with an unknown address or unknown data and says why', () => {
      let runtime = restoreMemoryRuntime(undefined);
      runtime = stepMemoryWrite({ params: RAM, runtime, read: read(inputs(2, 9, 1, 0)) });
      const badAddress = stepMemoryWrite({ params: RAM, runtime, read: read({ ...inputs(2, 9, 1, 1), ADDR1: 'X' }) });
      expect(badAddress.writes).toEqual({});
      expect(badAddress.fault).toContain('address');
      const badData = stepMemoryWrite({ params: RAM, runtime, read: read({ ...inputs(2, 9, 1, 1), DIN3: 'Z' }) });
      expect(badData.writes).toEqual({});
      expect(badData.fault).toContain('data');
    });

    it('keeps earlier writes when a later one lands elsewhere', () => {
      let runtime = restoreMemoryRuntime(undefined);
      for (const [address, data] of [[1, 3], [2, 4]] as const) {
        runtime = stepMemoryWrite({ params: RAM, runtime, read: read(inputs(address, data, 1, 0)) });
        runtime = stepMemoryWrite({ params: RAM, runtime, read: read(inputs(address, data, 1, 1)) });
      }
      expect(runtime.writes).toEqual({ '1': 3, '2': 4 });
    });
  });
});

describe('memory in a circuit', () => {
  interface Rig {
    readonly doc: LogicDocument;
    readonly memory: string;
    readonly address: readonly string[];
    readonly data: readonly string[];
    readonly clock: string;
    readonly write: string;
    readonly enable: string | undefined;
  }

  const buildRig = (type: 'RAM' | 'ROM', params: Partial<ComponentParams>, addressBits: number, dataBits: number): Rig => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, type, 30, 0);
    const memory = lastId(doc);
    doc = updateComponentParams(doc, memory, { addressBits, dataBits, ...params });
    const bus = (x: number, y: number, width: number, portId: string): string[] => {
      doc = addComponent(doc, 'BUS_SPLITTER', x, y);
      const split = lastId(doc);
      doc = updateComponentParams(doc, split, { busWidth: width });
      const switches: string[] = [];
      for (let index = 0; index < width; index += 1) {
        doc = addComponent(doc, 'SWITCH', x - 6, y + index * 2);
        switches.push(lastId(doc));
        doc = addWire(doc, { componentId: lastId(doc), portId: 'Y' }, { componentId: split, portId: `S${index}` });
      }
      doc = addWire(doc, { componentId: split, portId: 'B' }, { componentId: memory, portId });
      return switches;
    };
    const address = bus(10, 0, addressBits, 'ADDR');
    let data: string[] = [];
    let clock = '';
    let write = '';
    let enable: string | undefined;
    if (type === 'RAM') {
      data = bus(10, 80, dataBits, 'DIN');
      doc = addComponent(doc, 'SWITCH', 24, 120);
      clock = lastId(doc);
      doc = addWire(doc, { componentId: clock, portId: 'Y' }, { componentId: memory, portId: 'CLK' });
      doc = addComponent(doc, 'SWITCH', 24, 124);
      write = lastId(doc);
      doc = addWire(doc, { componentId: write, portId: 'Y' }, { componentId: memory, portId: 'WE' });
    }
    if (params.hasEnable === true) {
      doc = addComponent(doc, 'SWITCH', 24, 128);
      enable = lastId(doc);
      doc = addWire(doc, { componentId: enable, portId: 'Y' }, { componentId: memory, portId: 'OE' });
    }
    return { doc, memory, address, data, clock, write, enable };
  };

  const setLevels = (ids: readonly string[], value: number): Record<string, LogicLevel> =>
    Object.fromEntries(bitsOf(value, ids.length).map((level, index) => [ids[index]!, level]));

  const run = (rig: Rig, frame: SimulationFrame, interactions: Record<string, LogicLevel>): SimulationFrame =>
    step({ document: rig.doc, previous: frame, elapsedMs: 16, interactions });

  const dataOut = (rig: Rig, frame: SimulationFrame, width: number): LogicLevel[] =>
    Array.from({ length: width }, (_, index) => readLevel(frame, rig.memory, `DOUT${index}`));

  it('reads a ROM through an address bus, and follows the address as it changes', () => {
    const rig = buildRig('ROM', { memoryCells: { '3': 0xc, '9': 0x5 }, memoryFill: 0x1 }, 4, 4);
    let frame = run(rig, createInitialFrame(rig.doc), setLevels(rig.address, 3));
    expect(dataOut(rig, frame, 4)).toEqual(bitsOf(0xc, 4));
    frame = run(rig, frame, setLevels(rig.address, 9));
    expect(dataOut(rig, frame, 4)).toEqual(bitsOf(0x5, 4));
    frame = run(rig, frame, setLevels(rig.address, 4));
    expect(dataOut(rig, frame, 4)).toEqual(bitsOf(0x1, 4));
  });

  it('reads an 8-bit-address, 16-bit-word ROM', () => {
    const rig = buildRig('ROM', { memoryCells: { '200': 0xbeef } }, 8, 16);
    const frame = run(rig, createInitialFrame(rig.doc), setLevels(rig.address, 200));
    expect(dataOut(rig, frame, 16)).toEqual(bitsOf(0xbeef, 16));
  });

  it('writes a RAM on a clock edge and reads it back, leaving the stored contents alone', () => {
    const rig = buildRig('RAM', {}, 4, 4);
    let frame = run(rig, createInitialFrame(rig.doc), { ...setLevels(rig.address, 6), ...setLevels(rig.data, 0xb), [rig.write]: 1, [rig.clock]: 0 });
    expect(dataOut(rig, frame, 4)).toEqual(bitsOf(0, 4));
    frame = run(rig, frame, { [rig.clock]: 1 });
    expect(dataOut(rig, frame, 4)).toEqual(bitsOf(0xb, 4));
    expect(frame.componentState[rig.memory]?.memoryWrites).toEqual({ '6': 0xb });
    frame = run(rig, frame, { ...setLevels(rig.address, 7), [rig.clock]: 0 });
    expect(dataOut(rig, frame, 4)).toEqual(bitsOf(0, 4));
    frame = run(rig, frame, setLevels(rig.address, 6));
    expect(dataOut(rig, frame, 4)).toEqual(bitsOf(0xb, 4));
    expect(rig.doc.components.find((component) => component.id === rig.memory)?.params.memoryCells).toEqual({});
  });

  it('starts a RAM from its stored contents', () => {
    const rig = buildRig('RAM', { memoryCells: { '2': 7 } }, 4, 4);
    const frame = run(rig, createInitialFrame(rig.doc), { ...setLevels(rig.address, 2), ...setLevels(rig.data, 0), [rig.write]: 0, [rig.clock]: 0 });
    expect(dataOut(rig, frame, 4)).toEqual(bitsOf(7, 4));
  });

  it('reports a skipped write as a hazard until a later edge succeeds', () => {
    const rig = buildRig('RAM', {}, 4, 4);
    let frame = run(rig, createInitialFrame(rig.doc), { ...setLevels(rig.address, 1), ...setLevels(rig.data, 5), [rig.write]: 1, [rig.clock]: 0 });
    // Break the address: an unwired switch bit cannot be unknown, so cut a splitter tap out of the circuit.
    const broken: LogicDocument = { ...rig.doc, wires: rig.doc.wires.filter((wire) => !(wire.to.portId === 'S1')) };
    frame = step({ document: broken, previous: frame, elapsedMs: 16, interactions: { [rig.clock]: 1 } });
    expect(frame.componentState[rig.memory]?.memoryFault).toContain('address');
    expect(frame.hazards.some((hazard) => hazard.type === 'memory_write_skipped')).toBe(true);
    frame = step({ document: rig.doc, previous: frame, elapsedMs: 16, interactions: { [rig.clock]: 0 } });
    frame = step({ document: rig.doc, previous: frame, elapsedMs: 16, interactions: { [rig.clock]: 1 } });
    expect(frame.componentState[rig.memory]?.memoryFault).toBeUndefined();
    expect(frame.hazards.some((hazard) => hazard.type === 'memory_write_skipped')).toBe(false);
  });

  it('lets an output enable switch the data pins off and on', () => {
    const rig = buildRig('ROM', { memoryCells: { '1': 0xf }, hasEnable: true }, 4, 4);
    let frame = run(rig, createInitialFrame(rig.doc), { ...setLevels(rig.address, 1), [rig.enable!]: 0 });
    expect(dataOut(rig, frame, 4)).toEqual(['Z', 'Z', 'Z', 'Z']);
    frame = run(rig, frame, { [rig.enable!]: 1 });
    expect(dataOut(rig, frame, 4)).toEqual(bitsOf(0xf, 4));
  });

  it('lets the rule check name unwired memory pins', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'RAM', 0, 0);
    const messages = runElectricalRuleCheck(doc).map((finding) => finding.message).join('\n');
    expect(messages).toContain('WE');
    expect(messages).toContain('CLK');
    expect(messages).toContain('ADDR3');
  });

  it('tells the truth-table generator that a RAM makes a circuit sequential and a ROM does not', () => {
    const withIo = (type: 'RAM' | 'ROM'): LogicDocument => {
      let doc: LogicDocument = createInitialDocument();
      doc = addComponent(doc, 'SWITCH', 0, 0);
      doc = addComponent(doc, 'LED', 10, 0);
      return addComponent(doc, type, 4, 0);
    };
    expect(checkTruthTableAvailability(withIo('RAM')).ok).toBe(false);
    expect(checkTruthTableAvailability(withIo('ROM')).ok).toBe(true);
  });
});

describe('memory persistence and drawing', () => {
  it('saves and loads contents, fill and sizes with the project', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'ROM', 0, 0);
    doc = updateComponentParams(doc, lastId(doc), { addressBits: 12, dataBits: 16, memoryFill: 0xffff, memoryCells: { '0': 0x1234, '4095': 1 } });
    const restored = parseProject(serializeProject(doc));
    const params = restored.components[0]!.params;
    expect(params.addressBits).toBe(12);
    expect(params.dataBits).toBe(16);
    expect(params.memoryFill).toBe(0xffff);
    expect(params.memoryCells).toEqual({ '0': 0x1234, '4095': 1 });
  });

  it('refuses a hand-edited file whose contents break the address space or word width', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'ROM', 0, 0);
    const id = lastId(doc);
    const withCells = (memoryCells: unknown, extra: Record<string, unknown> = {}): string =>
      JSON.stringify({ ...doc, components: doc.components.map((component) => (component.id === id ? { ...component, params: { ...component.params, addressBits: 4, dataBits: 8, memoryCells, ...extra } } : component)) });
    expect(() => parseProject(withCells({ '1': 2 }))).not.toThrow();
    expect(() => parseProject(withCells({ '16': 2 }))).toThrow();
    expect(() => parseProject(withCells({ '1': 256 }))).toThrow();
    expect(() => parseProject(withCells({ '1': -1 }))).toThrow();
    expect(() => parseProject(withCells({ '1': 1.5 }))).toThrow();
    expect(() => parseProject(withCells({ one: 1 }))).toThrow();
    expect(() => parseProject(withCells([1, 2]))).toThrow();
    expect(() => parseProject(withCells('nope'))).toThrow();
    expect(() => parseProject(withCells({}, { memoryFill: 256 }))).toThrow();
  });

  it('validates parameters the same way outside a whole document', () => {
    expect(isValidMemoryParams({})).toBe(true);
    expect(isValidMemoryParams({ addressBits: 4, dataBits: 4, memoryCells: { '15': 15 } })).toBe(true);
    expect(isValidMemoryParams({ addressBits: 4, dataBits: 4, memoryCells: { '15': 16 } })).toBe(false);
  });

  it('keeps stored words that still fit when the part is resized through the model', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'RAM', 0, 0);
    const id = lastId(doc);
    doc = updateComponentParams(doc, id, { memoryCells: { '1': 0x99, '200': 3 } });
    doc = updateComponentParams(doc, id, { addressBits: 4, dataBits: 4 });
    expect(doc.components[0]?.params.memoryCells).toEqual({ '1': 9 });
  });

  it('drops wires that no longer fit when a memory bus is resized', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'BUS_SPLITTER', 0, 0);
    const split = lastId(doc);
    doc = updateComponentParams(doc, split, { busWidth: 8 });
    doc = addComponent(doc, 'ROM', 10, 0);
    const rom = lastId(doc);
    doc = addWire(doc, { componentId: split, portId: 'B' }, { componentId: rom, portId: 'ADDR' });
    expect(doc.wires).toHaveLength(1);
    doc = updateComponentParams(doc, rom, { addressBits: 12 });
    expect(doc.wires).toHaveLength(0);
  });

  it('draws its caption and bus labels in the SVG export', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'RAM', 2, 2);
    doc = updateComponentParams(doc, lastId(doc), { addressBits: 16, dataBits: 16 });
    const svg = renderSchematicSvg(doc);
    expect(svg).toContain('RAM 64Kx16');
    expect(svg).toContain('ADDR[15:0]');
    expect(svg).toContain('DIN[15:0]');
    expect(svg).toContain('DOUT[15:0]');
    expect(svg).not.toContain('NaN');
  });
});

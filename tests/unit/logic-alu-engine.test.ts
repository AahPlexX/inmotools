import { describe, expect, it } from 'vitest';
import { runElectricalRuleCheck } from '../../src/tools/logic/analysis-engine';
import {
  ALU_FLAG_IDS,
  ALU_OPERATIONS,
  ALU_WIDTHS,
  aluPorts,
  aluTitle,
  aluWidthOf,
  clampAluWidth,
  evaluateAlu,
  operationOf,
  shiftBitsOf,
} from '../../src/tools/logic/alu-engine';
import { addComponent, addWire, createInitialDocument, updateComponentParams } from '../../src/tools/logic/circuit-model';
import { getComponentPorts, getSimulationPorts, isCombinationalLogic } from '../../src/tools/logic/component-library';
import { parseProject, renderSchematicSvg, serializeProject } from '../../src/tools/logic/export-engine';
import type { ComponentParams, LogicDocument, LogicLevel } from '../../src/tools/logic/logic-types';
import { createInitialFrame, readLevel, step } from '../../src/tools/logic/sim-engine';

const bitsOf = (value: number, width: number): LogicLevel[] => Array.from({ length: width }, (_, index) => ((value >> index) & 1) as LogicLevel);

interface AluInputs {
  readonly a: number;
  readonly b: number;
  readonly op: number;
  readonly cin?: 0 | 1;
}

const inputsFor = (width: number, { a, b, op, cin = 0 }: AluInputs): Record<string, LogicLevel> => {
  const inputs: Record<string, LogicLevel> = { CIN: cin, OP0: (op & 1) as LogicLevel, OP1: ((op >> 1) & 1) as LogicLevel, OP2: ((op >> 2) & 1) as LogicLevel };
  bitsOf(a, width).forEach((level, index) => {
    inputs[`A${index}`] = level;
  });
  bitsOf(b, width).forEach((level, index) => {
    inputs[`B${index}`] = level;
  });
  return inputs;
};

const resultOf = (outputs: Readonly<Record<string, LogicLevel>>, width: number): number | undefined => {
  let value = 0;
  for (let index = 0; index < width; index += 1) {
    const level = outputs[`Y${index}`];
    if (level !== 0 && level !== 1) return undefined;
    value += level * 2 ** index;
  }
  return value;
};

/** Independent reference: plain integer arithmetic, no gates, so the tests do not check the ALU against itself. */
const reference = (width: number, { a, b, op, cin = 0 }: AluInputs) => {
  const modulus = 2 ** width;
  const signBit = 2 ** (width - 1);
  const signed = (value: number): number => (value >= signBit ? value - modulus : value);
  const bits = shiftBitsOf(width);
  const amount = b % 2 ** bits;
  let y = 0;
  let cout = 0;
  let v = 0;
  switch (ALU_OPERATIONS[op]) {
    case 'ADD': {
      const total = a + b + cin;
      y = total % modulus;
      cout = total >= modulus ? 1 : 0;
      const exact = signed(a) + signed(b) + cin;
      v = exact < -signBit || exact >= signBit ? 1 : 0;
      break;
    }
    case 'SUB': {
      const total = a - b - cin;
      y = ((total % modulus) + modulus) % modulus;
      cout = total < 0 ? 1 : 0;
      const exact = signed(a) - signed(b) - cin;
      v = exact < -signBit || exact >= signBit ? 1 : 0;
      break;
    }
    case 'AND':
      y = a & b;
      break;
    case 'OR':
      y = a | b;
      break;
    case 'XOR':
      y = a ^ b;
      break;
    case 'SHL':
      y = (a << amount) % modulus;
      cout = amount === 0 ? 0 : (a >> (width - amount)) & 1;
      break;
    case 'SHR':
      y = a >> amount;
      cout = amount === 0 ? 0 : (a >> (amount - 1)) & 1;
      break;
    default:
      y = ((signed(a) >> amount) + modulus) % modulus;
      cout = amount === 0 ? 0 : (a >> (amount - 1)) & 1;
  }
  return { y, cout, v, z: y === 0 ? 1 : 0, n: y >= signBit ? 1 : 0, eq: a === b ? 1 : 0, lt: a < b ? 1 : 0, gt: a > b ? 1 : 0 };
};

const expectMatchesReference = (width: number, inputs: AluInputs): void => {
  const outputs = evaluateAlu({ aluWidth: width }, inputsFor(width, inputs));
  const expected = reference(width, inputs);
  const label = `${ALU_OPERATIONS[inputs.op]} ${inputs.a},${inputs.b} cin=${inputs.cin ?? 0} @${width}`;
  expect(resultOf(outputs, width), `Y ${label}`).toBe(expected.y);
  expect(outputs.COUT, `COUT ${label}`).toBe(expected.cout);
  expect(outputs.V, `V ${label}`).toBe(expected.v);
  expect(outputs.Z, `Z ${label}`).toBe(expected.z);
  expect(outputs.N, `N ${label}`).toBe(expected.n);
  expect(outputs.EQ, `EQ ${label}`).toBe(expected.eq);
  expect(outputs.LT, `LT ${label}`).toBe(expected.lt);
  expect(outputs.GT, `GT ${label}`).toBe(expected.gt);
};

describe('ALU widths and pins', () => {
  it('offers 4, 8, and 16 bits and snaps anything else to the nearest, falling back to 4', () => {
    expect([...ALU_WIDTHS]).toEqual([4, 8, 16]);
    expect(clampAluWidth(4)).toBe(4);
    expect(clampAluWidth(8)).toBe(8);
    expect(clampAluWidth(16)).toBe(16);
    expect(clampAluWidth(5)).toBe(4);
    expect(clampAluWidth(13)).toBe(16);
    expect(clampAluWidth(999)).toBe(16);
    expect(clampAluWidth(-3)).toBe(4);
    expect(clampAluWidth('wide')).toBe(4);
    expect(clampAluWidth(Number.NaN)).toBe(4);
    expect(aluWidthOf({})).toBe(4);
    expect(aluTitle({ aluWidth: 16 })).toBe('ALU 16b');
  });

  it('shows two operand buses, a result bus, the operation code, and the flags', () => {
    const visible = getComponentPorts('ALU', { aluWidth: 8 });
    expect(visible.map((port) => port.id)).toEqual(['A', 'B', 'OP0', 'OP1', 'OP2', 'CIN', 'Y', ...ALU_FLAG_IDS]);
    expect(visible.find((port) => port.id === 'A')?.label).toBe('A[7:0]');
    expect(visible.find((port) => port.id === 'Y')?.label).toBe('Y[7:0]');
    expect(visible.find((port) => port.id === 'Y')?.direction).toBe('output');
    expect(visible.find((port) => port.id === 'A')?.direction).toBe('input');
  });

  it('keeps one hidden single pin per bit for the simulator', () => {
    for (const width of ALU_WIDTHS) {
      const single = getSimulationPorts('ALU', { aluWidth: width });
      expect(single.filter((port) => port.id.startsWith('A') && port.id.length > 1)).toHaveLength(width);
      expect(single.filter((port) => port.id.startsWith('B') && port.id.length > 1)).toHaveLength(width);
      expect(single.filter((port) => /^Y\d+$/.test(port.id))).toHaveLength(width);
      expect(single.some((port) => port.bus !== undefined)).toBe(false);
    }
  });

  it('places every pin on the body and never overlaps two visible pins', () => {
    const visible = aluPorts({ aluWidth: 16 }).filter((port) => port.hidden !== true);
    const spots = visible.map((port) => `${port.x},${port.y}`);
    expect(new Set(spots).size).toBe(spots.length);
  });

  it('is combinational logic for the truth-table generator', () => {
    expect(isCombinationalLogic('ALU')).toBe(true);
  });
});

describe('ALU arithmetic and logic', () => {
  it('matches integer arithmetic for every 4-bit operand pair, operation, and carry in', () => {
    for (let op = 0; op < 8; op += 1) {
      for (let a = 0; a < 16; a += 1) {
        for (let b = 0; b < 16; b += 1) {
          for (const cin of [0, 1] as const) expectMatchesReference(4, { a, b, op, cin });
        }
      }
    }
  });

  it('matches integer arithmetic at 8 bits across edge values and a seeded random sweep', () => {
    const edges = [0, 1, 2, 7, 8, 63, 64, 127, 128, 129, 254, 255];
    for (let op = 0; op < 8; op += 1) {
      for (const a of edges) for (const b of edges) for (const cin of [0, 1] as const) expectMatchesReference(8, { a, b, op, cin });
    }
    let seed = 20240929;
    const next = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed;
    };
    for (let count = 0; count < 800; count += 1) {
      expectMatchesReference(8, { a: next() % 256, b: next() % 256, op: next() % 8, cin: (next() % 2) as 0 | 1 });
    }
  });

  it('matches integer arithmetic at 16 bits across edge values and a seeded random sweep', () => {
    const edges = [0, 1, 255, 256, 0x7fff, 0x8000, 0x8001, 0xfffe, 0xffff];
    for (let op = 0; op < 8; op += 1) {
      for (const a of edges) for (const b of edges) for (const cin of [0, 1] as const) expectMatchesReference(16, { a, b, op, cin });
    }
    let seed = 99;
    const next = (): number => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed;
    };
    for (let count = 0; count < 800; count += 1) {
      expectMatchesReference(16, { a: next() % 65536, b: next() % 65536, op: next() % 8, cin: (next() % 2) as 0 | 1 });
    }
  });

  it('adds with a carry out and flags signed overflow', () => {
    // -4 + -4 = -8 still fits in 4 signed bits, so the carry out is set but the overflow flag is not.
    const sum = evaluateAlu({ aluWidth: 4 }, inputsFor(4, { a: 12, b: 12, op: 0 }));
    expect(resultOf(sum, 4)).toBe(8);
    expect(sum.COUT).toBe(1);
    expect(sum.V).toBe(0);
    // -7 + -7 = -14 does not fit.
    const tooFar = evaluateAlu({ aluWidth: 4 }, inputsFor(4, { a: 9, b: 9, op: 0 }));
    expect(resultOf(tooFar, 4)).toBe(2);
    expect(tooFar.V).toBe(1);
    const overflow = evaluateAlu({ aluWidth: 4 }, inputsFor(4, { a: 7, b: 1, op: 0 }));
    expect(resultOf(overflow, 4)).toBe(8);
    expect(overflow.V).toBe(1);
    expect(overflow.N).toBe(1);
  });

  it('subtracts with a borrow out when B is larger', () => {
    const borrow = evaluateAlu({ aluWidth: 4 }, inputsFor(4, { a: 3, b: 5, op: 1 }));
    expect(resultOf(borrow, 4)).toBe(14);
    expect(borrow.COUT).toBe(1);
    const clean = evaluateAlu({ aluWidth: 4 }, inputsFor(4, { a: 5, b: 3, op: 1 }));
    expect(resultOf(clean, 4)).toBe(2);
    expect(clean.COUT).toBe(0);
    const zero = evaluateAlu({ aluWidth: 4 }, inputsFor(4, { a: 6, b: 6, op: 1 }));
    expect(zero.Z).toBe(1);
    expect(zero.EQ).toBe(1);
  });

  it('shifts by the low bits of B and copies the sign for an arithmetic shift', () => {
    const left = evaluateAlu({ aluWidth: 8 }, inputsFor(8, { a: 0b00001011, b: 2, op: 5 }));
    expect(resultOf(left, 8)).toBe(0b00101100);
    const right = evaluateAlu({ aluWidth: 8 }, inputsFor(8, { a: 0b10110000, b: 4, op: 6 }));
    expect(resultOf(right, 8)).toBe(0b00001011);
    const arithmetic = evaluateAlu({ aluWidth: 8 }, inputsFor(8, { a: 0b10110000, b: 4, op: 7 }));
    expect(resultOf(arithmetic, 8)).toBe(0b11111011);
    const beyond = evaluateAlu({ aluWidth: 8 }, inputsFor(8, { a: 0b00000001, b: 0b11111000, op: 5 }));
    // Only the low three bits of B choose the amount, so 0b11111000 shifts by 0.
    expect(resultOf(beyond, 8)).toBe(1);
  });

  it('reports the bit shifted out as the carry flag', () => {
    expect(evaluateAlu({ aluWidth: 4 }, inputsFor(4, { a: 0b1001, b: 1, op: 5 })).COUT).toBe(1);
    expect(evaluateAlu({ aluWidth: 4 }, inputsFor(4, { a: 0b0001, b: 1, op: 6 })).COUT).toBe(1);
    expect(evaluateAlu({ aluWidth: 4 }, inputsFor(4, { a: 0b1001, b: 0, op: 5 })).COUT).toBe(0);
  });
});

describe('ALU with unknown inputs', () => {
  const unknownAt = (level: LogicLevel, ...pins: string[]): Record<string, LogicLevel> => {
    const inputs = inputsFor(4, { a: 0b0110, b: 0b0011, op: 0 });
    for (const pin of pins) inputs[pin] = level;
    return inputs;
  };

  it('makes every result bit unknown while the operation code is unknown, yet still compares', () => {
    const outputs = evaluateAlu({ aluWidth: 4 }, unknownAt('X', 'OP1'));
    for (let index = 0; index < 4; index += 1) expect(outputs[`Y${index}`]).toBe('X');
    expect(outputs.Z).toBe('X');
    expect(outputs.COUT).toBe('X');
    expect(outputs.GT).toBe(1);
    expect(outputs.EQ).toBe(0);
    expect(operationOf(unknownAt('Z', 'OP2'))).toBeUndefined();
    expect(operationOf(unknownAt('X'))).toBe('ADD');
  });

  it('lets an unknown bit spread only as far as a real adder would', () => {
    const outputs = evaluateAlu({ aluWidth: 4 }, unknownAt('X', 'A3'));
    // 0110 + 0011 = 1001: the bits below the unknown one are still fully determined.
    expect(outputs.Y0).toBe(1);
    expect(outputs.Y1).toBe(0);
    expect(outputs.Y2).toBe(0);
    expect(outputs.Y3).toBe('X');
  });

  it('treats a floating input like an unknown one', () => {
    const inputs = inputsFor(4, { a: 0b0111, b: 0b0001, op: 0 });
    inputs.B0 = 'Z';
    const outputs = evaluateAlu({ aluWidth: 4 }, inputs);
    for (let index = 0; index < 4; index += 1) expect(outputs[`Y${index}`]).toBe('X');
    // With A0 = 0 the carry out of bit 0 is 0 whatever B0 is, so the upper bits stay known.
    const contained = evaluateAlu({ aluWidth: 4 }, unknownAt('Z', 'B0'));
    expect(contained.Y0).toBe('X');
    expect(contained.Y1).toBe(0);
    expect(contained.Y3).toBe(1);
  });

  it('keeps a known 0 dominant in AND and a known 1 dominant in OR', () => {
    const and = inputsFor(4, { a: 0b0000, b: 0b1111, op: 2 });
    and.A0 = 0;
    and.B0 = 'X';
    expect(evaluateAlu({ aluWidth: 4 }, and).Y0).toBe(0);
    const or = inputsFor(4, { a: 0b0001, b: 0b0000, op: 3 });
    or.B0 = 'X';
    expect(evaluateAlu({ aluWidth: 4 }, or).Y0).toBe(1);
  });

  it('leaves a shift unknown only when its amount is unknown', () => {
    const shifted = inputsFor(4, { a: 0b0011, b: 1, op: 5 });
    expect(resultOf(evaluateAlu({ aluWidth: 4 }, shifted), 4)).toBe(0b0110);
    shifted.B0 = 'X';
    const outputs = evaluateAlu({ aluWidth: 4 }, shifted);
    for (let index = 0; index < 4; index += 1) expect(outputs[`Y${index}`]).toBe('X');
    // An unknown high bit of B does not choose the amount at 4 bits (only two bits do).
    const high = inputsFor(4, { a: 0b0011, b: 1, op: 5 });
    high.B3 = 'X';
    expect(resultOf(evaluateAlu({ aluWidth: 4 }, high), 4)).toBe(0b0110);
  });

  it('decides a comparison from the highest differing bit even when a lower bit is unknown', () => {
    const inputs = inputsFor(4, { a: 0b1000, b: 0b0111, op: 0 });
    inputs.A0 = 'X';
    const decided = evaluateAlu({ aluWidth: 4 }, inputs);
    expect(decided.GT).toBe(1);
    expect(decided.LT).toBe(0);
    expect(decided.EQ).toBe(0);
    const open = inputsFor(4, { a: 0b0100, b: 0b0100, op: 0 });
    open.B2 = 'X';
    const undecided = evaluateAlu({ aluWidth: 4 }, open);
    expect(undecided.EQ).toBe('X');
    expect(undecided.LT).toBe('X');
    expect(undecided.GT).toBe('X');
  });

  it('reports an all-zero result as zero, any set bit as not zero, and an unknown one as unknown', () => {
    expect(evaluateAlu({ aluWidth: 4 }, inputsFor(4, { a: 5, b: 5, op: 4 })).Z).toBe(1);
    expect(evaluateAlu({ aluWidth: 4 }, inputsFor(4, { a: 5, b: 4, op: 4 })).Z).toBe(0);
    const inputs = inputsFor(4, { a: 5, b: 5, op: 4 });
    inputs.A0 = 'X';
    expect(evaluateAlu({ aluWidth: 4 }, inputs).Z).toBe('X');
    const nonZero = inputsFor(4, { a: 0b1000, b: 0, op: 3 });
    nonZero.A0 = 'X';
    expect(evaluateAlu({ aluWidth: 4 }, nonZero).Z).toBe(0);
  });
});

describe('ALU in a circuit', () => {
  interface Rig {
    readonly doc: LogicDocument;
    readonly alu: string;
    readonly a: readonly string[];
    readonly b: readonly string[];
    readonly op: readonly string[];
    readonly cin: string;
  }

  const lastId = (doc: LogicDocument): string => doc.components[doc.components.length - 1]!.id;

  /** Switches feed each operand through a bus splitter into the ALU's operand buses, so the whole bus path is exercised. */
  const buildRig = (width: number): Rig => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'ALU', 20, 0);
    const alu = lastId(doc);
    doc = updateComponentParams(doc, alu, { aluWidth: width });
    const operand = (x: number, portId: 'A' | 'B'): string[] => {
      doc = addComponent(doc, 'BUS_SPLITTER', x, portId === 'A' ? 0 : 20);
      const split = lastId(doc);
      doc = updateComponentParams(doc, split, { busWidth: width });
      const switches: string[] = [];
      for (let index = 0; index < width; index += 1) {
        doc = addComponent(doc, 'SWITCH', x + 6, (portId === 'A' ? 0 : 20) + index * 2);
        switches.push(lastId(doc));
        doc = addWire(doc, { componentId: lastId(doc), portId: 'Y' }, { componentId: split, portId: `S${index}` });
      }
      doc = addWire(doc, { componentId: split, portId: 'B' }, { componentId: alu, portId });
      return switches;
    };
    const a = operand(0, 'A');
    const b = operand(0, 'B');
    const op: string[] = [];
    for (let index = 0; index < 3; index += 1) {
      doc = addComponent(doc, 'SWITCH', 14, 40 + index * 2);
      op.push(lastId(doc));
      doc = addWire(doc, { componentId: lastId(doc), portId: 'Y' }, { componentId: alu, portId: `OP${index}` });
    }
    doc = addComponent(doc, 'SWITCH', 14, 48);
    const cin = lastId(doc);
    doc = addWire(doc, { componentId: cin, portId: 'Y' }, { componentId: alu, portId: 'CIN' });
    return { doc, alu, a, b, op, cin };
  };

  const drive = (rig: Rig, width: number, { a, b, op, cin = 0 }: AluInputs) => {
    const interactions: Record<string, LogicLevel> = {};
    bitsOf(a, width).forEach((level, index) => {
      interactions[rig.a[index]!] = level;
    });
    bitsOf(b, width).forEach((level, index) => {
      interactions[rig.b[index]!] = level;
    });
    bitsOf(op, 3).forEach((level, index) => {
      interactions[rig.op[index]!] = level;
    });
    interactions[rig.cin] = cin;
    return step({ document: rig.doc, previous: createInitialFrame(rig.doc), elapsedMs: 16, interactions });
  };

  it('adds and subtracts through splitters and operand buses', () => {
    const rig = buildRig(4);
    let frame = drive(rig, 4, { a: 5, b: 6, op: 0 });
    const read = (id: string): LogicLevel => readLevel(frame, rig.alu, id);
    expect([0, 1, 2, 3].map((index) => read(`Y${index}`))).toEqual(bitsOf(11, 4));
    expect(read('COUT')).toBe(0);
    expect(read('LT')).toBe(1);
    frame = drive(rig, 4, { a: 5, b: 6, op: 1 });
    expect([0, 1, 2, 3].map((index) => read(`Y${index}`))).toEqual(bitsOf(15, 4));
    expect(read('COUT')).toBe(1);
  });

  it('carries a 16-bit computation across the whole bus', () => {
    const rig = buildRig(16);
    const frame = drive(rig, 16, { a: 0x1234, b: 0x0fcd, op: 0 });
    const read = (id: string): LogicLevel => readLevel(frame, rig.alu, id);
    expect(Array.from({ length: 16 }, (_, index) => read(`Y${index}`))).toEqual(bitsOf(0x1234 + 0x0fcd, 16));
  });

  it('reports an ALU with unwired inputs in the electrical rule check, naming the pin', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'ALU', 0, 0);
    const findings = runElectricalRuleCheck(doc);
    expect(findings.some((finding) => finding.message.includes('CIN'))).toBe(true);
    expect(findings.some((finding) => finding.message.includes('OP0'))).toBe(true);
  });

  it('survives a save and load with its width', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'ALU', 0, 0);
    doc = updateComponentParams(doc, lastId(doc), { aluWidth: 16 });
    const restored = parseProject(serializeProject(doc));
    expect(restored.components[0]?.params.aluWidth).toBe(16);
    expect(getComponentPorts('ALU', restored.components[0]!.params as ComponentParams).find((port) => port.id === 'A')?.label).toBe('A[15:0]');
  });

  it('snaps a hostile width from a hand-edited update', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'ALU', 0, 0);
    expect(updateComponentParams(doc, lastId(doc), { aluWidth: 13 }).components[0]?.params.aluWidth).toBe(16);
    expect(updateComponentParams(doc, lastId(doc), { aluWidth: 12 }).components[0]?.params.aluWidth).toBe(8);
    expect(updateComponentParams(doc, lastId(doc), { aluWidth: 2 }).components[0]?.params.aluWidth).toBe(4);
  });

  it('draws its caption and bus labels in the SVG export', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'ALU', 2, 2);
    doc = updateComponentParams(doc, lastId(doc), { aluWidth: 8 });
    const svg = renderSchematicSvg(doc);
    expect(svg).toContain('ALU 8b');
    expect(svg).toContain('A[7:0]');
    expect(svg).toContain('Y[7:0]');
    expect(svg).not.toContain('NaN');
  });
});

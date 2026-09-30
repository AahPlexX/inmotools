import { describe, expect, it } from 'vitest';
import { addComponent, addWire, createInitialDocument, relabelComponent, updateComponentParams } from '../../src/tools/logic/circuit-model';
import { exportEdif } from '../../src/tools/logic/edif-export';
import { exportKicadNetlist } from '../../src/tools/logic/kicad-export';
import type { ComponentType, LogicDocument } from '../../src/tools/logic/logic-types';
import { exportSpice } from '../../src/tools/logic/spice-export';

class Builder {
  doc: LogicDocument;
  private x = 0;
  constructor(title: string) {
    this.doc = createInitialDocument(title);
  }

  add(type: ComponentType, label: string, params: Record<string, unknown> = {}): string {
    this.doc = addComponent(this.doc, type, this.x, 0);
    this.x += 12;
    const id = this.doc.components[this.doc.components.length - 1]!.id;
    this.doc = relabelComponent(this.doc, id, label);
    if (Object.keys(params).length > 0) this.doc = updateComponentParams(this.doc, id, params);
    return id;
  }

  wire(from: string, fromPort: string, to: string, toPort: string): void {
    this.doc = addWire(this.doc, { componentId: from, portId: fromPort }, { componentId: to, portId: toPort });
  }
}

/** Two switches into an XOR and an AND, a D flip-flop on the side, and a clock. */
const sample = (): LogicDocument => {
  const b = new Builder('Half adder');
  const a = b.add('SWITCH', 'A');
  const bb = b.add('SWITCH', 'B', { initialLevel: 1 });
  const xor = b.add('XOR', 'X1');
  const and = b.add('AND', 'G1');
  const sum = b.add('LED', 'SUM');
  const carry = b.add('LED', 'COUT');
  const clock = b.add('CLOCK', 'CK', { frequencyHz: 2 });
  const flop = b.add('D_FLIP_FLOP', 'ff');
  b.wire(a, 'Y', xor, 'A');
  b.wire(bb, 'Y', xor, 'B');
  b.wire(a, 'Y', and, 'A');
  b.wire(bb, 'Y', and, 'B');
  b.wire(xor, 'Y', sum, 'A');
  b.wire(and, 'Y', carry, 'A');
  b.wire(clock, 'Y', flop, 'CLK');
  b.wire(a, 'Y', flop, 'D');
  return b.doc;
};

const balanced = (text: string): boolean => {
  let depth = 0;
  let inString = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!;
    if (inString) {
      if (character === '\\') index += 1;
      else if (character === '"') inString = false;
    } else if (character === '"') inString = true;
    else if (character === '(') depth += 1;
    else if (character === ')') {
      depth -= 1;
      if (depth < 0) return false;
    }
  }
  return depth === 0 && !inString;
};

const FIXED = new Date(2026, 8, 29, 12, 30, 45);

describe('SPICE export', () => {
  it('writes each gate as a subcircuit, the inputs as sources, and the circuit as instances', () => {
    const { text } = exportSpice(sample());
    expect(text.startsWith('* Half adder')).toBe(true);
    expect(text).toContain('.param vdd=5');
    expect(text).toContain('.subckt LW_XOR2 a0 a1 y');
    expect(text).toContain('.subckt LW_AND2 a0 a1 y');
    expect(text).toContain('VSW1 A 0 DC 0');
    expect(text).toContain('VSW2 B 0 DC {vdd}');
    expect(text).toContain('XU1 A B SUM LW_XOR2');
    expect(text).toContain('XU2 A B COUT LW_AND2');
    expect(text).toContain('PULSE(0 {vdd} 0 1n 1n 0.25 0.5)');
    expect(text.trimEnd().endsWith('.end')).toBe(true);
    // One subcircuit per kind, however many instances use it.
    expect(text.match(/^\.subckt /gm)).toHaveLength(2);
  });

  it('names a part that holds state, leaves it out, and still writes a solvable netlist', () => {
    const { text, warnings } = exportSpice(sample());
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('ff');
    expect(warnings[0]).toContain('state');
    expect(text).not.toContain('D_FLIP');
    expect(text).toContain('.options rshunt=1e12');
  });

  it('uses the supply it is given', () => {
    expect(exportSpice(sample(), { supply: 3.3 }).text).toContain('.param vdd=3.3');
  });

  it('writes a switch that starts closed, an input bus bit by bit, and a tri-state buffer with a switch', () => {
    const b = new Builder('Bus');
    b.add('PORT_IN', 'data', { signalWidth: 4, portValue: 0b0101 });
    b.add('SWITCH', 'a');
    b.add('SWITCH', 'en');
    b.add('TRI_BUFFER', 'tri');
    b.wire('a', 'Y', 'tri', 'A');
    const { text } = exportSpice(b.doc);
    expect(text).toContain('DC {vdd}');
    expect(text).toContain('.subckt LW_TRI a en y');
    expect(text).toContain('S1 m y en 0 LW_SW');
  });

  it('writes blocks as behavioral subcircuits sized to the part', () => {
    const b = new Builder('Blocks');
    b.add('MUX', 'm', { selectBits: 3, hasEnable: true });
    b.add('DECODER', 'd', { selectBits: 2, activeHigh: false });
    b.add('PRIORITY_ENCODER', 'e', { selectBits: 3 });
    b.add('BCD_7SEG', 'b');
    const { text } = exportSpice(b.doc);
    expect(text).toContain('.subckt LW_MUX8_EN d0 d1 d2 d3 d4 d5 d6 d7 s0 s1 s2 en y');
    expect(text).toContain('.subckt LW_DEC4_N a0 a1 y0 y1 y2 y3');
    expect(text).toContain('.subckt LW_ENC8 i0 i1 i2 i3 i4 i5 i6 i7 y0 y1 y2 v');
    expect(text).toContain('.subckt LW_BCD d0 d1 d2 d3 a b c d e f g');
  });

  it('warns about the arithmetic unit and memories', () => {
    const b = new Builder('Big');
    b.add('ALU', 'alu');
    b.add('ROM', 'rom');
    b.add('COUNTER', 'cnt');
    expect(exportSpice(b.doc).warnings).toHaveLength(3);
  });
});

describe('KiCad netlist export', () => {
  it('writes the s-expression export with components, library parts, and nets', () => {
    const { text, warnings } = exportKicadNetlist(sample(), { date: FIXED });
    expect(warnings).toEqual([]);
    expect(text.startsWith('(export (version D)')).toBe(true);
    expect(text).toContain('(date "2026-09-29 12:30:45")');
    expect(text).toContain('(comp (ref "U1")');
    expect(text).toContain('(value "X1")');
    expect(text).toContain('(libsource (lib "inmo_logic") (part "XOR"))');
    expect(text).toContain('(libpart (lib "inmo_logic") (part "XOR")');
    expect(text).toContain('(pin (num "Y") (name "Y") (type output))');
    expect(text).toMatch(/\(net \(code \d+\) \(name "A"\)/);
    expect(text).toContain('(node (ref "SW1") (pin "Y"))');
    expect(balanced(text)).toBe(true);
  });

  it('names a net that reaches one pin the way KiCad does', () => {
    expect(exportKicadNetlist(sample(), { date: FIXED }).text).toMatch(/\(name "unconnected-\(U3-SET\)"\)/);
  });

  it('keeps a 2-input and a 3-input gate as separate library parts', () => {
    const b = new Builder('Gates');
    b.add('AND', 'two');
    b.add('AND', 'three', { inputCount: 3 });
    const { text } = exportKicadNetlist(b.doc, { date: FIXED });
    expect(text).toContain('(part "AND")');
    expect(text).toContain('(part "AND_2")');
  });

  it('quotes and escapes what is not a plain word', () => {
    const b = new Builder('Quote "me"');
    b.add('AND', 'a "b" c');
    const { text } = exportKicadNetlist(b.doc, { date: FIXED });
    expect(text).toContain('(value "a \\"b\\" c")');
    expect(text).toContain('(source "Quote \\"me\\".circuit.json")');
    expect(balanced(text)).toBe(true);
  });
});

describe('EDIF export', () => {
  it('writes an EDIF 2 0 0 file: a cell per kind of part, the circuit, and the design', () => {
    const { text, warnings } = exportEdif(sample(), { date: FIXED });
    expect(warnings).toEqual([]);
    expect(text.startsWith('(edif Half_adder')).toBe(true);
    expect(text).toContain('(edifVersion 2 0 0)');
    expect(text).toContain('(timeStamp 2026 9 29 12 30 45)');
    expect(text).toContain('(cell XOR (cellType GENERIC)');
    expect(text).toContain('(port A (direction INPUT))');
    expect(text).toContain('(port Y (direction OUTPUT))');
    expect(text).toContain('(cell Half_adder (cellType GENERIC)');
    expect(text).toContain('(instance U1 (viewRef netlist (cellRef XOR (libraryRef INMO_LOGIC)))');
    expect(text).toContain('(net A (joined (portRef A) (portRef Y (instanceRef SW1))');
    expect(text).toContain('(design Half_adder (cellRef Half_adder (libraryRef INMO_LOGIC)))');
    expect(balanced(text)).toBe(true);
  });

  it('joins an output port to the net it shows, and every part pin appears on exactly one net', () => {
    const { text } = exportEdif(sample(), { date: FIXED });
    expect(text).toContain('(net SUM (joined (portRef SUM) (portRef Y (instanceRef U1)) (portRef A (instanceRef D1))))');
    const refs = [...text.matchAll(/\(portRef (\w+) \(instanceRef (\w+)\)\)/g)].map((match) => `${match[2]}.${match[1]}`);
    expect(new Set(refs).size).toBe(refs.length);
  });

  it('writes a bus port as one port per bit and keeps the original name with a rename', () => {
    const b = new Builder('Bus');
    const port = b.add('PORT_IN', 'data', { signalWidth: 3 });
    const out = b.add('PORT_OUT', 'result', { signalWidth: 3 });
    b.wire(port, 'Y', out, 'A');
    const { text } = exportEdif(b.doc, { date: FIXED });
    expect(text).toContain('(port (rename data_1 "data[1]") (direction INPUT))');
    expect(text).toContain('(port (rename result_2 "result[2]") (direction OUTPUT))');
    expect(balanced(text)).toBe(true);
  });

  it('carries the author and description and strips quotes from strings', () => {
    let doc = sample();
    doc = { ...doc, metadata: { ...doc.metadata, author: 'Ada "the" First', description: 'Adds\nbits' } };
    const { text } = exportEdif(doc, { date: FIXED });
    expect(text).toContain("(author \"Ada 'the' First\")");
    expect(text).toContain('(comment "Adds bits")');
    expect(balanced(text)).toBe(true);
  });
});

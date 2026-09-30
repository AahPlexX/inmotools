import { describe, expect, it } from 'vitest';
import { addComponent, addWire, createInitialDocument, relabelComponent, updateComponentParams } from '../../src/tools/logic/circuit-model';
import { bomToCsv, bomToJson, buildBom, pinAllocationToCsv, type Bom } from '../../src/tools/logic/bom-engine';
import { D_FLIP_FLOP_IC, findGateIc, GATE_ICS } from '../../src/tools/logic/ic-catalog';
import type { ComponentType, LogicDocument } from '../../src/tools/logic/logic-types';
import { encapsulateSelection } from '../../src/tools/logic/subcircuit-engine';

class Builder {
  doc: LogicDocument;
  constructor(title = 'Circuit') {
    this.doc = createInitialDocument(title);
  }

  add(type: ComponentType, label: string, params: Record<string, unknown> = {}): string {
    this.doc = addComponent(this.doc, type, 0, 0);
    const id = this.doc.components[this.doc.components.length - 1]!.id;
    this.doc = relabelComponent(this.doc, id, label);
    if (Object.keys(params).length > 0) this.doc = updateComponentParams(this.doc, id, params);
    return id;
  }

  gates(type: ComponentType, count: number, params: Record<string, unknown> = {}): string[] {
    return Array.from({ length: count }, (_, index) => this.add(type, `${type}${index + 1}`, params));
  }
}

const lineFor = (bom: Bom, part: string) => bom.lines.find((line) => line.part === part);

describe('the IC catalog', () => {
  it('has a complete pin table: every input and output pin is distinct and none clashes with power', () => {
    for (const ic of GATE_ICS) {
      const used = ic.units.flatMap((unit) => [...unit.inputs, unit.output]);
      expect(new Set(used).size, ic.part).toBe(used.length);
      for (const pin of used) {
        expect(pin, ic.part).toBeGreaterThanOrEqual(1);
        expect(pin, ic.part).toBeLessThanOrEqual(14);
        expect(pin, ic.part).not.toBe(ic.vcc);
        expect(pin, ic.part).not.toBe(ic.gnd);
        expect(ic.noConnect, ic.part).not.toContain(pin);
      }
    }
  });

  it('accounts for all 14 pins of each gate package', () => {
    for (const ic of GATE_ICS) {
      const used = new Set([...ic.units.flatMap((unit) => [...unit.inputs, unit.output]), ic.vcc, ic.gnd, ...ic.noConnect]);
      expect(used.size, `${ic.part} pins`).toBe(14);
    }
  });

  it('finds a package by function and input count', () => {
    expect(findGateIc('NAND', 2)?.part).toBe('7400');
    expect(findGateIc('NOR', 2)?.part).toBe('7402');
    expect(findGateIc('NOT', 1)?.part).toBe('7404');
    expect(findGateIc('AND', 2)?.part).toBe('7408');
    expect(findGateIc('OR', 2)?.part).toBe('7432');
    expect(findGateIc('XOR', 2)?.part).toBe('7486');
    expect(findGateIc('NAND', 3)?.part).toBe('7410');
    expect(findGateIc('AND', 3)?.part).toBe('7411');
    expect(findGateIc('NOR', 3)?.part).toBe('7427');
    expect(findGateIc('NAND', 4)?.part).toBe('7420');
    expect(findGateIc('AND', 4)?.part).toBe('7421');
    expect(findGateIc('NAND', 8)?.part).toBe('7430');
    expect(findGateIc('OR', 3)).toBeUndefined();
    expect(findGateIc('XOR', 3)).toBeUndefined();
  });

  it('keeps the datasheet quirks: the 7400 gate 3 inputs and the 7427 gate 3 inputs', () => {
    expect(findGateIc('NAND', 2)!.units[2]).toEqual({ inputs: [10, 9], output: 8 });
    expect(findGateIc('NOR', 3)!.units[2]).toEqual({ inputs: [9, 11, 10], output: 8 });
    expect(findGateIc('NOR', 2)!.units[0]).toEqual({ inputs: [2, 3], output: 1 });
    expect(D_FLIP_FLOP_IC.units[1]).toMatchObject({ d: 12, clock: 11, preset: 10, clear: 13, q: 9, qn: 8 });
  });
});

describe('gates', () => {
  it('puts four 2-input NANDs in one 7400 and a fifth in a second package', () => {
    const b = new Builder();
    b.gates('NAND', 5);
    const bom = buildBom(b.doc);
    const line = lineFor(bom, '7400')!;
    expect(line.quantity).toBe(2);
    expect(line.references).toEqual(['IC1', 'IC2']);
    expect(line.package).toBe('DIP-14');
    const first = bom.allocations[0]!;
    expect(first).toMatchObject({ ref: 'U1', part: '7400', package: 'IC1', unit: 1, kind: 'direct' });
    expect(first.pins).toEqual([{ signal: 'A', pin: 1 }, { signal: 'B', pin: 2 }, { signal: 'Y', pin: 3 }]);
    expect(bom.allocations[2]!.pins).toEqual([{ signal: 'A', pin: 10 }, { signal: 'B', pin: 9 }, { signal: 'Y', pin: 8 }]);
    expect(bom.allocations[4]).toMatchObject({ package: 'IC2', unit: 1 });
    // Three gates of the second package are unused.
    expect(bom.spareUnits.filter((unit) => unit.package === 'IC2').map((unit) => unit.unit)).toEqual([2, 3, 4]);
    expect(bom.spareUnits[0]!.inputPins).toEqual([4, 5]);
    expect(bom.notes.join(' ')).toContain('unused gate');
  });

  it('matches each 2-input gate to its classic package', () => {
    const b = new Builder();
    for (const type of ['AND', 'OR', 'NAND', 'NOR', 'XOR'] as const) b.add(type, type);
    b.add('NOT', 'inv');
    const parts = buildBom(b.doc).lines.map((line) => line.part);
    expect(parts).toEqual(expect.arrayContaining(['7408', '7432', '7400', '7402', '7486', '7404']));
  });

  it('uses the package with that many inputs when there is one', () => {
    const b = new Builder();
    b.add('NAND', 'n3', { inputCount: 3 });
    b.add('AND', 'a4', { inputCount: 4 });
    b.add('NAND', 'n8', { inputCount: 8 });
    const bom = buildBom(b.doc);
    expect(lineFor(bom, '7410')?.quantity).toBe(1);
    expect(lineFor(bom, '7421')?.quantity).toBe(1);
    expect(lineFor(bom, '7430')?.quantity).toBe(1);
    const eight = bom.allocations.find((allocation) => allocation.part === '7430')!;
    expect(eight.pins.map((pin) => pin.pin)).toEqual([1, 2, 3, 4, 5, 6, 11, 12, 8]);
  });

  it('breaks a gate with no single package into 2-input gates', () => {
    const b = new Builder();
    b.add('OR', 'or3', { inputCount: 3 });
    b.add('XNOR', 'xn', { inputCount: 2 });
    b.add('NOR', 'nor4', { inputCount: 4 });
    const bom = buildBom(b.doc);
    const decomposed = bom.allocations.filter((allocation) => allocation.kind === 'decomposed');
    // OR3 = 2 OR2; XNOR2 = XOR2 + NOT; NOR4 = 2 OR2 + 1 NOR2.
    expect(decomposed.filter((allocation) => allocation.ref === 'U1')).toHaveLength(2);
    expect(decomposed.filter((allocation) => allocation.ref === 'U2').map((allocation) => allocation.part).sort()).toEqual(['7404', '7486']);
    expect(decomposed.filter((allocation) => allocation.ref === 'U3').map((allocation) => allocation.part).sort()).toEqual(['7402', '7432', '7432']);
    expect(decomposed[0]!.notes[0]).toContain('built from 2-input gates');
    expect(decomposed[0]!.pins.map((pin) => pin.signal)).toEqual(['in1', 'in2', 'out']);
  });

  it('shares a package between direct gates and pieces of a decomposed one', () => {
    const b = new Builder();
    b.add('OR', 'plain');
    b.add('OR', 'wide', { inputCount: 3 });
    const line = lineFor(buildBom(b.doc), '7432')!;
    expect(line.quantity).toBe(1);
  });

  it('gives a buffer and a tri-state buffer a 74125, with the enable note', () => {
    const b = new Builder();
    b.add('BUFFER', 'buf');
    b.add('TRI_BUFFER', 'tri');
    const bom = buildBom(b.doc);
    expect(lineFor(bom, '74125')?.quantity).toBe(1);
    const tri = bom.allocations.find((allocation) => allocation.ref === 'U2')!;
    expect(tri.pins).toEqual([{ signal: 'A', pin: 5 }, { signal: 'EN (to OE, inverted)', pin: 4 }, { signal: 'Y', pin: 6 }]);
    expect(tri.notes.join(' ')).toContain('active high');
    expect(bom.allocations.find((allocation) => allocation.ref === 'U1')!.notes.join(' ')).toContain('ground');
  });

  it('counts a NOT six to a 7404', () => {
    const b = new Builder();
    b.gates('NOT', 7);
    const line = lineFor(buildBom(b.doc), '7404')!;
    expect(line.quantity).toBe(2);
  });
});

describe('flip-flops and blocks', () => {
  it('places D flip-flops two to a 7474 with the preset and clear pins', () => {
    const b = new Builder();
    b.gates('D_FLIP_FLOP', 3);
    const bom = buildBom(b.doc);
    expect(lineFor(bom, '7474')?.quantity).toBe(2);
    expect(bom.allocations[0]!.pins).toEqual([
      { signal: 'D', pin: 2 },
      { signal: 'CLK', pin: 3 },
      { signal: 'SET (to PRE, active low)', pin: 4 },
      { signal: 'RST (to CLR, active low)', pin: 1 },
      { signal: 'Q', pin: 5 },
      { signal: 'QN', pin: 6 },
    ]);
    expect(bom.allocations[1]!.pins[0]).toEqual({ signal: 'D', pin: 12 });
    expect(bom.spareUnits).toEqual([{ package: 'IC2', part: '7474', unit: 2, inputPins: [12, 11, 10, 13] }]);
  });

  it('matches multiplexers, decoders, encoders and display drivers to classic parts', () => {
    const b = new Builder();
    b.add('MUX', 'm4', { selectBits: 2 });
    b.add('MUX', 'm8', { selectBits: 3 });
    b.add('DECODER', 'd8', { selectBits: 3 });
    b.add('DEMUX', 'dm4', { selectBits: 2 });
    b.add('PRIORITY_ENCODER', 'pe', { selectBits: 3 });
    b.add('BCD_7SEG', 'ca', { activeHigh: false });
    b.add('BCD_7SEG', 'cc', { activeHigh: true });
    const parts = buildBom(b.doc).lines.map((line) => line.part);
    expect(parts).toEqual(expect.arrayContaining(['74153', '74151', '74138', '74139', '74148', '7447', '7448']));
  });

  it('cascades counters and sizes registers and the ALU', () => {
    const b = new Builder();
    b.add('COUNTER', 'c8', { bitWidth: 8 });
    b.add('COUNTER', 'cd', { bitWidth: 4, countDown: true });
    b.add('COUNTER', 'cr', { bitWidth: 4, asyncRipple: true });
    b.add('REGISTER', 'r4', { bitWidth: 4 });
    b.add('REGISTER', 'r8', { bitWidth: 8 });
    b.add('ALU', 'alu', { aluWidth: 16 });
    const bom = buildBom(b.doc);
    expect(lineFor(bom, '74161')?.quantity).toBe(2);
    expect(lineFor(bom, '74191')?.quantity).toBe(1);
    expect(lineFor(bom, '7493')?.quantity).toBe(1);
    expect(lineFor(bom, '74175')?.quantity).toBe(1);
    expect(lineFor(bom, '74273')?.quantity).toBe(1);
    expect(lineFor(bom, '74181')?.quantity).toBe(4);
    expect(lineFor(bom, '74181')?.notes.join(' ')).toContain('74182');
  });

  it('picks the smallest memory that holds the address space and says how to wire the rest', () => {
    const b = new Builder();
    b.add('RAM', 'small', { addressBits: 8, dataBits: 8 });
    b.add('ROM', 'wide', { addressBits: 13, dataBits: 16 });
    b.add('ROM', 'huge', { addressBits: 32, dataBits: 8 });
    const bom = buildBom(b.doc);
    expect(lineFor(bom, '6116')?.notes.join(' ')).toContain('Tie the unused upper address lines (A8 and up) low');
    expect(lineFor(bom, '2764')?.quantity).toBe(2);
    expect(bom.notes.join(' ')).toContain('huge');
    expect(bom.notes.join(' ')).toContain('no single classic');
  });

  it('numbers every package once, in part order', () => {
    const b = new Builder();
    b.add('NAND', 'n');
    b.add('AND', 'a');
    b.add('D_FLIP_FLOP', 'f');
    b.add('MUX', 'm');
    const designators = buildBom(b.doc).lines.flatMap((line) => line.references.filter((ref) => ref.startsWith('IC')));
    expect(new Set(designators).size).toBe(designators.length);
    expect([...designators].sort((a, c) => Number(a.slice(2)) - Number(c.slice(2)))).toEqual(designators.map((_, index) => `IC${index + 1}`));
  });
});

describe('the rest of the parts', () => {
  it('lists switches, LEDs with their resistors, and decoupling capacitors', () => {
    const b = new Builder();
    b.gates('SWITCH', 2);
    b.gates('LED', 3);
    b.add('NAND', 'n');
    b.add('CLOCK', 'ck');
    const bom = buildBom(b.doc);
    expect(lineFor(bom, 'SPST toggle switch')).toMatchObject({ quantity: 2, references: ['SW1', 'SW2'] });
    expect(lineFor(bom, 'LED')).toMatchObject({ quantity: 3, references: ['D1', 'D2', 'D3'] });
    expect(lineFor(bom, 'Resistor')).toMatchObject({ quantity: 3 });
    expect(lineFor(bom, '0.1 uF capacitor')).toMatchObject({ quantity: 1 });
    expect(lineFor(bom, 'Clock source')?.quantity).toBe(1);
  });

  it('counts each kind of part', () => {
    const b = new Builder();
    b.gates('NAND', 3);
    b.add('NAND', 'wide', { inputCount: 3 });
    b.add('NOT', 'inv');
    b.add('D_FLIP_FLOP', 'f');
    const { counts, totals } = buildBom(b.doc);
    expect(counts['NAND (2 inputs)']).toBe(3);
    expect(counts['NAND (3 inputs)']).toBe(1);
    expect(counts.NOT).toBe(1);
    expect(counts.D_FLIP_FLOP).toBe(1);
    expect(totals.parts).toBe(6);
    expect(totals.ics).toBe(4);
  });

  it('expands a subcircuit so its gates are counted', () => {
    const b = new Builder('Wrapped');
    const ids = b.gates('NAND', 2);
    const grouped = encapsulateSelection(b.doc, ids, 'Pair');
    if (!grouped.ok) throw new Error(grouped.reason);
    const bom = buildBom(grouped.document);
    expect(lineFor(bom, '7400')?.quantity).toBe(1);
    expect(bom.allocations).toHaveLength(2);
    expect(bom.allocations[0]!.label).toBe('Pair/NAND1');
  });

  it('handles an empty circuit', () => {
    const bom = buildBom(createInitialDocument('Empty'));
    expect(bom.lines).toEqual([]);
    expect(bom.totals).toEqual({ parts: 0, ics: 0 });
  });
});

describe('text formats', () => {
  const sample = (): Bom => {
    const b = new Builder('Sample, "quoted"');
    b.gates('NAND', 2);
    b.add('LED', 'a,b');
    return buildBom(b.doc);
  };

  it('writes the list as CSV with the references in one cell', () => {
    const csv = bomToCsv(sample());
    const rows = csv.split('\n');
    expect(rows[0]).toBe('Item,Part,Description,Package,Quantity,References,Notes');
    expect(rows[1]).toMatch(/^1,7400,Quad 2-input NAND,DIP-14,1,IC1,/);
    expect(csv).toContain('LED');
  });

  it('quotes a cell with a comma or a quote', () => {
    const b = new Builder();
    b.add('RAM', 'r', { addressBits: 8, dataBits: 8 });
    const csv = bomToCsv(buildBom(b.doc));
    expect(csv).toContain('"');
    // Every row has the same number of cells once quoting is honored.
    const columns = (row: string): number => row.match(/(?:^|,)("(?:[^"]|"")*"|[^,]*)/g)!.length;
    const rows = csv.split('\n');
    expect(new Set(rows.map(columns)).size).toBe(1);
  });

  it('writes the pin allocation as one row per signal', () => {
    const csv = pinAllocationToCsv(sample());
    const rows = csv.split('\n');
    expect(rows[0]).toBe('Reference,Label,Kind,Part,Package,Unit,Signal,Pin');
    expect(rows[1]).toBe('U1,NAND1,direct,7400,IC1,1,A,1');
    expect(rows).toHaveLength(1 + 3 * 2);
  });

  it('writes the whole list as JSON that reads back the same', () => {
    const bom = sample();
    expect(JSON.parse(bomToJson(bom))).toEqual(JSON.parse(JSON.stringify(bom)));
    expect(JSON.parse(bomToJson(bom)).lines[0].part).toBe('7400');
  });
});

import { describe, expect, it } from 'vitest';
import { addComponent, addWire, createInitialDocument, relabelComponent, updateComponentParams } from '../../src/tools/logic/circuit-model';
import type { ComponentType, LogicDocument } from '../../src/tools/logic/logic-types';
import { buildNetlist, netExpression, pinNetOf, sanitizeIdentifier } from '../../src/tools/logic/netlist-engine';
import { encapsulateSelection } from '../../src/tools/logic/subcircuit-engine';

class Builder {
  doc: LogicDocument;
  private x = 0;
  constructor(title = 'Circuit') {
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

const halfAdder = () => {
  const b = new Builder('Half adder');
  const a = b.add('SWITCH', 'A');
  const bb = b.add('SWITCH', 'B');
  const xor = b.add('XOR', 'X1');
  const and = b.add('AND', 'G1');
  const sum = b.add('LED', 'SUM');
  const carry = b.add('LED', 'COUT');
  b.wire(a, 'Y', xor, 'A');
  b.wire(bb, 'Y', xor, 'B');
  b.wire(a, 'Y', and, 'A');
  b.wire(bb, 'Y', and, 'B');
  b.wire(xor, 'Y', sum, 'A');
  b.wire(and, 'Y', carry, 'A');
  return { b, a, bb, xor, and, sum, carry };
};

describe('identifiers', () => {
  it('makes text legal in both Verilog and VHDL', () => {
    expect(sanitizeIdentifier('Half adder')).toBe('Half_adder');
    expect(sanitizeIdentifier('a--b  c')).toBe('a_b_c');
    expect(sanitizeIdentifier('__x__')).toBe('x');
    expect(sanitizeIdentifier('1st')).toBe('n_1st');
    expect(sanitizeIdentifier('')).toBe('n');
    expect(sanitizeIdentifier('   ', 'in')).toBe('in_s');
    expect(sanitizeIdentifier('   ', 'sig')).toBe('sig');
    expect(sanitizeIdentifier('naïve café')).toMatch(/^[A-Za-z][A-Za-z0-9_]*$/);
    expect(sanitizeIdentifier('日本語', 'sig')).toBe('sig');
  });

  it('avoids reserved words of either language, whatever their case', () => {
    for (const word of ['module', 'wire', 'and', 'xor', 'signal', 'entity', 'in', 'out', 'begin', 'End', 'PORT']) {
      const name = sanitizeIdentifier(word);
      expect(name.toLowerCase()).not.toBe(word.toLowerCase());
      expect(name).toBe(`${word}_s`);
    }
  });
});

describe('building a netlist', () => {
  it('names the module after the project and lists inputs then outputs as ports', () => {
    const { b } = halfAdder();
    const netlist = buildNetlist(b.doc);
    expect(netlist.name).toBe('Half_adder');
    expect(netlist.ports.map((port) => `${port.direction}:${port.name}`)).toEqual(['input:A', 'input:B', 'output:SUM', 'output:COUT']);
    expect(netlist.ports.every((port) => port.width === 1)).toBe(true);
  });

  it('gives reference designators by kind, in placement order', () => {
    const { b } = halfAdder();
    expect(buildNetlist(b.doc).parts.map((part) => part.ref)).toEqual(['SW1', 'SW2', 'U1', 'U2', 'D1', 'D2']);
  });

  it('names a net after the switch that drives it and the LED it lights', () => {
    const { b } = halfAdder();
    const netlist = buildNetlist(b.doc);
    expect(netlist.nets.map((net) => net.name).sort()).toEqual(['A', 'B', 'COUT', 'SUM']);
    const xor = netlist.parts.find((part) => part.type === 'XOR')!;
    expect(pinNetOf(netlist, xor, 'A')?.name).toBe('A');
    expect(pinNetOf(netlist, xor, 'Y')?.name).toBe('SUM');
    expect(pinNetOf(netlist, xor, 'nope')).toBeUndefined();
  });

  it('counts drivers and loads on each net', () => {
    const { b } = halfAdder();
    const netlist = buildNetlist(b.doc);
    const a = netlist.nets.find((net) => net.name === 'A')!;
    expect(a.drivers).toBe(1);
    expect(a.loads).toBe(2);
    expect(a.members.length).toBe(3);
  });

  it('numbers or names a net no port reaches', () => {
    const b = new Builder();
    const sw = b.add('SWITCH', 'S');
    const not = b.add('NOT', 'inv');
    const not2 = b.add('NOT', 'inv2');
    const led = b.add('LED', 'L');
    b.wire(sw, 'Y', not, 'A');
    b.wire(not, 'Y', not2, 'A');
    b.wire(not2, 'Y', led, 'A');
    const netlist = buildNetlist(b.doc);
    expect(netlist.nets.map((net) => net.name)).toContain('inv_Y');
  });

  it('keeps every name unique, whatever its case', () => {
    const b = new Builder();
    const s1 = b.add('SWITCH', 'x');
    const s2 = b.add('SWITCH', 'X');
    const g = b.add('AND', 'g');
    b.wire(s1, 'Y', g, 'A');
    b.wire(s2, 'Y', g, 'B');
    const netlist = buildNetlist(b.doc);
    const names = [netlist.name, ...netlist.nets.map((net) => net.name)].map((name) => name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
    expect(netlist.names).toEqual(expect.arrayContaining(names));
  });

  it('leaves out an LED that is not wired and gives every pin a net', () => {
    const b = new Builder();
    b.add('LED', 'lonely');
    b.add('AND', 'g');
    const netlist = buildNetlist(b.doc);
    expect(netlist.ports).toHaveLength(0);
    const gate = netlist.parts.find((part) => part.type === 'AND')!;
    expect(gate.pins.every((pin) => netlist.nets[pin.net] !== undefined)).toBe(true);
    // Three pins, three separate nets: nothing is joined.
    expect(new Set(gate.pins.map((pin) => pin.net)).size).toBe(3);
  });

  it('puts a second LED on the same net as an alias rather than a second net', () => {
    const b = new Builder();
    const sw = b.add('SWITCH', 'S');
    const one = b.add('LED', 'one');
    const two = b.add('LED', 'two');
    b.wire(sw, 'Y', one, 'A');
    b.wire(sw, 'Y', two, 'A');
    const netlist = buildNetlist(b.doc);
    expect(netlist.nets).toHaveLength(1);
    expect(netlist.ports.filter((port) => port.direction === 'output').map((port) => port.nets[0])).toEqual([0, 0]);
  });

  it('follows buses and splitters to single-bit nets and makes a bus input port a vector', () => {
    const b = new Builder();
    const port = b.add('PORT_IN', 'data', { signalWidth: 4 });
    const split = b.add('BUS_SPLITTER', 'sp', { busWidth: 4 });
    b.wire(port, 'Y', split, 'B');
    const leds: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      leds.push(b.add('LED', `q${i}`));
      b.wire(split, `S${i}`, leds[i]!, 'A');
    }
    const netlist = buildNetlist(b.doc);
    const input = netlist.ports.find((entry) => entry.name === 'data')!;
    expect(input.width).toBe(4);
    expect(input.nets).toHaveLength(4);
    expect(netlist.parts.some((part) => part.type === 'BUS_SPLITTER')).toBe(false);
    // The LED outputs share the input's nets, so each is an alias of one bit.
    expect(netlist.ports.filter((entry) => entry.direction === 'output')).toHaveLength(4);
    const bitNet = netlist.nets[input.nets[2]!]!;
    expect(netExpression(bitNet, 'verilog')).toBe('data[2]');
    expect(netExpression(bitNet, 'vhdl')).toBe('data(2)');
    expect(netExpression({ ...bitNet, bit: undefined }, 'verilog')).toBe('data');
  });

  it('flattens a subcircuit into its parts, named after it', () => {
    const { b, xor, and } = halfAdder();
    const grouped = encapsulateSelection(b.doc, [xor, and], 'Adder core');
    if (!grouped.ok) throw new Error(grouped.reason);
    const netlist = buildNetlist(grouped.document);
    expect(netlist.parts.map((part) => part.label)).toEqual(expect.arrayContaining(['Adder core/X1', 'Adder core/G1']));
    expect(netlist.parts.some((part) => part.type === 'SUBCIRCUIT' || part.type === 'NET_TIE' || part.type === 'PORT_IN')).toBe(false);
    expect(netlist.ports.map((port) => port.name)).toEqual(['A', 'B', 'SUM', 'COUT']);
    const inner = netlist.parts.find((part) => part.label === 'Adder core/X1')!;
    expect(pinNetOf(netlist, inner, 'Y')?.name).toBe('SUM');
  });

  it('uses a display pin as an output named after the display and the pin, only when it is wired', () => {
    const b = new Builder();
    const sw = b.add('SWITCH', 'S');
    const seg = b.add('SEVEN_SEGMENT', 'disp');
    b.wire(sw, 'Y', seg, 'C');
    const netlist = buildNetlist(b.doc);
    expect(netlist.ports.map((port) => port.name)).toEqual(['S', 'disp_C']);
  });

  it('accepts a module name and cleans it', () => {
    const { b } = halfAdder();
    expect(buildNetlist(b.doc, { moduleName: 'my top!' }).name).toBe('my_top');
    expect(buildNetlist(createInitialDocument('')).name).toBe('logic_circuit');
  });
});

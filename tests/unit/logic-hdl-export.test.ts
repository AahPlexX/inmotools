import { describe, expect, it } from 'vitest';
import { addComponent, addWire, createInitialDocument, relabelComponent, updateComponentParams, updateMetadata } from '../../src/tools/logic/circuit-model';
import { cellFor, MAX_EXPORT_RAM_ADDRESS_BITS } from '../../src/tools/logic/cell-map';
import { VERILOG_CELLS, VHDL_CELLS } from '../../src/tools/logic/hdl-cells';
import { exportVerilog } from '../../src/tools/logic/hdl-verilog';
import { exportVhdl } from '../../src/tools/logic/hdl-vhdl';
import type { ComponentType, LogicDocument } from '../../src/tools/logic/logic-types';
import { buildNetlist } from '../../src/tools/logic/netlist-engine';
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

const halfAdder = (): LogicDocument => {
  const b = new Builder('Half adder');
  const a = b.add('SWITCH', 'A');
  const bb = b.add('SWITCH', 'B');
  const xor = b.add('XOR', 'X1', { delayNs: 7 });
  const and = b.add('AND', 'G1');
  const sum = b.add('LED', 'SUM');
  const carry = b.add('LED', 'COUT');
  b.wire(a, 'Y', xor, 'A');
  b.wire(bb, 'Y', xor, 'B');
  b.wire(a, 'Y', and, 'A');
  b.wire(bb, 'Y', and, 'B');
  b.wire(xor, 'Y', sum, 'A');
  b.wire(and, 'Y', carry, 'A');
  return b.doc;
};

const counterCircuit = (params: Record<string, unknown> = {}): LogicDocument => {
  const b = new Builder('Counter');
  const clk = b.add('SWITCH', 'CLK');
  const counter = b.add('COUNTER', 'cnt', { bitWidth: 4, ...params });
  b.wire(clk, 'Y', counter, 'CLK');
  for (let i = 0; i < 4; i += 1) {
    const led = b.add('LED', `q${i}`);
    b.wire(counter, `Q${i}`, led, 'A');
  }
  return b.doc;
};

describe('Verilog export', () => {
  it('writes a module whose ports are the switches and LEDs, with gates as primitives', () => {
    const { text, warnings } = exportVerilog(halfAdder());
    expect(warnings).toEqual([]);
    expect(text).toContain('module Half_adder (');
    expect(text).toMatch(/input wire A,\n\s+input wire B,\n\s+output wire SUM,\n\s+output wire COUT\n\);/);
    expect(text).toContain('xor u1 (SUM, A, B);');
    expect(text).toContain('and u2 (COUT, A, B);');
    expect(text).toContain('endmodule');
    expect(text).toContain('`timescale 1ns / 1ps');
    // Nothing but gates: no cell library is written.
    expect(text.match(/^module /gm)).toHaveLength(1);
  });

  it('carries the project details into the header', () => {
    const doc = updateMetadata(halfAdder(), { author: 'Ada', description: 'Adds two bits.\nSecond line.', version: '2.1.0', license: 'CC-BY-4.0' });
    const { text } = exportVerilog(doc);
    expect(text).toContain('// Project: Half adder');
    expect(text).toContain('// Author: Ada');
    expect(text).toContain('// Version: 2.1.0    License: CC-BY-4.0');
    expect(text).toContain('// Adds two bits. Second line.');
    expect(text.split('\n').filter((line) => line.startsWith('//')).every((line) => !line.includes('\r'))).toBe(true);
  });

  it('puts propagation delays on primitives only when asked', () => {
    expect(exportVerilog(halfAdder()).text).not.toMatch(/#\(/);
    expect(exportVerilog(halfAdder(), { delays: true }).text).toContain('xor #(7) u1 (SUM, A, B);');
  });

  it('writes only the cells a circuit uses, once each, ahead of the top module', () => {
    const { text } = exportVerilog(counterCircuit());
    expect(text.match(/^module lw_counter/gm)).toHaveLength(1);
    expect(text).not.toContain('module lw_dff');
    expect(text.indexOf('module lw_counter')).toBeLessThan(text.indexOf('module Counter'));
    expect(text).toContain('lw_counter #(.WIDTH(4), .DOWN(0), .HAS_LOAD(0), .HAS_EN(0), .FALLING(0), .ACTIVE_HIGH(1)) u1 (.clk(CLK)');
  });

  it('ties a pin the part does not have to high impedance, and concatenates a bus most significant bit first', () => {
    const { text } = exportVerilog(counterCircuit());
    expect(text).toContain(".en(1'bz)");
    expect(text).toContain(".d({1'bz, 1'bz, 1'bz, 1'bz})");
    expect(text).toMatch(/\.q\(\{q3, q2, q1, q0\}\)/);
  });

  it('declares internal nets as wires and joins a second LED on one net with an assign', () => {
    const b = new Builder('Alias');
    const s = b.add('SWITCH', 'S');
    const not = b.add('NOT', 'inv');
    const one = b.add('LED', 'one');
    const two = b.add('LED', 'two');
    b.wire(s, 'Y', not, 'A');
    b.wire(not, 'Y', one, 'A');
    b.wire(not, 'Y', two, 'A');
    const { text } = exportVerilog(b.doc);
    expect(text).toContain('assign two = one;');
    expect(text).toContain('not u1 (one, S);');
  });

  it('flattens a subcircuit and names its parts after it', () => {
    const doc = halfAdder();
    const ids = doc.components.filter((component) => component.type === 'XOR' || component.type === 'AND').map((component) => component.id);
    const grouped = encapsulateSelection(doc, ids, 'Core');
    if (!grouped.ok) throw new Error(grouped.reason);
    const { text } = exportVerilog(grouped.document);
    expect(text).toContain('// U1: Core/X1 (XOR)');
    expect(text).toContain('xor u1 (SUM, A, B);');
    expect(text).not.toContain('SUBCIRCUIT');
  });

  it('writes a ROM as a module of its own holding its contents, and a RAM with an initial image', () => {
    const b = new Builder('Memories');
    b.add('ROM', 'rom', { addressBits: 4, dataBits: 8, memoryCells: { '1': 0xa5, '15': 0xff }, memoryFill: 0x11 });
    b.add('RAM', 'ram', { addressBits: 4, dataBits: 4, memoryCells: { '2': 9 } });
    const { text } = exportVerilog(b.doc);
    expect(text).toContain('module lw_rom_u1 (');
    expect(text).toContain("4'h1: word = 8'ha5;");
    expect(text).toContain("4'hf: word = 8'hff;");
    expect(text).toContain("default: word = 8'h11;");
    expect(text).toContain('module lw_ram_u2 (');
    expect(text).toContain("mem[4'h2] = 4'h9;");
    expect(text).toContain('lw_rom_u1 u1');
  });

  it('leaves a RAM that is too large out and says so, and notes a ripple counter is exported as synchronous', () => {
    const b = new Builder('Big');
    b.add('RAM', 'huge', { addressBits: MAX_EXPORT_RAM_ADDRESS_BITS + 1, dataBits: 8 });
    const big = exportVerilog(b.doc);
    expect(big.warnings.join(' ')).toContain('huge');
    expect(big.text).not.toContain('lw_ram_');
    const ripple = exportVerilog(counterCircuit({ asyncRipple: true }));
    expect(ripple.warnings.join(' ')).toContain('ripple');
  });

  it('has a cell for every cell name the map can ask for', () => {
    for (const cell of Object.values(VHDL_CELLS)) expect(cell).toContain('entity');
    for (const cell of Object.values(VERILOG_CELLS)) expect(cell).toContain('endmodule');
    expect(Object.keys(VHDL_CELLS)).toEqual(expect.arrayContaining(['lw_and', 'lw_or', 'lw_nand', 'lw_nor', 'lw_xor', 'lw_xnor', 'lw_not', 'lw_buf', 'lw_tribuf']));
    for (const name of Object.keys(VERILOG_CELLS)) expect(VHDL_CELLS[name], `VHDL cell for ${name}`).toBeDefined();
  });

  it('handles an empty circuit', () => {
    const { text } = exportVerilog(createInitialDocument('Nothing'));
    expect(text).toContain('module Nothing;');
    expect(text).toContain('endmodule');
  });
});

describe('VHDL export', () => {
  it('writes an entity with std_logic ports and an instance per part', () => {
    const { text, warnings } = exportVhdl(halfAdder());
    expect(warnings).toEqual([]);
    expect(text).toContain('entity Half_adder is');
    expect(text).toContain('A : in std_logic;');
    expect(text).toContain('COUT : out std_logic');
    expect(text).toContain('architecture structural of Half_adder is');
    expect(text).toContain('u1 : entity work.lw_xor generic map (N => 2)');
    expect(text).toContain('port map (a => (1 => B, 0 => A), y => SUM_o);');
    expect(text).toContain('end architecture structural;');
  });

  it('never reads an output port: outputs go through an internal signal', () => {
    const b = new Builder('Read back');
    const s = b.add('SWITCH', 'S');
    const inv = b.add('NOT', 'inv');
    const led = b.add('LED', 'L');
    const second = b.add('NOT', 'inv2');
    const out2 = b.add('LED', 'L2');
    b.wire(s, 'Y', inv, 'A');
    b.wire(inv, 'Y', led, 'A');
    b.wire(inv, 'Y', second, 'A');
    b.wire(second, 'Y', out2, 'A');
    const { text } = exportVhdl(b.doc);
    expect(text).toContain('signal L_o : std_logic;');
    expect(text).toContain('L <= L_o;');
    expect(text).toContain('port map (a => L_o, y => L2_o);');
  });

  it('writes bus ports as vectors and hands a cell output vector on bit by bit', () => {
    const { text } = exportVhdl(counterCircuit());
    expect(text).toContain('signal u1_q : std_logic_vector(3 downto 0);');
    expect(text).toContain('q0_o <= u1_q(0);');
    expect(text).toContain("d => (3 => 'Z', 2 => 'Z', 1 => 'Z', 0 => 'Z')");
    expect(text).toContain('generic map (WIDTH => 4, DOWN => 0, HAS_LOAD => 0, HAS_EN => 0, FALLING => 0, ACTIVE_HIGH => 1)');
  });

  it('writes a bus input port as std_logic_vector', () => {
    const b = new Builder('Bus in');
    const port = b.add('PORT_IN', 'data', { signalWidth: 8 });
    const out = b.add('PORT_OUT', 'result', { signalWidth: 8 });
    b.wire(port, 'Y', out, 'A');
    const { text } = exportVhdl(b.doc);
    expect(text).toContain('data : in std_logic_vector(7 downto 0);');
    expect(text).toContain('result : out std_logic_vector(7 downto 0)');
    expect(exportVerilog(b.doc).text).toContain('input wire [7:0] data');
  });

  it('writes a ROM entity with its contents', () => {
    const b = new Builder('Rom');
    b.add('ROM', 'rom', { addressBits: 4, dataBits: 8, memoryCells: { '3': 0x5a } });
    const { text } = exportVhdl(b.doc);
    expect(text).toContain('entity lw_rom_u1 is');
    expect(text).toContain('when "0011" => word := "01011010";');
    expect(text).toContain('entity work.lw_rom_u1');
  });

  it('keeps instance labels apart from signal names, which share one namespace in VHDL', () => {
    const b = new Builder('Clash');
    const s = b.add('SWITCH', 'u1');
    const g = b.add('NOT', 'g');
    const l = b.add('LED', 'L');
    b.wire(s, 'Y', g, 'A');
    b.wire(g, 'Y', l, 'A');
    const { text } = exportVhdl(b.doc);
    expect(text).toContain('u1_2 : entity work.lw_not');
  });
});

describe('cell map', () => {
  const part = (type: ComponentType, params: Record<string, unknown> = {}) => {
    const b = new Builder();
    b.add(type, 'p', params);
    return buildNetlist(b.doc).parts[0]!;
  };

  it('maps every part that has logic to a cell, and sources, sinks and displays to none', () => {
    for (const type of ['AND', 'NOT', 'BUFFER', 'TRI_BUFFER', 'D_FLIP_FLOP', 'JK_FLIP_FLOP', 'T_FLIP_FLOP', 'SR_LATCH', 'MUX', 'DEMUX', 'DECODER', 'PRIORITY_ENCODER', 'BCD_7SEG', 'COUNTER', 'REGISTER', 'ALU', 'ROM', 'RAM'] as ComponentType[]) {
      const mapped = cellFor(part(type));
      expect(mapped && 'use' in mapped, type).toBe(true);
    }
    for (const type of ['SWITCH', 'LED', 'CLOCK', 'PUSH_BUTTON', 'PROBE', 'SEVEN_SEGMENT', 'RGB_MATRIX', 'PORT_IN', 'PORT_OUT'] as ComponentType[]) expect(cellFor(part(type)), type).toBeUndefined();
  });

  it('connects every pin a cell port names to a pin the part really has', () => {
    for (const type of ['AND', 'JK_FLIP_FLOP', 'MUX', 'DEMUX', 'DECODER', 'PRIORITY_ENCODER', 'BCD_7SEG', 'COUNTER', 'REGISTER', 'ALU', 'ROM', 'RAM'] as ComponentType[]) {
      const netlistPart = part(type, type === 'COUNTER' ? { hasLoad: true, hasEnable: true } : {});
      const mapped = cellFor(netlistPart);
      if (!mapped || !('use' in mapped)) throw new Error(type);
      const pins = new Set(netlistPart.pins.map((pin) => pin.id));
      for (const port of mapped.use.ports) for (const pin of port.pins) if (pin !== null) expect(pins.has(pin), `${type} pin ${pin}`).toBe(true);
    }
  });
});

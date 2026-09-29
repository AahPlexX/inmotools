import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { addComponent, addWire, createInitialDocument, relabelComponent, updateComponentParams } from '../../src/tools/logic/circuit-model';
import { exportVerilog } from '../../src/tools/logic/hdl-verilog';
import { exportVhdl } from '../../src/tools/logic/hdl-vhdl';
import type { ComponentParams, ComponentType, LogicDocument, LogicLevel } from '../../src/tools/logic/logic-types';
import { buildNetlist } from '../../src/tools/logic/netlist-engine';
import { createInitialFrame, readLevel, step } from '../../src/tools/logic/sim-engine';

/**
 * Compiles the exported Verilog with Icarus Verilog and the exported VHDL with GHDL, runs each against a test
 * bench, and compares every output on every vector with what the workstation's own simulator says. It runs only
 * where those tools are installed (they are not part of the repository's toolchain) and is skipped elsewhere.
 *
 * Every circuit starts with its clock low, so no part sees a first-sample edge: a hardware description language
 * treats an unknown-to-high change as an edge, which the workstation deliberately does not.
 */
const available = (command: string): boolean => spawnSync(command, ['--version'], { stdio: 'ignore' }).status === 0;
const HAVE_VERILOG = available('iverilog');
const HAVE_VHDL = available('ghdl');
const work = mkdtempSync(join(tmpdir(), 'logic-hdl-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

class Builder {
  doc: LogicDocument;
  ids = new Map<string, string>();
  private x = 0;
  constructor(title: string) { this.doc = createInitialDocument(title); }
  add(type: ComponentType, label: string, params: ComponentParams = {}): string {
    this.doc = addComponent(this.doc, type, this.x, 0);
    this.x += 12;
    const id = this.doc.components[this.doc.components.length - 1]!.id;
    this.doc = relabelComponent(this.doc, id, label);
    if (Object.keys(params).length) this.doc = updateComponentParams(this.doc, id, params);
    this.ids.set(label, id);
    return id;
  }
  wire(from: string, fromPort: string, to: string, toPort: string) {
    this.doc = addWire(this.doc, { componentId: this.ids.get(from) ?? from, portId: fromPort }, { componentId: this.ids.get(to) ?? to, portId: toPort });
  }
}

type Vector = Record<string, number>;


/** The output of every port on every vector, as the workstation's simulator reports it (lower-case `x` and `z`). */
const expectedLines = (doc: LogicDocument, stimulus: Vector[]): string[] => {
  const netlist = buildNetlist(doc);
  const inPorts = netlist.ports.filter((port) => port.direction === 'input');
  const outPorts = netlist.ports.filter((port) => port.direction === 'output');
  let frame = createInitialFrame(doc);
  return stimulus.map((vector) => {
    const interactions: Record<string, LogicLevel> = {};
    for (const port of inPorts) interactions[netlist.parts[port.part]!.id] = ((vector[port.name] ?? 0) & 1) as LogicLevel;
    frame = step({ document: doc, previous: frame, elapsedMs: 0, interactions });
    return outPorts
      .map((port) => {
        const part = netlist.parts[port.part]!;
        let text = '';
        for (let bit = port.width - 1; bit >= 0; bit -= 1) {
          const level = readLevel(frame, part.id, part.type === 'PORT_OUT' && port.width > 1 ? `A${bit}` : 'A');
          text += level === 'Z' ? 'z' : level === 'X' ? 'x' : String(level);
        }
        return text;
      })
      .join(' ');
  });
};

const verilogBench = (doc: LogicDocument, stimulus: Vector[]): string => {
  const netlist = buildNetlist(doc);
  const inPorts = netlist.ports.filter((port) => port.direction === 'input');
  const outPorts = netlist.ports.filter((port) => port.direction === 'output');
  const lines = ['module tb;'];
  for (const port of inPorts) lines.push(`  reg ${port.width > 1 ? `[${port.width - 1}:0] ` : ''}${port.name};`);
  for (const port of outPorts) lines.push(`  wire ${port.width > 1 ? `[${port.width - 1}:0] ` : ''}${port.name};`);
  lines.push(`  ${netlist.name} dut (${[...inPorts, ...outPorts].map((port) => `.${port.name}(${port.name})`).join(', ')});`, '  initial begin');
  for (const vector of stimulus) {
    for (const port of inPorts) lines.push(`    ${port.name} = ${port.width}'d${vector[port.name] ?? 0};`);
    lines.push('    #10;', `    $display("${outPorts.map(() => '%b').join(' ')}", ${outPorts.map((port) => port.name).join(', ')});`);
  }
  lines.push('    $finish;', '  end', 'endmodule');
  return `${lines.join('\n')}\n`;
};

const vhdlBench = (doc: LogicDocument, stimulus: Vector[]): string => {
  const netlist = buildNetlist(doc);
  const inPorts = netlist.ports.filter((port) => port.direction === 'input');
  const outPorts = netlist.ports.filter((port) => port.direction === 'output');
  const type = (width: number): string => (width === 1 ? 'std_logic' : `std_logic_vector(${width - 1} downto 0)`);
  const literal = (width: number, value: number): string => (width === 1 ? `'${value & 1}'` : `"${value.toString(2).padStart(width, '0')}"`);
  const lines = ['library ieee;', 'use ieee.std_logic_1164.all;', 'use std.textio.all;', 'entity tb is end entity;', 'architecture t of tb is'];
  for (const port of inPorts) lines.push(`  signal ${port.name} : ${type(port.width)} := ${port.width === 1 ? "'0'" : '(others => \'0\')'};`);
  for (const port of outPorts) lines.push(`  signal ${port.name} : ${type(port.width)};`);
  lines.push('begin', `  dut : entity work.${netlist.name} port map (${[...inPorts, ...outPorts].map((port) => `${port.name} => ${port.name}`).join(', ')});`, '  process', '    variable l : line;', '  begin');
  for (const vector of stimulus) {
    for (const port of inPorts) lines.push(`    ${port.name} <= ${literal(port.width, vector[port.name] ?? 0)};`);
    lines.push('    wait for 10 ns;');
    outPorts.forEach((port, index) => {
      lines.push(`    write(l, to_string(${port.name}));`);
      if (index < outPorts.length - 1) lines.push(`    write(l, string'(" "));`);
    });
    lines.push('    writeline(output, l);');
  }
  lines.push('    wait;', '  end process;', 'end architecture;');
  return `${lines.join('\n')}\n`;
};

const run = (command: string, args: string[], cwd: string): { status: number | null; stdout: string; stderr: string } => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
};

/** Exports the circuit both ways, simulates each, and expects every output line to equal the workstation's. */
const check = (name: string, doc: LogicDocument, stimulus: Vector[]): void => {
  const expected = expectedLines(doc, stimulus);
  if (HAVE_VERILOG) {
    const dir = join(work, `${name}-v`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'dut.v'), exportVerilog(doc).text);
    writeFileSync(join(dir, 'tb.v'), verilogBench(doc, stimulus));
    const compiled = run('iverilog', ['-g2005', '-o', 'sim.vvp', 'dut.v', 'tb.v'], dir);
    expect(compiled.status, `iverilog: ${compiled.stderr}`).toBe(0);
    const simulated = run('vvp', ['sim.vvp'], dir);
    const lines = simulated.stdout.split('\n').filter((line) => !line.includes('$finish') && line.trim() !== '');
    expect(lines, `Verilog ${name}`).toEqual(expected);
  }
  if (HAVE_VHDL) {
    const dir = join(work, `${name}-h`);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'dut.vhd'), exportVhdl(doc).text);
    writeFileSync(join(dir, 'tb.vhd'), vhdlBench(doc, stimulus));
    const analyzed = run('ghdl', ['-a', '--std=08', 'dut.vhd', 'tb.vhd'], dir);
    expect(analyzed.status, `ghdl -a: ${analyzed.stderr}`).toBe(0);
    const elaborated = run('ghdl', ['-e', '--std=08', 'tb'], dir);
    expect(elaborated.status, `ghdl -e: ${elaborated.stderr}`).toBe(0);
    const simulated = run('ghdl', ['-r', '--std=08', 'tb'], dir);
    const lines = simulated.stdout.toLowerCase().split('\n').filter((line) => line.trim() !== '');
    expect(lines, `VHDL ${name}`).toEqual(expected);
  }
};

const bits = (prefix: string, value: number, width: number): Vector => Object.fromEntries(Array.from({ length: width }, (_, i) => [`${prefix}${i}`, (value >> i) & 1]));
const seq = (...vs: Vector[]): Vector[] => {
  const merged: Vector[] = [];
  let state: Vector = {};
  for (const v of vs) { state = { ...state, ...v }; merged.push({ ...state }); }
  return merged;
};
/** clk pulse: set inputs, then clk 1, then clk 0 */
const clocked = (inputs: Vector[]): Vector[] => seq(...inputs.flatMap((v) => [{ ...v, CLK: 0 }, { CLK: 1 }, { CLK: 0 }]));

const busIn = (b: Builder, prefix: string, width: number, target: string, port: string) => {
  const sp = b.add('BUS_SPLITTER', `${prefix}_split`, { busWidth: width });
  for (let i = 0; i < width; i += 1) { b.add('SWITCH', `${prefix}${i}`); b.wire(`${prefix}${i}`, 'Y', sp, `S${i}`); }
  b.wire(sp, 'B', target, port);
};
const busOut = (b: Builder, prefix: string, width: number, source: string, port: string) => {
  const sp = b.add('BUS_SPLITTER', `${prefix}_osplit`, { busWidth: width });
  b.wire(source, port, sp, 'B');
  for (let i = 0; i < width; i += 1) { b.add('LED', `${prefix}${i}`); b.wire(sp, `S${i}`, `${prefix}${i}`, 'A'); }
};
const leds = (b: Builder, source: string, pairs: [string, string][]) => { for (const [pin, label] of pairs) { b.add('LED', label); b.wire(source, pin, label, 'A'); } };

describe.skipIf(!HAVE_VERILOG && !HAVE_VHDL)('exported HDL against the workstation simulator', () => {
  it('half adder', () => {
    const b = new Builder('Half adder');
    b.add('SWITCH', 'A'); b.add('SWITCH', 'B');
    b.add('XOR', 'X1'); b.add('AND', 'G1'); b.add('LED', 'SUM'); b.add('LED', 'COUT');
    b.wire('A', 'Y', 'X1', 'A'); b.wire('B', 'Y', 'X1', 'B'); b.wire('A', 'Y', 'G1', 'A'); b.wire('B', 'Y', 'G1', 'B');
    b.wire('X1', 'Y', 'SUM', 'A'); b.wire('G1', 'Y', 'COUT', 'A');
    check('halfadder', b.doc, [{}, { A: 1 }, { B: 1 }, { A: 1, B: 1 }]);
  });

  it('all gates 3 inputs', () => {
    const b = new Builder('Gates');
    for (const l of ['A', 'B', 'C']) b.add('SWITCH', l);
    for (const t of ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR'] as const) {
      b.add(t, `g_${t}`, { inputCount: 3 });
      for (const l of ['A', 'B', 'C']) b.wire(l, 'Y', `g_${t}`, l);
      b.add('LED', `o_${t}`); b.wire(`g_${t}`, 'Y', `o_${t}`, 'A');
    }
    b.add('NOT', 'inv'); b.wire('A', 'Y', 'inv', 'A'); b.add('LED', 'o_not'); b.wire('inv', 'Y', 'o_not', 'A');
    b.add('BUFFER', 'buf'); b.wire('B', 'Y', 'buf', 'A'); b.add('LED', 'o_buf'); b.wire('buf', 'Y', 'o_buf', 'A');
    b.add('TRI_BUFFER', 'tri'); b.wire('A', 'Y', 'tri', 'A'); b.wire('C', 'Y', 'tri', 'EN'); b.add('LED', 'o_tri'); b.wire('tri', 'Y', 'o_tri', 'A');
    const vs: Vector[] = []; for (let i = 0; i < 8; i += 1) vs.push({ A: i & 1, B: (i >> 1) & 1, C: (i >> 2) & 1 });
    check('gates', b.doc, vs);
  });

  it('flip flops', () => {
    const b = new Builder('Flops');
    for (const l of ['D', 'J', 'K', 'T', 'CLK', 'SET', 'RST', 'S', 'R']) b.add('SWITCH', l);
    b.add('D_FLIP_FLOP', 'ff_d'); b.add('JK_FLIP_FLOP', 'ff_jk', { edge: 'rising' }); b.add('T_FLIP_FLOP', 'ff_t'); b.add('SR_LATCH', 'lat');
    for (const ff of ['ff_d', 'ff_jk', 'ff_t']) { b.wire('CLK', 'Y', ff, 'CLK'); b.wire('SET', 'Y', ff, 'SET'); b.wire('RST', 'Y', ff, 'RST'); }
    b.wire('D', 'Y', 'ff_d', 'D'); b.wire('J', 'Y', 'ff_jk', 'J'); b.wire('K', 'Y', 'ff_jk', 'K'); b.wire('T', 'Y', 'ff_t', 'T');
    b.wire('S', 'Y', 'lat', 'S'); b.wire('R', 'Y', 'lat', 'R');
    leds(b, 'ff_d', [['Q', 'dq'], ['QN', 'dqn']]); leds(b, 'ff_jk', [['Q', 'jq'], ['QN', 'jqn']]); leds(b, 'ff_t', [['Q', 'tq'], ['QN', 'tqn']]); leds(b, 'lat', [['Q', 'lq'], ['QN', 'lqn']]);
    const vs = seq(
      { CLK: 0, D: 1, J: 1, K: 0, T: 1, S: 0, R: 0, SET: 0, RST: 0 }, { CLK: 1 }, { CLK: 0 }, { J: 0, K: 1 }, { CLK: 1 }, { CLK: 0 }, { J: 1, K: 1 }, { CLK: 1 }, { CLK: 0 },
      { CLK: 1 }, { CLK: 0 }, { D: 0 }, { CLK: 1 }, { CLK: 0 }, { RST: 1 }, { RST: 0 }, { SET: 1 }, { SET: 0 }, { CLK: 1 }, { CLK: 0 }, { S: 1 }, { S: 0 }, { R: 1 }, { R: 0 }, { S: 1, R: 1 }, { S: 0, R: 0 },
    );
    check('flops', b.doc, vs);
  });

  it('blocks', () => {
    const b = new Builder('Blocks');
    for (const l of ['S0', 'S1', 'EN', 'D']) b.add('SWITCH', l);
    for (let i = 0; i < 4; i += 1) b.add('SWITCH', `I${i}`);
    b.add('MUX', 'mux', { selectBits: 2, hasEnable: true }); for (let i = 0; i < 4; i += 1) b.wire(`I${i}`, 'Y', 'mux', `D${i}`);
    b.wire('S0', 'Y', 'mux', 'S0'); b.wire('S1', 'Y', 'mux', 'S1'); b.wire('EN', 'Y', 'mux', 'EN'); leds(b, 'mux', [['Y', 'muxy']]);
    b.add('DEMUX', 'dmx', { selectBits: 2, hasEnable: true }); b.wire('D', 'Y', 'dmx', 'D'); b.wire('S0', 'Y', 'dmx', 'S0'); b.wire('S1', 'Y', 'dmx', 'S1'); b.wire('EN', 'Y', 'dmx', 'EN');
    leds(b, 'dmx', [0, 1, 2, 3].map((i) => [`Y${i}`, `dmx${i}`] as [string, string]));
    b.add('DECODER', 'dec', { selectBits: 2, hasEnable: true, activeHigh: false }); b.wire('S0', 'Y', 'dec', 'A0'); b.wire('S1', 'Y', 'dec', 'A1'); b.wire('EN', 'Y', 'dec', 'EN');
    leds(b, 'dec', [0, 1, 2, 3].map((i) => [`Y${i}`, `dec${i}`] as [string, string]));
    b.add('PRIORITY_ENCODER', 'enc', { selectBits: 2 }); for (let i = 0; i < 4; i += 1) b.wire(`I${i}`, 'Y', 'enc', `I${i}`);
    leds(b, 'enc', [['Y0', 'enc0'], ['Y1', 'enc1'], ['V', 'encv']]);
    const vs: Vector[] = []; for (let i = 0; i < 128; i += 1) vs.push({ S0: i & 1, S1: (i >> 1) & 1, EN: (i >> 2) & 1, D: (i >> 3) & 1, I0: (i >> 4) & 1, I1: (i >> 5) & 1, I2: (i >> 6) & 1, I3: (i * 7 >> 2) & 1 });
    check('blocks', b.doc, vs);
  });

  it('bcd', () => {
    const b = new Builder('Bcd');
    for (let i = 0; i < 4; i += 1) b.add('SWITCH', `D${i}`);
    b.add('SWITCH', 'EN');
    b.add('BCD_7SEG', 'bcd', { hasEnable: true, activeHigh: false });
    for (let i = 0; i < 4; i += 1) b.wire(`D${i}`, 'Y', 'bcd', `D${i}`);
    b.wire('EN', 'Y', 'bcd', 'EN');
    leds(b, 'bcd', 'ABCDEFG'.split('').map((s) => [s, `seg${s}`] as [string, string]));
    const vs: Vector[] = []; for (let i = 0; i < 32; i += 1) vs.push({ ...bits('D', i & 15, 4), EN: i >> 4 });
    check('bcd', b.doc, vs);
  });

  it('counters', () => {
    const b = new Builder('Counters');
    for (const l of ['CLK', 'RST', 'EN', 'LOAD']) b.add('SWITCH', l);
    for (let i = 0; i < 4; i += 1) b.add('SWITCH', `D${i}`);
    b.add('COUNTER', 'up', { bitWidth: 4, hasEnable: true, hasLoad: true });
    b.add('COUNTER', 'down', { bitWidth: 3, countDown: true });
    b.add('REGISTER', 'reg', { bitWidth: 4, hasEnable: true });
    for (const c of ['up', 'down', 'reg']) { b.wire('CLK', 'Y', c, 'CLK'); b.wire('RST', 'Y', c, 'RST'); }
    for (const c of ['up', 'reg']) b.wire('EN', 'Y', c, 'EN');
    b.wire('LOAD', 'Y', 'up', 'LOAD');
    for (let i = 0; i < 4; i += 1) { b.wire(`D${i}`, 'Y', 'up', `D${i}`); b.wire(`D${i}`, 'Y', 'reg', `D${i}`); }
    leds(b, 'up', [0, 1, 2, 3].map((i) => [`Q${i}`, `uq${i}`] as [string, string]).concat([['TC', 'utc']]));
    leds(b, 'down', [0, 1, 2].map((i) => [`Q${i}`, `dq${i}`] as [string, string]).concat([['TC', 'dtc']]));
    leds(b, 'reg', [0, 1, 2, 3].map((i) => [`Q${i}`, `rq${i}`] as [string, string]));
    const base: Vector = { EN: 1, LOAD: 0, RST: 0, ...bits('D', 0, 4) };
    const steps: Vector[] = [];
    for (let i = 0; i < 20; i += 1) steps.push(base);
    steps.push({ ...base, LOAD: 1, ...bits('D', 13, 4) }); steps.push({ ...base, ...bits('D', 6, 4) }); steps.push({ ...base, EN: 0, ...bits('D', 9, 4) }); steps.push({ ...base, EN: 0, ...bits('D', 9, 4) }); steps.push({ ...base, RST: 1 }); steps.push({ ...base, RST: 0 }); steps.push(base);
    check('counters', b.doc, clocked(steps));
  });

  it('alu', () => {
    const b = new Builder('Alu');
    b.add('ALU', 'alu', { aluWidth: 8 });
    busIn(b, 'A', 8, 'alu', 'A'); busIn(b, 'B', 8, 'alu', 'B');
    for (let i = 0; i < 3; i += 1) { b.add('SWITCH', `OP${i}`); b.wire(`OP${i}`, 'Y', 'alu', `OP${i}`); }
    b.add('SWITCH', 'CIN'); b.wire('CIN', 'Y', 'alu', 'CIN');
    busOut(b, 'Y', 8, 'alu', 'Y');
    leds(b, 'alu', ['COUT', 'Z', 'N', 'V', 'EQ', 'LT', 'GT'].map((f) => [f, `f${f}`] as [string, string]));
    let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed; };
    const vs: Vector[] = [];
    for (let i = 0; i < 200; i += 1) { const op = i % 8; vs.push({ ...bits('A', rnd() % 256, 8), ...bits('B', rnd() % 256, 8), ...bits('OP', op, 3), CIN: rnd() % 2 }); }
    check('alu', b.doc, vs);
  });

  it('rom and ram', () => {
    const b = new Builder('Memories');
    b.add('ROM', 'rom', { addressBits: 5, dataBits: 8, memoryCells: { '1': 0xa5, '7': 0x3c, '31': 0xff }, memoryFill: 0x11, hasEnable: true });
    busIn(b, 'RA', 5, 'rom', 'ADDR'); b.add('SWITCH', 'ROE'); b.wire('ROE', 'Y', 'rom', 'OE');
    busOut(b, 'RD', 8, 'rom', 'DOUT');
    b.add('RAM', 'ram', { addressBits: 4, dataBits: 8, memoryCells: { '2': 0x77 } });
    busIn(b, 'MA', 4, 'ram', 'ADDR'); busIn(b, 'MD', 8, 'ram', 'DIN'); b.add('SWITCH', 'CLK'); b.add('SWITCH', 'WE'); b.wire('CLK', 'Y', 'ram', 'CLK'); b.wire('WE', 'Y', 'ram', 'WE');
    busOut(b, 'MQ', 8, 'ram', 'DOUT');
    const vs: Vector[] = [];
    for (let i = 0; i < 40; i += 1) vs.push({ ...bits('RA', i % 32, 5), ROE: i % 5 === 0 ? 0 : 1, CLK: 0, WE: 0, ...bits('MA', i % 16, 4), ...bits('MD', 0, 8) });
    const writes: Vector[] = [];
    for (let a = 0; a < 6; a += 1) { writes.push({ ...bits('MA', a, 4), ...bits('MD', 0x10 + a * 3, 8), WE: 1, CLK: 0 }); writes.push({ CLK: 1 }); writes.push({ CLK: 0, WE: 0 }); }
    for (let a = 0; a < 8; a += 1) writes.push({ ...bits('MA', a, 4), WE: 0 });
    check('mem', b.doc, seq(...vs, ...writes));
  });

  it('aliases and reserved names', () => {
    const b = new Builder('entity');
    b.add('SWITCH', 'in'); b.add('SWITCH', 'signal'); b.add('SWITCH', '1st'); b.add('SWITCH', 'IN');
    b.add('AND', 'and'); b.wire('in', 'Y', 'and', 'A'); b.wire('signal', 'Y', 'and', 'B');
    b.add('LED', 'out'); b.add('LED', 'Out'); b.wire('and', 'Y', 'out', 'A'); b.wire('and', 'Y', 'Out', 'A');
    b.add('NOT', 'inv'); b.wire('and', 'Y', 'inv', 'A'); b.add('LED', 'nq'); b.wire('inv', 'Y', 'nq', 'A');
    b.add('OR', 'or2'); b.wire('1st', 'Y', 'or2', 'A'); b.wire('IN', 'Y', 'or2', 'B'); b.add('LED', 'wire'); b.wire('or2', 'Y', 'wire', 'A');
    b.add('SWITCH', 'lonely'); b.add('LED', 'lonelyled'); b.wire('lonely', 'Y', 'lonelyled', 'A');
    const vs: Vector[] = []; for (let i = 0; i < 32; i += 1) vs.push({ in: i & 1, signal: (i >> 1) & 1, '1st': (i >> 2) & 1, IN: (i >> 3) & 1, lonely: (i >> 4) & 1 });
    check('names', b.doc, vs);
  });
});

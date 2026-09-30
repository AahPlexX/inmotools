import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { addComponent, addWire, createInitialDocument, relabelComponent, updateComponentParams } from '../../src/tools/logic/circuit-model';
import type { ComponentType, LogicDocument, LogicLevel } from '../../src/tools/logic/logic-types';
import { buildNetlist } from '../../src/tools/logic/netlist-engine';
import { createInitialFrame, readLevel, step } from '../../src/tools/logic/sim-engine';
import { exportSpice } from '../../src/tools/logic/spice-export';

/**
 * Runs the exported SPICE netlist in ngspice for every input combination and compares each output that the
 * workstation's simulator drives to a definite 0 or 1 with the voltage ngspice settles at (above half the
 * supply is 1). Runs only where ngspice is installed; skipped elsewhere.
 */
const HAVE_NGSPICE = spawnSync('ngspice', ['--version'], { stdio: 'ignore' }).status === 0;
const work = mkdtempSync(join(tmpdir(), 'logic-spice-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

class Builder {
  doc: LogicDocument = createInitialDocument('Spice');
  private x = 0;
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

const leds = (b: Builder, source: string, pins: [string, string][]): void => {
  for (const [pin, label] of pins) {
    const led = b.add('LED', label);
    b.wire(source, pin, led, 'A');
  }
};

/** Returns the settled voltage of every output net for each vector, from one ngspice run. */
const runSpice = (doc: LogicDocument, vectors: Record<string, number>[]): Record<string, number>[] => {
  const netlist = buildNetlist(doc);
  const spice = exportSpice(doc, { supply: 5 }).text;
  const inputs = netlist.ports.filter((port) => port.direction === 'input');
  const outputs = netlist.ports.filter((port) => port.direction === 'output');
  const control = ['.control'];
  vectors.forEach((vector, index) => {
    for (const port of inputs) {
      const part = netlist.parts[port.part]!;
      control.push(`alter v${part.ref.toLowerCase()} dc = ${(vector[port.name] ?? 0) ? 5 : 0}`);
    }
    control.push('op');
    for (const port of outputs) control.push(`print v(${port.name})`);
    control.push(`echo END ${index}`);
  });
  control.push('.endc');
  const file = join(work, 'circuit.cir');
  writeFileSync(file, spice.replace('.end\n', `${control.join('\n')}\n.end\n`));
  const run = spawnSync('ngspice', ['-b', file], { encoding: 'utf8' });
  const results: Record<string, number>[] = [];
  let current: Record<string, number> = {};
  for (const line of run.stdout.split('\n')) {
    const value = /^v\((\S+)\) = (\S+)/.exec(line);
    if (value) current[value[1]!] = Number(value[2]);
    else if (line.startsWith('END ')) {
      results.push(current);
      current = {};
    }
  }
  return results;
};

const compare = (doc: LogicDocument, vectors: Record<string, number>[]): void => {
  const netlist = buildNetlist(doc);
  const inputs = netlist.ports.filter((port) => port.direction === 'input');
  const outputs = netlist.ports.filter((port) => port.direction === 'output');
  const spice = runSpice(doc, vectors);
  expect(spice).toHaveLength(vectors.length);
  vectors.forEach((vector, index) => {
    const interactions: Record<string, LogicLevel> = {};
    for (const port of inputs) interactions[netlist.parts[port.part]!.id] = ((vector[port.name] ?? 0) & 1) as LogicLevel;
    const frame = step({ document: doc, previous: createInitialFrame(doc), elapsedMs: 0, interactions });
    for (const port of outputs) {
      const expected = readLevel(frame, netlist.parts[port.part]!.id, 'A');
      if (expected !== 0 && expected !== 1) continue;
      const volts = spice[index]![port.name]!;
      expect(volts > 2.5 ? 1 : 0, `${port.name} for ${JSON.stringify(vector)} (${volts} V)`).toBe(expected);
    }
  });
};

describe.skipIf(!HAVE_NGSPICE)('exported SPICE against the workstation simulator', () => {
  it('gates of two to four inputs, an inverter and a buffer', () => {
    const b = new Builder();
    for (const label of ['A', 'B', 'C', 'D']) b.add('SWITCH', label);
    for (const inputCount of [2, 3, 4]) {
      for (const type of ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR'] as const) {
        const gate = b.add(type, `g${inputCount}${type}`, { inputCount });
        for (let i = 0; i < inputCount; i += 1) b.wire('ABCD'[i]!, 'Y', gate, 'ABCD'[i]!);
        const led = b.add('LED', `o${inputCount}${type}`);
        b.wire(gate, 'Y', led, 'A');
      }
    }
    b.add('NOT', 'inv');
    b.wire('A', 'Y', 'inv', 'A');
    b.add('LED', 'onot');
    b.wire('inv', 'Y', 'onot', 'A');
    b.add('BUFFER', 'buf');
    b.wire('B', 'Y', 'buf', 'A');
    b.add('LED', 'obuf');
    b.wire('buf', 'Y', 'obuf', 'A');
    const vectors = Array.from({ length: 16 }, (_, i) => ({ A: i & 1, B: (i >> 1) & 1, C: (i >> 2) & 1, D: (i >> 3) & 1 }));
    compare(b.doc, vectors);
  });

  it('a tri-state buffer drives when enabled', () => {
    const b = new Builder();
    b.add('SWITCH', 'A');
    b.add('SWITCH', 'EN');
    b.add('TRI_BUFFER', 'tri');
    b.wire('A', 'Y', 'tri', 'A');
    b.wire('EN', 'Y', 'tri', 'EN');
    b.add('LED', 'o');
    b.wire('tri', 'Y', 'o', 'A');
    compare(b.doc, [{ A: 0, EN: 1 }, { A: 1, EN: 1 }]);
  });

  it('a multiplexer, demultiplexer, decoder and priority encoder', () => {
    const b = new Builder();
    for (const label of ['S0', 'S1', 'EN', 'D', 'I0', 'I1', 'I2', 'I3']) b.add('SWITCH', label);
    b.add('MUX', 'mux', { selectBits: 2, hasEnable: true });
    for (let i = 0; i < 4; i += 1) b.wire(`I${i}`, 'Y', 'mux', `D${i}`);
    for (const pin of ['S0', 'S1', 'EN']) b.wire(pin, 'Y', 'mux', pin);
    leds(b, 'mux', [['Y', 'muxy']]);
    b.add('DEMUX', 'dmx', { selectBits: 2, hasEnable: true });
    for (const pin of ['D', 'S0', 'S1', 'EN']) b.wire(pin, 'Y', 'dmx', pin);
    leds(b, 'dmx', [0, 1, 2, 3].map((i) => [`Y${i}`, `dmx${i}`] as [string, string]));
    b.add('DECODER', 'dec', { selectBits: 2, hasEnable: true, activeHigh: false });
    b.wire('S0', 'Y', 'dec', 'A0');
    b.wire('S1', 'Y', 'dec', 'A1');
    b.wire('EN', 'Y', 'dec', 'EN');
    leds(b, 'dec', [0, 1, 2, 3].map((i) => [`Y${i}`, `dec${i}`] as [string, string]));
    b.add('PRIORITY_ENCODER', 'enc', { selectBits: 2 });
    for (let i = 0; i < 4; i += 1) b.wire(`I${i}`, 'Y', 'enc', `I${i}`);
    leds(b, 'enc', [['Y0', 'enc0'], ['Y1', 'enc1'], ['V', 'encv']]);
    const vectors = Array.from({ length: 256 }, (_, i) => ({ S0: i & 1, S1: (i >> 1) & 1, EN: (i >> 2) & 1, D: (i >> 3) & 1, I0: (i >> 4) & 1, I1: (i >> 5) & 1, I2: (i >> 6) & 1, I3: (i >> 7) & 1 }));
    compare(b.doc, vectors);
  });

  it('a BCD to seven-segment decoder, active high and active low', () => {
    for (const activeHigh of [true, false]) {
      const b = new Builder();
      for (let i = 0; i < 4; i += 1) b.add('SWITCH', `D${i}`);
      b.add('SWITCH', 'EN');
      b.add('BCD_7SEG', 'bcd', { hasEnable: true, activeHigh });
      for (let i = 0; i < 4; i += 1) b.wire(`D${i}`, 'Y', 'bcd', `D${i}`);
      b.wire('EN', 'Y', 'bcd', 'EN');
      leds(b, 'bcd', 'ABCDEFG'.split('').map((s) => [s, `seg${s}`] as [string, string]));
      const vectors = Array.from({ length: 32 }, (_, i) => ({ D0: i & 1, D1: (i >> 1) & 1, D2: (i >> 2) & 1, D3: (i >> 3) & 1, EN: (i >> 4) & 1 }));
      compare(b.doc, vectors);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { runElectricalRuleCheck } from '../../src/tools/logic/analysis-engine';
import { channelCandidates } from '../../src/tools/logic/analyzer-engine';
import {
  aggregateLevel,
  busLabel,
  busLevels,
  busState,
  checkWireEnds,
  clampBusWidth,
  describeBus,
  formatBinary,
  formatBusValue,
  formatDecimal,
  formatHex,
  isBusPort,
  MAX_BUS_WIDTH,
  MIN_BUS_WIDTH,
  portBits,
  portWidth,
} from '../../src/tools/logic/bus-engine';
import { addComponent, addWire, createInitialDocument, relabelComponent, updateComponentParams, wireProblem } from '../../src/tools/logic/circuit-model';
import { getComponentPorts, getSimulationPorts } from '../../src/tools/logic/component-library';
import { parseProject, renderSchematicSvg, serializeProject } from '../../src/tools/logic/export-engine';
import type { LogicDocument, LogicLevel, PortDefinition } from '../../src/tools/logic/logic-types';
import { createInitialFrame, readLevel, step } from '../../src/tools/logic/sim-engine';

const scalar = (id: string, direction: PortDefinition['direction']): PortDefinition => ({ id, direction, label: id, x: 0, y: 0 });
const bus = (id: string, direction: PortDefinition['direction'], width: number): PortDefinition => ({
  id,
  direction,
  label: id,
  x: 0,
  y: 0,
  bus: { bits: Array.from({ length: width }, (_, index) => `${id}${index}`) },
});

describe('bus widths and ports', () => {
  it('clamps a hostile width into 2-32 and falls back for non-numbers', () => {
    expect(clampBusWidth(1)).toBe(MIN_BUS_WIDTH);
    expect(clampBusWidth(99)).toBe(MAX_BUS_WIDTH);
    expect(clampBusWidth(7.6)).toBe(8);
    expect(clampBusWidth('wide')).toBe(4);
    expect(clampBusWidth(Number.NaN)).toBe(4);
    expect(clampBusWidth(Infinity)).toBe(4);
    expect(clampBusWidth(undefined, 8)).toBe(8);
  });

  it('describes a port as a single pin or as the group of pins a bus stands for', () => {
    const wide = bus('D', 'input', 4);
    expect(isBusPort(wide)).toBe(true);
    expect(portBits(wide)).toEqual(['D0', 'D1', 'D2', 'D3']);
    expect(portWidth(wide)).toBe(4);
    expect(isBusPort(scalar('A', 'input'))).toBe(false);
    expect(portBits(scalar('A', 'input'))).toEqual(['A']);
    expect(portWidth(scalar('A', 'input'))).toBe(1);
    expect(busLabel('Q', 8)).toBe('Q[7:0]');
  });
});

describe('bus wiring rules', () => {
  it('lets equal-width buses connect, in either direction pairing but not input to input', () => {
    expect(checkWireEnds(bus('Q', 'output', 8), bus('D', 'input', 8)).ok).toBe(true);
    expect(checkWireEnds(bus('B', 'passive', 8), bus('D', 'input', 8)).ok).toBe(true);
    const twoInputs = checkWireEnds(bus('D', 'input', 8), bus('E', 'input', 8));
    expect(twoInputs.ok).toBe(false);
  });

  it('refuses widths that differ, and says both widths', () => {
    const result = checkWireEnds(bus('Q', 'output', 8), bus('D', 'input', 4));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason).toContain('8-bit');
    expect(!result.ok && result.reason).toContain('4-bit');
  });

  it('refuses a bus wired straight to a single pin, in either order, and points at the splitter', () => {
    for (const [a, b] of [[bus('Q', 'output', 4), scalar('A', 'input')], [scalar('Y', 'output'), bus('D', 'input', 4)]] as const) {
      const result = checkWireEnds(a, b);
      expect(result.ok).toBe(false);
      expect(!result.ok && result.reason).toMatch(/splitter/);
    }
  });

  it('keeps the plain single-pin rules: output to input is fine, input to input is not', () => {
    expect(checkWireEnds(scalar('Y', 'output'), scalar('A', 'input')).ok).toBe(true);
    expect(checkWireEnds(scalar('A', 'input'), scalar('B', 'input')).ok).toBe(false);
    expect(checkWireEnds(scalar('Y', 'output'), scalar('Z', 'output')).ok).toBe(true);
  });
});

describe('bus value readouts', () => {
  const lsbFirst = (text: string): LogicLevel[] => [...text].reverse().map((char) => (char === '0' ? 0 : char === '1' ? 1 : char === 'Z' ? 'Z' : 'X'));

  it('formats a known value in all three radices', () => {
    const levels = lsbFirst('1101');
    expect(formatBinary(levels)).toBe('1101');
    expect(formatHex(levels)).toBe('D');
    expect(formatDecimal(levels)).toBe('13');
    expect(formatBusValue(levels, 'binary')).toBe('1101');
    expect(formatBusValue(levels, 'hex')).toBe('0xD');
    expect(formatBusValue(levels, 'decimal')).toBe('13');
    expect(describeBus('Q', levels)).toBe('Q[3:0] = 1101 (0xD, 13)');
  });

  it('groups hex digits from the least significant end, including a partial top digit', () => {
    expect(formatHex(lsbFirst('11111111'))).toBe('FF');
    expect(formatHex(lsbFirst('101010101010'))).toBe('AAA');
    expect(formatHex(lsbFirst('1'.repeat(6)))).toBe('3F');
    expect(formatHex(lsbFirst('0'.repeat(16)))).toBe('0000');
    expect(formatDecimal(lsbFirst('1'.repeat(16)))).toBe('65535');
    expect(formatDecimal(lsbFirst('00000001'))).toBe('1');
  });

  it('shows unknown and floating bits as such instead of guessing a value', () => {
    expect(formatBinary(lsbFirst('1X0Z'))).toBe('1X0Z');
    expect(formatDecimal(lsbFirst('1X0Z'))).toBe('X');
    expect(formatDecimal(lsbFirst('ZZZZ'))).toBe('Z');
    expect(formatDecimal(lsbFirst('11ZZ'))).toBe('X');
  });

  it('lets one bad bit spoil only its own hex digit', () => {
    expect(formatHex(lsbFirst('1111' + '10X1'))).toBe('FX');
    expect(formatHex(lsbFirst('ZZZZ' + '0001'))).toBe('Z1');
    expect(formatHex(lsbFirst('11ZZ' + '0001'))).toBe('X1');
  });

  it('classifies the state of a whole bus', () => {
    expect(busState(lsbFirst('1010'))).toBe('known');
    expect(busState(lsbFirst('ZZZZ'))).toBe('floating');
    expect(busState(lsbFirst('10ZZ'))).toBe('unknown');
    expect(busState(lsbFirst('10X0'))).toBe('unknown');
  });

  it('reduces a bus to one drawing level: X beats Z beats a good value', () => {
    expect(aggregateLevel(lsbFirst('1010'))).toBe(1);
    expect(aggregateLevel(lsbFirst('10Z0'))).toBe('Z');
    expect(aggregateLevel(lsbFirst('10ZX'))).toBe('X');
  });

  it('reads a port\'s bits out of a level lookup', () => {
    const port = bus('Q', 'output', 3);
    const levels = busLevels(port, (pin) => ({ Q0: 1, Q1: 0, Q2: 'X' } as Record<string, LogicLevel>)[pin] ?? 'Z');
    expect(levels).toEqual([1, 0, 'X']);
  });
});

/** A switch labeled `label`, at a row. */
const addSwitch = (doc: LogicDocument, label: string, y: number): LogicDocument => {
  const withSwitch = addComponent(doc, 'SWITCH', 0, y);
  return relabelComponent(withSwitch, withSwitch.components[withSwitch.components.length - 1]!.id, label);
};
const lastId = (doc: LogicDocument): string => doc.components[doc.components.length - 1]!.id;

describe('bus splitter', () => {
  it('shows one bus port and one tap per bit, with the bus bits hidden but simulated', () => {
    const ports = getComponentPorts('BUS_SPLITTER', { busWidth: 4 });
    expect(ports.filter((port) => isBusPort(port)).map((port) => port.id)).toEqual(['B']);
    expect(ports.filter((port) => !isBusPort(port)).map((port) => port.id)).toEqual(['S0', 'S1', 'S2', 'S3']);
    expect(ports.every((port) => port.hidden !== true)).toBe(true);
    const simulated = getSimulationPorts('BUS_SPLITTER', { busWidth: 4 });
    expect(simulated.some((port) => isBusPort(port))).toBe(false);
    expect(simulated.map((port) => port.id).sort()).toEqual(['B0', 'B1', 'B2', 'B3', 'S0', 'S1', 'S2', 'S3']);
    expect(simulated.filter((port) => port.alias !== undefined).map((port) => [port.id, port.alias])).toEqual([['B0', 'S0'], ['B1', 'S1'], ['B2', 'S2'], ['B3', 'S3']]);
  });

  it('makes every pin passive so it works in either direction', () => {
    expect(getSimulationPorts('BUS_SPLITTER', { busWidth: 8 }).every((port) => port.direction === 'passive')).toBe(true);
  });

  it('follows its width parameter and clamps a hostile one', () => {
    expect(getComponentPorts('BUS_SPLITTER', { busWidth: 16 }).filter((port) => port.id.startsWith('S'))).toHaveLength(16);
    expect(getComponentPorts('BUS_SPLITTER', { busWidth: 500 }).filter((port) => port.id.startsWith('S'))).toHaveLength(32);
    expect(getComponentPorts('BUS_SPLITTER', { busWidth: 'lots' as unknown as number }).filter((port) => port.id.startsWith('S'))).toHaveLength(4);
  });

  it('never lays out two pins on the same edge row', () => {
    const ports = getComponentPorts('BUS_SPLITTER', { busWidth: 8 });
    for (const side of [(x: number) => x === 0, (x: number) => x > 0]) {
      const rows = ports.filter((port) => side(port.x)).map((port) => port.y);
      expect(new Set(rows).size).toBe(rows.length);
    }
  });
});

describe('data moving over a bus in the simulator', () => {
  /** N switches -> splitter A (taps) -> bus wire -> splitter B -> LEDs, so the bits must ride the bus to arrive. */
  const buildThroughBus = (width: number) => {
    let doc: LogicDocument = createInitialDocument();
    for (let index = 0; index < width; index += 1) doc = addSwitch(doc, `I${index}`, index * 2);
    const switches = doc.components.map((component) => component.id);
    doc = addComponent(doc, 'BUS_SPLITTER', 6, 0);
    const gather = lastId(doc);
    doc = updateComponentParams(doc, gather, { busWidth: width });
    doc = addComponent(doc, 'BUS_SPLITTER', 14, 0);
    const scatter = lastId(doc);
    doc = updateComponentParams(doc, scatter, { busWidth: width });
    const leds: string[] = [];
    for (let index = 0; index < width; index += 1) {
      doc = addComponent(doc, 'LED', 22, index * 2);
      leds.push(lastId(doc));
    }
    switches.forEach((id, index) => {
      doc = addWire(doc, { componentId: id, portId: 'Y' }, { componentId: gather, portId: `S${index}` });
      doc = addWire(doc, { componentId: scatter, portId: `S${index}` }, { componentId: leds[index]!, portId: 'A' });
    });
    doc = addWire(doc, { componentId: gather, portId: 'B' }, { componentId: scatter, portId: 'B' });
    return { doc, switches, leds };
  };

  it('carries every bit from the gathering splitter to the scattering one, whatever the pattern', () => {
    const { doc, switches, leds } = buildThroughBus(4);
    expect(doc.wires).toHaveLength(9);
    for (let pattern = 0; pattern < 16; pattern += 1) {
      const interactions = Object.fromEntries(switches.map((id, index) => [id, ((pattern >> index) & 1) as LogicLevel]));
      const frame = step({ document: doc, previous: createInitialFrame(doc), elapsedMs: 16, interactions });
      leds.forEach((led, index) => expect(readLevel(frame, led, 'A'), `pattern ${pattern} bit ${index}`).toBe(((pattern >> index) & 1) as LogicLevel));
    }
  });

  it('carries a 16-bit bus', () => {
    const { doc, switches, leds } = buildThroughBus(16);
    const interactions = Object.fromEntries(switches.map((id, index) => [id, (0xa5c3 >> index) & 1 ? 1 : 0])) as Record<string, LogicLevel>;
    const frame = step({ document: doc, previous: createInitialFrame(doc), elapsedMs: 16, interactions });
    const value = leds.reduce((total, led, index) => total + (readLevel(frame, led, 'A') === 1 ? 2 ** index : 0), 0);
    expect(value).toBe(0xa5c3);
  });

  it('leaves the far end floating (Z) for a bit whose source is unplugged', () => {
    const { doc, leds } = buildThroughBus(4);
    const gather = doc.components.find((component) => component.type === 'BUS_SPLITTER')!.id;
    const unplugged: LogicDocument = { ...doc, wires: doc.wires.filter((wire) => !(wire.to.componentId === gather && wire.to.portId === 'S0')) };
    const frame = step({ document: unplugged, previous: createInitialFrame(unplugged), elapsedMs: 16 });
    expect(readLevel(frame, leds[0]!, 'A')).toBe('Z');
    // The other bits are still driven (switches default to 0), so only the unplugged one floats.
    expect(readLevel(frame, leds[1]!, 'A')).toBe(0);
  });

  it('does not join buses of different widths, and refuses to draw that wire', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'BUS_SPLITTER', 0, 0);
    const wide = lastId(doc);
    doc = updateComponentParams(doc, wide, { busWidth: 8 });
    doc = addComponent(doc, 'BUS_SPLITTER', 10, 0);
    const narrow = lastId(doc);
    const refused = addWire(doc, { componentId: wide, portId: 'B' }, { componentId: narrow, portId: 'B' });
    expect(refused.wires).toEqual([]);
    expect(wireProblem(doc, { componentId: wide, portId: 'B' }, { componentId: narrow, portId: 'B' })).toMatch(/8-bit.*4-bit/);
    expect(wireProblem(doc, { componentId: wide, portId: 'B' }, { componentId: wide, portId: 'B' })).toBeUndefined();
    expect(wireProblem(doc, { componentId: wide, portId: 'B' }, { componentId: narrow, portId: 'S0' })).toMatch(/splitter/);
    expect(wireProblem(doc, { componentId: wide, portId: 'B' }, { componentId: 'gone', portId: 'B' })).toMatch(/no longer exists/);
    expect(wireProblem(doc, { componentId: wide, portId: 'S0' }, { componentId: narrow, portId: 'S0' })).toBeUndefined();
  });

  it('ignores a bus wire between mismatched widths that arrives through a hand-edited file rather than joining the wrong bits', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'BUS_SPLITTER', 0, 0);
    const wide = lastId(doc);
    doc = updateComponentParams(doc, wide, { busWidth: 8 });
    doc = addComponent(doc, 'BUS_SPLITTER', 10, 0);
    const narrow = lastId(doc);
    const forced: LogicDocument = { ...doc, wires: [{ id: 'w', from: { componentId: wide, portId: 'B' }, to: { componentId: narrow, portId: 'B' }, waypoints: [] }] };
    expect(() => step({ document: forced, previous: createInitialFrame(forced), elapsedMs: 16 })).not.toThrow();
    expect(() => parseProject(serializeProject(forced))).toThrow();
  });
});

describe('register and counter bus pins', () => {
  it('exposes D and Q as bus ports in bus mode, hides the per-bit pins, and keeps simulating them', () => {
    const visible = getComponentPorts('REGISTER', { bitWidth: 4, busPins: true });
    expect(visible.map((port) => port.id)).toEqual(['CLK', 'RST', 'D', 'Q']);
    expect(visible.filter(isBusPort).map((port) => [port.id, portWidth(port), port.direction])).toEqual([['D', 4, 'input'], ['Q', 4, 'output']]);
    const simulated = getSimulationPorts('REGISTER', { bitWidth: 4, busPins: true }).map((port) => port.id);
    for (const id of ['D0', 'D3', 'Q0', 'Q3']) expect(simulated).toContain(id);
    expect(simulated).not.toContain('D');
  });

  it('is unchanged without bus mode', () => {
    expect(getComponentPorts('REGISTER', { bitWidth: 4 }).map((port) => port.id)).toEqual(['CLK', 'RST', 'D0', 'D1', 'D2', 'D3', 'Q0', 'Q1', 'Q2', 'Q3']);
  });

  it('keeps a counter\'s terminal count as its own pin beside the Q bus, and its load data as a D bus', () => {
    const ports = getComponentPorts('COUNTER', { bitWidth: 4, busPins: true, hasLoad: true });
    expect(ports.map((port) => port.id)).toEqual(['CLK', 'RST', 'LOAD', 'D', 'Q', 'TC']);
    expect(getComponentPorts('COUNTER', { bitWidth: 4, busPins: true }).map((port) => port.id)).toEqual(['CLK', 'RST', 'Q', 'TC']);
  });

  it('captures a bus: switches -> splitter -> register D bus -> clock -> Q bus -> splitter -> LEDs', () => {
    let doc: LogicDocument = createInitialDocument();
    for (let index = 0; index < 4; index += 1) doc = addSwitch(doc, `I${index}`, index * 2);
    const switches = doc.components.map((component) => component.id);
    doc = addComponent(doc, 'SWITCH', 0, 12);
    const clock = lastId(doc);
    doc = addComponent(doc, 'BUS_SPLITTER', 6, 0);
    const inSplit = lastId(doc);
    doc = addComponent(doc, 'REGISTER', 12, 0);
    const register = lastId(doc);
    doc = updateComponentParams(doc, register, { bitWidth: 4, busPins: true });
    doc = addComponent(doc, 'BUS_SPLITTER', 20, 0);
    const outSplit = lastId(doc);
    const leds: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      doc = addComponent(doc, 'LED', 28, index * 2);
      leds.push(lastId(doc));
    }
    switches.forEach((id, index) => {
      doc = addWire(doc, { componentId: id, portId: 'Y' }, { componentId: inSplit, portId: `S${index}` });
      doc = addWire(doc, { componentId: outSplit, portId: `S${index}` }, { componentId: leds[index]!, portId: 'A' });
    });
    doc = addWire(doc, { componentId: inSplit, portId: 'B' }, { componentId: register, portId: 'D' });
    doc = addWire(doc, { componentId: register, portId: 'Q' }, { componentId: outSplit, portId: 'B' });
    doc = addWire(doc, { componentId: clock, portId: 'Y' }, { componentId: register, portId: 'CLK' });
    expect(doc.wires).toHaveLength(11);

    const drive = (pattern: number, clockLevel: LogicLevel, previous = createInitialFrame(doc)) =>
      step({ document: doc, previous, elapsedMs: 16, interactions: { ...Object.fromEntries(switches.map((id, index) => [id, ((pattern >> index) & 1) as LogicLevel])), [clock]: clockLevel } });
    const readLeds = (frame: ReturnType<typeof drive>) => leds.reduce((total, led, index) => total + (readLevel(frame, led, 'A') === 1 ? 2 ** index : 0), 0);

    let frame = drive(0b1010, 0);
    frame = drive(0b1010, 1, frame);
    expect(readLeds(frame)).toBe(0b1010);
    // Changing the inputs without a clock edge must not change what the register holds.
    frame = drive(0b0101, 1, frame);
    expect(readLeds(frame)).toBe(0b1010);
    frame = drive(0b0101, 0, frame);
    frame = drive(0b0101, 1, frame);
    expect(readLeds(frame)).toBe(0b0101);
  });

  it('counts through a bus and shows the count in every radix', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addSwitch(doc, 'CLK', 0);
    const clock = lastId(doc);
    doc = addComponent(doc, 'COUNTER', 6, 0);
    const counter = lastId(doc);
    doc = updateComponentParams(doc, counter, { bitWidth: 4, busPins: true });
    doc = addWire(doc, { componentId: clock, portId: 'Y' }, { componentId: counter, portId: 'CLK' });
    let frame = createInitialFrame(doc);
    const qPort = getComponentPorts('COUNTER', doc.components[1]!.params).find((port) => port.id === 'Q')!;
    for (let count = 1; count <= 5; count += 1) {
      frame = step({ document: doc, previous: frame, elapsedMs: 16, interactions: { [clock]: 0 } });
      frame = step({ document: doc, previous: frame, elapsedMs: 16, interactions: { [clock]: 1 } });
      const levels = busLevels(qPort, (pin) => readLevel(frame, counter, pin));
      expect(formatDecimal(levels)).toBe(String(count));
    }
    const levels = busLevels(qPort, (pin) => readLevel(frame, counter, pin));
    expect(describeBus('Q', levels)).toBe('Q[3:0] = 0101 (0x5, 5)');
  });

  it('drops a bus wire when its port disappears because bus mode was turned off (and the reverse)', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'BUS_SPLITTER', 0, 0);
    const split = lastId(doc);
    doc = addComponent(doc, 'REGISTER', 10, 0);
    const register = lastId(doc);
    doc = updateComponentParams(doc, register, { bitWidth: 4, busPins: true });
    doc = addWire(doc, { componentId: split, portId: 'B' }, { componentId: register, portId: 'D' });
    expect(doc.wires).toHaveLength(1);
    expect(updateComponentParams(doc, register, { busPins: false }).wires).toHaveLength(0);
    // Widening the register to 8 bits leaves its D bus wired to a 4-bit splitter: the widths no longer agree, so the wire goes.
    expect(updateComponentParams(doc, register, { bitWidth: 8 }).wires).toHaveLength(0);
    // Widening the splitter to match keeps the wire, and resizing it to a different width drops it.
    const wide = updateComponentParams(doc, split, { busWidth: 4 });
    expect(wide.wires).toHaveLength(1);
    expect(updateComponentParams(doc, split, { busWidth: 6 }).wires).toHaveLength(0);
    expect(updateComponentParams(doc, split, { busWidth: 999 }).components.find((c) => c.id === split)?.params.busWidth).toBe(32);
  });

  it('leaves the single-pin ERC findings for an unwired bus input, one per hidden bit, named by their part', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'REGISTER', 0, 0);
    doc = updateComponentParams(doc, lastId(doc), { bitWidth: 4, busPins: true });
    const label = doc.components[0]!.label;
    const messages = runElectricalRuleCheck(doc).filter((finding) => finding.type === 'floating_input').map((finding) => finding.message).join('\n');
    for (const bit of ['D0', 'D1', 'D2', 'D3']) expect(messages).toContain(`${label}.${bit}`);
  });

  it('offers the hidden bits of a bus as analyzer channels', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'REGISTER', 0, 0);
    doc = updateComponentParams(doc, lastId(doc), { bitWidth: 4, busPins: true });
    const labels = channelCandidates(doc).map((candidate) => candidate.label);
    for (const bit of ['Q0', 'Q1', 'Q2', 'Q3']) expect(labels).toContain(`${doc.components[0]!.label}.${bit}`);
    expect(labels.some((label) => /\.Q$/.test(label))).toBe(false);
  });
});

describe('bus projects', () => {
  it('round-trips a project containing a bus wire and a bus-mode register', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'BUS_SPLITTER', 0, 0);
    const split = lastId(doc);
    doc = addComponent(doc, 'REGISTER', 10, 0);
    const register = lastId(doc);
    doc = updateComponentParams(doc, register, { bitWidth: 4, busPins: true });
    doc = addWire(doc, { componentId: split, portId: 'B' }, { componentId: register, portId: 'D' });
    const restored = parseProject(serializeProject(doc));
    expect(restored.wires).toHaveLength(1);
    expect(restored.components.find((component) => component.id === register)?.params.busPins).toBe(true);
  });

  it('rejects a hand-edited file that joins a bus to a single pin', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'BUS_SPLITTER', 0, 0);
    const split = lastId(doc);
    doc = addComponent(doc, 'LED', 10, 0);
    const led = lastId(doc);
    const forged = { ...doc, wires: [{ id: 'w', from: { componentId: split, portId: 'B' }, to: { componentId: led, portId: 'A' }, waypoints: [] }] };
    expect(() => parseProject(JSON.stringify(forged))).toThrow();
  });

  it('draws bus ports and their bit-range labels in the SVG export', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'REGISTER', 2, 2);
    doc = updateComponentParams(doc, lastId(doc), { bitWidth: 8, busPins: true });
    const svg = renderSchematicSvg(doc);
    expect(svg).toContain('D[7:0]');
    expect(svg).toContain('Q[7:0]');
    expect(svg).not.toContain('NaN');
  });
  it('draws a bus wire thick with its width mark and bus pins as squares', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'BUS_SPLITTER', 0, 0);
    const a = lastId(doc);
    doc = addComponent(doc, 'BUS_SPLITTER', 12, 0);
    const b = lastId(doc);
    doc = addWire(doc, { componentId: a, portId: 'B' }, { componentId: b, portId: 'B' });
    expect(doc.wires).toHaveLength(1);
    const svg = renderSchematicSvg(doc);
    expect(svg).toMatch(/<polyline [^>]*stroke-width="4"/);
    expect(svg).toMatch(/<text [^>]*>4<\/text>/);
    expect(svg).toMatch(/<rect x="[^"]+" y="[^"]+" width="7" height="7"/);
    expect(svg).not.toContain('NaN');
  });
});

import { describe, expect, it } from 'vitest';
import { addComponent, addWire, createInitialDocument, setDelayMode } from '../../src/tools/logic/circuit-model';
import { createInitialFrame, readLevel, step } from '../../src/tools/logic/sim-engine';
import type { LogicDocument, LogicLevel } from '../../src/tools/logic/logic-types';

const advance = (document: LogicDocument, times = 1, interactions: Record<string, LogicLevel> = {}) => {
  let frame = createInitialFrame(document);
  for (let i = 0; i < times; i += 1) frame = step({ document, previous: frame, elapsedMs: 16, interactions: i === 0 ? interactions : {} });
  return frame;
};

const twoSwitchGate = (type: 'AND' | 'OR' | 'NAND' | 'NOR' | 'XOR' | 'XNOR', aLevel: 0 | 1, bLevel: 0 | 1) => {
  let doc = createInitialDocument();
  doc = addComponent(doc, 'SWITCH', 0, 0);
  const switchA = doc.components[0]!.id;
  doc = addComponent(doc, 'SWITCH', 0, 2);
  const switchB = doc.components[1]!.id;
  doc = addComponent(doc, type, 3, 1);
  const gate = doc.components[2]!.id;
  doc = addComponent(doc, 'LED', 6, 1);
  const led = doc.components[3]!.id;
  doc = addWire(doc, { componentId: switchA, portId: 'Y' }, { componentId: gate, portId: 'A' });
  doc = addWire(doc, { componentId: switchB, portId: 'Y' }, { componentId: gate, portId: 'B' });
  doc = addWire(doc, { componentId: gate, portId: 'Y' }, { componentId: led, portId: 'A' });
  const frame = advance(doc, 1, { [switchA]: aLevel, [switchB]: bLevel });
  return readLevel(frame, led, 'A');
};

describe('sim-engine combinational gates', () => {
  it('evaluates AND correctly for all input combinations', () => {
    expect(twoSwitchGate('AND', 0, 0)).toBe(0);
    expect(twoSwitchGate('AND', 1, 0)).toBe(0);
    expect(twoSwitchGate('AND', 0, 1)).toBe(0);
    expect(twoSwitchGate('AND', 1, 1)).toBe(1);
  });

  it('evaluates OR, NAND, NOR, XOR, XNOR correctly', () => {
    expect(twoSwitchGate('OR', 0, 0)).toBe(0);
    expect(twoSwitchGate('OR', 1, 0)).toBe(1);
    expect(twoSwitchGate('NAND', 1, 1)).toBe(0);
    expect(twoSwitchGate('NAND', 0, 0)).toBe(1);
    expect(twoSwitchGate('NOR', 0, 0)).toBe(1);
    expect(twoSwitchGate('NOR', 1, 0)).toBe(0);
    expect(twoSwitchGate('XOR', 1, 0)).toBe(1);
    expect(twoSwitchGate('XOR', 1, 1)).toBe(0);
    expect(twoSwitchGate('XNOR', 1, 1)).toBe(1);
    expect(twoSwitchGate('XNOR', 1, 0)).toBe(0);
  });

  it('reads a floating input as Z on an unconnected gate input', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'NOT', 0, 0);
    const gate = doc.components[0]!.id;
    const frame = advance(doc, 1);
    expect(readLevel(frame, gate, 'A')).toBe('Z');
    expect(readLevel(frame, gate, 'Y')).toBe('X');
  });

  it('detects output contention when two drivers disagree on one net', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'SWITCH', 0, 0);
    const switchA = doc.components[0]!.id;
    doc = addComponent(doc, 'SWITCH', 0, 2);
    const switchB = doc.components[1]!.id;
    doc = addComponent(doc, 'LED', 4, 1);
    const led = doc.components[2]!.id;
    doc = addWire(doc, { componentId: switchA, portId: 'Y' }, { componentId: led, portId: 'A' });
    doc = addWire(doc, { componentId: switchB, portId: 'Y' }, { componentId: led, portId: 'A' });
    const frame = advance(doc, 1, { [switchA]: 1, [switchB]: 0 });
    expect(readLevel(frame, led, 'A')).toBe('X');
  });
});

describe('sim-engine sequential elements', () => {
  it('latches D on the rising clock edge and holds otherwise', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'SWITCH', 0, 0);
    const dataSwitch = doc.components[0]!.id;
    doc = addComponent(doc, 'SWITCH', 0, 3);
    const clockSwitch = doc.components[1]!.id;
    doc = addComponent(doc, 'D_FLIP_FLOP', 3, 0);
    const flipFlop = doc.components[2]!.id;
    doc = addWire(doc, { componentId: dataSwitch, portId: 'Y' }, { componentId: flipFlop, portId: 'D' });
    doc = addWire(doc, { componentId: clockSwitch, portId: 'Y' }, { componentId: flipFlop, portId: 'CLK' });

    let frame = createInitialFrame(doc);
    frame = step({ document: doc, previous: frame, elapsedMs: 16, interactions: { [dataSwitch]: 1, [clockSwitch]: 0 } });
    expect(readLevel(frame, flipFlop, 'Q')).toBe(0);
    frame = step({ document: doc, previous: frame, elapsedMs: 16, interactions: { [clockSwitch]: 1 } });
    expect(readLevel(frame, flipFlop, 'Q')).toBe(1);
    expect(readLevel(frame, flipFlop, 'QN')).toBe(0);
    frame = step({ document: doc, previous: frame, elapsedMs: 16, interactions: { [dataSwitch]: 0 } });
    expect(readLevel(frame, flipFlop, 'Q')).toBe(1);
  });

  it('toggles a T flip-flop on every rising edge while T is held high', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'SWITCH', 0, 3);
    const clockSwitch = doc.components[0]!.id;
    doc = addComponent(doc, 'SWITCH', 0, 0);
    const tSwitch = doc.components[1]!.id;
    doc = addComponent(doc, 'T_FLIP_FLOP', 3, 0);
    const flipFlop = doc.components[2]!.id;
    doc = addWire(doc, { componentId: clockSwitch, portId: 'Y' }, { componentId: flipFlop, portId: 'CLK' });
    doc = addWire(doc, { componentId: tSwitch, portId: 'Y' }, { componentId: flipFlop, portId: 'T' });

    let frame = createInitialFrame(doc);
    frame = step({ document: doc, previous: frame, elapsedMs: 16, interactions: { [tSwitch]: 1 } });
    const setT = (level: 0 | 1) => { frame = step({ document: doc, previous: frame, elapsedMs: 16, interactions: { [clockSwitch]: level } }); };
    setT(0);
    setT(1);
    expect(readLevel(frame, flipFlop, 'Q')).toBe(1);
    setT(0);
    setT(1);
    expect(readLevel(frame, flipFlop, 'Q')).toBe(0);
  });

  it('resolves an SR latch and reports the invalid S=1,R=1 state as X', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'SWITCH', 0, 0);
    const setSwitch = doc.components[0]!.id;
    doc = addComponent(doc, 'SWITCH', 0, 2);
    const resetSwitch = doc.components[1]!.id;
    doc = addComponent(doc, 'SR_LATCH', 3, 0);
    const latch = doc.components[2]!.id;
    doc = addWire(doc, { componentId: setSwitch, portId: 'Y' }, { componentId: latch, portId: 'S' });
    doc = addWire(doc, { componentId: resetSwitch, portId: 'Y' }, { componentId: latch, portId: 'R' });

    let frame = createInitialFrame(doc);
    frame = step({ document: doc, previous: frame, elapsedMs: 16, interactions: { [setSwitch]: 1, [resetSwitch]: 0 } });
    expect(readLevel(frame, latch, 'Q')).toBe(1);
    frame = step({ document: doc, previous: frame, elapsedMs: 16, interactions: { [setSwitch]: 1, [resetSwitch]: 1 } });
    expect(readLevel(frame, latch, 'Q')).toBe('X');
  });
});

describe('sim-engine propagation delay', () => {
  it('delays a realistic-mode gate output until its configured delay has elapsed in ticks', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'SWITCH', 0, 0);
    const switchId = doc.components[0]!.id;
    doc = addComponent(doc, 'NOT', 3, 0);
    const gate = doc.components[1]!.id;
    doc = setDelayMode(doc, 'realistic');
    doc = addWire(doc, { componentId: switchId, portId: 'Y' }, { componentId: gate, portId: 'A' });

    let frame = createInitialFrame(doc);
    frame = step({ document: doc, previous: frame, elapsedMs: 16, interactions: { [switchId]: 1 } });
    expect(readLevel(frame, gate, 'Y')).toBe('Z');
    frame = step({ document: doc, previous: frame, elapsedMs: 16, interactions: {} });
    frame = step({ document: doc, previous: frame, elapsedMs: 16, interactions: {} });
    frame = step({ document: doc, previous: frame, elapsedMs: 16, interactions: {} });
    expect(readLevel(frame, gate, 'Y')).toBe(0);
  });

  it('settles a self-feedback NOT loop to an indeterminate X in ideal mode instead of hanging', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'NOT', 0, 0);
    const gate = doc.components[0]!.id;
    doc = addWire(doc, { componentId: gate, portId: 'Y' }, { componentId: gate, portId: 'A' });
    const frame = advance(doc, 1);
    expect(readLevel(frame, gate, 'Y')).toBe('X');
    expect(frame.hazards).toHaveLength(0);
  });
});

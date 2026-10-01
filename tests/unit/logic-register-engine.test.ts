import { describe, expect, it } from 'vitest';
import { checkTruthTableAvailability } from '../../src/tools/logic/analysis-engine';
import { addComponent, addWire, createInitialDocument, updateComponentParams } from '../../src/tools/logic/circuit-model';
import { COMPONENT_CATEGORIES, getComponentPorts } from '../../src/tools/logic/component-library';
import { parseProject, renderSchematicSvg, serializeProject } from '../../src/tools/logic/export-engine';
import type { ComponentParams, LogicDocument, LogicLevel } from '../../src/tools/logic/logic-types';
import {
  bitWidthOf,
  clampBitWidth,
  initialRegisterRuntime,
  isRippling,
  registerOutputs,
  registerPorts,
  registerTitle,
  restoreRegisterRuntime,
  shownBits,
  stepRegister,
  type RegisterRuntime,
  type RegisterType,
} from '../../src/tools/logic/register-engine';
import { createInitialFrame, readLevel, step } from '../../src/tools/logic/sim-engine';

const portIds = (type: RegisterType, params: ComponentParams, direction: 'input' | 'output') =>
  registerPorts(type, params)
    .filter((port) => port.direction === direction)
    .map((port) => port.id);

/** Drives one part through a list of per-tick pin levels, returning the runtime after every tick. */
const run = (type: RegisterType, params: ComponentParams, ticks: readonly Record<string, LogicLevel>[], ideal = true): RegisterRuntime[] => {
  const width = bitWidthOf(params);
  let runtime = initialRegisterRuntime(width);
  const history: RegisterRuntime[] = [];
  for (const pins of ticks) {
    runtime = stepRegister({ type, params, runtime, read: (portId) => pins[portId] ?? 'Z', ideal });
    history.push(runtime);
  }
  return history;
};

/** A clock pulse: low tick, then high tick (a rising edge on the second). */
const pulses = (count: number, extra: Record<string, LogicLevel> = {}): Record<string, LogicLevel>[] =>
  Array.from({ length: count * 2 }, (_, index) => ({ CLK: (index % 2 === 0 ? 0 : 1) as LogicLevel, RST: 0, ...extra }));

const valueOf = (runtime: RegisterRuntime, width: number): number =>
  shownBits(runtime, width).reduce<number>((total, bit, index) => total + (bit === 1 ? 2 ** index : 0), 0);

describe('register-engine pin layout', () => {
  it('lays a plain counter out with CLK and RST on the left and Q bits plus TC on the right', () => {
    expect(portIds('COUNTER', { bitWidth: 4 }, 'input')).toEqual(['CLK', 'RST']);
    expect(portIds('COUNTER', { bitWidth: 4 }, 'output')).toEqual(['Q0', 'Q1', 'Q2', 'Q3', 'TC']);
  });

  it('adds EN, LOAD, and the data pins in order when those options are on', () => {
    expect(portIds('COUNTER', { bitWidth: 3, hasEnable: true, hasLoad: true }, 'input')).toEqual(['CLK', 'EN', 'RST', 'LOAD', 'D0', 'D1', 'D2']);
  });

  it('gives a register data pins always, no load pin, and no terminal-count output', () => {
    expect(portIds('REGISTER', { bitWidth: 2 }, 'input')).toEqual(['CLK', 'RST', 'D0', 'D1']);
    expect(portIds('REGISTER', { bitWidth: 2, hasLoad: true }, 'input')).toEqual(['CLK', 'RST', 'D0', 'D1']);
    expect(portIds('REGISTER', { bitWidth: 2 }, 'output')).toEqual(['Q0', 'Q1']);
  });

  it('places every pin on its own grid row per side so nothing overlaps', () => {
    const ports = registerPorts('COUNTER', { bitWidth: 8, hasEnable: true, hasLoad: true });
    for (const side of ['input', 'output'] as const) {
      const rows = ports.filter((port) => port.direction === side).map((port) => port.y);
      expect(new Set(rows).size).toBe(rows.length);
    }
  });

  it('clamps a hostile bit width into 2-8 and falls back for non-numbers', () => {
    expect(clampBitWidth(1)).toBe(2);
    expect(clampBitWidth(99)).toBe(8);
    expect(clampBitWidth(5.4)).toBe(5);
    expect(clampBitWidth('wide')).toBe(4);
    expect(clampBitWidth(Number.NaN)).toBe(4);
    expect(clampBitWidth(Infinity)).toBe(4);
    expect(registerPorts('REGISTER', { bitWidth: 400 }).filter((port) => port.direction === 'output')).toHaveLength(8);
  });

  it('titles each part with its width, direction, and clocking', () => {
    expect(registerTitle('COUNTER', { bitWidth: 4 })).toBe('CTR 4b UP');
    expect(registerTitle('COUNTER', { bitWidth: 4, countDown: true })).toBe('CTR 4b DN');
    expect(registerTitle('COUNTER', { bitWidth: 6, asyncRipple: true })).toBe('RIP 6b UP');
    expect(registerTitle('REGISTER', { bitWidth: 8 })).toBe('REG 8b');
  });

  it('is offered in its own palette group', () => {
    const group = COMPONENT_CATEGORIES.find((entry) => entry.category === 'register');
    expect(group?.types).toEqual(['COUNTER', 'REGISTER']);
  });
});

describe('register-engine counting', () => {
  it('counts up on each rising edge and wraps to zero after the last state', () => {
    const history = run('COUNTER', { bitWidth: 2 }, pulses(5));
    const values = history.filter((_, index) => index % 2 === 1).map((runtime) => valueOf(runtime, 2));
    expect(values).toEqual([1, 2, 3, 0, 1]);
  });

  it('counts down and wraps from zero to the top state', () => {
    const history = run('COUNTER', { bitWidth: 3, countDown: true }, pulses(3));
    const values = history.filter((_, index) => index % 2 === 1).map((runtime) => valueOf(runtime, 3));
    expect(values).toEqual([7, 6, 5]);
  });

  it('counts only on the configured clock edge', () => {
    const sequence = [{ CLK: 0, RST: 0 }, { CLK: 1, RST: 0 }, { CLK: 0, RST: 0 }] as const;
    const rising = run('COUNTER', { bitWidth: 2 }, sequence).map((runtime) => valueOf(runtime, 2));
    expect(rising).toEqual([0, 1, 1]);
    const falling = run('COUNTER', { bitWidth: 2, edge: 'falling' }, sequence).map((runtime) => valueOf(runtime, 2));
    expect(falling).toEqual([0, 0, 1]);
  });

  it('raises the terminal-count flag at the last state of the counting direction', () => {
    const up = run('COUNTER', { bitWidth: 2 }, pulses(3)).at(-1)!;
    expect(registerOutputs('COUNTER', { bitWidth: 2 }, up).TC).toBe(1);
    const upEarly = run('COUNTER', { bitWidth: 2 }, pulses(2)).at(-1)!;
    expect(registerOutputs('COUNTER', { bitWidth: 2 }, upEarly).TC).toBe(0);

    const down = run('COUNTER', { bitWidth: 2, countDown: true }, [{ CLK: 0, RST: 0 }]).at(-1)!;
    expect(registerOutputs('COUNTER', { bitWidth: 2, countDown: true }, down).TC).toBe(1);
  });

  it('holds while enable is low, counts while high, and goes unknown when enable floats', () => {
    const params = { bitWidth: 2, hasEnable: true };
    const held = run('COUNTER', params, pulses(2, { EN: 0 })).at(-1)!;
    expect(valueOf(held, 2)).toBe(0);
    const counting = run('COUNTER', params, pulses(2, { EN: 1 })).at(-1)!;
    expect(valueOf(counting, 2)).toBe(2);
    const floating = run('COUNTER', params, pulses(1, { EN: 'Z' })).at(-1)!;
    expect(registerOutputs('COUNTER', params, floating)).toMatchObject({ Q0: 'X', Q1: 'X', TC: 'X' });
  });

  it('loads the data pins on the clock edge instead of counting, then resumes counting', () => {
    const params = { bitWidth: 3, hasLoad: true };
    const loaded = run('COUNTER', params, pulses(1, { LOAD: 1, D0: 1, D1: 0, D2: 1 })).at(-1)!;
    expect(valueOf(loaded, 3)).toBe(5);
    const resumed = run('COUNTER', params, [...pulses(1, { LOAD: 1, D0: 1, D1: 0, D2: 1 }), ...pulses(1, { LOAD: 0 })]).at(-1)!;
    expect(valueOf(resumed, 3)).toBe(6);
  });

  it('does not load until the clock edge arrives (the load is synchronous)', () => {
    const params = { bitWidth: 2, hasLoad: true };
    const beforeEdge = run('COUNTER', params, [{ CLK: 0, RST: 0, LOAD: 1, D0: 1, D1: 1 }]).at(-1)!;
    expect(valueOf(beforeEdge, 2)).toBe(0);
  });

  it('stores a floating data pin as unknown when loading', () => {
    const params = { bitWidth: 2, hasLoad: true };
    const loaded = run('COUNTER', params, pulses(1, { LOAD: 1, D0: 1 })).at(-1)!;
    expect(registerOutputs('COUNTER', params, loaded)).toMatchObject({ Q0: 1, Q1: 'X' });
  });

  it('turns every bit unknown once a bit is unknown and the counter tries to count', () => {
    const params = { bitWidth: 2, hasLoad: true };
    const unknown = run('COUNTER', params, [...pulses(1, { LOAD: 1, D0: 1 }), ...pulses(1, { LOAD: 0 })]).at(-1)!;
    expect(registerOutputs('COUNTER', params, unknown)).toMatchObject({ Q0: 'X', Q1: 'X' });
  });

  it('clears asynchronously on an asserted reset without waiting for a clock edge', () => {
    const counted = run('COUNTER', { bitWidth: 3 }, [...pulses(3), { CLK: 0, RST: 1 }]).at(-1)!;
    expect(valueOf(counted, 3)).toBe(0);
  });

  it('honors an active-low reset and treats a floating reset as released', () => {
    const low = { bitWidth: 2, activeHigh: false };
    expect(valueOf(run('COUNTER', low, [...pulses(2, { RST: 1 })]).at(-1)!, 2)).toBe(2);
    expect(valueOf(run('COUNTER', low, [...pulses(2, { RST: 1 }), { CLK: 0, RST: 0 }]).at(-1)!, 2)).toBe(0);
    expect(valueOf(run('COUNTER', { bitWidth: 2 }, pulses(2, { RST: 'Z' })).at(-1)!, 2)).toBe(2);
  });

  it('lets reset win over a coincident clock edge', () => {
    const runtime = run('COUNTER', { bitWidth: 2 }, [{ CLK: 0, RST: 1 }, { CLK: 1, RST: 1 }]).at(-1)!;
    expect(valueOf(runtime, 2)).toBe(0);
  });
});

describe('register-engine parallel registers', () => {
  it('captures the data pins on the rising edge and holds them between edges', () => {
    const history = run('REGISTER', { bitWidth: 3 }, [
      { CLK: 0, RST: 0, D0: 1, D1: 0, D2: 1 },
      { CLK: 1, RST: 0, D0: 1, D1: 0, D2: 1 },
      { CLK: 1, RST: 0, D0: 0, D1: 1, D2: 0 },
    ]);
    expect(valueOf(history[0]!, 3)).toBe(0);
    expect(valueOf(history[1]!, 3)).toBe(5);
    expect(valueOf(history[2]!, 3)).toBe(5);
  });

  it('only captures while enabled and clears on reset', () => {
    const params = { bitWidth: 2, hasEnable: true };
    const off = run('REGISTER', params, pulses(1, { EN: 0, D0: 1, D1: 1 })).at(-1)!;
    expect(valueOf(off, 2)).toBe(0);
    const on = run('REGISTER', params, pulses(1, { EN: 1, D0: 1, D1: 1 })).at(-1)!;
    expect(valueOf(on, 2)).toBe(3);
    const cleared = run('REGISTER', params, [...pulses(1, { EN: 1, D0: 1, D1: 1 }), { CLK: 0, RST: 1, EN: 1 }]).at(-1)!;
    expect(valueOf(cleared, 2)).toBe(0);
  });

  it('stores unconnected data pins as unknown rather than high-Z', () => {
    const captured = run('REGISTER', { bitWidth: 2 }, pulses(1, { D0: 0 })).at(-1)!;
    expect(registerOutputs('REGISTER', { bitWidth: 2 }, captured)).toEqual({ Q0: 0, Q1: 'X' });
  });
});

describe('register-engine ripple timing', () => {
  const rippleParams = { bitWidth: 4, asyncRipple: true };
  const countTo = (count: number): RegisterRuntime[] => run('COUNTER', rippleParams, pulses(count), false);

  it('changes all bits together in the zero-delay mode even for a ripple counter', () => {
    const history = run('COUNTER', rippleParams, pulses(8), true);
    expect(valueOf(history.at(-1)!, 4)).toBe(8);
    expect(isRippling(history.at(-1)!, 4)).toBe(false);
  });

  it('passes through the classic transient states when 0111 rolls over to 1000', () => {
    // Seven clean counts, then every state seen after the eighth edge.
    let runtime = countTo(7).at(-1)!;
    // Let the seventh count finish rippling before the next edge.
    for (let index = 0; index < 5; index += 1) runtime = stepRegister({ type: 'COUNTER', params: rippleParams, runtime, read: (id) => (id === 'CLK' ? 1 : 0), ideal: false });
    expect(valueOf(runtime, 4)).toBe(7);

    const seen: number[] = [];
    runtime = stepRegister({ type: 'COUNTER', params: rippleParams, runtime, read: (id) => (id === 'CLK' ? 0 : 0), ideal: false });
    runtime = stepRegister({ type: 'COUNTER', params: rippleParams, runtime, read: (id) => (id === 'CLK' ? 1 : 0), ideal: false });
    seen.push(valueOf(runtime, 4));
    while (isRippling(runtime, 4)) {
      runtime = stepRegister({ type: 'COUNTER', params: rippleParams, runtime, read: (id) => (id === 'CLK' ? 1 : 0), ideal: false });
      seen.push(valueOf(runtime, 4));
    }
    expect(seen).toEqual([6, 4, 0, 8]);
  });

  it('keeps reporting the terminal count from the values currently shown, not the settled ones', () => {
    let runtime = countTo(1).at(-1)!;
    expect(isRippling(runtime, 4)).toBe(true);
    runtime = stepRegister({ type: 'COUNTER', params: rippleParams, runtime, read: (id) => (id === 'CLK' ? 1 : 0), ideal: false });
    expect(registerOutputs('COUNTER', rippleParams, runtime).TC).toBe(0);
  });

  it('clears immediately on reset even in the middle of a ripple', () => {
    const runtime = stepRegister({ type: 'COUNTER', params: rippleParams, runtime: countTo(3).at(-1)!, read: (id) => (id === 'RST' ? 1 : 0), ideal: false });
    expect(valueOf(runtime, 4)).toBe(0);
    expect(isRippling(runtime, 4)).toBe(false);
  });
});

describe('register-engine runtime restoration', () => {
  it('pads or truncates saved bits when a part is resized, and tolerates missing state', () => {
    const restored = restoreRegisterRuntime({ registerBits: [1, 1, 1, 1], registerPreviousBits: [1, 1, 1, 1], rippleStage: 4 }, 2);
    expect(restored.bits).toEqual([1, 1]);
    expect(restoreRegisterRuntime({ registerBits: [1] }, 3).bits).toEqual([1, 0, 0]);
    expect(restoreRegisterRuntime(undefined, 3)).toMatchObject({ bits: [0, 0, 0], rippleStage: 3 });
  });

  it('bounds an out-of-range ripple stage from a hand-edited state', () => {
    expect(restoreRegisterRuntime({ rippleStage: 99 }, 4).rippleStage).toBe(4);
    expect(restoreRegisterRuntime({ rippleStage: -3 }, 4).rippleStage).toBe(0);
  });
});

describe('register integration through the simulator, model, and export', () => {
  const build = (params: ComponentParams = { bitWidth: 2 }) => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'SWITCH', 0, 0);
    const clock = doc.components[0]!.id;
    doc = addComponent(doc, 'COUNTER', 5, 0);
    const counter = doc.components[1]!.id;
    doc = updateComponentParams(doc, counter, params);
    doc = addWire(doc, { componentId: clock, portId: 'Y' }, { componentId: counter, portId: 'CLK' });
    return { doc, clock, counter };
  };

  const pulseOnce = (doc: LogicDocument, clock: string, frame: ReturnType<typeof createInitialFrame>) => {
    const low = step({ document: doc, previous: frame, elapsedMs: 16, interactions: { [clock]: 0 } });
    return step({ document: doc, previous: low, elapsedMs: 16, interactions: { [clock]: 1 } });
  };

  it('counts wired clock edges through the simulator and exposes each bit on its pin', () => {
    const { doc, clock, counter } = build();
    let frame = createInitialFrame(doc);
    const seen: number[] = [];
    for (let index = 0; index < 4; index += 1) {
      frame = pulseOnce(doc, clock, frame);
      seen.push((readLevel(frame, counter, 'Q0') === 1 ? 1 : 0) + (readLevel(frame, counter, 'Q1') === 1 ? 2 : 0));
    }
    expect(seen).toEqual([1, 2, 3, 0]);
    expect(readLevel(frame, counter, 'TC')).toBe(0);
  });

  it('shows the transient ripple states across ticks in realistic delay mode', () => {
    const { doc: base, clock, counter } = build({ bitWidth: 3, asyncRipple: true });
    const doc: LogicDocument = { ...base, simulation: { ...base.simulation, delayMode: 'realistic' } };
    let frame = createInitialFrame(doc);
    const read = () => [0, 1, 2].reduce<number>((total, bit) => total + (readLevel(frame, counter, `Q${bit}`) === 1 ? 2 ** bit : 0), 0);
    for (let index = 0; index < 4; index += 1) {
      frame = pulseOnce(doc, clock, frame);
      for (let settle = 0; settle < 4; settle += 1) frame = step({ document: doc, previous: frame, elapsedMs: 16, interactions: { [clock]: 1 } });
    }
    expect(read()).toBe(4);
  });

  it('prunes wires to pins that vanish when a counter is narrowed or its options are removed', () => {
    let { doc, clock, counter } = build({ bitWidth: 4, hasLoad: true });
    doc = addComponent(doc, 'SWITCH', 0, 6);
    const data = doc.components[2]!.id;
    doc = addWire(doc, { componentId: data, portId: 'Y' }, { componentId: counter, portId: 'D3' });
    expect(doc.wires).toHaveLength(2);
    doc = updateComponentParams(doc, counter, { bitWidth: 2 });
    expect(doc.wires).toHaveLength(1);
    expect(doc.wires[0]!.from.componentId).toBe(clock);
    doc = addWire(doc, { componentId: data, portId: 'Y' }, { componentId: counter, portId: 'D1' });
    doc = updateComponentParams(doc, counter, { hasLoad: false });
    expect(doc.wires).toHaveLength(1);
  });

  it('normalizes an out-of-range width through the model', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'REGISTER', 0, 0);
    doc = updateComponentParams(doc, doc.components[0]!.id, { bitWidth: 500 });
    expect(doc.components[0]!.params.bitWidth).toBe(8);
  });

  it('survives an imported project whose width is a hostile value', () => {
    const { doc } = build();
    const hostile = JSON.parse(serializeProject(doc)) as { components: { type: string; params: Record<string, unknown> }[] };
    const counter = hostile.components.find((component) => component.type === 'COUNTER')!;
    counter.params.bitWidth = 'lots';
    counter.params.hasLoad = 'yes';
    const parsed = parseProject(JSON.stringify({ ...hostile, wires: [] }));
    const frame = step({ document: parsed, previous: createInitialFrame(parsed), elapsedMs: 16 });
    expect(Object.keys(frame.portLevels).length).toBeGreaterThan(0);
    expect(getComponentPorts('COUNTER', parsed.components.find((component) => component.type === 'COUNTER')!.params).some((port) => port.id === 'Q3')).toBe(true);
  });

  it('round-trips a project containing counters and registers', () => {
    const { doc } = build({ bitWidth: 5, countDown: true, asyncRipple: true });
    const restored = parseProject(serializeProject(doc));
    expect(restored.components.find((component) => component.type === 'COUNTER')?.params).toMatchObject({ bitWidth: 5, countDown: true, asyncRipple: true });
  });

  it('exports the caption, pin names, and bit outputs of a counter as SVG', () => {
    const { doc } = build({ bitWidth: 3 });
    const svg = renderSchematicSvg(doc);
    expect(svg).toContain('CTR 3b UP');
    for (const label of ['CLK', 'RST', 'Q0', 'Q2', 'TC']) expect(svg).toContain(`>${label}<`);
    expect(svg).not.toContain('NaN');
  });

  it('refuses a truth table for a circuit that contains a counter', () => {
    const { doc } = build();
    const availability = checkTruthTableAvailability(doc);
    expect(availability.ok).toBe(false);
    expect(availability.reason).toMatch(/counters/);
  });
});

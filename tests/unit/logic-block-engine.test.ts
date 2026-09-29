import { describe, expect, it } from 'vitest';
import { generateTruthTable, runElectricalRuleCheck } from '../../src/tools/logic/analysis-engine';
import {
  blockPorts,
  blockSizeLabel,
  blockTitle,
  clampSelectBits,
  evaluateBlock,
  hasEnablePin,
  isBlockType,
  selectBitsOf,
} from '../../src/tools/logic/block-engine';
import { addComponent, addWire, createInitialDocument, mirrorComponent, relabelComponent, rotateComponent, updateComponentParams } from '../../src/tools/logic/circuit-model';
import { componentLabelAnchor } from '../../src/tools/logic/gate-shapes';
import { clampInputCount, COMPONENT_CATEGORIES, getComponentPorts } from '../../src/tools/logic/component-library';
import { parseProject, renderSchematicSvg, serializeProject } from '../../src/tools/logic/export-engine';
import type { ComponentParams, LogicDocument, LogicLevel } from '../../src/tools/logic/logic-types';
import { createInitialFrame, readLevel, step } from '../../src/tools/logic/sim-engine';

const portIds = (type: Parameters<typeof blockPorts>[0], params: ComponentParams, direction: 'input' | 'output') =>
  blockPorts(type, params).filter((port) => port.direction === direction).map((port) => port.id);

describe('block-engine pin layouts', () => {
  it('lays out a 4:1 multiplexer with four data lines, two selects, and one output', () => {
    expect(portIds('MUX', { selectBits: 2 }, 'input')).toEqual(['D0', 'D1', 'D2', 'D3', 'S0', 'S1']);
    expect(portIds('MUX', { selectBits: 2 }, 'output')).toEqual(['Y']);
  });

  it('adds an EN pin only when asked, and never to a priority encoder', () => {
    expect(portIds('MUX', { selectBits: 1 }, 'input')).toEqual(['D0', 'D1', 'S0']);
    expect(portIds('MUX', { selectBits: 1, hasEnable: true }, 'input')).toEqual(['D0', 'D1', 'S0', 'EN']);
    expect(portIds('DEMUX', { selectBits: 1, hasEnable: true }, 'input')).toEqual(['D', 'S0', 'EN']);
    expect(portIds('DECODER', { selectBits: 2, hasEnable: true }, 'input')).toEqual(['A0', 'A1', 'EN']);
    expect(hasEnablePin('PRIORITY_ENCODER', { hasEnable: true })).toBe(false);
    expect(portIds('PRIORITY_ENCODER', { selectBits: 2, hasEnable: true }, 'input')).toEqual(['I0', 'I1', 'I2', 'I3']);
  });

  it('exposes 2^n demultiplexer/decoder outputs and an encoder valid flag', () => {
    expect(portIds('DEMUX', { selectBits: 3 }, 'output')).toHaveLength(8);
    expect(portIds('DECODER', { selectBits: 4 }, 'output')).toHaveLength(16);
    expect(portIds('PRIORITY_ENCODER', { selectBits: 3 }, 'output')).toEqual(['Y0', 'Y1', 'Y2', 'V']);
  });

  it('places every pin on a unique row of its own edge, inside the body', () => {
    for (const type of ['MUX', 'DEMUX', 'DECODER', 'PRIORITY_ENCODER'] as const) {
      for (let bits = 1; bits <= 4; bits += 1) {
        const ports = blockPorts(type, { selectBits: bits, hasEnable: true });
        const left = ports.filter((port) => port.direction === 'input').map((port) => port.y);
        const right = ports.filter((port) => port.direction === 'output').map((port) => port.y);
        expect(new Set(left).size).toBe(left.length);
        expect(new Set(right).size).toBe(right.length);
        expect(ports.every((port) => Number.isInteger(port.y) && port.y >= 0)).toBe(true);
      }
    }
  });

  it('clamps hostile or missing select widths into the supported 1-4 range', () => {
    expect(clampSelectBits(undefined)).toBe(2);
    expect(clampSelectBits(0)).toBe(1);
    expect(clampSelectBits(99)).toBe(4);
    expect(clampSelectBits(Number.NaN)).toBe(2);
    expect(clampSelectBits(Infinity)).toBe(2);
    expect(clampSelectBits('3')).toBe(2);
    expect(clampSelectBits({})).toBe(2);
    expect(clampSelectBits(2.6)).toBe(3);
    expect(selectBitsOf('PRIORITY_ENCODER', {})).toBe(3);
    expect(getComponentPorts('MUX', { selectBits: 1e9 }).filter((port) => port.direction === 'input')).toHaveLength(16 + 4);
  });

  it('also keeps gate input counts finite when an imported value is not a number', () => {
    expect(clampInputCount('abc')).toBe(2);
    expect(clampInputCount(Number.NaN)).toBe(2);
    expect(clampInputCount(null)).toBe(2);
    expect(clampInputCount(5)).toBe(5);
  });

  it('names the size in the caption and the inspector', () => {
    expect(blockTitle('MUX', { selectBits: 3 })).toBe('MUX 8:1');
    expect(blockTitle('DEMUX', { selectBits: 2 })).toBe('DEMUX 1:4');
    expect(blockTitle('DECODER', { selectBits: 3 })).toBe('DEC 3:8');
    expect(blockTitle('PRIORITY_ENCODER', {})).toBe('ENC 8:3');
    expect(blockSizeLabel('MUX', 1)).toBe('2:1 multiplexer');
    expect(blockSizeLabel('DECODER', 4)).toBe('4-to-16 decoder');
  });

  it('is recognized by the type guard and appears in the palette', () => {
    expect(isBlockType('MUX')).toBe(true);
    expect(isBlockType('AND')).toBe(false);
    const group = COMPONENT_CATEGORIES.find((category) => category.category === 'combinational');
    expect(group?.types).toEqual(['MUX', 'DEMUX', 'DECODER', 'PRIORITY_ENCODER']);
  });
});

const lv = (values: Record<string, LogicLevel>) => values;

describe('block-engine multiplexer behavior', () => {
  it('selects the addressed data line for every 4:1 combination', () => {
    for (let data = 0; data < 16; data += 1) {
      for (let select = 0; select < 4; select += 1) {
        const inputs = lv({
          D0: (data & 1) as 0 | 1, D1: ((data >> 1) & 1) as 0 | 1, D2: ((data >> 2) & 1) as 0 | 1, D3: ((data >> 3) & 1) as 0 | 1,
          S0: (select & 1) as 0 | 1, S1: ((select >> 1) & 1) as 0 | 1,
        });
        expect(evaluateBlock('MUX', { selectBits: 2 }, inputs).Y).toBe(((data >> select) & 1) as 0 | 1);
      }
    }
  });

  it('forces the output low when EN is low and is indeterminate when EN is unknown', () => {
    const base = { D0: 1, D1: 1, S0: 0 } as const;
    expect(evaluateBlock('MUX', { selectBits: 1, hasEnable: true }, lv({ ...base, EN: 1 })).Y).toBe(1);
    expect(evaluateBlock('MUX', { selectBits: 1, hasEnable: true }, lv({ ...base, EN: 0 })).Y).toBe(0);
    expect(evaluateBlock('MUX', { selectBits: 1, hasEnable: true }, lv({ ...base, EN: 'Z' })).Y).toBe('X');
    expect(evaluateBlock('MUX', { selectBits: 1, hasEnable: true }, lv({ D0: 0, D1: 0, S0: 0, EN: 'X' })).Y).toBe(0);
  });

  it('resolves an unknown select only when every candidate agrees', () => {
    expect(evaluateBlock('MUX', { selectBits: 1 }, lv({ D0: 1, D1: 1, S0: 'Z' })).Y).toBe(1);
    expect(evaluateBlock('MUX', { selectBits: 1 }, lv({ D0: 0, D1: 1, S0: 'Z' })).Y).toBe('X');
    expect(evaluateBlock('MUX', { selectBits: 2 }, lv({ D0: 1, D1: 1, D2: 0, D3: 0, S0: 'X', S1: 0 })).Y).toBe(1);
    expect(evaluateBlock('MUX', { selectBits: 2 }, lv({ D0: 1, D1: 1, D2: 0, D3: 0, S0: 'X', S1: 1 })).Y).toBe(0);
  });

  it('reports X for a floating selected data line', () => {
    expect(evaluateBlock('MUX', { selectBits: 1 }, lv({ D0: 'Z', D1: 1, S0: 0 })).Y).toBe('X');
    expect(evaluateBlock('MUX', { selectBits: 1 }, lv({ D0: 'Z', D1: 1, S0: 1 })).Y).toBe(1);
  });
});

describe('block-engine demultiplexer and decoder behavior', () => {
  it('routes D to exactly the addressed output and holds the rest at 0', () => {
    for (let select = 0; select < 8; select += 1) {
      const outputs = evaluateBlock('DEMUX', { selectBits: 3 }, lv({ D: 1, S0: (select & 1) as 0 | 1, S1: ((select >> 1) & 1) as 0 | 1, S2: ((select >> 2) & 1) as 0 | 1 }));
      for (let index = 0; index < 8; index += 1) expect(outputs[`Y${index}`]).toBe(index === select ? 1 : 0);
    }
  });

  it('keeps every output low for D = 0 even when the select is unknown', () => {
    const outputs = evaluateBlock('DEMUX', { selectBits: 2 }, lv({ D: 0, S0: 'Z', S1: 'X' }));
    expect(Object.values(outputs).every((level) => level === 0)).toBe(true);
  });

  it('marks only the candidate outputs X when D = 1 and a select bit is unknown', () => {
    const outputs = evaluateBlock('DEMUX', { selectBits: 2 }, lv({ D: 1, S0: 'Z', S1: 1 }));
    expect(outputs).toEqual({ Y0: 0, Y1: 0, Y2: 'X', Y3: 'X' });
  });

  it('gates the demultiplexer with EN', () => {
    expect(evaluateBlock('DEMUX', { selectBits: 1, hasEnable: true }, lv({ D: 1, S0: 1, EN: 0 }))).toEqual({ Y0: 0, Y1: 0 });
    expect(evaluateBlock('DEMUX', { selectBits: 1, hasEnable: true }, lv({ D: 1, S0: 1, EN: 1 }))).toEqual({ Y0: 0, Y1: 1 });
  });

  it('decodes an address to one active-high line', () => {
    for (let address = 0; address < 4; address += 1) {
      const outputs = evaluateBlock('DECODER', { selectBits: 2, activeHigh: true }, lv({ A0: (address & 1) as 0 | 1, A1: ((address >> 1) & 1) as 0 | 1 }));
      for (let index = 0; index < 4; index += 1) expect(outputs[`Y${index}`]).toBe(index === address ? 1 : 0);
    }
  });

  it('inverts every line for an active-low decoder, including when disabled', () => {
    const selected = evaluateBlock('DECODER', { selectBits: 2, activeHigh: false, hasEnable: true }, lv({ A0: 1, A1: 0, EN: 1 }));
    expect(selected).toEqual({ Y0: 1, Y1: 0, Y2: 1, Y3: 1 });
    const disabled = evaluateBlock('DECODER', { selectBits: 2, activeHigh: false, hasEnable: true }, lv({ A0: 1, A1: 0, EN: 0 }));
    expect(disabled).toEqual({ Y0: 1, Y1: 1, Y2: 1, Y3: 1 });
    const disabledHigh = evaluateBlock('DECODER', { selectBits: 2, activeHigh: true, hasEnable: true }, lv({ A0: 1, A1: 0, EN: 0 }));
    expect(disabledHigh).toEqual({ Y0: 0, Y1: 0, Y2: 0, Y3: 0 });
  });
});

describe('block-engine priority encoder behavior', () => {
  const encode = (requests: readonly LogicLevel[], bits = 2) =>
    evaluateBlock('PRIORITY_ENCODER', { selectBits: bits }, Object.fromEntries(requests.map((level, index) => [`I${index}`, level])));

  it('reports the highest asserted request and a valid flag', () => {
    expect(encode([0, 1, 0, 0])).toEqual({ Y0: 1, Y1: 0, V: 1 });
    expect(encode([1, 1, 1, 1])).toEqual({ Y0: 1, Y1: 1, V: 1 });
    expect(encode([1, 0, 0, 0])).toEqual({ Y0: 0, Y1: 0, V: 1 });
    expect(encode([1, 1, 0, 0])).toEqual({ Y0: 1, Y1: 0, V: 1 });
  });

  it('deasserts the valid flag when nothing is requested', () => {
    expect(encode([0, 0, 0, 0])).toEqual({ Y0: 0, Y1: 0, V: 0 });
  });

  it('is indeterminate when an unknown request outranks every asserted one', () => {
    expect(encode([1, 0, 'Z', 0])).toEqual({ Y0: 'X', Y1: 'X', V: 'X' });
    expect(encode([1, 0, 1, 'X'])).toEqual({ Y0: 'X', Y1: 'X', V: 'X' });
  });

  it('ignores an unknown request that a higher request already overrules', () => {
    expect(encode([1, 'Z', 1, 0])).toEqual({ Y0: 0, Y1: 1, V: 1 });
  });

  it('encodes an 8-to-3 request set', () => {
    for (let winner = 0; winner < 8; winner += 1) {
      const requests = Array.from({ length: 8 }, (_, index) => (index <= winner ? 1 : 0)) as LogicLevel[];
      const out = encode(requests, 3);
      expect([out.Y0, out.Y1, out.Y2]).toEqual([winner & 1, (winner >> 1) & 1, (winner >> 2) & 1]);
    }
  });
});

const buildMuxCircuit = () => {
  let doc: LogicDocument = createInitialDocument();
  const add = (type: Parameters<typeof addComponent>[1], x: number, y: number, label?: string) => {
    doc = addComponent(doc, type, x, y);
    const id = doc.components[doc.components.length - 1]!.id;
    if (label) doc = relabelComponent(doc, id, label);
    return id;
  };
  const d0 = add('SWITCH', 0, 0, 'D0');
  const d1 = add('SWITCH', 0, 3, 'D1');
  const sel = add('SWITCH', 0, 6, 'S');
  const mux = add('MUX', 5, 0);
  doc = updateComponentParams(doc, mux, { selectBits: 1 });
  const led = add('LED', 11, 1, 'Y');
  doc = addWire(doc, { componentId: d0, portId: 'Y' }, { componentId: mux, portId: 'D0' });
  doc = addWire(doc, { componentId: d1, portId: 'Y' }, { componentId: mux, portId: 'D1' });
  doc = addWire(doc, { componentId: sel, portId: 'Y' }, { componentId: mux, portId: 'S0' });
  doc = addWire(doc, { componentId: mux, portId: 'Y' }, { componentId: led, portId: 'A' });
  return { doc, d0, d1, sel, mux, led };
};

describe('block integration through the simulator', () => {
  it('drives a wired multiplexer output in ideal mode', () => {
    const { doc, d0, d1, sel, led } = buildMuxCircuit();
    const drive = (a: 0 | 1, b: 0 | 1, s: 0 | 1) => readLevel(step({ document: doc, previous: createInitialFrame(doc), elapsedMs: 16, interactions: { [d0]: a, [d1]: b, [sel]: s } }), led, 'A');
    expect(drive(1, 0, 0)).toBe(1);
    expect(drive(1, 0, 1)).toBe(0);
    expect(drive(0, 1, 1)).toBe(1);
  });

  it('delays every block output by its own propagation delay in realistic mode', () => {
    const { doc, d0, mux, led } = buildMuxCircuit();
    const realistic: LogicDocument = { ...doc, simulation: { ...doc.simulation, delayMode: 'realistic' } };
    const withDelay = updateComponentParams(realistic, mux, { delayNs: 300 });
    let frame = createInitialFrame(withDelay);
    frame = step({ document: withDelay, previous: frame, elapsedMs: 16, interactions: { [d0]: 1 } });
    expect(readLevel(frame, led, 'A')).not.toBe(1);
    for (let i = 0; i < 8; i += 1) frame = step({ document: withDelay, previous: frame, elapsedMs: 16 });
    expect(readLevel(frame, led, 'A')).toBe(1);
  });

  it('drives several decoder outputs from one component in a single step', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'SWITCH', 0, 0);
    const a0 = doc.components[0]!.id;
    doc = addComponent(doc, 'SWITCH', 0, 2);
    const a1 = doc.components[1]!.id;
    doc = addComponent(doc, 'DECODER', 4, 0);
    const decoder = doc.components[2]!.id;
    doc = addWire(doc, { componentId: a0, portId: 'Y' }, { componentId: decoder, portId: 'A0' });
    doc = addWire(doc, { componentId: a1, portId: 'Y' }, { componentId: decoder, portId: 'A1' });
    const frame = step({ document: doc, previous: createInitialFrame(doc), elapsedMs: 16, interactions: { [a0]: 1, [a1]: 1 } });
    expect([0, 1, 2, 3].map((index) => readLevel(frame, decoder, `Y${index}`))).toEqual([0, 0, 0, 1]);
  });

  it('carries the resolved block outputs into a generated truth table', () => {
    const { doc } = buildMuxCircuit();
    const table = generateTruthTable(doc);
    expect(table.rows).toHaveLength(8);
    const expected = table.rows.map((row) => {
      const [a, b, s] = table.inputs.map((input) => row.inputs[input.componentId]!);
      return s === 1 ? b : a;
    });
    expect(table.rows.map((row) => row.outputs[table.outputs[0]!.componentId])).toEqual(expected);
  });

  it('flags an unconnected multiplexer as floating in the electrical rule check', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'MUX', 0, 0);
    const findings = runElectricalRuleCheck(doc);
    expect(findings.some((finding) => finding.type === 'floating_input' && finding.componentIds.includes(doc.components[0]!.id))).toBe(true);
  });

  it('detects an unbuffered combinational loop that passes through a block', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'MUX', 0, 0);
    const mux = doc.components[0]!.id;
    doc = updateComponentParams(doc, mux, { selectBits: 1 });
    doc = addComponent(doc, 'NOT', 6, 0);
    const inverter = doc.components[1]!.id;
    doc = addWire(doc, { componentId: mux, portId: 'Y' }, { componentId: inverter, portId: 'A' });
    doc = addWire(doc, { componentId: inverter, portId: 'Y' }, { componentId: mux, portId: 'D0' });
    expect(runElectricalRuleCheck(doc).some((finding) => finding.type === 'combinational_loop')).toBe(true);
  });
});

describe('block model and export integration', () => {
  it('prunes wires to pins that disappear when a block is resized or its EN pin is removed', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'SWITCH', 0, 0);
    const source = doc.components[0]!.id;
    doc = addComponent(doc, 'MUX', 5, 0);
    const mux = doc.components[1]!.id;
    doc = addWire(doc, { componentId: source, portId: 'Y' }, { componentId: mux, portId: 'D3' });
    expect(doc.wires).toHaveLength(1);
    doc = updateComponentParams(doc, mux, { selectBits: 1 });
    expect(doc.wires).toHaveLength(0);

    doc = updateComponentParams(doc, mux, { hasEnable: true });
    doc = addWire(doc, { componentId: source, portId: 'Y' }, { componentId: mux, portId: 'EN' });
    expect(doc.wires).toHaveLength(1);
    doc = updateComponentParams(doc, mux, { hasEnable: false });
    expect(doc.wires).toHaveLength(0);
  });

  it('normalizes an out-of-range size through the model', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'DEMUX', 0, 0);
    doc = updateComponentParams(doc, doc.components[0]!.id, { selectBits: 40 });
    expect(doc.components[0]!.params.selectBits).toBe(4);
  });

  it('round-trips a block project and rejects a wire to a pin the block does not have', () => {
    const { doc } = buildMuxCircuit();
    expect(parseProject(serializeProject(doc)).components.some((component) => component.type === 'MUX')).toBe(true);

    const broken = JSON.parse(serializeProject(doc)) as LogicDocument & { wires: { to: { portId: string } }[] };
    broken.wires[0]!.to.portId = 'D9';
    expect(() => parseProject(JSON.stringify(broken))).toThrow(/not a valid Digital Logic Workstation project/);
  });

  it('survives an imported project whose block size is a hostile value', () => {
    const { doc } = buildMuxCircuit();
    const hostile = JSON.parse(serializeProject(doc)) as { components: { type: string; params: Record<string, unknown> }[] };
    const muxComponent = hostile.components.find((component) => component.type === 'MUX')!;
    muxComponent.params.selectBits = 'not a number';
    muxComponent.params.hasEnable = 'yes';
    const parsed = parseProject(JSON.stringify({ ...hostile, wires: [] }));
    const frame = step({ document: parsed, previous: createInitialFrame(parsed), elapsedMs: 16 });
    expect(Object.keys(frame.portLevels).length).toBeGreaterThan(0);
  });

  it('exports a block with its caption, pin names, and size-derived height', () => {
    const { doc } = buildMuxCircuit();
    const svg = renderSchematicSvg(doc);
    expect(svg).toContain('MUX 2:1');
    expect(svg).toContain('>D0<');
    expect(svg).toContain('>S0<');
    expect(svg).toContain('>Y<');
    expect(svg).not.toContain('NaN');
  });

  it('keeps the instance label beside the drawn body when a block is rotated or mirrored', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'MUX', 4, 4);
    const id = doc.components[0]!.id;
    const anchorOf = (document: LogicDocument) => {
      const component = document.components[0]!;
      return componentLabelAnchor(component, getComponentPorts(component.type, component.params));
    };
    const upright = anchorOf(doc);
    // Mirroring flips x about the origin: the label center follows the body to the left of it.
    const mirrored = anchorOf(mirrorComponent(doc, id));
    expect(mirrored.x).toBeLessThan(upright.x);
    expect(mirrored.y).toBeCloseTo(upright.y);
    // A quarter turn maps the 3-column-wide body onto the y-axis, so the label sits 14px under a
    // 72px vertical extent measured from the component origin (grid row 4 = 96px).
    const turned = anchorOf(rotateComponent(doc, id));
    expect(turned.y).toBeCloseTo(4 * 24 + 3 * 24 + 14);
    expect(turned.y).toBeLessThan(upright.y);
    expect(turned.x).not.toBeCloseTo(upright.x);
  });

  it('exports a block caption that undoes the mirror and half-turn so it never reads backwards', () => {
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'MUX', 4, 4);
    const id = doc.components[0]!.id;
    expect(renderSchematicSvg(doc)).toMatch(/<text transform="translate\([^)]*\) rotate\(0\) scale\(1,1\)"[^>]*>MUX 4:1</);
    const mirrored = renderSchematicSvg(mirrorComponent(doc, id));
    expect(mirrored).toMatch(/rotate\(0\) scale\(-1,1\)"[^>]*>MUX 4:1</);
    const halfTurn = renderSchematicSvg(rotateComponent(rotateComponent(doc, id), id));
    expect(halfTurn).toMatch(/rotate\(180\) scale\(1,1\)"[^>]*>MUX 4:1</);
  });

  it('escapes hostile text in a block label inside the exported SVG', () => {
    const { doc, mux } = buildMuxCircuit();
    const svg = renderSchematicSvg(relabelComponent(doc, mux, '"><script>alert(1)</script>'));
    expect(svg).not.toContain('<script>');
  });
});

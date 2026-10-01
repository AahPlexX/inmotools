import { describe, expect, it } from 'vitest';
import { checkTruthTableAvailability, generateTruthTable, runElectricalRuleCheck } from '../../src/tools/logic/analysis-engine';
import { channelCandidates } from '../../src/tools/logic/analyzer-engine';
import { addComponent, addWire, createInitialDocument, relabelComponent, removeComponent, updateComponentParams } from '../../src/tools/logic/circuit-model';
import { getComponentPorts } from '../../src/tools/logic/component-library';
import { parseProject, renderSchematicSvg, serializeProject } from '../../src/tools/logic/export-engine';
import type { ComponentInstance, LogicDocument, LogicLevel } from '../../src/tools/logic/logic-types';
import { createInitialFrame, readLevel, step } from '../../src/tools/logic/sim-engine';
import {
  applyAtPath,
  breadcrumbs,
  cleanIcon,
  documentAtPath,
  encapsulateSelection,
  expandedSize,
  flattenDocument,
  MAX_SUBCIRCUIT_DEPTH,
  pathPrefix,
  relabelSubcircuitPort,
  renameSubcircuit,
  scopeFrame,
  setSubcircuitIcon,
  trimPath,
} from '../../src/tools/logic/subcircuit-engine';
import { levelLocation, subcircuitPorts } from '../../src/tools/logic/subcircuit-ports';

const lastId = (doc: LogicDocument): string => doc.components[doc.components.length - 1]!.id;

interface HalfAdder {
  readonly doc: LogicDocument;
  readonly a: string;
  readonly b: string;
  readonly xor: string;
  readonly and: string;
  readonly sum: string;
  readonly carry: string;
}

/** Two switches feeding an XOR (sum) and an AND (carry), each output going to an LED. */
const buildHalfAdder = (): HalfAdder => {
  let doc = createInitialDocument('Half adder');
  const add = (type: 'SWITCH' | 'XOR' | 'AND' | 'LED', x: number, y: number, label: string): string => {
    doc = addComponent(doc, type, x, y);
    const id = lastId(doc);
    doc = relabelComponent(doc, id, label);
    return id;
  };
  const a = add('SWITCH', 0, 0, 'A');
  const b = add('SWITCH', 0, 6, 'B');
  const xor = add('XOR', 10, 0, 'X1');
  const and = add('AND', 10, 6, 'G1');
  const sum = add('LED', 20, 0, 'SUM');
  const carry = add('LED', 20, 6, 'COUT');
  const wire = (from: string, fromPort: string, to: string, toPort: string) => {
    doc = addWire(doc, { componentId: from, portId: fromPort }, { componentId: to, portId: toPort });
  };
  wire(a, 'Y', xor, 'A');
  wire(b, 'Y', xor, 'B');
  wire(a, 'Y', and, 'A');
  wire(b, 'Y', and, 'B');
  wire(xor, 'Y', sum, 'A');
  wire(and, 'Y', carry, 'A');
  return { doc, a, b, xor, and, sum, carry };
};

const run = (doc: LogicDocument, interactions: Record<string, LogicLevel>) => step({ document: doc, previous: createInitialFrame(doc), elapsedMs: 0, interactions });

const readSumCarry = (rig: HalfAdder, doc: LogicDocument, a: 0 | 1, b: 0 | 1): [LogicLevel, LogicLevel] => {
  const frame = run(doc, { [rig.a]: a, [rig.b]: b });
  return [readLevel(frame, rig.sum, 'A'), readLevel(frame, rig.carry, 'A')];
};

const encapsulateAdder = (rig: HalfAdder): { doc: LogicDocument; instance: string } => {
  const result = encapsulateSelection(rig.doc, [rig.xor, rig.and], 'Half adder');
  if (!result.ok) throw new Error(result.reason);
  return { doc: result.document, instance: result.instanceId };
};

describe('encapsulating a selection', () => {
  it('turns the selection into one part with an input port per fed pin and an output port per driving pin', () => {
    const rig = buildHalfAdder();
    const { doc, instance } = encapsulateAdder(rig);
    expect(doc.components.filter((component) => component.type === 'SUBCIRCUIT')).toHaveLength(1);
    expect(doc.components.some((component) => component.id === rig.xor || component.id === rig.and)).toBe(false);
    const ports = getComponentPorts('SUBCIRCUIT', doc.components.find((component) => component.id === instance)!.params);
    expect(ports.filter((port) => port.direction === 'input')).toHaveLength(4);
    expect(ports.filter((port) => port.direction === 'output')).toHaveLength(2);
    expect(doc.selectedIds).toEqual([instance]);
    // Every wire outside still ends on a real pin.
    expect(doc.wires).toHaveLength(6);
  });

  it('gives the subcircuit the name it was asked for, and clean unique port names', () => {
    const rig = buildHalfAdder();
    const { doc, instance } = encapsulateAdder(rig);
    const component = doc.components.find((candidate) => candidate.id === instance)!;
    expect(component.params.subcircuit?.name).toBe('Half adder');
    expect(component.label).toBe('Half adder');
    const labels = subcircuitPorts(component.params).map((port) => port.label);
    expect(new Set(labels).size).toBe(labels.length);
    expect(labels.some((label) => label.includes('['))).toBe(false);
  });

  it('reuses one port when several outside wires reach the same inside pin', () => {
    let doc = createInitialDocument();
    const add = (type: 'SWITCH' | 'NOT' | 'LED', x: number, y: number) => {
      doc = addComponent(doc, type, x, y);
      return lastId(doc);
    };
    const sw = add('SWITCH', 0, 0);
    const not = add('NOT', 10, 0);
    const led1 = add('LED', 20, 0);
    const led2 = add('LED', 20, 4);
    doc = addWire(doc, { componentId: sw, portId: 'Y' }, { componentId: not, portId: 'A' });
    doc = addWire(doc, { componentId: not, portId: 'Y' }, { componentId: led1, portId: 'A' });
    doc = addWire(doc, { componentId: not, portId: 'Y' }, { componentId: led2, portId: 'A' });
    const result = encapsulateSelection(doc, [not]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const instance = result.document.components.find((component) => component.type === 'SUBCIRCUIT')!;
    expect(subcircuitPorts(instance.params)).toHaveLength(2);
    expect(result.document.wires).toHaveLength(3);
  });

  it('refuses an empty selection and a selection that includes a port marker', () => {
    const rig = buildHalfAdder();
    expect(encapsulateSelection(rig.doc, []).ok).toBe(false);
    let doc = addComponent(rig.doc, 'PORT_IN', 0, 20);
    const marker = lastId(doc);
    doc = addComponent(doc, 'NOT', 5, 20);
    expect(encapsulateSelection(doc, [marker, lastId(doc)]).ok).toBe(false);
  });

  it('names an unnamed subcircuit in sequence and trims a long or blank name', () => {
    const rig = buildHalfAdder();
    const first = encapsulateSelection(rig.doc, [rig.xor]);
    expect(first.ok && first.document.components.find((component) => component.id === first.instanceId)?.label).toBe('Subcircuit 1');
    if (!first.ok) return;
    const second = encapsulateSelection(first.document, [rig.and], '   ');
    expect(second.ok && second.document.components.find((component) => component.id === second.instanceId)?.label).toBe('Subcircuit 2');
    const long = encapsulateSelection(rig.doc, [rig.xor], 'x'.repeat(200));
    expect(long.ok && long.document.components.find((component) => component.id === long.instanceId)?.label).toHaveLength(40);
  });

  it('carries a bus port: a bus pin inside becomes a bus port of the same width', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'REGISTER', 10, 0);
    const register = lastId(doc);
    doc = updateComponentParams(doc, register, { bitWidth: 8, busPins: true });
    doc = addComponent(doc, 'BUS_SPLITTER', 0, 0);
    const split = lastId(doc);
    doc = updateComponentParams(doc, split, { busWidth: 8 });
    doc = addWire(doc, { componentId: split, portId: 'B' }, { componentId: register, portId: 'D' });
    const result = encapsulateSelection(doc, [register]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const instance = result.document.components.find((component) => component.type === 'SUBCIRCUIT')!;
    const bus = getComponentPorts('SUBCIRCUIT', instance.params).filter((port) => port.bus !== undefined);
    expect(bus.map((port) => port.bus?.bits.length)).toContain(8);
    // The outside bus wire still joins a bus to a bus of the same width.
    expect(result.document.wires).toHaveLength(1);
  });
});

describe('simulating a subcircuit', () => {
  it('behaves exactly like the parts it was made from, for every input', () => {
    const rig = buildHalfAdder();
    const { doc, instance } = encapsulateAdder(rig);
    for (const a of [0, 1] as const) {
      for (const b of [0, 1] as const) {
        expect(readSumCarry(rig, doc, a, b), `A=${a} B=${b}`).toEqual(readSumCarry(rig, rig.doc, a, b));
        expect(readSumCarry(rig, doc, a, b)).toEqual([a ^ b, a & b]);
      }
    }
    expect(instance).toBeTruthy();
  });

  it('flattens under prefixed ids and leaves top-level ids alone', () => {
    const rig = buildHalfAdder();
    const { doc, instance } = encapsulateAdder(rig);
    const flat = flattenDocument(doc);
    expect(flat.components.some((component) => component.type === 'SUBCIRCUIT')).toBe(false);
    expect(flat.components.some((component) => component.id === rig.a)).toBe(true);
    expect(flat.components.some((component) => component.id === `${instance}/${rig.xor}`)).toBe(true);
    expect(flat.components.find((component) => component.id === `${instance}/${rig.xor}`)?.label).toBe('Half adder/X1');
    expect(flat.components.filter((component) => component.type === 'NET_TIE')).toHaveLength(6);
    expect(flat.components.some((component) => component.type === 'PORT_IN' || component.type === 'PORT_OUT')).toBe(false);
    expect(flattenDocument(doc)).toBe(flat);
    expect(flattenDocument(rig.doc)).toBe(rig.doc);
  });

  it('shows a port level on the part from its junction', () => {
    const rig = buildHalfAdder();
    const { doc, instance } = encapsulateAdder(rig);
    const component = doc.components.find((candidate) => candidate.id === instance)!;
    const frame = run(doc, { [rig.a]: 1, [rig.b]: 1 });
    const outputs = subcircuitPorts(component.params).filter((port) => port.direction === 'output');
    const levels = outputs.map((port) => {
      const where = levelLocation(component, port.id, port.id);
      return readLevel(frame, where.componentId, where.pinId);
    });
    expect(levels.sort()).toEqual([0, 1]);
  });

  it('nests: a subcircuit inside a subcircuit still computes', () => {
    const rig = buildHalfAdder();
    const inner = encapsulateAdder(rig);
    const nested = encapsulateSelection(inner.doc, [inner.instance], 'Wrapper');
    expect(nested.ok).toBe(true);
    if (!nested.ok) return;
    expect(expandedSize(nested.document.components)).toBeGreaterThan(nested.document.components.length);
    for (const a of [0, 1] as const) for (const b of [0, 1] as const) expect(readSumCarry(rig, nested.document, a, b)).toEqual([a ^ b, a & b]);
    const flat = flattenDocument(nested.document);
    expect(flat.components.some((component) => component.id.split('/').length === 3)).toBe(true);
  });

  it('passes a signal straight through a subcircuit from a port to a port', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'SWITCH', 0, 0);
    const sw = lastId(doc);
    doc = addComponent(doc, 'LED', 20, 0);
    const led = lastId(doc);
    doc = addComponent(doc, 'NOT', 10, 0);
    const not = lastId(doc);
    doc = addWire(doc, { componentId: sw, portId: 'Y' }, { componentId: not, portId: 'A' });
    doc = addWire(doc, { componentId: not, portId: 'Y' }, { componentId: led, portId: 'A' });
    const result = encapsulateSelection(doc, [not]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Wire the marker for the input straight to the marker for the output inside, bypassing the inverter.
    const instance = result.document.components.find((component) => component.type === 'SUBCIRCUIT')!;
    const definition = instance.params.subcircuit!;
    const input = definition.components.find((component) => component.type === 'PORT_IN')!;
    const output = definition.components.find((component) => component.type === 'PORT_OUT')!;
    const bypassed = applyAtPath(result.document, [instance.id], (inner) => addWire(inner, { componentId: input.id, portId: 'Y' }, { componentId: output.id, portId: 'A' }));
    // Both the inverter and the bypass now drive the output: a conflict, so the LED reads unknown rather than a clean value.
    const frame = run(bypassed, { [sw]: 1 });
    expect(readLevel(frame, led, 'A')).toBe('X');
  });

  it('carries a bus through a subcircuit bit for bit', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'BUS_SPLITTER', 0, 0);
    const source = lastId(doc);
    doc = updateComponentParams(doc, source, { busWidth: 4 });
    const switches: string[] = [];
    for (let index = 0; index < 4; index += 1) {
      doc = addComponent(doc, 'SWITCH', -6, index * 2);
      switches.push(lastId(doc));
      doc = addWire(doc, { componentId: lastId(doc), portId: 'Y' }, { componentId: source, portId: `S${index}` });
    }
    doc = addComponent(doc, 'REGISTER', 12, 0);
    const register = lastId(doc);
    doc = updateComponentParams(doc, register, { bitWidth: 4, busPins: true });
    doc = addWire(doc, { componentId: source, portId: 'B' }, { componentId: register, portId: 'D' });
    const clock = (() => {
      doc = addComponent(doc, 'SWITCH', 12, -6);
      const id = lastId(doc);
      doc = addWire(doc, { componentId: id, portId: 'Y' }, { componentId: register, portId: 'CLK' });
      return id;
    })();
    const result = encapsulateSelection(doc, [register]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const levels = (pattern: number): Record<string, LogicLevel> => Object.fromEntries(switches.map((id, index) => [id, ((pattern >> index) & 1) as LogicLevel]));
    let frame = createInitialFrame(result.document);
    frame = step({ document: result.document, previous: frame, elapsedMs: 0, interactions: { ...levels(0b1010), [clock]: 0 } });
    frame = step({ document: result.document, previous: frame, elapsedMs: 0, interactions: { [clock]: 1 } });
    const flat = flattenDocument(result.document);
    const stored = flat.components.find((component) => component.type === 'REGISTER')!;
    expect([0, 1, 2, 3].map((index) => readLevel(frame, stored.id, `Q${index}`))).toEqual([0, 1, 0, 1]);
  });
});

describe('analysis through subcircuits', () => {
  it('generates the same truth table for the grouped circuit as for the original', () => {
    const rig = buildHalfAdder();
    const { doc } = encapsulateAdder(rig);
    const before = generateTruthTable(rig.doc);
    const after = generateTruthTable(doc);
    expect(after.inputs.map((input) => input.label)).toEqual(before.inputs.map((input) => input.label));
    expect(after.rows.map((row) => Object.values(row.outputs))).toEqual(before.rows.map((row) => Object.values(row.outputs)));
  });

  it('names pins inside a subcircuit in the rule check, prefixed with the subcircuit', () => {
    const rig = buildHalfAdder();
    const { doc, instance } = encapsulateAdder(rig);
    const broken = { ...doc, wires: doc.wires.filter((wire) => wire.from.componentId !== rig.a) };
    const messages = runElectricalRuleCheck(broken).map((finding) => finding.message).join('\n');
    expect(messages).toContain('Half adder/');
    expect(instance).toBeTruthy();
  });

  it('offers signals from inside a subcircuit to the logic analyzer', () => {
    const rig = buildHalfAdder();
    const { doc } = encapsulateAdder(rig);
    const labels = channelCandidates(doc).map((candidate) => candidate.label);
    expect(labels.some((label) => label.startsWith('Half adder/'))).toBe(true);
  });

  it('makes a truth table for a subcircuit on its own: its ports are the inputs and outputs', () => {
    const rig = buildHalfAdder();
    const { doc, instance } = encapsulateAdder(rig);
    const inside = documentAtPath(doc, [instance]);
    expect(checkTruthTableAvailability(inside).ok).toBe(true);
    const table = generateTruthTable(inside);
    expect(table.inputs).toHaveLength(4);
    expect(table.outputs).toHaveLength(2);
    expect(table.rows).toHaveLength(16);
  });

  it('walks only the selected switches and LEDs when scoped, holding the rest', () => {
    const rig = buildHalfAdder();
    const scoped = generateTruthTable(rig.doc, { onlyIds: [rig.a, rig.b, rig.sum] });
    expect(scoped.inputs.map((input) => input.componentId)).toEqual([rig.a, rig.b]);
    expect(scoped.outputs.map((output) => output.componentId)).toEqual([rig.sum]);
    expect(scoped.rows.map((row) => row.outputs[rig.sum])).toEqual([0, 1, 1, 0]);
    const oneInput = generateTruthTable(rig.doc, { onlyIds: [rig.a, rig.carry] });
    expect(oneInput.rows).toHaveLength(2);
    // B is not in scope, so it stays at its starting level (0) and the carry follows A alone through an AND with 0.
    expect(oneInput.rows.map((row) => row.outputs[rig.carry])).toEqual([0, 0]);
    expect(checkTruthTableAvailability(rig.doc, { onlyIds: [rig.a] }).ok).toBe(false);
    expect(() => generateTruthTable(rig.doc, { onlyIds: [rig.sum] })).toThrow();
  });
});

describe('editing inside a subcircuit', () => {
  it('reads and writes the circuit at a path and keeps the parent intact', () => {
    const rig = buildHalfAdder();
    const { doc, instance } = encapsulateAdder(rig);
    const inside = documentAtPath(doc, [instance]);
    expect(inside.components.some((component) => component.id === rig.xor)).toBe(true);
    expect(inside.theme).toBe(doc.theme);
    const edited = applyAtPath(doc, [instance], (inner) => addComponent(inner, 'LED', 40, 40));
    expect(documentAtPath(edited, [instance]).components).toHaveLength(inside.components.length + 1);
    expect(edited.components.filter((component) => component.type !== 'SUBCIRCUIT')).toEqual(doc.components.filter((component) => component.type !== 'SUBCIRCUIT'));
    expect(edited.wires).toEqual(doc.wires);
  });

  it('applies an edit at the top level when the path is empty and ignores a missing subcircuit', () => {
    const rig = buildHalfAdder();
    const edited = applyAtPath(rig.doc, [], (document) => addComponent(document, 'LED', 40, 40));
    expect(edited.components).toHaveLength(rig.doc.components.length + 1);
    expect(applyAtPath(rig.doc, ['nope'], (document) => addComponent(document, 'LED', 40, 40))).toBe(rig.doc);
  });

  it('carries root-level changes (the theme) made while inside back to the root', () => {
    const rig = buildHalfAdder();
    const { doc, instance } = encapsulateAdder(rig);
    const themed = applyAtPath(doc, [instance], (inner) => ({ ...inner, theme: 'dark' }));
    expect(themed.theme).toBe('dark');
  });

  it('drops outside wires when a port is deleted inside', () => {
    const rig = buildHalfAdder();
    const { doc, instance } = encapsulateAdder(rig);
    const component = doc.components.find((candidate) => candidate.id === instance)!;
    const marker = component.params.subcircuit!.components.find((candidate) => candidate.type === 'PORT_OUT')!;
    const edited = applyAtPath(doc, [instance], (inner) => removeComponent(inner, marker.id));
    expect(edited.wires.length).toBe(doc.wires.length - 1);
    expect(edited.wires.every((wire) => wire.from.portId !== marker.id && wire.to.portId !== marker.id)).toBe(true);
  });

  it('works through two levels', () => {
    const rig = buildHalfAdder();
    const inner = encapsulateAdder(rig);
    const nested = encapsulateSelection(inner.doc, [inner.instance], 'Wrapper');
    if (!nested.ok) throw new Error(nested.reason);
    const edited = applyAtPath(nested.document, [nested.instanceId, inner.instance], (document) => addComponent(document, 'LED', 40, 40));
    expect(documentAtPath(edited, [nested.instanceId, inner.instance]).components).toHaveLength(documentAtPath(nested.document, [nested.instanceId, inner.instance]).components.length + 1);
  });

  it('trims a path that no longer exists and reports the trail', () => {
    const rig = buildHalfAdder();
    const { doc, instance } = encapsulateAdder(rig);
    expect(trimPath(doc, [instance])).toEqual([instance]);
    expect(trimPath(doc, [instance, 'gone'])).toEqual([instance]);
    expect(trimPath(doc, ['gone', instance])).toEqual([]);
    expect(breadcrumbs(doc, [instance]).map((crumb) => crumb.label)).toEqual(['Half adder', 'Half adder']);
    expect(breadcrumbs(doc, [instance])[1]?.id).toBe(instance);
    expect(breadcrumbs(doc, [])).toHaveLength(1);
    expect(pathPrefix([instance, 'b'])).toBe(`${instance}/b/`);
    expect(pathPrefix([])).toBe('');
  });

  it('shows the running circuit from inside: levels under the path, markers answering to Y and A', () => {
    const rig = buildHalfAdder();
    const { doc, instance } = encapsulateAdder(rig);
    const frame = run(doc, { [rig.a]: 1, [rig.b]: 0 });
    const scoped = scopeFrame(frame, pathPrefix([instance]));
    expect(readLevel(scoped, rig.xor, 'Y')).toBe(1);
    expect(readLevel(scoped, rig.and, 'Y')).toBe(0);
    const definition = doc.components.find((component) => component.id === instance)!.params.subcircuit!;
    const input = definition.components.find((component) => component.type === 'PORT_IN' && component.label.startsWith('A'))!;
    expect(readLevel(scoped, input.id, 'Y')).toBe(1);
    const output = definition.components.find((component) => component.type === 'PORT_OUT')!;
    expect(['0', '1']).toContain(String(readLevel(scoped, output.id, 'A')));
    expect(scopeFrame(frame, '')).toBe(frame);
  });
});

describe('renaming and icons', () => {
  it('renames, sets an icon and relabels a port', () => {
    const rig = buildHalfAdder();
    const { doc, instance } = encapsulateAdder(rig);
    const renamed = renameSubcircuit(doc, instance, '  Adder  ');
    expect(renamed.components.find((component) => component.id === instance)?.params.subcircuit?.name).toBe('Adder');
    expect(renameSubcircuit(doc, instance, '   ').components.find((component) => component.id === instance)?.params.subcircuit?.name).toBe('Half adder');
    const iconed = setSubcircuitIcon(doc, instance, '∑ extra long');
    expect(iconed.components.find((component) => component.id === instance)?.params.subcircuit?.icon).toBe('∑ ex');
    expect(cleanIcon('')).toBe('▦');
    const component = doc.components.find((candidate) => candidate.id === instance)!;
    const port = subcircuitPorts(component.params)[0]!;
    const relabeled = relabelSubcircuitPort(doc, instance, port.id, 'Left');
    expect(subcircuitPorts(relabeled.components.find((candidate) => candidate.id === instance)!.params).find((entry) => entry.id === port.id)?.label).toBe('Left');
    // Wires on that port survive a rename because the port id is the marker's id.
    expect(relabeled.wires).toHaveLength(doc.wires.length);
  });
});

describe('subcircuits in a project file', () => {
  it('saves and reloads a subcircuit with its circuit, name and icon, and it still simulates', () => {
    const rig = buildHalfAdder();
    const { doc } = encapsulateAdder(rig);
    const restored = parseProject(serializeProject(setSubcircuitIcon(doc, doc.components.find((component) => component.type === 'SUBCIRCUIT')!.id, '⊕')));
    const instance = restored.components.find((component) => component.type === 'SUBCIRCUIT')!;
    expect(instance.params.subcircuit?.name).toBe('Half adder');
    expect(instance.params.subcircuit?.icon).toBe('⊕');
    expect(instance.params.subcircuit?.components.length).toBeGreaterThan(2);
    for (const a of [0, 1] as const) for (const b of [0, 1] as const) expect(readSumCarry(rig, restored, a, b)).toEqual([a ^ b, a & b]);
  });

  it('rejects a subcircuit whose inner wire points at a part that is not there', () => {
    const rig = buildHalfAdder();
    const { doc } = encapsulateAdder(rig);
    const forged = JSON.parse(serializeProject(doc)) as LogicDocument & { components: ComponentInstance[] };
    const instance = forged.components.find((component) => component.type === 'SUBCIRCUIT')!;
    const definition = instance.params.subcircuit!;
    (instance.params as { subcircuit: unknown }).subcircuit = { ...definition, wires: [...definition.wires, { id: 'bad', from: { componentId: 'ghost', portId: 'Y' }, to: { componentId: definition.components[0]!.id, portId: 'A' }, waypoints: [] }] };
    expect(() => parseProject(JSON.stringify(forged))).toThrow();
  });

  it('rejects a subcircuit that is missing its circuit or has the wrong shape', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'SUBCIRCUIT', 0, 0);
    const forge = (subcircuit: unknown): string =>
      JSON.stringify({ ...doc, components: doc.components.map((component) => ({ ...component, params: { ...component.params, subcircuit } })) });
    expect(() => parseProject(forge({ name: 'ok', icon: 'x', components: [], wires: [] }))).not.toThrow();
    expect(() => parseProject(forge(undefined))).toThrow();
    expect(() => parseProject(forge({ name: 5, icon: 'x', components: [], wires: [] }))).toThrow();
    expect(() => parseProject(forge({ name: 'ok', icon: 'x'.repeat(40), components: [], wires: [] }))).toThrow();
    expect(() => parseProject(forge({ name: 'ok', icon: 'x', components: 'no', wires: [] }))).toThrow();
    expect(() => parseProject(forge({ name: 'ok', icon: 'x', components: [{ id: 'q' }], wires: [] }))).toThrow();
  });

  it('rejects nesting deeper than the limit', () => {
    const wrap = (definition: unknown): unknown => ({
      name: 'level',
      icon: 'x',
      components: [{ id: 'c', type: 'SUBCIRCUIT', x: 0, y: 0, rotation: 0, mirrored: false, label: 'c', params: { subcircuit: definition } }],
      wires: [],
    });
    let nested: unknown = { name: 'leaf', icon: 'x', components: [], wires: [] };
    for (let level = 0; level < MAX_SUBCIRCUIT_DEPTH + 2; level += 1) nested = wrap(nested);
    let doc = createInitialDocument();
    doc = addComponent(doc, 'SUBCIRCUIT', 0, 0);
    const forged = JSON.stringify({ ...doc, components: doc.components.map((component) => ({ ...component, params: { subcircuit: nested } })) });
    expect(() => parseProject(forged)).toThrow();
  });

  it('draws the part with its name and icon in the SVG export', () => {
    const rig = buildHalfAdder();
    const { doc, instance } = encapsulateAdder(rig);
    const svg = renderSchematicSvg(setSubcircuitIcon(doc, instance, '⊕'));
    expect(svg).toContain('Half adder');
    expect(svg).toContain('⊕');
    expect(svg).not.toContain('NaN');
  });
});

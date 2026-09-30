import { describe, expect, it } from 'vitest';
import { generateTruthTable, runElectricalRuleCheck } from '../../src/tools/logic/analysis-engine';
import { addComponent, createInitialDocument } from '../../src/tools/logic/circuit-model';
import { getComponentPorts } from '../../src/tools/logic/component-library';
import { minimize, productLiterals, sumLiterals, type MinimizationResult } from '../../src/tools/logic/minimize-engine';
import { freeSpaceBelow, synthesizeTwoLevel, type SynthesisResult, type TwoLevelForm } from '../../src/tools/logic/synthesis-engine';
import type { LogicDocument } from '../../src/tools/logic/logic-types';

const names = (count: number): string[] => ['A', 'B', 'C', 'D', 'E'].slice(0, count);

const lcg = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const build = (result: MinimizationResult, form: TwoLevelForm, base: LogicDocument = createInitialDocument()): SynthesisResult => {
  const form_ = form === 'sop' ? result.sop : result.pos;
  const terms = form_.selected.map((index) => {
    const prime = form_.primes[index]!;
    return form === 'sop' ? productLiterals(result.variables, prime) : sumLiterals(result.variables, prime);
  });
  return synthesizeTwoLevel(base, { form, variables: result.variables, terms, outputLabel: 'Y' }, { x: 2, y: 2 });
};

/** The synthesized circuit's output column of its truth table, as the set of minterms where it is 1. */
const simulatedOnset = (result: SynthesisResult): number[] => {
  const table = generateTruthTable(result.document);
  const output = table.outputs.find((signal) => signal.componentId === result.outputComponentId)!;
  return table.rows
    .map((row, mask) => ({ mask, value: row.outputs[output.componentId] }))
    .filter((entry) => entry.value === 1)
    .map((entry) => entry.mask);
};

describe('two-level synthesis', () => {
  it('builds AND-OR logic that reproduces the function for both SOP and POS on every 2-variable function', () => {
    for (let mask = 1; mask < 15; mask += 1) {
      const onset = [0, 1, 2, 3].filter((index) => (mask >> index) & 1);
      const result = minimize(names(2), onset);
      for (const form of ['sop', 'pos'] as const) {
        expect(simulatedOnset(build(result, form)), `mask ${mask} ${form}`).toEqual(onset);
      }
    }
  });

  it('reproduces the function for every 3-variable function', () => {
    for (let mask = 1; mask < 255; mask += 1) {
      const onset = Array.from({ length: 8 }, (_, index) => index).filter((index) => (mask >> index) & 1);
      const result = minimize(names(3), onset);
      expect(simulatedOnset(build(result, 'sop'))).toEqual(onset);
      expect(simulatedOnset(build(result, 'pos'))).toEqual(onset);
    }
  });

  it('reproduces seeded random 4- and 5-variable functions', () => {
    const random = lcg(31337);
    for (const count of [4, 5]) {
      for (let trial = 0; trial < 25; trial += 1) {
        const onset: number[] = [];
        for (let minterm = 0; minterm < 1 << count; minterm += 1) if (random() < 0.45) onset.push(minterm);
        const result = minimize(names(count), onset);
        if (result.constant !== undefined) continue;
        expect(simulatedOnset(build(result, 'sop'))).toEqual(onset);
        expect(simulatedOnset(build(result, 'pos'))).toEqual(onset);
      }
    }
  });

  it('combines more than eight terms through a tree of gates no wider than the workstation allows', () => {
    // Five-variable odd parity has sixteen single-minterm primes: the OR needs a tree.
    const parity = Array.from({ length: 32 }, (_, index) => index).filter((index) => index.toString(2).split('1').length % 2 === 0);
    const result = minimize(names(5), parity);
    expect(result.sop.selected).toHaveLength(16);
    const built = build(result, 'sop');
    expect(simulatedOnset(built)).toEqual(parity);
    for (const component of built.document.components) {
      if (component.type === 'AND' || component.type === 'OR') expect(component.params.inputCount ?? 2).toBeLessThanOrEqual(8);
    }
    expect(built.document.components.filter((component) => component.type === 'OR').length).toBeGreaterThan(1);
  });

  it('draws a single literal straight to the output, with an inverter only when it is complemented', () => {
    const direct = build(minimize(names(2), [2, 3]), 'sop');
    expect(direct.document.components.map((component) => component.type).sort()).toEqual(['LED', 'SWITCH', 'SWITCH']);
    expect(simulatedOnset(direct)).toEqual([2, 3]);
    const inverted = build(minimize(names(2), [0, 1]), 'sop');
    expect(inverted.document.components.filter((component) => component.type === 'NOT')).toHaveLength(1);
    expect(simulatedOnset(inverted)).toEqual([0, 1]);
  });

  it('shares one inverter per variable across every term that needs it', () => {
    const result = minimize(names(3), [0, 1, 2]);
    const built = build(result, 'sop');
    const inverterLabels = built.document.components.filter((component) => component.type === 'NOT').map((component) => component.label);
    expect(new Set(inverterLabels).size).toBe(inverterLabels.length);
    expect(simulatedOnset(built)).toEqual([0, 1, 2]);
  });

  it('leaves no floating input and only wires that reference real ports', () => {
    const built = build(minimize(names(4), [0, 1, 2, 5, 6, 7, 8, 9, 10, 14]), 'sop');
    expect(runElectricalRuleCheck(built.document)).toEqual([]);
    for (const wire of built.document.wires) {
      for (const end of [wire.from, wire.to]) {
        const component = built.document.components.find((candidate) => candidate.id === end.componentId)!;
        expect(getComponentPorts(component.type, component.params).some((port) => port.id === end.portId)).toBe(true);
      }
    }
  });

  it('labels the inputs with the variable names and the output with the requested label', () => {
    const built = build(minimize(['X', 'Y'], [1, 2]), 'sop');
    const labels = built.document.components.map((component) => component.label);
    expect(labels).toContain('X');
    expect(labels).toContain('Y');
    const led = built.document.components.find((component) => component.id === built.outputComponentId)!;
    expect(led.type).toBe('LED');
    expect(led.label).toBe('Y');
  });

  it('adds to an existing document without disturbing what is already there', () => {
    let base: LogicDocument = createInitialDocument();
    base = addComponent(base, 'AND', 3, 3);
    const built = build(minimize(names(2), [3]), 'sop', base);
    expect(built.document.components[0]).toEqual(base.components[0]);
    expect(built.document.components).toHaveLength(base.components.length + built.addedComponentIds.length);
    expect(built.addedComponentIds.every((id) => built.document.components.some((component) => component.id === id))).toBe(true);
  });

  it('refuses a constant function, an empty term, and a term over an unknown variable', () => {
    const doc = createInitialDocument();
    const spec = { form: 'sop' as const, variables: names(2), outputLabel: 'Y' };
    expect(() => synthesizeTwoLevel(doc, { ...spec, terms: [] }, { x: 0, y: 0 })).toThrow(RangeError);
    expect(() => synthesizeTwoLevel(doc, { ...spec, terms: [[]] }, { x: 0, y: 0 })).toThrow(RangeError);
    expect(() => synthesizeTwoLevel(doc, { ...spec, terms: [[{ variable: 'Q', negated: false }]] }, { x: 0, y: 0 })).toThrow(RangeError);
  });

  it('places generated circuitry clear of everything already on the canvas', () => {
    expect(freeSpaceBelow([])).toEqual({ x: 2, y: 2 });
    let doc: LogicDocument = createInitialDocument();
    doc = addComponent(doc, 'AND', 10, 5);
    doc = addComponent(doc, 'LED', 20, 30);
    const spot = freeSpaceBelow(doc.components);
    expect(spot.y).toBeGreaterThan(30);
    expect(spot.x).toBeLessThanOrEqual(11);
  });
});

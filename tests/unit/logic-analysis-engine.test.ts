import { describe, expect, it } from 'vitest';
import {
  extractBooleanExpressions,
  formatPos,
  formatSop,
  generateTruthTable,
  runElectricalRuleCheck,
  truthTableToCsv,
} from '../../src/tools/logic/analysis-engine';
import { addComponent, addWire, createInitialDocument, relabelComponent, updateComponentParams } from '../../src/tools/logic/circuit-model';

const buildAndCircuit = () => {
  let doc = createInitialDocument();
  doc = addComponent(doc, 'SWITCH', 0, 0);
  const switchA = doc.components[0]!.id;
  doc = relabelComponent(doc, switchA, 'A');
  doc = addComponent(doc, 'SWITCH', 0, 2);
  const switchB = doc.components[1]!.id;
  doc = relabelComponent(doc, switchB, 'B');
  doc = addComponent(doc, 'AND', 3, 1);
  const gate = doc.components[2]!.id;
  doc = addComponent(doc, 'LED', 6, 1);
  const led = doc.components[3]!.id;
  doc = relabelComponent(doc, led, 'Y');
  doc = addWire(doc, { componentId: switchA, portId: 'Y' }, { componentId: gate, portId: 'A' });
  doc = addWire(doc, { componentId: switchB, portId: 'Y' }, { componentId: gate, portId: 'B' });
  doc = addWire(doc, { componentId: gate, portId: 'Y' }, { componentId: led, portId: 'A' });
  return doc;
};

describe('analysis-engine truth table generation', () => {
  it('walks every input permutation and matches the AND truth table', () => {
    const table = generateTruthTable(buildAndCircuit());
    expect(table.rows).toHaveLength(4);
    const trueRows = table.rows.filter((row) => Object.values(row.outputs)[0] === 1);
    expect(trueRows).toHaveLength(1);
    expect(Object.values(trueRows[0]!.inputs)).toEqual([1, 1]);
  });

  it('exports the truth table as CSV with a header row', () => {
    const table = generateTruthTable(buildAndCircuit());
    const csv = truthTableToCsv(table);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(5);
    expect(lines[0]).toBe('A,B,Y');
  });

  it('extracts an SOP/POS expression consistent with a two-input AND gate', () => {
    const table = generateTruthTable(buildAndCircuit());
    const [expression] = extractBooleanExpressions(table);
    expect(formatSop(expression!)).toBe('Y = AB');
    expect(formatPos(expression!)).toBe("Y = (A + B)(A' + B)(A + B')");
  });

  it('refuses to generate a truth table when a sequential element is present', () => {
    let doc = buildAndCircuit();
    doc = addComponent(doc, 'D_FLIP_FLOP', 9, 0);
    expect(() => generateTruthTable(doc)).toThrow();
  });

  it('reads the stable requested level for a bouncing push button instead of its transient first-tick bounce', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'PUSH_BUTTON', 0, 0);
    const button = doc.components[0]!.id;
    doc = relabelComponent(doc, button, 'A');
    doc = updateComponentParams(doc, button, { bounce: true });
    doc = addComponent(doc, 'BUFFER', 3, 0);
    const gate = doc.components[1]!.id;
    doc = addComponent(doc, 'LED', 6, 0);
    const led = doc.components[2]!.id;
    doc = relabelComponent(doc, led, 'Y');
    doc = addWire(doc, { componentId: button, portId: 'Y' }, { componentId: gate, portId: 'A' });
    doc = addWire(doc, { componentId: gate, portId: 'Y' }, { componentId: led, portId: 'A' });

    const table = generateTruthTable(doc);
    const pressedRow = table.rows.find((row) => Object.values(row.inputs)[0] === 1);
    expect(pressedRow?.outputs[led]).toBe(1);
  });

  it('marks an output unresolved rather than presenting a floating/contended value as a constant Boolean expression', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'SWITCH', 0, 0);
    const switchA = doc.components[0]!.id;
    doc = relabelComponent(doc, switchA, 'A');
    doc = addComponent(doc, 'LED', 3, 0);
    const led = doc.components[1]!.id;
    doc = relabelComponent(doc, led, 'Y');
    // The LED's input is left unwired, so every row reads Z (floating).
    const table = generateTruthTable(doc);
    const [expression] = extractBooleanExpressions(table);
    expect(expression!.hasUnresolvedRows).toBe(true);
    expect(formatSop(expression!)).toContain('unresolved');
    expect(formatPos(expression!)).toContain('unresolved');
  });
});

describe('analysis-engine CSV export', () => {
  it('quotes a signal label containing a comma so the exported CSV stays well-formed', () => {
    let doc = buildAndCircuit();
    const outputComponent = doc.components.find((component) => component.label === 'Y')!;
    doc = relabelComponent(doc, outputComponent.id, 'Output, Final');
    const table = generateTruthTable(doc);
    const csv = truthTableToCsv(table);
    const header = csv.split('\n')[0]!;
    expect(header).toBe('A,B,"Output, Final"');
  });
});

describe('analysis-engine electrical rule check', () => {
  it('flags a floating gate input with no driving output', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'AND', 0, 0);
    const findings = runElectricalRuleCheck(doc);
    expect(findings.some((finding) => finding.type === 'floating_input')).toBe(true);
  });

  it('flags two outputs wired to the same net as contention', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'SWITCH', 0, 0);
    const switchA = doc.components[0]!.id;
    doc = addComponent(doc, 'SWITCH', 0, 2);
    const switchB = doc.components[1]!.id;
    doc = addComponent(doc, 'LED', 4, 1);
    const led = doc.components[2]!.id;
    doc = addWire(doc, { componentId: switchA, portId: 'Y' }, { componentId: led, portId: 'A' });
    doc = addWire(doc, { componentId: switchB, portId: 'Y' }, { componentId: led, portId: 'A' });
    const findings = runElectricalRuleCheck(doc);
    expect(findings.some((finding) => finding.type === 'output_contention')).toBe(true);
  });

  it('flags an unbuffered combinational loop', () => {
    let doc = createInitialDocument();
    doc = addComponent(doc, 'NOT', 0, 0);
    const gate = doc.components[0]!.id;
    doc = addWire(doc, { componentId: gate, portId: 'Y' }, { componentId: gate, portId: 'A' });
    const findings = runElectricalRuleCheck(doc);
    expect(findings.some((finding) => finding.type === 'combinational_loop')).toBe(true);
  });

  it('reports no findings for a cleanly wired AND circuit', () => {
    const findings = runElectricalRuleCheck(buildAndCircuit());
    expect(findings).toHaveLength(0);
  });
});

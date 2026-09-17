import { isCombinationalGate, isSequential } from './component-library';
import { buildNetIndex, createInitialFrame, readLevel, step } from './sim-engine';
import { portKey, type ComponentInstance, type LogicDocument, type LogicLevel, type PortKey } from './logic-types';

export interface TruthTableSignal {
  readonly componentId: string;
  readonly label: string;
}

export interface TruthTableRow {
  readonly inputs: Readonly<Record<string, 0 | 1>>;
  readonly outputs: Readonly<Record<string, LogicLevel>>;
}

export interface TruthTable {
  readonly inputs: readonly TruthTableSignal[];
  readonly outputs: readonly TruthTableSignal[];
  readonly rows: readonly TruthTableRow[];
}

export interface TruthTableAvailability {
  readonly ok: boolean;
  readonly reason?: string;
}

const MAX_TRUTH_TABLE_INPUTS = 12;

const isInputSource = (component: ComponentInstance): boolean => component.type === 'SWITCH' || component.type === 'PUSH_BUTTON';
const isObservableOutput = (component: ComponentInstance): boolean => component.type === 'LED' || component.type === 'PROBE';

export const checkTruthTableAvailability = (document: LogicDocument): TruthTableAvailability => {
  const hasSequential = document.components.some((component) => isSequential(component.type));
  if (hasSequential) return { ok: false, reason: 'Truth tables can only be generated for purely combinational circuits. Remove flip-flops/latches or isolate the combinational subcircuit first.' };
  const hasClock = document.components.some((component) => component.type === 'CLOCK');
  if (hasClock) return { ok: false, reason: 'A clock source makes this circuit sequential in behavior. Truth tables require combinational-only circuits.' };
  const inputs = document.components.filter(isInputSource);
  const outputs = document.components.filter(isObservableOutput);
  if (inputs.length === 0) return { ok: false, reason: 'Add at least one toggle switch or push button to serve as a truth-table input.' };
  if (outputs.length === 0) return { ok: false, reason: 'Add at least one LED or logic probe to serve as a truth-table output.' };
  if (inputs.length > MAX_TRUTH_TABLE_INPUTS) return { ok: false, reason: `Truth tables are limited to ${MAX_TRUTH_TABLE_INPUTS} inputs (2^${MAX_TRUTH_TABLE_INPUTS} rows) to stay responsive; this circuit has ${inputs.length}.` };
  return { ok: true };
};

export const generateTruthTable = (document: LogicDocument): TruthTable => {
  const availability = checkTruthTableAvailability(document);
  if (!availability.ok) throw new Error(availability.reason ?? 'Truth table unavailable.');

  const inputs: TruthTableSignal[] = document.components.filter(isInputSource).map((component) => ({ componentId: component.id, label: component.label || component.id }));
  const outputs: TruthTableSignal[] = document.components.filter(isObservableOutput).map((component) => ({ componentId: component.id, label: component.label || component.id }));
  const idealDocument: LogicDocument = { ...document, simulation: { ...document.simulation, delayMode: 'ideal' } };

  const rows: TruthTableRow[] = [];
  const combinations = 1 << inputs.length;
  for (let mask = 0; mask < combinations; mask += 1) {
    const interactions: Record<string, LogicLevel> = {};
    const rowInputs: Record<string, 0 | 1> = {};
    inputs.forEach((input, index) => {
      const bit: 0 | 1 = (mask >> index) & 1 ? 1 : 0;
      interactions[input.componentId] = bit;
      rowInputs[input.componentId] = bit;
    });
    const frame = step({ document: idealDocument, previous: createInitialFrame(idealDocument), elapsedMs: 0, interactions });
    const rowOutputs: Record<string, LogicLevel> = {};
    for (const output of outputs) rowOutputs[output.componentId] = readLevel(frame, output.componentId, 'A');
    rows.push({ inputs: rowInputs, outputs: rowOutputs });
  }

  return { inputs, outputs, rows };
};

export const truthTableToCsv = (table: TruthTable): string => {
  const header = [...table.inputs.map((input) => input.label), ...table.outputs.map((output) => output.label)];
  const lines = [header.join(',')];
  for (const row of table.rows) {
    const cells = [
      ...table.inputs.map((input) => String(row.inputs[input.componentId])),
      ...table.outputs.map((output) => String(row.outputs[output.componentId])),
    ];
    lines.push(cells.join(','));
  }
  return lines.join('\n');
};

export interface BooleanLiteral {
  readonly label: string;
  readonly negated: boolean;
}

export interface BooleanExpression {
  readonly outputLabel: string;
  readonly outputComponentId: string;
  readonly sopTerms: readonly (readonly BooleanLiteral[])[];
  readonly posTerms: readonly (readonly BooleanLiteral[])[];
}

export const extractBooleanExpressions = (table: TruthTable): BooleanExpression[] =>
  table.outputs.map((output) => {
    const sopTerms: BooleanLiteral[][] = [];
    const posTerms: BooleanLiteral[][] = [];
    for (const row of table.rows) {
      const value = row.outputs[output.componentId];
      if (value === 1) {
        sopTerms.push(table.inputs.map((input) => ({ label: input.label, negated: row.inputs[input.componentId] === 0 })));
      } else if (value === 0) {
        posTerms.push(table.inputs.map((input) => ({ label: input.label, negated: row.inputs[input.componentId] === 1 })));
      }
    }
    return { outputLabel: output.label, outputComponentId: output.componentId, sopTerms, posTerms };
  });

export const formatSop = (expression: BooleanExpression): string => {
  if (expression.sopTerms.length === 0) return `${expression.outputLabel} = 0`;
  const body = expression.sopTerms
    .map((term) => term.map((literal) => (literal.negated ? `${literal.label}'` : literal.label)).join(''))
    .join(' + ');
  return `${expression.outputLabel} = ${body}`;
};

export const formatPos = (expression: BooleanExpression): string => {
  if (expression.posTerms.length === 0) return `${expression.outputLabel} = 1`;
  const body = expression.posTerms
    .map((term) => `(${term.map((literal) => (literal.negated ? `${literal.label}'` : literal.label)).join(' + ')})`)
    .join('');
  return `${expression.outputLabel} = ${body}`;
};

export type ErcFindingType = 'floating_input' | 'output_contention' | 'combinational_loop';

export interface ErcFinding {
  readonly type: ErcFindingType;
  readonly message: string;
  readonly componentIds: readonly string[];
}

const componentIdOf = (key: PortKey): string => key.split(':')[0]!;

export const runElectricalRuleCheck = (document: LogicDocument): ErcFinding[] => {
  const netIndex = buildNetIndex(document.components, document.wires);
  const findings: ErcFinding[] = [];
  const seenFloating = new Set<string>();

  for (const members of netIndex.members.values()) {
    const inputKeys = members.filter((key) => netIndex.directionOf.get(key) === 'input');
    const outputKeys = members.filter((key) => netIndex.directionOf.get(key) === 'output');
    if (outputKeys.length === 0 && inputKeys.length > 0) {
      const ids = inputKeys.map(componentIdOf);
      const dedupeKey = ids.slice().sort().join(',');
      if (!seenFloating.has(dedupeKey)) {
        seenFloating.add(dedupeKey);
        findings.push({ type: 'floating_input', message: `${inputKeys.length} input pin(s) have no driving output on this net and will read as floating (Z).`, componentIds: ids });
      }
    }
    if (outputKeys.length >= 2) {
      findings.push({ type: 'output_contention', message: `${outputKeys.length} outputs are wired to the same net and may contend for its value.`, componentIds: outputKeys.map(componentIdOf) });
    }
  }

  const combinationalIds = new Set(document.components.filter((component) => isCombinationalGate(component.type)).map((component) => component.id));
  const adjacency = new Map<string, Set<string>>();
  for (const wire of document.wires) {
    const fromDirection = netIndex.directionOf.get(portKey(wire.from.componentId, wire.from.portId));
    const toDirection = netIndex.directionOf.get(portKey(wire.to.componentId, wire.to.portId));
    const outputEnd = fromDirection === 'output' ? wire.from : toDirection === 'output' ? wire.to : undefined;
    const inputEnd = fromDirection === 'input' ? wire.from : toDirection === 'input' ? wire.to : undefined;
    if (!outputEnd || !inputEnd) continue;
    if (!combinationalIds.has(outputEnd.componentId) || !combinationalIds.has(inputEnd.componentId)) continue;
    if (!adjacency.has(outputEnd.componentId)) adjacency.set(outputEnd.componentId, new Set());
    adjacency.get(outputEnd.componentId)!.add(inputEnd.componentId);
  }

  const visited = new Set<string>();
  const onStack = new Set<string>();
  const cycleNodes = new Set<string>();
  const visit = (node: string): boolean => {
    visited.add(node);
    onStack.add(node);
    let inCycle = false;
    for (const next of adjacency.get(node) ?? []) {
      if (onStack.has(next)) {
        cycleNodes.add(node);
        cycleNodes.add(next);
        inCycle = true;
      } else if (!visited.has(next) && visit(next)) {
        cycleNodes.add(node);
        inCycle = true;
      }
    }
    onStack.delete(node);
    return inCycle;
  };
  for (const id of combinationalIds) if (!visited.has(id)) visit(id);
  if (cycleNodes.size > 0) {
    findings.push({ type: 'combinational_loop', message: 'These gates form an unbuffered combinational loop with no flip-flop or latch breaking it. Under ideal zero-delay simulation this cannot settle.', componentIds: [...cycleNodes] });
  }

  return findings;
};

import { addComponent, addWire, relabelComponent, updateComponentParams } from './circuit-model';
import { getComponentPorts } from './component-library';
import { documentBoundingBox, GRID_SIZE, orthogonalWaypoints, portAbsolutePosition } from './geometry';
import type { ComponentInstance, ComponentType, LogicDocument, PortRef } from './logic-types';
import type { Literal } from './minimize-engine';

/**
 * Turns a minimized two-level Boolean expression into a real, wired circuit
 * of the workstation's own gates: switches for the variables, inverters for
 * complemented literals, one gate per term, and a second-level gate combining
 * them into an LED. Nothing here is drawn specially; the result is ordinary
 * components and wires that simulate, export, and edit like any others.
 */

export type TwoLevelForm = 'sop' | 'pos';

export interface SynthesisSpec {
  readonly form: TwoLevelForm;
  /** The variables, in minterm bit order (variable 0 is the least significant). */
  readonly variables: readonly string[];
  /** Product terms (for `sop`) or sum terms (for `pos`), each a list of literals. Must not be empty. */
  readonly terms: readonly (readonly Literal[])[];
  readonly outputLabel: string;
}

export interface SynthesisResult {
  readonly document: LogicDocument;
  /** Ids of every component the synthesis added, in creation order. */
  readonly addedComponentIds: readonly string[];
  readonly outputComponentId: string;
}

export interface GridPoint {
  readonly x: number;
  readonly y: number;
}

/** The widest gate the workstation offers; a wider term list is combined through a tree of these. */
const MAX_GATE_INPUTS = 8;

const COLUMN_SPACING = 6;
const ROW_GAP = 1;

const gateRows = (inputCount: number): number => Math.max(2, inputCount);

/** A source of a signal during synthesis: the pin a wire should start from. */
type Signal = PortRef;

/**
 * Builds the circuit at `origin` (grid units, its top-left) and returns the
 * new document. Throws when there is nothing to build (no terms, or a term
 * with no literals): a constant function has no gates to draw.
 */
export const synthesizeTwoLevel = (base: LogicDocument, spec: SynthesisSpec, origin: GridPoint): SynthesisResult => {
  if (spec.terms.length === 0 || spec.terms.some((term) => term.length === 0)) {
    throw new RangeError('A constant function has no gates to draw; there is nothing to synthesize.');
  }
  for (const term of spec.terms) {
    for (const literal of term) {
      if (!spec.variables.includes(literal.variable)) throw new RangeError(`Term uses "${literal.variable}", which is not one of the variables.`);
    }
  }

  let document = base;
  const added: string[] = [];

  const place = (type: ComponentType, x: number, y: number, label: string, params: Partial<ComponentInstance['params']> = {}): ComponentInstance => {
    document = addComponent(document, type, x, y);
    const created = document.components[document.components.length - 1]!;
    document = relabelComponent(document, created.id, label);
    if (Object.keys(params).length > 0) document = updateComponentParams(document, created.id, params);
    added.push(created.id);
    return document.components[document.components.length - 1]!;
  };

  const portOf = (component: ComponentInstance, portId: string): PortRef => ({ componentId: component.id, portId });

  const connect = (from: Signal, to: PortRef): void => {
    const source = document.components.find((component) => component.id === from.componentId)!;
    const target = document.components.find((component) => component.id === to.componentId)!;
    const sourcePort = getComponentPorts(source.type, source.params).find((port) => port.id === from.portId)!;
    const targetPort = getComponentPorts(target.type, target.params).find((port) => port.id === to.portId)!;
    const start = portAbsolutePosition(source, sourcePort);
    const end = portAbsolutePosition(target, targetPort);
    document = addWire(document, from, to, orthogonalWaypoints(start, end));
  };

  // --- Inputs: one switch per variable, in bit order so the truth table reads them the same way. ---
  const rowsPerInput = 3;
  const switches = new Map<string, ComponentInstance>();
  spec.variables.forEach((variable, index) => {
    switches.set(variable, place('SWITCH', origin.x, origin.y + index * rowsPerInput, variable));
  });

  // --- Complemented literals: one inverter per variable, however many terms use it. ---
  const inverters = new Map<string, ComponentInstance>();
  const inverterColumn = origin.x + COLUMN_SPACING;
  for (const term of spec.terms) {
    for (const literal of term) {
      if (!literal.negated || inverters.has(literal.variable)) continue;
      const index = spec.variables.indexOf(literal.variable);
      const inverter = place('NOT', inverterColumn, origin.y + index * rowsPerInput, `${literal.variable}'`);
      connect(portOf(switches.get(literal.variable)!, 'Y'), portOf(inverter, 'A'));
      inverters.set(literal.variable, inverter);
    }
  }
  const literalSignal = (literal: Literal): Signal =>
    literal.negated ? portOf(inverters.get(literal.variable)!, 'Y') : portOf(switches.get(literal.variable)!, 'Y');

  const firstLevel: ComponentType = spec.form === 'sop' ? 'AND' : 'OR';
  const secondLevel: ComponentType = spec.form === 'sop' ? 'OR' : 'AND';

  // --- First level: one gate per multi-literal term; a lone literal feeds the next level directly. ---
  const termColumn = origin.x + COLUMN_SPACING * 2;
  let cursorY = origin.y;
  const termSignals: Signal[] = spec.terms.map((term, index) => {
    if (term.length === 1) return literalSignal(term[0]!);
    const gate = place(firstLevel, termColumn, cursorY, `T${index + 1}`, { inputCount: term.length });
    cursorY += gateRows(term.length) + ROW_GAP;
    term.forEach((literal, position) => connect(literalSignal(literal), portOf(gate, String.fromCharCode(65 + position))));
    return portOf(gate, 'Y');
  });

  // --- Second level: combine the term outputs, through a tree when there are more than one gate can take. ---
  let column = origin.x + COLUMN_SPACING * 3;
  let level: Signal[] = termSignals;
  let combineY = origin.y;
  while (level.length > 1) {
    const next: Signal[] = [];
    for (let offset = 0; offset < level.length; offset += MAX_GATE_INPUTS) {
      const group = level.slice(offset, offset + MAX_GATE_INPUTS);
      if (group.length === 1) {
        next.push(group[0]!);
        continue;
      }
      const gate = place(secondLevel, column, combineY, group.length === level.length ? spec.outputLabel : `${spec.outputLabel}.${next.length + 1}`, { inputCount: group.length });
      combineY += gateRows(group.length) + ROW_GAP;
      group.forEach((signal, position) => connect(signal, portOf(gate, String.fromCharCode(65 + position))));
      next.push(portOf(gate, 'Y'));
    }
    level = next;
    column += COLUMN_SPACING;
    combineY = origin.y;
  }

  // --- Output LED. ---
  const led = place('LED', column, origin.y, spec.outputLabel);
  connect(level[0]!, portOf(led, 'A'));

  return { document, addedComponentIds: added, outputComponentId: led.id };
};

/**
 * Where to put generated circuitry so it does not land on the existing
 * drawing: the same left edge, four grid rows below everything already placed.
 */
export const freeSpaceBelow = (components: readonly ComponentInstance[]): GridPoint => {
  if (components.length === 0) return { x: 2, y: 2 };
  const box = documentBoundingBox(components);
  return { x: Math.round(box.minX / GRID_SIZE) + 1, y: Math.ceil(box.maxY / GRID_SIZE) + 3 };
};

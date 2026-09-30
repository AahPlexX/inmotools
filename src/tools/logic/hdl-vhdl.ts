import { cellFor, type CellPort, type CellUse } from './cell-map';
import { VHDL_CELLS } from './hdl-cells';
import type { HdlExport } from './hdl-verilog';
import type { LogicDocument } from './logic-types';
import { buildNetlist, Namer, type ModulePort, type Net, type Netlist, type NetlistPart } from './netlist-engine';

/**
 * Structural VHDL for a circuit: one entity whose ports are the circuit's
 * switches, buttons, clocks and input ports (inputs) and its LEDs, probes,
 * output ports and display pins (outputs), a `signal` for every internal net,
 * and one entity instantiation per part. Every part is an instance of a small
 * behavioral cell that is written into the same file, so the file analyzes on
 * its own in any VHDL-93 tool (ports of mode `out` are never read: an output
 * that other parts use goes through an internal signal).
 */

const oneLine = (text: string): string => text.replace(/[\r\n]+/g, ' ').trim();

const vector = (width: number): string => (width === 1 ? 'std_logic' : `std_logic_vector(${width - 1} downto 0)`);

/**
 * Names the signals VHDL reads. An output port cannot be read, so a net that is named after one is written through
 * `<port>_o`; every other net keeps its name.
 */
class NetNames {
  private readonly outputSignal = new Map<string, string>();

  constructor(netlist: Netlist, namer: Namer) {
    for (const port of netlist.ports) {
      if (port.direction === 'output') this.outputSignal.set(port.name, namer.claim(`${port.name}_o`, 'o'));
    }
  }

  /** The signal that stands for an output port's value. */
  signalFor(portName: string): string | undefined {
    return this.outputSignal.get(portName);
  }

  expression(net: Net): string {
    const base = this.outputSignal.get(net.name) ?? net.name;
    return net.bit === undefined ? base : `${base}(${net.bit})`;
  }
}

const pinExpression = (netlist: Netlist, names: NetNames, part: NetlistPart, pinId: string): string => {
  const pin = part.pins.find((candidate) => candidate.id === pinId)!;
  return names.expression(netlist.nets[pin.net]!);
};

const genericMap = (use: CellUse): string =>
  Object.keys(use.generics).length === 0 ? '' : ` generic map (${Object.entries(use.generics).map(([name, value]) => `${name} => ${value}`).join(', ')})`;

/** An input connection: the net, an aggregate for a vector (`(2 => n2, 1 => n1, 0 => n0)`), or `'Z'` for a missing pin. */
const inputActual = (netlist: Netlist, names: NetNames, part: NetlistPart, port: CellPort): string => {
  const one = (pin: string | null): string => (pin === null ? "'Z'" : pinExpression(netlist, names, part, pin));
  if (!port.vector) return one(port.pins[0]!);
  return `(${port.pins.map((pin, index) => `${index} => ${one(pin)}`).reverse().join(', ')})`;
};

const portDeclaration = (port: ModulePort, names: NetNames): string => `${port.name} : ${port.direction === 'input' ? 'in' : 'out'} ${vector(port.width)}`;

export const exportVhdl = (source: LogicDocument, options: { readonly moduleName?: string } = {}): HdlExport => {
  const netlist = buildNetlist(source, { moduleName: options.moduleName });
  const warnings: string[] = [];
  const namer = new Namer(netlist.names);
  const names = new NetNames(netlist, namer);

  const usedCells = new Set<string>();
  const inlineUnits: string[] = [];
  const instances: string[] = [];
  const localSignals: string[] = [];

  for (const part of netlist.parts) {
    const mapped = cellFor(part);
    if (mapped === undefined) continue;
    if ('error' in mapped) {
      warnings.push(mapped.error);
      continue;
    }
    const use = mapped.use;
    warnings.push(...use.notes.map((note) => `${part.ref} (${part.label}): ${note}`));
    const label = namer.claim(part.ref.toLowerCase(), 'u');
    if (use.inline) inlineUnits.push(use.inline.vhdl);
    else usedCells.add(use.cell);

    // An output vector must be connected to a signal of its own, so each bit can be handed on to its net.
    const outputLines: string[] = [];
    const maps: string[] = [];
    for (const port of use.ports) {
      if (port.direction === 'input') {
        maps.push(`${port.name} => ${inputActual(netlist, names, part, port)}`);
      } else if (!port.vector) {
        maps.push(`${port.name} => ${pinExpression(netlist, names, part, port.pins[0]!)}`);
      } else {
        const signal = namer.claim(`${label}_${port.name}`, 's');
        localSignals.push(`  signal ${signal} : std_logic_vector(${port.pins.length - 1} downto 0);`);
        maps.push(`${port.name} => ${signal}`);
        port.pins.forEach((pin, index) => {
          if (pin !== null) outputLines.push(`  ${pinExpression(netlist, names, part, pin)} <= ${signal}(${index});`);
        });
      }
    }
    const comment = `  -- ${part.ref}: ${oneLine(part.label)} (${part.type})`;
    instances.push([
      comment,
      `  ${label} : entity work.${use.cell}${genericMap(use)}`,
      `    port map (${maps.join(', ')});`,
      ...outputLines,
    ].join('\n'));
  }

  const library = [...usedCells].sort().map((cell) => {
    const text = VHDL_CELLS[cell];
    if (text === undefined) throw new Error(`No VHDL cell named ${cell}.`);
    return text;
  });

  const portNames = new Set(netlist.ports.map((port) => port.name));
  const internalNets = netlist.nets.filter((net) => !portNames.has(net.name));
  const signals = [
    ...netlist.ports.filter((port) => port.direction === 'output').map((port) => `  signal ${names.signalFor(port.name)} : ${vector(port.width)};`),
    ...(internalNets.length > 0 ? [`  signal ${internalNets.map((net) => net.name).join(', ')} : std_logic;`] : []),
    ...localSignals,
  ];

  // Ports join their nets: an output port is driven from its internal signal; an input whose net is named
  // something else (a second alias) is copied onto that net.
  const joins: string[] = [];
  for (const port of netlist.ports) {
    if (port.direction === 'output') {
      joins.push(`  ${port.name} <= ${names.signalFor(port.name)};`);
    }
    port.nets.forEach((netIndex, bit) => {
      const net = netlist.nets[netIndex]!;
      const portExpr = port.width === 1 ? port.name : `${port.name}(${bit})`;
      const netExpr = names.expression(net);
      const ownSignal = port.direction === 'output' ? (port.width === 1 ? names.signalFor(port.name)! : `${names.signalFor(port.name)}(${bit})`) : portExpr;
      if (ownSignal === netExpr) return;
      joins.push(port.direction === 'input' ? `  ${netExpr} <= ${portExpr};` : `  ${ownSignal} <= ${netExpr};`);
    });
  }

  const meta = source.metadata;
  const header = [
    '-- Structural VHDL generated by the InMo Tools Digital Logic Workstation.',
    `-- Project: ${oneLine(meta.title)}`,
    ...(meta.author ? [`-- Author: ${oneLine(meta.author)}`] : []),
    `-- Version: ${oneLine(meta.version)}    License: ${oneLine(meta.license)}`,
    ...(meta.description ? [`-- ${oneLine(meta.description)}`] : []),
    '-- Subcircuits are flattened into this entity. Unconnected inputs float (high impedance), as they do in the workstation.',
  ];

  const ports = netlist.ports.map((port) => portDeclaration(port, names));
  const entity = [
    'library ieee;',
    'use ieee.std_logic_1164.all;',
    '',
    `entity ${netlist.name} is`,
    ...(ports.length > 0 ? ['  port (', ports.map((port) => `    ${port}`).join(';\n'), '  );'] : []),
    `end entity ${netlist.name};`,
    '',
    `architecture structural of ${netlist.name} is`,
    ...signals,
    'begin',
    ...(joins.length > 0 ? [...joins, ''] : []),
    ...instances.flatMap((instance) => [instance, '']),
    'end architecture structural;',
  ].join('\n');

  const sections = [header.join('\n'), ...library, ...inlineUnits, entity];
  return { text: `${sections.join('\n\n')}\n`, warnings };
};

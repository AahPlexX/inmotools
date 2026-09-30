import { cellFor, GATE_CELL_NAMES, type CellPort, type CellUse } from './cell-map';
import { VERILOG_CELLS } from './hdl-cells';
import type { LogicDocument } from './logic-types';
import { buildNetlist, Namer, netExpression, type ModulePort, type Net, type Netlist, type NetlistPart } from './netlist-engine';

/**
 * Structural Verilog for a circuit: one module whose ports are the circuit's
 * switches, buttons, clocks and input ports (inputs) and its LEDs, probes,
 * output ports and display pins (outputs), a `wire` for every internal net,
 * and one instance per part. Gates are Verilog primitives; everything else is
 * an instance of a small behavioral cell that is written into the same file,
 * so the file compiles on its own in any Verilog-2005 tool.
 */

export interface HdlExport {
  readonly text: string;
  /** Anything about the circuit the person should know before using the file: a part left out, a part represented approximately. */
  readonly warnings: readonly string[];
}

export interface VerilogOptions {
  /** Puts each gate's propagation delay on its primitive (`and #(5) ...`), for timing simulation. */
  readonly delays?: boolean;
  readonly moduleName?: string;
}

const PRIMITIVE_FOR_CELL: Readonly<Record<string, string>> = {
  lw_and: 'and', lw_or: 'or', lw_nand: 'nand', lw_nor: 'nor', lw_xor: 'xor', lw_xnor: 'xnor', lw_not: 'not', lw_buf: 'buf', lw_tribuf: 'bufif1',
};

const oneLine = (text: string): string => text.replace(/[\r\n]+/g, ' ').trim();

const expression = (netlist: Netlist, part: NetlistPart, pinId: string | null): string => {
  if (pinId === null) return "1'bz";
  const pin = part.pins.find((candidate) => candidate.id === pinId)!;
  return netExpression(netlist.nets[pin.net]!, 'verilog');
};

/** A cell port's connection: the net, a concatenation (most significant bit first), or high-impedance for a missing pin. */
const connection = (netlist: Netlist, part: NetlistPart, port: CellPort): string => {
  if (!port.vector && port.pins.length === 1) return port.pins[0] === null && port.direction === 'output' ? '' : expression(netlist, part, port.pins[0]!);
  const bits = [...port.pins].reverse().map((pin) => expression(netlist, part, pin));
  return bits.length === 1 ? bits[0]! : `{${bits.join(', ')}}`;
};

const portDeclaration = (port: ModulePort): string => `${port.direction} wire${port.width > 1 ? ` [${port.width - 1}:0]` : ''} ${port.name}`;

/** The wire assignments that join a port to a net that is named something else (a second LED on one net, say). */
const aliases = (netlist: Netlist): string[] => {
  const lines: string[] = [];
  for (const port of netlist.ports) {
    port.nets.forEach((netIndex, bit) => {
      const net = netlist.nets[netIndex]!;
      const portExpr = port.width === 1 ? port.name : `${port.name}[${bit}]`;
      const netExpr = netExpression(net, 'verilog');
      if (portExpr === netExpr) return;
      lines.push(port.direction === 'input' ? `  assign ${netExpr} = ${portExpr};` : `  assign ${portExpr} = ${netExpr};`);
    });
  }
  return lines;
};

const internalNets = (netlist: Netlist): Net[] => {
  const portNames = new Set(netlist.ports.map((port) => port.name));
  return netlist.nets.filter((net) => !portNames.has(net.name));
};

const genericText = (use: CellUse): string =>
  Object.keys(use.generics).length === 0 ? '' : ` #(${Object.entries(use.generics).map(([name, value]) => `.${name}(${value})`).join(', ')})`;

export const exportVerilog = (source: LogicDocument, options: VerilogOptions = {}): HdlExport => {
  const netlist = buildNetlist(source, { moduleName: options.moduleName });
  const warnings: string[] = [];
  const instanceNames = new Namer(netlist.names);

  const usedCells = new Set<string>();
  const inlineModules: string[] = [];
  const instances: string[] = [];

  for (const part of netlist.parts) {
    const mapped = cellFor(part);
    if (mapped === undefined) continue;
    if ('error' in mapped) {
      warnings.push(mapped.error);
      continue;
    }
    const use = mapped.use;
    warnings.push(...use.notes.map((note) => `${part.ref} (${part.label}): ${note}`));
    const name = instanceNames.claim(part.ref.toLowerCase(), 'u');
    const comment = `  // ${part.ref}: ${oneLine(part.label)} (${part.type})`;

    const primitive = PRIMITIVE_FOR_CELL[use.cell];
    if (primitive !== undefined) {
      const output = expression(netlist, part, use.ports.find((port) => port.direction === 'output')!.pins[0]!);
      const inputs = use.ports.filter((port) => port.direction === 'input').flatMap((port) => port.pins.map((pin) => expression(netlist, part, pin)));
      const delay = options.delays && part.params.delayNs !== undefined ? ` #(${part.params.delayNs})` : '';
      instances.push(`${comment}\n  ${primitive}${delay} ${name} (${[output, ...inputs].join(', ')});`);
      continue;
    }

    if (use.inline) inlineModules.push(use.inline.verilog);
    else usedCells.add(use.cell);
    const ports = use.ports.map((port) => `.${port.name}(${connection(netlist, part, port)})`).join(', ');
    instances.push(`${comment}\n  ${use.cell}${genericText(use)} ${name} (${ports});`);
  }

  const library = [...usedCells].filter((cell) => !GATE_CELL_NAMES.includes(cell)).sort().map((cell) => VERILOG_CELLS[cell]!);
  const meta = source.metadata;
  const header = [
    '// Structural Verilog generated by the InMo Tools Digital Logic Workstation.',
    `// Project: ${oneLine(meta.title)}`,
    ...(meta.author ? [`// Author: ${oneLine(meta.author)}`] : []),
    `// Version: ${oneLine(meta.version)}    License: ${oneLine(meta.license)}`,
    ...(meta.description ? [`// ${oneLine(meta.description)}`] : []),
    '// Subcircuits are flattened into this module. Unconnected inputs float (high impedance), as they do in the workstation.',
  ];

  const ports = netlist.ports.map(portDeclaration);
  const nets = internalNets(netlist);
  const body = [
    ...(nets.length > 0 ? [`  wire ${nets.map((net) => net.name).join(', ')};`, ''] : []),
    ...(aliases(netlist).length > 0 ? [...aliases(netlist), ''] : []),
    ...instances.flatMap((instance) => [instance, '']),
  ];

  const top = [
    `module ${netlist.name} (`,
    ports.map((port) => `  ${port}`).join(',\n'),
    ');',
    '',
    ...body,
    'endmodule',
  ];
  // A module with no ports is legal, but an empty port list would print a blank line; keep the header tidy.
  const topText = (ports.length === 0 ? [`module ${netlist.name};`, '', ...body, 'endmodule'] : top).join('\n');

  const sections = [header.join('\n'), '`timescale 1ns / 1ps', ...library, ...inlineModules, topText];
  return { text: `${sections.join('\n\n')}\n`, warnings };
};

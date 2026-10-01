import { selectBitsOf, hasEnablePin, type BlockType } from './block-engine';
import type { HdlExport } from './hdl-verilog';
import type { LogicDocument } from './logic-types';
import { buildNetlist, type Netlist, type NetlistPart } from './netlist-engine';
import { markerWidthOf } from './subcircuit-ports';

/**
 * A SPICE `.cir` netlist of the circuit's combinational logic: a subcircuit
 * for each kind of gate or block used, built from behavioral voltage sources
 * that read a pin as high above half the supply, then the circuit itself as
 * subcircuit instances, with a voltage source for every switch, button,
 * clock and input port.
 *
 * SPICE has no event-driven digital state, so parts that hold state (flip-flops,
 * latches, counters, registers, memories) and the arithmetic unit are not
 * written: each is named in the warnings and its nets are left as they are,
 * so the rest of the circuit is still a valid, solvable netlist. The
 * behavioral sources follow the logic levels, not gate physics: propagation
 * delay is not modeled.
 */

export interface SpiceOptions {
  /** The supply voltage a logic 1 is at (default 5). */
  readonly supply?: number;
}

const bit = (pin: string): string => `((V(${pin}) > {vth}) ? 1 : 0)`;

const range = (count: number): number[] => Array.from({ length: count }, (_, index) => index);

const GATE_NAMES = ['AND', 'OR', 'NAND', 'NOR', 'XOR', 'XNOR'] as const;
type GateName = (typeof GATE_NAMES)[number];

const gateExpression = (gate: GateName, pins: readonly string[]): string => {
  const bits = pins.map(bit);
  switch (gate) {
    case 'AND': return `{vdd} * (${bits.join(' * ')})`;
    case 'NAND': return `{vdd} * (1 - ${bits.join(' * ')})`;
    case 'OR': return `{vdd} * (${bits.length > 1 ? `min(1, ${bits.join(' + ')})` : bits[0]})`;
    case 'NOR': return `{vdd} * (1 - min(1, ${bits.join(' + ')}))`;
    case 'XOR': return `{vdd} * ((${bits.join(' + ')}) - 2 * floor((${bits.join(' + ')}) / 2))`;
    case 'XNOR': return `{vdd} * (1 - ((${bits.join(' + ')}) - 2 * floor((${bits.join(' + ')}) / 2)))`;
  }
};

/** The behavioral subcircuit text for each cell a circuit uses, keyed by subcircuit name. */
const cellText = (name: string, pins: readonly string[], sources: readonly string[]): string =>
  [`.subckt ${name} ${pins.join(' ')}`, ...sources.map((source, index) => `B${index + 1} ${source}`), `.ends ${name}`].join('\n');

const selectValue = (pins: readonly string[]): string => pins.map((pin, index) => `${2 ** index} * ${bit(pin)}`).join(' + ') || '0';

const BCD_LIT: readonly (readonly number[])[] = [
  [0, 2, 3, 5, 6, 7, 8, 9],
  [0, 1, 2, 3, 4, 7, 8, 9],
  [0, 1, 3, 4, 5, 6, 7, 8, 9],
  [0, 2, 3, 5, 6, 8],
  [0, 2, 6, 8],
  [0, 4, 5, 6, 8, 9],
  [2, 3, 4, 5, 6, 8, 9],
];

interface Cell {
  readonly name: string;
  readonly text: string;
  /** The part's pins in the order the subcircuit lists its ports. */
  readonly pins: readonly string[];
}

const cellFor = (part: NetlistPart): { readonly cell: Cell } | { readonly skipped: string } | undefined => {
  const params = part.params;
  const inputs = part.pins.filter((pin) => pin.direction === 'input').map((pin) => pin.id);
  switch (part.type) {
    case 'AND': case 'OR': case 'NAND': case 'NOR': case 'XOR': case 'XNOR': {
      const ports = inputs.map((_, index) => `a${index}`);
      const name = `LW_${part.type}${inputs.length}`;
      return { cell: { name, text: cellText(name, [...ports, 'y'], [`y 0 V = ${gateExpression(part.type, ports)}`]), pins: [...inputs, 'Y'] } };
    }
    case 'NOT':
      return { cell: { name: 'LW_NOT', text: cellText('LW_NOT', ['a', 'y'], [`y 0 V = {vdd} * (1 - ${bit('a')})`]), pins: ['A', 'Y'] } };
    case 'BUFFER':
      return { cell: { name: 'LW_BUF', text: cellText('LW_BUF', ['a', 'y'], [`y 0 V = {vdd} * ${bit('a')}`]), pins: ['A', 'Y'] } };
    case 'TRI_BUFFER':
      return {
        cell: {
          name: 'LW_TRI',
          // The output is a driven source through a switch: with the enable low the switch opens and the output floats.
          text: ['.model LW_SW SW(Vt={vth} Vh=0 Ron=1 Roff=1G)', '.subckt LW_TRI a en y', 'B1 m 0 V = {vdd} * ((V(a) > {vth}) ? 1 : 0)', 'S1 m y en 0 LW_SW', '.ends LW_TRI'].join('\n'),
          pins: ['A', 'EN', 'Y'],
        },
      };
    case 'MUX': {
      const select = selectBitsOf(part.type as BlockType, params);
      const enabled = hasEnablePin(part.type as BlockType, params);
      const data = range(1 << select).map((index) => `d${index}`);
      const selects = range(select).map((index) => `s${index}`);
      const chosen = data.reduceRight((rest, pin, index) => `(sel == ${index}) ? ${bit(pin)} : (${rest})`, '0');
      const name = `LW_MUX${1 << select}${enabled ? '_EN' : ''}`;
      const value = `(${chosen.replace(/\bsel\b/g, `(${selectValue(selects)})`)})`;
      return { cell: { name, text: cellText(name, [...data, ...selects, ...(enabled ? ['en'] : []), 'y'], [`y 0 V = {vdd} * ${enabled ? `${bit('en')} * ` : ''}${value}`]), pins: [...range(1 << select).map((index) => `D${index}`), ...range(select).map((index) => `S${index}`), ...(enabled ? ['EN'] : []), 'Y'] } };
    }
    case 'DEMUX': {
      const select = selectBitsOf(part.type as BlockType, params);
      const enabled = hasEnablePin(part.type as BlockType, params);
      const selects = range(select).map((index) => `s${index}`);
      const outputs = range(1 << select).map((index) => `y${index}`);
      const name = `LW_DEMUX${1 << select}${enabled ? '_EN' : ''}`;
      const sources = outputs.map((pin, index) => `${pin} 0 V = {vdd} * (((${selectValue(selects)}) == ${index}) ? ${bit('d')}${enabled ? ` * ${bit('en')}` : ''} : 0)`);
      return { cell: { name, text: cellText(name, ['d', ...selects, ...(enabled ? ['en'] : []), ...outputs], sources), pins: ['D', ...range(select).map((index) => `S${index}`), ...(enabled ? ['EN'] : []), ...range(1 << select).map((index) => `Y${index}`)] } };
    }
    case 'DECODER': {
      const select = selectBitsOf(part.type as BlockType, params);
      const enabled = hasEnablePin(part.type as BlockType, params);
      const high = params.activeHigh !== false;
      const address = range(select).map((index) => `a${index}`);
      const outputs = range(1 << select).map((index) => `y${index}`);
      const name = `LW_DEC${1 << select}${enabled ? '_EN' : ''}${high ? '' : '_N'}`;
      const sources = outputs.map((pin, index) => {
        const hot = `(((${selectValue(address)}) == ${index}) ? ${enabled ? bit('en') : '1'} : 0)`;
        return `${pin} 0 V = {vdd} * ${high ? hot : `(1 - ${hot})`}`;
      });
      return { cell: { name, text: cellText(name, [...address, ...(enabled ? ['en'] : []), ...outputs], sources), pins: [...range(select).map((index) => `A${index}`), ...(enabled ? ['EN'] : []), ...range(1 << select).map((index) => `Y${index}`)] } };
    }
    case 'PRIORITY_ENCODER': {
      const bits = selectBitsOf(part.type as BlockType, params);
      const requests = range(1 << bits).map((index) => `i${index}`);
      // The highest asserted request wins: fold from the lowest so a higher one overrides.
      const winner = requests.reduce((rest, pin, index) => `(${bit(pin)} ? ${index} : ${rest})`, '0');
      const name = `LW_ENC${1 << bits}`;
      const sources = [
        ...range(bits).map((position) => `y${position} 0 V = {vdd} * (floor(${winner} / ${2 ** position}) - 2 * floor(${winner} / ${2 ** (position + 1)}))`),
        `v 0 V = {vdd} * min(1, ${requests.map(bit).join(' + ')})`,
      ];
      return { cell: { name, text: cellText(name, [...requests, ...range(bits).map((index) => `y${index}`), 'v'], sources), pins: [...range(1 << bits).map((index) => `I${index}`), ...range(bits).map((index) => `Y${index}`), 'V'] } };
    }
    case 'BCD_7SEG': {
      const enabled = hasEnablePin(part.type as BlockType, params);
      const high = params.activeHigh !== false;
      const digits = ['d0', 'd1', 'd2', 'd3'];
      const code = selectValue(digits);
      const segments = 'abcdefg'.split('');
      const sources = segments.map((segment, index) => {
        const lit = `(${BCD_LIT[index]!.map((value) => `((${code}) == ${value})`).join(' + ')})`;
        const shown = enabled ? `(${lit} * ${bit('en')})` : lit;
        return `${segment} 0 V = {vdd} * ${high ? shown : `(1 - ${shown})`}`;
      });
      const name = `LW_BCD${enabled ? '_EN' : ''}${high ? '' : '_N'}`;
      return { cell: { name, text: cellText(name, [...digits, ...(enabled ? ['en'] : []), ...segments], sources), pins: ['D0', 'D1', 'D2', 'D3', ...(enabled ? ['EN'] : []), 'A', 'B', 'C', 'D', 'E', 'F', 'G'] } };
    }
    case 'D_FLIP_FLOP': case 'JK_FLIP_FLOP': case 'T_FLIP_FLOP': case 'SR_LATCH': case 'COUNTER': case 'REGISTER': case 'RAM':
      return { skipped: 'holds state, which SPICE cannot represent without an event-driven digital simulator' };
    case 'ALU': case 'ROM':
      return { skipped: 'is not written as a SPICE subcircuit' };
    default:
      return undefined;
  }
};

const netName = (netlist: Netlist, part: NetlistPart, pinId: string): string => {
  const pin = part.pins.find((candidate) => candidate.id === pinId)!;
  const net = netlist.nets[pin.net]!;
  return net.bit === undefined ? net.name : `${net.name}_${net.bit}`;
};

export const exportSpice = (source: LogicDocument, options: SpiceOptions = {}): HdlExport => {
  const supply = options.supply ?? 5;
  const netlist = buildNetlist(source);
  const warnings: string[] = [];
  const cells = new Map<string, Cell>();
  const instances: string[] = [];
  const sources: string[] = [];

  for (const part of netlist.parts) {
    if (part.type === 'SWITCH' || part.type === 'PUSH_BUTTON') {
      const level = part.params.initialLevel === 1 ? '{vdd}' : '0';
      sources.push(`* ${part.ref}: ${part.label}${part.type === 'PUSH_BUTTON' ? ' (a push button starts released)' : ''}`);
      sources.push(`V${part.ref} ${netName(netlist, part, 'Y')} 0 DC ${level}`);
      continue;
    }
    if (part.type === 'CLOCK') {
      const frequency = Math.max(0.01, part.params.frequencyHz ?? 1);
      const period = 1 / frequency;
      sources.push(`* ${part.ref}: ${part.label} (${frequency} Hz)`);
      sources.push(`V${part.ref} ${netName(netlist, part, 'Y')} 0 PULSE(0 {vdd} 0 1n 1n ${period / 2} ${period})`);
      continue;
    }
    if (part.type === 'PORT_IN') {
      const width = markerWidthOf(part.params);
      const value = Math.max(0, Math.trunc(part.params.portValue ?? 0));
      sources.push(`* ${part.ref}: ${part.label}`);
      for (let index = 0; index < width; index += 1) {
        const level = width === 1 ? (part.params.initialLevel === 1 ? '{vdd}' : '0') : (Math.floor(value / 2 ** index) % 2 === 1 ? '{vdd}' : '0');
        sources.push(`V${part.ref}_${index} ${netName(netlist, part, width === 1 ? 'Y' : `Y${index}`)} 0 DC ${level}`);
      }
      continue;
    }
    const mapped = cellFor(part);
    if (mapped === undefined) continue;
    if ('skipped' in mapped) {
      warnings.push(`${part.ref} (${part.label}, ${part.type}) ${mapped.skipped}, so it is not in the SPICE netlist.`);
      continue;
    }
    const { cell } = mapped;
    cells.set(cell.name, cell);
    const nodes = cell.pins.map((pin) => netName(netlist, part, pin));
    instances.push(`* ${part.ref}: ${part.label} (${part.type})`);
    instances.push(`X${part.ref} ${nodes.join(' ')} ${cell.name}`);
  }

  const outputs = netlist.ports.filter((port) => port.direction === 'output');
  const lines = [
    `* ${source.metadata.title} — SPICE netlist from the InMo Tools Digital Logic Workstation`,
    ...(source.metadata.author ? [`* Author: ${source.metadata.author.replace(/[\r\n]+/g, ' ')}`] : []),
    `* Version ${source.metadata.version}, license ${source.metadata.license}`,
    '* Logic is modeled by behavioral sources: a pin is high above half the supply. Propagation delay is not modeled.',
    `.param vdd=${supply}`,
    '.param vth={vdd/2}',
    '',
    ...[...cells.values()].flatMap((cell) => [cell.text, '']),
    '* Inputs',
    ...sources,
    '',
    '* Circuit',
    ...instances,
    '',
    ...(outputs.length > 0 ? ['* Outputs: ' + outputs.map((port) => (port.width === 1 ? port.name : `${port.name}_0..${port.name}_${port.width - 1}`)).join(', ')] : []),
    '* Every node gets a large shunt resistor so an unconnected (floating) input still has a DC path (ngspice; other simulators use their own option).',
    '.options rshunt=1e12',
    '.op',
    '* .tran 1u 10m',
    '.end',
  ];
  return { text: `${lines.join('\n')}\n`, warnings };
};

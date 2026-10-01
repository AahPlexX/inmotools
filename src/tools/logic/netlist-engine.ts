import { getSimulationPorts } from './component-library';
import type { ComponentInstance, ComponentParams, ComponentType, LogicDocument } from './logic-types';
import { buildNetIndex } from './sim-engine';
import { flattenDocument } from './subcircuit-engine';
import { markerWidthOf } from './subcircuit-ports';
import { portKey } from './logic-types';

/**
 * Pure, framework-independent structural netlist: every part with its pins,
 * every net with a legal, unique name, and the ports of the circuit as a
 * module. All the text exporters (Verilog, VHDL, SPICE, KiCad, EDIF) and the
 * bill of materials are written against this one description, so they cannot
 * disagree about what is connected to what.
 *
 * A netlist is built from the flattened circuit, so a subcircuit contributes
 * its parts directly (named `<subcircuit>/<part>`), and from the same net
 * index the simulator uses, so a bus, a splitter tap and a plain wire all
 * resolve exactly as they do on screen.
 */

// --- SECTION: identifiers ---

/** Words that cannot be used as a name in Verilog, VHDL, or the tools that read them; a name that collides gets a suffix. */
const RESERVED = new Set([
  // Verilog
  'always', 'and', 'assign', 'begin', 'buf', 'bufif0', 'bufif1', 'case', 'casex', 'casez', 'cmos', 'deassign', 'default', 'defparam', 'disable', 'edge', 'else', 'end', 'endcase', 'endfunction', 'endgenerate', 'endmodule', 'endprimitive', 'endspecify', 'endtable', 'endtask', 'event', 'for', 'force', 'forever', 'fork', 'function', 'generate', 'genvar', 'highz0', 'highz1', 'if', 'ifnone', 'initial', 'inout', 'input', 'integer', 'join', 'large', 'localparam', 'macromodule', 'medium', 'module', 'nand', 'negedge', 'nmos', 'nor', 'not', 'notif0', 'notif1', 'or', 'output', 'parameter', 'pmos', 'posedge', 'primitive', 'pull0', 'pull1', 'pulldown', 'pullup', 'rcmos', 'real', 'realtime', 'reg', 'release', 'repeat', 'rnmos', 'rpmos', 'rtran', 'rtranif0', 'rtranif1', 'scalared', 'signed', 'small', 'specify', 'specparam', 'strong0', 'strong1', 'supply0', 'supply1', 'table', 'task', 'time', 'tran', 'tranif0', 'tranif1', 'tri', 'tri0', 'tri1', 'triand', 'trior', 'trireg', 'unsigned', 'vectored', 'wait', 'wand', 'weak0', 'weak1', 'while', 'wire', 'wor', 'xnor', 'xor',
  // VHDL
  'abs', 'access', 'after', 'alias', 'all', 'architecture', 'array', 'assert', 'attribute', 'block', 'body', 'buffer', 'bus', 'component', 'configuration', 'constant', 'downto', 'entity', 'exit', 'file', 'generic', 'group', 'guarded', 'impure', 'in', 'inertial', 'is', 'label', 'library', 'linkage', 'literal', 'loop', 'map', 'mod', 'next', 'null', 'of', 'on', 'open', 'others', 'out', 'package', 'port', 'postponed', 'procedure', 'process', 'pure', 'range', 'record', 'register', 'reject', 'rem', 'report', 'return', 'rol', 'ror', 'select', 'severity', 'shared', 'signal', 'sla', 'sll', 'sra', 'srl', 'subtype', 'then', 'to', 'transport', 'type', 'units', 'until', 'use', 'variable', 'when', 'with', 'xor',
]);

/**
 * Turns any text into an identifier that is legal in both Verilog and VHDL: letters, digits and single
 * underscores, starting with a letter, not ending in an underscore, and not a reserved word.
 */
export const sanitizeIdentifier = (text: string, fallback = 'n'): string => {
  let name = text
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (name === '') name = fallback;
  if (!/^[A-Za-z]/.test(name)) name = `${fallback}_${name}`;
  if (RESERVED.has(name.toLowerCase())) name = `${name}_s`;
  return name;
};

/** Hands out names that are unique whatever their case (VHDL does not tell `Y` from `y`). */
export class Namer {
  private readonly taken = new Set<string>();

  constructor(reserved: Iterable<string> = []) {
    for (const name of reserved) this.taken.add(name.toLowerCase());
  }

  /** Every name handed out so far, lower-cased, so a later namer can avoid them. */
  snapshot(): string[] {
    return [...this.taken];
  }

  claim(wanted: string, fallback = 'n'): string {
    const base = sanitizeIdentifier(wanted, fallback);
    let name = base;
    for (let count = 2; this.taken.has(name.toLowerCase()); count += 1) name = `${base}_${count}`;
    this.taken.add(name.toLowerCase());
    return name;
  }
}

// --- SECTION: model ---

export type PartRole = 'source' | 'sink' | 'logic';

export interface NetlistPin {
  readonly id: string;
  readonly label: string;
  readonly direction: 'input' | 'output' | 'passive';
  /** Index into `Netlist.nets`. */
  readonly net: number;
}

export interface NetlistPart {
  readonly index: number;
  readonly id: string;
  /** Reference designator, such as `U3` or `SW1`. */
  readonly ref: string;
  readonly type: ComponentType;
  readonly label: string;
  readonly params: ComponentParams;
  readonly role: PartRole;
  /** Every single-bit pin, including the ones behind a bus. */
  readonly pins: readonly NetlistPin[];
}

export interface Net {
  readonly index: number;
  /** A legal identifier, unique in the netlist. For one bit of a bus port this is the port's name and `bit` says which. */
  readonly name: string;
  readonly bit: number | undefined;
  readonly members: readonly { readonly part: number; readonly pin: string }[];
  /** How many output pins drive it, and how many input pins read it. */
  readonly drivers: number;
  readonly loads: number;
}

export interface ModulePort {
  readonly name: string;
  readonly direction: 'input' | 'output';
  /** The net of each bit, least significant first. */
  readonly nets: readonly number[];
  readonly width: number;
  readonly part: number;
  readonly kind: 'switch' | 'button' | 'clock' | 'port' | 'led' | 'probe' | 'display';
}

export interface Netlist {
  /** A legal module name taken from the project title. */
  readonly name: string;
  readonly title: string;
  readonly parts: readonly NetlistPart[];
  readonly nets: readonly Net[];
  readonly ports: readonly ModulePort[];
  /** Every identifier the module and its nets and ports use, lower-cased. Instance labels must avoid these (VHDL shares one namespace). */
  readonly names: readonly string[];
}

/** How a net is written in HDL: its name, or `name[bit]` when it is one bit of a bus port. */
export const netExpression = (net: Net, style: 'verilog' | 'vhdl'): string =>
  net.bit === undefined ? net.name : style === 'verilog' ? `${net.name}[${net.bit}]` : `${net.name}(${net.bit})`;

// --- SECTION: building ---

const SOURCE_TYPES: ReadonlySet<ComponentType> = new Set(['SWITCH', 'PUSH_BUTTON', 'CLOCK', 'PORT_IN']);
const SINK_TYPES: ReadonlySet<ComponentType> = new Set(['LED', 'PROBE', 'PORT_OUT', 'SEVEN_SEGMENT', 'SEVEN_SEGMENT_4', 'SIXTEEN_SEGMENT', 'RGB_MATRIX']);
/** Parts that only route: they have no cell of their own and no reference designator. */
const WIRING_TYPES: ReadonlySet<ComponentType> = new Set(['BUS_SPLITTER', 'NET_TIE']);

const roleOf = (type: ComponentType): PartRole => (SOURCE_TYPES.has(type) ? 'source' : SINK_TYPES.has(type) ? 'sink' : 'logic');

const DESIGNATOR_PREFIX: Readonly<Partial<Record<ComponentType, string>>> = {
  SWITCH: 'SW',
  PUSH_BUTTON: 'SW',
  CLOCK: 'X',
  PORT_IN: 'P',
  PORT_OUT: 'P',
  LED: 'D',
  PROBE: 'TP',
  SEVEN_SEGMENT: 'DS',
  SEVEN_SEGMENT_4: 'DS',
  SIXTEEN_SEGMENT: 'DS',
  RGB_MATRIX: 'DS',
};

const isTopLevelPortKind = (type: ComponentType): ModulePort['kind'] | undefined => {
  switch (type) {
    case 'SWITCH': return 'switch';
    case 'PUSH_BUTTON': return 'button';
    case 'CLOCK': return 'clock';
    case 'PORT_IN': case 'PORT_OUT': return 'port';
    case 'LED': return 'led';
    case 'PROBE': return 'probe';
    case 'SEVEN_SEGMENT': case 'SEVEN_SEGMENT_4': case 'SIXTEEN_SEGMENT': case 'RGB_MATRIX': return 'display';
    default: return undefined;
  }
};

export interface NetlistOptions {
  /** Overrides the module name (otherwise made from the project title). */
  readonly moduleName?: string;
}

/**
 * Builds the structural netlist of a document. Parts appear in the order they were placed; nets are named after
 * the port they reach, then after a labelled driver, and are otherwise numbered.
 */
export const buildNetlist = (source: LogicDocument, options: NetlistOptions = {}): Netlist => {
  const flat = flattenDocument(source);
  const components = flat.components.filter((component) => !WIRING_TYPES.has(component.type));
  const index = buildNetIndex(flat.components, flat.wires);

  // A part index for every simulator pin key that belongs to a real part; splitter and junction pins only route.
  const partIndexById = new Map<string, number>(components.map((component, position) => [component.id, position]));

  // --- nets: one per group of joined pins that includes at least one real part's pin ---
  const rootToNet = new Map<string, number>();
  const netMembers: { part: number; pin: string }[][] = [];
  const netDrivers: number[] = [];
  const netLoads: number[] = [];
  const pinNet = new Map<string, number>();
  const directionByKey = new Map<string, 'input' | 'output' | 'passive'>();
  const labelByKey = new Map<string, string>();
  for (const component of components) {
    for (const port of getSimulationPorts(component.type, component.params)) {
      directionByKey.set(portKey(component.id, port.id), port.direction);
      labelByKey.set(portKey(component.id, port.id), port.label);
    }
  }
  for (const [root, keys] of index.members) {
    const real = keys.filter((key) => partIndexById.has(key.slice(0, key.lastIndexOf(':'))));
    if (real.length === 0) continue;
    const netIndex = netMembers.length;
    rootToNet.set(root, netIndex);
    netMembers.push([]);
    netDrivers.push(0);
    netLoads.push(0);
    for (const key of real) {
      const split = key.lastIndexOf(':');
      const part = partIndexById.get(key.slice(0, split))!;
      const pin = key.slice(split + 1);
      netMembers[netIndex]!.push({ part, pin });
      pinNet.set(key, netIndex);
      const direction = directionByKey.get(key);
      if (direction === 'output') netDrivers[netIndex] = netDrivers[netIndex]! + 1;
      else if (direction === 'input') netLoads[netIndex] = netLoads[netIndex]! + 1;
    }
  }

  // --- reference designators ---
  const counters = new Map<string, number>();
  const refs: string[] = components.map((component) => {
    const prefix = DESIGNATOR_PREFIX[component.type] ?? 'U';
    const next = (counters.get(prefix) ?? 0) + 1;
    counters.set(prefix, next);
    return `${prefix}${next}`;
  });

  // --- names: the module first, then ports, then internal nets ---
  const namer = new Namer();
  const moduleName = namer.claim(options.moduleName ?? flat.metadata.title, 'logic_circuit');
  const netNames: (string | undefined)[] = netMembers.map(() => undefined);
  const netBits: (number | undefined)[] = netMembers.map(() => undefined);
  const ports: ModulePort[] = [];

  const netOfPin = (component: ComponentInstance, pin: string): number | undefined => pinNet.get(portKey(component.id, pin));

  // Sources come first, so a net that a switch drives is named after the switch.
  for (const component of components) {
    if (!SOURCE_TYPES.has(component.type)) continue;
    const kind = isTopLevelPortKind(component.type)!;
    const width = component.type === 'PORT_IN' ? markerWidthOf(component.params) : 1;
    const name = namer.claim(component.label, 'in');
    const nets: number[] = [];
    for (let bit = 0; bit < width; bit += 1) {
      const net = netOfPin(component, width === 1 ? 'Y' : `Y${bit}`);
      if (net === undefined) continue;
      nets.push(net);
      if (netNames[net] === undefined) {
        netNames[net] = name;
        netBits[net] = width === 1 ? undefined : bit;
      }
    }
    if (nets.length === width) ports.push({ name, direction: 'input', nets, width, part: partIndexById.get(component.id)!, kind });
  }

  // Sinks next: LEDs, probes, output ports and the pins of a display are the circuit's outputs.
  for (const component of components) {
    if (!SINK_TYPES.has(component.type)) continue;
    const kind = isTopLevelPortKind(component.type)!;
    const partIndex = partIndexById.get(component.id)!;
    if (component.type === 'PORT_OUT') {
      const width = markerWidthOf(component.params);
      const name = namer.claim(component.label, 'out');
      const nets: number[] = [];
      for (let bit = 0; bit < width; bit += 1) {
        const net = netOfPin(component, width === 1 ? 'A' : `A${bit}`);
        if (net !== undefined) nets.push(net);
      }
      if (nets.length === width) ports.push({ name, direction: 'output', nets, width, part: partIndex, kind });
      continue;
    }
    if (component.type === 'LED' || component.type === 'PROBE') {
      const net = netOfPin(component, 'A');
      if (net === undefined || netMembers[net]!.length < 2) continue;
      ports.push({ name: namer.claim(component.label, 'out'), direction: 'output', nets: [net], width: 1, part: partIndex, kind });
      continue;
    }
    // A display: each wired pin becomes an output named after the display and the pin.
    for (const port of getSimulationPorts(component.type, component.params)) {
      const net = netOfPin(component, port.id);
      if (net === undefined || netMembers[net]!.length < 2) continue;
      ports.push({ name: namer.claim(`${component.label}_${port.id}`, 'out'), direction: 'output', nets: [net], width: 1, part: partIndex, kind });
    }
  }

  // A net that no source names takes the name of the first output port that reaches it (the aliases are
  // left to the exporters), then a labelled driver, then a number.
  for (const port of ports) {
    if (port.direction !== 'output') continue;
    port.nets.forEach((net, bit) => {
      if (netNames[net] === undefined) {
        netNames[net] = port.name;
        netBits[net] = port.width === 1 ? undefined : bit;
      }
    });
  }
  netMembers.forEach((members, net) => {
    if (netNames[net] !== undefined) return;
    const driver = members.find((member) => directionByKey.get(portKey(components[member.part]!.id, member.pin)) === 'output');
    const wanted = driver ? `${components[driver.part]!.label}_${labelByKey.get(portKey(components[driver.part]!.id, driver.pin)) ?? driver.pin}` : `n${net + 1}`;
    netNames[net] = namer.claim(wanted, 'n');
  });

  const nets: Net[] = netMembers.map((members, net) => ({
    index: net,
    name: netNames[net]!,
    bit: netBits[net],
    members,
    drivers: netDrivers[net]!,
    loads: netLoads[net]!,
  }));

  const parts: NetlistPart[] = components.map((component, position) => ({
    index: position,
    id: component.id,
    ref: refs[position]!,
    type: component.type,
    label: component.label,
    params: component.params,
    role: roleOf(component.type),
    pins: getSimulationPorts(component.type, component.params).map((port) => ({
      id: port.id,
      label: port.label,
      direction: port.direction,
      net: pinNet.get(portKey(component.id, port.id))!,
    })),
  }));

  return { name: moduleName, title: flat.metadata.title, parts, nets, ports, names: namer.snapshot() };
};

/** The net a part's pin is on, or undefined for a pin the part does not have. */
export const pinNetOf = (netlist: Netlist, part: NetlistPart, pinId: string): Net | undefined => {
  const pin = part.pins.find((candidate) => candidate.id === pinId);
  return pin ? netlist.nets[pin.net] : undefined;
};

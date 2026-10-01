import { aluWidthOf } from './alu-engine';
import { selectBitsOf, type BlockType } from './block-engine';
import { D_FLIP_FLOP_IC, findGateIc, type GateFunction, type GateIc } from './ic-catalog';
import type { LogicDocument } from './logic-types';
import { addressBitsOf, dataBitsOf } from './memory-engine';
import { buildNetlist, type NetlistPart } from './netlist-engine';
import { bitWidthOf } from './register-engine';

/**
 * A bill of materials for the circuit: what to buy to build it from classic
 * 74-series parts, with every gate and flip-flop given a package, a unit
 * inside it, and the pin each of its signals lands on.
 *
 * Gates are matched to the classic package with that many inputs (a 2-input
 * NAND to a 7400, a hex inverter to a 7404, and so on). A gate with no
 * single-package equivalent (a 3-input OR, say) is broken into 2-input gates
 * that do have one. Blocks (multiplexers, decoders, counters, registers, the
 * arithmetic unit, memories) are matched to the classic part that does the
 * job, without pin tables. Parts are listed without a logic family: pick
 * 74HC, 74HCT, 74LS or another to suit the supply.
 *
 * Subcircuits are expanded first, so the list is the whole circuit's.
 */

export interface BomLine {
  readonly item: number;
  readonly part: string;
  readonly description: string;
  readonly package: string;
  readonly quantity: number;
  /** For an IC, its package designators (`IC1`); for anything else, the schematic references. */
  readonly references: readonly string[];
  readonly notes: readonly string[];
}

export interface PinAssignment {
  readonly signal: string;
  readonly pin: number;
}

export interface Allocation {
  /** The schematic reference of the part this places. */
  readonly ref: string;
  readonly label: string;
  /** `direct` gates map one for one; `decomposed` are the 2-input pieces of a gate with no single package. */
  readonly kind: 'direct' | 'decomposed' | 'flip-flop';
  readonly part: string;
  /** The physical package it sits in (`IC3`). */
  readonly package: string;
  /** Which of the package's gates this is, counting from 1. */
  readonly unit: number;
  readonly pins: readonly PinAssignment[];
  readonly notes: readonly string[];
}

export interface SpareUnit {
  readonly package: string;
  readonly part: string;
  readonly unit: number;
  /** Pins to tie to ground or supply so an unused gate does not float. */
  readonly inputPins: readonly number[];
}

export interface Bom {
  readonly title: string;
  readonly lines: readonly BomLine[];
  readonly allocations: readonly Allocation[];
  readonly spareUnits: readonly SpareUnit[];
  /** How many of each kind of part the circuit has, before matching to packages. */
  readonly counts: Readonly<Record<string, number>>;
  readonly totals: { readonly parts: number; readonly ics: number };
  readonly notes: readonly string[];
}

// --- SECTION: what each part needs ---

interface Need {
  readonly ref: string;
  readonly label: string;
  readonly gate: GateFunction;
  readonly inputs: number;
  /** The schematic pin ids in the order of the package's inputs, when the part maps directly. */
  readonly pinIds: readonly string[] | undefined;
  readonly kind: 'direct' | 'decomposed';
  readonly notes: readonly string[];
}

const GATE_TYPES: Readonly<Record<string, GateFunction | 'XNOR' | 'TRI'>> = {
  AND: 'AND', OR: 'OR', NAND: 'NAND', NOR: 'NOR', XOR: 'XOR', XNOR: 'XNOR', NOT: 'NOT', BUFFER: 'BUFFER', TRI_BUFFER: 'TRI',
};

const LETTERS = 'ABCDEFGH';

/** A gate broken into gates that each have a package: a tree of 2-input gates, ending in the gate itself (or an inverter). */
const decompose = (part: NetlistPart, gate: GateFunction | 'XNOR', inputs: number): Need[] => {
  const make = (function_: GateFunction, count: number, note: string): Need => ({ ref: part.ref, label: part.label, gate: function_, inputs: count, pinIds: undefined, kind: 'decomposed', notes: [note] });
  const note = `${inputs}-input ${gate} built from 2-input gates: no single classic package has that many inputs.`;
  const tree: Record<string, GateFunction> = { AND: 'AND', NAND: 'AND', OR: 'OR', NOR: 'OR', XOR: 'XOR', XNOR: 'XOR' };
  const base = tree[gate]!;
  const gates = Array.from({ length: inputs - 1 }, () => make(base, 2, note));
  // The inverting gates end in their inverting form (a NAND, a NOR) or an inverter after the XOR tree.
  if (gate === 'NAND' || gate === 'NOR') gates[gates.length - 1] = make(gate, 2, note);
  if (gate === 'XNOR') gates.push(make('NOT', 1, note));
  return gates;
};

const needsFor = (part: NetlistPart): Need[] | undefined => {
  const kind = GATE_TYPES[part.type];
  if (kind === undefined) return undefined;
  const inputs = part.pins.filter((pin) => pin.direction === 'input').length;
  if (kind === 'TRI') {
    return [{ ref: part.ref, label: part.label, gate: 'BUFFER', inputs: 1, pinIds: ['A', 'EN'], kind: 'direct', notes: ['The workstation\'s enable (EN) is active high; the 74125 output enable is active low, so add an inverter on EN.'] }];
  }
  if (kind === 'XNOR') return decompose(part, 'XNOR', inputs);
  const ic = findGateIc(kind, inputs);
  if (ic) {
    const ids = kind === 'BUFFER' ? ['A'] : part.pins.filter((pin) => pin.direction === 'input').map((pin) => pin.id);
    return [{ ref: part.ref, label: part.label, gate: kind, inputs, pinIds: ids, kind: 'direct', notes: kind === 'BUFFER' ? ['Tie the 74125 output enable to ground so the buffer always drives.'] : [] }];
  }
  return decompose(part, kind, inputs);
};

// --- SECTION: blocks and the parts around them ---

interface BlockMatch {
  readonly part: string;
  readonly description: string;
  readonly package: string;
  readonly quantity: number;
  readonly notes: readonly string[];
}

const ceilDiv = (value: number, size: number): number => Math.ceil(value / size);

const RAMS: readonly { readonly part: string; readonly addressBits: number; readonly dataBits: number; readonly description: string }[] = [
  { part: '6116', addressBits: 11, dataBits: 8, description: '2K x 8 static RAM' },
  { part: '6264', addressBits: 13, dataBits: 8, description: '8K x 8 static RAM' },
  { part: '62256', addressBits: 15, dataBits: 8, description: '32K x 8 static RAM' },
  { part: '628128', addressBits: 17, dataBits: 8, description: '128K x 8 static RAM' },
];

const ROMS: readonly { readonly part: string; readonly addressBits: number; readonly dataBits: number; readonly description: string }[] = [
  { part: '2716', addressBits: 11, dataBits: 8, description: '2K x 8 EPROM' },
  { part: '2764', addressBits: 13, dataBits: 8, description: '8K x 8 EPROM' },
  { part: '27C256', addressBits: 15, dataBits: 8, description: '32K x 8 EPROM' },
  { part: '27C512', addressBits: 16, dataBits: 8, description: '64K x 8 EPROM' },
  { part: '27C010', addressBits: 17, dataBits: 8, description: '128K x 8 EPROM' },
];

const memoryMatch = (part: NetlistPart, table: typeof RAMS): BlockMatch | undefined => {
  const addressBits = addressBitsOf(part.params);
  const dataBits = dataBitsOf(part.params);
  const device = table.find((candidate) => candidate.addressBits >= addressBits);
  if (!device) return undefined;
  const chips = ceilDiv(dataBits, device.dataBits);
  return {
    part: device.part,
    description: device.description,
    package: 'DIP-28',
    quantity: chips,
    notes: [
      `${addressBits}-bit address, ${dataBits}-bit words: ${chips > 1 ? `${chips} chips side by side share the address lines. ` : ''}${addressBits < device.addressBits ? `Tie the unused upper address lines (A${addressBits} and up) low. ` : ''}${dataBits < device.dataBits ? 'Leave the unused data lines open.' : ''}`.trim(),
    ],
  };
};

const blockMatch = (part: NetlistPart): BlockMatch | undefined | 'none' => {
  const params = part.params;
  switch (part.type) {
    case 'MUX': {
      const select = selectBitsOf(part.type as BlockType, params);
      const table: Record<number, [string, string]> = { 1: ['74157', 'Quad 2-to-1 multiplexer'], 2: ['74153', 'Dual 4-to-1 multiplexer'], 3: ['74151', '8-to-1 multiplexer'], 4: ['74150', '16-to-1 multiplexer'] };
      const [number, description] = table[select]!;
      return { part: number, description, package: number === '74150' ? 'DIP-24' : 'DIP-16', quantity: 1, notes: [`${1 << select}:1 multiplexer.`] };
    }
    case 'DEMUX': case 'DECODER': {
      const select = selectBitsOf(part.type as BlockType, params);
      if (select === 1) return 'none';
      const table: Record<number, [string, string, string]> = { 2: ['74139', 'Dual 2-to-4 decoder/demultiplexer', 'DIP-16'], 3: ['74138', '3-to-8 decoder/demultiplexer', 'DIP-16'], 4: ['74154', '4-to-16 decoder/demultiplexer', 'DIP-24'] };
      const [number, description, pack] = table[select]!;
      return { part: number, description, package: pack, quantity: 1, notes: ['Outputs are active low; invert them (or use a decoder with inverting gates) where the design needs active high.'] };
    }
    case 'PRIORITY_ENCODER':
      return selectBitsOf(part.type as BlockType, params) === 3 ? { part: '74148', description: '8-to-3 priority encoder', package: 'DIP-16', quantity: 1, notes: ['Inputs and outputs are active low.'] } : 'none';
    case 'BCD_7SEG': {
      const high = params.activeHigh !== false;
      return high
        ? { part: '7448', description: 'BCD to 7-segment decoder/driver (active-high outputs, for common-cathode displays)', package: 'DIP-16', quantity: 1, notes: [] }
        : { part: '7447', description: 'BCD to 7-segment decoder/driver (active-low outputs, for common-anode displays)', package: 'DIP-16', quantity: 1, notes: [] };
    }
    case 'COUNTER': {
      const width = bitWidthOf(params);
      const chips = ceilDiv(width, 4);
      const down = params.countDown === true;
      const ripple = params.asyncRipple === true;
      const [number, description] = ripple ? ['7493', '4-bit binary ripple counter'] : down ? ['74191', '4-bit synchronous up/down counter'] : ['74161', '4-bit synchronous binary counter with load and clear'];
      return { part: number, description, package: 'DIP-16', quantity: chips, notes: [`${width}-bit counter${chips > 1 ? `: cascade ${chips} chips (carry to the next stage's enable)` : ''}.`] };
    }
    case 'REGISTER': {
      const width = bitWidthOf(params);
      return width <= 4
        ? { part: '74175', description: 'Quad D-type flip-flop with clear', package: 'DIP-16', quantity: 1, notes: [`${width}-bit register; unused stages left open.`] }
        : { part: '74273', description: 'Octal D-type flip-flop with clear', package: 'DIP-20', quantity: 1, notes: [`${width}-bit register; unused stages left open.`] };
    }
    case 'ALU': {
      const width = aluWidthOf(params);
      const chips = width / 4;
      return { part: '74181', description: '4-bit arithmetic logic unit', package: 'DIP-24', quantity: chips, notes: [`${width}-bit ALU built from ${chips} stage${chips > 1 ? 's' : ''}${chips > 1 ? ' with a 74182 look-ahead carry generator' : ''}. The 74181 has its own operation codes; map them from the workstation's.`] };
    }
    case 'RAM': return memoryMatch(part, RAMS) ?? 'none';
    case 'ROM': return memoryMatch(part, ROMS) ?? 'none';
    case 'JK_FLIP_FLOP': case 'T_FLIP_FLOP':
      return { part: '74LS76', description: 'Dual JK flip-flop with preset and clear (falling-edge)', package: 'DIP-16', quantity: 1, notes: [part.type === 'T_FLIP_FLOP' ? 'Wire J and K together to make it toggle.' : 'Check the clock edge against the workstation\'s setting.'] };
    case 'SR_LATCH':
      return { part: '74279', description: 'Quad S-R latch (active-low inputs)', package: 'DIP-16', quantity: 1, notes: ['Inputs are active low.'] };
    default:
      return undefined;
  }
};

const OTHER_PARTS: Readonly<Record<string, { readonly part: string; readonly description: string; readonly package: string }>> = {
  SWITCH: { part: 'SPST toggle switch', description: 'Toggle switch', package: 'Panel or PCB' },
  PUSH_BUTTON: { part: 'Momentary push button', description: 'Normally-open push button', package: 'Panel or PCB' },
  CLOCK: { part: 'Clock source', description: 'Crystal oscillator module or 555 timer astable', package: 'DIP-8 or module' },
  LED: { part: 'LED', description: 'Light-emitting diode (with its series resistor below)', package: '5 mm' },
  PROBE: { part: 'Test point', description: 'Logic probe or test point', package: 'Test point' },
  SEVEN_SEGMENT: { part: '7-segment display', description: 'Single-digit seven-segment display', package: 'DIP-10' },
  SEVEN_SEGMENT_4: { part: '4-digit 7-segment display', description: 'Multiplexed four-digit seven-segment display', package: 'DIP-12' },
  SIXTEEN_SEGMENT: { part: '16-segment display', description: 'Single-digit sixteen-segment alphanumeric display', package: 'Module' },
  RGB_MATRIX: { part: 'RGB LED matrix', description: 'RGB LED pixel matrix module (8x8 or 16x16, as drawn)', package: 'Module' },
};

// --- SECTION: building the list ---

export const buildBom = (source: LogicDocument): Bom => {
  const netlist = buildNetlist(source);
  const notes: string[] = [];
  const counts: Record<string, number> = {};
  const bump = (name: string): void => {
    counts[name] = (counts[name] ?? 0) + 1;
  };

  // 1. Gates: every need goes to a slot of the package that does that job.
  const slotsByPart = new Map<string, { need: Need; pkg: number; unit: number; ic: GateIc }[]>();
  const flipFlops: { part: NetlistPart; pkg: number; unit: number }[] = [];
  const allocationsDraft: { ref: string; label: string; kind: Allocation['kind']; part: string; pkg: number; unit: number; pins: PinAssignment[]; notes: string[] }[] = [];

  for (const part of netlist.parts) {
    const needs = needsFor(part);
    if (needs) {
      const inputs = part.pins.filter((pin) => pin.direction === 'input').length;
      bump(part.type === 'TRI_BUFFER' || part.type === 'BUFFER' || part.type === 'NOT' ? part.type : `${part.type} (${inputs} inputs)`);
      for (const need of needs) {
        const ic = findGateIc(need.gate, need.gate === 'NOT' || need.gate === 'BUFFER' ? 1 : need.inputs)!;
        const list = slotsByPart.get(ic.part) ?? [];
        const index = list.length;
        const pkg = Math.floor(index / ic.units.length);
        const unit = index % ic.units.length;
        list.push({ need, pkg, unit, ic });
        slotsByPart.set(ic.part, list);
        const chip = ic.units[unit]!;
        const pins: PinAssignment[] = need.pinIds
          ? need.pinIds.map((id, position) => ({ signal: id === 'EN' ? 'EN (to OE, inverted)' : id, pin: chip.inputs[position]! })).concat([{ signal: 'Y', pin: chip.output }])
          : [...chip.inputs.map((pin, position) => ({ signal: need.gate === 'NOT' ? 'in' : `in${position + 1}`, pin })), { signal: 'out', pin: chip.output }];
        allocationsDraft.push({ ref: need.ref, label: need.label, kind: need.kind, part: ic.part, pkg, unit: unit + 1, pins, notes: [...need.notes] });
      }
      continue;
    }
    if (part.type === 'D_FLIP_FLOP') {
      bump('D_FLIP_FLOP');
      const index = flipFlops.length;
      flipFlops.push({ part, pkg: Math.floor(index / D_FLIP_FLOP_IC.units.length), unit: index % D_FLIP_FLOP_IC.units.length });
      const unit = D_FLIP_FLOP_IC.units[index % D_FLIP_FLOP_IC.units.length]!;
      allocationsDraft.push({
        ref: part.ref,
        label: part.label,
        kind: 'flip-flop',
        part: D_FLIP_FLOP_IC.part,
        pkg: Math.floor(index / D_FLIP_FLOP_IC.units.length),
        unit: (index % D_FLIP_FLOP_IC.units.length) + 1,
        pins: [
          { signal: 'D', pin: unit.d },
          { signal: 'CLK', pin: unit.clock },
          { signal: 'SET (to PRE, active low)', pin: unit.preset },
          { signal: 'RST (to CLR, active low)', pin: unit.clear },
          { signal: 'Q', pin: unit.q },
          { signal: 'QN', pin: unit.qn },
        ],
        notes: [...D_FLIP_FLOP_IC.notes],
      });
    }
  }

  // 2. Physical packages, numbered in part order so the designators are stable.
  interface Package { readonly part: string; readonly index: number; designator: string }
  const packages: Package[] = [];
  const pushPackages = (part: string, count: number): void => {
    for (let index = 0; index < count; index += 1) packages.push({ part, index, designator: '' });
  };
  for (const [part, list] of slotsByPart) pushPackages(part, Math.max(...list.map((slot) => slot.pkg)) + 1);
  if (flipFlops.length > 0) pushPackages(D_FLIP_FLOP_IC.part, Math.max(...flipFlops.map((slot) => slot.pkg)) + 1);

  // 3. Blocks and everything else.
  const blockLines: { match: BlockMatch; refs: string[] }[] = [];
  const otherLines = new Map<string, { info: (typeof OTHER_PARTS)[string]; refs: string[] }>();
  for (const part of netlist.parts) {
    const match = blockMatch(part);
    if (match === 'none') {
      notes.push(`${part.ref} (${part.label}, ${part.type}) has no single classic 74-series or memory part: build it from gates, or use a programmable device.`);
      bump(part.type);
      continue;
    }
    if (match) {
      bump(part.type);
      const existing = blockLines.find((entry) => entry.match.part === match.part && entry.match.package === match.package && entry.match.description === match.description);
      if (existing) existing.refs.push(part.ref);
      else blockLines.push({ match, refs: [part.ref] });
      for (let count = 0; count < match.quantity; count += 1) packages.push({ part: match.part, index: packages.filter((candidate) => candidate.part === match.part).length, designator: '' });
      continue;
    }
    const other = OTHER_PARTS[part.type];
    if (other) {
      bump(part.type);
      const entry = otherLines.get(part.type) ?? { info: other, refs: [] };
      entry.refs.push(part.ref);
      otherLines.set(part.type, entry);
    }
  }

  packages.sort((a, b) => a.part.localeCompare(b.part, 'en', { numeric: true }) || a.index - b.index);
  packages.forEach((pkg, position) => {
    pkg.designator = `IC${position + 1}`;
  });
  const designatorOf = (part: string, index: number): string => packages.find((pkg) => pkg.part === part && pkg.index === index)?.designator ?? '';

  const allocations: Allocation[] = allocationsDraft.map((draft) => ({ ref: draft.ref, label: draft.label, kind: draft.kind, part: draft.part, package: designatorOf(draft.part, draft.pkg), unit: draft.unit, pins: draft.pins, notes: draft.notes }));

  // 4. Units of a package that nothing uses.
  const spareUnits: SpareUnit[] = [];
  for (const [part, list] of slotsByPart) {
    const ic = list[0]!.ic;
    const packageCount = Math.max(...list.map((slot) => slot.pkg)) + 1;
    for (let pkg = 0; pkg < packageCount; pkg += 1) {
      for (let unit = 0; unit < ic.units.length; unit += 1) {
        if (!list.some((slot) => slot.pkg === pkg && slot.unit === unit)) spareUnits.push({ package: designatorOf(part, pkg), part, unit: unit + 1, inputPins: ic.units[unit]!.inputs });
      }
    }
  }
  if (flipFlops.length > 0) {
    const packageCount = Math.max(...flipFlops.map((slot) => slot.pkg)) + 1;
    for (let pkg = 0; pkg < packageCount; pkg += 1) {
      for (let unit = 0; unit < D_FLIP_FLOP_IC.units.length; unit += 1) {
        if (!flipFlops.some((slot) => slot.pkg === pkg && slot.unit === unit)) {
          const chip = D_FLIP_FLOP_IC.units[unit]!;
          spareUnits.push({ package: designatorOf(D_FLIP_FLOP_IC.part, pkg), part: D_FLIP_FLOP_IC.part, unit: unit + 1, inputPins: [chip.d, chip.clock, chip.preset, chip.clear] });
        }
      }
    }
  }

  // 5. Lines.
  const lines: Omit<BomLine, 'item'>[] = [];
  for (const [part, list] of slotsByPart) {
    const ic = list[0]!.ic;
    const count = Math.max(...list.map((slot) => slot.pkg)) + 1;
    lines.push({ part: ic.part, description: ic.description, package: 'DIP-14', quantity: count, references: packages.filter((pkg) => pkg.part === part).map((pkg) => pkg.designator), notes: [...ic.notes, `Pins: ${ic.source}.`] });
  }
  if (flipFlops.length > 0) {
    const count = Math.max(...flipFlops.map((slot) => slot.pkg)) + 1;
    lines.push({ part: D_FLIP_FLOP_IC.part, description: D_FLIP_FLOP_IC.description, package: 'DIP-14', quantity: count, references: packages.filter((pkg) => pkg.part === D_FLIP_FLOP_IC.part).map((pkg) => pkg.designator), notes: [...D_FLIP_FLOP_IC.notes, `Pins: ${D_FLIP_FLOP_IC.source}.`] });
  }
  for (const { match, refs } of blockLines) {
    lines.push({ part: match.part, description: match.description, package: match.package, quantity: match.quantity * refs.length, references: packages.filter((pkg) => pkg.part === match.part).map((pkg) => pkg.designator), notes: [...match.notes, `For ${refs.join(', ')}.`] });
  }
  for (const [, { info, refs }] of otherLines) lines.push({ part: info.part, description: info.description, package: info.package, quantity: refs.length, references: refs, notes: [] });

  // Support parts every design of this kind needs.
  const icCount = packages.length;
  const ledCount = otherLines.get('LED')?.refs.length ?? 0;
  if (icCount > 0) lines.push({ part: '0.1 uF capacitor', description: 'Ceramic decoupling capacitor, one across the supply pins of each IC', package: 'Radial', quantity: icCount, references: [], notes: [] });
  if (ledCount > 0) lines.push({ part: 'Resistor', description: 'LED series resistor: 330 ohm is typical from a 5 V supply; choose it for the LED and supply', package: '1/4 W', quantity: ledCount, references: otherLines.get('LED')!.refs, notes: [] });

  const numbered: BomLine[] = lines.map((line, index) => ({ item: index + 1, ...line }));
  if (spareUnits.length > 0) notes.push('Tie the inputs of every unused gate (see the spare units) to ground or the supply so they do not float.');
  notes.push('Choose a logic family (74HC, 74HCT, 74LS, ...) to match the supply; the part numbers above omit it.');

  const parts = netlist.parts.length;
  return { title: source.metadata.title, lines: numbered, allocations, spareUnits, counts, totals: { parts, ics: icCount }, notes };
};

// --- SECTION: text formats ---

const csvCell = (value: string | number): string => {
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const csvRow = (cells: readonly (string | number)[]): string => cells.map(csvCell).join(',');

/** The bill of materials as CSV: one row per line, references joined with spaces. */
export const bomToCsv = (bom: Bom): string =>
  [
    csvRow(['Item', 'Part', 'Description', 'Package', 'Quantity', 'References', 'Notes']),
    ...bom.lines.map((line) => csvRow([line.item, line.part, line.description, line.package, line.quantity, line.references.join(' '), line.notes.join(' ')])),
  ].join('\n');

/** The pin allocation as CSV: one row per signal, saying which package, gate and pin it lands on. */
export const pinAllocationToCsv = (bom: Bom): string =>
  [
    csvRow(['Reference', 'Label', 'Kind', 'Part', 'Package', 'Unit', 'Signal', 'Pin']),
    ...bom.allocations.flatMap((allocation) => allocation.pins.map((pin) => csvRow([allocation.ref, allocation.label, allocation.kind, allocation.part, allocation.package, allocation.unit, pin.signal, pin.pin]))),
  ].join('\n');

export const bomToJson = (bom: Bom): string => JSON.stringify(bom, null, 2);

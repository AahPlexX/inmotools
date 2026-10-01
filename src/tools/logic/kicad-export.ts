import type { HdlExport } from './hdl-verilog';
import type { LogicDocument } from './logic-types';
import { buildNetlist, type Netlist, type NetlistPart } from './netlist-engine';

/**
 * A KiCad netlist (`.net`, the s-expression `export (version D)` format that
 * KiCad's PCB editor and other tools read): the design header, every part as a
 * component, a library part for each distinct kind of part with its pin list,
 * and every net with the pins on it.
 *
 * The workstation's parts are logic symbols, not footprints, so a component
 * carries no footprint: assign footprints in the PCB tool, or map the parts to
 * real ICs with the bill of materials first. A pin's number is its name on the
 * part (`A`, `Y`, `Q3`), which is unambiguous and stable.
 */

export interface KicadOptions {
  /** The date written in the header (defaults to now); pass one for a reproducible file. */
  readonly date?: Date;
}

/** A KiCad token: always quoted, so a space, a slash or a bracket in a name is safe. */
const quote = (text: string): string => `"${text.replace(/[\\"]/g, (character) => `\\${character}`).replace(/[\r\n]+/g, ' ')}"`;

const KICAD_PIN_TYPE: Readonly<Record<string, string>> = { input: 'input', output: 'output', passive: 'passive' };

/** One library part per kind of part: its type and the exact list of pins it has (so a 3-input and a 2-input AND differ). */
const libpartKey = (part: NetlistPart): string => `${part.type}|${part.pins.map((pin) => pin.id).join(',')}`;

const pad = (value: number, size = 2): string => String(value).padStart(size, '0');
const formatDate = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

export const exportKicadNetlist = (source: LogicDocument, options: KicadOptions = {}): HdlExport => {
  const netlist: Netlist = buildNetlist(source);
  const libparts = new Map<string, { readonly name: string; readonly part: NetlistPart }>();
  const counts = new Map<string, number>();
  for (const part of netlist.parts) {
    const key = libpartKey(part);
    if (libparts.has(key)) continue;
    const seen = (counts.get(part.type) ?? 0) + 1;
    counts.set(part.type, seen);
    libparts.set(key, { name: seen === 1 ? part.type : `${part.type}_${seen}`, part });
  }

  const lines: string[] = ['(export (version D)'];
  lines.push('  (design');
  lines.push(`    (source ${quote(`${source.metadata.title}.circuit.json`)})`);
  lines.push(`    (date ${quote(formatDate(options.date ?? new Date()))})`);
  lines.push('    (tool "InMo Tools Digital Logic Workstation"))');

  lines.push('  (components');
  netlist.parts.forEach((part, index) => {
    const libpart = libparts.get(libpartKey(part))!;
    lines.push(`    (comp (ref ${quote(part.ref)})`);
    lines.push(`      (value ${quote(part.label)})`);
    lines.push(`      (libsource (lib "inmo_logic") (part ${quote(libpart.name)}))`);
    lines.push('      (sheetpath (names /) (tstamps /))');
    lines.push(`      (tstamp ${pad(index + 1, 8)}))`);
  });
  lines.push('  )');

  lines.push('  (libparts');
  for (const { name, part } of libparts.values()) {
    lines.push(`    (libpart (lib "inmo_logic") (part ${quote(name)})`);
    lines.push(`      (description ${quote(`${part.type} as drawn in the Digital Logic Workstation`)})`);
    lines.push('      (fields');
    lines.push(`        (field (name "Reference") ${quote(part.ref.replace(/\d+$/, ''))})`);
    lines.push(`        (field (name "Value") ${quote(part.type)}))`);
    lines.push('      (pins');
    for (const pin of part.pins) {
      lines.push(`        (pin (num ${quote(pin.id)}) (name ${quote(pin.label)}) (type ${KICAD_PIN_TYPE[pin.direction] ?? 'unspecified'}))`);
    }
    lines.push('      ))');
  }
  lines.push('  )');

  lines.push('  (libraries');
  lines.push('    (library (logical "inmo_logic") (uri "inmo_logic.lib")))');

  lines.push('  (nets');
  netlist.nets.forEach((net, index) => {
    // KiCad names a net that reaches one pin only `unconnected-(<ref>-<pin>)`; give those the same treatment.
    const only = net.members.length === 1 ? net.members[0]! : undefined;
    const name = only ? `unconnected-(${netlist.parts[only.part]!.ref}-${only.pin})` : net.bit === undefined ? net.name : `${net.name}[${net.bit}]`;
    lines.push(`    (net (code ${index + 1}) (name ${quote(name)})`);
    for (const member of net.members) lines.push(`      (node (ref ${quote(netlist.parts[member.part]!.ref)}) (pin ${quote(member.pin)}))`);
    lines[lines.length - 1] += ')';
  });
  lines.push('  ))');

  return { text: `${lines.join('\n')}\n`, warnings: [] };
};

import type { HdlExport } from './hdl-verilog';
import type { LogicDocument } from './logic-types';
import { buildNetlist, sanitizeIdentifier, type Net, type NetlistPart } from './netlist-engine';

/**
 * An EDIF 2 0 0 netlist: one library holding a cell for every kind of part
 * (with its ports) and a cell for the circuit itself, whose contents are an
 * instance of a cell for every part and a net for every node, exactly as the
 * netlist describes them. Names that are not legal EDIF identifiers are
 * written as `(rename identifier "original")`, so nothing is lost.
 */

export interface EdifOptions {
  readonly date?: Date;
}

const LIBRARY = 'INMO_LOGIC';

const EDIF_DIRECTION: Readonly<Record<string, string>> = { input: 'INPUT', output: 'OUTPUT', passive: 'INOUT' };

/** Text inside an EDIF string: no quote, no control characters. */
const text = (value: string): string => `"${value.replace(/["%]/g, "'").replace(/[\r\n\t]+/g, ' ')}"`;

/** `id` alone when it is already what the name was, otherwise `(rename id "name")`. */
const named = (id: string, original: string): string => (id === original ? id : `(rename ${id} ${text(original)})`);

const cellKey = (part: NetlistPart): string => `${part.type}|${part.pins.map((pin) => `${pin.id}:${pin.direction}`).join(',')}`;

const netId = (net: Net): string => (net.bit === undefined ? net.name : `${net.name}_${net.bit}`);
const netOriginal = (net: Net): string => (net.bit === undefined ? net.name : `${net.name}[${net.bit}]`);

export const exportEdif = (source: LogicDocument, options: EdifOptions = {}): HdlExport => {
  const netlist = buildNetlist(source);
  const date = options.date ?? new Date();
  const designName = sanitizeIdentifier(netlist.name);

  // A cell for each distinct kind of part, named after its type (numbered when several shapes of one type exist).
  const cells = new Map<string, { readonly id: string; readonly part: NetlistPart }>();
  const perType = new Map<string, number>();
  for (const part of netlist.parts) {
    const key = cellKey(part);
    if (cells.has(key)) continue;
    const seen = (perType.get(part.type) ?? 0) + 1;
    perType.set(part.type, seen);
    cells.set(key, { id: seen === 1 ? part.type : `${part.type}_${seen}`, part });
  }

  const pinId = (id: string): string => sanitizeIdentifier(id, 'p');
  const instanceId = (part: NetlistPart): string => sanitizeIdentifier(part.ref, 'u');

  // Every circuit port bit is its own port, so a bus becomes `name_0`, `name_1`, ...
  interface PortBit { readonly id: string; readonly original: string; readonly direction: 'input' | 'output'; readonly net: number }
  const portBits: PortBit[] = netlist.ports.flatMap((port) =>
    port.nets.map((net, bit): PortBit => ({
      id: port.width === 1 ? port.name : `${port.name}_${bit}`,
      original: port.width === 1 ? port.name : `${port.name}[${bit}]`,
      direction: port.direction,
      net,
    })),
  );

  // A bus bit's name (`data_1`) could equal another name; keep every port id, and every net id, unique.
  const unique = (used: Set<string>, wanted: string): string => {
    let id = wanted;
    for (let count = 2; used.has(id.toLowerCase()); count += 1) id = `${wanted}_x${count}`;
    used.add(id.toLowerCase());
    return id;
  };
  const usedPorts = new Set<string>();
  const uniquePortBits = portBits.map((bit) => ({ ...bit, id: unique(usedPorts, bit.id) }));
  const usedNets = new Set<string>();
  const uniqueNetIds = netlist.nets.map((net) => unique(usedNets, netId(net)));

  const lines: string[] = [];
  lines.push(`(edif ${designName}`);
  lines.push('  (edifVersion 2 0 0)');
  lines.push('  (edifLevel 0)');
  lines.push('  (keywordMap (keywordLevel 0))');
  lines.push('  (status');
  lines.push('    (written');
  lines.push(`      (timeStamp ${date.getFullYear()} ${date.getMonth() + 1} ${date.getDate()} ${date.getHours()} ${date.getMinutes()} ${date.getSeconds()})`);
  lines.push('      (program "InMo Tools Digital Logic Workstation" (version "1"))');
  if (source.metadata.author) lines.push(`      (author ${text(source.metadata.author)})`);
  lines.push('    )');
  if (source.metadata.description) lines.push(`    (comment ${text(source.metadata.description)})`);
  lines.push('  )');
  lines.push(`  (library ${LIBRARY}`);
  lines.push('    (edifLevel 0)');
  lines.push('    (technology (numberDefinition))');

  for (const { id, part } of cells.values()) {
    lines.push(`    (cell ${id} (cellType GENERIC)`);
    lines.push('      (view netlist (viewType NETLIST)');
    lines.push('        (interface');
    for (const pin of part.pins) lines.push(`          (port ${named(pinId(pin.id), pin.id)} (direction ${EDIF_DIRECTION[pin.direction] ?? 'INOUT'}))`);
    lines.push('        )))');
  }

  lines.push(`    (cell ${designName} (cellType GENERIC)`);
  lines.push('      (view netlist (viewType NETLIST)');
  lines.push('        (interface');
  for (const bit of uniquePortBits) lines.push(`          (port ${named(bit.id, bit.original)} (direction ${bit.direction === 'input' ? 'INPUT' : 'OUTPUT'}))`);
  lines.push('        )');
  lines.push('        (contents');
  for (const part of netlist.parts) {
    const cell = cells.get(cellKey(part))!;
    lines.push(`          (instance ${named(instanceId(part), part.ref)} (viewRef netlist (cellRef ${cell.id} (libraryRef ${LIBRARY}))) (property LABEL (string ${text(part.label)})))`);
  }
  netlist.nets.forEach((net) => {
    const joined: string[] = [];
    for (const bit of uniquePortBits) if (bit.net === net.index) joined.push(`(portRef ${bit.id})`);
    for (const member of net.members) joined.push(`(portRef ${pinId(member.pin)} (instanceRef ${instanceId(netlist.parts[member.part]!)}))`);
    lines.push(`          (net ${named(uniqueNetIds[net.index]!, netOriginal(net))} (joined ${joined.join(' ')}))`);
  });
  lines.push('        )))');
  lines.push('  )');
  lines.push(`  (design ${designName} (cellRef ${designName} (libraryRef ${LIBRARY})))`);
  lines.push(')');
  return { text: `${lines.join('\n')}\n`, warnings: [] };
};

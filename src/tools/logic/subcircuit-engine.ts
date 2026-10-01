import { portWidth } from './bus-engine';
import { getComponentPorts } from './component-library';
import { nextId, pruneOrphanWires } from './circuit-model';
import type {
  ComponentInstance,
  ComponentType,
  LogicDocument,
  PortDefinition,
  PortRef,
  SimulationFrame,
  SubcircuitDefinition,
  ViewportState,
  Wire,
} from './logic-types';
import { emptySubcircuit, isPortMarker, MAX_ICON_LENGTH, MAX_NAME_LENGTH, markerWidthOf } from './subcircuit-ports';

/**
 * Pure, framework-independent subcircuit machinery: turning a selection into a
 * subcircuit, flattening subcircuits so the simulator sees only real parts,
 * and editing a circuit that lives inside another one.
 *
 * A subcircuit is stored by value inside the part that stands for it
 * (`params.subcircuit`), so a project file is self-contained and a copy of the
 * part is an independent copy of the circuit. Its connections to the outside
 * are the port markers among its components. The simulator never sees the part
 * itself: `flattenDocument` splices its components into the parent under
 * prefixed ids (`<part id>/<inner id>`) and turns each marker into a passive
 * junction, so the outside net and the inside net are one net.
 */

/** Deepest nesting a project may have, which bounds flattening and rejects a hostile file. */
export const MAX_SUBCIRCUIT_DEPTH = 8;

/** Most components a project may hold once every subcircuit is expanded. */
export const MAX_EXPANDED_COMPONENTS = 20_000;

export const SUBCIRCUIT_ICONS: readonly string[] = ['▦', '⊕', '∑', '≥', '⏱', '⚡', '▶', '∿', '#', '@'];

// --- SECTION: flattening ---

const DEFAULT_VIEWPORT: ViewportState = { panX: 0, panY: 0, zoom: 1 };

interface Expansion {
  components: ComponentInstance[];
  wires: Wire[];
}

/**
 * Expands one level of components and wires under `idPrefix`. Inside a
 * subcircuit (`insideInstance`), the port markers become junctions and every
 * wire end on a marker moves to the junction's single pin `P`.
 */
const expand = (
  components: readonly ComponentInstance[],
  wires: readonly Wire[],
  idPrefix: string,
  labelPrefix: string,
  insideInstance: boolean,
  depth: number,
  budget: { remaining: number },
): Expansion => {
  const outComponents: ComponentInstance[] = [];
  const outWires: Wire[] = [];
  const instanceIds = new Set(components.filter((component) => component.type === 'SUBCIRCUIT').map((component) => component.id));
  const markerIds = new Set(insideInstance ? components.filter((component) => isPortMarker(component.type)).map((component) => component.id) : []);

  for (const component of components) {
    if (component.type === 'SUBCIRCUIT') {
      const definition = component.params.subcircuit;
      if (!definition || depth >= MAX_SUBCIRCUIT_DEPTH) continue;
      const inner = expand(definition.components, definition.wires, `${idPrefix}${component.id}/`, `${labelPrefix}${component.label}/`, true, depth + 1, budget);
      outComponents.push(...inner.components);
      outWires.push(...inner.wires);
      continue;
    }
    if (budget.remaining <= 0) continue;
    budget.remaining -= 1;
    const id = `${idPrefix}${component.id}`;
    const label = `${labelPrefix}${component.label}`;
    if (markerIds.has(component.id)) {
      outComponents.push({ ...component, id, label, type: 'NET_TIE', params: { signalWidth: markerWidthOf(component.params) } });
    } else {
      outComponents.push({ ...component, id, label });
    }
  }

  const endpoint = (ref: PortRef): PortRef => {
    if (instanceIds.has(ref.componentId)) return { componentId: `${idPrefix}${ref.componentId}/${ref.portId}`, portId: 'P' };
    if (markerIds.has(ref.componentId)) return { componentId: `${idPrefix}${ref.componentId}`, portId: 'P' };
    return { componentId: `${idPrefix}${ref.componentId}`, portId: ref.portId };
  };
  for (const wire of wires) outWires.push({ ...wire, id: `${idPrefix}${wire.id}`, from: endpoint(wire.from), to: endpoint(wire.to) });
  return { components: outComponents, wires: outWires };
};

const flatCache = new WeakMap<LogicDocument, LogicDocument>();

export const hasSubcircuits = (document: LogicDocument): boolean => document.components.some((component) => component.type === 'SUBCIRCUIT');

/**
 * The document as the simulator sees it, with every subcircuit expanded. A
 * document without subcircuits is returned as is, and the result for one with
 * them is remembered per document object, so a per-tick call costs nothing.
 */
export const flattenDocument = (document: LogicDocument): LogicDocument => {
  if (!hasSubcircuits(document)) return document;
  const cached = flatCache.get(document);
  if (cached) return cached;
  const { components, wires } = expand(document.components, document.wires, '', '', false, 0, { remaining: MAX_EXPANDED_COMPONENTS });
  // A wire may end on a part that was dropped (a subcircuit past the depth limit); leave those out.
  const present = new Set(components.map((component) => component.id));
  const flat: LogicDocument = { ...document, components, wires: wires.filter((wire) => present.has(wire.from.componentId) && present.has(wire.to.componentId)) };
  flatCache.set(document, flat);
  return flat;
};

/**
 * A frame seen from inside a subcircuit: keys under `prefix` (the path of part ids joined with `/`) lose it, so
 * the drawn circuit finds its own levels. A port marker also answers to its own pin names (`Y`, `A`), which is
 * what the marker's junction reads as inside the simulator.
 */
export const scopeFrame = (frame: SimulationFrame, prefix: string): SimulationFrame => {
  if (prefix === '') return frame;
  const portLevels: Record<string, SimulationFrame['portLevels'][string]> = {};
  for (const [key, level] of Object.entries(frame.portLevels)) {
    if (!key.startsWith(prefix)) continue;
    const local = key.slice(prefix.length);
    portLevels[local] = level;
    const split = local.lastIndexOf(':');
    const pin = local.slice(split + 1);
    // A junction's pin `P` (or bit `Pn`) is what a marker shows as `Y`/`A` (or `Yn`/`An`).
    if (pin.startsWith('P') && (pin.length === 1 || /^\d+$/.test(pin.slice(1)))) {
      const base = local.slice(0, split + 1);
      portLevels[`${base}Y${pin.slice(1)}`] = level;
      portLevels[`${base}A${pin.slice(1)}`] = level;
    }
  }
  const componentState: Record<string, SimulationFrame['componentState'][string]> = {};
  for (const [id, state] of Object.entries(frame.componentState)) {
    if (id.startsWith(prefix)) componentState[id.slice(prefix.length)] = state;
  }
  return { ...frame, portLevels, componentState };
};

// --- SECTION: encapsulating a selection ---

export type EncapsulateResult =
  | { readonly ok: true; readonly document: LogicDocument; readonly instanceId: string }
  | { readonly ok: false; readonly reason: string };

const cleanName = (name: string, fallback: string): string => {
  const trimmed = name.trim().slice(0, MAX_NAME_LENGTH);
  return trimmed.length > 0 ? trimmed : fallback;
};

export const cleanIcon = (icon: string): string => {
  const glyphs = Array.from(icon.trim()).slice(0, MAX_ICON_LENGTH).join('');
  return glyphs.length > 0 ? glyphs : '▦';
};

const uniqueLabel = (wanted: string, taken: Set<string>): string => {
  const base = wanted.trim().slice(0, MAX_NAME_LENGTH - 3) || 'P';
  let label = base;
  for (let count = 2; taken.has(label); count += 1) label = `${base}${count}`;
  taken.add(label);
  return label;
};

const portOf = (component: ComponentInstance, portId: string): PortDefinition | undefined =>
  getComponentPorts(component.type, component.params).find((port) => port.id === portId);

/**
 * Groups the selected parts into one subcircuit. Every wire that crosses the
 * edge of the selection becomes a port: an input marker feeding the inside pin
 * (or an output marker taking it), wired to that pin inside and to the part
 * that stands for the subcircuit outside. Wires among the selected parts move
 * inside; the rest of the circuit is untouched.
 */
export const encapsulateSelection = (document: LogicDocument, selectedIds: readonly string[], requestedName?: string): EncapsulateResult => {
  const selected = new Set(selectedIds);
  const members = document.components.filter((component) => selected.has(component.id));
  if (members.length === 0) return { ok: false, reason: 'Select at least one part to group into a subcircuit.' };
  if (members.some((component) => isPortMarker(component.type))) return { ok: false, reason: 'A port belongs to the subcircuit it is drawn in. Select only the parts that make up the new subcircuit.' };

  const existing = document.components.filter((component) => component.type === 'SUBCIRCUIT').length;
  const name = cleanName(requestedName ?? '', `Subcircuit ${existing + 1}`);
  const byId = new Map(document.components.map((component) => [component.id, component] as const));
  const minX = Math.min(...members.map((component) => component.x));
  const maxX = Math.max(...members.map((component) => component.x));
  const minY = Math.min(...members.map((component) => component.y));

  const insideWires: Wire[] = [];
  const outsideWires: Wire[] = [];
  const crossing: Wire[] = [];
  for (const wire of document.wires) {
    const fromIn = selected.has(wire.from.componentId);
    const toIn = selected.has(wire.to.componentId);
    if (fromIn && toIn) insideWires.push(wire);
    else if (fromIn || toIn) crossing.push(wire);
    else outsideWires.push(wire);
  }

  // One port per distinct pin inside the selection, however many outside wires reach it.
  interface PendingPort { readonly marker: ComponentInstance; readonly markerWire: Wire }
  const portByPin = new Map<string, PendingPort>();
  const takenLabels = new Set<string>();
  const instanceId = nextId('component');
  const retargeted: Wire[] = [];
  let inputCount = 0;
  let outputCount = 0;

  for (const wire of crossing) {
    const insideEnd = selected.has(wire.from.componentId) ? wire.from : wire.to;
    const outsideEnd = insideEnd === wire.from ? wire.to : wire.from;
    const insideComponent = byId.get(insideEnd.componentId);
    const outsideComponent = byId.get(outsideEnd.componentId);
    if (!insideComponent || !outsideComponent) continue;
    const insidePort = portOf(insideComponent, insideEnd.portId);
    const outsidePort = portOf(outsideComponent, outsideEnd.portId);
    if (!insidePort) continue;

    const key = `${insideEnd.componentId}:${insideEnd.portId}`;
    let pending = portByPin.get(key);
    if (!pending) {
      // A pin that takes a signal in is fed by an input marker; one that gives a signal out feeds an output marker.
      // A passive pin (a splitter tap) goes by what drives the other end of the wire.
      const isInput = insidePort.direction === 'input' || (insidePort.direction === 'passive' && outsidePort?.direction !== 'input');
      const type: ComponentType = isInput ? 'PORT_IN' : 'PORT_OUT';
      const width = portWidth(insidePort);
      const index = isInput ? inputCount++ : outputCount++;
      const marker: ComponentInstance = {
        id: nextId('component'),
        type,
        x: isInput ? minX - 6 : maxX + 10,
        y: minY + index * 3,
        rotation: 0,
        mirrored: false,
        label: uniqueLabel(insidePort.label.replace(/\[.*\]$/, ''), takenLabels),
        params: { signalWidth: width, portValue: 0, initialLevel: 0 },
      };
      const markerRef: PortRef = { componentId: marker.id, portId: isInput ? 'Y' : 'A' };
      const markerWire: Wire = { id: nextId('wire'), from: isInput ? markerRef : insideEnd, to: isInput ? insideEnd : markerRef, waypoints: [] };
      pending = { marker, markerWire };
      portByPin.set(key, pending);
    }
    // The outside end of the wire now meets the new part's port instead of the inside pin.
    const port: PortRef = { componentId: instanceId, portId: pending.marker.id };
    retargeted.push({ ...wire, from: wire.from === insideEnd ? port : wire.from, to: wire.to === insideEnd ? port : wire.to, waypoints: [] });
  }

  const markers = [...portByPin.values()];
  const definition: SubcircuitDefinition = {
    name,
    icon: emptySubcircuit().icon,
    components: [...members, ...markers.map((entry) => entry.marker)],
    wires: [...insideWires, ...markers.map((entry) => entry.markerWire)],
    viewport: DEFAULT_VIEWPORT,
    selectedIds: [],
  };
  const instance: ComponentInstance = {
    id: instanceId,
    type: 'SUBCIRCUIT',
    x: minX,
    y: minY,
    rotation: 0,
    mirrored: false,
    label: name,
    params: { subcircuit: definition },
  };
  return {
    ok: true,
    instanceId,
    document: {
      ...document,
      components: [...document.components.filter((component) => !selected.has(component.id)), instance],
      wires: [...outsideWires, ...retargeted],
      selectedIds: [instanceId],
    },
  };
};

// --- SECTION: editing a subcircuit's definition ---

const updateDefinition = (document: LogicDocument, instanceId: string, updater: (definition: SubcircuitDefinition) => SubcircuitDefinition): LogicDocument =>
  pruneOrphanWires({
    ...document,
    components: document.components.map((component) => {
      if (component.id !== instanceId || component.type !== 'SUBCIRCUIT' || !component.params.subcircuit) return component;
      return { ...component, params: { ...component.params, subcircuit: updater(component.params.subcircuit) } };
    }),
  });

export const renameSubcircuit = (document: LogicDocument, instanceId: string, name: string): LogicDocument =>
  updateDefinition(document, instanceId, (definition) => ({ ...definition, name: cleanName(name, definition.name) }));

export const setSubcircuitIcon = (document: LogicDocument, instanceId: string, icon: string): LogicDocument =>
  updateDefinition(document, instanceId, (definition) => ({ ...definition, icon: cleanIcon(icon) }));

/** Renames one port of a subcircuit, by renaming the marker inside it that the port is drawn from. */
export const relabelSubcircuitPort = (document: LogicDocument, instanceId: string, portId: string, label: string): LogicDocument =>
  updateDefinition(document, instanceId, (definition) => ({
    ...definition,
    components: definition.components.map((component) => (component.id === portId && isPortMarker(component.type) ? { ...component, label: label.slice(0, MAX_NAME_LENGTH) } : component)),
  }));

// --- SECTION: working inside a subcircuit ---

const asDocument = (parent: LogicDocument, instance: ComponentInstance): LogicDocument => {
  const definition = instance.params.subcircuit!;
  return {
    ...parent,
    components: definition.components,
    wires: definition.wires,
    selectedIds: definition.selectedIds ?? [],
    viewport: definition.viewport ?? DEFAULT_VIEWPORT,
  };
};

const findInstance = (document: LogicDocument, id: string): ComponentInstance | undefined => {
  const component = document.components.find((candidate) => candidate.id === id);
  return component && component.type === 'SUBCIRCUIT' && component.params.subcircuit ? component : undefined;
};

/** The longest leading part of `path` that still names subcircuits in `root` (an undo may remove one you were inside). */
export const trimPath = (root: LogicDocument, path: readonly string[]): string[] => {
  const kept: string[] = [];
  let current = root;
  for (const id of path) {
    const instance = findInstance(current, id);
    if (!instance) break;
    kept.push(id);
    current = asDocument(current, instance);
  }
  return kept;
};

/** The circuit at the end of `path` as a document of its own (root-level settings such as the theme come from `root`). */
export const documentAtPath = (root: LogicDocument, path: readonly string[]): LogicDocument => {
  let current = root;
  for (const id of path) {
    const instance = findInstance(current, id);
    if (!instance) return current;
    current = asDocument(current, instance);
  }
  return current;
};

const writeBack = (parent: LogicDocument, instance: ComponentInstance, updated: LogicDocument): LogicDocument => {
  const definition: SubcircuitDefinition = {
    ...instance.params.subcircuit!,
    components: updated.components,
    wires: updated.wires,
    selectedIds: updated.selectedIds,
    viewport: updated.viewport,
  };
  const components = parent.components.map((component) => (component.id === instance.id ? { ...component, params: { ...component.params, subcircuit: definition } } : component));
  // The parent's own wires, selection and view are kept; changed ports (a marker added or removed inside) may orphan a wire outside.
  return pruneOrphanWires({ ...updated, components, wires: parent.wires, selectedIds: parent.selectedIds, viewport: parent.viewport });
};

/**
 * Applies an edit written for a plain document to the circuit at `path`, and puts the result back into every
 * circuit above it. With an empty path this is just `updater(root)`.
 */
export const applyAtPath = (root: LogicDocument, path: readonly string[], updater: (document: LogicDocument) => LogicDocument): LogicDocument => {
  if (path.length === 0) return updater(root);
  const [head, ...rest] = path;
  const instance = findInstance(root, head!);
  if (!instance) return root;
  const inner = asDocument(root, instance);
  return writeBack(root, instance, applyAtPath(inner, rest, updater));
};

export interface Crumb {
  readonly id: string | null;
  readonly label: string;
}

/** The trail shown above the canvas: the main circuit, then each subcircuit entered. */
export const breadcrumbs = (root: LogicDocument, path: readonly string[]): Crumb[] => {
  const crumbs: Crumb[] = [{ id: null, label: root.metadata.title || 'Main circuit' }];
  let current = root;
  for (const id of path) {
    const instance = findInstance(current, id);
    if (!instance) break;
    crumbs.push({ id, label: instance.params.subcircuit!.name });
    current = asDocument(current, instance);
  }
  return crumbs;
};

/** The id prefix the simulator gives everything inside the circuit at `path`. */
export const pathPrefix = (path: readonly string[]): string => path.map((id) => `${id}/`).join('');

/** Total parts in a definition, counting nested subcircuits, or `Infinity` past the depth limit. Used to vet imported files. */
export const expandedSize = (components: readonly ComponentInstance[], depth = 0): number => {
  if (depth > MAX_SUBCIRCUIT_DEPTH) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (const component of components) {
    total += 1;
    if (component.type === 'SUBCIRCUIT' && component.params.subcircuit) total += expandedSize(component.params.subcircuit.components, depth + 1);
  }
  return total;
};

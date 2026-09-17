import { clampInputCount, COMPONENT_LIBRARY, getComponentPorts, isVariadicGate } from './component-library';
import type {
  ComponentInstance,
  ComponentParams,
  ComponentType,
  DocumentHistory,
  DocumentSnapshot,
  LogicDocument,
  PortRef,
  Rotation,
  ThemeName,
  Wire,
  WirePoint,
} from './logic-types';

let idCounter = 0;
export const nextId = (prefix: string): string => {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
};

const stamp = (): string => new Date().toISOString();

export const createInitialDocument = (title = 'Untitled circuit'): LogicDocument => ({
  schemaVersion: 1,
  id: nextId('circuit'),
  metadata: { title, author: '', description: '', version: '0.1.0', license: 'MIT', tags: [] },
  components: [],
  wires: [],
  viewport: { panX: 0, panY: 0, zoom: 1 },
  simulation: { delayMode: 'ideal', running: true, clockDividerHz: 1 },
  theme: 'light',
  selectedIds: [],
  updatedAt: stamp(),
});

export const createHistory = (document: LogicDocument = createInitialDocument()): DocumentHistory => ({
  past: [],
  present: document,
  future: [],
});

export const commit = (history: DocumentHistory, label: string, updater: (document: LogicDocument) => LogicDocument): DocumentHistory => {
  const nextPresent = { ...updater(history.present), updatedAt: stamp() };
  const nextPast: DocumentSnapshot[] = [...history.past, { label, document: history.present }].slice(-200);
  return { past: nextPast, present: nextPresent, future: [] };
};

export const undo = (history: DocumentHistory): DocumentHistory => {
  if (history.past.length === 0) return history;
  const snapshot = history.past[history.past.length - 1]!;
  return {
    past: history.past.slice(0, -1),
    present: snapshot.document,
    future: [{ label: snapshot.label, document: history.present }, ...history.future],
  };
};

export const redo = (history: DocumentHistory): DocumentHistory => {
  if (history.future.length === 0) return history;
  const snapshot = history.future[0]!;
  return {
    past: [...history.past, { label: snapshot.label, document: history.present }].slice(-200),
    present: snapshot.document,
    future: history.future.slice(1),
  };
};

export const loadDocument = (document: LogicDocument): DocumentHistory => ({ past: [], present: document, future: [] });

export const addComponent = (document: LogicDocument, type: ComponentType, x: number, y: number): LogicDocument => {
  const definition = COMPONENT_LIBRARY[type];
  const component: ComponentInstance = {
    id: nextId('component'),
    type,
    x,
    y,
    rotation: 0,
    mirrored: false,
    label: definition.label,
    params: { ...definition.defaultParams },
  };
  return { ...document, components: [...document.components, component] };
};

const wireTouchesComponent = (wire: Wire, componentId: string): boolean =>
  wire.from.componentId === componentId || wire.to.componentId === componentId;

export const removeComponent = (document: LogicDocument, componentId: string): LogicDocument => ({
  ...document,
  components: document.components.filter((component) => component.id !== componentId),
  wires: document.wires.filter((wire) => !wireTouchesComponent(wire, componentId)),
  selectedIds: document.selectedIds.filter((id) => id !== componentId),
});

export const removeComponents = (document: LogicDocument, componentIds: readonly string[]): LogicDocument =>
  componentIds.reduce((accumulator, id) => removeComponent(accumulator, id), document);

export const moveComponent = (document: LogicDocument, componentId: string, x: number, y: number): LogicDocument => ({
  ...document,
  components: document.components.map((component) => (component.id === componentId ? { ...component, x, y } : component)),
});

const nextRotation = (rotation: Rotation): Rotation => (({ 0: 90, 90: 180, 180: 270, 270: 0 } as const)[rotation]);

export const rotateComponent = (document: LogicDocument, componentId: string): LogicDocument => ({
  ...document,
  components: document.components.map((component) => (component.id === componentId ? { ...component, rotation: nextRotation(component.rotation) } : component)),
});

export const mirrorComponent = (document: LogicDocument, componentId: string): LogicDocument => ({
  ...document,
  components: document.components.map((component) => (component.id === componentId ? { ...component, mirrored: !component.mirrored } : component)),
});

export const duplicateComponent = (document: LogicDocument, componentId: string): LogicDocument => {
  const source = document.components.find((component) => component.id === componentId);
  if (!source) return document;
  const copy: ComponentInstance = { ...source, id: nextId('component'), x: source.x + 2, y: source.y + 2 };
  return { ...document, components: [...document.components, copy], selectedIds: [copy.id] };
};

/** Removes wires that reference a port no longer produced by a reduced input count. */
const pruneOrphanWires = (document: LogicDocument): LogicDocument => {
  const portMap = new Map(document.components.map((component) => [component.id, new Set(getComponentPorts(component.type, component.params).map((port) => port.id))]));
  return {
    ...document,
    wires: document.wires.filter((wire) => portMap.get(wire.from.componentId)?.has(wire.from.portId) && portMap.get(wire.to.componentId)?.has(wire.to.portId)),
  };
};

export const updateComponentParams = (document: LogicDocument, componentId: string, params: Partial<ComponentParams>): LogicDocument => {
  const updated: LogicDocument = {
    ...document,
    components: document.components.map((component) => {
      if (component.id !== componentId) return component;
      const merged: ComponentParams = { ...component.params, ...params };
      const normalized: ComponentParams = isVariadicGate(component.type) && merged.inputCount !== undefined
        ? { ...merged, inputCount: clampInputCount(merged.inputCount) }
        : merged;
      return { ...component, params: normalized };
    }),
  };
  return pruneOrphanWires(updated);
};

export const relabelComponent = (document: LogicDocument, componentId: string, label: string): LogicDocument => ({
  ...document,
  components: document.components.map((component) => (component.id === componentId ? { ...component, label } : component)),
});

export const addWire = (document: LogicDocument, from: PortRef, to: PortRef, waypoints: readonly WirePoint[] = []): LogicDocument => {
  if (from.componentId === to.componentId && from.portId === to.portId) return document;
  const wire: Wire = { id: nextId('wire'), from, to, waypoints };
  return { ...document, wires: [...document.wires, wire] };
};

export const removeWire = (document: LogicDocument, wireId: string): LogicDocument => ({
  ...document,
  wires: document.wires.filter((wire) => wire.id !== wireId),
});

export const setSelection = (document: LogicDocument, selectedIds: readonly string[]): LogicDocument => ({ ...document, selectedIds });

export const updateMetadata = (document: LogicDocument, metadata: Partial<LogicDocument['metadata']>): LogicDocument => ({
  ...document,
  metadata: { ...document.metadata, ...metadata },
});

export const setDelayMode = (document: LogicDocument, delayMode: LogicDocument['simulation']['delayMode']): LogicDocument => ({
  ...document,
  simulation: { ...document.simulation, delayMode },
});

export const setRunning = (document: LogicDocument, running: boolean): LogicDocument => ({
  ...document,
  simulation: { ...document.simulation, running },
});

export const setViewport = (document: LogicDocument, viewport: Partial<LogicDocument['viewport']>): LogicDocument => ({
  ...document,
  viewport: { ...document.viewport, ...viewport },
});

export const setTheme = (document: LogicDocument, theme: ThemeName): LogicDocument => ({ ...document, theme });

import type { FloorplanProject, HostedOpening, PlanComponent, ProjectHistory, ProjectSnapshot, WallSegment } from './floorplan-types';

const defaultLayers = [
  ['walls', 'WALLS'],
  ['doors', 'DOORS'],
  ['windows', 'WINDOWS'],
  ['furniture', 'FURNITURE'],
  ['mep', 'MEP'],
  ['clearance', 'CLEARANCE'],
  ['dimensions', 'DIMENSIONS'],
].map(([id, name]) => ({ id: id!, name: name!, visible: true, locked: false }));

const stamp = () => new Date().toISOString();

export const createInitialProject = (name = 'Untitled Plan'): ProjectHistory => ({
  past: [],
  present: {
    schemaVersion: 1,
    id: 'plancraft-project',
    name,
    author: '',
    scaleNotation: '1:50',
    vertices: [],
    walls: [],
    components: [],
    rooms: [],
    dimensions: [],
    layers: defaultLayers,
    viewport: { scale: 0.1, panX: 120, panY: 120, gridMm: 100 },
    updatedAt: stamp(),
  },
  future: [],
});

export const commitProject = (
  history: ProjectHistory,
  label: string,
  updater: (project: FloorplanProject) => FloorplanProject,
): ProjectHistory => {
  const nextProject = { ...updater(history.present), updatedAt: stamp() };
  const nextPast: ProjectSnapshot[] = [...history.past, { label, project: history.present }].slice(-100);
  return { past: nextPast, present: nextProject, future: [] };
};

/**
 * Records an edit that was previewed live (such as a drag) as a single undo step:
 * `before` is the project as it was when the gesture started.
 */
export const commitFrom = (history: ProjectHistory, label: string, before: FloorplanProject): ProjectHistory => (history.present === before
  ? history
  : { past: [...history.past, { label, project: before }].slice(-100), present: { ...history.present, updatedAt: stamp() }, future: [] });

export const undoState = (history: ProjectHistory): ProjectHistory => {
  if (history.past.length === 0) return history;
  const snapshot = history.past[history.past.length - 1]!;
  return {
    past: history.past.slice(0, -1),
    present: snapshot.project,
    future: [{ label: snapshot.label, project: history.present }, ...history.future],
  };
};

export const redoState = (history: ProjectHistory): ProjectHistory => {
  if (history.future.length === 0) return history;
  const snapshot = history.future[0]!;
  return {
    past: [...history.past, { label: snapshot.label, project: history.present }].slice(-100),
    present: snapshot.project,
    future: history.future.slice(1),
  };
};

export const updateSelection = (history: ProjectHistory, selectedId?: string): ProjectHistory => ({
  ...history,
  present: { ...history.present, selectedId },
});

export const loadProject = (project: FloorplanProject): ProjectHistory => ({ past: [], present: project, future: [] });

// --- Backup and autosave validation ------------------------------------------
//
// Restored files come from outside the app, so every field the drawing code
// relies on is checked here. Missing optional sections (older backups) get
// defaults; damaged required data is rejected with a message a person can act on.

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const isPoint = (value: unknown): value is { x: number; y: number } => isRecord(value) && finite(value.x) && finite(value.y);
const listOf = (raw: Record<string, unknown>, key: string, required: boolean): unknown[] => {
  const value = raw[key];
  if (value === undefined && !required) return [];
  if (!Array.isArray(value)) throw new Error(`The backup's ${key} list is damaged, so it can't be opened.`);
  return value;
};

export const parseProjectJson = (text: string): FloorplanProject => {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("This file isn't a PlanCraft backup (it isn't valid JSON)."); }
  if (!isRecord(raw)) throw new Error("This file isn't a PlanCraft backup.");
  if (raw.schemaVersion !== 1) {
    throw new Error(finite(raw.schemaVersion) && raw.schemaVersion > 1
      ? 'This backup was saved by a newer version of PlanCraft. Reload the page to update, then open it again.'
      : "This file isn't a PlanCraft backup.");
  }
  const defaults = createInitialProject().present;

  const vertices = listOf(raw, 'vertices', true).map((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !isPoint(item.position)) throw new Error('A wall corner in the backup has invalid coordinates.');
    return { id: item.id, position: { x: item.position.x, y: item.position.y }, connectedWallIds: [] as string[] };
  });
  const vertexIds = new Set(vertices.map((vertex) => vertex.id));

  const walls = listOf(raw, 'walls', true).map((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.startVertexId !== 'string' || typeof item.endVertexId !== 'string') throw new Error('A wall in the backup is damaged.');
    if (!vertexIds.has(item.startVertexId) || !vertexIds.has(item.endVertexId)) throw new Error("A wall in the backup points to a corner that isn't in the file.");
    const openings = (Array.isArray(item.openings) ? item.openings : []).map((opening) => {
      if (!isRecord(opening) || typeof opening.id !== 'string' || typeof opening.type !== 'string' || !finite(opening.offsetRatio) || !finite(opening.width)) throw new Error('A door or window in the backup is damaged.');
      return {
        id: opening.id,
        type: opening.type as HostedOpening['type'],
        offsetRatio: Math.min(1, Math.max(0, opening.offsetRatio)),
        width: Math.max(1, opening.width),
        nominalHeight: finite(opening.nominalHeight) ? opening.nominalHeight : 2032,
        sillHeight: finite(opening.sillHeight) ? opening.sillHeight : 0,
        flipSide: opening.flipSide === true,
        flipHand: opening.flipHand === true,
      };
    });
    return {
      id: item.id,
      startVertexId: item.startVertexId,
      endVertexId: item.endVertexId,
      thickness: finite(item.thickness) && item.thickness > 0 ? item.thickness : 150,
      height: finite(item.height) && item.height > 0 ? item.height : 2700,
      state: (['existing', 'new_construction', 'demolition'].includes(item.state as string) ? item.state : 'new_construction') as WallSegment['state'],
      material: (['drywall_stud', 'concrete_masonry', 'glass_partition', 'brick'].includes(item.material as string) ? item.material : 'drywall_stud') as WallSegment['material'],
      isLoadBearing: item.isLoadBearing === true,
      openings,
    };
  });
  const connected = new Map<string, string[]>();
  for (const wall of walls) for (const id of [wall.startVertexId, wall.endVertexId]) connected.set(id, [...(connected.get(id) ?? []), wall.id]);

  const components = listOf(raw, 'components', false).map((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.symbolKey !== 'string' || !isPoint(item.position)) throw new Error('A furniture or fixture item in the backup is damaged.');
    const clearance = isRecord(item.clearance) && isPoint(item.clearance.dimensions) && finite(item.clearance.bufferOffset)
      ? item.clearance as unknown as PlanComponent['clearance']
      : { shape: 'rectangle' as const, dimensions: { x: 600, y: 600 }, bufferOffset: 0 };
    return {
      id: item.id,
      category: (typeof item.category === 'string' ? item.category : 'living') as PlanComponent['category'],
      symbolKey: item.symbolKey,
      position: { x: item.position.x, y: item.position.y },
      rotation: finite(item.rotation) ? ((item.rotation % 360) + 360) % 360 : 0,
      scale: isPoint(item.scale) ? { x: item.scale.x, y: item.scale.y } : { x: 1, y: 1 },
      layerId: typeof item.layerId === 'string' ? item.layerId : 'furniture',
      clearance,
    };
  });

  const dimensions = listOf(raw, 'dimensions', false).map((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !isPoint(item.start) || !isPoint(item.end)) throw new Error('A dimension in the backup is damaged.');
    return { id: item.id, start: { x: item.start.x, y: item.start.y }, end: { x: item.end.x, y: item.end.y }, label: typeof item.label === 'string' ? item.label : undefined, layerId: 'dimensions' };
  });

  // Keep the saved visibility of known layers; any layer an older file lacks comes back visible.
  const savedLayers = new Map(listOf(raw, 'layers', false).filter(isRecord).map((layer) => [layer.id, layer]));
  const layers = defaults.layers.map((layer) => ({ ...layer, visible: savedLayers.get(layer.id)?.visible !== false }));

  const viewport = isRecord(raw.viewport) && finite(raw.viewport.scale) && finite(raw.viewport.panX) && finite(raw.viewport.panY) && finite(raw.viewport.gridMm)
    ? { scale: raw.viewport.scale, panX: raw.viewport.panX, panY: raw.viewport.panY, gridMm: raw.viewport.gridMm }
    : defaults.viewport;
  const roomNames = isRecord(raw.roomNames)
    ? Object.fromEntries(Object.entries(raw.roomNames).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
    : undefined;

  return {
    schemaVersion: 1,
    id: typeof raw.id === 'string' ? raw.id : defaults.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name : defaults.name,
    author: typeof raw.author === 'string' ? raw.author : '',
    scaleNotation: typeof raw.scaleNotation === 'string' ? raw.scaleNotation : defaults.scaleNotation,
    units: raw.units === 'imperial' ? 'imperial' : 'metric',
    roomNames,
    vertices: vertices.map((vertex) => ({ ...vertex, connectedWallIds: connected.get(vertex.id) ?? [] })),
    walls,
    components,
    rooms: [],
    dimensions,
    layers,
    viewport,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : stamp(),
  };
};

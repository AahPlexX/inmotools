import type { FloorplanProject, ProjectHistory, ProjectSnapshot } from './floorplan-types';

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

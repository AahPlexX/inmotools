import { addEquipment } from './editor-engine';
import { createNormalizedPoint } from './pitch-engine';
import type { NormalizedPoint, SourceProvenance, TacticalEquipment, TacticalProject } from './tactics-types';

export interface TrainingPropDefinition {
  kind: string;
  label: string;
  defaultScale: number;
  provenance: SourceProvenance;
}

const PROP_PROVENANCE: SourceProvenance = {
  kind: 'tool-default',
  authoritative: false,
  sourceTitle: 'InMo Tools training prop library',
  sourceDate: '2026-09-30',
  note: 'Local coaching markers. Not a governing-body equipment standard.',
};

export const TRAINING_PROP_LIBRARY: readonly TrainingPropDefinition[] = [
  { kind: 'cone', label: 'Cone', defaultScale: 1, provenance: PROP_PROVENANCE },
  { kind: 'flat-marker', label: 'Flat marker', defaultScale: 1, provenance: PROP_PROVENANCE },
  { kind: 'pole', label: 'Pole', defaultScale: 1, provenance: PROP_PROVENANCE },
  { kind: 'hurdle', label: 'Hurdle', defaultScale: 1.4, provenance: PROP_PROVENANCE },
  { kind: 'ladder', label: 'Agility ladder', defaultScale: 2, provenance: PROP_PROVENANCE },
  { kind: 'mannequin', label: 'Mannequin', defaultScale: 1.2, provenance: PROP_PROVENANCE },
  { kind: 'mini-goal', label: 'Mini goal', defaultScale: 2, provenance: PROP_PROVENANCE },
  { kind: 'agility-ring', label: 'Agility ring', defaultScale: 1, provenance: PROP_PROVENANCE },
];

export function trainingPropDefinition(kind: string): TrainingPropDefinition {
  const definition = TRAINING_PROP_LIBRARY.find((item) => item.kind === kind);
  if (!definition) throw new Error(`Training prop "${kind}" is not in the local prop library.`);
  return definition;
}

function nextEquipmentId(project: TacticalProject, kind: string): string {
  const occupied = new Set(project.equipment.map((item) => item.id));
  let index = 1;
  while (occupied.has(`prop-${kind}-${index}`)) index += 1;
  return `prop-${kind}-${index}`;
}

export function placeTrainingProp(
  project: TacticalProject,
  kind: string,
  sceneId: string,
  layerId: string,
  position: NormalizedPoint,
): TacticalProject {
  const definition = trainingPropDefinition(kind);
  return addEquipment(project, {
    id: nextEquipmentId(project, definition.kind),
    kind: definition.kind,
    sceneId,
    layerId,
    position: createNormalizedPoint(position.x, position.y),
    rotationDeg: 0,
    scale: definition.defaultScale,
    visible: true,
    locked: false,
  });
}

export interface EquipmentTransform {
  position?: NormalizedPoint;
  rotationDeg?: number;
  scale?: number;
}

function requireWritableLayer(project: TacticalProject, sceneId: string, layerId: string): void {
  const scene = project.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) throw new Error(`Scene "${sceneId}" does not exist.`);
  const layer = scene.layers.find((candidate) => candidate.id === layerId);
  if (!layer) throw new Error(`Layer "${layerId}" does not exist in scene "${sceneId}".`);
  if (layer.locked) throw new Error(`Layer "${layerId}" is locked.`);
}

export function transformEquipment(
  project: TacticalProject,
  equipmentId: string,
  patch: EquipmentTransform,
): TacticalProject {
  const item = project.equipment.find((candidate) => candidate.id === equipmentId);
  if (!item) throw new Error(`Equipment "${equipmentId}" does not exist.`);
  if (item.locked) throw new Error(`Equipment "${equipmentId}" is locked.`);
  requireWritableLayer(project, item.sceneId, item.layerId);

  const next: TacticalEquipment = { ...item };
  if (patch.position) next.position = createNormalizedPoint(patch.position.x, patch.position.y);
  if (patch.rotationDeg !== undefined) {
    if (!Number.isFinite(patch.rotationDeg)) throw new RangeError('Equipment rotation must be finite.');
    next.rotationDeg = patch.rotationDeg;
  }
  if (patch.scale !== undefined) {
    if (!Number.isFinite(patch.scale) || patch.scale <= 0 || patch.scale > 8) {
      throw new RangeError('Equipment scale must be greater than 0 and at most 8.');
    }
    next.scale = patch.scale;
  }

  return {
    ...project,
    equipment: project.equipment.map((candidate) => (candidate.id === item.id ? next : candidate)),
  };
}

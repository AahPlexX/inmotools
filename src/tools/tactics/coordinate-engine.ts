import { movePlayerToken } from './editor-engine';
import { createNormalizedPoint, metersToNormalized, normalizedToMeters } from './pitch-engine';
import type { NormalizedPoint, PitchDimensions, TacticalProject } from './tactics-types';

export type CoordinateAuthoringMode = 'normalized' | 'meters';

export interface CanonicalCoordinateReading {
  x: number;
  y: number;
  xMeters: number;
  yMeters: number;
  lengthMeters: number;
  widthMeters: number;
}

export type CoordinateTarget =
  | { kind: 'player'; tokenId: string }
  | { kind: 'ball' }
  | { kind: 'equipment'; equipmentId: string }
  | { kind: 'official'; officialId: string };

export function readCanonicalCoordinate(
  point: NormalizedPoint,
  pitch: PitchDimensions,
): CanonicalCoordinateReading {
  const normalized = createNormalizedPoint(point.x, point.y);
  const metres = normalizedToMeters(normalized, pitch);
  return {
    x: normalized.x,
    y: normalized.y,
    xMeters: metres.xMeters,
    yMeters: metres.yMeters,
    lengthMeters: pitch.lengthMeters,
    widthMeters: pitch.widthMeters,
  };
}

export function authorCanonicalCoordinate(
  mode: CoordinateAuthoringMode,
  x: number,
  y: number,
  pitch: PitchDimensions,
): NormalizedPoint {
  if (mode === 'meters') return metersToNormalized({ xMeters: x, yMeters: y }, pitch);
  if (mode === 'normalized') return createNormalizedPoint(x, y);
  throw new Error('Coordinate authoring mode must be normalized or meters.');
}

function requireWritableLayer(project: TacticalProject, sceneId: string, layerId: string): void {
  const scene = project.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) throw new Error(`Scene "${sceneId}" does not exist.`);
  const layer = scene.layers.find((candidate) => candidate.id === layerId);
  if (!layer) throw new Error(`Layer "${layerId}" does not exist in scene "${sceneId}".`);
  if (layer.locked) throw new Error(`Layer "${layerId}" is locked.`);
}

export function authorEntityCoordinate(
  project: TacticalProject,
  target: CoordinateTarget,
  point: NormalizedPoint,
): TacticalProject {
  const normalized = createNormalizedPoint(point.x, point.y);
  if (target.kind === 'player') return movePlayerToken(project, target.tokenId, normalized);
  if (target.kind === 'ball') {
    return { ...project, ball: { ...project.ball, position: normalized } };
  }
  if (target.kind === 'equipment') {
    const item = project.equipment.find((candidate) => candidate.id === target.equipmentId);
    if (!item) throw new Error(`Equipment "${target.equipmentId}" does not exist.`);
    if (item.locked) throw new Error(`Equipment "${item.id}" is locked.`);
    requireWritableLayer(project, item.sceneId, item.layerId);
    return {
      ...project,
      equipment: project.equipment.map((candidate) => (
        candidate.id === item.id ? { ...candidate, position: normalized } : candidate
      )),
    };
  }
  const official = project.officials.find((candidate) => candidate.id === target.officialId);
  if (!official) throw new Error(`Official "${target.officialId}" does not exist.`);
  requireWritableLayer(project, official.sceneId, official.layerId);
  return {
    ...project,
    officials: project.officials.map((candidate) => (
      candidate.id === official.id ? { ...candidate, position: normalized } : candidate
    )),
  };
}

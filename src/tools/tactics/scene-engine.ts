import { addTimelineScene, sampleTacticalTimeline } from './timeline-engine';
import type { TacticalProject, TacticalScene } from './tactics-types';

export interface CloneTacticalSceneInput {
  id: string;
  name: string;
  startMs: number;
  durationMs: number;
}

function occupiedIds(project: TacticalProject): Set<string> {
  const ids = new Set<string>();
  for (const team of project.teams) {
    ids.add(team.id);
    for (const player of team.roster) ids.add(player.id);
  }
  for (const token of project.playerTokens) ids.add(token.id);
  for (const official of project.officials) ids.add(official.id);
  for (const item of project.equipment) ids.add(item.id);
  for (const annotation of project.annotations) ids.add(annotation.id);
  for (const scene of project.scenes) {
    ids.add(scene.id);
    for (const layer of scene.layers) ids.add(layer.id);
    for (const object of scene.objects) ids.add(object.id);
  }
  return ids;
}

function claimId(preferred: string, occupied: Set<string>): string {
  let id = preferred;
  let suffix = 2;
  while (occupied.has(id)) {
    id = `${preferred}-${suffix}`;
    suffix += 1;
  }
  occupied.add(id);
  return id;
}
export function cloneTacticalScene(
  project: TacticalProject,
  sourceSceneId: string,
  input: CloneTacticalSceneInput,
): TacticalProject {
  const source = project.scenes.find((scene) => scene.id === sourceSceneId);
  if (!source) throw new Error(`Source scene ${sourceSceneId} does not exist.`);
  const id = input.id.trim();
  const name = input.name.trim();
  if (!id) throw new Error('Scene id is required.');
  if (!name) throw new Error('Scene name is required.');
  if (!Number.isInteger(input.startMs) || input.startMs < 0) {
    throw new RangeError('Scene start must be a non-negative integer millisecond value.');
  }
  if (!Number.isInteger(input.durationMs) || input.durationMs < 0) {
    throw new RangeError('Scene duration must be a non-negative integer millisecond value.');
  }
  if (input.startMs + input.durationMs > project.timeline.durationMs) {
    throw new RangeError('Scene cannot extend beyond the timeline duration.');
  }

  const occupied = occupiedIds(project);
  if (occupied.has(id)) throw new Error(`Scene id ${id} already exists.`);
  occupied.add(id);
  const layerIds = new Map<string, string>();
  const layers = source.layers.map((layer) => {
    const layerId = claimId(`${id}-${layer.id}`, occupied);
    layerIds.set(layer.id, layerId);
    return { ...layer, id: layerId };
  });
  const requireLayer = (sourceLayerId: string): string => {
    const mapped = layerIds.get(sourceLayerId);
    if (!mapped) throw new Error(`Source layer ${sourceLayerId} does not exist in scene ${sourceSceneId}.`);
    return mapped;
  };
  const sampled = sampleTacticalTimeline(project.timeline, input.startMs);

  const scene: TacticalScene = {
    id,
    name,
    startMs: input.startMs,
    durationMs: input.durationMs,
    layers,
    objects: source.objects.map((object) => ({
      ...object,
      id: claimId(`${id}-${object.id}`, occupied),
      layerId: requireLayer(object.layerId),
      position: { ...object.position },
    })),
  };

  const playerTokens = [
    ...project.playerTokens,
    ...project.playerTokens
      .filter((token) => token.sceneId === sourceSceneId)
      .map((token) => {
        const state = sampled[token.id];
        return {
          ...token,
          id: claimId(`${id}-${token.id}`, occupied),
          sceneId: id,
          layerId: requireLayer(token.layerId),
          position: state?.position ? { ...state.position } : { ...token.position },
          rotationDeg: state?.rotationDeg ?? token.rotationDeg,
          visible: state?.visible ?? token.visible,
        };
      }),
  ];
  const officials = [
    ...project.officials,
    ...project.officials
      .filter((official) => official.sceneId === sourceSceneId)
      .map((official) => ({
        ...official,
        id: claimId(`${id}-${official.id}`, occupied),
        sceneId: id,
        layerId: requireLayer(official.layerId),
        position: { ...official.position },
      })),
  ];
  const equipment = [
    ...project.equipment,
    ...project.equipment
      .filter((item) => item.sceneId === sourceSceneId)
      .map((item) => ({
        ...item,
        id: claimId(`${id}-${item.id}`, occupied),
        sceneId: id,
        layerId: requireLayer(item.layerId),
        position: { ...item.position },
      })),
  ];
  const annotations = [
    ...project.annotations,
    ...project.annotations
      .filter((annotation) => annotation.sceneId === sourceSceneId)
      .map((annotation) => ({
        ...annotation,
        id: claimId(`${id}-${annotation.id}`, occupied),
        sceneId: id,
        layerId: requireLayer(annotation.layerId),
        points: annotation.points.map((point) => ({ ...point })),
        provenance: annotation.provenance ? { ...annotation.provenance } : undefined,
      })),
  ];

  return {
    ...project,
    scenes: addTimelineScene(project.scenes, scene),
    playerTokens,
    officials,
    equipment,
    annotations,
  };
}

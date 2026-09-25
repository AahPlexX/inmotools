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


export function renameTacticalScene(
  project: TacticalProject,
  sceneId: string,
  rawName: string,
): TacticalProject {
  const name = rawName.trim();
  if (!name) throw new Error('Scene name is required.');
  if (!project.scenes.some((scene) => scene.id === sceneId)) {
    throw new Error(`Scene ${sceneId} does not exist.`);
  }
  return {
    ...project,
    scenes: project.scenes.map((scene) => scene.id === sceneId ? { ...scene, name } : { ...scene }),
  };
}

function orderedScenes(project: TacticalProject): TacticalScene[] {
  return [...project.scenes].sort(
    (left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id),
  );
}

function assertNonOverlappingScenes(scenes: TacticalScene[]): void {
  for (let index = 1; index < scenes.length; index += 1) {
    const previous = scenes[index - 1]!;
    const current = scenes[index]!;
    if (previous.startMs + previous.durationMs > current.startMs) {
      throw new Error('Scene reordering requires non-overlapping scene ranges.');
    }
  }
}

function sceneForTime(scenes: TacticalScene[], timeMs: number): TacticalScene | undefined {
  const exactStart = scenes.find((scene) => scene.startMs === timeMs);
  if (exactStart) return exactStart;
  const containing = scenes.find((scene) => scene.durationMs > 0
    && timeMs >= scene.startMs
    && timeMs < scene.startMs + scene.durationMs);
  if (containing) return containing;
  const last = scenes.at(-1);
  if (last && timeMs === last.startMs + last.durationMs) return last;
  return undefined;
}

function sceneOwnedTargetIds(project: TacticalProject): Map<string, string> {
  const result = new Map<string, string>();
  for (const token of project.playerTokens) result.set(token.id, token.sceneId);
  for (const official of project.officials) result.set(official.id, official.sceneId);
  for (const item of project.equipment) result.set(item.id, item.sceneId);
  for (const scene of project.scenes) {
    for (const object of scene.objects) result.set(object.id, scene.id);
  }
  return result;
}

export function reorderTacticalScene(
  project: TacticalProject,
  sceneId: string,
  direction: -1 | 1,
): TacticalProject {
  if (direction !== -1 && direction !== 1) {
    throw new RangeError('Scene reorder direction must be -1 or 1.');
  }
  const scenes = orderedScenes(project);
  assertNonOverlappingScenes(scenes);
  const currentIndex = scenes.findIndex((scene) => scene.id === sceneId);
  if (currentIndex < 0) throw new Error(`Scene ${sceneId} does not exist.`);
  const nextIndex = currentIndex + direction;
  if (nextIndex < 0 || nextIndex >= scenes.length) return project;

  const reordered = [...scenes];
  [reordered[currentIndex], reordered[nextIndex]] = [reordered[nextIndex]!, reordered[currentIndex]!];

  const starts = new Map<string, number>();
  let cursor = scenes[0]?.startMs ?? 0;
  for (const scene of reordered) {
    starts.set(scene.id, cursor);
    cursor += scene.durationMs;
  }
  if (cursor > project.timeline.durationMs) {
    throw new RangeError('Reordered scene sequence exceeds the timeline duration.');
  }

  const deltas = new Map(
    scenes.map((scene) => [scene.id, (starts.get(scene.id) ?? scene.startMs) - scene.startMs] as const),
  );
  const targetScenes = sceneOwnedTargetIds(project);
  const shiftByScene = (timeMs: number, ownerSceneId?: string): number => {
    const owner = ownerSceneId
      ? scenes.find((scene) => scene.id === ownerSceneId)
      : sceneForTime(scenes, timeMs);
    if (!owner) return timeMs;
    return timeMs + (deltas.get(owner.id) ?? 0);
  };

  const tracks = project.timeline.tracks.map((track) => {
    const ownerSceneId = targetScenes.get(track.targetId);
    return {
      ...track,
      keyframes: track.keyframes
        .map((keyframe) => ({
          ...keyframe,
          timeMs: shiftByScene(keyframe.timeMs, ownerSceneId),
          position: keyframe.position ? { ...keyframe.position } : undefined,
          motionPath: keyframe.motionPath
            ? {
                ...keyframe.motionPath,
                controlPoints: keyframe.motionPath.controlPoints.map((point) => ({ ...point })),
              }
            : undefined,
        }))
        .sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id)),
    };
  });

  const markers = project.timeline.markers
    .map((marker) => ({ ...marker, timeMs: shiftByScene(marker.timeMs) }))
    .sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id));
  const possessionEvents = project.timeline.possessionEvents
    ?.map((event) => ({
      ...event,
      timeMs: shiftByScene(
        event.timeMs,
        event.holderTargetId ? targetScenes.get(event.holderTargetId) : undefined,
      ),
    }))
    .sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id));

  return {
    ...project,
    scenes: reordered.map((scene) => ({ ...scene, startMs: starts.get(scene.id) ?? scene.startMs })),
    timeline: {
      ...project.timeline,
      playheadMs: shiftByScene(project.timeline.playheadMs),
      tracks,
      markers,
      possessionEvents,
    },
    formationStates: project.formationStates
      .map((state) => ({ ...state, timeMs: shiftByScene(state.timeMs) }))
      .sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id)),
    cameraStates: project.cameraStates
      .map((state) => ({ ...state, timeMs: shiftByScene(state.timeMs) }))
      .sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id)),
    annotations: project.annotations.map((annotation) => ({
      ...annotation,
      startMs: annotation.startMs === undefined
        ? undefined
        : shiftByScene(annotation.startMs, annotation.sceneId),
      endMs: annotation.endMs === undefined
        ? undefined
        : shiftByScene(annotation.endMs, annotation.sceneId),
      points: annotation.points.map((point) => ({ ...point })),
    })),
  };
}

export interface SplitTacticalSceneInput {
  rightId: string;
  rightName: string;
  splitMs: number;
}

export function splitTacticalScene(
  project: TacticalProject,
  sceneId: string,
  input: SplitTacticalSceneInput,
): TacticalProject {
  const source = project.scenes.find((scene) => scene.id === sceneId);
  if (!source) throw new Error(`Scene ${sceneId} does not exist.`);
  if (!Number.isInteger(input.splitMs)) {
    throw new RangeError('Scene split time must be an integer millisecond value.');
  }
  const sourceEndMs = source.startMs + source.durationMs;
  if (input.splitMs <= source.startMs || input.splitMs >= sourceEndMs) {
    throw new RangeError('Scene split time must fall strictly inside the scene range.');
  }

  const ownedTargets = new Set(
    [...sceneOwnedTargetIds(project).entries()]
      .filter(([, ownerSceneId]) => ownerSceneId === sceneId)
      .map(([targetId]) => targetId),
  );
  const strandedTrack = project.timeline.tracks.find(
    (track) => ownedTargets.has(track.targetId)
      && track.keyframes.some((keyframe) => keyframe.timeMs > input.splitMs),
  );
  if (strandedTrack) {
    throw new Error(
      `Scene ${sceneId} has authored motion after the split point on target ${strandedTrack.targetId}; split at or after its final authored keyframe.`,
    );
  }

  const cloned = cloneTacticalScene(project, sceneId, {
    id: input.rightId,
    name: input.rightName,
    startMs: input.splitMs,
    durationMs: sourceEndMs - input.splitMs,
  });

  const rightSceneId = input.rightId.trim();
  return {
    ...cloned,
    scenes: cloned.scenes.map((scene) => scene.id === sceneId
      ? { ...scene, durationMs: input.splitMs - source.startMs }
      : scene),
    annotations: cloned.annotations
      .filter((annotation) => {
        if (annotation.sceneId === sceneId) {
          return annotation.startMs === undefined || annotation.startMs < input.splitMs;
        }
        if (annotation.sceneId === rightSceneId) {
          return annotation.endMs === undefined || annotation.endMs > input.splitMs;
        }
        return true;
      })
      .map((annotation) => {
        if (annotation.sceneId === sceneId && annotation.endMs !== undefined) {
          return { ...annotation, endMs: Math.min(annotation.endMs, input.splitMs) };
        }
        if (annotation.sceneId === rightSceneId && annotation.startMs !== undefined) {
          return { ...annotation, startMs: Math.max(annotation.startMs, input.splitMs) };
        }
        return annotation;
      }),
  };
}

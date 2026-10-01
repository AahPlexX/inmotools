import { addAnnotation } from './editor-engine';
import { normalizedToMeters } from './pitch-engine';
import type { NormalizedPoint, TacticalAnnotation, TacticalProject } from './tactics-types';
import { addTimelineKeyframe, addTimelineTrack } from './timeline-engine';

export const PRESENTATION_MARK_KINDS = ['spotlight', 'presentation-arrow', 'presentation-label'] as const;
export type PresentationMarkKind = (typeof PRESENTATION_MARK_KINDS)[number];

export interface PresentationMarkInput {
  id: string;
  kind: PresentationMarkKind;
  sceneId: string;
  layerId: string;
  points: NormalizedPoint[];
  label?: string;
  startMs: number;
  endMs: number;
}

export interface GhostPosition {
  tokenId: string;
  position: NormalizedPoint;
  relation: 'previous' | 'next';
  timeMs: number;
}

export interface ScenarioComparisonMove {
  tokenId: string;
  from: NormalizedPoint;
  to: NormalizedPoint;
  distanceMeters: number;
}

export interface ScenarioComparison {
  leftId: string;
  rightId: string;
  movedTokens: ScenarioComparisonMove[];
  unchangedTokenIds: string[];
  ballDistanceMeters: number;
  ballElevationDeltaMeters: number;
}

const comparisonCache = new WeakMap<TacticalProject, Map<string, ScenarioComparison>>();

function isPresentationKind(kind: string): kind is PresentationMarkKind {
  return (PRESENTATION_MARK_KINDS as readonly string[]).includes(kind);
}

function requireIntegerTime(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer millisecond value.`);
  }
  return value;
}

export function addPresentationMark(project: TacticalProject, input: PresentationMarkInput): TacticalProject {
  if (!isPresentationKind(input.kind)) throw new Error('Presentation mark kind is not supported.');
  if (input.kind === 'spotlight' && input.points.length !== 1) {
    throw new Error('Spotlight marks use one normalized center.');
  }
  if (input.kind === 'presentation-arrow' && input.points.length !== 2) {
    throw new Error('Presentation arrows use a start and an end.');
  }
  if (input.kind === 'presentation-label' && input.points.length !== 1) {
    throw new Error('Presentation labels use one normalized point.');
  }
  const annotation: TacticalAnnotation = {
    id: input.id,
    kind: input.kind,
    label: input.label?.trim() || undefined,
    sceneId: input.sceneId,
    layerId: input.layerId,
    points: input.points,
    visible: true,
    startMs: input.startMs,
    endMs: input.endMs,
  };
  return addAnnotation(project, annotation);
}

export function applyPresentationVisibility(project: TacticalProject, timeMs: number): TacticalProject {
  const time = requireIntegerTime(timeMs, 'Presentation time');
  return {
    ...project,
    annotations: project.annotations.map((annotation) => {
      if (!isPresentationKind(annotation.kind)) return annotation;
      const start = annotation.startMs ?? 0;
      const end = annotation.endMs ?? project.timeline.durationMs;
      return { ...annotation, visible: time >= start && time <= end };
    }),
  };
}

export function recordOnionSkinKeyframe(
  project: TacticalProject,
  sceneId: string,
  timeMs: number,
): TacticalProject {
  const time = requireIntegerTime(timeMs, 'Onion-skin time');
  if (time > project.timeline.durationMs) {
    throw new RangeError('Onion-skin time cannot exceed timeline duration.');
  }
  if (!project.scenes.some((scene) => scene.id === sceneId)) {
    throw new Error(`Scene "${sceneId}" does not exist.`);
  }
  let timeline = project.timeline;
  for (const token of project.playerTokens) {
    if (token.sceneId !== sceneId) continue;
    const position = { x: token.position.x, y: token.position.y };
    const existing = timeline.tracks.find((track) => track.targetId === token.id);
    if (!existing) {
      timeline = addTimelineTrack(timeline, {
        id: `onion-${token.id}`,
        targetId: token.id,
        keyframes: [{
          id: `onion-${token.id}-${time}`,
          timeMs: time,
          position,
          interpolation: 'linear',
        }],
      });
      continue;
    }
    const keyframes = existing.keyframes.some((keyframe) => keyframe.timeMs === time)
      ? existing.keyframes.map((keyframe) => (
          keyframe.timeMs === time ? { ...keyframe, position } : keyframe
        ))
      : addTimelineKeyframe(existing, {
          id: existing.keyframes.some((keyframe) => keyframe.id === `onion-${token.id}-${time}`)
            ? `onion-${token.id}-${time}-next`
            : `onion-${token.id}-${time}`,
          timeMs: time,
          position,
          interpolation: 'linear',
        }).keyframes;
    timeline = {
      ...timeline,
      tracks: timeline.tracks.map((track) => (track.id === existing.id ? { ...track, keyframes } : track)),
    };
  }
  return { ...project, timeline };
}

export function onionSkinGhosts(project: TacticalProject, timeMs: number, sceneId: string): GhostPosition[] {
  requireIntegerTime(timeMs, 'Onion-skin sample');
  const ghosts: GhostPosition[] = [];
  for (const token of project.playerTokens) {
    if (token.sceneId !== sceneId) continue;
    const track = project.timeline.tracks.find((candidate) => candidate.targetId === token.id);
    if (!track) continue;
    const positioned = track.keyframes
      .filter((keyframe) => keyframe.position)
      .slice()
      .sort((left, right) => left.timeMs - right.timeMs);
    const previous = [...positioned].reverse().find((keyframe) => keyframe.timeMs < timeMs);
    const next = positioned.find((keyframe) => keyframe.timeMs > timeMs);
    if (previous?.position) {
      ghosts.push({ tokenId: token.id, position: { ...previous.position }, relation: 'previous', timeMs: previous.timeMs });
    }
    if (next?.position) {
      ghosts.push({ tokenId: token.id, position: { ...next.position }, relation: 'next', timeMs: next.timeMs });
    }
  }
  return ghosts;
}

export function captureScenario(
  project: TacticalProject,
  input: { id: string; label: string; sceneId: string },
): TacticalProject {
  const id = input.id.trim();
  const label = input.label.trim();
  if (!id) throw new Error('Scenario id is required.');
  if (!label || label.length > 80) throw new Error('Scenario label must be 1 to 80 characters.');
  if (!project.scenes.some((scene) => scene.id === input.sceneId)) {
    throw new Error(`Scene "${input.sceneId}" does not exist.`);
  }
  const tokenPositions: Record<string, NormalizedPoint> = {};
  for (const token of project.playerTokens) {
    if (token.sceneId === input.sceneId) tokenPositions[token.id] = { ...token.position };
  }
  const scenario = {
    id,
    label,
    sceneId: input.sceneId,
    capturedAtMs: project.timeline.playheadMs,
    tokenPositions,
    ballPosition: { ...project.ball.position },
    ballElevationMeters: project.ball.elevationMeters,
  };
  const scenarios = project.scenarios ?? [];
  return {
    ...project,
    scenarios: scenarios.some((item) => item.id === id)
      ? scenarios.map((item) => (item.id === id ? scenario : item))
      : [...scenarios, scenario],
  };
}

function physicalDistance(from: NormalizedPoint, to: NormalizedPoint, project: TacticalProject): number {
  const start = normalizedToMeters(from, project.pitch.dimensions);
  const end = normalizedToMeters(to, project.pitch.dimensions);
  return Math.hypot(start.xMeters - end.xMeters, start.yMeters - end.yMeters);
}

function computeScenarioComparison(project: TacticalProject, leftId: string, rightId: string): ScenarioComparison {
  const left = project.scenarios?.find((scenario) => scenario.id === leftId);
  const right = project.scenarios?.find((scenario) => scenario.id === rightId);
  if (!left) throw new Error(`Scenario "${leftId}" does not exist.`);
  if (!right) throw new Error(`Scenario "${rightId}" does not exist.`);
  const movedTokens: ScenarioComparisonMove[] = [];
  const unchangedTokenIds: string[] = [];
  const tokenIds = [...new Set([...Object.keys(left.tokenPositions), ...Object.keys(right.tokenPositions)])].sort();
  for (const tokenId of tokenIds) {
    const from = left.tokenPositions[tokenId];
    const to = right.tokenPositions[tokenId];
    if (!from || !to) continue;
    if (from.x === to.x && from.y === to.y) {
      unchangedTokenIds.push(tokenId);
      continue;
    }
    movedTokens.push({
      tokenId,
      from: { ...from },
      to: { ...to },
      distanceMeters: physicalDistance(from, to, project),
    });
  }
  return {
    leftId,
    rightId,
    movedTokens,
    unchangedTokenIds,
    ballDistanceMeters: physicalDistance(left.ballPosition, right.ballPosition, project),
    ballElevationDeltaMeters: right.ballElevationMeters - left.ballElevationMeters,
  };
}

export function compareScenarios(project: TacticalProject, leftId: string, rightId: string): ScenarioComparison {
  const key = `${leftId}\0${rightId}`;
  let bucket = comparisonCache.get(project);
  const cached = bucket?.get(key);
  if (cached) return cached;
  const value = computeScenarioComparison(project, leftId, rightId);
  if (!bucket) {
    bucket = new Map();
    comparisonCache.set(project, bucket);
  }
  bucket.set(key, value);
  return value;
}

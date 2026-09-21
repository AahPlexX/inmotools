import type {
  NormalizedPoint,
  RosterPlayer,
  TacticalAnnotation,
  TacticalEquipment,
  TacticalLayer,
  TacticalProject,
  TacticalTeam,
  PlayerToken,
} from './tactics-types';
import { createNormalizedPoint } from './pitch-engine';

const HISTORY_LIMIT = 100;

export interface TacticalProjectSnapshot {
  label: string;
  project: TacticalProject;
}

export interface TacticalProjectHistory {
  past: TacticalProjectSnapshot[];
  present: TacticalProject;
  future: TacticalProjectSnapshot[];
}

function touch(project: TacticalProject): TacticalProject {
  return {
    ...project,
    metadata: {
      ...project.metadata,
      modifiedAt: new Date().toISOString(),
    },
  };
}

function requireNormalized(point: NormalizedPoint): NormalizedPoint {
  try {
    return createNormalizedPoint(point.x, point.y);
  } catch {
    throw new RangeError('Position must use normalized [0, 1] coordinates.');
  }
}

function requireFinite(value: number, label: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${label} must be finite.`);
  return value;
}

function requirePositive(value: number, label: string): number {
  requireFinite(value, label);
  if (value <= 0) throw new RangeError(`${label} must be positive.`);
  return value;
}

function hasProjectId(project: TacticalProject, id: string): boolean {
  return project.teams.some((team) => team.id === id)
    || project.teams.some((team) => team.roster.some((player) => player.id === id))
    || project.playerTokens.some((token) => token.id === id)
    || project.officials.some((official) => official.id === id)
    || project.equipment.some((item) => item.id === id)
    || project.annotations.some((annotation) => annotation.id === id)
    || project.scenes.some((scene) =>
      scene.id === id
      || scene.layers.some((layer) => layer.id === id)
      || scene.objects.some((object) => object.id === id)
    );
}

function requireUniqueId(project: TacticalProject, id: string): void {
  if (!id.trim()) throw new Error('Object id cannot be empty.');
  if (hasProjectId(project, id)) throw new Error(`Project id "${id}" already exists.`);
}

function requireTeam(project: TacticalProject, teamId: string): TacticalTeam {
  const team = project.teams.find((candidate) => candidate.id === teamId);
  if (!team) throw new Error(`Team "${teamId}" does not exist.`);
  return team;
}

function requireRosterPlayer(project: TacticalProject, teamId: string, playerId: string): RosterPlayer {
  const team = requireTeam(project, teamId);
  const player = team.roster.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`Roster player "${playerId}" does not exist on team "${teamId}".`);
  return player;
}

export function createTacticalHistory(project: TacticalProject): TacticalProjectHistory {
  return { past: [], present: project, future: [] };
}

export function commitTacticalProject(
  history: TacticalProjectHistory,
  label: string,
  updater: (project: TacticalProject) => TacticalProject,
): TacticalProjectHistory {
  const nextProject = updater(history.present);
  if (nextProject === history.present) return history;

  return {
    past: [...history.past, { label, project: history.present }].slice(-HISTORY_LIMIT),
    present: touch(nextProject),
    future: [],
  };
}

export function undoTacticalProject(history: TacticalProjectHistory): TacticalProjectHistory {
  if (!history.past.length) return history;
  const snapshot = history.past[history.past.length - 1]!;
  return {
    past: history.past.slice(0, -1),
    present: snapshot.project,
    future: [{ label: snapshot.label, project: history.present }, ...history.future],
  };
}

export function redoTacticalProject(history: TacticalProjectHistory): TacticalProjectHistory {
  if (!history.future.length) return history;
  const [snapshot, ...future] = history.future;
  return {
    past: [...history.past, { label: snapshot.label, project: history.present }].slice(-HISTORY_LIMIT),
    present: snapshot.project,
    future,
  };
}

export function addTeam(project: TacticalProject, team: TacticalTeam): TacticalProject {
  requireUniqueId(project, team.id);
  const rosterIds = new Set<string>();
  for (const player of team.roster) {
    if (!player.id.trim()) throw new Error('Roster player id cannot be empty.');
    if (rosterIds.has(player.id) || hasProjectId(project, player.id)) {
      throw new Error(`Project id "${player.id}" already exists.`);
    }
    rosterIds.add(player.id);
  }
  return { ...project, teams: [...project.teams, { ...team, roster: [...team.roster] }] };
}

export function addRosterPlayer(
  project: TacticalProject,
  teamId: string,
  player: RosterPlayer,
): TacticalProject {
  requireTeam(project, teamId);
  requireUniqueId(project, player.id);
  return {
    ...project,
    teams: project.teams.map((team) =>
      team.id === teamId ? { ...team, roster: [...team.roster, { ...player }] } : team
    ),
  };
}

export function addPlayerToken(project: TacticalProject, token: PlayerToken): TacticalProject {
  requireUniqueId(project, token.id);
  requireRosterPlayer(project, token.teamId, token.playerId);
  if (project.playerTokens.some((candidate) =>
    candidate.teamId === token.teamId && candidate.playerId === token.playerId
  )) {
    throw new Error(`Roster player "${token.playerId}" already has a token.`);
  }

  const normalized = requireNormalized(token.position);
  return {
    ...project,
    playerTokens: [
      ...project.playerTokens,
      {
        ...token,
        position: normalized,
        rotationDeg: requireFinite(token.rotationDeg, 'Token rotation'),
      },
    ],
  };
}

export function movePlayerToken(
  project: TacticalProject,
  tokenId: string,
  position: NormalizedPoint,
): TacticalProject {
  const normalized = requireNormalized(position);
  const token = project.playerTokens.find((candidate) => candidate.id === tokenId);
  if (!token) throw new Error(`Player token "${tokenId}" does not exist.`);
  if (token.locked) throw new Error(`Player token "${tokenId}" is locked.`);

  return {
    ...project,
    playerTokens: project.playerTokens.map((candidate) =>
      candidate.id === tokenId ? { ...candidate, position: normalized } : candidate
    ),
  };
}

export function addEquipment(
  project: TacticalProject,
  equipment: TacticalEquipment,
): TacticalProject {
  requireUniqueId(project, equipment.id);
  if (
    equipment.layerId
    && !project.scenes.some((scene) => scene.layers.some((layer) => layer.id === equipment.layerId))
  ) {
    throw new Error(`Layer "${equipment.layerId}" does not exist.`);
  }

  return {
    ...project,
    equipment: [
      ...project.equipment,
      {
        ...equipment,
        position: requireNormalized(equipment.position),
        rotationDeg: requireFinite(equipment.rotationDeg, 'Equipment rotation'),
        scale: requirePositive(equipment.scale, 'Equipment scale'),
      },
    ],
  };
}

export function addAnnotation(
  project: TacticalProject,
  annotation: TacticalAnnotation,
): TacticalProject {
  requireUniqueId(project, annotation.id);
  if (!annotation.points.length) throw new Error('Annotation must contain at least one point.');

  const startMs = annotation.startMs;
  const endMs = annotation.endMs;
  if (startMs !== undefined && (!Number.isInteger(startMs) || startMs < 0)) {
    throw new RangeError('Annotation start time must be a non-negative integer millisecond value.');
  }
  if (endMs !== undefined && (!Number.isInteger(endMs) || endMs < 0)) {
    throw new RangeError('Annotation end time must be a non-negative integer millisecond value.');
  }
  if (startMs !== undefined && endMs !== undefined && endMs < startMs) {
    throw new RangeError('Annotation end time cannot precede its start time.');
  }

  return {
    ...project,
    annotations: [
      ...project.annotations,
      {
        ...annotation,
        points: annotation.points.map(requireNormalized),
      },
    ],
  };
}

export function setSceneLayerState(
  project: TacticalProject,
  sceneId: string,
  layerId: string,
  patch: Partial<Pick<TacticalLayer, 'name' | 'visible' | 'locked'>>,
): TacticalProject {
  const scene = project.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) throw new Error(`Scene "${sceneId}" does not exist.`);
  if (!scene.layers.some((layer) => layer.id === layerId)) {
    throw new Error(`Layer "${layerId}" does not exist in scene "${sceneId}".`);
  }

  return {
    ...project,
    scenes: project.scenes.map((candidate) =>
      candidate.id === sceneId
        ? {
            ...candidate,
            layers: candidate.layers.map((layer) =>
              layer.id === layerId ? { ...layer, ...patch } : layer
            ),
          }
        : candidate
    ),
  };
}

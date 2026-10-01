import { addPlayerToken, addRosterPlayer } from './editor-engine';
import { createNormalizedPoint } from './pitch-engine';
import type { NormalizedPoint, RosterPlayer, TacticalProject, TacticalTeam } from './tactics-types';

export const ROSTER_PLAYER_STATUSES = ['active', 'substitute', 'neutral', 'coach'] as const;
export type RosterPlayerStatus = (typeof ROSTER_PLAYER_STATUSES)[number];

export interface SquadCounts {
  roster: number;
  active: number;
  substitute: number;
  neutral: number;
  coach: number;
}

export interface SquadPlacement {
  sceneId: string;
  layerId: string;
  position?: NormalizedPoint;
}

const STATUS_SET = new Set<string>(ROSTER_PLAYER_STATUSES);

function requireStatus(status: string): RosterPlayerStatus {
  if (!STATUS_SET.has(status)) {
    throw new Error('Roster status must be active, substitute, neutral, or coach.');
  }
  return status as RosterPlayerStatus;
}

function requireTeam(project: TacticalProject, teamId: string): TacticalTeam {
  const team = project.teams.find((candidate) => candidate.id === teamId);
  if (!team) throw new Error(`Team "${teamId}" does not exist.`);
  return team;
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
  for (const scenario of project.scenarios ?? []) ids.add(scenario.id);
  for (const scene of project.scenes) {
    ids.add(scene.id);
    for (const layer of scene.layers) ids.add(layer.id);
    for (const object of scene.objects) ids.add(object.id);
  }
  return ids;
}

function nextId(project: TacticalProject, prefix: string): string {
  const occupied = occupiedIds(project);
  let index = 1;
  while (occupied.has(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function nextJersey(team: TacticalTeam): string {
  const used = new Set(team.roster.map((player) => player.jerseyNumber).filter((value): value is string => Boolean(value)));
  let number = 1;
  while (used.has(String(number))) number += 1;
  return String(number);
}

function slotPosition(index: number): NormalizedPoint {
  const columns = 8;
  const column = index % columns;
  const row = Math.floor(index / columns) % 6;
  return createNormalizedPoint(
    Math.min(0.92, 0.12 + column * 0.1),
    Math.min(0.88, 0.18 + row * 0.12),
  );
}

function tokenFor(project: TacticalProject, teamId: string, playerId: string) {
  return project.playerTokens.find((token) => token.teamId === teamId && token.playerId === playerId);
}

function withTokenVisibility(project: TacticalProject, tokenId: string, visible: boolean): TacticalProject {
  return {
    ...project,
    playerTokens: project.playerTokens.map((token) => (
      token.id === tokenId ? { ...token, visible } : token
    )),
  };
}

export function squadCounts(project: TacticalProject, teamId: string): SquadCounts {
  const team = requireTeam(project, teamId);
  const counts: SquadCounts = { roster: team.roster.length, active: 0, substitute: 0, neutral: 0, coach: 0 };
  for (const player of team.roster) {
    const status = requireStatus(player.status);
    counts[status] += 1;
  }
  return counts;
}

export function setRosterPlayerStatus(
  project: TacticalProject,
  teamId: string,
  playerId: string,
  status: RosterPlayerStatus,
): TacticalProject {
  const nextStatus = requireStatus(status);
  const team = requireTeam(project, teamId);
  const player = team.roster.find((candidate) => candidate.id === playerId);
  if (!player) throw new Error(`Roster player "${playerId}" does not exist on team "${teamId}".`);
  if (player.status === nextStatus) return project;

  const updated: TacticalProject = {
    ...project,
    teams: project.teams.map((candidate) => (
      candidate.id === teamId
        ? {
            ...candidate,
            roster: candidate.roster.map((item) => (
              item.id === playerId ? { ...item, status: nextStatus } : item
            )),
          }
        : candidate
    )),
  };
  const token = tokenFor(updated, teamId, playerId);
  if (!token) return updated;
  const visible = nextStatus !== 'substitute';
  return token.visible === visible ? updated : withTokenVisibility(updated, token.id, visible);
}

export function addSquadParticipant(
  project: TacticalProject,
  teamId: string,
  player: RosterPlayer,
  placement?: SquadPlacement,
): TacticalProject {
  const status = requireStatus(player.status);
  let next = addRosterPlayer(project, teamId, { ...player, status });
  if (!placement) return next;
  const position = placement.position
    ? createNormalizedPoint(placement.position.x, placement.position.y)
    : slotPosition(next.teams.find((team) => team.id === teamId)?.roster.length ?? 1);
  next = addPlayerToken(next, {
    id: nextId(next, `token-${player.id}`),
    playerId: player.id,
    teamId,
    sceneId: placement.sceneId,
    layerId: placement.layerId,
    position,
    rotationDeg: 0,
    visible: status !== 'substitute',
    locked: false,
  });
  return next;
}

function ensureActiveToken(
  project: TacticalProject,
  teamId: string,
  playerId: string,
  placement: SquadPlacement,
): TacticalProject {
  const existing = tokenFor(project, teamId, playerId);
  if (existing) {
    return existing.visible ? project : withTokenVisibility(project, existing.id, true);
  }
  const team = requireTeam(project, teamId);
  const index = Math.max(0, team.roster.findIndex((player) => player.id === playerId));
  return addPlayerToken(project, {
    id: nextId(project, `token-${playerId}`),
    playerId,
    teamId,
    sceneId: placement.sceneId,
    layerId: placement.layerId,
    position: slotPosition(index),
    rotationDeg: 0,
    visible: true,
    locked: false,
  });
}

export function scaleActiveSquad(
  project: TacticalProject,
  teamId: string,
  activeCount: number,
  placement: SquadPlacement,
): TacticalProject {
  if (!Number.isInteger(activeCount) || activeCount < 0) {
    throw new RangeError('Active squad size must be a non-negative integer.');
  }
  requireTeam(project, teamId);
  if (squadCounts(project, teamId).active === activeCount) return project;

  let next = project;
  let guard = 0;
  while (squadCounts(next, teamId).active > activeCount) {
    const team = requireTeam(next, teamId);
    const active = team.roster.filter((player) => player.status === 'active');
    const demote = active[active.length - 1];
    if (!demote) break;
    next = setRosterPlayerStatus(next, teamId, demote.id, 'substitute');
    guard += 1;
    if (guard > activeCount + team.roster.length + 2) {
      throw new Error('Squad scaling could not reduce the active count.');
    }
  }

  while (squadCounts(next, teamId).active < activeCount) {
    const team = requireTeam(next, teamId);
    const substitute = team.roster.find((player) => player.status === 'substitute');
    if (substitute) {
      next = setRosterPlayerStatus(next, teamId, substitute.id, 'active');
      next = ensureActiveToken(next, teamId, substitute.id, placement);
    } else {
      const jersey = nextJersey(team);
      const playerId = nextId(next, `${teamId}-player`);
      next = addSquadParticipant(next, teamId, {
        id: playerId,
        displayName: `Player ${jersey}`,
        jerseyNumber: jersey,
        status: 'active',
      }, {
        ...placement,
        position: slotPosition(team.roster.length),
      });
    }
    guard += 1;
    if (guard > activeCount + 4) throw new Error('Squad scaling could not reach the requested active count.');
  }

  return next;
}

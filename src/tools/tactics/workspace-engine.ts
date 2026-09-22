import { addAnnotation, addPlayerToken, addRosterPlayer, addTeam } from './editor-engine';
import { getFormationTemplate, materializeFormationPositions } from './formation-engine';
import { createNormalizedPoint, trainingFormatProfiles } from './pitch-engine';
import { createStarterTacticalProject } from './tactics-engine';
import type { NormalizedPoint, PitchDimensions, TacticalProject } from './tactics-types';

export interface BeginnerTacticalProjectOptions {
  title: string;
  teamName: string;
  primaryColor: string;
  secondaryColor: string;
  formationId: string;
  pitchDimensions: PitchDimensions;
  direction: 'left-to-right' | 'right-to-left';
}

interface ClientPoint {
  clientX: number;
  clientY: number;
}

interface RectLike {
  left: number;
  top: number;
  width: number;
  height: number;
}

function requirePositiveFinite(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
  return value;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function cloneRulesetForTeamSize(teamSize: number): TacticalProject['ruleset'] {
  const source = trainingFormatProfiles.find((profile) => profile.teamSize === teamSize);
  if (!source) throw new Error(`No editable training ruleset exists for ${teamSize}v${teamSize}.`);
  return {
    ...source,
    provenance: { ...source.provenance },
    specialLines: source.specialLines ? [...source.specialLines] : undefined,
    restartNotes: source.restartNotes ? [...source.restartNotes] : undefined,
  };
}

function occupiedProjectIds(project: TacticalProject): Set<string> {
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

function nextArrowId(project: TacticalProject): string {
  const occupied = occupiedProjectIds(project);
  let index = 1;
  while (occupied.has(`arrow-${index}`)) index += 1;
  return `arrow-${index}`;
}

export function clientPointToNormalized(point: ClientPoint, rect: RectLike): NormalizedPoint {
  requirePositiveFinite(rect.width, 'Board width');
  requirePositiveFinite(rect.height, 'Board height');
  if (![point.clientX, point.clientY, rect.left, rect.top].every(Number.isFinite)) {
    throw new RangeError('Client coordinates and board offsets must be finite.');
  }

  return createNormalizedPoint(
    clampUnit((point.clientX - rect.left) / rect.width),
    clampUnit((point.clientY - rect.top) / rect.height),
  );
}

export function nudgeNormalizedPoint(
  point: NormalizedPoint,
  deltaX: number,
  deltaY: number,
): NormalizedPoint {
  if (!Number.isFinite(deltaX) || !Number.isFinite(deltaY)) {
    throw new RangeError('Nudge deltas must be finite.');
  }
  const current = createNormalizedPoint(point.x, point.y);
  return createNormalizedPoint(
    clampUnit(current.x + deltaX),
    clampUnit(current.y + deltaY),
  );
}

export function buildBeginnerTacticalProject(
  options: BeginnerTacticalProjectOptions,
): TacticalProject {
  const formation = getFormationTemplate(options.formationId);
  if (!formation) throw new Error(`Formation "${options.formationId}" does not exist.`);

  const pitchDimensions = {
    lengthMeters: requirePositiveFinite(options.pitchDimensions.lengthMeters, 'Pitch length'),
    widthMeters: requirePositiveFinite(options.pitchDimensions.widthMeters, 'Pitch width'),
  };
  const positions = materializeFormationPositions(formation, options.direction);
  let project = createStarterTacticalProject();
  const sceneId = project.scenes[0]?.id;
  const layerId = project.scenes[0]?.layers[0]?.id;
  if (!sceneId || !layerId) throw new Error('Starter tactical project is missing its initial scene layer.');

  project = {
    ...project,
    metadata: {
      ...project.metadata,
      title: options.title.trim() || 'Untitled tactical project',
    },
    ruleset: cloneRulesetForTeamSize(formation.teamSize),
    pitch: {
      ...project.pitch,
      profileId: `training-${formation.teamSize}v${formation.teamSize}`,
      dimensions: pitchDimensions,
      direction: options.direction,
    },
    sessionPlan: {
      ...project.sessionPlan,
      playerCount: formation.teamSize,
      dimensions: `${pitchDimensions.lengthMeters} m × ${pitchDimensions.widthMeters} m`,
    },
  };

  const teamId = 'team-primary';
  project = addTeam(project, {
    id: teamId,
    name: options.teamName.trim() || 'Team',
    primaryColor: options.primaryColor,
    secondaryColor: options.secondaryColor,
    roster: [],
  });

  for (let index = 0; index < positions.length; index += 1) {
    const number = index + 1;
    const playerId = `player-${number}`;
    project = addRosterPlayer(project, teamId, {
      id: playerId,
      displayName: formation.goalkeepers > index ? `Goalkeeper ${number}` : `Player ${number}`,
      jerseyNumber: String(number),
      role: formation.goalkeepers > index ? 'Goalkeeper' : undefined,
      status: 'active',
    });
    project = addPlayerToken(project, {
      id: `token-${number}`,
      playerId,
      teamId,
      sceneId,
      layerId,
      position: positions[index]!,
      rotationDeg: 0,
      visible: true,
      locked: false,
    });
  }

  return project;
}

export function addTacticalArrow(
  project: TacticalProject,
  sceneId: string,
  layerId: string,
  from: NormalizedPoint,
  to: NormalizedPoint,
  label?: string,
): TacticalProject {
  const start = createNormalizedPoint(from.x, from.y);
  const end = createNormalizedPoint(to.x, to.y);
  if (start.x === end.x && start.y === end.y) {
    throw new Error('Arrow start and end points must be different.');
  }

  return addAnnotation(project, {
    id: nextArrowId(project),
    kind: 'arrow',
    label: label?.trim() || undefined,
    sceneId,
    layerId,
    points: [start, end],
  });
}

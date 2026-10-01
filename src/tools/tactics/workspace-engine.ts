import { addAnnotation, addPlayerToken, addRosterPlayer, addTeam } from './editor-engine';
import { getFormationTemplate, materializeFormationPositions } from './formation-engine';
import { createNormalizedPoint, createTrainingFormatProfile, trainingFormatProfiles } from './pitch-engine';
import { createStarterTacticalProject } from './tactics-engine';
import type {
  FormationTemplate,
  NormalizedPoint,
  PitchDimensions,
  TacticalProject,
} from './tactics-types';

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
  const source = trainingFormatProfiles.find((profile) => profile.teamSize === teamSize)
    ?? createTrainingFormatProfile(teamSize);
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
  customFormation?: FormationTemplate,
): TacticalProject {
  const formation = customFormation?.id === options.formationId
    ? customFormation
    : getFormationTemplate(options.formationId);
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

export function removeTacticalAnnotation(project: TacticalProject, annotationId: string): TacticalProject {
  if (!project.annotations.some((annotation) => annotation.id === annotationId)) {
    throw new Error(`Drawing "${annotationId}" does not exist.`);
  }
  return {
    ...project,
    annotations: project.annotations.filter((annotation) => annotation.id !== annotationId),
  };
}

export const OPPOSITION_TEAM_ID = 'team-opposition';

export interface OppositionPlacementOptions {
  teamName?: string;
  primaryColor?: string;
  secondaryColor?: string;
}

interface HalfRange {
  min: number;
  max: number;
}

function halfRange(half: 'left' | 'right'): HalfRange {
  return half === 'left' ? { min: 0.07, max: 0.46 } : { min: 0.54, max: 0.93 };
}

function fitIntoHalf(points: readonly NormalizedPoint[], half: 'left' | 'right'): NormalizedPoint[] {
  const { min, max } = halfRange(half);
  const xs = points.map((point) => point.x);
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  const span = hi - lo;
  const room = max - min;
  if (lo >= min - 1e-9 && hi <= max + 1e-9) {
    return points.map((point) => createNormalizedPoint(point.x, point.y));
  }
  if (span <= room) {
    let shift = lo < min ? min - lo : 0;
    if (hi + shift > max) shift = max - hi;
    return points.map((point) => createNormalizedPoint(
      clampUnit(point.x + shift),
      point.y,
    ));
  }
  return points.map((point) => createNormalizedPoint(
    span < 1e-9 ? (min + max) / 2 : min + ((point.x - lo) / span) * room,
    point.y,
  ));
}

function cssHexColor(value: string, label: string): string {
  const color = value.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(color)) throw new Error(`${label} must be a #rrggbb color.`);
  return color;
}

function colorDistinctFrom(color: string, other: string): string {
  if (color !== other) return color;
  const options = ['#9f1239', '#1d4ed8', '#0f766e', '#a16207', '#6d28d9'];
  return options.find((option) => option !== other) ?? '#111827';
}

function shiftNormalized(point: NormalizedPoint, dx: number, dy: number): NormalizedPoint {
  return createNormalizedPoint(clampUnit(point.x + dx), clampUnit(point.y + dy));
}

function jerseyRank(project: TacticalProject, teamId: string, playerId: string): number {
  const jersey = project.teams
    .find((team) => team.id === teamId)
    ?.roster.find((player) => player.id === playerId)
    ?.jerseyNumber;
  const value = Number(jersey);
  return Number.isFinite(value) ? value : Number.POSITIVE_INFINITY;
}

function withTokenGeometryShift(
  project: TacticalProject,
  tokenId: string,
  from: NormalizedPoint,
  to: NormalizedPoint,
): TacticalProject {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const moved = Math.abs(dx) >= 1e-12 || Math.abs(dy) >= 1e-12;
  const move = (point: NormalizedPoint) => (moved ? shiftNormalized(point, dx, dy) : createNormalizedPoint(point.x, point.y));
  return {
    ...project,
    playerTokens: project.playerTokens.map((token) => (
      token.id === tokenId ? { ...token, position: to } : token
    )),
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.map((track) => (
        track.targetId !== tokenId
          ? track
          : {
              ...track,
              keyframes: track.keyframes.map((keyframe) => ({
                ...keyframe,
                position: keyframe.position ? move(keyframe.position) : undefined,
                motionPath: keyframe.motionPath
                  ? { ...keyframe.motionPath, controlPoints: keyframe.motionPath.controlPoints.map(move) }
                  : undefined,
              })),
            }
      )),
    },
    formationStates: project.formationStates.map((state) => {
      const position = state.playerPositions[tokenId];
      if (!position) return state;
      return {
        ...state,
        playerPositions: { ...state.playerPositions, [tokenId]: move(position) },
      };
    }),
    scenarios: (project.scenarios ?? []).map((scenario) => {
      const position = scenario.tokenPositions[tokenId];
      if (!position) return scenario;
      return {
        ...scenario,
        tokenPositions: { ...scenario.tokenPositions, [tokenId]: move(position) },
      };
    }),
  };
}

function withoutOppositionTokens(project: TacticalProject, tokenIds: ReadonlySet<string>): TacticalProject {
  if (!tokenIds.size) return project;
  const drop = (positions: Record<string, NormalizedPoint>) => Object.fromEntries(
    Object.entries(positions).filter(([id]) => !tokenIds.has(id)),
  );
  return {
    ...project,
    teams: project.teams.filter((team) => team.id !== OPPOSITION_TEAM_ID),
    playerTokens: project.playerTokens.filter((token) => !tokenIds.has(token.id)),
    timeline: {
      ...project.timeline,
      tracks: project.timeline.tracks.filter((track) => !tokenIds.has(track.targetId)),
      possessionEvents: project.timeline.possessionEvents?.map((event) => (
        event.holderTargetId && tokenIds.has(event.holderTargetId)
          ? { ...event, holderTargetId: null }
          : event
      )),
    },
    formationStates: project.formationStates.map((state) => ({
      ...state,
      playerPositions: drop(state.playerPositions),
    })),
    scenarios: (project.scenarios ?? []).map((scenario) => ({
      ...scenario,
      tokenPositions: drop(scenario.tokenPositions),
    })),
  };
}

export function placeMirroredOpposition(
  project: TacticalProject,
  sceneId: string,
  layerId: string,
  options: OppositionPlacementOptions = {},
): TacticalProject {
  const scene = project.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) throw new Error(`Scene "${sceneId}" does not exist.`);
  const layer = scene.layers.find((candidate) => candidate.id === layerId);
  if (!layer) throw new Error(`Layer "${layerId}" does not exist in scene "${sceneId}".`);
  if (layer.locked) throw new Error('Unlock the layer before placing the opposition.');

  const primary = project.teams.find((team) => team.id !== OPPOSITION_TEAM_ID);
  if (!primary) throw new Error('Add a squad before placing an opposition.');
  const roster = new Map(primary.roster.map((player) => [player.id, player]));
  const source = project.playerTokens
    .filter((token) => (
      token.teamId === primary.id
      && token.sceneId === sceneId
      && token.visible
      && roster.get(token.playerId)?.status === 'active'
    ))
    .sort((left, right) => {
      const rank = jerseyRank(project, primary.id, left.playerId) - jerseyRank(project, primary.id, right.playerId);
      return rank || left.id.localeCompare(right.id);
    });
  if (!source.length) throw new Error('This scene has no visible outfield or goalkeeper tokens to mirror.');

  const centroid = source.reduce((sum, token) => sum + token.position.x, 0) / source.length;
  const primaryHalf = centroid <= 0.5 ? 'left' : 'right';
  const oppositionHalf = primaryHalf === 'left' ? 'right' : 'left';
  const fittedPrimary = fitIntoHalf(source.map((token) => token.position), primaryHalf);
  const facing = fitIntoHalf(
    fittedPrimary.map((point) => createNormalizedPoint(1 - point.x, point.y)),
    oppositionHalf,
  );
  const blocked = source.find((token, index) => {
    const next = fittedPrimary[index]!;
    return token.locked && (token.position.x !== next.x || token.position.y !== next.y);
  });
  if (blocked) throw new Error('Unlock the squad before fitting both teams into halves.');

  const existing = project.playerTokens
    .filter((token) => token.teamId === OPPOSITION_TEAM_ID)
    .sort((left, right) => left.id.localeCompare(right.id));
  if (existing.some((token) => token.locked)) {
    throw new Error('Unlock the opposition before placing it again.');
  }

  const requestedName = options.teamName?.trim() || project.teams.find((team) => team.id === OPPOSITION_TEAM_ID)?.name || 'Opposition';
  const teamName = requestedName || 'Opposition';
  const requestedColor = cssHexColor(options.primaryColor ?? '#9f1239', 'Opposition color');
  const primaryColor = colorDistinctFrom(requestedColor, primary.primaryColor.trim().toLowerCase());
  const secondaryColor = cssHexColor(options.secondaryColor ?? '#ffffff', 'Opposition number color');
  const rotation = oppositionHalf === 'right' ? 180 : 0;

  let next = source.reduce((current, token, index) => (
    withTokenGeometryShift(current, token.id, token.position, fittedPrimary[index]!)
  ), project);

  if (existing.length === source.length) {
    const oppositionTeam = next.teams.find((team) => team.id === OPPOSITION_TEAM_ID);
    if (!oppositionTeam) throw new Error('Opposition tokens are missing their team.');
    const rosterIds = existing.map((token) => token.playerId);
    next = {
      ...next,
      teams: next.teams.map((team) => (
        team.id !== OPPOSITION_TEAM_ID
          ? team
          : {
              ...team,
              name: teamName,
              primaryColor,
              secondaryColor,
              roster: team.roster.map((player) => {
                const index = rosterIds.indexOf(player.id);
                if (index < 0) return player;
                const paired = roster.get(source[index]!.playerId);
                const jersey = paired?.jerseyNumber ?? String(index + 1);
                return {
                  ...player,
                  displayName: `${teamName} ${jersey}`,
                  jerseyNumber: jersey,
                  role: paired?.role,
                  status: 'active' as const,
                };
              }),
            }
      )),
    };
    existing.forEach((token, index) => {
      const destination = facing[index]!;
      next = withTokenGeometryShift(next, token.id, token.position, destination);
      next = {
        ...next,
        playerTokens: next.playerTokens.map((candidate) => (
          candidate.id === token.id
            ? { ...candidate, sceneId, layerId, rotationDeg: rotation, visible: true }
            : candidate
        )),
      };
    });
    return next;
  }

  const removed = new Set(existing.map((token) => token.id));
  next = withoutOppositionTokens(next, removed);
  next = addTeam(next, {
    id: OPPOSITION_TEAM_ID,
    name: teamName,
    primaryColor,
    secondaryColor,
    roster: [],
  });
  source.forEach((token, index) => {
    const paired = roster.get(token.playerId);
    const jersey = paired?.jerseyNumber ?? String(index + 1);
    const playerId = `player-opp-${index + 1}`;
    const tokenId = `token-opp-${index + 1}`;
    next = addRosterPlayer(next, OPPOSITION_TEAM_ID, {
      id: playerId,
      displayName: `${teamName} ${jersey}`,
      jerseyNumber: jersey,
      role: paired?.role,
      status: 'active',
    });
    next = addPlayerToken(next, {
      id: tokenId,
      playerId,
      teamId: OPPOSITION_TEAM_ID,
      sceneId,
      layerId,
      position: facing[index]!,
      rotationDeg: rotation,
      visible: true,
      locked: false,
    });
  });
  return next;
}

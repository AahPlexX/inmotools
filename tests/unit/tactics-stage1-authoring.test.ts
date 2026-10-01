import { describe, expect, it } from 'vitest';
import { serializeTacticalBoardSvg } from '../../src/tools/tactics/board-engine';
import {
  authorBallElevationKeyframe,
  sampleBallElevationTrajectory,
} from '../../src/tools/tactics/elevation-engine';
import {
  authorCanonicalCoordinate,
  authorEntityCoordinate,
  readCanonicalCoordinate,
} from '../../src/tools/tactics/coordinate-engine';
import { movePlayerToken } from '../../src/tools/tactics/editor-engine';
import {
  equalSpacingGuides,
  snapWithTacticalAssist,
  tacticalPitchGuides,
} from '../../src/tools/tactics/guide-engine';
import {
  addPresentationMark,
  applyPresentationVisibility,
  captureScenario,
  compareScenarios,
  onionSkinGhosts,
  recordOnionSkinKeyframe,
} from '../../src/tools/tactics/presentation-authoring-engine';
import { TRAINING_PROP_LIBRARY, placeTrainingProp, transformEquipment } from '../../src/tools/tactics/prop-library';
import { importTacticalProjectJson, exportTacticalProjectJson } from '../../src/tools/tactics/project-io';
import {
  MAX_ROSTER_PLAYERS_PER_TEAM,
  addSquadParticipant,
  scaleActiveSquad,
  setRosterPlayerStatus,
  squadCounts,
} from '../../src/tools/tactics/squad-engine';
import { editRosterToken } from '../../src/tools/tactics/token-editor-engine';
import { createStarterTacticalProject, validateTacticalProject } from '../../src/tools/tactics/tactics-engine';
import { transformTacticalProject } from '../../src/tools/tactics/pitch-engine';
import { sampleTacticalProjectAtTime } from '../../src/tools/tactics/timeline-engine';
import { buildBeginnerTacticalProject } from '../../src/tools/tactics/workspace-engine';
import type { TacticalProject } from '../../src/tools/tactics/tactics-types';

function trainingBoard(): TacticalProject {
  return buildBeginnerTacticalProject({
    title: 'Stage 1 board',
    teamName: 'Home',
    primaryColor: '#154c79',
    secondaryColor: '#ffffff',
    formationId: 'ussf-7v7-1-3-2-1',
    pitchDimensions: { lengthMeters: 60, widthMeters: 40 },
    direction: 'left-to-right',
  });
}

function placement(project: TacticalProject) {
  const scene = project.scenes[0]!;
  return { sceneId: scene.id, layerId: scene.layers[0]!.id };
}

describe('Dynamic squad and neutral-player scaler', () => {
  it('grows and shrinks the active squad without deleting roster players or imposing a format cap', () => {
    const start = trainingBoard();
    const teamId = start.teams[0]!.id;
    expect(squadCounts(start, teamId)).toMatchObject({ roster: 7, active: 7, substitute: 0, neutral: 0, coach: 0 });

    const expanded = scaleActiveSquad(start, teamId, 24, placement(start));
    expect(squadCounts(expanded, teamId).active).toBe(24);
    expect(squadCounts(expanded, teamId).roster).toBe(24);
    expect(expanded.playerTokens.filter((token) => token.visible)).toHaveLength(24);
    expect(validateTacticalProject(expanded)).toEqual([]);

    const reduced = scaleActiveSquad(expanded, teamId, 5, placement(expanded));
    const reducedCounts = squadCounts(reduced, teamId);
    expect(reducedCounts).toMatchObject({ roster: 24, active: 5, substitute: 19 });
    expect(reduced.playerTokens).toHaveLength(24);
    expect(reduced.playerTokens.filter((token) => token.visible)).toHaveLength(5);
    expect(scaleActiveSquad(reduced, teamId, 5, placement(reduced))).toBe(reduced);
  });

  it('allows growth past the formation size and stops at the Pages-safe roster ceiling', () => {
    const start = trainingBoard();
    const teamId = start.teams[0]!.id;
    expect(MAX_ROSTER_PLAYERS_PER_TEAM).toBe(64);
    const atCeiling = scaleActiveSquad(start, teamId, MAX_ROSTER_PLAYERS_PER_TEAM, placement(start));
    expect(squadCounts(atCeiling, teamId).active).toBe(MAX_ROSTER_PLAYERS_PER_TEAM);
    expect(squadCounts(atCeiling, teamId).roster).toBe(MAX_ROSTER_PLAYERS_PER_TEAM);
    expect(() => scaleActiveSquad(start, teamId, MAX_ROSTER_PLAYERS_PER_TEAM + 1, placement(start))).toThrow(/64|ceiling|formation/i);
    expect(() => addSquadParticipant(atCeiling, teamId, {
      id: 'one-more',
      displayName: 'One more',
      status: 'neutral',
    })).toThrow(/64|ceiling|formation/i);
  });

  it('authors neutral and coach participants and keeps them out of active scaling', () => {
    const start = trainingBoard();
    const teamId = start.teams[0]!.id;
    const scene = placement(start);
    const withNeutral = addSquadParticipant(start, teamId, {
      id: 'neutral-1',
      displayName: 'Neutral server',
      status: 'neutral',
    }, { ...scene, position: { x: 0.5, y: 0.08 } });
    const withCoach = setRosterPlayerStatus(
      addSquadParticipant(withNeutral, teamId, {
        id: 'coach-1',
        displayName: 'Sideline coach',
        status: 'coach',
      }, { ...scene, position: { x: 0.5, y: 0.96 } }),
      teamId,
      'coach-1',
      'coach',
    );

    expect(squadCounts(withCoach, teamId)).toMatchObject({ active: 7, neutral: 1, coach: 1, roster: 9 });
    const scaled = scaleActiveSquad(withCoach, teamId, 8, scene);
    const counts = squadCounts(scaled, teamId);
    expect(counts.active).toBe(8);
    expect(counts.neutral).toBe(1);
    expect(counts.coach).toBe(1);
    expect(scaled.teams[0]!.roster.find((player) => player.id === 'neutral-1')?.status).toBe('neutral');
    expect(() => setRosterPlayerStatus(start, teamId, start.teams[0]!.roster[0]!.id, 'bench' as 'active')).toThrow(/status/i);
  });
});

describe('Normalized coordinate editing surface', () => {
  it('authors canonical positions from normalized units or pitch metres and rejects pixels', () => {
    const pitch = { lengthMeters: 60, widthMeters: 40 };
    const fromMetres = authorCanonicalCoordinate('meters', 30, 20, pitch);
    expect(fromMetres).toEqual({ x: 0.5, y: 0.5 });
    expect(readCanonicalCoordinate(fromMetres, pitch)).toMatchObject({
      x: 0.5,
      y: 0.5,
      xMeters: 30,
      yMeters: 20,
    });
    expect(authorCanonicalCoordinate('normalized', 0.25, 0.75, pitch)).toEqual({ x: 0.25, y: 0.75 });
    expect(() => authorCanonicalCoordinate('meters', 61, 20, pitch)).toThrow(/\[0, 1\]|pitch/i);
    expect(() => authorCanonicalCoordinate('normalized', 1.2, 0.2, pitch)).toThrow(/\[0, 1\]/);
  });

  it('writes ball, equipment, and official positions through the same normalized surface', () => {
    const start = trainingBoard();
    const scene = placement(start);
    const equipped = placeTrainingProp(start, 'cone', scene.sceneId, scene.layerId, { x: 0.2, y: 0.2 });
    const withOfficial = {
      ...equipped,
      officials: [
        ...equipped.officials,
        { id: 'official-1', role: 'Referee', sceneId: scene.sceneId, layerId: scene.layerId, position: { x: 0.1, y: 0.1 } },
      ],
    };
    const movedBall = authorEntityCoordinate(withOfficial, { kind: 'ball' }, authorCanonicalCoordinate('meters', 15, 10, withOfficial.pitch.dimensions));
    const movedProp = authorEntityCoordinate(movedBall, { kind: 'equipment', equipmentId: movedBall.equipment[0]!.id }, { x: 0.4, y: 0.6 });
    const movedOfficial = authorEntityCoordinate(movedProp, { kind: 'official', officialId: 'official-1' }, { x: 0.7, y: 0.3 });

    expect(movedOfficial.ball.position).toEqual({ x: 0.25, y: 0.25 });
    expect(movedOfficial.equipment[0]!.position).toEqual({ x: 0.4, y: 0.6 });
    expect(movedOfficial.officials[0]!.position).toEqual({ x: 0.7, y: 0.3 });
    expect(validateTacticalProject(movedOfficial)).toEqual([]);
  });
});

describe('Roster token editor', () => {
  it('edits jersey, role, kit, developmental tag, and avatar without changing the session plan', () => {
    const start = trainingBoard();
    const team = start.teams[0]!;
    const player = team.roster[0]!;
    const withMedia = {
      ...start,
      media: [{ id: 'avatar-1', name: 'portrait.png', mimeType: 'image/png', sizeBytes: 12 }],
      sessionPlan: { ...start.sessionPlan, ageOrDevelopmentLevel: 'U12 session' },
    };
    const edited = editRosterToken(withMedia, team.id, player.id, {
      displayName: 'A. Keeper',
      jerseyNumber: '1',
      role: 'Goalkeeper',
      status: 'active',
      ageOrDevelopmentTag: 'first-year keeper',
      avatarAssetId: 'avatar-1',
      primaryColor: '#0f766e',
      secondaryColor: '#fef3c7',
    });
    const nextPlayer = edited.teams[0]!.roster[0]!;
    expect(nextPlayer).toMatchObject({
      displayName: 'A. Keeper',
      jerseyNumber: '1',
      role: 'Goalkeeper',
      status: 'active',
      ageOrDevelopmentTag: 'first-year keeper',
      avatarAssetId: 'avatar-1',
    });
    expect(edited.teams[0]).toMatchObject({ primaryColor: '#0f766e', secondaryColor: '#fef3c7' });
    expect(edited.sessionPlan.ageOrDevelopmentLevel).toBe('U12 session');
    expect(() => editRosterToken(withMedia, team.id, player.id, { avatarAssetId: 'missing' })).toThrow(/avatar/i);
    expect(() => editRosterToken(withMedia, team.id, player.id, { primaryColor: 'blue' })).toThrow(/color/i);
  });
});

describe('Authored ball elevation trajectory', () => {
  it('stores elevation keyframes on the ball track and samples them independently of the resting ball elevation', () => {
    const start = trainingBoard();
    const grounded = authorBallElevationKeyframe(start, 0, 0);
    const lofted = authorBallElevationKeyframe(grounded, 1000, 8);
    const track = lofted.timeline.tracks.find((item) => item.targetId === 'ball');
    expect(track?.keyframes.map((keyframe) => [keyframe.timeMs, keyframe.elevationMeters])).toEqual([[0, 0], [1000, 8]]);
    expect(lofted.ball.elevationMeters).toBe(0);

    const midpoint = sampleTacticalProjectAtTime(lofted, 500);
    expect(midpoint.ball.elevationMeters).toBeCloseTo(4, 6);
    const samples = sampleBallElevationTrajectory(lofted, 500);
    expect(samples.map((sample) => sample.elevationMeters)).toEqual([0, 4, 8]);
    expect(samples[1]!.position).toEqual(start.ball.position);
    expect(lofted.videoReview.telestrations).toEqual([]);

    const svg = serializeTacticalBoardSvg(midpoint, midpoint.scenes[0]!.id);
    expect(svg).toContain('data-tactical-kind="elevation-trajectory"');
    expect(() => authorBallElevationKeyframe(start, 1000.4, 2)).toThrow(/integer/i);
    expect(() => authorBallElevationKeyframe(start, 0, -1)).toThrow(/non-negative|elevation/i);
  });
});

describe('Training prop library', () => {
  it('places a sourced non-authoritative prop and transforms it inside normalized bounds', () => {
    const cone = TRAINING_PROP_LIBRARY.find((item) => item.kind === 'cone');
    expect(cone?.provenance.authoritative).toBe(false);
    expect(cone?.provenance.kind).toBe('tool-default');

    const start = trainingBoard();
    const scene = placement(start);
    const placed = placeTrainingProp(start, 'cone', scene.sceneId, scene.layerId, { x: 0.3, y: 0.7 });
    const item = placed.equipment[0]!;
    expect(item.kind).toBe('cone');
    const transformed = transformEquipment(placed, item.id, { rotationDeg: 90, scale: 1.5, position: { x: 0.35, y: 0.65 } });
    expect(transformed.equipment[0]).toMatchObject({ rotationDeg: 90, scale: 1.5, position: { x: 0.35, y: 0.65 } });
    const svg = serializeTacticalBoardSvg(transformed, scene.sceneId);
    expect(svg).toContain('data-equipment-kind="cone"');
    expect(() => placeTrainingProp(start, 'laser-drone', scene.sceneId, scene.layerId, { x: 0.2, y: 0.2 })).toThrow(/prop/i);
    expect(() => transformEquipment(placed, item.id, { scale: 0 })).toThrow(/scale/i);
  });
});

describe('Precision snapping and tactical guides', () => {
  it('snaps to pitch guides, teammates, and equal spacing without moving a point outside range', () => {
    const start = trainingBoard();
    const sceneId = start.scenes[0]!.id;
    const guides = tacticalPitchGuides(start);
    expect(guides.some((guide) => guide.axis === 'x' && guide.value === 0.5)).toBe(true);

    const halfway = snapWithTacticalAssist(start, sceneId, { x: 0.48, y: 0.22 }, {
      threshold: 0.03,
      pitchGuides: true,
      teammateSnap: false,
      equalSpacing: false,
    });
    expect(halfway.point.x).toBe(0.5);
    expect(halfway.snappedX).toBe(true);

    const teammate = start.playerTokens[0]!;
    const aligned = snapWithTacticalAssist(start, sceneId, { x: teammate.position.x + 0.01, y: 0.9 }, {
      threshold: 0.03,
      pitchGuides: false,
      teammateSnap: true,
      equalSpacing: false,
      excludeTokenId: 'other',
    });
    expect(aligned.point.x).toBeCloseTo(teammate.position.x, 6);

    expect(equalSpacingGuides([0.2, 0.4])).toContain(0.6);
    const spacing = snapWithTacticalAssist(start, sceneId, { x: 0.58, y: 0.5 }, {
      threshold: 0.04,
      pitchGuides: false,
      teammateSnap: false,
      equalSpacing: true,
      spacingAnchors: [0.2, 0.4],
    });
    expect(spacing.point.x).toBeCloseTo(0.6, 6);
    expect(spacing.point.x).toBeLessThanOrEqual(1);
  });
});

describe('Presentation spotlight telestration', () => {
  it('authors time-ranged board marks that stay out of the video telestration document', () => {
    const start = trainingBoard();
    const scene = placement(start);
    const marked = addPresentationMark(start, {
      id: 'spot-1',
      kind: 'spotlight',
      sceneId: scene.sceneId,
      layerId: scene.layerId,
      points: [{ x: 0.4, y: 0.5 }],
      label: 'Press trigger',
      startMs: 0,
      endMs: 800,
    });
    expect(marked.videoReview.telestrations).toEqual([]);
    expect(marked.annotations[0]).toMatchObject({ kind: 'spotlight', label: 'Press trigger' });

    const visible = applyPresentationVisibility(marked, 400);
    const hidden = applyPresentationVisibility(marked, 900);
    expect(visible.annotations[0]!.visible).not.toBe(false);
    expect(hidden.annotations[0]!.visible).toBe(false);
    const svg = serializeTacticalBoardSvg(visible, scene.sceneId);
    expect(svg).toContain('data-annotation-kind="spotlight"');
    expect(serializeTacticalBoardSvg(hidden, scene.sceneId)).not.toContain('data-annotation-kind="spotlight"');
  });
});

describe('Onion-skin ghosts', () => {
  it('returns previous and next authored positions for the playhead without changing the canonical token', () => {
    const start = trainingBoard();
    const sceneId = start.scenes[0]!.id;
    const token = start.playerTokens[0]!;
    const atStart = recordOnionSkinKeyframe(start, sceneId, 0);
    const moved = movePlayerToken(atStart, token.id, { x: 0.8, y: 0.2 });
    const atEnd = recordOnionSkinKeyframe(moved, sceneId, 1000);
    const ghosts = onionSkinGhosts(atEnd, 500, sceneId);
    const mine = ghosts.filter((ghost) => ghost.tokenId === token.id);
    expect(mine.map((ghost) => ghost.relation).sort()).toEqual(['next', 'previous']);
    expect(mine.find((ghost) => ghost.relation === 'previous')!.position).toEqual(token.position);
    expect(mine.find((ghost) => ghost.relation === 'next')!.position).toEqual({ x: 0.8, y: 0.2 });
    expect(atEnd.playerTokens[0]!.position).toEqual({ x: 0.8, y: 0.2 });

    const svg = serializeTacticalBoardSvg(atEnd, sceneId, { ghosts });
    expect(svg).toContain('data-tactical-kind="ghost"');
  });
});

describe('Scenario comparison', () => {
  it('captures two board scenarios, diffs them in pitch metres, and reuses an unchanged comparison', () => {
    const start = trainingBoard();
    const sceneId = start.scenes[0]!.id;
    const token = start.playerTokens[0]!;
    const base = captureScenario(start, { id: 'base', label: 'Base shape', sceneId });
    const pressed = captureScenario(
      movePlayerToken(base, token.id, { x: Math.min(0.95, token.position.x + 0.1), y: token.position.y }),
      { id: 'press', label: 'Press', sceneId },
    );
    const first = compareScenarios(pressed, 'base', 'press');
    const second = compareScenarios(pressed, 'base', 'press');
    expect(second).toBe(first);
    expect(first.movedTokens.some((item) => item.tokenId === token.id && item.distanceMeters > 0)).toBe(true);
    expect(first.ballDistanceMeters).toBe(0);

    const changed = movePlayerToken(pressed, token.id, { x: 0.1, y: 0.1 });
    expect(compareScenarios(changed, 'base', 'press')).not.toBe(first);

    const mirrored = transformTacticalProject(pressed, 'horizontal');
    const mirroredToken = mirrored.scenarios.find((scenario) => scenario.id === 'base')!.tokenPositions[token.id]!;
    expect(mirroredToken.x).toBeCloseTo(1 - token.position.x, 6);

    const exported = exportTacticalProjectJson(pressed);
    const parsed = JSON.parse(exported) as TacticalProject;
    delete (parsed as { scenarios?: unknown }).scenarios;
    const imported = importTacticalProjectJson(JSON.stringify(parsed), 'legacy-v2.json');
    expect(imported.scenarios).toEqual([]);
    expect(validateTacticalProject(createStarterTacticalProject())).toEqual([]);
  });
});

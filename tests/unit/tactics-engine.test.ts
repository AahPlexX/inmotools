import { describe, expect, it } from 'vitest';
import { TOOL_BY_SLUG } from '../../src/catalog';
import { serializeTacticalBoardSvg } from '../../src/tools/tactics/board-engine';
import {
  addTacticalArrow,
  buildBeginnerTacticalProject,
  clientPointToNormalized,
  nudgeNormalizedPoint,
} from '../../src/tools/tactics/workspace-engine';
import {
  addAnnotation,
  addEquipment,
  addPlayerToken,
  addRosterPlayer,
  addTeam,
  commitTacticalProject,
  createTacticalHistory,
  movePlayerToken,
  redoTacticalProject,
  setSceneLayerState,
  undoTacticalProject,
} from '../../src/tools/tactics/editor-engine';
import {
  createStarterTacticalProject,
  TACTICS_SCHEMA_VERSION,
  validateTacticalProject,
} from '../../src/tools/tactics/tactics-engine';
import {
  createNormalizedPoint,
  metersToNormalized,
  mirrorHorizontal,
  mirrorVertical,
  normalizedToMeters,
  snapNormalizedPoint,
  trainingFormatProfiles,
  transformTacticalProject,
} from '../../src/tools/tactics/pitch-engine';
import {
  createCustomFormationTemplate,
  captureFormationPhase,
  FORMATION_TEMPLATES,
  getFormationTemplate,
  materializeFormationPositions,
  morphFormationPhases,
  reviewFormationLegality,
  validateFormationTemplate,
} from '../../src/tools/tactics/formation-engine';
import {
  PITCH_RULE_PROFILES,
  applyPitchRuleProfile,
  createEditablePitchRuleProfileCopy,
  createCustomPitchRuleProfile,
  getPitchRuleProfile,
} from '../../src/tools/tactics/rules-engine';
import {
  RESTART_TEMPLATES,
  applyRestartTemplate,
  createCustomRestartTemplate,
  reviewRestartLegality,
} from '../../src/tools/tactics/restart-engine';

describe('Tactical Matchboard foundation contracts', () => {
  it('keeps canonical pitch coordinates normalized and round-trips physical metres', () => {
    const pitch = { lengthMeters: 105, widthMeters: 68 };
    const point = createNormalizedPoint(0.25, 0.75);
    const metres = normalizedToMeters(point, pitch);
    expect(metres).toEqual({ xMeters: 26.25, yMeters: 51 });
    expect(metersToNormalized(metres, pitch)).toEqual(point);

    expect(() => createNormalizedPoint(-0.001, 0.5)).toThrow(/\[0, 1\]/);
    expect(() => createNormalizedPoint(0.5, 1.001)).toThrow(/\[0, 1\]/);
    expect(() => normalizedToMeters(point, { lengthMeters: 0, widthMeters: 68 })).toThrow(/positive/);
  });

  it('mirrors normalized geometry without leaving canonical bounds', () => {
    const point = createNormalizedPoint(0.2, 0.7);
    expect(mirrorHorizontal(point)).toEqual({ x: 0.8, y: 0.7 });
    expect(mirrorVertical(point)).toEqual({ x: 0.2, y: 0.3 });
  });

  it('snaps to the nearest eligible grid or tactical guide inside threshold', () => {
    const result = snapNormalizedPoint(
      createNormalizedPoint(0.247, 0.503),
      {
        gridStep: 0.05,
        xGuides: [0.25, 0.5],
        yGuides: [0.5],
        threshold: 0.01,
      },
    );
    expect(result.point).toEqual({ x: 0.25, y: 0.5 });
    expect(result.snappedX).toBe(true);
    expect(result.snappedY).toBe(true);

    const untouched = snapNormalizedPoint(
      createNormalizedPoint(0.237, 0.517),
      { gridStep: 0.05, xGuides: [0.5], yGuides: [0.5], threshold: 0.005 },
    );
    expect(untouched.point).toEqual({ x: 0.237, y: 0.517 });
  });

  it('keeps generic training format profiles editable and non-authoritative', () => {
    expect(trainingFormatProfiles.map((profile) => profile.teamSize)).toEqual(
      expect.arrayContaining([1, 2, 3, 4, 5, 7, 9, 11]),
    );
    for (const profile of trainingFormatProfiles) {
      expect(profile.editable).toBe(true);
      expect(profile.provenance.kind).toBe('tool-default');
      expect(profile.provenance.authoritative).toBe(false);
    }
  });

  it('validates every built-in formation total and goalkeeper notation', () => {
    expect(FORMATION_TEMPLATES.length).toBeGreaterThanOrEqual(11);
    for (const template of FORMATION_TEMPLATES) {
      expect(validateFormationTemplate(template)).toEqual([]);
      const outfield = template.outfieldLines.reduce((sum, count) => sum + count, 0);
      expect(template.goalkeepers + outfield).toBe(template.teamSize);
      if (template.goalkeepers > 0) {
        expect(template.notationIncludesGoalkeeper).toBe(true);
        expect(template.notation.startsWith(`${template.goalkeepers}-`)).toBe(true);
      }
    }
  });



  it('materializes editable normalized starter positions with direction mirroring', () => {
    const template = getFormationTemplate('ussf-7v7-1-3-2-1');
    expect(template).toBeDefined();
    const forward = materializeFormationPositions(template!, 'left-to-right');
    const reverse = materializeFormationPositions(template!, 'right-to-left');

    expect(forward).toHaveLength(7);
    expect(reverse).toHaveLength(7);
    for (let index = 0; index < forward.length; index += 1) {
      expect(forward[index]!.x).toBeGreaterThanOrEqual(0);
      expect(forward[index]!.x).toBeLessThanOrEqual(1);
      expect(forward[index]!.y).toBeGreaterThanOrEqual(0);
      expect(forward[index]!.y).toBeLessThanOrEqual(1);
      expect(reverse[index]!.x).toBeCloseTo(1 - forward[index]!.x, 12);
      expect(reverse[index]!.y).toBe(forward[index]!.y);
    }
  });

  it('encodes the current U.S. Soccer development examples as recommendations, not mandates', () => {
    const four = getFormationTemplate('ussf-4v4-1-2-1');
    const seven = getFormationTemplate('ussf-7v7-1-3-2-1');
    const nine = getFormationTemplate('ussf-9v9-1-3-2-3');
    const eleven = getFormationTemplate('ussf-11v11-1-4-3-3');

    expect(four).toMatchObject({
      teamSize: 4,
      goalkeepers: 0,
      outfieldLines: [1, 2, 1],
      notation: '1-2-1',
      notationIncludesGoalkeeper: false,
    });
    expect(seven).toMatchObject({ teamSize: 7, goalkeepers: 1, outfieldLines: [3, 2, 1] });
    expect(nine).toMatchObject({ teamSize: 9, goalkeepers: 1, outfieldLines: [3, 2, 3] });
    expect(eleven).toMatchObject({ teamSize: 11, goalkeepers: 1, outfieldLines: [4, 3, 3] });

    for (const template of [four, seven, nine, eleven]) {
      expect(template?.provenance?.kind).toBe('recommendation');
      expect(template?.provenance?.organization).toBe('U.S. Soccer');
      expect(template?.provenance?.authoritative).toBe(false);
      expect(template?.provenance?.sourceDate).toBe('2026-09-21');
    }
  });

  it('keeps governing pitch profiles provenance-bearing and custom profiles editable', () => {
    const ifab = getPitchRuleProfile('ifab-11v11-international-2026-27');
    expect(ifab).toMatchObject({
      teamSize: 11,
      editable: false,
      dimensions: { lengthMeters: 105, widthMeters: 68 },
      dimensionRange: {
        minLengthMeters: 100,
        maxLengthMeters: 110,
        minWidthMeters: 64,
        maxWidthMeters: 75,
      },
      goalDimensions: { widthMeters: 7.32, heightMeters: 2.44 },
      provenance: {
        kind: 'governing-source',
        authoritative: true,
        organization: 'The IFAB',
        sourceVersion: '2026/27',
      },
    });
    expect(PITCH_RULE_PROFILES.some((profile) => profile.format === 'futsal')).toBe(true);

    const custom = createCustomPitchRuleProfile({
      id: '  academy-6v6  ',
      label: ' Academy 6v6 ',
      format: '6v6',
      teamSize: 6,
      dimensions: { lengthMeters: 48, widthMeters: 32 },
      specialLines: [' Build-out line ', 'Build-out line'],
      restartNotes: [' Retreat to the build-out line. '],
    });
    expect(custom).toMatchObject({
      id: 'academy-6v6',
      label: 'Academy 6v6',
      editable: true,
      provenance: { kind: 'custom', authoritative: false },
    });
    expect(custom.specialLines).toEqual(['Build-out line']);
    expect(() => createCustomPitchRuleProfile({
      id: 'bad',
      label: 'Bad',
      format: '0v0',
      teamSize: 0,
      dimensions: { lengthMeters: 0, widthMeters: 20 },
    })).toThrow(/team size|pitch length/i);

    const editableCopy = createEditablePitchRuleProfileCopy(ifab!, {
      id: 'local-ifab-copy',
      label: 'Local IFAB copy',
    });
    expect(editableCopy).toMatchObject({
      id: 'local-ifab-copy',
      label: 'Local IFAB copy',
      editable: true,
      provenance: {
        kind: 'custom',
        authoritative: false,
        organization: 'The IFAB',
        sourceVersion: '2026/27',
      },
    });
  });

  it('applies pitch profiles with deterministic normalized specialty overlays', () => {
    const project = applyPitchRuleProfile(createStarterTacticalProject(), 'ifab-11v11-international-2026-27');
    expect(project.ruleset.id).toBe('ifab-11v11-international-2026-27');
    expect(project.pitch.profileId).toBe(project.ruleset.id);
    expect(project.pitch.dimensions).toEqual({ lengthMeters: 105, widthMeters: 68 });
    expect(project.pitch.overlays.map((overlay) => overlay.id)).toEqual([
      'ifab-halfway-line',
      'ifab-left-penalty-area',
      'ifab-right-penalty-area',
    ]);
    expect(project.pitch.overlays.every((overlay) => overlay.points.every((point) => (
      point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1
    )))).toBe(true);
    expect(validateTacticalProject(project)).toEqual([]);

    const grassroots = applyPitchRuleProfile(createStarterTacticalProject(), 'ussf-pdi-7v7-2017');
    expect(grassroots.ruleset).toMatchObject({
      teamSize: 7,
      ageGroup: 'U-9 to U-10',
      provenance: {
        organization: 'U.S. Soccer',
        sourceVersion: '2017 PDI',
      },
    });
    expect(grassroots.pitch.overlays.map((overlay) => overlay.id)).toEqual([
      'ussf-left-build-out-line',
      'ussf-right-build-out-line',
    ]);
    expect(grassroots.pitch.overlays[0]?.points[0]?.x).toBeCloseTo(12.8016 / 105, 12);
  });

  it('mirrors the complete authored board while preserving the prior project', () => {
    const start = applyRestartTemplate(
      buildBeginnerTacticalProject({
        title: 'Transform board',
        teamName: 'Blue',
        primaryColor: '#154c79',
        secondaryColor: '#ffffff',
        formationId: 'ussf-4v4-1-2-1',
        pitchDimensions: { lengthMeters: 40, widthMeters: 30 },
        direction: 'left-to-right',
      }),
      'scene-1',
      'layer-1',
      'tool-corner-left',
    );
    const mirrored = transformTacticalProject(start, 'horizontal');
    expect(mirrored.pitch.direction).toBe('right-to-left');
    expect(mirrored.playerTokens[0]?.position.x).toBeCloseTo(1 - start.playerTokens[0]!.position.x, 12);
    expect(mirrored.ball.position).toEqual({ x: 0.98, y: 0.02 });
    expect(mirrored.annotations[0]?.points[0]).toEqual({ x: 0.98, y: 0.02 });
    expect(start.pitch.direction).toBe('left-to-right');
    expect(start.ball.position).toEqual({ x: 0.02, y: 0.02 });
    expect(validateTacticalProject(mirrored)).toEqual([]);

    const flipped = transformTacticalProject(start, 'vertical');
    expect(flipped.pitch.direction).toBe(start.pitch.direction);
    expect(flipped.playerTokens[0]?.position.y).toBeCloseTo(1 - start.playerTokens[0]!.position.y, 12);
    expect(flipped.ball.position).toEqual({ x: 0.02, y: 0.98 });
    expect(flipped.annotations[0]?.points[0]).toEqual({ x: 0.02, y: 0.98 });
    expect(validateTacticalProject(flipped)).toEqual([]);
  });

  it('captures and deterministically morphs editable formation phases', () => {
    const start = buildBeginnerTacticalProject({
      title: 'Phase morph',
      teamName: 'Blue',
      primaryColor: '#154c79',
      secondaryColor: '#ffffff',
      formationId: 'ussf-4v4-1-2-1',
      pitchDimensions: { lengthMeters: 40, widthMeters: 30 },
      direction: 'left-to-right',
    });
    const token = start.playerTokens[0]!;
    const withBase = captureFormationPhase(start, {
      id: 'phase-base',
      label: 'Base shape',
      teamId: token.teamId,
      timeMs: 0,
    });
    const moved = movePlayerToken(withBase, token.id, { x: 0.8, y: 0.2 });
    const withTarget = captureFormationPhase(moved, {
      id: 'phase-target',
      label: 'Pressing shape',
      teamId: token.teamId,
      timeMs: 1_000,
    });
    const morphed = morphFormationPhases(withTarget, 'phase-base', 'phase-target', 0.5);
    expect(morphed.playerTokens[0]?.position).toEqual({
      x: Number(((token.position.x + 0.8) / 2).toFixed(12)),
      y: Number(((token.position.y + 0.2) / 2).toFixed(12)),
    });
    expect(withTarget.formationStates).toHaveLength(2);
    expect(() => morphFormationPhases(withTarget, 'phase-base', 'phase-target', 1.1)).toThrow(/progress/i);
  });

  it('authors custom formations and reports assignment legality without claiming a governing decision', () => {
    const formation = createCustomFormationTemplate({
      id: 'academy-8v8',
      label: 'Academy 8v8',
      teamSize: 8,
      goalkeepers: 1,
      outfieldLines: [3, 3, 1],
    });
    expect(formation).toMatchObject({
      notation: '1-3-3-1',
      notationIncludesGoalkeeper: true,
      provenance: { kind: 'custom', authoritative: false },
    });
    expect(validateFormationTemplate(formation)).toEqual([]);
    const customProject = buildBeginnerTacticalProject({
      title: 'Custom formation',
      teamName: 'Blue',
      primaryColor: '#154c79',
      secondaryColor: '#ffffff',
      formationId: formation.id,
      pitchDimensions: { lengthMeters: 70, widthMeters: 50 },
      direction: 'left-to-right',
    }, formation);
    expect(customProject.playerTokens).toHaveLength(8);
    expect(customProject.ruleset.teamSize).toBe(8);
    expect(() => createCustomFormationTemplate({
      id: 'bad',
      label: 'Bad',
      teamSize: 8,
      goalkeepers: 1,
      outfieldLines: [3, 3],
    })).toThrow(/player total/i);

    const project = buildBeginnerTacticalProject({
      title: 'Legality aid',
      teamName: 'Blue',
      primaryColor: '#154c79',
      secondaryColor: '#ffffff',
      formationId: 'ussf-7v7-1-3-2-1',
      pitchDimensions: { lengthMeters: 60, widthMeters: 40 },
      direction: 'left-to-right',
    });
    expect(reviewFormationLegality(project, getFormationTemplate('ussf-7v7-1-3-2-1')!)).toEqual([]);
    expect(reviewFormationLegality({ ...project, playerTokens: project.playerTokens.slice(1) }, getFormationTemplate('ussf-7v7-1-3-2-1')!))
      .toContainEqual(expect.stringMatching(/expects 7 placed players/i));
  });

  it('applies provenance-bearing restart templates without mutating the prior project', () => {
    const start = createStarterTacticalProject();
    const corner = RESTART_TEMPLATES.find((template) => template.id === 'tool-corner-left');
    expect(corner).toMatchObject({ provenance: { authoritative: false } });
    const applied = applyRestartTemplate(start, 'scene-1', 'layer-1', 'tool-corner-left');
    expect(start.annotations).toEqual([]);
    expect(start.ball.position).toEqual({ x: 0.5, y: 0.5 });
    expect(applied.ball.position).toEqual({ x: 0.02, y: 0.02 });
    expect(applied.annotations).toContainEqual(expect.objectContaining({
      kind: 'restart-guide',
      label: 'Corner attacking route',
    }));
    expect(validateTacticalProject(applied)).toEqual([]);

    const custom = createCustomRestartTemplate({
      id: 'academy-goal-kick',
      label: 'Academy goal-kick build',
      kind: 'goal-kick',
      ballPosition: { x: 0.08, y: 0.5 },
      guideLabel: 'Build-out route',
      guidePoints: [{ x: 0.08, y: 0.5 }, { x: 0.3, y: 0.25 }],
    });
    expect(custom.provenance).toMatchObject({ kind: 'custom', authoritative: false });
    expect(applyRestartTemplate(start, 'scene-1', 'layer-1', custom).annotations[0]?.label).toBe('Build-out route');
    expect(() => createCustomRestartTemplate({
      id: 'bad',
      label: 'Bad',
      kind: 'free-kick',
      ballPosition: { x: -0.1, y: 0.5 },
      guideLabel: 'Bad route',
      guidePoints: [{ x: 0.2, y: 0.2 }],
    })).toThrow(/normalized|two points/i);
  });

  it('reviews sourced restart placement and opponent-distance constraints as authoring aids', () => {
    let project = applyPitchRuleProfile(createStarterTacticalProject(), 'ifab-11v11-international-2026-27');
    project = addTeam(project, {
      id: 'home',
      name: 'Home',
      primaryColor: '#154c79',
      secondaryColor: '#ffffff',
      roster: [],
    });
    project = addTeam(project, {
      id: 'away',
      name: 'Away',
      primaryColor: '#9f1239',
      secondaryColor: '#ffffff',
      roster: [],
    });
    project = addRosterPlayer(project, 'away', {
      id: 'away-1',
      displayName: 'Opponent',
      role: 'Defender',
      status: 'active',
    });
    project = addPlayerToken(project, {
      id: 'away-token-1',
      teamId: 'away',
      playerId: 'away-1',
      sceneId: 'scene-1',
      layerId: 'layer-1',
      position: { x: 0.04, y: 0.04 },
      rotationDeg: 0,
      visible: true,
      locked: false,
    });

    const corner = RESTART_TEMPLATES.find((template) => template.id === 'tool-corner-left')!;
    const issues = reviewRestartLegality(project, corner, 'home');
    expect(issues.map((issue) => issue.code)).toContain('corner-ball-outside-area');
    expect(issues.map((issue) => issue.code)).toContain('opponent-distance');
    expect(issues.every((issue) => issue.source.authoritative)).toBe(true);

    const kickoff = createCustomRestartTemplate({
      id: 'bad-kickoff',
      label: 'Bad kick-off',
      kind: 'kick-off',
      ballPosition: { x: 0.4, y: 0.5 },
      guideLabel: 'First pass',
      guidePoints: [{ x: 0.4, y: 0.5 }, { x: 0.3, y: 0.5 }],
    });
    expect(reviewRestartLegality(project, kickoff, 'home').map((issue) => issue.code))
      .toContain('kickoff-ball-not-centered');
  });

  it('rejects out-of-range coordinates across pitch overlays and annotations', () => {
    const project = createStarterTacticalProject();
    project.pitch.overlays.push({
      id: 'bad-zone',
      kind: 'zone',
      label: 'Bad zone',
      points: [{ x: -0.1, y: 0.5 }],
    });
    project.annotations.push({
      id: 'bad-annotation',
      kind: 'arrow',
      points: [{ x: 0.5, y: 1.1 }],
    });

    const errors = validateTacticalProject(project);
    expect(errors).toContainEqual(expect.stringMatching(/bad-zone.*normalized/i));
    expect(errors).toContainEqual(expect.stringMatching(/bad-annotation.*normalized/i));
  });

  it('creates a schema-versioned starter project with integer time and normalized scene state', () => {
    const project = createStarterTacticalProject();
    expect(project.schemaVersion).toBe(TACTICS_SCHEMA_VERSION);
    expect(project.scenes).toHaveLength(1);
    expect(project.timeline.playheadMs).toBe(0);
    expect(Number.isInteger(project.timeline.playheadMs)).toBe(true);
    expect(project.pitch.dimensions).toEqual({ lengthMeters: 105, widthMeters: 68 });
    expect(validateTacticalProject(project)).toEqual([]);

    project.scenes[0]!.objects.push({
      id: 'bad-player',
      kind: 'player',
      layerId: project.scenes[0]!.layers[0]!.id,
      position: { x: 1.2, y: 0.5 },
      rotationDeg: 0,
      visible: true,
      locked: false,
    });
    expect(validateTacticalProject(project)).toContainEqual(
      expect.stringMatching(/bad-player.*normalized/i),
    );
  });

  it('binds spatial entities to a scene layer and prevents edits through a locked layer', () => {
    let project = addTeam(createStarterTacticalProject(), {
      id: 'home',
      name: 'Home',
      primaryColor: '#154c79',
      secondaryColor: '#ffffff',
      roster: [],
    });
    project = addRosterPlayer(project, 'home', {
      id: 'p8',
      displayName: 'Player 8',
      status: 'active',
    });
    project = addPlayerToken(project, {
      id: 'token-p8',
      playerId: 'p8',
      teamId: 'home',
      sceneId: 'scene-1',
      layerId: 'layer-1',
      position: { x: 0.5, y: 0.5 },
      rotationDeg: 0,
      visible: true,
      locked: false,
    });
    project = setSceneLayerState(project, 'scene-1', 'layer-1', { locked: true });

    expect(() => movePlayerToken(project, 'token-p8', { x: 0.6, y: 0.5 })).toThrow(/layer.*locked/i);
    expect(() => addAnnotation(project, {
      id: 'locked-arrow',
      kind: 'arrow',
      sceneId: 'scene-1',
      layerId: 'layer-1',
      points: [{ x: 0.5, y: 0.5 }, { x: 0.6, y: 0.5 }],
    })).toThrow(/layer.*locked/i);
  });


  it('rejects spatial entities that reference missing scenes or layers during project validation', () => {
    const project = createStarterTacticalProject();
    project.playerTokens.push({
      id: 'orphan-token',
      playerId: 'p1',
      teamId: 'home',
      sceneId: 'missing-scene',
      layerId: 'missing-layer',
      position: { x: 0.5, y: 0.5 },
      rotationDeg: 0,
      visible: true,
      locked: false,
    });
    project.annotations.push({
      id: 'orphan-arrow',
      kind: 'arrow',
      sceneId: 'scene-1',
      layerId: 'missing-layer',
      points: [{ x: 0.4, y: 0.5 }, { x: 0.6, y: 0.5 }],
    });

    const errors = validateTacticalProject(project);
    expect(errors).toContainEqual(expect.stringMatching(/orphan-token.*missing scene/i));
    expect(errors).toContainEqual(expect.stringMatching(/orphan-arrow.*missing layer/i));
  });

});

describe('Tactical Matchboard immutable editor contracts', () => {
  it('commits, undoes and redoes project edits with bounded history', () => {
    let history = createTacticalHistory(createStarterTacticalProject());
    history = commitTacticalProject(history, 'title A', (project) => ({
      ...project,
      metadata: { ...project.metadata, title: 'A' },
    }));
    expect(history.present.metadata.title).toBe('A');

    const undone = undoTacticalProject(history);
    expect(undone.present.metadata.title).toBe('Untitled tactical project');

    const redone = redoTacticalProject(undone);
    expect(redone.present.metadata.title).toBe('A');

    let bounded = createTacticalHistory(createStarterTacticalProject());
    for (let index = 0; index < 110; index += 1) {
      bounded = commitTacticalProject(bounded, `edit ${index}`, (project) => ({
        ...project,
        metadata: { ...project.metadata, title: `Project ${index}` },
      }));
    }
    expect(bounded.past).toHaveLength(100);
    expect(bounded.present.metadata.title).toBe('Project 109');
  });

  it('adds a team, roster player and scene token without mutating prior project state', () => {
    const start = createStarterTacticalProject();
    const withTeam = addTeam(start, {
      id: 'home',
      name: 'Home',
      primaryColor: '#154c79',
      secondaryColor: '#ffffff',
      roster: [],
    });
    const withPlayer = addRosterPlayer(withTeam, 'home', {
      id: 'p9',
      displayName: 'Player 9',
      jerseyNumber: '9',
      role: 'Striker',
      status: 'active',
    });
    const withToken = addPlayerToken(withPlayer, {
      id: 'token-p9',
      playerId: 'p9',
      teamId: 'home',
      sceneId: 'scene-1',
      layerId: 'layer-1',
      position: { x: 0.7, y: 0.5 },
      rotationDeg: 0,
      visible: true,
      locked: false,
    });

    expect(start.teams).toHaveLength(0);
    expect(withTeam.teams[0]?.roster).toHaveLength(0);
    expect(withPlayer.teams[0]?.roster[0]?.displayName).toBe('Player 9');
    expect(withToken.playerTokens[0]?.position).toEqual({ x: 0.7, y: 0.5 });
  });

  it('rejects invalid token placement and keeps roster/team relationships valid', () => {
    const project = addTeam(createStarterTacticalProject(), {
      id: 'home',
      name: 'Home',
      primaryColor: '#154c79',
      secondaryColor: '#ffffff',
      roster: [],
    });

    expect(() => addPlayerToken(project, {
      id: 'orphan',
      playerId: 'missing',
      teamId: 'home',
      sceneId: 'scene-1',
      layerId: 'layer-1',
      position: { x: 0.5, y: 0.5 },
      rotationDeg: 0,
      visible: true,
      locked: false,
    })).toThrow(/roster player/i);

    expect(() => movePlayerToken({
      ...project,
      playerTokens: [{
        id: 'token',
        playerId: 'missing',
        teamId: 'home',
        sceneId: 'scene-1',
        layerId: 'layer-1',
        position: { x: 0.5, y: 0.5 },
        rotationDeg: 0,
        visible: true,
        locked: false,
      }],
    }, 'token', { x: 1.1, y: 0.5 })).toThrow(/normalized/i);
  });

  it('adds validated equipment and annotations, and honors layer locking', () => {
    const start = createStarterTacticalProject();
    const equipped = addEquipment(start, {
      id: 'cone-1',
      kind: 'cone',
      sceneId: 'scene-1',
      layerId: 'layer-1',
      position: { x: 0.25, y: 0.25 },
      rotationDeg: 0,
      scale: 1,
      visible: true,
      locked: false,
    });
    const annotated = addAnnotation(equipped, {
      id: 'arrow-1',
      kind: 'arrow',
      label: 'Run',
      sceneId: 'scene-1',
      layerId: 'layer-1',
      points: [{ x: 0.4, y: 0.5 }, { x: 0.7, y: 0.5 }],
    });
    const locked = setSceneLayerState(annotated, 'scene-1', 'layer-1', { locked: true });

    expect(locked.equipment).toHaveLength(1);
    expect(locked.annotations).toHaveLength(1);
    expect(locked.scenes[0]?.layers[0]?.locked).toBe(true);
    expect(() => addEquipment(start, {
      id: 'bad-cone',
      kind: 'cone',
      sceneId: 'scene-1',
      layerId: 'layer-1',
      position: { x: -0.1, y: 0.25 },
      rotationDeg: 0,
      scale: 1,
      visible: true,
      locked: false,
    })).toThrow(/normalized/i);
  });
});


describe('Tactical Matchboard SVG board contracts', () => {
  function populatedProject() {
    let project = createStarterTacticalProject();
    project.metadata.title = 'Build & press <session>';
    project = addTeam(project, {
      id: 'home',
      name: 'Home',
      primaryColor: '#154c79',
      secondaryColor: '#ffffff',
      roster: [],
    });
    project = addRosterPlayer(project, 'home', {
      id: 'p9',
      displayName: 'Player <9>',
      jerseyNumber: '9',
      status: 'active',
    });
    project = addPlayerToken(project, {
      id: 'token-p9',
      playerId: 'p9',
      teamId: 'home',
      sceneId: 'scene-1',
      layerId: 'layer-1',
      position: { x: 0.5, y: 0.5 },
      rotationDeg: 0,
      visible: true,
      locked: false,
    });
    project = addAnnotation(project, {
      id: 'arrow-1',
      kind: 'arrow',
      label: 'Press > switch',
      sceneId: 'scene-1',
      layerId: 'layer-1',
      points: [{ x: 0.5, y: 0.5 }, { x: 0.75, y: 0.35 }],
    });
    return project;
  }

  it('serializes a deterministic vector board with escaped metadata and normalized geometry', () => {
    const svg = serializeTacticalBoardSvg(populatedProject(), 'scene-1');

    expect(svg).toContain('viewBox="0 0 1000 647.619"');
    expect(svg).toContain('>Build &amp; press &lt;session&gt;</title>');
    expect(svg).toContain('id="token-p9"');
    expect(svg).toContain('transform="translate(500 323.81) rotate(0)"');
    expect(svg).toContain('tactical-arrowhead');
    expect(svg).toContain('Player &lt;9&gt;');
    expect(svg).not.toContain('<script');
    expect(svg).not.toContain('onload=');
  });

  it('omits entities on hidden layers without deleting project state', () => {
    const project = setSceneLayerState(populatedProject(), 'scene-1', 'layer-1', { visible: false });
    const svg = serializeTacticalBoardSvg(project, 'scene-1');

    expect(project.playerTokens).toHaveLength(1);
    expect(project.annotations).toHaveLength(1);
    expect(svg).not.toContain('id="token-p9"');
    expect(svg).not.toContain('id="arrow-1"');
  });

  it('rejects an unknown scene instead of exporting an ambiguous board', () => {
    expect(() => serializeTacticalBoardSvg(populatedProject(), 'missing-scene')).toThrow(/scene/i);
  });
});


describe('Tactical Matchboard beginner workspace contracts', () => {
  it('builds a coherent formation project with roster, tokens, ruleset, pitch and direction', () => {
    const project = buildBeginnerTacticalProject({
      title: '7v7 build-out',
      teamName: 'Blue',
      primaryColor: '#154c79',
      secondaryColor: '#ffffff',
      formationId: 'ussf-7v7-1-3-2-1',
      pitchDimensions: { lengthMeters: 60, widthMeters: 40 },
      direction: 'left-to-right',
    });
    const expected = materializeFormationPositions(
      getFormationTemplate('ussf-7v7-1-3-2-1')!,
      'left-to-right',
    );

    expect(project.metadata.title).toBe('7v7 build-out');
    expect(project.pitch.dimensions).toEqual({ lengthMeters: 60, widthMeters: 40 });
    expect(project.pitch.direction).toBe('left-to-right');
    expect(project.ruleset.teamSize).toBe(7);
    expect(project.teams).toHaveLength(1);
    expect(project.teams[0]?.name).toBe('Blue');
    expect(project.teams[0]?.roster).toHaveLength(7);
    expect(project.playerTokens).toHaveLength(7);
    expect(project.playerTokens.map((token) => token.position)).toEqual(expected);
    expect(validateTacticalProject(project)).toEqual([]);
  });

  it('maps client coordinates to clamped normalized pitch coordinates', () => {
    const rect = { left: 100, top: 50, width: 400, height: 200 };
    expect(clientPointToNormalized({ clientX: 300, clientY: 150 }, rect)).toEqual({ x: 0.5, y: 0.5 });
    expect(clientPointToNormalized({ clientX: 25, clientY: 400 }, rect)).toEqual({ x: 0, y: 1 });
    expect(() => clientPointToNormalized({ clientX: 100, clientY: 50 }, { ...rect, width: 0 })).toThrow(/positive/i);
  });

  it('nudges a selected player precisely while clamping to the pitch', () => {
    expect(nudgeNormalizedPoint({ x: 0.99, y: 0.01 }, 0.02, -0.02)).toEqual({ x: 1, y: 0 });
    expect(nudgeNormalizedPoint({ x: 0.5, y: 0.5 }, -0.025, 0.04)).toEqual({ x: 0.475, y: 0.54 });
  });

  it('adds deterministic non-zero tactical arrows without id collisions', () => {
    let project = buildBeginnerTacticalProject({
      title: 'Arrow test',
      teamName: 'Blue',
      primaryColor: '#154c79',
      secondaryColor: '#ffffff',
      formationId: 'ussf-4v4-1-2-1',
      pitchDimensions: { lengthMeters: 40, widthMeters: 30 },
      direction: 'left-to-right',
    });
    project = addTacticalArrow(project, 'scene-1', 'layer-1', { x: 0.2, y: 0.4 }, { x: 0.6, y: 0.4 }, 'Run');
    project = addTacticalArrow(project, 'scene-1', 'layer-1', { x: 0.6, y: 0.4 }, { x: 0.8, y: 0.2 });

    expect(project.annotations.map((annotation) => annotation.id)).toEqual(['arrow-1', 'arrow-2']);
    expect(project.annotations[0]).toMatchObject({ kind: 'arrow', label: 'Run' });
    expect(() => addTacticalArrow(project, 'scene-1', 'layer-1', { x: 0.4, y: 0.4 }, { x: 0.4, y: 0.4 })).toThrow(/different/i);
  });
});
describe('Tactical Matchboard registration contract', () => {
  it('publishes one coherent catalog entry for the validated beginner slice', () => {
    const tool = TOOL_BY_SLUG.get('tactical-matchboard-studio');
    expect(tool).toMatchObject({
      slug: 'tactical-matchboard-studio',
      shortTitle: 'Tactical Matchboard Studio',
    });
    expect(tool?.privacy).toMatch(/browser|device/i);
    expect(tool?.outputs).toMatch(/SVG/i);
  });
});

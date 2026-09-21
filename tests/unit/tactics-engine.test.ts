import { describe, expect, it } from 'vitest';
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
} from '../../src/tools/tactics/pitch-engine';
import {
  FORMATION_TEMPLATES,
  getFormationTemplate,
  validateFormationTemplate,
} from '../../src/tools/tactics/formation-engine';

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
});

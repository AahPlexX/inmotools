import { describe, expect, it } from 'vitest';
import { resolveTacticalShortcut } from '../../src/tools/tactics/accessibility-engine';
import { serializeTacticalBoardSvg } from '../../src/tools/tactics/board-engine';
import { addTimelineKeyframe, addTimelineTrack } from '../../src/tools/tactics/timeline-engine';
import { displayPitchOverlays, fittedTrainingMarkings } from '../../src/tools/tactics/pitch-engine';
import { applyPitchRuleProfile } from '../../src/tools/tactics/rules-engine';
import { createStarterTacticalProject, validateTacticalProject } from '../../src/tools/tactics/tactics-engine';
import {
  OPPOSITION_TEAM_ID,
  addTacticalArrow,
  buildBeginnerTacticalProject,
  placeMirroredOpposition,
  removeTacticalAnnotation,
} from '../../src/tools/tactics/workspace-engine';

const beginner = () => buildBeginnerTacticalProject({
  title: 'Audit board',
  teamName: 'Blue',
  primaryColor: '#154c79',
  secondaryColor: '#ffffff',
  formationId: 'ussf-4v4-1-2-1',
  pitchDimensions: { lengthMeters: 40, widthMeters: 30 },
  direction: 'left-to-right',
});

describe('tactical production audit', () => {
  it('fits full-size training markings on a 105 by 68 pitch and shrinks them on a small pitch', () => {
    const full = fittedTrainingMarkings({ lengthMeters: 105, widthMeters: 68 });
    const penalty = full.find((marking) => marking.id === 'training-left-penalty-area');
    const circle = full.find((marking) => marking.id === 'training-centre-circle');
    expect(penalty?.points[1]?.x).toBeCloseTo(16.5 / 105, 6);
    expect(circle?.points.some((point) => Math.abs(point.x - (0.5 + 9.15 / 105)) < 0.002)).toBe(true);
    expect(full.every((marking) => marking.provenance?.authoritative === false)).toBe(true);

    const small = fittedTrainingMarkings({ lengthMeters: 40, widthMeters: 30 });
    const smallPenalty = small.find((marking) => marking.id === 'training-left-penalty-area');
    const ys = smallPenalty?.points.map((point) => point.y) ?? [];
    const span = Math.max(...ys) - Math.min(...ys);
    expect(smallPenalty?.points[1]?.x).toBeLessThan(16.5 / 40);
    expect(span).toBeGreaterThan(0.5);
    expect(span).toBeLessThan(0.9);
    expect(small.every((marking) => marking.points.every((point) => point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1))).toBe(true);
  });

  it('draws fitted markings on a bare pitch and leaves sourced penalty diagrams unchanged', () => {
    const bare = displayPitchOverlays(createStarterTacticalProject().pitch);
    expect(bare.some((overlay) => overlay.id === 'training-left-penalty-area')).toBe(true);
    const svg = serializeTacticalBoardSvg(beginner(), 'scene-1');
    expect(svg).toContain('id="training-left-penalty-area"');
    expect(svg).toContain('id="training-centre-circle"');
    expect(svg).toContain('data-training-marking="true"');

    const ifab = applyPitchRuleProfile(createStarterTacticalProject(), 'ifab-11v11-international-2026-27');
    expect(displayPitchOverlays(ifab.pitch).map((overlay) => overlay.id)).toEqual(ifab.pitch.overlays.map((overlay) => overlay.id));
    expect(serializeTacticalBoardSvg(ifab, ifab.scenes[0]!.id)).not.toContain('training-left-penalty-area');

    const youth = applyPitchRuleProfile(beginner(), 'ussf-pdi-7v7-2017');
    const youthSvg = serializeTacticalBoardSvg(youth, 'scene-1');
    expect(youthSvg).toContain('id="ussf-left-build-out-line"');
    expect(youthSvg).toContain('id="training-left-penalty-area"');
  });

  it('marks only the selected player, ball, or drawing', () => {
    const project = addTacticalArrow(beginner(), 'scene-1', 'layer-1', { x: 0.2, y: 0.2 }, { x: 0.4, y: 0.4 }, 'Run');
    const playerSvg = serializeTacticalBoardSvg(project, 'scene-1', { selectedTokenId: 'token-1' });
    expect(playerSvg).toContain('id="token-1" data-tactical-kind="player" data-selected="true"');
    expect(playerSvg.match(/data-selected="true"/g)).toHaveLength(1);

    const ballSvg = serializeTacticalBoardSvg(project, 'scene-1', { ballSelected: true });
    expect(ballSvg).toContain('id="tactical-ball" data-tactical-kind="ball" data-selected="true"');
    expect(ballSvg).not.toContain('id="token-1" data-tactical-kind="player" data-selected="true"');

    const arrowSvg = serializeTacticalBoardSvg(project, 'scene-1', { selectedAnnotationId: 'arrow-1' });
    expect(arrowSvg).toContain('id="arrow-1" data-tactical-kind="annotation" data-annotation-kind="arrow" data-selected="true"');
    expect(serializeTacticalBoardSvg(project, 'scene-1')).not.toContain('data-selected');
  });

  it('places one mirrored opposition in the opposite half and refits without duplicating it', () => {
    const start = beginner();
    const placed = placeMirroredOpposition(start, 'scene-1', 'layer-1', {
      teamName: 'Red',
      primaryColor: '#9f1239',
    });
    expect(validateTacticalProject(placed)).toEqual([]);
    expect(placed.teams.map((team) => team.id)).toEqual(['team-primary', OPPOSITION_TEAM_ID]);
    expect(placed.playerTokens).toHaveLength(start.playerTokens.length * 2);
    const primary = placed.playerTokens.filter((token) => token.teamId === 'team-primary');
    const opposition = placed.playerTokens.filter((token) => token.teamId === OPPOSITION_TEAM_ID);
    expect(Math.max(...primary.map((token) => token.position.x))).toBeLessThanOrEqual(0.46 + 1e-9);
    expect(Math.min(...opposition.map((token) => token.position.x))).toBeGreaterThanOrEqual(0.54 - 1e-9);
    expect(opposition.every((token) => token.rotationDeg === 180)).toBe(true);
    expect(placed.teams[1]?.primaryColor).toBe('#9f1239');

    const again = placeMirroredOpposition(placed, 'scene-1', 'layer-1');
    expect(again.playerTokens).toHaveLength(placed.playerTokens.length);
    expect(again.teams.filter((team) => team.id === OPPOSITION_TEAM_ID)).toHaveLength(1);
    expect(validateTacticalProject(again)).toEqual([]);
  });

  it('keeps opposition colors distinct and shifts authored motion with the squad', () => {
    const start = beginner();
    const sameKit = placeMirroredOpposition(start, 'scene-1', 'layer-1', { primaryColor: '#154c79' });
    expect(sameKit.teams.find((team) => team.id === OPPOSITION_TEAM_ID)?.primaryColor).not.toBe('#154c79');

    const token = start.playerTokens[0]!;
    const withMotion = {
      ...start,
      timeline: addTimelineTrack(start.timeline, addTimelineKeyframe({
        id: 'track-token-1',
        targetId: token.id,
        keyframes: [],
      }, {
        id: 'kf-1',
        timeMs: 0,
        position: { ...token.position },
        interpolation: 'linear',
      })),
      formationStates: [{
        id: 'phase-1',
        label: 'Base',
        teamId: 'team-primary',
        timeMs: 0,
        playerPositions: { [token.id]: { ...token.position } },
      }],
    };
    const placed = placeMirroredOpposition(withMotion, 'scene-1', 'layer-1');
    const moved = placed.playerTokens.find((item) => item.id === token.id)!;
    const keyframe = placed.timeline.tracks.find((track) => track.targetId === token.id)?.keyframes[0];
    expect(keyframe?.position).toEqual(moved.position);
    expect(placed.formationStates[0]?.playerPositions[token.id]).toEqual(moved.position);
    expect(moved.position).not.toEqual(token.position);
  });

  it('removes one drawing and rejects a second opposition place on a locked layer', () => {
    let project = addTacticalArrow(beginner(), 'scene-1', 'layer-1', { x: 0.2, y: 0.3 }, { x: 0.5, y: 0.3 }, 'Press');
    project = addTacticalArrow(project, 'scene-1', 'layer-1', { x: 0.2, y: 0.6 }, { x: 0.5, y: 0.7 });
    const removed = removeTacticalAnnotation(project, 'arrow-1');
    expect(removed.annotations.map((annotation) => annotation.id)).toEqual(['arrow-2']);
    expect(removed.playerTokens).toHaveLength(project.playerTokens.length);
    expect(() => removeTacticalAnnotation(removed, 'arrow-1')).toThrow(/does not exist/i);

    const locked = {
      ...project,
      scenes: project.scenes.map((scene) => ({
        ...scene,
        layers: scene.layers.map((layer) => ({ ...layer, locked: true })),
      })),
    };
    expect(() => placeMirroredOpposition(locked, 'scene-1', 'layer-1')).toThrow(/unlock the layer/i);
    expect(() => placeMirroredOpposition(beginner(), 'scene-1', 'missing')).toThrow(/does not exist/i);
  });

  it('removes a selected drawing from the pitch or page background and ignores Backspace in a field', () => {
    expect(resolveTacticalShortcut({ key: 'Backspace' }, { focus: 'neutral', overlayOpen: false })).toBe('delete-drawing');
    expect(resolveTacticalShortcut({ key: 'Delete' }, { focus: 'board', overlayOpen: false })).toBe('delete-drawing');
    expect(resolveTacticalShortcut({ key: 'Backspace' }, { focus: 'editable', overlayOpen: false })).toBeNull();
    expect(resolveTacticalShortcut({ key: 'Backspace' }, { focus: 'neutral', overlayOpen: true })).toBeNull();
  });
});

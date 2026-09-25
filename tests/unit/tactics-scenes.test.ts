import { describe, expect, it } from 'vitest';
import {
  cloneTacticalScene,
  renameTacticalScene,
  reorderTacticalScene,
  splitTacticalScene,
} from '../../src/tools/tactics/scene-engine';
import { addTimelineScene } from '../../src/tools/tactics/timeline-engine';
import { buildBeginnerTacticalProject } from '../../src/tools/tactics/workspace-engine';
import { getFormationTemplate, reviewFormationLegality } from '../../src/tools/tactics/formation-engine';
import { validateTacticalProject } from '../../src/tools/tactics/tactics-engine';

describe('Tactical scene sequencing', () => {
  it('adds scenes immutably in deterministic timeline order', () => {
    const source = [
      { id: 'scene-1', name: 'Build', startMs: 0, durationMs: 1000, layers: [], objects: [] },
    ];
    const result = addTimelineScene(source, {
      id: 'scene-2',
      name: 'Press',
      startMs: 1000,
      durationMs: 1500,
      layers: [],
      objects: [],
    });
    expect(result.map((scene) => scene.id)).toEqual(['scene-1', 'scene-2']);
    expect(source).toHaveLength(1);
  });

  it('rejects duplicate ids and non-integer scene time', () => {
    const source = [
      { id: 'scene-1', name: 'Build', startMs: 0, durationMs: 1000, layers: [], objects: [] },
    ];
    expect(() => addTimelineScene(source, {
      id: 'scene-1', name: 'Duplicate', startMs: 1000, durationMs: 500, layers: [], objects: [],
    })).toThrow(/id/i);
    expect(() => addTimelineScene(source, {
      id: 'scene-2', name: 'Invalid', startMs: 10.5, durationMs: 500, layers: [], objects: [],
    })).toThrow(/integer/i);
  });

  it('clones a scene as independent local instances of the same roster players', () => {
    const source = buildBeginnerTacticalProject({
      title: 'Scenes', teamName: 'Blue', primaryColor: '#154c79', secondaryColor: '#ffffff',
      formationId: 'ussf-4v4-1-2-1',
      pitchDimensions: { lengthMeters: 40, widthMeters: 30 },
      direction: 'left-to-right',
    });
    const cloned = cloneTacticalScene(source, 'scene-1', {
      id: 'scene-2',
      name: 'Press phase',
      startMs: 1000,
      durationMs: 1500,
    });
    const scene2Tokens = cloned.playerTokens.filter((token) => token.sceneId === 'scene-2');
    expect(source.scenes).toHaveLength(1);
    expect(cloned.scenes.map((scene) => scene.id)).toEqual(['scene-1', 'scene-2']);
    expect(scene2Tokens).toHaveLength(4);
    expect(scene2Tokens.map((token) => token.playerId)).toEqual(
      source.playerTokens.map((token) => token.playerId),
    );
    expect(new Set(cloned.playerTokens.map((token) => token.id)).size).toBe(cloned.playerTokens.length);
    expect(reviewFormationLegality(
      cloned,
      getFormationTemplate('ussf-4v4-1-2-1')!,
      'scene-2',
    )).toEqual([]);
    expect(validateTacticalProject(cloned)).toEqual([]);
  });

  it('renames a scene immutably without changing its timing or identity', () => {
    const source = buildBeginnerTacticalProject({
      title: 'Scenes', teamName: 'Blue', primaryColor: '#154c79', secondaryColor: '#ffffff',
      formationId: 'ussf-4v4-1-2-1',
      pitchDimensions: { lengthMeters: 40, widthMeters: 30 },
      direction: 'left-to-right',
    });
    const renamed = renameTacticalScene(source, 'scene-1', '  Build-up phase  ');
    expect(renamed.scenes[0]).toMatchObject({
      id: 'scene-1',
      name: 'Build-up phase',
      startMs: source.scenes[0]!.startMs,
      durationMs: source.scenes[0]!.durationMs,
    });
    expect(source.scenes[0]!.name).toBe('Scene 1');
    expect(() => renameTacticalScene(source, 'scene-1', '   ')).toThrow(/name/i);
  });

  it('reorders non-overlapping scenes while preserving scene-relative authored time', () => {
    const base = buildBeginnerTacticalProject({
      title: 'Scenes', teamName: 'Blue', primaryColor: '#154c79', secondaryColor: '#ffffff',
      formationId: 'ussf-4v4-1-2-1',
      pitchDimensions: { lengthMeters: 40, widthMeters: 30 },
      direction: 'left-to-right',
    });
    const first = {
      ...base,
      scenes: [{ ...base.scenes[0]!, durationMs: 1000 }],
      timeline: { ...base.timeline, durationMs: 3000 },
    };
    const withSecond = cloneTacticalScene(first, 'scene-1', {
      id: 'scene-2',
      name: 'Press phase',
      startMs: 1000,
      durationMs: 1000,
    });
    const firstToken = withSecond.playerTokens.find((token) => token.sceneId === 'scene-1')!;
    const secondToken = withSecond.playerTokens.find((token) => token.sceneId === 'scene-2')!;
    const project = {
      ...withSecond,
      timeline: {
        ...withSecond.timeline,
        tracks: [
          {
            id: 'track-first',
            targetId: firstToken.id,
            keyframes: [{ id: 'first-250', timeMs: 250, interpolation: 'hold' as const }],
          },
          {
            id: 'track-second',
            targetId: secondToken.id,
            keyframes: [{ id: 'second-1250', timeMs: 1250, interpolation: 'hold' as const }],
          },
        ],
        markers: [
          { id: 'first-marker', timeMs: 250, kind: 'coaching-cue', label: 'First' },
          { id: 'second-marker', timeMs: 1250, kind: 'coaching-cue', label: 'Second' },
        ],
      },
    };

    const reordered = reorderTacticalScene(project, 'scene-2', -1);
    expect(reordered.scenes.map((scene) => [scene.id, scene.startMs])).toEqual([
      ['scene-2', 0],
      ['scene-1', 1000],
    ]);
    expect(reordered.timeline.tracks.find((track) => track.targetId === secondToken.id)?.keyframes[0]?.timeMs).toBe(250);
    expect(reordered.timeline.tracks.find((track) => track.targetId === firstToken.id)?.keyframes[0]?.timeMs).toBe(1250);
    expect(reordered.timeline.markers.map((marker) => [marker.id, marker.timeMs])).toEqual([
      ['second-marker', 250],
      ['first-marker', 1250],
    ]);
    expect(project.scenes.map((scene) => [scene.id, scene.startMs])).toEqual([
      ['scene-1', 0],
      ['scene-2', 1000],
    ]);
  });

  it('splits a scene at authored time and starts the new scene from the sampled state', () => {
    const source = buildBeginnerTacticalProject({
      title: 'Scenes', teamName: 'Blue', primaryColor: '#154c79', secondaryColor: '#ffffff',
      formationId: 'ussf-4v4-1-2-1',
      pitchDimensions: { lengthMeters: 40, widthMeters: 30 },
      direction: 'left-to-right',
    });
    const token = source.playerTokens[0]!;
    const splitMs = 1000;
    const project = {
      ...source,
      timeline: {
        ...source.timeline,
        tracks: [{
          id: 'track-token-1',
          targetId: token.id,
          keyframes: [
            { id: 'start', timeMs: 0, position: { ...token.position }, interpolation: 'linear' as const },
            { id: 'split', timeMs: splitMs, position: { x: 0.8, y: 0.2 }, interpolation: 'hold' as const },
          ],
        }],
      },
    };

    const split = splitTacticalScene(project, 'scene-1', {
      rightId: 'scene-2',
      rightName: 'Press phase',
      splitMs,
    });
    const left = split.scenes.find((scene) => scene.id === 'scene-1')!;
    const right = split.scenes.find((scene) => scene.id === 'scene-2')!;
    const rightToken = split.playerTokens.find(
      (candidate) => candidate.sceneId === 'scene-2' && candidate.playerId === token.playerId,
    )!;

    expect(left.durationMs).toBe(splitMs - source.scenes[0]!.startMs);
    expect(right.startMs).toBe(splitMs);
    expect(right.durationMs).toBe(source.scenes[0]!.startMs + source.scenes[0]!.durationMs - splitMs);
    expect(rightToken.position).toEqual({ x: 0.8, y: 0.2 });
    expect(validateTacticalProject(split)).toEqual([]);
    expect(source.scenes).toHaveLength(1);
  });


  it('refuses a split that would strand authored scene motion after the split point', () => {
    const source = buildBeginnerTacticalProject({
      title: 'Scenes', teamName: 'Blue', primaryColor: '#154c79', secondaryColor: '#ffffff',
      formationId: 'ussf-4v4-1-2-1',
      pitchDimensions: { lengthMeters: 40, widthMeters: 30 },
      direction: 'left-to-right',
    });
    const token = source.playerTokens[0]!;
    const project = {
      ...source,
      timeline: {
        ...source.timeline,
        tracks: [{
          id: 'track-token-1',
          targetId: token.id,
          keyframes: [
            { id: 'start', timeMs: 0, position: { ...token.position }, interpolation: 'linear' as const },
            { id: 'future', timeMs: 2000, position: { x: 0.8, y: 0.2 }, interpolation: 'hold' as const },
          ],
        }],
      },
    };

    expect(() => splitTacticalScene(project, 'scene-1', {
      rightId: 'scene-2',
      rightName: 'Press phase',
      splitMs: 1000,
    })).toThrow(/authored motion.*after.*split/i);
  });

});

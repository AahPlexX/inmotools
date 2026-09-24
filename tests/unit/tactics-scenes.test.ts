import { describe, expect, it } from 'vitest';
import { cloneTacticalScene } from '../../src/tools/tactics/scene-engine';
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
});

import { describe, expect, it } from 'vitest';
import {
  TACTICAL_HELP_SECTIONS,
  TACTICAL_SHORTCUTS,
  assertUniqueShortcutChords,
  classifyTacticalFocus,
  placeCollisionSafeTooltip,
  reducedMotionTransportStep,
  resolveTacticalShortcut,
  shortcutChord,
} from '../../src/tools/tactics/accessibility-engine';
import {
  addPlayerToken,
  addRosterPlayer,
  addTeam,
  groupPlayerTokens,
  layerPlayerTokenIds,
  movePlayerToken,
  reorderSceneLayer,
  setPlayerTokenLocked,
  setSceneLayerState,
  soloSceneLayer,
} from '../../src/tools/tactics/editor-engine';
import { createStarterTacticalProject, validateTacticalProject } from '../../src/tools/tactics/tactics-engine';
import type { TacticalProject } from '../../src/tools/tactics/tactics-types';

function projectWithPlayers(): TacticalProject {
  let project = addTeam(createStarterTacticalProject(), {
    id: 'home',
    name: 'Home',
    primaryColor: '#154c79',
    secondaryColor: '#ffffff',
    roster: [],
  });
  for (const [tokenId, playerId, name, x] of [
    ['token-1', 'player-1', 'One', 0.2],
    ['token-2', 'player-2', 'Two', 0.4],
  ] as const) {
    project = addRosterPlayer(project, 'home', {
      id: playerId,
      displayName: name,
      status: 'active',
    });
    project = addPlayerToken(project, {
      id: tokenId,
      playerId,
      teamId: 'home',
      sceneId: 'scene-1',
      layerId: 'layer-1',
      position: { x, y: 0.3 },
      rotationDeg: 0,
      visible: true,
      locked: false,
    });
  }
  return project;
}

describe('tactical accessibility contracts', () => {
  it('keeps shortcut chords unique and described', () => {
    expect(() => assertUniqueShortcutChords(TACTICAL_SHORTCUTS)).not.toThrow();
    expect(TACTICAL_SHORTCUTS.map((shortcut) => shortcut.id)).toEqual([
      'close-overlay',
      'help',
      'undo',
      'redo',
      'move-tool',
      'arrow-tool',
      'nudge-up',
      'nudge-down',
      'nudge-left',
      'nudge-right',
      'toggle-playback',
      'stop-playback',
      'previous-frame',
      'next-frame',
      'previous-keyframe',
      'next-keyframe',
      'player-actions',
      'delete-drawing',
    ]);
    expect(TACTICAL_HELP_SECTIONS.map((section) => section.id)).toEqual([
      'move',
      'actions',
      'layout',
      'layers',
      'motion',
      'recovery',
      'match-setup',
    ]);
  });

  it('ignores authoring shortcuts while typing, on controls, or under an open overlay', () => {
    expect(shortcutChord({ key: '?', shiftKey: true })).toBe('?');
    expect(shortcutChord({ key: 'F10', shiftKey: true })).toBe('shift+f10');
    expect(resolveTacticalShortcut({ key: 'm' }, { focus: 'neutral', overlayOpen: false })).toBe('move-tool');
    expect(resolveTacticalShortcut({ key: 'm' }, { focus: 'editable', overlayOpen: false })).toBeNull();
    expect(resolveTacticalShortcut({ key: 'm', ctrlKey: true }, { focus: 'neutral', overlayOpen: false })).toBeNull();
    expect(resolveTacticalShortcut({ key: 'z', ctrlKey: true }, { focus: 'editable', overlayOpen: false })).toBeNull();
    expect(resolveTacticalShortcut({ key: 'z', ctrlKey: true }, { focus: 'neutral', overlayOpen: false })).toBe('undo');
    expect(resolveTacticalShortcut({ key: 'z', metaKey: true, shiftKey: true }, { focus: 'board', overlayOpen: false })).toBe('redo');
    expect(resolveTacticalShortcut({ key: 'y', ctrlKey: true }, { focus: 'activation', overlayOpen: false })).toBe('redo');
    expect(resolveTacticalShortcut({ key: 'ArrowRight' }, { focus: 'board', overlayOpen: false })).toBe('nudge-right');
    expect(resolveTacticalShortcut({ key: 'ArrowRight', repeat: true }, { focus: 'neutral', overlayOpen: false })).toBe('nudge-right');
    expect(resolveTacticalShortcut({ key: 'ArrowRight' }, { focus: 'editable', overlayOpen: false })).toBeNull();
    expect(resolveTacticalShortcut({ key: 'ArrowRight' }, { focus: 'activation', overlayOpen: false })).toBeNull();
    expect(resolveTacticalShortcut({ key: 'k' }, { focus: 'activation', overlayOpen: false })).toBeNull();
    expect(resolveTacticalShortcut({ key: 'k' }, { focus: 'neutral', overlayOpen: false })).toBe('toggle-playback');
    expect(resolveTacticalShortcut({ key: 'k', repeat: true }, { focus: 'neutral', overlayOpen: false })).toBeNull();
    expect(resolveTacticalShortcut({ key: 'A', shiftKey: true }, { focus: 'board', overlayOpen: false })).toBe('arrow-tool');
    expect(resolveTacticalShortcut({ key: 'F1' }, { focus: 'neutral', overlayOpen: false })).toBe('help');
    expect(resolveTacticalShortcut({ key: 'Escape' }, { focus: 'editable', overlayOpen: false })).toBeNull();
    expect(resolveTacticalShortcut({ key: 'Escape' }, { focus: 'editable', overlayOpen: true })).toBe('close-overlay');
    expect(resolveTacticalShortcut({ key: 'm' }, { focus: 'neutral', overlayOpen: true })).toBeNull();
    expect(resolveTacticalShortcut({ key: 'ContextMenu' }, { focus: 'board', overlayOpen: false })).toBe('player-actions');
    expect(classifyTacticalFocus({ inBoard: true, editable: false, activation: true })).toBe('activation');
    expect(classifyTacticalFocus({ inBoard: true, editable: true, activation: false })).toBe('editable');
    expect(classifyTacticalFocus({ inBoard: true, editable: false, activation: false })).toBe('board');
  });

  it('keeps a tooltip inside the viewport and flips it above a low anchor', () => {
    const low = placeCollisionSafeTooltip(
      { top: 760, left: 20, width: 80, height: 44 },
      { width: 240, height: 80 },
      { width: 800, height: 820 },
    );
    expect(low.placement).toBe('above');
    expect(low.top).toBeGreaterThanOrEqual(8);
    expect(low.top + 80).toBeLessThanOrEqual(812);
    expect(low.left).toBeGreaterThanOrEqual(8);

    const edge = placeCollisionSafeTooltip(
      { top: 40, left: 0, width: 30, height: 30 },
      { width: 280, height: 60 },
      { width: 320, height: 640 },
    );
    expect(edge.placement).toBe('below');
    expect(edge.left).toBeGreaterThanOrEqual(8);
    expect(edge.left + 280).toBeLessThanOrEqual(312);
  });

  it('steps reduced-motion playback to the next authored keyframe', () => {
    expect(reducedMotionTransportStep(0, 1000, [0, 500, 1000])).toEqual({
      timeMs: 500,
      message: 'Reduced motion stepped to the next keyframe.',
    });
    expect(reducedMotionTransportStep(500, 1000, [0, 500])).toEqual({
      timeMs: 1000,
      message: 'Reduced motion stepped to the end of the timeline.',
    });
    expect(reducedMotionTransportStep(1000, 1000, [1000])).toEqual({
      timeMs: 0,
      message: 'Reduced motion returned playback to the start.',
    });
  });

  it('groups players onto a named layer and supports reorder, solo, focus, and lock', () => {
    const grouped = groupPlayerTokens(projectWithPlayers(), 'scene-1', ['token-1', 'token-2'], 'Pressing unit');
    const groupLayer = grouped.scenes[0]?.layers.find((layer) => layer.name === 'Pressing unit');
    expect(groupLayer).toBeTruthy();
    expect(grouped.playerTokens.map((token) => token.layerId)).toEqual([groupLayer?.id, groupLayer?.id]);
    expect(validateTacticalProject(grouped)).toEqual([]);
    expect(layerPlayerTokenIds(grouped, 'scene-1', groupLayer!.id)).toEqual(['token-1', 'token-2']);

    const reordered = reorderSceneLayer(grouped, 'scene-1', groupLayer!.id, -1);
    expect(reordered.scenes[0]?.layers.map((layer) => layer.name)).toEqual(['Pressing unit', 'Tactics']);
    expect(() => reorderSceneLayer(reordered, 'scene-1', groupLayer!.id, -1)).toThrow(/start of the layer order/i);

    const solo = soloSceneLayer(grouped, 'scene-1', groupLayer!.id);
    expect(solo.scenes[0]?.layers.map((layer) => [layer.name, layer.visible])).toEqual([
      ['Tactics', false],
      ['Pressing unit', true],
    ]);

    const lockedToken = setPlayerTokenLocked(grouped, 'token-1', true);
    expect(() => movePlayerToken(lockedToken, 'token-1', { x: 0.8, y: 0.4 })).toThrow(/locked/i);
    expect(() => groupPlayerTokens(lockedToken, 'scene-1', ['token-1'], 'Again')).toThrow(/locked/i);

    const lockedLayer = setSceneLayerState(projectWithPlayers(), 'scene-1', 'layer-1', { locked: true });
    expect(() => groupPlayerTokens(lockedLayer, 'scene-1', ['token-2'], 'Again')).toThrow(/locked/i);
    expect(() => groupPlayerTokens(projectWithPlayers(), 'scene-1', [], 'Empty')).toThrow(/at least one player/i);
  });
});

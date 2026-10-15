import { describe, expect, it } from 'vitest';
import {
  COORDINATED_ACTION_PRESETS,
  createCoordinatedActionTemplate,
} from '../../src/tools/tactics/action-engine';
import { addSquadParticipant } from '../../src/tools/tactics/squad-engine';
import {
  addTimelineSubstitutionEvent,
  substitutionEventTag,
} from '../../src/tools/tactics/substitution-engine';
import {
  addTimelineMarker,
  addTimelineVisibilityChange,
  layerTimelineTarget,
  sampleTacticalProjectAtTime,
} from '../../src/tools/tactics/timeline-engine';
import {
  adjustLinkedUnitPositions,
  applyLinkedUnitAdjustment,
  createLinkedUnit,
} from '../../src/tools/tactics/unit-engine';
import {
  TIMELINE_MARKER_KINDS,
  type TacticalTimeline,
} from '../../src/tools/tactics/tactics-types';
import { buildBeginnerTacticalProject } from '../../src/tools/tactics/workspace-engine';

const emptyTimeline = (): TacticalTimeline => ({
  playheadMs: 0,
  durationMs: 5000,
  loop: false,
  playbackRate: 1,
  tracks: [],
  markers: [],
});

describe('Tactical Task 5 closure contracts', () => {
  it('authors visibility for objects and scene layers without making them hidden before the authored time', () => {
    const project = buildBeginnerTacticalProject({
      title: 'Visibility',
      teamName: 'Blue',
      primaryColor: '#154c79',
      secondaryColor: '#ffffff',
      formationId: 'ussf-4v4-1-2-1',
      pitchDimensions: { lengthMeters: 40, widthMeters: 30 },
      direction: 'left-to-right',
    });
    const token = project.playerTokens[0]!;
    const scene = project.scenes[0]!;
    const layer = scene.layers[0]!;

    let timeline = addTimelineVisibilityChange(project.timeline, token.id, 750, false, token.visible);
    timeline = addTimelineVisibilityChange(
      timeline,
      layerTimelineTarget(scene.id, layer.id),
      900,
      false,
      layer.visible,
    );

    const before = sampleTacticalProjectAtTime({ ...project, timeline }, 700);
    const hidden = sampleTacticalProjectAtTime({ ...project, timeline }, 1000);

    expect(before.playerTokens.find((item) => item.id === token.id)?.visible).toBe(true);
    expect(hidden.playerTokens.find((item) => item.id === token.id)?.visible).toBe(false);
    expect(before.scenes[0]?.layers.find((item) => item.id === layer.id)?.visible).toBe(true);
    expect(hidden.scenes[0]?.layers.find((item) => item.id === layer.id)?.visible).toBe(false);
  });

  it('authors one timed substitution event that swaps outgoing and incoming player visibility', () => {
    let project = buildBeginnerTacticalProject({
      title: 'Substitution',
      teamName: 'Blue',
      primaryColor: '#154c79',
      secondaryColor: '#ffffff',
      formationId: 'ussf-4v4-1-2-1',
      pitchDimensions: { lengthMeters: 40, widthMeters: 30 },
      direction: 'left-to-right',
    });
    const team = project.teams[0]!;
    const scene = project.scenes[0]!;
    const layer = scene.layers[0]!;
    const outgoing = project.playerTokens[1]!;

    project = addSquadParticipant(project, team.id, {
      id: 'substitute-5',
      displayName: 'Substitute 5',
      jerseyNumber: '5',
      status: 'substitute',
    }, {
      sceneId: scene.id,
      layerId: layer.id,
      position: { x: 0.5, y: 0.5 },
    });
    const incoming = project.playerTokens.find((token) => token.playerId === 'substitute-5')!;

    const authored = addTimelineSubstitutionEvent(project, {
      id: 'substitution-2000',
      timeMs: 2000,
      outgoingTargetId: outgoing.id,
      incomingTargetId: incoming.id,
    });
    const before = sampleTacticalProjectAtTime(authored, 1999);
    const atEvent = sampleTacticalProjectAtTime(authored, 2000);

    expect(before.playerTokens.find((token) => token.id === outgoing.id)?.visible).toBe(true);
    expect(before.playerTokens.find((token) => token.id === incoming.id)?.visible).toBe(false);
    expect(atEvent.playerTokens.find((token) => token.id === outgoing.id)?.visible).toBe(false);
    expect(atEvent.playerTokens.find((token) => token.id === incoming.id)?.visible).toBe(true);
    expect(authored.timeline.tracks.find((track) => track.targetId === outgoing.id)?.keyframes
      .find((keyframe) => keyframe.timeMs === 2000)?.event)
      .toContain(substitutionEventTag('substitution-2000', 'outgoing'));
    expect(authored.timeline.tracks.find((track) => track.targetId === incoming.id)?.keyframes
      .find((keyframe) => keyframe.timeMs === 2000)?.event)
      .toContain(substitutionEventTag('substitution-2000', 'incoming'));
    expect(() => addTimelineSubstitutionEvent(authored, {
      id: 'substitution-2000',
      timeMs: 2500,
      outgoingTargetId: incoming.id,
      incomingTargetId: outgoing.id,
    })).toThrow(/already exists/i);
  });

  it('supports the accepted marker and coaching-trigger vocabulary and rejects unknown kinds', () => {
    expect(TIMELINE_MARKER_KINDS).toEqual([
      'pass',
      'press',
      'line-break',
      'switch',
      'shot',
      'transition',
      'coaching-cue',
    ]);
    const timeline = addTimelineMarker(emptyTimeline(), {
      id: 'press-1',
      timeMs: 500,
      kind: 'press',
      label: 'Jump on back pass',
    });
    expect(timeline.markers[0]?.kind).toBe('press');
    expect(() => addTimelineMarker(timeline, {
      id: 'invalid-kind',
      timeMs: 600,
      kind: 'unsupported' as never,
      label: 'No',
    })).toThrow(/marker kind/i);
  });

  it('offers the complete named coordinated-action preset library while keeping authored geometry editable', () => {
    expect(COORDINATED_ACTION_PRESETS.map((preset) => preset.id)).toEqual([
      'overlap',
      'underlap',
      'third-player',
      'wall-pass',
      'switch',
      'give-and-go',
      'decoy',
      'press',
      'recovery',
    ]);
    for (const preset of COORDINATED_ACTION_PRESETS) {
      expect(preset.roles.length).toBeGreaterThanOrEqual(2);
      expect(new Set(preset.roles.map((role) => role.roleId)).size).toBe(preset.roles.length);
    }
    const roleCounts = Object.fromEntries(
      COORDINATED_ACTION_PRESETS.map((preset) => [preset.id, preset.roles.length]),
    );
    expect(roleCounts).toMatchObject({
      overlap: 2,
      underlap: 2,
      'third-player': 3,
      'wall-pass': 2,
      switch: 3,
      'give-and-go': 2,
    });

    const editable = createCoordinatedActionTemplate({
      id: 'overlap-local',
      label: 'Overlap - edited',
      roles: [
        {
          roleId: 'carrier',
          from: { x: 0.3, y: 0.5 },
          to: { x: 0.45, y: 0.45 },
          startOffsetMs: 0,
          durationMs: 900,
        },
        {
          roleId: 'runner',
          from: { x: 0.25, y: 0.7 },
          to: { x: 0.7, y: 0.25 },
          startOffsetMs: 150,
          durationMs: 1200,
        },
      ],
    });
    expect(editable.roles[1]?.to).toEqual({ x: 0.7, y: 0.25 });
  });

  it('applies explicit line-shift, step/drop, width, and depth linked-unit semantics', () => {
    const unit = createLinkedUnit('back-line', 'Back line', ['lb', 'cb', 'rb']);
    const positions = {
      lb: { x: 0.3, y: 0.2 },
      cb: { x: 0.4, y: 0.5 },
      rb: { x: 0.5, y: 0.8 },
    };

    expect(adjustLinkedUnitPositions(unit, positions, {
      kind: 'line-shift',
      amount: 0.1,
      direction: 'left-to-right',
    })).toEqual({
      lb: { x: 0.3, y: 0.3 },
      cb: { x: 0.4, y: 0.6 },
      rb: { x: 0.5, y: 0.9 },
    });

    expect(adjustLinkedUnitPositions(unit, positions, {
      kind: 'step',
      amount: 0.1,
      direction: 'left-to-right',
    }).cb).toEqual({ x: 0.5, y: 0.5 });
    expect(adjustLinkedUnitPositions(unit, positions, {
      kind: 'drop',
      amount: 0.1,
      direction: 'left-to-right',
    }).cb).toEqual({ x: 0.3, y: 0.5 });

    const wider = adjustLinkedUnitPositions(unit, positions, {
      kind: 'width',
      amount: 0.5,
      direction: 'left-to-right',
    });
    expect(wider.lb?.y).toBeCloseTo(0.05, 12);
    expect(wider.cb?.y).toBeCloseTo(0.5, 12);
    expect(wider.rb?.y).toBeCloseTo(0.95, 12);

    const deeper = adjustLinkedUnitPositions(unit, positions, {
      kind: 'depth',
      amount: 0.5,
      direction: 'left-to-right',
    });
    expect(deeper.lb?.x).toBeCloseTo(0.25, 12);
    expect(deeper.cb?.x).toBeCloseTo(0.4, 12);
    expect(deeper.rb?.x).toBeCloseTo(0.55, 12);

    const applied = applyLinkedUnitAdjustment(
      emptyTimeline(),
      unit,
      positions,
      { kind: 'step', amount: 0.1, direction: 'left-to-right' },
      1000,
      1000,
    );
    expect(applied.tracks).toHaveLength(3);
  });
});

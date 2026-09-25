import { createMotionPath } from './motion-engine';
import { createNormalizedPoint } from './pitch-engine';
import { addTimelineKeyframe, addTimelineTrack } from './timeline-engine';
import type {
  InterpolationKind,
  NormalizedPoint,
  TacticalMotionPath,
  TacticalTimeline,
} from './tactics-types';

export interface CoordinatedActionRole {
  roleId: string;
  from: NormalizedPoint;
  to: NormalizedPoint;
  startOffsetMs: number;
  durationMs: number;
  interpolation?: InterpolationKind;
  motionPath?: TacticalMotionPath;
}

export interface CoordinatedActionTemplate {
  id: string;
  label: string;
  roles: CoordinatedActionRole[];
}

export interface CoordinatedActionPresetRole {
  roleId: string;
  label: string;
  startOffsetMs: number;
  durationScale: number;
}

export interface CoordinatedActionPreset {
  id: 'overlap' | 'underlap' | 'third-player' | 'wall-pass' | 'switch' | 'give-and-go' | 'decoy' | 'press' | 'recovery';
  label: string;
  roles: CoordinatedActionPresetRole[];
}

export const COORDINATED_ACTION_PRESETS: CoordinatedActionPreset[] = [
  {
    id: 'overlap',
    label: 'Overlap',
    roles: [
      { roleId: 'carrier', label: 'Ball carrier', startOffsetMs: 0, durationScale: 1 },
      { roleId: 'runner', label: 'Overlapping runner', startOffsetMs: 150, durationScale: 1.15 },
      { roleId: 'support', label: 'Support', startOffsetMs: 0, durationScale: 1 },
    ],
  },
  {
    id: 'underlap',
    label: 'Underlap',
    roles: [
      { roleId: 'carrier', label: 'Ball carrier', startOffsetMs: 0, durationScale: 1 },
      { roleId: 'runner', label: 'Underlapping runner', startOffsetMs: 150, durationScale: 1.15 },
      { roleId: 'support', label: 'Support', startOffsetMs: 0, durationScale: 1 },
    ],
  },
  {
    id: 'third-player',
    label: 'Third-player run',
    roles: [
      { roleId: 'first', label: 'First player', startOffsetMs: 0, durationScale: 0.8 },
      { roleId: 'second', label: 'Second player', startOffsetMs: 0, durationScale: 0.8 },
      { roleId: 'third', label: 'Third-player runner', startOffsetMs: 250, durationScale: 1.2 },
    ],
  },
  {
    id: 'wall-pass',
    label: 'Wall pass',
    roles: [
      { roleId: 'passer', label: 'Passer', startOffsetMs: 0, durationScale: 1 },
      { roleId: 'wall', label: 'Wall player', startOffsetMs: 0, durationScale: 0.75 },
      { roleId: 'runner', label: 'Runner', startOffsetMs: 180, durationScale: 1.15 },
    ],
  },
  {
    id: 'switch',
    label: 'Switch of play',
    roles: [
      { roleId: 'source', label: 'Source player', startOffsetMs: 0, durationScale: 0.9 },
      { roleId: 'receiver', label: 'Far-side receiver', startOffsetMs: 150, durationScale: 1 },
      { roleId: 'support', label: 'Supporting runner', startOffsetMs: 200, durationScale: 1.1 },
    ],
  },
  {
    id: 'give-and-go',
    label: 'Give-and-go',
    roles: [
      { roleId: 'passer', label: 'Passer', startOffsetMs: 0, durationScale: 1 },
      { roleId: 'returner', label: 'Return player', startOffsetMs: 0, durationScale: 0.8 },
      { roleId: 'runner', label: 'Continuing runner', startOffsetMs: 180, durationScale: 1.15 },
    ],
  },
  {
    id: 'decoy',
    label: 'Decoy run',
    roles: [
      { roleId: 'carrier', label: 'Ball carrier', startOffsetMs: 0, durationScale: 1 },
      { roleId: 'decoy', label: 'Decoy runner', startOffsetMs: 100, durationScale: 1.1 },
      { roleId: 'receiver', label: 'Receiver', startOffsetMs: 180, durationScale: 1 },
    ],
  },
  {
    id: 'press',
    label: 'Coordinated press',
    roles: [
      { roleId: 'presser', label: 'First presser', startOffsetMs: 0, durationScale: 1 },
      { roleId: 'cover', label: 'Cover player', startOffsetMs: 100, durationScale: 1 },
      { roleId: 'balance', label: 'Balancing player', startOffsetMs: 100, durationScale: 1 },
    ],
  },
  {
    id: 'recovery',
    label: 'Recovery run',
    roles: [
      { roleId: 'first', label: 'First recovery', startOffsetMs: 0, durationScale: 1 },
      { roleId: 'second', label: 'Second recovery', startOffsetMs: 100, durationScale: 1.05 },
      { roleId: 'cover', label: 'Cover player', startOffsetMs: 150, durationScale: 1 },
    ],
  },
];

function requireIntegerTime(value: number, label: string, allowZero = true): number {
  if (!Number.isInteger(value)) throw new RangeError(`${label} must be an integer millisecond value.`);
  if (value < 0 || (!allowZero && value === 0)) throw new RangeError(`${label} must be ${allowZero ? 'non-negative' : 'positive'}.`);
  return value;
}
function cloneRole(role: CoordinatedActionRole): CoordinatedActionRole {
  const from = createNormalizedPoint(role.from.x, role.from.y);
  const to = createNormalizedPoint(role.to.x, role.to.y);
  const motionPath = role.motionPath
    ? createMotionPath(role.motionPath.kind, role.motionPath.controlPoints)
    : undefined;
  return {
    ...role,
    roleId: role.roleId.trim(),
    from,
    to,
    startOffsetMs: requireIntegerTime(role.startOffsetMs, `Role ${role.roleId} start offset`),
    durationMs: requireIntegerTime(role.durationMs, `Role ${role.roleId} duration`, false),
    interpolation: role.interpolation ?? 'smooth',
    motionPath,
  };
}

export function createCoordinatedActionTemplate(
  input: CoordinatedActionTemplate,
): CoordinatedActionTemplate {
  const id = input.id.trim();
  const label = input.label.trim();
  if (!id) throw new Error('Coordinated action template id is required.');
  if (!label) throw new Error('Coordinated action template label is required.');
  if (!input.roles.length) throw new Error('Coordinated action template requires at least one role.');
  const roleIds = new Set<string>();
  const roles = input.roles.map((role) => {
    const next = cloneRole(role);
    if (!next.roleId) throw new Error('Coordinated action role id is required.');
    if (roleIds.has(next.roleId)) throw new Error(`Coordinated action role id ${next.roleId} is duplicated.`);
    roleIds.add(next.roleId);
    return next;
  });
  return { id, label, roles };
}
function validateAssignments(
  template: CoordinatedActionTemplate,
  assignments: Record<string, string>,
): Map<string, string> {
  const result = new Map<string, string>();
  const targets = new Set<string>();
  for (const role of template.roles) {
    const targetId = assignments[role.roleId]?.trim();
    if (!targetId) throw new Error(`Missing assignment for role ${role.roleId}.`);
    if (targets.has(targetId)) throw new Error(`Each coordinated action role requires a unique target; ${targetId} is assigned more than once.`);
    targets.add(targetId);
    result.set(role.roleId, targetId);
  }
  return result;
}

export function applyCoordinatedAction(
  timeline: TacticalTimeline,
  rawTemplate: CoordinatedActionTemplate,
  assignments: Record<string, string>,
  startMs: number,
): TacticalTimeline {
  requireIntegerTime(startMs, 'Action start');
  const template = createCoordinatedActionTemplate(rawTemplate);
  const targets = validateAssignments(template, assignments);

  const schedule = template.roles.map((role) => {
    const startTimeMs = startMs + role.startOffsetMs;
    const endTimeMs = startTimeMs + role.durationMs;
    if (endTimeMs > timeline.durationMs) {
      throw new RangeError(`Action role ${role.roleId} ends after timeline duration.`);
    }
    return { role, targetId: targets.get(role.roleId)!, startTimeMs, endTimeMs };
  });
  for (const item of schedule) {
    const existing = timeline.tracks.find((track) => track.targetId === item.targetId);
    if (!existing) continue;
    const occupiedTimes = new Set(existing.keyframes.map((keyframe) => keyframe.timeMs));
    if (occupiedTimes.has(item.startTimeMs) || occupiedTimes.has(item.endTimeMs)) {
      throw new Error(`Action role ${item.role.roleId} collides with an existing keyframe time for ${item.targetId}.`);
    }
  }

  let result: TacticalTimeline = {
    ...timeline,
    tracks: timeline.tracks.map((track) => ({
      ...track,
      keyframes: track.keyframes.map((keyframe) => ({
        ...keyframe,
        position: keyframe.position ? { ...keyframe.position } : undefined,
        motionPath: keyframe.motionPath
          ? { kind: keyframe.motionPath.kind, controlPoints: keyframe.motionPath.controlPoints.map((point) => ({ ...point })) }
          : undefined,
      })),
    })),
    markers: timeline.markers.map((marker) => ({ ...marker })),
  };

  for (const item of schedule) {
    const startKeyframe = {
      id: `${template.id}-${item.role.roleId}-start-${item.startTimeMs}`,
      timeMs: item.startTimeMs,
      position: { ...item.role.from },
      interpolation: item.role.interpolation ?? 'smooth',
      motionPath: item.role.motionPath,
    } as const;
    const endKeyframe = {
      id: `${template.id}-${item.role.roleId}-end-${item.endTimeMs}`,
      timeMs: item.endTimeMs,
      position: { ...item.role.to },
      interpolation: 'hold' as const,
    };

    const existing = result.tracks.find((track) => track.targetId === item.targetId);
    if (existing) {
      let updated = addTimelineKeyframe(existing, startKeyframe);
      updated = addTimelineKeyframe(updated, endKeyframe);
      result = { ...result, tracks: result.tracks.map((track) => track.id === existing.id ? updated : track) };
    } else {
      result = addTimelineTrack(result, {
        id: `action-${template.id}-${item.targetId}`,
        targetId: item.targetId,
        keyframes: [startKeyframe, endKeyframe],
      });
    }
  }

  return result;
}

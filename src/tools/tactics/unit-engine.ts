import {
  applyCoordinatedAction,
  createCoordinatedActionTemplate,
} from './action-engine';
import { createNormalizedPoint } from './pitch-engine';
import type {
  InterpolationKind,
  NormalizedPoint,
  TacticalTimeline,
} from './tactics-types';

export interface LinkedTacticalUnit {
  id: string;
  label: string;
  memberTargetIds: string[];
}

export function createLinkedUnit(
  idValue: string,
  labelValue: string,
  memberTargetIds: string[],
): LinkedTacticalUnit {
  const id = idValue.trim();
  const label = labelValue.trim();
  if (!id) throw new Error('Linked unit id is required.');
  if (!label) throw new Error('Linked unit label is required.');
  const members = memberTargetIds.map((member) => member.trim()).filter(Boolean);
  if (members.length < 2) throw new Error('Linked unit requires at least two members.');
  if (new Set(members).size !== members.length) throw new Error('Linked unit members must be unique.');
  return { id, label, memberTargetIds: members };
}
export function applyLinkedUnitTranslation(
  timeline: TacticalTimeline,
  rawUnit: LinkedTacticalUnit,
  startPositions: Record<string, NormalizedPoint>,
  delta: NormalizedPoint,
  startMs: number,
  durationMs: number,
  interpolation: InterpolationKind = 'smooth',
): TacticalTimeline {
  const unit = createLinkedUnit(rawUnit.id, rawUnit.label, rawUnit.memberTargetIds);
  if (!Number.isFinite(delta.x) || !Number.isFinite(delta.y)) {
    throw new RangeError('Linked unit translation must be finite.');
  }

  const assignments: Record<string, string> = {};
  const roles = unit.memberTargetIds.map((targetId, index) => {
    const from = startPositions[targetId];
    if (!from) throw new Error(`Missing position for linked unit member ${targetId}.`);
    const start = createNormalizedPoint(from.x, from.y);
    const end = createNormalizedPoint(start.x + delta.x, start.y + delta.y);
    const roleId = `member-${index + 1}`;
    assignments[roleId] = targetId;
    return {
      roleId,
      from: start,
      to: end,
      startOffsetMs: 0,
      durationMs,
      interpolation,
    };
  });

  const template = createCoordinatedActionTemplate({
    id: `linked-${unit.id}`,
    label: unit.label,
    roles,
  });
  return applyCoordinatedAction(timeline, template, assignments, startMs);
}

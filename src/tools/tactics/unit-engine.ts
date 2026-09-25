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

export type LinkedUnitAdjustmentKind = 'line-shift' | 'step' | 'drop' | 'width' | 'depth';

export interface LinkedUnitAdjustment {
  kind: LinkedUnitAdjustmentKind;
  amount: number;
  direction: 'left-to-right' | 'right-to-left';
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


function roundedPoint(x: number, y: number): NormalizedPoint {
  return createNormalizedPoint(Number(x.toFixed(12)), Number(y.toFixed(12)));
}

export function adjustLinkedUnitPositions(
  rawUnit: LinkedTacticalUnit,
  startPositions: Record<string, NormalizedPoint>,
  adjustment: LinkedUnitAdjustment,
): Record<string, NormalizedPoint> {
  const unit = createLinkedUnit(rawUnit.id, rawUnit.label, rawUnit.memberTargetIds);
  if (!Number.isFinite(adjustment.amount)) throw new RangeError('Linked unit adjustment must be finite.');

  const starts = unit.memberTargetIds.map((targetId) => {
    const point = startPositions[targetId];
    if (!point) throw new Error(`Missing position for linked unit member ${targetId}.`);
    return [targetId, createNormalizedPoint(point.x, point.y)] as const;
  });
  const centroid = {
    x: starts.reduce((sum, [, point]) => sum + point.x, 0) / starts.length,
    y: starts.reduce((sum, [, point]) => sum + point.y, 0) / starts.length,
  };
  const scale = 1 + adjustment.amount;
  if ((adjustment.kind === 'width' || adjustment.kind === 'depth') && scale <= 0) {
    throw new RangeError('Width and depth adjustments must keep a positive unit scale.');
  }
  const forwardSign = adjustment.direction === 'left-to-right' ? 1 : -1;

  return Object.fromEntries(starts.map(([targetId, start]) => {
    let x = start.x;
    let y = start.y;
    if (adjustment.kind === 'line-shift') y += adjustment.amount;
    if (adjustment.kind === 'step') x += forwardSign * Math.abs(adjustment.amount);
    if (adjustment.kind === 'drop') x -= forwardSign * Math.abs(adjustment.amount);
    if (adjustment.kind === 'width') y = centroid.y + (start.y - centroid.y) * scale;
    if (adjustment.kind === 'depth') x = centroid.x + (start.x - centroid.x) * scale;
    return [targetId, roundedPoint(x, y)];
  }));
}

export function applyLinkedUnitAdjustment(
  timeline: TacticalTimeline,
  rawUnit: LinkedTacticalUnit,
  startPositions: Record<string, NormalizedPoint>,
  adjustment: LinkedUnitAdjustment,
  startMs: number,
  durationMs: number,
  interpolation: InterpolationKind = 'smooth',
): TacticalTimeline {
  const unit = createLinkedUnit(rawUnit.id, rawUnit.label, rawUnit.memberTargetIds);
  const endPositions = adjustLinkedUnitPositions(unit, startPositions, adjustment);
  const assignments: Record<string, string> = {};
  const roles = unit.memberTargetIds.map((targetId, index) => {
    const from = startPositions[targetId];
    if (!from) throw new Error(`Missing position for linked unit member ${targetId}.`);
    const roleId = `member-${index + 1}`;
    assignments[roleId] = targetId;
    return {
      roleId,
      from: createNormalizedPoint(from.x, from.y),
      to: endPositions[targetId]!,
      startOffsetMs: 0,
      durationMs,
      interpolation,
    };
  });
  return applyCoordinatedAction(
    timeline,
    createCoordinatedActionTemplate({
      id: `linked-${unit.id}-${adjustment.kind}`,
      label: `${unit.label} ${adjustment.kind}`,
      roles,
    }),
    assignments,
    startMs,
  );
}

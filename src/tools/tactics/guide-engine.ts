import { createNormalizedPoint, snapNormalizedPoint, type SnapResult } from './pitch-engine';
import type { NormalizedPoint, TacticalProject } from './tactics-types';

export interface TacticalGuide {
  axis: 'x' | 'y';
  value: number;
  label: string;
}

export interface SnapAssistOptions {
  threshold: number;
  gridStep?: number;
  pitchGuides: boolean;
  teammateSnap: boolean;
  equalSpacing: boolean;
  excludeTokenId?: string;
  spacingAnchors?: number[];
}

export function tacticalPitchGuides(project: TacticalProject): TacticalGuide[] {
  const { lengthMeters } = project.pitch.dimensions;
  const guides: TacticalGuide[] = [
    { axis: 'x', value: 0.5, label: 'Halfway line' },
    { axis: 'y', value: 0.5, label: 'Center line' },
    { axis: 'x', value: 0.25, label: 'Defensive quarter' },
    { axis: 'x', value: 0.75, label: 'Attacking quarter' },
    { axis: 'y', value: 0.25, label: 'Near-side channel' },
    { axis: 'y', value: 0.75, label: 'Far-side channel' },
  ];
  if (Number.isFinite(lengthMeters) && lengthMeters > 16.5) {
    const penalty = Number((16.5 / lengthMeters).toFixed(12));
    if (penalty > 0 && penalty < 1) {
      guides.push(
        { axis: 'x', value: penalty, label: '16.5 m from the near goal line' },
        { axis: 'x', value: Number((1 - penalty).toFixed(12)), label: '16.5 m from the far goal line' },
      );
    }
  }
  return guides.filter((guide) => guide.value >= 0 && guide.value <= 1);
}

export function equalSpacingGuides(values: readonly number[]): number[] {
  const sorted = [...new Set(values.filter((value) => Number.isFinite(value) && value >= 0 && value <= 1))]
    .sort((left, right) => left - right);
  const guides = new Set<number>();
  for (let index = 0; index < sorted.length - 1; index += 1) {
    const left = sorted[index]!;
    const right = sorted[index + 1]!;
    const gap = right - left;
    const before = left - gap;
    const after = right + gap;
    const midpoint = (left + right) / 2;
    if (before >= 0) guides.add(Number(before.toFixed(12)));
    if (after <= 1) guides.add(Number(after.toFixed(12)));
    if (midpoint >= 0 && midpoint <= 1) guides.add(Number(midpoint.toFixed(12)));
  }
  return [...guides];
}

export function snapWithTacticalAssist(
  project: TacticalProject,
  sceneId: string,
  point: NormalizedPoint,
  options: SnapAssistOptions,
): SnapResult {
  const normalized = createNormalizedPoint(point.x, point.y);
  const xGuides: number[] = [];
  const yGuides: number[] = [];
  if (options.pitchGuides) {
    for (const guide of tacticalPitchGuides(project)) {
      if (guide.axis === 'x') xGuides.push(guide.value);
      else yGuides.push(guide.value);
    }
  }
  const tokens = project.playerTokens.filter((token) => (
    token.sceneId === sceneId && token.visible && token.id !== options.excludeTokenId
  ));
  if (options.teammateSnap) {
    for (const token of tokens) {
      xGuides.push(token.position.x);
      yGuides.push(token.position.y);
    }
  }
  if (options.equalSpacing) {
    xGuides.push(...equalSpacingGuides(options.spacingAnchors ?? tokens.map((token) => token.position.x)));
    if (!options.spacingAnchors) {
      yGuides.push(...equalSpacingGuides(tokens.map((token) => token.position.y)));
    }
  }
  return snapNormalizedPoint(normalized, {
    threshold: options.threshold,
    gridStep: options.gridStep,
    xGuides,
    yGuides,
  });
}

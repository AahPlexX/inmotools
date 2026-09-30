import type { CoachingSessionPlan, TacticalProject } from './tactics-types';

export type CoachingSessionPlanPatch = Partial<CoachingSessionPlan>;

function normalizeText(value: string): string {
  return value.trim();
}

function normalizeList(values: string[]): string[] {
  return values.map(normalizeText).filter(Boolean);
}

function requireNonNegativeInteger(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${label} must be a non-negative integer.`);
  return value;
}

export function updateCoachingSessionPlan(
  project: TacticalProject,
  patch: CoachingSessionPlanPatch,
): TacticalProject {
  const current = project.sessionPlan;
  const next: CoachingSessionPlan = {
    ageOrDevelopmentLevel: normalizeText(patch.ageOrDevelopmentLevel ?? current.ageOrDevelopmentLevel),
    playerCount: requireNonNegativeInteger(patch.playerCount ?? current.playerCount, 'Player count'),
    dimensions: normalizeText(patch.dimensions ?? current.dimensions),
    equipment: normalizeList(patch.equipment ?? current.equipment),
    objective: normalizeText(patch.objective ?? current.objective),
    setup: normalizeText(patch.setup ?? current.setup),
    coachingCues: normalizeList(patch.coachingCues ?? current.coachingCues),
    progressions: normalizeList(patch.progressions ?? current.progressions),
    regressions: normalizeList(patch.regressions ?? current.regressions),
    durationMinutes: requireNonNegativeInteger(patch.durationMinutes ?? current.durationMinutes, 'Duration minutes'),
    notes: normalizeText(patch.notes ?? current.notes),
  };
  return { ...project, sessionPlan: next };
}

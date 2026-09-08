import { describe, expect, it } from 'vitest';
import {
  calculateEnergyPlan,
  planToCsv,
  planToMarkdown,
  type EnergyPlanInput,
} from '../../src/tools/nutrition/nutrition-engine';

const advisoryInput: EnergyPlanInput = {
  weightKg: 45,
  heightCm: 150,
  ageYears: 60,
  biologicalSex: 'female',
  activityLevel: 'sedentary',
  goalType: 'moderate_deficit',
  primaryEquation: 'mifflin_st_jeor',
};

const expectedScope: Record<string, string> = {
  below_basal_rate: 'energy_target',
  below_planning_floor: 'energy_target',
  outside_distribution_range: 'macronutrient_distribution',
  below_protein_adequacy: 'protein_adequacy',
};

describe('Energy planner September 2026 audit regressions', () => {
  it('preserves advisory code, severity, scope, and message in CSV exports', () => {
    const plan = calculateEnergyPlan(advisoryInput);
    expect(plan.advisories.length).toBeGreaterThan(0);
    const csv = planToCsv(plan);

    plan.advisories.forEach((advisory, index) => {
      const row = index + 1;
      expect(csv).toContain(`advisory_${row}_code,${advisory.code},`);
      expect(csv).toContain(`advisory_${row}_severity,${advisory.severity},`);
      expect(csv).toContain(`advisory_${row}_scope,${expectedScope[advisory.code]},`);
      expect(csv).toContain(`advisory_${row}_message,`);
      expect(csv).toContain(advisory.message);
    });
  });

  it('preserves advisory code, severity, scope, and message in Markdown exports', () => {
    const plan = calculateEnergyPlan(advisoryInput);
    const markdown = planToMarkdown(plan);

    for (const advisory of plan.advisories) {
      expect(markdown).toContain(`Code: ${advisory.code}`);
      expect(markdown).toContain(`Severity: ${advisory.severity}`);
      expect(markdown).toContain(`Scope: ${expectedScope[advisory.code]}`);
      expect(markdown).toContain(advisory.message);
    }
  });
});

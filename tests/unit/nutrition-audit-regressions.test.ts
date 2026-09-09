import { describe, expect, it } from 'vitest';
import {
  calculateEnergyPlan,
  planToCsv,
  planToMarkdown,
  type Advisory,
  type EnergyPlanInput,
} from '../../src/tools/nutrition/nutrition-engine';

const energyAdvisoryInput: EnergyPlanInput = {
  weightKg: 45,
  heightCm: 150,
  ageYears: 60,
  biologicalSex: 'female',
  activityLevel: 'sedentary',
  goalType: 'moderate_deficit',
  primaryEquation: 'mifflin_st_jeor',
};

const macroAdvisoryInput: EnergyPlanInput = {
  weightKg: 120,
  heightCm: 180,
  ageYears: 30,
  biologicalSex: 'male',
  activityLevel: 'sedentary',
  goalType: 'maintenance',
  primaryEquation: 'mifflin_st_jeor',
  macronutrientSplitPreference: 'custom',
  customSplit: { protein: 5, fat: 30, carbohydrate: 65 },
};

const expectedScope: Record<Advisory['code'], Advisory['scope']> = {
  below_basal_rate: 'energy_target',
  below_planning_floor: 'energy_target',
  outside_distribution_range: 'macronutrient_distribution',
  below_protein_adequacy: 'protein_adequacy',
};

const plans = [calculateEnergyPlan(energyAdvisoryInput), calculateEnergyPlan(macroAdvisoryInput)];

const assertAdvisoryMetadata = (
  advisory: Advisory,
  output: string,
  index: number,
  format: 'csv' | 'markdown',
) => {
  expect(advisory.scope).toBe(expectedScope[advisory.code]);
  if (format === 'csv') {
    const row = index + 1;
    expect(output).toContain(`advisory_${row}_code,${advisory.code},`);
    expect(output).toContain(`advisory_${row}_severity,${advisory.severity},`);
    expect(output).toContain(`advisory_${row}_scope,${expectedScope[advisory.code]},`);
    expect(output).toContain(`advisory_${row}_message,`);
  } else {
    expect(output).toContain(`Code: ${advisory.code}`);
    expect(output).toContain(`Severity: ${advisory.severity}`);
    expect(output).toContain(`Scope: ${expectedScope[advisory.code]}`);
  }
  expect(output).toContain(advisory.message);
};

describe('Energy planner September 2026 audit regressions', () => {
  it('preserves every advisory scope and metadata field in CSV exports', () => {
    const observedCodes = new Set<Advisory['code']>();
    for (const plan of plans) {
      const csv = planToCsv(plan);
      plan.advisories.forEach((advisory, index) => {
        observedCodes.add(advisory.code);
        assertAdvisoryMetadata(advisory, csv, index, 'csv');
      });
    }
    expect(observedCodes).toEqual(new Set<Advisory['code']>(Object.keys(expectedScope) as Advisory['code'][]));
  });

  it('preserves every advisory scope and metadata field in Markdown exports', () => {
    const observedCodes = new Set<Advisory['code']>();
    for (const plan of plans) {
      const markdown = planToMarkdown(plan);
      plan.advisories.forEach((advisory, index) => {
        observedCodes.add(advisory.code);
        assertAdvisoryMetadata(advisory, markdown, index, 'markdown');
      });
    }
    expect(observedCodes).toEqual(new Set<Advisory['code']>(Object.keys(expectedScope) as Advisory['code'][]));
  });
});

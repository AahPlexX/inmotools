import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_MULTIPLIERS,
  DISTRIBUTION_RANGE,
  MIFFLIN_DERIVATION_AGE_RANGE,
  calculateEnergyPlan,
  compareGoals,
  feetInchesToCm,
  katchMcArdleBmr,
  kgToPounds,
  leanBodyMassKg,
  mifflinStJeorBmr,
  planToCsv,
  planToMarkdown,
  poundsToKg,
  resolveSplit,
  revisedHarrisBenedictBmr,
  validateEnergyPlanInput,
  type EnergyPlanInput,
} from '../../src/tools/nutrition/nutrition-engine';

const base: EnergyPlanInput = {
  weightKg: 80,
  heightCm: 180,
  ageYears: 30,
  biologicalSex: 'male',
  activityLevel: 'moderately_active',
  primaryEquation: 'mifflin_st_jeor',
};

describe('basal metabolic rate equations', () => {
  it('matches Mifflin-St Jeor for both formula variants', () => {
    expect(mifflinStJeorBmr(80, 180, 30, 'male')).toBe(1780);
    expect(mifflinStJeorBmr(80, 180, 30, 'female')).toBe(1614);
  });

  it('matches the revised Harris-Benedict equation', () => {
    expect(revisedHarrisBenedictBmr(80, 180, 30, 'male')).toBeCloseTo(88.362 + 13.397 * 80 + 4.799 * 180 - 5.677 * 30, 6);
    expect(revisedHarrisBenedictBmr(80, 180, 30, 'female')).toBeCloseTo(447.593 + 9.247 * 80 + 3.098 * 180 - 4.33 * 30, 6);
  });

  it('derives Katch-McArdle from lean body mass', () => {
    expect(leanBodyMassKg(80, 20)).toBe(64);
    expect(katchMcArdleBmr(64)).toBeCloseTo(1752.4, 6);
  });
});

describe('explicit primary equation', () => {
  it('defaults to Mifflin-St Jeor even when body fat is supplied', () => {
    const plan = calculateEnergyPlan({ ...base, bodyFatPercentage: 20 });
    expect(plan.bmr.katchMcArdle).toBe(1752);
    expect(plan.bmr.primaryEquation).toBe('Mifflin-St Jeor');
    expect(plan.bmr.primaryKcal).toBe(1780);
  });

  it('uses Katch-McArdle only when explicitly selected', () => {
    const plan = calculateEnergyPlan({ ...base, bodyFatPercentage: 20, primaryEquation: 'katch_mcardle' });
    expect(plan.bmr.primaryEquation).toBe('Katch-McArdle');
    expect(plan.bmr.primaryKcal).toBe(1752);
  });

  it('allows Revised Harris-Benedict to be explicitly selected', () => {
    const plan = calculateEnergyPlan({ ...base, primaryEquation: 'revised_harris_benedict' });
    expect(plan.bmr.primaryEquation).toBe('Revised Harris-Benedict');
    expect(plan.bmr.primaryKcal).toBe(Math.round(revisedHarrisBenedictBmr(80, 180, 30, 'male')));
  });

  it('requires body-fat data before Katch-McArdle can be primary', () => {
    const issues = validateEnergyPlanInput({ ...base, primaryEquation: 'katch_mcardle' });
    expect(issues.some((issue) => issue.field === 'primaryEquation' && issue.message.includes('requires'))).toBe(true);
  });
});

describe('plan composition', () => {
  it('applies the activity multiplier and goal delta', () => {
    const plan = calculateEnergyPlan({ ...base, goalType: 'moderate_deficit' });
    const tdee = 1780 * ACTIVITY_MULTIPLIERS.moderately_active;
    expect(plan.activityMultiplier).toBe(1.55);
    expect(plan.tdeeKcal).toBe(Math.round(tdee));
    expect(plan.goalDeltaPercent).toBe(-20);
    expect(plan.targetKcal).toBe(Math.round(tdee * 0.8));
  });

  it('keeps maintenance equal to total daily energy expenditure', () => {
    const plan = calculateEnergyPlan({ ...base, goalType: 'maintenance' });
    expect(plan.targetKcal).toBe(plan.tdeeKcal);
    expect(plan.estimatedWeeklyMassChangeKg).toBe(0);
  });

  it('splits energy into macronutrients that sum closely to the target', () => {
    const plan = calculateEnergyPlan(base);
    expect(plan.macronutrients.reduce((sum, macro) => sum + macro.percentOfEnergy, 0)).toBeCloseTo(100, 6);
    expect(Math.abs(plan.macronutrients.reduce((sum, macro) => sum + macro.kcal, 0) - plan.targetKcal)).toBeLessThanOrEqual(2);
    expect(Math.abs(plan.reconciledKcal - plan.targetKcal)).toBeLessThanOrEqual(6);
  });

  it('stores a normalized, reconstructable copy of the plan input', () => {
    const plan = calculateEnergyPlan({ ...base, goalType: 'mild_deficit', bodyFatPercentage: 20 });
    expect(plan.input).toMatchObject({
      weightKg: 80,
      heightCm: 180,
      ageYears: 30,
      biologicalSex: 'male',
      activityLevel: 'moderately_active',
      bodyFatPercentage: 20,
      goalType: 'mild_deficit',
      primaryEquation: 'mifflin_st_jeor',
      canonicalUnits: 'kg-cm-years',
    });
    expect(plan.assumptions.some((text) => text.includes('19–78'))).toBe(true);
  });
});

describe('macronutrient split frameworks', () => {
  it('resolves every preset and defaults custom without values to balanced', () => {
    expect(resolveSplit('balanced')).toEqual({ protein: 25, fat: 30, carbohydrate: 45 });
    expect(resolveSplit('high_protein')).toEqual({ protein: 35, fat: 25, carbohydrate: 40 });
    expect(resolveSplit('low_carb')).toEqual({ protein: 30, fat: 45, carbohydrate: 25 });
    expect(resolveSplit('custom')).toEqual({ protein: 25, fat: 30, carbohydrate: 45 });
  });

  it('flags the balanced preset as inside every published range', () => {
    const plan = calculateEnergyPlan({ ...base, macronutrientSplitPreference: 'balanced' });
    expect(plan.macronutrients.every((macro) => macro.withinDistributionRange)).toBe(true);
  });

  it('flags low carbohydrate as leaving the published ranges', () => {
    const plan = calculateEnergyPlan({ ...base, macronutrientSplitPreference: 'low_carb' });
    const carbohydrate = plan.macronutrients.find((macro) => macro.key === 'carbohydrate');
    expect(carbohydrate?.withinDistributionRange).toBe(false);
    expect(carbohydrate?.distributionRange).toEqual(DISTRIBUTION_RANGE.carbohydrate);
  });

  it('honours a valid custom split', () => {
    const plan = calculateEnergyPlan({ ...base, macronutrientSplitPreference: 'custom', customSplit: { protein: 40, fat: 20, carbohydrate: 40 } });
    expect(plan.macronutrients.map((macro) => macro.percentOfEnergy)).toEqual([40, 20, 40]);
  });
});

describe('validation and supported scope', () => {
  it('accepts a well-formed input', () => {
    expect(validateEnergyPlanInput(base)).toEqual([]);
  });

  it('rejects non-positive measurements and names the field', () => {
    const issues = validateEnergyPlanInput({ ...base, weightKg: 0, heightCm: -1 });
    expect(issues.map((issue) => issue.field)).toEqual(expect.arrayContaining(['weightKg', 'heightCm']));
  });

  it('restricts age to the original Mifflin-St Jeor derivation sample', () => {
    expect(MIFFLIN_DERIVATION_AGE_RANGE).toEqual([19, 78]);
    expect(validateEnergyPlanInput({ ...base, ageYears: 18 }).some((issue) => issue.field === 'ageYears')).toBe(true);
    expect(validateEnergyPlanInput({ ...base, ageYears: 79 }).some((issue) => issue.field === 'ageYears')).toBe(true);
    expect(validateEnergyPlanInput({ ...base, ageYears: 19 })).toEqual([]);
    expect(validateEnergyPlanInput({ ...base, ageYears: 78 })).toEqual([]);
  });

  it('rejects the reproduced 1 kg, 1 cm extreme instead of producing negative calories', () => {
    const reproduced = { ...base, weightKg: 1, heightCm: 1, ageYears: 78 };
    expect(validateEnergyPlanInput(reproduced).some((issue) => issue.field === 'measurements')).toBe(true);
    expect(() => calculateEnergyPlan(reproduced)).toThrow(/non-positive resting-energy estimate/);
  });

  it('requires a whole-number age', () => {
    expect(validateEnergyPlanInput({ ...base, ageYears: 30.5 }).some((issue) => issue.field === 'ageYears')).toBe(true);
  });

  it('reports body fat bounds', () => {
    expect(validateEnergyPlanInput({ ...base, bodyFatPercentage: 0.5 })[0]?.message).toContain('between 1 and 70');
    expect(validateEnergyPlanInput({ ...base, bodyFatPercentage: 70.1 })).toHaveLength(1);
  });

  it('requires a custom split totalling one hundred percent', () => {
    const issues = validateEnergyPlanInput({ ...base, macronutrientSplitPreference: 'custom', customSplit: { protein: 40, fat: 20, carbohydrate: 30 } });
    expect(issues[0]?.field).toBe('customSplit');
    expect(issues[0]?.message).toContain('90');
  });
});

describe('advisories', () => {
  it('flags a target below the selected resting estimate and planning floor without returning nonpositive energy', () => {
    const plan = calculateEnergyPlan({ weightKg: 45, heightCm: 150, ageYears: 60, biologicalSex: 'female', activityLevel: 'sedentary', goalType: 'moderate_deficit' });
    expect(plan.targetKcal).toBeGreaterThan(0);
    expect(plan.advisories.map((advisory) => advisory.code)).toEqual(expect.arrayContaining(['below_basal_rate', 'below_planning_floor']));
  });

  it('labels the planning floor as a planning reference, not a clinical minimum', () => {
    const plan = calculateEnergyPlan({ weightKg: 45, heightCm: 150, ageYears: 60, biologicalSex: 'female', activityLevel: 'sedentary', goalType: 'moderate_deficit' });
    expect(plan.advisories.find((advisory) => advisory.code === 'below_planning_floor')?.message).toContain('not a clinical minimum');
  });
});

describe('goal comparison and unit helpers', () => {
  it('returns one plan per goal tier while preserving the selected equation', () => {
    const plans = compareGoals({ ...base, primaryEquation: 'revised_harris_benedict' });
    expect(plans).toHaveLength(5);
    expect(plans.every((plan) => plan.bmr.primaryEquation === 'Revised Harris-Benedict')).toBe(true);
    const maintenance = plans.find((plan) => plan.goalType === 'maintenance');
    const moderateDeficit = plans.find((plan) => plan.goalType === 'moderate_deficit');
    const moderateSurplus = plans.find((plan) => plan.goalType === 'moderate_surplus');
    expect(moderateDeficit?.targetKcal).toBeLessThan(maintenance?.targetKcal ?? 0);
    expect(moderateSurplus?.targetKcal).toBeGreaterThan(maintenance?.targetKcal ?? 0);
  });

  it('round-trips imperial conversions', () => {
    expect(poundsToKg(kgToPounds(80))).toBeCloseTo(80, 9);
    expect(feetInchesToCm(5, 11)).toBeCloseTo(180.34, 2);
  });
});

describe('exports', () => {
  it('renders Markdown with original inputs, units, equation, assumptions, and outputs', () => {
    const markdown = planToMarkdown(calculateEnergyPlan({ ...base, bodyFatPercentage: 20, primaryEquation: 'katch_mcardle' }));
    expect(markdown).toContain('Body mass: 80 kg');
    expect(markdown).toContain('Stature: 180 cm');
    expect(markdown).toContain('Age: 30 years');
    expect(markdown).toContain('Primary equation: Katch-McArdle');
    expect(markdown).toContain('Canonical calculation units');
    expect(markdown).toContain('## Assumptions');
    expect(markdown).toContain('Not clinical guidance');
  });

  it('renders CSV with reconstructable inputs and every macronutrient', () => {
    const csv = planToCsv(calculateEnergyPlan(base));
    expect(csv.split('\n')[0]).toBe('metric,value,unit');
    expect(csv).toContain('input_weight,80,kg');
    expect(csv).toContain('input_height,180,cm');
    expect(csv).toContain('input_age,30,years');
    expect(csv).toContain('primary_equation,Mifflin-St Jeor');
    expect(csv).toContain('assumption_1');
    for (const key of ['protein', 'fat', 'carbohydrate']) {
      expect(csv).toContain(`${key}_grams,`);
      expect(csv).toContain(`${key}_percent,`);
    }
  });
});

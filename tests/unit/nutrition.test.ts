import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_MULTIPLIERS,
  DISTRIBUTION_RANGE,
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
};

describe('basal metabolic rate equations', () => {
  it('matches Mifflin-St Jeor for both formula variants', () => {
    // 10*80 + 6.25*180 - 5*30 + 5 = 800 + 1125 - 150 + 5
    expect(mifflinStJeorBmr(80, 180, 30, 'male')).toBe(1780);
    // 800 + 1125 - 150 - 161
    expect(mifflinStJeorBmr(80, 180, 30, 'female')).toBe(1614);
  });

  it('matches the revised Harris-Benedict equation', () => {
    expect(revisedHarrisBenedictBmr(80, 180, 30, 'male')).toBeCloseTo(
      88.362 + 13.397 * 80 + 4.799 * 180 - 5.677 * 30, 6,
    );
    expect(revisedHarrisBenedictBmr(80, 180, 30, 'female')).toBeCloseTo(
      447.593 + 9.247 * 80 + 3.098 * 180 - 4.33 * 30, 6,
    );
  });

  it('derives Katch-McArdle from lean body mass', () => {
    expect(leanBodyMassKg(80, 20)).toBe(64);
    // 370 + 21.6 * 64 = 370 + 1382.4
    expect(katchMcArdleBmr(64)).toBeCloseTo(1752.4, 6);
  });
});

describe('plan composition', () => {
  it('omits Katch-McArdle when body fat is absent and selects Mifflin-St Jeor', () => {
    const plan = calculateEnergyPlan(base);
    expect(plan.bmr.katchMcArdle).toBeUndefined();
    expect(plan.bmr.leanBodyMassKg).toBeUndefined();
    expect(plan.bmr.primaryEquation).toBe('Mifflin-St Jeor');
    expect(plan.bmr.primaryKcal).toBe(1780);
    expect(plan.bmr.revisedHarrisBenedict).toBeGreaterThan(0);
  });

  it('prefers Katch-McArdle when body fat is supplied', () => {
    const plan = calculateEnergyPlan({ ...base, bodyFatPercentage: 20 });
    expect(plan.bmr.katchMcArdle).toBe(1752);
    expect(plan.bmr.leanBodyMassKg).toBe(64);
    expect(plan.bmr.primaryEquation).toBe('Katch-McArdle');
    expect(plan.bmr.primaryKcal).toBe(1752);
  });

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

  it('splits energy into macronutrients that sum to the target', () => {
    const plan = calculateEnergyPlan(base);
    const percentTotal = plan.macronutrients.reduce((sum, macro) => sum + macro.percentOfEnergy, 0);
    expect(percentTotal).toBeCloseTo(100, 6);
    const kcalTotal = plan.macronutrients.reduce((sum, macro) => sum + macro.kcal, 0);
    expect(Math.abs(kcalTotal - plan.targetKcal)).toBeLessThanOrEqual(2);
    expect(Math.abs(plan.reconciledKcal - plan.targetKcal)).toBeLessThanOrEqual(6);
  });

  it('converts grams using the Atwater factors', () => {
    const plan = calculateEnergyPlan(base);
    for (const macro of plan.macronutrients) {
      const density = macro.key === 'fat' ? 9 : 4;
      // Grams derive from unrounded energy, so they can differ by up to one gram
      // from a recomputation against the rounded kilocalorie figure.
      expect(Math.abs(macro.grams - macro.kcal / density)).toBeLessThanOrEqual(1);
    }
    const fat = plan.macronutrients.find((macro) => macro.key === 'fat');
    expect(fat?.grams).toBe(Math.round((plan.targetKcal * 0.3) / 9));
  });

  it('reports protein per kilogram of body mass', () => {
    const plan = calculateEnergyPlan(base);
    const protein = plan.macronutrients.find((macro) => macro.key === 'protein');
    expect(plan.proteinGramsPerKg).toBeCloseTo((protein?.grams ?? 0) / 80, 2);
  });
});

describe('macronutrient split frameworks', () => {
  it('resolves each preset and defaults custom without values to balanced', () => {
    expect(resolveSplit('balanced')).toEqual({ protein: 25, fat: 30, carbohydrate: 45 });
    expect(resolveSplit('high_protein')).toEqual({ protein: 35, fat: 25, carbohydrate: 40 });
    expect(resolveSplit('low_carb')).toEqual({ protein: 30, fat: 45, carbohydrate: 25 });
    expect(resolveSplit('custom')).toEqual({ protein: 25, fat: 30, carbohydrate: 45 });
  });

  it('flags the balanced preset as inside every published range', () => {
    const plan = calculateEnergyPlan({ ...base, macronutrientSplitPreference: 'balanced' });
    expect(plan.macronutrients.every((macro) => macro.withinDistributionRange)).toBe(true);
    expect(plan.advisories.some((advisory) => advisory.code === 'outside_distribution_range')).toBe(false);
  });

  it('flags low carbohydrate as leaving the published ranges', () => {
    const plan = calculateEnergyPlan({ ...base, macronutrientSplitPreference: 'low_carb' });
    const carbohydrate = plan.macronutrients.find((macro) => macro.key === 'carbohydrate');
    expect(carbohydrate?.withinDistributionRange).toBe(false);
    expect(carbohydrate?.distributionRange).toEqual(DISTRIBUTION_RANGE.carbohydrate);
    expect(plan.advisories.some((advisory) => advisory.code === 'outside_distribution_range')).toBe(true);
  });

  it('honours a valid custom split', () => {
    const plan = calculateEnergyPlan({
      ...base,
      macronutrientSplitPreference: 'custom',
      customSplit: { protein: 40, fat: 20, carbohydrate: 40 },
    });
    expect(plan.macronutrients.map((macro) => macro.percentOfEnergy)).toEqual([40, 20, 40]);
  });
});

describe('validation', () => {
  it('accepts a well-formed input', () => {
    expect(validateEnergyPlanInput(base)).toEqual([]);
  });

  it('rejects non-positive measurements and names the field', () => {
    const issues = validateEnergyPlanInput({ ...base, weightKg: 0, heightCm: -1 });
    expect(issues.map((issue) => issue.field)).toEqual(expect.arrayContaining(['weightKg', 'heightCm']));
  });

  it('requires a whole-number age', () => {
    const issues = validateEnergyPlanInput({ ...base, ageYears: 30.5 });
    expect(issues.some((issue) => issue.field === 'ageYears')).toBe(true);
  });

  it('reports body fat bounds', () => {
    expect(validateEnergyPlanInput({ ...base, bodyFatPercentage: 0.5 })[0]?.message).toContain('between 1 and 70');
    expect(validateEnergyPlanInput({ ...base, bodyFatPercentage: 70.1 })).toHaveLength(1);
    expect(validateEnergyPlanInput({ ...base, bodyFatPercentage: 1 })).toEqual([]);
    expect(validateEnergyPlanInput({ ...base, bodyFatPercentage: 70 })).toEqual([]);
  });

  it('requires a custom split totalling one hundred percent', () => {
    const issues = validateEnergyPlanInput({
      ...base,
      macronutrientSplitPreference: 'custom',
      customSplit: { protein: 40, fat: 20, carbohydrate: 30 },
    });
    expect(issues[0]?.field).toBe('customSplit');
    expect(issues[0]?.message).toContain('90');
  });

  it('throws with boundary detail rather than returning a value', () => {
    expect(() => calculateEnergyPlan({ ...base, weightKg: -5 })).toThrow(/weightKg/);
  });
});

describe('advisories', () => {
  it('flags a target below the basal metabolic rate and the planning floor', () => {
    const plan = calculateEnergyPlan({
      weightKg: 45, heightCm: 150, ageYears: 60,
      biologicalSex: 'female', activityLevel: 'sedentary', goalType: 'moderate_deficit',
    });
    expect(plan.targetKcal).toBeLessThan(plan.bmr.primaryKcal);
    expect(plan.advisories.map((advisory) => advisory.code)).toEqual(
      expect.arrayContaining(['below_basal_rate', 'below_planning_floor']),
    );
    // Values are still returned alongside the advisory.
    expect(plan.targetKcal).toBeGreaterThan(0);
    expect(plan.macronutrients).toHaveLength(3);
  });

  it('labels the planning floor as a planning reference, not a clinical minimum', () => {
    const plan = calculateEnergyPlan({
      weightKg: 45, heightCm: 150, ageYears: 60,
      biologicalSex: 'female', activityLevel: 'sedentary', goalType: 'moderate_deficit',
    });
    const floorAdvisory = plan.advisories.find((advisory) => advisory.code === 'below_planning_floor');
    expect(floorAdvisory?.message).toContain('not a clinical minimum');
  });

  it('stays quiet for a maintenance plan in the published ranges', () => {
    const plan = calculateEnergyPlan(base);
    expect(plan.advisories).toEqual([]);
  });
});

describe('goal comparison and unit helpers', () => {
  it('returns one plan per goal tier with ascending targets', () => {
    const plans = compareGoals(base);
    expect(plans).toHaveLength(5);
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
  it('renders Markdown with the equations, table, and a scope note', () => {
    const markdown = planToMarkdown(calculateEnergyPlan({ ...base, bodyFatPercentage: 20 }));
    expect(markdown).toContain('Mifflin-St Jeor');
    expect(markdown).toContain('Katch-McArdle');
    expect(markdown).toContain('| Macronutrient | Grams | kcal | % of energy | Published range |');
    expect(markdown).toContain('Not clinical guidance');
  });

  it('renders CSV rows for every macronutrient', () => {
    const csv = planToCsv(calculateEnergyPlan(base));
    expect(csv.split('\n')[0]).toBe('metric,value,unit');
    for (const key of ['protein', 'fat', 'carbohydrate']) {
      expect(csv).toContain(`${key}_grams,`);
      expect(csv).toContain(`${key}_percent,`);
    }
  });
});

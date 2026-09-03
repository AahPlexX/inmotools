export type BiologicalSex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extra_active';
export type GoalType = 'maintenance' | 'mild_deficit' | 'moderate_deficit' | 'mild_surplus' | 'moderate_surplus';
export type SplitPreference = 'balanced' | 'high_protein' | 'low_carb' | 'custom';
export type MacronutrientKey = 'protein' | 'fat' | 'carbohydrate';

export interface MacronutrientSplit {
  readonly protein: number;
  readonly fat: number;
  readonly carbohydrate: number;
}

export interface EnergyPlanInput {
  readonly weightKg: number;
  readonly heightCm: number;
  readonly ageYears: number;
  readonly biologicalSex: BiologicalSex;
  readonly activityLevel: ActivityLevel;
  readonly bodyFatPercentage?: number;
  readonly goalType?: GoalType;
  readonly macronutrientSplitPreference?: SplitPreference;
  readonly customSplit?: MacronutrientSplit;
}

/** Atwater general factors, in kilocalories per gram. */
export const ENERGY_DENSITY_KCAL_PER_GRAM: Readonly<Record<MacronutrientKey, number>> = {
  protein: 4,
  carbohydrate: 4,
  fat: 9,
};

/** Standard physical activity multipliers applied to basal metabolic rate. */
export const ACTIVITY_MULTIPLIERS: Readonly<Record<ActivityLevel, number>> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

/** Goal targets expressed as a proportion of total daily energy expenditure. */
export const GOAL_ENERGY_DELTA: Readonly<Record<GoalType, number>> = {
  maintenance: 0,
  mild_deficit: -0.1,
  moderate_deficit: -0.2,
  mild_surplus: 0.1,
  moderate_surplus: 0.2,
};

/**
 * Acceptable Macronutrient Distribution Range, as percent of total energy
 * (Institute of Medicine Food and Nutrition Board, 2002/2005).
 */
export const DISTRIBUTION_RANGE: Readonly<Record<MacronutrientKey, readonly [number, number]>> = {
  protein: [10, 35],
  fat: [20, 35],
  carbohydrate: [45, 65],
};

export const SPLIT_PRESETS: Readonly<Record<Exclude<SplitPreference, 'custom'>, MacronutrientSplit>> = {
  balanced: { protein: 25, fat: 30, carbohydrate: 45 },
  high_protein: { protein: 35, fat: 25, carbohydrate: 40 },
  low_carb: { protein: 30, fat: 45, carbohydrate: 25 },
};

/** Recommended dietary allowance for protein, in grams per kilogram of body mass. */
export const PROTEIN_ADEQUACY_G_PER_KG = 0.8;

/**
 * Commonly used planning floors, not clinical minimums. No authoritative body
 * publishes a single universal calorie floor, so these are reported as advisories.
 */
export const PLANNING_FLOOR_KCAL: Readonly<Record<BiologicalSex, number>> = { female: 1200, male: 1500 };

/** Widely used mass-energy planning heuristic, in kilocalories per kilogram. */
export const KCAL_PER_KG_BODY_MASS = 7700;

export const ACTIVITY_LEVELS = Object.keys(ACTIVITY_MULTIPLIERS) as readonly ActivityLevel[];
export const GOAL_TYPES = Object.keys(GOAL_ENERGY_DELTA) as readonly GoalType[];

export interface InputIssue {
  readonly field: keyof EnergyPlanInput | 'customSplit';
  readonly message: string;
}

export interface BmrEstimates {
  readonly mifflinStJeor: number;
  readonly revisedHarrisBenedict: number;
  readonly katchMcArdle?: number;
  readonly leanBodyMassKg?: number;
  readonly primaryKcal: number;
  readonly primaryEquation: 'Mifflin-St Jeor' | 'Katch-McArdle';
}

export interface MacronutrientTarget {
  readonly key: MacronutrientKey;
  readonly percentOfEnergy: number;
  readonly kcal: number;
  readonly grams: number;
  readonly withinDistributionRange: boolean;
  readonly distributionRange: readonly [number, number];
}

export interface Advisory {
  readonly code: 'below_basal_rate' | 'below_planning_floor' | 'outside_distribution_range' | 'below_protein_adequacy';
  readonly severity: 'info' | 'caution';
  readonly message: string;
}

export interface EnergyPlan {
  readonly bmr: BmrEstimates;
  readonly activityLevel: ActivityLevel;
  readonly activityMultiplier: number;
  readonly tdeeKcal: number;
  readonly goalType: GoalType;
  readonly goalDeltaPercent: number;
  readonly targetKcal: number;
  readonly splitPreference: SplitPreference;
  readonly macronutrients: readonly MacronutrientTarget[];
  readonly proteinGramsPerKg: number;
  readonly reconciledKcal: number;
  readonly estimatedWeeklyMassChangeKg: number;
  readonly advisories: readonly Advisory[];
}

const round = (value: number, decimals = 0) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const isPositiveFinite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0;

export const leanBodyMassKg = (weightKg: number, bodyFatPercentage: number) =>
  weightKg * (1 - bodyFatPercentage / 100);

export const mifflinStJeorBmr = (
  weightKg: number, heightCm: number, ageYears: number, biologicalSex: BiologicalSex,
) => 10 * weightKg + 6.25 * heightCm - 5 * ageYears + (biologicalSex === 'male' ? 5 : -161);

export const revisedHarrisBenedictBmr = (
  weightKg: number, heightCm: number, ageYears: number, biologicalSex: BiologicalSex,
) => biologicalSex === 'male'
  ? 88.362 + 13.397 * weightKg + 4.799 * heightCm - 5.677 * ageYears
  : 447.593 + 9.247 * weightKg + 3.098 * heightCm - 4.33 * ageYears;

export const katchMcArdleBmr = (leanMassKg: number) => 370 + 21.6 * leanMassKg;

export const resolveSplit = (
  preference: SplitPreference, customSplit?: MacronutrientSplit,
): MacronutrientSplit => preference === 'custom'
  ? customSplit ?? SPLIT_PRESETS.balanced
  : SPLIT_PRESETS[preference];

export const validateEnergyPlanInput = (input: EnergyPlanInput): readonly InputIssue[] => {
  const issues: InputIssue[] = [];

  if (!isPositiveFinite(input.weightKg)) issues.push({ field: 'weightKg', message: 'Body mass must be a positive number of kilograms.' });
  if (!isPositiveFinite(input.heightCm)) issues.push({ field: 'heightCm', message: 'Stature must be a positive number of centimetres.' });
  if (!isPositiveFinite(input.ageYears) || !Number.isInteger(input.ageYears)) issues.push({ field: 'ageYears', message: 'Age must be a positive whole number of years.' });
  if (input.biologicalSex !== 'male' && input.biologicalSex !== 'female') issues.push({ field: 'biologicalSex', message: 'Formula variant must be male or female.' });
  if (!(input.activityLevel in ACTIVITY_MULTIPLIERS)) issues.push({ field: 'activityLevel', message: `Activity level must be one of ${ACTIVITY_LEVELS.join(', ')}.` });

  if (input.bodyFatPercentage !== undefined) {
    const bodyFat = input.bodyFatPercentage;
    if (typeof bodyFat !== 'number' || !Number.isFinite(bodyFat) || bodyFat < 1 || bodyFat > 70) {
      issues.push({ field: 'bodyFatPercentage', message: 'Body fat percentage must be between 1 and 70.' });
    }
  }

  if (input.goalType !== undefined && !(input.goalType in GOAL_ENERGY_DELTA)) {
    issues.push({ field: 'goalType', message: `Goal must be one of ${GOAL_TYPES.join(', ')}.` });
  }

  const preference = input.macronutrientSplitPreference ?? 'balanced';
  if (preference !== 'custom' && !(preference in SPLIT_PRESETS)) {
    issues.push({ field: 'macronutrientSplitPreference', message: 'Split must be balanced, high_protein, low_carb, or custom.' });
  }

  if (preference === 'custom') {
    const custom = input.customSplit;
    if (!custom) {
      issues.push({ field: 'customSplit', message: 'A custom split requires protein, fat, and carbohydrate percentages.' });
    } else {
      const values = [custom.protein, custom.fat, custom.carbohydrate];
      if (values.some((value) => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
        issues.push({ field: 'customSplit', message: 'Custom split percentages must be zero or greater.' });
      } else if (Math.abs(values.reduce((sum, value) => sum + value, 0) - 100) > 0.01) {
        issues.push({ field: 'customSplit', message: `Custom split percentages must total 100. They currently total ${round(values.reduce((sum, value) => sum + value, 0), 2)}.` });
      }
    }
  }

  return issues;
};

export const calculateEnergyPlan = (input: EnergyPlanInput): EnergyPlan => {
  const issues = validateEnergyPlanInput(input);
  if (issues.length > 0) {
    throw new Error(`Invalid energy plan input. ${issues.map((issue) => `${issue.field}: ${issue.message}`).join(' ')}`);
  }

  const { weightKg, heightCm, ageYears, biologicalSex, activityLevel, bodyFatPercentage } = input;
  const goalType = input.goalType ?? 'maintenance';
  const splitPreference = input.macronutrientSplitPreference ?? 'balanced';

  const mifflin = mifflinStJeorBmr(weightKg, heightCm, ageYears, biologicalSex);
  const harrisBenedict = revisedHarrisBenedictBmr(weightKg, heightCm, ageYears, biologicalSex);
  const leanMass = bodyFatPercentage === undefined ? undefined : leanBodyMassKg(weightKg, bodyFatPercentage);
  const katch = leanMass === undefined ? undefined : katchMcArdleBmr(leanMass);

  // Katch-McArdle is preferred when body composition is known because it is driven by
  // lean mass rather than inferred from stature and age.
  const primaryKcal = katch ?? mifflin;

  const activityMultiplier = ACTIVITY_MULTIPLIERS[activityLevel];
  const tdeeKcal = primaryKcal * activityMultiplier;
  const goalDelta = GOAL_ENERGY_DELTA[goalType];
  const targetKcal = tdeeKcal * (1 + goalDelta);

  const split = resolveSplit(splitPreference, input.customSplit);
  const macronutrients: MacronutrientTarget[] = (['protein', 'fat', 'carbohydrate'] as MacronutrientKey[]).map((key) => {
    const percentOfEnergy = split[key];
    const kcal = targetKcal * (percentOfEnergy / 100);
    const range = DISTRIBUTION_RANGE[key];
    return {
      key,
      percentOfEnergy: round(percentOfEnergy, 1),
      kcal: round(kcal),
      grams: round(kcal / ENERGY_DENSITY_KCAL_PER_GRAM[key]),
      withinDistributionRange: percentOfEnergy >= range[0] && percentOfEnergy <= range[1],
      distributionRange: range,
    };
  });

  // Grams are rounded for readability, so report the energy they actually represent
  // rather than implying the split reconciles to the target exactly.
  const reconciledKcal = macronutrients.reduce(
    (sum, macro) => sum + macro.grams * ENERGY_DENSITY_KCAL_PER_GRAM[macro.key], 0,
  );

  const proteinGrams = macronutrients.find((macro) => macro.key === 'protein')?.grams ?? 0;
  const proteinGramsPerKg = round(proteinGrams / weightKg, 2);

  const advisories: Advisory[] = [];
  if (targetKcal < primaryKcal) {
    advisories.push({
      code: 'below_basal_rate',
      severity: 'caution',
      message: `The target of ${round(targetKcal)} kcal is below the estimated basal metabolic rate of ${round(primaryKcal)} kcal.`,
    });
  }
  const floor = PLANNING_FLOOR_KCAL[biologicalSex];
  if (targetKcal < floor) {
    advisories.push({
      code: 'below_planning_floor',
      severity: 'caution',
      message: `The target of ${round(targetKcal)} kcal is below the ${floor} kcal planning floor commonly used with the ${biologicalSex} formula. This is a planning reference, not a clinical minimum.`,
    });
  }
  const outside = macronutrients.filter((macro) => !macro.withinDistributionRange);
  if (outside.length > 0) {
    advisories.push({
      code: 'outside_distribution_range',
      severity: 'info',
      message: `Outside the published distribution range: ${outside.map((macro) => `${macro.key} at ${macro.percentOfEnergy}% versus ${macro.distributionRange[0]}–${macro.distributionRange[1]}%`).join('; ')}.`,
    });
  }
  if (proteinGramsPerKg < PROTEIN_ADEQUACY_G_PER_KG) {
    advisories.push({
      code: 'below_protein_adequacy',
      severity: 'info',
      message: `Protein at ${proteinGramsPerKg} g/kg is below the ${PROTEIN_ADEQUACY_G_PER_KG} g/kg adequacy reference.`,
    });
  }

  return {
    bmr: {
      mifflinStJeor: round(mifflin),
      revisedHarrisBenedict: round(harrisBenedict),
      ...(katch === undefined ? {} : { katchMcArdle: round(katch) }),
      ...(leanMass === undefined ? {} : { leanBodyMassKg: round(leanMass, 1) }),
      primaryKcal: round(primaryKcal),
      primaryEquation: katch === undefined ? 'Mifflin-St Jeor' : 'Katch-McArdle',
    },
    activityLevel,
    activityMultiplier,
    tdeeKcal: round(tdeeKcal),
    goalType,
    goalDeltaPercent: round(goalDelta * 100, 1),
    targetKcal: round(targetKcal),
    splitPreference,
    macronutrients,
    proteinGramsPerKg,
    reconciledKcal: round(reconciledKcal),
    estimatedWeeklyMassChangeKg: round(((targetKcal - tdeeKcal) * 7) / KCAL_PER_KG_BODY_MASS, 2),
    advisories,
  };
};

/** Every goal tier for the same measurements, so a chosen target has context. */
export const compareGoals = (input: EnergyPlanInput): readonly EnergyPlan[] =>
  GOAL_TYPES.map((goalType) => calculateEnergyPlan({ ...input, goalType }));

export const KG_PER_POUND = 0.45359237;
export const CM_PER_INCH = 2.54;

export const poundsToKg = (pounds: number) => pounds * KG_PER_POUND;
export const kgToPounds = (kg: number) => kg / KG_PER_POUND;
export const feetInchesToCm = (feet: number, inches: number) => (feet * 12 + inches) * CM_PER_INCH;
export const cmToFeetInches = (cm: number) => {
  const totalInches = cm / CM_PER_INCH;
  const feet = Math.floor(totalInches / 12);
  return { feet, inches: round(totalInches - feet * 12, 1) };
};

const MACRO_LABEL: Readonly<Record<MacronutrientKey, string>> = {
  protein: 'Protein',
  fat: 'Dietary fat',
  carbohydrate: 'Carbohydrate',
};

export const macronutrientLabel = (key: MacronutrientKey) => MACRO_LABEL[key];

export const formatGoalLabel = (goalType: GoalType) =>
  goalType.replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase());

export const formatActivityLabel = (activityLevel: ActivityLevel) =>
  activityLevel.replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase());

export const planToMarkdown = (plan: EnergyPlan): string => {
  const lines = [
    '# Energy and macronutrient plan',
    '',
    `- Basal metabolic rate (${plan.bmr.primaryEquation}): ${plan.bmr.primaryKcal} kcal`,
    `- Mifflin-St Jeor: ${plan.bmr.mifflinStJeor} kcal`,
    `- Revised Harris-Benedict: ${plan.bmr.revisedHarrisBenedict} kcal`,
    ...(plan.bmr.katchMcArdle === undefined ? [] : [`- Katch-McArdle: ${plan.bmr.katchMcArdle} kcal (lean mass ${plan.bmr.leanBodyMassKg} kg)`]),
    `- Activity: ${formatActivityLabel(plan.activityLevel)} (×${plan.activityMultiplier})`,
    `- Total daily energy expenditure: ${plan.tdeeKcal} kcal`,
    `- Goal: ${formatGoalLabel(plan.goalType)} (${plan.goalDeltaPercent > 0 ? '+' : ''}${plan.goalDeltaPercent}%)`,
    `- Target intake: ${plan.targetKcal} kcal`,
    `- Estimated weekly mass change: ${plan.estimatedWeeklyMassChangeKg} kg`,
    '',
    '| Macronutrient | Grams | kcal | % of energy | Published range |',
    '| --- | --- | --- | --- | --- |',
    ...plan.macronutrients.map((macro) => `| ${macronutrientLabel(macro.key)} | ${macro.grams} | ${macro.kcal} | ${macro.percentOfEnergy}% | ${macro.distributionRange[0]}–${macro.distributionRange[1]}% |`),
    '',
    `Protein per kilogram: ${plan.proteinGramsPerKg} g/kg.`,
    `Rounded grams represent ${plan.reconciledKcal} kcal.`,
  ];
  if (plan.advisories.length > 0) {
    lines.push('', '## Advisories', ...plan.advisories.map((advisory) => `- ${advisory.message}`));
  }
  lines.push('', 'Planning estimates from published equations. Not clinical guidance.');
  return lines.join('\n');
};

export const planToCsv = (plan: EnergyPlan): string => [
  'metric,value,unit',
  `basal_metabolic_rate,${plan.bmr.primaryKcal},kcal`,
  `basal_equation,${plan.bmr.primaryEquation},`,
  `mifflin_st_jeor,${plan.bmr.mifflinStJeor},kcal`,
  `revised_harris_benedict,${plan.bmr.revisedHarrisBenedict},kcal`,
  ...(plan.bmr.katchMcArdle === undefined ? [] : [`katch_mcardle,${plan.bmr.katchMcArdle},kcal`]),
  `activity_multiplier,${plan.activityMultiplier},`,
  `total_daily_energy_expenditure,${plan.tdeeKcal},kcal`,
  `target_intake,${plan.targetKcal},kcal`,
  ...plan.macronutrients.flatMap((macro) => [
    `${macro.key}_grams,${macro.grams},g`,
    `${macro.key}_kcal,${macro.kcal},kcal`,
    `${macro.key}_percent,${macro.percentOfEnergy},%`,
  ]),
  `protein_per_kg,${plan.proteinGramsPerKg},g/kg`,
  `estimated_weekly_mass_change,${plan.estimatedWeeklyMassChangeKg},kg`,
].join('\n');

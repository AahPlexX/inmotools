export type BiologicalSex = 'male' | 'female';
export type ActivityLevel = 'sedentary' | 'lightly_active' | 'moderately_active' | 'very_active' | 'extra_active';
export type GoalType = 'maintenance' | 'mild_deficit' | 'moderate_deficit' | 'mild_surplus' | 'moderate_surplus';
export type SplitPreference = 'balanced' | 'high_protein' | 'low_carb' | 'custom';
export type MacronutrientKey = 'protein' | 'fat' | 'carbohydrate';
export type BmrEquation = 'mifflin_st_jeor' | 'revised_harris_benedict' | 'katch_mcardle';

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
  readonly primaryEquation?: BmrEquation;
}

export interface NormalizedEnergyPlanInput {
  readonly weightKg: number;
  readonly heightCm: number;
  readonly ageYears: number;
  readonly biologicalSex: BiologicalSex;
  readonly activityLevel: ActivityLevel;
  readonly bodyFatPercentage?: number;
  readonly goalType: GoalType;
  readonly macronutrientSplitPreference: SplitPreference;
  readonly customSplit?: MacronutrientSplit;
  readonly primaryEquation: BmrEquation;
  readonly canonicalUnits: 'kg-cm-years';
}

/** Atwater general factors, in kilocalories per gram. */
export const ENERGY_DENSITY_KCAL_PER_GRAM: Readonly<Record<MacronutrientKey, number>> = {
  protein: 4,
  carbohydrate: 4,
  fat: 9,
};

/** Conventional activity multipliers applied to a resting-energy estimate. */
export const ACTIVITY_MULTIPLIERS: Readonly<Record<ActivityLevel, number>> = {
  sedentary: 1.2,
  lightly_active: 1.375,
  moderately_active: 1.55,
  very_active: 1.725,
  extra_active: 1.9,
};

export const GOAL_ENERGY_DELTA: Readonly<Record<GoalType, number>> = {
  maintenance: 0,
  mild_deficit: -0.1,
  moderate_deficit: -0.2,
  mild_surplus: 0.1,
  moderate_surplus: 0.2,
};

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

export const PROTEIN_ADEQUACY_G_PER_KG = 0.8;
export const PLANNING_FLOOR_KCAL: Readonly<Record<BiologicalSex, number>> = { female: 1200, male: 1500 };
export const KCAL_PER_KG_BODY_MASS = 7700;

/** The original Mifflin-St Jeor derivation sample was 19–78 years old. */
export const MIFFLIN_DERIVATION_AGE_RANGE = [19, 78] as const;

export const ACTIVITY_LEVELS = Object.keys(ACTIVITY_MULTIPLIERS) as readonly ActivityLevel[];
export const GOAL_TYPES = Object.keys(GOAL_ENERGY_DELTA) as readonly GoalType[];
export const BMR_EQUATIONS: readonly BmrEquation[] = ['mifflin_st_jeor', 'revised_harris_benedict', 'katch_mcardle'];

export const BMR_EQUATION_LABEL: Readonly<Record<BmrEquation, BmrEstimates['primaryEquation']>> = {
  mifflin_st_jeor: 'Mifflin-St Jeor',
  revised_harris_benedict: 'Revised Harris-Benedict',
  katch_mcardle: 'Katch-McArdle',
};

export interface InputIssue {
  readonly field: keyof EnergyPlanInput | 'measurements';
  readonly message: string;
}

export interface BmrEstimates {
  readonly mifflinStJeor: number;
  readonly revisedHarrisBenedict: number;
  readonly katchMcArdle?: number;
  readonly leanBodyMassKg?: number;
  readonly primaryKcal: number;
  readonly primaryEquation: 'Mifflin-St Jeor' | 'Revised Harris-Benedict' | 'Katch-McArdle';
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
  readonly input: NormalizedEnergyPlanInput;
  readonly assumptions: readonly string[];
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

// These ceilings are input-error guards, not claims about equation derivation ranges.
const MAX_WEIGHT_KG = 650;
const MAX_HEIGHT_CM = 275;

const hasBaseMeasurementIssue = (issues: readonly InputIssue[]) =>
  issues.some((issue) => ['weightKg', 'heightCm', 'ageYears', 'biologicalSex'].includes(String(issue.field)));

export const validateEnergyPlanInput = (input: EnergyPlanInput): readonly InputIssue[] => {
  const issues: InputIssue[] = [];

  if (!isPositiveFinite(input.weightKg)) {
    issues.push({ field: 'weightKg', message: 'Body mass must be a positive finite number of kilograms.' });
  } else if (input.weightKg > MAX_WEIGHT_KG) {
    issues.push({ field: 'weightKg', message: `Body mass above ${MAX_WEIGHT_KG} kg exceeds this planner’s input guard.` });
  }

  if (!isPositiveFinite(input.heightCm)) {
    issues.push({ field: 'heightCm', message: 'Stature must be a positive finite number of centimetres.' });
  } else if (input.heightCm > MAX_HEIGHT_CM) {
    issues.push({ field: 'heightCm', message: `Stature above ${MAX_HEIGHT_CM} cm exceeds this planner’s input guard.` });
  }

  if (!isPositiveFinite(input.ageYears) || !Number.isInteger(input.ageYears)) {
    issues.push({ field: 'ageYears', message: 'Age must be a positive whole number of years.' });
  } else if (input.ageYears < MIFFLIN_DERIVATION_AGE_RANGE[0] || input.ageYears > MIFFLIN_DERIVATION_AGE_RANGE[1]) {
    issues.push({
      field: 'ageYears',
      message: `This planner is scoped to ages ${MIFFLIN_DERIVATION_AGE_RANGE[0]}–${MIFFLIN_DERIVATION_AGE_RANGE[1]}, matching the original Mifflin-St Jeor derivation sample.`,
    });
  }

  if (input.biologicalSex !== 'male' && input.biologicalSex !== 'female') {
    issues.push({ field: 'biologicalSex', message: 'Formula variant must be male or female.' });
  }
  if (!(input.activityLevel in ACTIVITY_MULTIPLIERS)) {
    issues.push({ field: 'activityLevel', message: `Activity level must be one of ${ACTIVITY_LEVELS.join(', ')}.` });
  }

  if (input.bodyFatPercentage !== undefined) {
    const bodyFat = input.bodyFatPercentage;
    if (typeof bodyFat !== 'number' || !Number.isFinite(bodyFat) || bodyFat < 1 || bodyFat > 70) {
      issues.push({ field: 'bodyFatPercentage', message: 'Body fat percentage must be between 1 and 70 for this planner.' });
    }
  }

  const equation = input.primaryEquation ?? 'mifflin_st_jeor';
  if (!BMR_EQUATIONS.includes(equation)) {
    issues.push({ field: 'primaryEquation', message: 'Choose Mifflin-St Jeor, Revised Harris-Benedict, or Katch-McArdle.' });
  } else if (equation === 'katch_mcardle' && input.bodyFatPercentage === undefined) {
    issues.push({ field: 'primaryEquation', message: 'Katch-McArdle requires a body fat percentage so lean body mass can be estimated.' });
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
      } else {
        const total = values.reduce((sum, value) => sum + value, 0);
        if (Math.abs(total - 100) > 0.01) {
          issues.push({ field: 'customSplit', message: `Custom split percentages must total 100. They currently total ${round(total, 2)}.` });
        }
      }
    }
  }

  // Positive form fields are not enough: extreme combinations can make a displayed
  // resting-energy equation non-positive. Never return a calorie plan from that state.
  if (!hasBaseMeasurementIssue(issues)) {
    const mifflin = mifflinStJeorBmr(input.weightKg, input.heightCm, input.ageYears, input.biologicalSex);
    const harris = revisedHarrisBenedictBmr(input.weightKg, input.heightCm, input.ageYears, input.biologicalSex);
    if (!isPositiveFinite(mifflin) || !isPositiveFinite(harris)) {
      issues.push({
        field: 'measurements',
        message: 'These measurements produce a non-positive resting-energy estimate. No plan will be calculated from them.',
      });
    }
    if (input.bodyFatPercentage !== undefined && input.bodyFatPercentage >= 1 && input.bodyFatPercentage <= 70) {
      const katch = katchMcArdleBmr(leanBodyMassKg(input.weightKg, input.bodyFatPercentage));
      if (!isPositiveFinite(katch)) {
        issues.push({ field: 'measurements', message: 'These measurements produce a non-positive Katch-McArdle estimate.' });
      }
    }
  }

  return issues;
};

const selectPrimaryBmr = (
  equation: BmrEquation,
  mifflin: number,
  harris: number,
  katch: number | undefined,
): number => {
  if (equation === 'mifflin_st_jeor') return mifflin;
  if (equation === 'revised_harris_benedict') return harris;
  if (katch === undefined) throw new Error('Katch-McArdle requires body fat percentage.');
  return katch;
};

export const calculateEnergyPlan = (input: EnergyPlanInput): EnergyPlan => {
  const issues = validateEnergyPlanInput(input);
  if (issues.length > 0) {
    throw new Error(`Invalid energy plan input. ${issues.map((issue) => `${issue.field}: ${issue.message}`).join(' ')}`);
  }

  const { weightKg, heightCm, ageYears, biologicalSex, activityLevel, bodyFatPercentage } = input;
  const goalType = input.goalType ?? 'maintenance';
  const splitPreference = input.macronutrientSplitPreference ?? 'balanced';
  const primaryEquation = input.primaryEquation ?? 'mifflin_st_jeor';

  const mifflin = mifflinStJeorBmr(weightKg, heightCm, ageYears, biologicalSex);
  const harrisBenedict = revisedHarrisBenedictBmr(weightKg, heightCm, ageYears, biologicalSex);
  const leanMass = bodyFatPercentage === undefined ? undefined : leanBodyMassKg(weightKg, bodyFatPercentage);
  const katch = leanMass === undefined ? undefined : katchMcArdleBmr(leanMass);
  const primaryKcal = selectPrimaryBmr(primaryEquation, mifflin, harrisBenedict, katch);

  const activityMultiplier = ACTIVITY_MULTIPLIERS[activityLevel];
  const tdeeKcal = primaryKcal * activityMultiplier;
  const goalDelta = GOAL_ENERGY_DELTA[goalType];
  const targetKcal = tdeeKcal * (1 + goalDelta);
  if (![primaryKcal, tdeeKcal, targetKcal].every(isPositiveFinite)) {
    throw new Error('Calculated energy must remain positive and finite. No plan was produced.');
  }

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

  const reconciledKcal = macronutrients.reduce(
    (sum, macro) => sum + macro.grams * ENERGY_DENSITY_KCAL_PER_GRAM[macro.key], 0,
  );
  const proteinGrams = macronutrients.find((macro) => macro.key === 'protein')?.grams ?? 0;
  const proteinGramsPerKg = round(proteinGrams / weightKg, 2);

  const advisories: Advisory[] = [];
  if (targetKcal < primaryKcal) {
    advisories.push({
      code: 'below_basal_rate', severity: 'caution',
      message: `The target of ${round(targetKcal)} kcal is below the selected resting-energy estimate of ${round(primaryKcal)} kcal.`,
    });
  }
  const floor = PLANNING_FLOOR_KCAL[biologicalSex];
  if (targetKcal < floor) {
    advisories.push({
      code: 'below_planning_floor', severity: 'caution',
      message: `The target of ${round(targetKcal)} kcal is below the ${floor} kcal planning floor commonly used with the ${biologicalSex} formula. This is a planning reference, not a clinical minimum.`,
    });
  }
  const outside = macronutrients.filter((macro) => !macro.withinDistributionRange);
  if (outside.length > 0) {
    advisories.push({
      code: 'outside_distribution_range', severity: 'info',
      message: `Outside the published distribution range: ${outside.map((macro) => `${macro.key} at ${macro.percentOfEnergy}% versus ${macro.distributionRange[0]}–${macro.distributionRange[1]}%`).join('; ')}.`,
    });
  }
  if (proteinGramsPerKg < PROTEIN_ADEQUACY_G_PER_KG) {
    advisories.push({
      code: 'below_protein_adequacy', severity: 'info',
      message: `Protein at ${proteinGramsPerKg} g/kg is below the ${PROTEIN_ADEQUACY_G_PER_KG} g/kg adequacy reference.`,
    });
  }

  const normalizedInput: NormalizedEnergyPlanInput = {
    weightKg: round(weightKg, 4),
    heightCm: round(heightCm, 4),
    ageYears,
    biologicalSex,
    activityLevel,
    ...(bodyFatPercentage === undefined ? {} : { bodyFatPercentage: round(bodyFatPercentage, 2) }),
    goalType,
    macronutrientSplitPreference: splitPreference,
    ...(splitPreference === 'custom' ? { customSplit: { ...split } } : {}),
    primaryEquation,
    canonicalUnits: 'kg-cm-years',
  };

  const assumptions = [
    `Resting-energy primary equation: ${BMR_EQUATION_LABEL[primaryEquation]}.`,
    `Mifflin-St Jeor was derived from adults aged ${MIFFLIN_DERIVATION_AGE_RANGE[0]}–${MIFFLIN_DERIVATION_AGE_RANGE[1]}.`,
    `Activity multiplier: ${activityMultiplier} (${formatActivityLabel(activityLevel)}).`,
    `Goal adjustment: ${round(goalDelta * 100, 1)}% of estimated expenditure.`,
    'Macronutrient energy uses general Atwater factors: protein 4 kcal/g, carbohydrate 4 kcal/g, fat 9 kcal/g.',
    'Weekly mass-change output uses a 7,700 kcal/kg planning heuristic and is not a physiological prediction.',
  ];

  return {
    input: normalizedInput,
    assumptions,
    bmr: {
      mifflinStJeor: round(mifflin),
      revisedHarrisBenedict: round(harrisBenedict),
      ...(katch === undefined ? {} : { katchMcArdle: round(katch) }),
      ...(leanMass === undefined ? {} : { leanBodyMassKg: round(leanMass, 1) }),
      primaryKcal: round(primaryKcal),
      primaryEquation: BMR_EQUATION_LABEL[primaryEquation],
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
  protein: 'Protein', fat: 'Dietary fat', carbohydrate: 'Carbohydrate',
};
export const macronutrientLabel = (key: MacronutrientKey) => MACRO_LABEL[key];
export const formatGoalLabel = (goalType: GoalType) =>
  goalType.replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase());
export const formatActivityLabel = (activityLevel: ActivityLevel) =>
  activityLevel.replace(/_/g, ' ').replace(/^./, (character) => character.toUpperCase());

export const planToMarkdown = (plan: EnergyPlan): string => {
  const lines = [
    '# Energy and macronutrient plan', '',
    '## Inputs and scope',
    `- Body mass: ${plan.input.weightKg} kg`,
    `- Stature: ${plan.input.heightCm} cm`,
    `- Age: ${plan.input.ageYears} years`,
    `- Formula variant: ${plan.input.biologicalSex}`,
    `- Primary equation: ${plan.bmr.primaryEquation}`,
    `- Activity: ${formatActivityLabel(plan.activityLevel)} (×${plan.activityMultiplier})`,
    ...(plan.input.bodyFatPercentage === undefined ? [] : [`- Body fat: ${plan.input.bodyFatPercentage}%`]),
    `- Goal: ${formatGoalLabel(plan.goalType)} (${plan.goalDeltaPercent > 0 ? '+' : ''}${plan.goalDeltaPercent}%)`,
    `- Macronutrient split: ${plan.splitPreference}`,
    '- Canonical calculation units: kilograms, centimetres, years', '',
    '## Energy estimates',
    `- Basal/resting energy (${plan.bmr.primaryEquation}): ${plan.bmr.primaryKcal} kcal/day`,
    `- Mifflin-St Jeor: ${plan.bmr.mifflinStJeor} kcal/day`,
    `- Revised Harris-Benedict: ${plan.bmr.revisedHarrisBenedict} kcal/day`,
    ...(plan.bmr.katchMcArdle === undefined ? [] : [`- Katch-McArdle: ${plan.bmr.katchMcArdle} kcal/day (lean mass ${plan.bmr.leanBodyMassKg} kg)`]),
    `- Total daily energy expenditure: ${plan.tdeeKcal} kcal/day`,
    `- Target intake: ${plan.targetKcal} kcal/day`,
    `- Estimated weekly mass change: ${plan.estimatedWeeklyMassChangeKg} kg`, '',
    '| Macronutrient | Grams | kcal | % of energy | Published range |',
    '| --- | --- | --- | --- | --- |',
    ...plan.macronutrients.map((macro) => `| ${macronutrientLabel(macro.key)} | ${macro.grams} | ${macro.kcal} | ${macro.percentOfEnergy}% | ${macro.distributionRange[0]}–${macro.distributionRange[1]}% |`),
    '', `Protein per kilogram: ${plan.proteinGramsPerKg} g/kg.`,
    `Rounded grams represent ${plan.reconciledKcal} kcal.`, '',
    '## Assumptions', ...plan.assumptions.map((assumption) => `- ${assumption}`),
  ];
  if (plan.advisories.length > 0) lines.push('', '## Advisories', ...plan.advisories.map((advisory) => `- ${advisory.message}`));
  lines.push('', 'Planning estimates from published equations. Not clinical guidance. Not intended for children, pregnancy, or breastfeeding.');
  return lines.join('\n');
};

const csvCell = (value: string | number) => {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

export const planToCsv = (plan: EnergyPlan): string => {
  const rows: Array<[string, string | number, string]> = [
    ['input_weight', plan.input.weightKg, 'kg'],
    ['input_height', plan.input.heightCm, 'cm'],
    ['input_age', plan.input.ageYears, 'years'],
    ['input_formula_variant', plan.input.biologicalSex, ''],
    ['primary_equation', plan.bmr.primaryEquation, ''],
    ['input_activity_level', plan.activityLevel, ''],
    ['activity_multiplier', plan.activityMultiplier, ''],
    ['input_goal', plan.goalType, ''],
    ['goal_adjustment', plan.goalDeltaPercent, '%'],
    ['input_macro_split', plan.splitPreference, ''],
    ...(plan.input.bodyFatPercentage === undefined ? [] : [['input_body_fat', plan.input.bodyFatPercentage, '%'] as [string, string | number, string]),
    ['basal_metabolic_rate', plan.bmr.primaryKcal, 'kcal/day'],
    ['mifflin_st_jeor', plan.bmr.mifflinStJeor, 'kcal/day'],
    ['revised_harris_benedict', plan.bmr.revisedHarrisBenedict, 'kcal/day'],
    ...(plan.bmr.katchMcArdle === undefined ? [] : [['katch_mcardle', plan.bmr.katchMcArdle, 'kcal/day'] as [string, string | number, string]),
    ['total_daily_energy_expenditure', plan.tdeeKcal, 'kcal/day'],
    ['target_intake', plan.targetKcal, 'kcal/day'],
    ...plan.macronutrients.flatMap((macro): Array<[string, string | number, string]> => [
      [`${macro.key}_grams`, macro.grams, 'g/day'],
      [`${macro.key}_kcal`, macro.kcal, 'kcal/day'],
      [`${macro.key}_percent`, macro.percentOfEnergy, '%'],
    ]),
    ['protein_per_kg', plan.proteinGramsPerKg, 'g/kg'],
    ['estimated_weekly_mass_change', plan.estimatedWeeklyMassChangeKg, 'kg/week'],
    ...plan.assumptions.map((assumption, index): [string, string, string] => [`assumption_${index + 1}`, assumption, '']),
  ];
  return ['metric,value,unit', ...rows.map(([metric, value, unit]) => `${csvCell(metric)},${csvCell(value)},${csvCell(unit)}`)].join('\n');
};

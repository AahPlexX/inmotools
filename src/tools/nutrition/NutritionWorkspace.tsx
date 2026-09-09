import { useEffect, useMemo, useState } from 'react';
import { downloadText } from '../../lib/download';
import {
  ACTIVITY_LEVELS,
  ACTIVITY_MULTIPLIERS,
  BMR_EQUATIONS,
  BMR_EQUATION_LABEL,
  DISTRIBUTION_RANGE,
  GOAL_TYPES,
  MIFFLIN_DERIVATION_AGE_RANGE,
  PROTEIN_ADEQUACY_G_PER_KG,
  calculateEnergyPlan,
  cmToFeetInches,
  compareGoals,
  feetInchesToCm,
  formatActivityLabel,
  formatGoalLabel,
  kgToPounds,
  macronutrientLabel,
  planToCsv,
  planToMarkdown,
  poundsToKg,
  validateEnergyPlanInput,
  type ActivityLevel,
  type BiologicalSex,
  type BmrEquation,
  type EnergyPlanInput,
  type GoalType,
  type MacronutrientSplit,
  type SplitPreference,
} from './nutrition-engine';

const AUTOSAVE_KEY = 'inmotools_energy_planner_autosave';
const PRESETS_KEY = 'inmotools_energy_planner_presets_v1';
const MAX_PRESETS = 12;
const MAX_PRESET_NAME = 60;

const ACTIVITY_HELP: Record<ActivityLevel, string> = {
  sedentary: 'Desk-based day with little deliberate exercise.',
  lightly_active: 'Light exercise one to three days each week.',
  moderately_active: 'Moderate exercise three to five days each week.',
  very_active: 'Hard exercise six or seven days each week.',
  extra_active: 'Physical occupation or twice-daily training.',
};

const SPLIT_OPTIONS: { value: SplitPreference; label: string }[] = [
  { value: 'balanced', label: 'Balanced' },
  { value: 'high_protein', label: 'High protein' },
  { value: 'low_carb', label: 'Low carbohydrate' },
  { value: 'custom', label: 'Custom' },
];

interface FormState {
  readonly units: 'metric' | 'imperial';
  readonly weightKg: number;
  readonly heightCm: number;
  readonly ageYears: number;
  readonly biologicalSex: BiologicalSex;
  readonly activityLevel: ActivityLevel;
  readonly useBodyFat: boolean;
  readonly bodyFatPercentage: number;
  readonly primaryEquation: BmrEquation;
  readonly goalType: GoalType;
  readonly splitPreference: SplitPreference;
  readonly customSplit: MacronutrientSplit;
  readonly mealsPerDay: number;
}

interface SavedPreset {
  readonly name: string;
  readonly form: FormState;
  readonly updatedAt: string;
}

const DEFAULT_FORM: FormState = {
  units: 'metric',
  weightKg: 80,
  heightCm: 180,
  ageYears: 30,
  biologicalSex: 'male',
  activityLevel: 'moderately_active',
  useBodyFat: false,
  bodyFatPercentage: 20,
  primaryEquation: 'mifflin_st_jeor',
  goalType: 'maintenance',
  splitPreference: 'balanced',
  customSplit: { protein: 30, fat: 30, carbohydrate: 40 },
  mealsPerDay: 3,
};

const finiteOr = (value: unknown, fallback: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const normalizeFormState = (value: unknown): FormState => {
  const parsed = value && typeof value === 'object' ? value as Partial<FormState> : {};
  const primaryEquation = BMR_EQUATIONS.includes(parsed.primaryEquation as BmrEquation)
    ? parsed.primaryEquation as BmrEquation
    : DEFAULT_FORM.primaryEquation;
  const activityLevel = ACTIVITY_LEVELS.includes(parsed.activityLevel as ActivityLevel)
    ? parsed.activityLevel as ActivityLevel
    : DEFAULT_FORM.activityLevel;
  const goalType = GOAL_TYPES.includes(parsed.goalType as GoalType)
    ? parsed.goalType as GoalType
    : DEFAULT_FORM.goalType;
  const splitPreference = SPLIT_OPTIONS.some((option) => option.value === parsed.splitPreference)
    ? parsed.splitPreference as SplitPreference
    : DEFAULT_FORM.splitPreference;
  const custom = parsed.customSplit && typeof parsed.customSplit === 'object' ? parsed.customSplit : DEFAULT_FORM.customSplit;
  return {
    units: parsed.units === 'imperial' ? 'imperial' : 'metric',
    weightKg: finiteOr(parsed.weightKg, DEFAULT_FORM.weightKg),
    heightCm: finiteOr(parsed.heightCm, DEFAULT_FORM.heightCm),
    ageYears: finiteOr(parsed.ageYears, DEFAULT_FORM.ageYears),
    biologicalSex: parsed.biologicalSex === 'female' ? 'female' : 'male',
    activityLevel,
    useBodyFat: typeof parsed.useBodyFat === 'boolean' ? parsed.useBodyFat : DEFAULT_FORM.useBodyFat,
    bodyFatPercentage: finiteOr(parsed.bodyFatPercentage, DEFAULT_FORM.bodyFatPercentage),
    primaryEquation,
    goalType,
    splitPreference,
    customSplit: {
      protein: finiteOr(custom.protein, DEFAULT_FORM.customSplit.protein),
      fat: finiteOr(custom.fat, DEFAULT_FORM.customSplit.fat),
      carbohydrate: finiteOr(custom.carbohydrate, DEFAULT_FORM.customSplit.carbohydrate),
    },
    mealsPerDay: Math.max(1, Math.min(12, Math.round(finiteOr(parsed.mealsPerDay, DEFAULT_FORM.mealsPerDay)))),
  };
};

const readAutosave = (): FormState => {
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_KEY);
    return raw ? normalizeFormState(JSON.parse(raw)) : DEFAULT_FORM;
  } catch {
    return DEFAULT_FORM;
  }
};

const readPresets = (): SavedPreset[] => {
  try {
    const raw = window.localStorage.getItem(PRESETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const presets: SavedPreset[] = [];
    for (const candidate of parsed) {
      if (!candidate || typeof candidate !== 'object') continue;
      const item = candidate as Partial<SavedPreset>;
      const name = typeof item.name === 'string' ? item.name.trim().slice(0, MAX_PRESET_NAME) : '';
      if (!name || seen.has(name)) continue;
      seen.add(name);
      presets.push({
        name,
        form: normalizeFormState(item.form),
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : '',
      });
      if (presets.length >= MAX_PRESETS) break;
    }
    return presets;
  } catch {
    return [];
  }
};

const persistPresets = (presets: readonly SavedPreset[]): boolean => {
  try {
    window.localStorage.setItem(PRESETS_KEY, JSON.stringify(presets));
    return true;
  } catch {
    return false;
  }
};

const toInput = (form: FormState): EnergyPlanInput => ({
  weightKg: form.weightKg,
  heightCm: form.heightCm,
  ageYears: form.ageYears,
  biologicalSex: form.biologicalSex,
  activityLevel: form.activityLevel,
  ...(form.useBodyFat ? { bodyFatPercentage: form.bodyFatPercentage } : {}),
  primaryEquation: form.primaryEquation,
  goalType: form.goalType,
  macronutrientSplitPreference: form.splitPreference,
  ...(form.splitPreference === 'custom' ? { customSplit: form.customSplit } : {}),
});

const numeric = (value: string) => (value.trim() === '' ? Number.NaN : Number(value));

export default function NutritionWorkspace() {
  const [form, setForm] = useState<FormState>(readAutosave);
  const [note, setNote] = useState('Autosaves locally in this browser.');
  const [presets, setPresets] = useState<SavedPreset[]>(readPresets);
  const [presetName, setPresetName] = useState('');
  const [selectedPreset, setSelectedPreset] = useState('');

  const update = <Key extends keyof FormState>(key: Key, value: FormState[Key]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const input = useMemo(() => toInput(form), [form]);
  const issues = useMemo(() => validateEnergyPlanInput(input), [input]);
  const plan = useMemo(() => (issues.length === 0 ? calculateEnergyPlan(input) : undefined), [input, issues]);
  const goalComparison = useMemo(() => (issues.length === 0 ? compareGoals(input) : []), [input, issues]);
  const issueFor = (field: string) => issues.find((issue) => issue.field === field)?.message;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(form));
        setNote('Changes saved locally. Reloading this tool restores them.');
      } catch {
        setNote('Local restore is unavailable in this browser; the current plan remains on screen.');
      }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [form]);

  const imperialWeight = Math.round(kgToPounds(form.weightKg) * 10) / 10;
  const imperialHeight = cmToFeetInches(form.heightCm);

  const savePreset = () => {
    const name = presetName.trim().slice(0, MAX_PRESET_NAME);
    if (!name) {
      setNote('Enter a preset name before saving.');
      return;
    }
    if (issues.length > 0) {
      setNote('Fix the current input errors before saving this preset.');
      return;
    }
    const nextPreset: SavedPreset = { name, form, updatedAt: new Date().toISOString() };
    const existing = presets.findIndex((preset) => preset.name === name);
    const next = existing >= 0
      ? presets.map((preset, index) => index === existing ? nextPreset : preset)
      : [nextPreset, ...presets].slice(0, MAX_PRESETS);
    if (!persistPresets(next)) {
      setNote('Preset storage is unavailable in this browser; nothing was saved.');
      return;
    }
    setPresets(next);
    setSelectedPreset(name);
    setPresetName(name);
    setNote(existing >= 0 ? `Updated preset “${name}”.` : `Saved preset “${name}” locally.`);
  };

  const loadPreset = () => {
    const preset = presets.find((candidate) => candidate.name === selectedPreset);
    if (!preset) {
      setNote('Choose a saved preset to load.');
      return;
    }
    setForm(preset.form);
    setPresetName(preset.name);
    setNote(`Loaded preset “${preset.name}”.`);
  };

  const deletePreset = () => {
    const preset = presets.find((candidate) => candidate.name === selectedPreset);
    if (!preset) {
      setNote('Choose a saved preset to delete.');
      return;
    }
    const next = presets.filter((candidate) => candidate.name !== preset.name);
    if (!persistPresets(next)) {
      setNote('Preset storage is unavailable in this browser; nothing was deleted.');
      return;
    }
    setPresets(next);
    setSelectedPreset('');
    setNote(`Deleted preset “${preset.name}”.`);
  };

  const copyPlan = async () => {
    if (!plan) return;
    try {
      await navigator.clipboard.writeText(planToMarkdown(plan));
      setNote('Plan copied to the clipboard.');
    } catch {
      setNote('Clipboard access was refused. Use a download instead.');
    }
  };

  const reset = () => {
    setForm(DEFAULT_FORM);
    try { window.localStorage.removeItem(AUTOSAVE_KEY); } catch { /* unavailable storage */ }
    setNote('Reset to defaults and cleared the autosaved plan. Named presets were kept.');
  };

  return (
    <>
      <div className="workspace-header">
        <div>
          <h2>Energy and macronutrient plan</h2>
          <p>Published equations, computed on this device with reconstructable exports.</p>
        </div>
        <button className="action-button" type="button" onClick={reset}>Reset</button>
      </div>

      <div className="workspace-body">
        <div className="notice" data-testid="planner-scope" style={{ marginBottom: 18, overflowWrap: 'anywhere' }}>
          <strong>Supported scope</strong>
          <p>
            This workflow is for non-pregnant, non-breastfeeding adults aged {MIFFLIN_DERIVATION_AGE_RANGE[0]}–{MIFFLIN_DERIVATION_AGE_RANGE[1]}.
            The age range matches the original Mifflin-St Jeor derivation sample; it is not a child or pregnancy energy-needs calculator.
          </p>
        </div>

        <section className="planner-section" aria-labelledby="preset-heading">
          <div className="planner-section-head">
            <div><h3 id="preset-heading">Input presets</h3><p className="help-text">Save up to {MAX_PRESETS} named input sets in this browser. Presets keep canonical kg/cm values at their stored precision and are never uploaded.</p></div>
          </div>
          <div className="workspace-grid three">
            <div className="field">
              <label htmlFor="preset-name">Preset name</label>
              <input id="preset-name" aria-label="Preset name" value={presetName} maxLength={MAX_PRESET_NAME} onChange={(event) => setPresetName(event.target.value)} placeholder="e.g. Maintenance block" />
            </div>
            <div className="field">
              <label htmlFor="saved-preset">Saved preset</label>
              <select id="saved-preset" aria-label="Saved preset" value={selectedPreset} onChange={(event) => setSelectedPreset(event.target.value)}>
                <option value="">{presets.length ? 'Choose a preset' : 'No saved presets'}</option>
                {presets.map((preset) => <option key={preset.name} value={preset.name}>{preset.name}</option>)}
              </select>
            </div>
            <div className="planner-actions" style={{ alignSelf: 'end' }}>
              <button className="action-button" type="button" onClick={savePreset}>Save preset</button>
              <button className="action-button secondary" type="button" onClick={loadPreset} disabled={!selectedPreset}>Load preset</button>
              <button className="action-button secondary" type="button" onClick={deletePreset} disabled={!selectedPreset}>Delete preset</button>
            </div>
          </div>
        </section>

        <section className="planner-section" aria-labelledby="measurements-heading">
          <div className="planner-section-head">
            <h3 id="measurements-heading">Measurements and equation</h3>
            <div className="planner-unit-toggle" role="group" aria-label="Measurement units">
              {(['metric', 'imperial'] as const).map((unit) => (
                <button key={unit} type="button" className="planner-toggle-button" aria-pressed={form.units === unit} onClick={() => update('units', unit)}>
                  {unit === 'metric' ? 'Metric' : 'Imperial'}
                </button>
              ))}
            </div>
          </div>

          <div className="workspace-grid three">
            {form.units === 'metric' ? (
              <div className="field">
                <label htmlFor="weight-kg">Body mass (kg)</label>
                <input id="weight-kg" data-testid="weight-input" type="number" inputMode="decimal" min="1" step="0.1"
                  value={Number.isNaN(form.weightKg) ? '' : form.weightKg}
                  onChange={(event) => update('weightKg', numeric(event.target.value))}
                  aria-describedby={issueFor('weightKg') ? 'weight-error' : undefined} />
                {issueFor('weightKg') ? <p className="planner-error" id="weight-error">{issueFor('weightKg')}</p> : null}
              </div>
            ) : (
              <div className="field">
                <label htmlFor="weight-lb">Body mass (lb)</label>
                <input id="weight-lb" data-testid="weight-input" type="number" inputMode="decimal" min="1" step="0.1"
                  value={Number.isNaN(imperialWeight) ? '' : imperialWeight}
                  onChange={(event) => update('weightKg', poundsToKg(numeric(event.target.value)))} />
                <small>{Number.isNaN(form.weightKg) ? '—' : `${Math.round(form.weightKg * 10) / 10} kg`}</small>
              </div>
            )}

            {form.units === 'metric' ? (
              <div className="field">
                <label htmlFor="height-cm">Stature (cm)</label>
                <input id="height-cm" data-testid="height-input" type="number" inputMode="decimal" min="1" step="0.5"
                  value={Number.isNaN(form.heightCm) ? '' : form.heightCm}
                  onChange={(event) => update('heightCm', numeric(event.target.value))}
                  aria-describedby={issueFor('heightCm') ? 'height-error' : undefined} />
                {issueFor('heightCm') ? <p className="planner-error" id="height-error">{issueFor('heightCm')}</p> : null}
              </div>
            ) : (
              <div className="field">
                <span className="field-label" id="height-imperial-label">Stature (ft / in)</span>
                <div className="planner-split-input" role="group" aria-labelledby="height-imperial-label">
                  <input aria-label="Feet" data-testid="height-feet" type="number" inputMode="numeric" min="0" step="1"
                    value={imperialHeight.feet}
                    onChange={(event) => update('heightCm', feetInchesToCm(numeric(event.target.value), imperialHeight.inches))} />
                  <input aria-label="Inches" data-testid="height-inches" type="number" inputMode="decimal" min="0" step="0.5"
                    value={imperialHeight.inches}
                    onChange={(event) => update('heightCm', feetInchesToCm(imperialHeight.feet, numeric(event.target.value)))} />
                </div>
                <small>{Number.isNaN(form.heightCm) ? '—' : `${Math.round(form.heightCm * 10) / 10} cm`}</small>
              </div>
            )}

            <div className="field">
              <label htmlFor="age-years">Age (years)</label>
              <input id="age-years" data-testid="age-input" type="number" inputMode="numeric" min={MIFFLIN_DERIVATION_AGE_RANGE[0]} max={MIFFLIN_DERIVATION_AGE_RANGE[1]} step="1"
                value={Number.isNaN(form.ageYears) ? '' : form.ageYears}
                onChange={(event) => update('ageYears', numeric(event.target.value))}
                aria-describedby={issueFor('ageYears') ? 'age-error' : undefined} />
              {issueFor('ageYears') ? <p className="planner-error" id="age-error">{issueFor('ageYears')}</p> : <small>Supported: 19–78 years.</small>}
            </div>

            <div className="field">
              <label htmlFor="sex-variant">Formula variant</label>
              <select id="sex-variant" data-testid="sex-select" value={form.biologicalSex} onChange={(event) => update('biologicalSex', event.target.value as BiologicalSex)}>
                <option value="male">Male</option><option value="female">Female</option>
              </select>
              <small>Selects equation constants, not identity.</small>
            </div>

            <div className="field">
              <label htmlFor="activity-level">Activity level</label>
              <select id="activity-level" data-testid="activity-select" value={form.activityLevel} onChange={(event) => update('activityLevel', event.target.value as ActivityLevel)}>
                {ACTIVITY_LEVELS.map((level) => <option key={level} value={level}>{formatActivityLabel(level)}</option>)}
              </select>
              <small>{ACTIVITY_HELP[form.activityLevel]}</small>
              <small data-testid="activity-assumption">Planning assumption: ×{ACTIVITY_MULTIPLIERS[form.activityLevel]} multiplies the selected resting-energy estimate; it is not a measured expenditure.</small>
            </div>

            <div className="field">
              <label className="planner-check" htmlFor="use-body-fat">
                <input id="use-body-fat" data-testid="body-fat-toggle" type="checkbox" checked={form.useBodyFat} onChange={(event) => update('useBodyFat', event.target.checked)} />
                <span>Include body fat percentage</span>
              </label>
              <input aria-label="Body fat percentage" data-testid="body-fat-input" type="number" inputMode="decimal" min="1" max="70" step="0.1" disabled={!form.useBodyFat}
                value={Number.isNaN(form.bodyFatPercentage) ? '' : form.bodyFatPercentage}
                onChange={(event) => update('bodyFatPercentage', numeric(event.target.value))}
                aria-describedby={issueFor('bodyFatPercentage') ? 'body-fat-error' : undefined} />
              {issueFor('bodyFatPercentage')
                ? <p className="planner-error" id="body-fat-error">{issueFor('bodyFatPercentage')}</p>
                : <small>Adds a Katch-McArdle estimate; it does not silently replace your selected equation.</small>}
            </div>

            <div className="field">
              <label htmlFor="primary-equation">Primary resting-energy equation</label>
              <select id="primary-equation" data-testid="equation-select" value={form.primaryEquation} onChange={(event) => update('primaryEquation', event.target.value as BmrEquation)}
                aria-describedby={issueFor('primaryEquation') ? 'equation-error' : 'equation-help'}>
                {BMR_EQUATIONS.map((equation) => (
                  <option key={equation} value={equation} disabled={equation === 'katch_mcardle' && !form.useBodyFat}>{BMR_EQUATION_LABEL[equation]}</option>
                ))}
              </select>
              {issueFor('primaryEquation')
                ? <p className="planner-error" id="equation-error">{issueFor('primaryEquation')}</p>
                : <small id="equation-help">This choice drives TDEE and the goal target. Other available equations remain visible for comparison.</small>}
            </div>
          </div>
          {issueFor('measurements') ? <p className="planner-error" role="alert">{issueFor('measurements')}</p> : null}
        </section>

        <section className="planner-section" aria-labelledby="objective-heading">
          <div className="planner-section-head"><h3 id="objective-heading">Objective</h3></div>
          <div className="workspace-grid three">
            <div className="field">
              <label htmlFor="goal-type">Goal</label>
              <select id="goal-type" data-testid="goal-select" value={form.goalType} onChange={(event) => update('goalType', event.target.value as GoalType)}>
                {GOAL_TYPES.map((goal) => <option key={goal} value={goal}>{formatGoalLabel(goal)}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="split-preference">Distribution</label>
              <select id="split-preference" data-testid="split-select" value={form.splitPreference} onChange={(event) => update('splitPreference', event.target.value as SplitPreference)}>
                {SPLIT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="meals-per-day">Meals per day</label>
              <input id="meals-per-day" data-testid="meals-input" type="number" inputMode="numeric" min="1" max="12" step="1" value={form.mealsPerDay}
                onChange={(event) => update('mealsPerDay', Math.max(1, Math.min(12, Math.round(numeric(event.target.value) || 1))))} />
              <small>Divides totals into per-meal figures.</small>
            </div>
          </div>

          {form.splitPreference === 'custom' ? (
            <div className="planner-custom-split">
              <div className="workspace-grid three">
                {(['protein', 'fat', 'carbohydrate'] as const).map((key) => (
                  <div className="field" key={key}>
                    <label htmlFor={`custom-${key}`}>{macronutrientLabel(key)} (%)</label>
                    <input id={`custom-${key}`} data-testid={`custom-${key}`} type="number" inputMode="decimal" min="0" max="100" step="1"
                      value={Number.isNaN(form.customSplit[key]) ? '' : form.customSplit[key]}
                      onChange={(event) => update('customSplit', { ...form.customSplit, [key]: numeric(event.target.value) })} />
                  </div>
                ))}
              </div>
              {issueFor('customSplit')
                ? <p className="planner-error" data-testid="custom-split-error" role="alert">{issueFor('customSplit')}</p>
                : <p className="status-line good" data-testid="custom-split-ok">Custom split totals 100%.</p>}
            </div>
          ) : null}
        </section>

        {plan ? (
          <>
            <section className="planner-section" aria-labelledby="results-heading" data-testid="planner-results" aria-live="polite">
              <div className="planner-section-head"><h3 id="results-heading">Results</h3></div>
              <div className="planner-headline">
                <div className="planner-headline-primary"><span>Target intake</span><strong data-testid="target-kcal">{plan.targetKcal.toLocaleString()}</strong><small>kcal per day</small></div>
                <dl className="planner-headline-facts">
                  <div><dt>Selected resting-energy estimate</dt><dd data-testid="bmr-primary">{plan.bmr.primaryKcal.toLocaleString()} kcal · {plan.bmr.primaryEquation}</dd></div>
                  <div><dt>Total daily energy expenditure</dt><dd data-testid="tdee-kcal">{plan.tdeeKcal.toLocaleString()} kcal · ×{plan.activityMultiplier}</dd></div>
                  <div><dt>Goal adjustment</dt><dd>{plan.goalDeltaPercent > 0 ? '+' : ''}{plan.goalDeltaPercent}% of expenditure</dd></div>
                  <div><dt>Estimated weekly mass change</dt><dd>{plan.estimatedWeeklyMassChangeKg > 0 ? '+' : ''}{plan.estimatedWeeklyMassChangeKg} kg</dd></div>
                </dl>
              </div>

              <h4>Resting energy by equation</h4>
              <div className="metric-row">
                <div className="metric"><span>Mifflin-St Jeor</span><strong>{plan.bmr.mifflinStJeor.toLocaleString()} kcal</strong></div>
                <div className="metric"><span>Revised Harris-Benedict</span><strong>{plan.bmr.revisedHarrisBenedict.toLocaleString()} kcal</strong></div>
                {plan.bmr.katchMcArdle === undefined ? (
                  <div className="metric" data-testid="katch-absent"><span>Katch-McArdle</span><strong>Add body fat</strong></div>
                ) : (
                  <div className="metric" data-testid="katch-present"><span>Katch-McArdle</span><strong>{plan.bmr.katchMcArdle.toLocaleString()} kcal</strong><p className="help-text">Lean mass {plan.bmr.leanBodyMassKg} kg</p></div>
                )}
              </div>

              <h4>Macronutrients</h4>
              <div className="result-table-wrap" role="region" aria-label="Daily macronutrient targets" tabIndex={0}>
                <table data-testid="macro-table">
                  <thead><tr><th scope="col">Macronutrient</th><th scope="col">Grams</th><th scope="col">kcal</th><th scope="col">% of energy</th><th scope="col">Published range</th><th scope="col">Per meal</th></tr></thead>
                  <tbody>{plan.macronutrients.map((macro) => (
                    <tr key={macro.key}>
                      <th scope="row">{macronutrientLabel(macro.key)}</th><td data-testid={`grams-${macro.key}`}>{macro.grams} g</td><td>{macro.kcal.toLocaleString()}</td><td>{macro.percentOfEnergy}%</td>
                      <td><span className={macro.withinDistributionRange ? 'planner-badge is-inside' : 'planner-badge is-outside'}>{macro.withinDistributionRange ? 'Inside' : 'Outside'}</span><span className="planner-range">{macro.distributionRange[0]}–{macro.distributionRange[1]}%</span></td>
                      <td>{Math.round(macro.grams / form.mealsPerDay)} g</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>

              <p className="help-text planner-reconcile">
                Protein is {plan.proteinGramsPerKg} g/kg against the {PROTEIN_ADEQUACY_G_PER_KG} g/kg adequacy reference. Rounded grams represent {plan.reconciledKcal.toLocaleString()} kcal.
                Published ranges are {DISTRIBUTION_RANGE.carbohydrate[0]}–{DISTRIBUTION_RANGE.carbohydrate[1]}% carbohydrate, {DISTRIBUTION_RANGE.fat[0]}–{DISTRIBUTION_RANGE.fat[1]}% fat, and {DISTRIBUTION_RANGE.protein[0]}–{DISTRIBUTION_RANGE.protein[1]}% protein.
              </p>

              {plan.advisories.length > 0 ? <ul className="planner-advisories" data-testid="planner-advisories">{plan.advisories.map((advisory) => <li key={advisory.code} className={advisory.severity === 'caution' ? 'is-caution' : 'is-info'}><strong>{advisory.scope.replaceAll('_', ' ')}</strong>: {advisory.message}</li>)}</ul> : null}
            </section>

            <section className="planner-section" aria-labelledby="comparison-heading">
              <div className="planner-section-head"><h3 id="comparison-heading">Every goal tier</h3></div>
              <div className="result-table-wrap" role="region" aria-label="Targets for every goal tier" tabIndex={0}>
                <table data-testid="goal-table"><thead><tr><th scope="col">Goal</th><th scope="col">Adjustment</th><th scope="col">Target</th><th scope="col">Weekly change</th></tr></thead>
                  <tbody>{goalComparison.map((candidate) => <tr key={candidate.goalType} aria-current={candidate.goalType === plan.goalType ? 'true' : undefined}><th scope="row">{formatGoalLabel(candidate.goalType)}</th><td>{candidate.goalDeltaPercent > 0 ? '+' : ''}{candidate.goalDeltaPercent}%</td><td>{candidate.targetKcal.toLocaleString()} kcal</td><td>{candidate.estimatedWeeklyMassChangeKg > 0 ? '+' : ''}{candidate.estimatedWeeklyMassChangeKg} kg</td></tr>)}</tbody>
                </table>
              </div>
            </section>

            <section className="planner-section" aria-labelledby="export-heading">
              <div className="planner-section-head"><div><h3 id="export-heading">Export</h3><p className="help-text">Every format includes source measurements, canonical units, selected equation, activity/goal assumptions, calculated outputs, and advisory code, severity, scope, and message.</p></div></div>
              <div className="planner-actions">
                <button className="action-button" type="button" onClick={copyPlan}>Copy Markdown</button>
                <button className="action-button" type="button" onClick={() => { downloadText(planToMarkdown(plan), 'energy-plan.md', 'text/markdown;charset=utf-8'); setNote('Markdown downloaded.'); }}>Download Markdown</button>
                <button className="action-button" type="button" onClick={() => { downloadText(planToCsv(plan), 'energy-plan.csv', 'text/csv;charset=utf-8'); setNote('CSV downloaded.'); }}>Download CSV</button>
                <button className="action-button" type="button" onClick={() => { downloadText(JSON.stringify(plan, null, 2), 'energy-plan.json', 'application/json'); setNote('JSON downloaded with reconstructable inputs, assumptions, and advisories.'); }}>Download JSON</button>
              </div>
              <p className="status-line" role="status" data-testid="planner-status">{note}</p>
            </section>
          </>
        ) : (
          <section className="planner-section" aria-labelledby="blocked-heading">
            <div className="planner-section-head"><h3 id="blocked-heading">Results</h3></div>
            <div className="notice" data-testid="planner-blocked" role="status"><strong>Waiting on supported, valid measurements</strong><ul>{issues.map((issue) => <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>)}</ul></div>
          </section>
        )}
      </div>
    </>
  );
}

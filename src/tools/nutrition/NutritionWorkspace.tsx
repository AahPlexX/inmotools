import { useEffect, useMemo, useState } from 'react';
import { downloadText } from '../../lib/download';
import {
  ACTIVITY_LEVELS,
  DISTRIBUTION_RANGE,
  GOAL_TYPES,
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
  type EnergyPlanInput,
  type GoalType,
  type MacronutrientSplit,
  type SplitPreference,
} from './nutrition-engine';

const AUTOSAVE_KEY = 'inmotools_energy_planner_autosave';

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
  readonly goalType: GoalType;
  readonly splitPreference: SplitPreference;
  readonly customSplit: MacronutrientSplit;
  readonly mealsPerDay: number;
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
  goalType: 'maintenance',
  splitPreference: 'balanced',
  customSplit: { protein: 30, fat: 30, carbohydrate: 40 },
  mealsPerDay: 3,
};

const readAutosave = (): FormState => {
  try {
    const raw = window.localStorage.getItem(AUTOSAVE_KEY);
    if (!raw) return DEFAULT_FORM;
    const parsed = JSON.parse(raw) as Partial<FormState>;
    return { ...DEFAULT_FORM, ...parsed, customSplit: { ...DEFAULT_FORM.customSplit, ...parsed.customSplit } };
  } catch {
    return DEFAULT_FORM;
  }
};

const toInput = (form: FormState): EnergyPlanInput => ({
  weightKg: form.weightKg,
  heightCm: form.heightCm,
  ageYears: form.ageYears,
  biologicalSex: form.biologicalSex,
  activityLevel: form.activityLevel,
  ...(form.useBodyFat ? { bodyFatPercentage: form.bodyFatPercentage } : {}),
  goalType: form.goalType,
  macronutrientSplitPreference: form.splitPreference,
  ...(form.splitPreference === 'custom' ? { customSplit: form.customSplit } : {}),
});

const numeric = (value: string) => (value.trim() === '' ? Number.NaN : Number(value));

export default function NutritionWorkspace() {
  const [form, setForm] = useState<FormState>(readAutosave);
  const [note, setNote] = useState('');

  const update = <Key extends keyof FormState>(key: Key, value: FormState[Key]) =>
    setForm((current) => ({ ...current, [key]: value }));

  const input = useMemo(() => toInput(form), [form]);
  const issues = useMemo(() => validateEnergyPlanInput(input), [input]);
  const plan = useMemo(() => (issues.length === 0 ? calculateEnergyPlan(input) : undefined), [input, issues]);
  const goalComparison = useMemo(() => (issues.length === 0 ? compareGoals(input) : []), [input, issues]);
  const issueFor = (field: string) => issues.find((issue) => issue.field === field)?.message;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try { window.localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(form)); } catch { /* Local storage may be unavailable. */ }
    }, 600);
    return () => window.clearTimeout(timer);
  }, [form]);

  const imperialWeight = Math.round(kgToPounds(form.weightKg) * 10) / 10;
  const imperialHeight = cmToFeetInches(form.heightCm);

  const copyPlan = async () => {
    if (!plan) return;
    try {
      await navigator.clipboard.writeText(planToMarkdown(plan));
      setNote('Plan copied to the clipboard.');
    } catch {
      setNote('Clipboard access was refused. Use a download instead.');
    }
  };

  return (
    <>
      <div className="workspace-header">
        <div>
          <h2>Energy and macronutrient plan</h2>
          <p>Published equations, computed on this device.</p>
        </div>
        <button className="action-button" type="button" onClick={() => { setForm(DEFAULT_FORM); setNote('Reset to defaults.'); }}>
          Reset
        </button>
      </div>

      <div className="workspace-body">
        <section className="planner-section" aria-labelledby="measurements-heading">
          <div className="planner-section-head">
            <h3 id="measurements-heading">Measurements</h3>
            <div className="planner-unit-toggle" role="group" aria-label="Measurement units">
              {(['metric', 'imperial'] as const).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  className="planner-toggle-button"
                  aria-pressed={form.units === unit}
                  onClick={() => update('units', unit)}
                >
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
              <input id="age-years" data-testid="age-input" type="number" inputMode="numeric" min="1" step="1"
                value={Number.isNaN(form.ageYears) ? '' : form.ageYears}
                onChange={(event) => update('ageYears', numeric(event.target.value))}
                aria-describedby={issueFor('ageYears') ? 'age-error' : undefined} />
              {issueFor('ageYears') ? <p className="planner-error" id="age-error">{issueFor('ageYears')}</p> : null}
            </div>

            <div className="field">
              <label htmlFor="sex-variant">Formula variant</label>
              <select id="sex-variant" data-testid="sex-select" value={form.biologicalSex}
                onChange={(event) => update('biologicalSex', event.target.value as BiologicalSex)}>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </select>
              <small>Selects the equation constants, not an identity.</small>
            </div>

            <div className="field">
              <label htmlFor="activity-level">Activity level</label>
              <select id="activity-level" data-testid="activity-select" value={form.activityLevel}
                onChange={(event) => update('activityLevel', event.target.value as ActivityLevel)}>
                {ACTIVITY_LEVELS.map((level) => (
                  <option key={level} value={level}>{formatActivityLabel(level)}</option>
                ))}
              </select>
              <small>{ACTIVITY_HELP[form.activityLevel]}</small>
            </div>

            <div className="field">
              <label className="planner-check" htmlFor="use-body-fat">
                <input id="use-body-fat" data-testid="body-fat-toggle" type="checkbox" checked={form.useBodyFat}
                  onChange={(event) => update('useBodyFat', event.target.checked)} />
                <span>Include body fat percentage</span>
              </label>
              <input aria-label="Body fat percentage" data-testid="body-fat-input" type="number" inputMode="decimal"
                min="1" max="70" step="0.1" disabled={!form.useBodyFat}
                value={Number.isNaN(form.bodyFatPercentage) ? '' : form.bodyFatPercentage}
                onChange={(event) => update('bodyFatPercentage', numeric(event.target.value))}
                aria-describedby={issueFor('bodyFatPercentage') ? 'body-fat-error' : undefined} />
              {issueFor('bodyFatPercentage')
                ? <p className="planner-error" id="body-fat-error">{issueFor('bodyFatPercentage')}</p>
                : <small>Adds the Katch-McArdle equation, which uses lean mass.</small>}
            </div>
          </div>
        </section>

        <section className="planner-section" aria-labelledby="objective-heading">
          <div className="planner-section-head"><h3 id="objective-heading">Objective</h3></div>
          <div className="workspace-grid three">
            <div className="field">
              <label htmlFor="goal-type">Goal</label>
              <select id="goal-type" data-testid="goal-select" value={form.goalType}
                onChange={(event) => update('goalType', event.target.value as GoalType)}>
                {GOAL_TYPES.map((goal) => <option key={goal} value={goal}>{formatGoalLabel(goal)}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="split-preference">Distribution</label>
              <select id="split-preference" data-testid="split-select" value={form.splitPreference}
                onChange={(event) => update('splitPreference', event.target.value as SplitPreference)}>
                {SPLIT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="meals-per-day">Meals per day</label>
              <input id="meals-per-day" data-testid="meals-input" type="number" inputMode="numeric" min="1" max="12" step="1"
                value={form.mealsPerDay}
                onChange={(event) => update('mealsPerDay', Math.max(1, Math.min(12, Math.round(numeric(event.target.value) || 1))))} />
              <small>Divides the totals into per-meal figures.</small>
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
                <div className="planner-headline-primary">
                  <span>Target intake</span>
                  <strong data-testid="target-kcal">{plan.targetKcal.toLocaleString()}</strong>
                  <small>kcal per day</small>
                </div>
                <dl className="planner-headline-facts">
                  <div>
                    <dt>Basal metabolic rate</dt>
                    <dd data-testid="bmr-primary">{plan.bmr.primaryKcal.toLocaleString()} kcal · {plan.bmr.primaryEquation}</dd>
                  </div>
                  <div>
                    <dt>Total daily energy expenditure</dt>
                    <dd data-testid="tdee-kcal">{plan.tdeeKcal.toLocaleString()} kcal · ×{plan.activityMultiplier}</dd>
                  </div>
                  <div>
                    <dt>Goal adjustment</dt>
                    <dd>{plan.goalDeltaPercent > 0 ? '+' : ''}{plan.goalDeltaPercent}% of expenditure</dd>
                  </div>
                  <div>
                    <dt>Estimated weekly mass change</dt>
                    <dd>{plan.estimatedWeeklyMassChangeKg > 0 ? '+' : ''}{plan.estimatedWeeklyMassChangeKg} kg</dd>
                  </div>
                </dl>
              </div>

              <h4>Basal metabolic rate by equation</h4>
              <div className="metric-row">
                <div className="metric"><span>Mifflin-St Jeor</span><strong>{plan.bmr.mifflinStJeor.toLocaleString()} kcal</strong></div>
                <div className="metric"><span>Revised Harris-Benedict</span><strong>{plan.bmr.revisedHarrisBenedict.toLocaleString()} kcal</strong></div>
                {plan.bmr.katchMcArdle === undefined ? (
                  <div className="metric" data-testid="katch-absent"><span>Katch-McArdle</span><strong>Add body fat</strong></div>
                ) : (
                  <div className="metric" data-testid="katch-present">
                    <span>Katch-McArdle</span>
                    <strong>{plan.bmr.katchMcArdle.toLocaleString()} kcal</strong>
                    <p className="help-text">Lean mass {plan.bmr.leanBodyMassKg} kg</p>
                  </div>
                )}
              </div>

              <h4>Macronutrients</h4>
              <div className="result-table-wrap" role="region" aria-label="Daily macronutrient targets" tabIndex={0}>
                <table data-testid="macro-table">
                  <thead>
                    <tr>
                      <th scope="col">Macronutrient</th>
                      <th scope="col">Grams</th>
                      <th scope="col">kcal</th>
                      <th scope="col">% of energy</th>
                      <th scope="col">Published range</th>
                      <th scope="col">Per meal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.macronutrients.map((macro) => (
                      <tr key={macro.key}>
                        <th scope="row">{macronutrientLabel(macro.key)}</th>
                        <td data-testid={`grams-${macro.key}`}>{macro.grams} g</td>
                        <td>{macro.kcal.toLocaleString()}</td>
                        <td>{macro.percentOfEnergy}%</td>
                        <td>
                          <span className={macro.withinDistributionRange ? 'planner-badge is-inside' : 'planner-badge is-outside'}>
                            {macro.withinDistributionRange ? 'Inside' : 'Outside'}
                          </span>
                          <span className="planner-range">{macro.distributionRange[0]}–{macro.distributionRange[1]}%</span>
                        </td>
                        <td>{Math.round(macro.grams / form.mealsPerDay)} g</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <p className="help-text planner-reconcile">
                Protein is {plan.proteinGramsPerKg} g/kg against the {PROTEIN_ADEQUACY_G_PER_KG} g/kg adequacy reference.
                Rounded grams represent {plan.reconciledKcal.toLocaleString()} kcal.
                Published ranges are the Acceptable Macronutrient Distribution Range
                ({DISTRIBUTION_RANGE.carbohydrate[0]}–{DISTRIBUTION_RANGE.carbohydrate[1]}% carbohydrate,
                {' '}{DISTRIBUTION_RANGE.fat[0]}–{DISTRIBUTION_RANGE.fat[1]}% fat,
                {' '}{DISTRIBUTION_RANGE.protein[0]}–{DISTRIBUTION_RANGE.protein[1]}% protein).
              </p>

              {plan.advisories.length > 0 ? (
                <ul className="planner-advisories" data-testid="planner-advisories">
                  {plan.advisories.map((advisory) => (
                    <li key={advisory.code} className={advisory.severity === 'caution' ? 'is-caution' : 'is-info'}>
                      {advisory.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <section className="planner-section" aria-labelledby="comparison-heading">
              <div className="planner-section-head"><h3 id="comparison-heading">Every goal tier</h3></div>
              <div className="result-table-wrap" role="region" aria-label="Targets for every goal tier" tabIndex={0}>
                <table data-testid="goal-table">
                  <thead>
                    <tr>
                      <th scope="col">Goal</th>
                      <th scope="col">Adjustment</th>
                      <th scope="col">Target</th>
                      <th scope="col">Weekly change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {goalComparison.map((candidate) => (
                      <tr key={candidate.goalType} aria-current={candidate.goalType === plan.goalType ? 'true' : undefined}>
                        <th scope="row">{formatGoalLabel(candidate.goalType)}</th>
                        <td>{candidate.goalDeltaPercent > 0 ? '+' : ''}{candidate.goalDeltaPercent}%</td>
                        <td>{candidate.targetKcal.toLocaleString()} kcal</td>
                        <td>{candidate.estimatedWeeklyMassChangeKg > 0 ? '+' : ''}{candidate.estimatedWeeklyMassChangeKg} kg</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="planner-section" aria-labelledby="export-heading">
              <div className="planner-section-head"><h3 id="export-heading">Export</h3></div>
              <div className="planner-actions">
                <button className="action-button" type="button" onClick={copyPlan}>Copy Markdown</button>
                <button className="action-button" type="button"
                  onClick={() => { downloadText(planToMarkdown(plan), 'energy-plan.md', 'text/markdown;charset=utf-8'); setNote('Markdown downloaded.'); }}>
                  Download Markdown
                </button>
                <button className="action-button" type="button"
                  onClick={() => { downloadText(planToCsv(plan), 'energy-plan.csv', 'text/csv;charset=utf-8'); setNote('CSV downloaded.'); }}>
                  Download CSV
                </button>
                <button className="action-button" type="button"
                  onClick={() => { downloadText(JSON.stringify(plan, null, 2), 'energy-plan.json', 'application/json'); setNote('JSON downloaded.'); }}>
                  Download JSON
                </button>
              </div>
              <p className="status-line" role="status" data-testid="planner-status">{note}</p>
            </section>
          </>
        ) : (
          <section className="planner-section" aria-labelledby="blocked-heading">
            <div className="planner-section-head"><h3 id="blocked-heading">Results</h3></div>
            <div className="notice" data-testid="planner-blocked" role="status">
              <strong>Waiting on valid measurements</strong>
              <ul>{issues.map((issue) => <li key={`${issue.field}-${issue.message}`}>{issue.message}</li>)}</ul>
            </div>
          </section>
        )}
      </div>
    </>
  );
}

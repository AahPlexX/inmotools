---
tool: energy-macro-planner
folder: src/tools/nutrition
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-energy-macro-planner-design.md
tracker: src/tools/nutrition/TRACKER.md
updated: 2026-10-05
---

# Energy & Macro Planner — tracker

## Resume here

47 requirements: 25 verified, 9 implemented, 12 partial, 1 missing, 0 prohibited. Next action: the Open work list, item 1. No blocker.

## Documents

- Spec: [2026-10-05-energy-macro-planner-design.md](../../../docs/superpowers/specs/2026-10-05-energy-macro-planner-design.md)
- Older design and plan (history): [2026-09-03-energy-macro-planner-design.md](../../../docs/superpowers/specs/2026-09-03-energy-macro-planner-design.md), [2026-09-03-energy-macro-planner.md](../../../docs/superpowers/plans/2026-09-03-energy-macro-planner.md)
- Tool README: [README.md](README.md)
- Dark-theme contrast task: [T-repository-dark-contrast-20261004-b7d2](../../../.tasks/items/T-repository-dark-contrast-20261004-b7d2.md)
- Task file: [T-energy-macro-planner-20261006-7cbb](../../../.tasks/items/T-energy-macro-planner-20261006-7cbb.md)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/nutrition.test.ts`, `tests/unit/nutrition-audit-regressions.test.ts`; browser tests: `tests/e2e/nutrition.spec.ts`, `tests/e2e/nutrition-audit.spec.ts`

## Requirement status

`unit` = `tests/unit/nutrition*.test.ts`; `e2e` = `tests/e2e/nutrition*.spec.ts` unless named.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| EMP-R01 | verified | e2e "blocks ages outside the published Mifflin derivation sample and the reproduced nonpositive case"; unit "rejects non-positive measurements and names the field", "restricts age to the original Mifflin-St Jeor derivation sample", "requires a whole-number age" |  |
| EMP-R02 | verified | unit "restricts age to the original Mifflin-St Jeor derivation sample"; e2e "blocks ages outside the published Mifflin derivation sample and the reproduced nonpositive case" |  |
| EMP-R03 | verified | unit "rejects the reproduced 1 kg, 1 cm extreme instead of producing negative calories"; e2e "blocks ages outside the published Mifflin derivation sample and the reproduced nonpositive case" |  |
| EMP-R04 | verified | unit "matches Mifflin-St Jeor for both formula variants" |  |
| EMP-R05 | verified | e2e "switches units and keeps the underlying measurement"; e2e "unit toggles do not round the canonical metric measurements"; unit "round-trips imperial conversions" |  |
| EMP-R06 | partial | e2e "adds Katch-McArdle when body fat is supplied but changes primary only after explicit selection"; unit "reports body fat bounds" | Supplying body fat and its bounds are tested; the switch-back on untick is not |
| EMP-R07 | missing |  | The target field is kg only and says so |
| EMP-R08 | verified | unit "matches Mifflin-St Jeor for both formula variants", "matches the revised Harris-Benedict equation"; e2e "computes basal rate, expenditure, target, and macronutrient grams" |  |
| EMP-R09 | verified | unit "derives Katch-McArdle from lean body mass"; e2e "adds Katch-McArdle when body fat is supplied but changes primary only after explicit selection" |  |
| EMP-R10 | verified | unit "defaults to Mifflin-St Jeor even when body fat is supplied", "uses Katch-McArdle only when explicitly selected", "allows Revised Harris-Benedict to be explicitly selected", "requires body-fat data before Katch-McArdle can be primary"; e2e "adds Katch-McArdle when body fat is supplied but changes primary only after explicit selection" |  |
| EMP-R11 | verified | unit "applies the activity multiplier and goal delta"; e2e "shows the selected activity multiplier as a dynamic planning assumption" |  |
| EMP-R12 | partial | unit "anchors protein in grams per kilogram and leaves carbohydrate the remainder" | The engine's worked text is tested; the disclosure in the page is not |
| EMP-R13 | implemented | `details.planner-tip` elements in `NutritionWorkspace.tsx` | No test opens them |
| EMP-R14 | verified | unit "applies the activity multiplier and goal delta", "keeps maintenance equal to total daily energy expenditure" |  |
| EMP-R15 | verified | unit "solves a timeline target from the 7700 kcal/kg heuristic" | The field bounds and the goal-mode selector are not driven by a browser test |
| EMP-R16 | implemented | `calculateEnergyPlan` fixed_target branch in `nutrition-engine.ts` | No test covers the fixed-target mode |
| EMP-R17 | verified | unit "returns one plan per goal tier while preserving the selected equation", "keeps the goal comparison on percent tiers even when the active plan is a timeline" |  |
| EMP-R18 | partial | unit "solves a timeline target from the 7700 kcal/kg heuristic" | The kilogram value is tested; the pound figure is not |
| EMP-R19 | partial | unit "solves a timeline target from the 7700 kcal/kg heuristic" | Meals per day is kept in the exports (tested) but no test checks the per-meal figures or the remainder |
| EMP-R20 | implemented | `KJ_PER_KCAL` in `NutritionWorkspace.tsx` | No test checks the kJ figure |
| EMP-R21 | verified | unit "resolves every preset and defaults custom without values to balanced", "splits energy into macronutrients that sum closely to the target"; e2e "computes basal rate, expenditure, target, and macronutrient grams" |  |
| EMP-R22 | verified | e2e "rejects a custom split that does not total one hundred percent"; unit "honours a valid custom split", "requires a custom split totalling one hundred percent" |  |
| EMP-R23 | partial | unit "anchors protein in grams per kilogram and leaves carbohydrate the remainder" | The engine's protein and remainder are tested; the over-target caution and the page fields are not |
| EMP-R24 | verified | unit "flags the balanced preset as inside every published range", "flags low carbohydrate as leaving the published ranges" |  |
| EMP-R25 | partial | unit "splits energy into macronutrients that sum closely to the target" | Reconciliation is tested; the protein adequacy advisory is not |
| EMP-R26 | implemented | `role="region"` with `tabIndex` in `NutritionWorkspace.tsx` | Overflow is tested, the region itself is not |
| EMP-R27 | verified | unit "flags a target below the selected resting estimate and planning floor without returning nonpositive energy", "labels the planning floor as a planning reference, not a clinical minimum"; e2e "reports a low-intake advisory without withholding positive numbers" |  |
| EMP-R28 | verified | unit "flags a weekly change above 1 percent of body mass" |  |
| EMP-R29 | partial | unit "anchors protein in grams per kilogram and leaves carbohydrate the remainder" | The value is tested; the band label is not |
| EMP-R30 | verified | unit "anchors protein in grams per kilogram and leaves carbohydrate the remainder" |  |
| EMP-R31 | verified | unit "anchors protein in grams per kilogram and leaves carbohydrate the remainder" |  |
| EMP-R32 | verified | e2e "downloaded CSV retains low-intake advisory context"; unit "preserves every advisory scope and metadata field in CSV exports", "preserves every advisory scope and metadata field in Markdown exports" |  |
| EMP-R33 | implemented | `aria-live="polite"` on `planner-results` in `NutritionWorkspace.tsx` | Not asserted by a test |
| EMP-R34 | verified | e2e "exports reconstructable inputs and restores autosaved measurements" |  |
| EMP-R35 | verified | e2e "saves, restores, persists, and permanently deletes a complete named input preset" |  |
| EMP-R36 | implemented | `savePreset` in `NutritionWorkspace.tsx` | Only the successful path is tested |
| EMP-R37 | partial | e2e "exports reconstructable inputs and restores autosaved measurements" | Reset to the defaults is tested; that presets survive is not |
| EMP-R38 | implemented | `copyPlan` in `NutritionWorkspace.tsx` | The button is checked for presence only |
| EMP-R39 | partial | unit "renders Markdown with original inputs, units, equation, assumptions, and outputs"; unit "preserves every advisory scope and metadata field in Markdown exports" | The content is tested; the download button is checked for presence only |
| EMP-R40 | verified | e2e "exports reconstructable inputs and restores autosaved measurements"; unit "renders CSV with reconstructable inputs and every macronutrient" |  |
| EMP-R41 | implemented | JSON download button in `NutritionWorkspace.tsx` | No test downloads the JSON |
| EMP-R42 | partial | unit "solves a timeline target from the 7700 kcal/kg heuristic" | Meals and goal mode are tested; the other fields are not |
| EMP-R43 | verified | e2e "catalog link, exact alias, and generic route open the same local workspace" |  |
| EMP-R44 | implemented | Pure functions in `nutrition-engine.ts`; `energy-macro-planner.meta.ts` privacy text | No test blocks the network |
| EMP-R45 | partial | `.tasks/items/T-repository-dark-contrast-20261004-b7d2.md` | Colours come from the shared theme tokens; the workspace fails `color-contrast` in dark |
| EMP-R46 | partial | e2e "stays readable without overflow or collisions at <viewport>" | Tested at 320, 390, 844×390, 768 and 1440 px; 1920 to 2560 px and tap-target height not tested |
| EMP-R47 | verified | e2e "stays readable without overflow or collisions at <viewport>"; e2e (`tests/e2e/accessibility.spec.ts`) "has no serious or critical axe violations at <route>" |  |

## Open work

1. Build: EMP-R07.
2. Finish: EMP-R06, EMP-R12, EMP-R18, EMP-R19, EMP-R23, EMP-R25, EMP-R29, EMP-R37, EMP-R39, EMP-R42, EMP-R45, EMP-R46.
3. Add tests for: EMP-R13, EMP-R16, EMP-R20, EMP-R26, EMP-R33, EMP-R36, EMP-R38, EMP-R41, EMP-R44.

## Known limitations

- Adults 19–78 only; not for children, pregnancy or breastfeeding.
- Outputs are planning estimates; predicted and measured metabolic rate differ between individuals.
- The 7,700 kcal/kg conversion is a planning heuristic.
- No food database or meal logging.

## Verification evidence

- 2026-10-05, `expand/energy-macro-planner` from `main` @ `a582f5dc`: `pnpm tool:check energy-macro-planner --base origin/main` result in the task file.

## Change log

- 2026-10-05 — Created per `docs/DOCUMENTATION_STANDARD.md`.

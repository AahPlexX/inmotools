# Energy & Macronutrient Planner — Design

**As of:** 2026-09-03

## Purpose

Add a local-first workbench that turns physiological metrics and an activity tier into basal metabolic rate, total daily energy expenditure, a goal-adjusted calorie target, and macronutrient gram allocations. It is a pure stateless calculator: no network calls, no datasets, no authentication.

The suite catalog currently covers media, data, developer, hardware, geometry, and regex work. It contains no physiological or nutritional computation, so this suite does not overlap an existing tool.

## Scope boundary

This is a planning calculator, not clinical guidance. The interface reports what the published equations produce and where a result leaves a published reference range. It does not diagnose, prescribe, or recommend a course of action, and its copy must not imply otherwise.

## Reference values

Every constant below is taken from a primary or authoritative source rather than convention.

| Quantity | Value | Source |
| --- | --- | --- |
| Mifflin-St Jeor, male | `10·kg + 6.25·cm − 5·age + 5` | Mifflin MD, St Jeor ST et al., *Am J Clin Nutr* 1990;51:241–7 (PMID 2305711) |
| Mifflin-St Jeor, female | `10·kg + 6.25·cm − 5·age − 161` | as above |
| Revised Harris-Benedict, male | `88.362 + 13.397·kg + 4.799·cm − 5.677·age` | Roza AM, Shizgal HM, 1984 revision |
| Revised Harris-Benedict, female | `447.593 + 9.247·kg + 3.098·cm − 4.330·age` | as above |
| Katch-McArdle | `370 + 21.6·LBM`, `LBM = kg·(1 − bodyFat/100)` | Katch-McArdle lean-mass equation |
| Activity multipliers | 1.2 / 1.375 / 1.55 / 1.725 / 1.9 | Standard PAL tiers; FAO reports sustainable PAL spanning roughly 1.1–2.5, so all five sit inside the physiological range |
| Energy density | protein 4, carbohydrate 4, fat 9 kcal/g | Atwater general factors (FAO; NIH/NCBI) |
| Distribution ranges | carbohydrate 45–65%, fat 20–35%, protein 10–35% of energy | Acceptable Macronutrient Distribution Range, Institute of Medicine Food and Nutrition Board 2002/2005 |
| Protein adequacy reference | 0.8 g/kg body mass | Dietary Reference Intakes recommended dietary allowance |
| Mass-energy equivalence | ~7700 kcal per kg | Widely used planning heuristic; reported as an estimate only |

Goal deltas are expressed as a proportion of total daily energy expenditure rather than a fixed calorie count so they scale with body size: maintenance 0%, mild deficit −10%, moderate deficit −20%, mild surplus +10%, moderate surplus +20%.

### Low-intake advisory

No authoritative body publishes a single universal calorie floor. Rather than present a fabricated clinical threshold, the advisory is anchored on two defensible signals:

- the target falling below the subject's own computed basal metabolic rate, which is derived rather than asserted; and
- the target falling below the widely used planning floors of 1200 kcal for female and 1500 kcal for male formulas, which are labelled as commonly used planning floors and not as clinical minimums.

Both are reported as advisories alongside the computed values, never as a refusal to compute.

## Architecture

Two modules, matching the pattern used by every other suite:

- `src/tools/nutrition/nutrition-engine.ts` — pure functions and exported constants. No React, no DOM, no I/O.
- `src/tools/nutrition/NutritionWorkspace.tsx` — the interface. Holds all state, calls the engine, renders results.

Registration follows the existing mechanism: a `catalog.ts` entry, a lazy loader in `tools/workspaces.tsx`, and a short route alias in `App.tsx`.

### Engine contract

`validateEnergyPlanInput(input)` returns a list of field-scoped issues, each naming the offending field and its permitted bounds. It never throws, so the interface can render inline messages while the user types.

`calculateEnergyPlan(input)` throws when validation fails and otherwise returns:

- all applicable basal metabolic rate estimates, with Katch-McArdle omitted rather than failing when body fat percentage is absent;
- the lean body mass used, when applicable;
- which equation was selected as primary, and why: Katch-McArdle when body fat is supplied, otherwise Mifflin-St Jeor;
- the activity multiplier and resulting total daily energy expenditure;
- the goal delta and target intake;
- protein, fat, and carbohydrate as grams, kilocalories, and percent of energy, each flagged against its distribution range;
- protein grams per kilogram measured against the adequacy reference;
- the calorie total implied by the rounded grams, so the interface can show reconciliation honestly instead of hiding rounding drift; and
- an estimated weekly mass change.

Custom splits are validated to sum to 100%.

## Interface

A single column of stacked, labelled sections rather than a dense dashboard, because every value here is a number with a unit and numbers need room to breathe.

1. **Measurements** — mass, stature, age, formula variant, activity tier, optional body fat.
2. **Objective** — goal tier and distribution framework, with custom percentage fields appearing only when the custom framework is selected.
3. **Results** — the target and its components, the three equations side by side, the macronutrient table, and any advisories.
4. **Comparison** — all five goal tiers at once, so the chosen target has context.
5. **Export** — copy and download.

### Quality-of-life features

Unit switching between metric and imperial; a per-meal divisor; all five goals compared simultaneously; every equation shown rather than only the selected one; distribution-range badges; protein per kilogram; estimated weekly mass change; rounding reconciliation; copy to clipboard; Markdown, CSV, and JSON download; local autosave with restore; and reset to defaults.

### Responsiveness and legibility

The layout must hold from a 320 px portrait phone to a wide desktop, including landscape phones where vertical space is scarce.

- Every grid collapses to a single column on narrow viewports; no fixed pixel widths on text containers.
- The macronutrient table sits in a keyboard-reachable, labelled scroll region, matching the fix applied to the cron schedule table.
- Numeric readouts use `min-width: 0` and wrap rather than overlapping; long labels never share a line with their value on narrow widths.
- Tap targets stay at least 44 px tall.
- Focus is visible, motion preferences are respected, and the results region announces updates politely.

## Testing

Unit tests assert each equation against hand-computed values, Katch-McArdle omission, multiplier and goal arithmetic, split percentages summing to the target, custom-split validation, boundary errors with their bounds, and advisory triggers.

Browser tests assert the catalog link and both routes resolve, a calculation renders, body fat adds the third equation, the custom split rejects a bad sum, export controls exist, and the layout does not overflow horizontally at 320 px portrait and at landscape phone dimensions. The catalog-driven accessibility sweep covers the new route automatically.

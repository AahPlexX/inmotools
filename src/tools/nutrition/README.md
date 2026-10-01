# Energy and macronutrient planner

Local-only suite. Engine in `nutrition-engine.ts`, interface in `NutritionWorkspace.tsx`. Design history lives in `docs/superpowers/specs/2026-09-03-energy-macro-planner-design.md` and is not replaced by this note.

## What it calculates

- Resting energy from Mifflin-St Jeor, revised Harris-Benedict, and Katch-McArdle when body fat is supplied.
- Expenditure from the five activity multipliers, then a target from a percent tier, a target mass over a number of weeks (7,700 kcal/kg heuristic), or a fixed kilocalorie number.
- Macros from a percent split, or from protein grams per kilogram plus a fat share.
- Body mass index screening band, fiber at 14 g/1,000 kcal, and the EFSA total-water adequate intake.
- Markdown, CSV, and JSON exports that keep inputs, assumptions, and advisories.

## Scope

Adults 19–78, matching the Mifflin-St Jeor derivation sample. Not for children, pregnancy, or breastfeeding. Outputs are planning estimates, not clinical guidance.

# Energy & Macronutrient Planner — Implementation Plan

**As of:** 2026-09-03
**Design:** `docs/superpowers/specs/2026-09-03-energy-macro-planner-design.md`

## Status

Complete. Registered as the `energy-macro-planner` suite with the `#/energy-macro-planner` alias.

## Slices

1. **Engine.** `src/tools/nutrition/nutrition-engine.ts` — exported reference constants, the three basal metabolic rate equations, lean body mass, activity and goal arithmetic, split resolution, distribution-range checks, advisories, goal comparison, unit conversion, and Markdown/CSV serialisation. Pure functions only.
2. **Engine tests.** `tests/unit/nutrition.test.ts` — 27 assertions covering each equation against hand-computed values, Katch-McArdle omission and preference, multiplier and goal arithmetic, Atwater gram conversion, split presets and custom validation, boundary errors, advisory triggers, goal comparison ordering, imperial round-tripping, and export shape.
3. **Interface.** `src/tools/nutrition/NutritionWorkspace.tsx` — measurements, objective, results, goal comparison, and export sections with inline field validation, unit switching, per-meal division, autosave, reset, and clipboard plus three download formats.
4. **Styles.** Appended to `src/styles.css`. Grids use `auto-fit` with `minmax(min(100%, …), 1fr)` so clusters reflow at any width rather than at fixed breakpoints; a landscape-phone height query tightens vertical rhythm only.
5. **Registration.** Catalog entry and `ToolSlug` union in `src/catalog.ts`, lazy loader in `src/tools/workspaces.tsx`, route alias in `src/App.tsx`.
6. **Browser tests.** `tests/e2e/nutrition.spec.ts` — routing, computation against hand-checked figures, Katch-McArdle addition, custom-split rejection, low-intake advisory, unit switching, export and autosave, plus a five-viewport sweep asserting no horizontal document overflow, no overlapping text rectangles, no clipped containers, and no serious or critical axe violations.

## Verification

- 156 unit tests pass.
- Build clean including `tsc --noEmit`; the suite code-splits into its own chunk.
- 24 browser tests for this suite pass across both projects; the catalog-driven accessibility sweep covers the new route automatically.
- Layout confirmed by screenshot at 320 px portrait, 844 px landscape phone, and 1440 px desktop.

## Deliberately excluded

Micronutrients, hydration targets, meal planning, and food databases. Each would require a dataset or external service, which the privacy model and the suite's stateless-utility constraint rule out.

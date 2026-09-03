# Done

## TASK-007: Add the Energy & Macronutrient Planner
**Priority:** P1 | **Tags:** local-first, calculator, accessibility, responsive

Shipped the `energy-macro-planner` suite with the `#/energy-macro-planner` alias. A pure stateless engine computes basal metabolic rate from Mifflin-St Jeor, the revised Harris-Benedict equation, and Katch-McArdle when body fat is supplied, then derives daily energy expenditure, a goal-adjusted target, and macronutrient grams using the Atwater factors. Results are checked against the Acceptable Macronutrient Distribution Range and the protein adequacy reference, with advisories for targets below basal rate or the commonly used planning floors. Covered by 27 unit assertions and 24 browser tests, including a five-viewport sweep that asserts no horizontal overflow, no overlapping text, no clipped containers, and no serious or critical accessibility violations.

---

## TASK-002: Complete JSON Lattice Studio
**Priority:** P0 | **Tags:** graph, local-first, editor, worker

Shipped JSON Lattice Studio as the `json-lattice` catalog entry with the `#/json-lattice` route alias. Slice 3 history, ELK worker layout, and SVG/CSV/raster export are in place alongside the CodeMirror editor, dual-layer viewport, minimap, inspector, and the inline edit, collapse, search, diff, privacy, schema, JSONPath, and DuckDB SQL workflows. Covered by eleven lattice unit suites and `tests/e2e/lattice.spec.ts`, including desktop and mobile accessibility and overflow checks. Deployed by GitHub Actions run 33587212287.

---

## TASK-001: Add PlanCraft Studio floor-plan tool
**Priority:** P0 | **Tags:** architecture, canvas, local-first

Implemented PlanCraft Studio as InmoTools tool 21 with worker-offloaded geometry, responsive dual-canvas drafting, transactional history, local autosave, accessibility, and vector export pipelines. Catalog-link and route validation completed successfully in GitHub Actions run 33351325621.

---

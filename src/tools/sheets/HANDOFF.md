# Tabular Sheet Workstation — agent handoff

Suite id: `sheets`. Path: `src/tools/sheets/`. Catalog slug: `tabular-sheet-workstation`.
Draft PR: this branch `feature/tabular-sheet-wave-b` → `main` only. Do not merge. Do not open a second PR. Do not reuse `feature/tabular-sheet-parity` or `feature/tabular-sheet-wave-a`. Do not touch unrelated tools.

**Tip SHA:** `TIP_PENDING`  
**Last focused-gate code:** `TIP_PENDING`  
**Workstream:** **Wave B** (local PivotTable UX + GETPIVOTDATA subset) on top of merged PR #73 Wave A / docs stamp PR #74 / #71 P1–P16 / docs PR #72.

## Merge status (PR #73 + #74)

- CoS squash-merged PR #73 onto `main` at `4dcc856bc97027862342513cdea7eb769c0ffbc1` (`feat(sheets): Wave A Formula.js, spill, and export comments (#73)`). Product tip is that squash. Do not push to `feature/tabular-sheet-wave-a`.
- Docs PR #74 stamped HANDOFF to that squash (`e6cddbe`). Parent of the Wave A squash is `6776107f946b16bfe4edddc275ea5a1af234d7fb`. Product code from `feature/tabular-sheet-wave-a` is on `main`.
- Prior: CoS squash-merged PR #71 at `b582c34dea4ba97ab7080743dc290eeb45946b54`; docs PR #72 stamped HANDOFF to that squash (`6776107f946b16bfe4edddc275ea5a1af234d7fb`).
- This Wave B branch rebases onto `origin/main` after that docs stamp.
- Repository-wide validate remaining reds are **out-of-suite** e2e (same class as PR #70 / #71). That is not a sheets regression and is **not** a claim that the full Pages suite is green.

## What works

- FEATURE_MATRIX 1–36 remain `done`. Approved gap ledger P1–P16 remain `done`. Wave A rows WA1–WA3 remain `done`. Wave B rows WB1–WB2 are `done` with focused evidence.
- Portable DAG remains SSOT for the local grid. `@formulajs/formulajs@4.6.1` (exact pin, no `^`) supplies implementations for names the local catalog does not own.
- Local PivotTable: contiguous source range with a header row; row / column / value / filter fields; aggregations SUM, COUNT, AVERAGE, MIN, MAX. Auto-refresh on commit plus explicit Refresh. No server.
- **Placement:** default is a new sheet named `PivotN` with the table at A1. Alternative is a destination cell on the current sheet; that rectangle is overwritten and other cells are not shifted.
- GETPIVOTDATA subset reads those in-house pivot defs from formulas: grand total, one field/item, and row+column pairs. Data field may be `Amount` or `Sum of Amount`.
- P16 client harden unchanged: no hover-only, no overlap at phone/tablet CSS widths, long-press + click, tap/focus formula help, anti-slop sheets-only copy. Proof is `CLIENT_VIEWPORTS`. `P16_PROOF_NOT_ACCEPTED`: iPhone 13, `mobile-chromium`.

## Pivot / GETPIVOTDATA limitations (honest)

- In-house local aggregation only. Not an Excel pivot cache, not slicers, not OLAP, not Power Pivot, not Univer Pro.
- Filter fields restrict source rows in the pivot panel. They are not written as Excel page-fields above the table.
- Multiple column fields share one header row, joined with ` | `.
- Empty row/column combinations are blank in the grid. GETPIVOTDATA on a missing item writes `#REF!`.
- Destination overwrite does not insert/shift cells. Source and destination on the same sheet must not overlap.
- GETPIVOTDATA does not read Excel-imported pivot caches. Date grouping, calculated fields, and GETPIVOTDATA from a non-pivot cell are out.
- COUNT is matching source-row count in the group, not Excel's Count Numbers vs COUNTA split.

## P16 / responsive proof (PR review must enforce)

Do **not** treat iPhone 13 or the `mobile-chromium` Playwright project as the only mobile gate. P16 and any responsive parity UI pass only when the CSS-width matrix is green on `desktop-chromium` via `page.setViewportSize`.

Portrait (narrow phone → tablet): 320×740, 360×800, 390×844, 412×915, 430×932, 768×1024  
Landscape (same widths, swapped): 740×320, 800×360, 844×390, 915×412, 932×430, 1024×768

Pivot chrome is tap/click (no hover-only) and stacks at ~320–430 CSS px.

## Sheets gates (green at last focused-gate code)

```bash
# focused units; pnpm build pass
# desktop-chromium sheets spec
# P16 matrix 12/12 (6 portrait + 6 landscape)
```

Counts last proven green on feature-branch stamp `c0da201e08a7e062b78299a6b521a1fad767c203`, which is included in squash / product tip `4dcc856bc97027862342513cdea7eb769c0ffbc1`. CoS sets last focused-gate to that squash. Verify commands:

```bash
pnpm exec vitest run tests/unit/sheets-wiring.test.ts tests/unit/sheets-stage2.test.ts tests/unit/sheets-formula.test.ts tests/unit/sheets-persist.test.ts tests/unit/sheets-parity.test.ts tests/unit/sheets-wave-a.test.ts tests/unit/sheets-wave-b.test.ts

pnpm build

# P16 device-agnostic matrix — required. Not an iPhone 13-only story.
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at'

pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium
```

## Known out-of-suite CI reds

Do **not** claim the full Pages / PR validate suite is green. Validate may fail on the same out-of-suite e2e class as PR #70 / #71 / #73. **Do not chase or edit those tools:**

- `web-layout-studio` axe
- `svg-sprite-compiler` axe
- stale lazy chunk
- Hardware Packet Inspector
- GeoJSON Simplifier
- Python `re` named groups
- `crystal-lattice-studio` mobile

Catalog / lockfile edits select `__FULL_SUITE__` via `scripts/select-e2e-specs.mjs`. That is not a sheets regression.

## Excluded — do not build

- Univer Pro / `@univerjs-pro/*` / `preset-sheets-advanced` / `preset-sheets-drawing`
- HyperFormula
- Realtime collab, auth, remote DB
- VBA / Apps Script
- Cloud Power Query / connectors
- Workbook encryption / IRM
- Solver / Goal Seek / Data Tables / Power Pivot
- Wave C/D (drawing/sparklines pack, Sheet Actions)
- SEQUENCE / SORTBY / RANDARRAY / array constants / dotted Excel names (X5)
- Excel pivot caches, slicers, OLAP cubes

## Next sequential steps

1. Keep this draft PR. Push only `feature/tabular-sheet-wave-b`. Never merge. Never open a second PR.
2. After any later commit, put that tip SHA in this file and `.tasks/IN_PROGRESS.md` TASK-022 in the same cycle.
3. Do not chase out-of-suite Pages reds listed above.
4. Do not invent Wave C/D.
5. Reject reviews that treat iPhone 13 / `mobile-chromium` as the only #16 proof.

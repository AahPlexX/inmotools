# Tabular Sheet Workstation — agent handoff

Suite id: `sheets`. Path: `src/tools/sheets/`. Catalog slug: `tabular-sheet-workstation`.
Merged PR: https://github.com/AahPlexX/inmotools/pull/73 — CoS squash-merged `feature/tabular-sheet-wave-a` onto `main`. Product tip is that squash. Do not push to `feature/tabular-sheet-wave-a`. Do not touch unrelated tools.

**Tip SHA:** `4dcc856bc97027862342513cdea7eb769c0ffbc1`  
**Last focused-gate code:** `4dcc856bc97027862342513cdea7eb769c0ffbc1`  
**Workstream:** **Wave A DONE** and merged on `main` via PR #73 (Formula.js + FILTER/SORT/UNIQUE spill + export-surviving comments). Built on merged PR #71 P1–P16 / docs PR #72. Do not invent Wave B/C/D.

## Merge status (PR #73)

- CoS squash-merged PR #73 onto `main` at `4dcc856bc97027862342513cdea7eb769c0ffbc1` (`feat(sheets): Wave A Formula.js, spill, and export comments (#73)`). Product tip is that squash. This docs stamp is a separate follow-up commit.
- Parent of that squash is `6776107f946b16bfe4edddc275ea5a1af234d7fb`. Product code from `feature/tabular-sheet-wave-a` is on `main`.
- Prior: CoS squash-merged PR #71 at `b582c34dea4ba97ab7080743dc290eeb45946b54`; docs PR #72 stamped HANDOFF to that squash (`6776107f946b16bfe4edddc275ea5a1af234d7fb`).
- Repository-wide validate remaining reds are **out-of-suite** e2e (same class as PR #70 / #71). That is not a sheets regression and is **not** a claim that the full Pages suite is green.

## What works

- FEATURE_MATRIX 1–36 remain `done`. Approved gap ledger P1–P16 remain `done`. Wave A rows WA1–WA3 are `done` with focused evidence.
- Portable DAG remains SSOT for the local grid. `@formulajs/formulajs@4.6.1` (exact pin, no `^`) supplies implementations for names the local catalog does not own. Locked P2 Insert Function names are unchanged.
- FILTER, SORT, and UNIQUE spill into empty neighboring cells. Formula.js has no FILTER; its UNIQUE is not Excel UNIQUE; spill is engine-owned.
- Cell comments/notes round-trip through exceljs XLSX and the portable JSON/zip bundle. No auth, no DB, no realtime threads.
- P16 client harden unchanged: no hover-only, no overlap at phone/tablet CSS widths, long-press + click, tap/focus formula help, anti-slop sheets-only copy. Proof is `CLIENT_VIEWPORTS`. `P16_PROOF_NOT_ACCEPTED`: iPhone 13, `mobile-chromium`.

## Spill limitations (honest)

- Spill is same-sheet, into empty neighbors only. A value, formula, note, hyperlink, or foreign merge in the spill box writes `#SPILL!`.
- Empty FILTER with no `if_empty` argument writes `#CALC!`.
- Nested arrays that are not FILTER/SORT/UNIQUE take the top-left value (implicit intersection), except when flattened by functions such as SUM.
- No `{1,2;3,4}` array constants, SEQUENCE, SORTBY, RANDARRAY, or dotted Excel names (`BETA.DIST`).
- Named ranges remain single-cell in the portable table.
- Range DAG expansion stops at 20,000 cells and then keeps corners only.
- Spilled values are display/cache only; save and XLSX export omit `spillFrom` cells so Excel/this app recalculate from the origin formula.
- Formula.js UNIQUE is not used for `UNIQUE()`; engine-owned UNIQUE is row-wise (optional `by_col` / `exactly_once`).

## P16 / responsive proof (PR review must enforce)

Do **not** treat iPhone 13 or the `mobile-chromium` Playwright project as the only mobile gate. P16 and any responsive parity UI pass only when the CSS-width matrix is green on `desktop-chromium` via `page.setViewportSize`.

Portrait (narrow phone → tablet): 320×740, 360×800, 390×844, 412×915, 430×932, 768×1024  
Landscape (same widths, swapped): 740×320, 800×360, 844×390, 915×412, 932×430, 1024×768

## Sheets gates (green at last focused-gate code)

```bash
# focused units 47/47; pnpm build pass
# desktop-chromium 25 passed
# P16 matrix 12/12 (6 portrait + 6 landscape)
```

Counts last proven green on feature-branch stamp `c0da201e08a7e062b78299a6b521a1fad767c203`, which is included in squash / product tip `4dcc856bc97027862342513cdea7eb769c0ffbc1`. CoS sets last focused-gate to that squash. Verify commands:

```bash
pnpm exec vitest run tests/unit/sheets-wiring.test.ts tests/unit/sheets-stage2.test.ts tests/unit/sheets-formula.test.ts tests/unit/sheets-persist.test.ts tests/unit/sheets-parity.test.ts tests/unit/sheets-wave-a.test.ts

pnpm build

# P16 device-agnostic matrix — required. Not an iPhone 13-only story.
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at'

pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium
```

## Known out-of-suite CI reds

Do **not** claim the full Pages / PR validate suite is green. Validate may fail on the same out-of-suite e2e class as PR #70 / #71. **Do not chase or edit those tools:**

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
- Wave B/C/D (pivots upgrade, drawing/sparklines pack, Sheet Actions)
- SEQUENCE / SORTBY / RANDARRAY / array constants / dotted Excel names (X5)

## Next sequential steps

1. PR #73 is merged. Do not push to `feature/tabular-sheet-wave-a`.
2. Docs-only follow-ups land on a new branch → `main` as a draft PR. CoS merges. The agent does not merge.
3. Keep Tip SHA / last focused-gate as the PR #73 squash product tip `4dcc856bc97027862342513cdea7eb769c0ffbc1` unless CoS names a later product tip.
4. Do not invent Wave B/C/D.
5. Reject reviews that treat iPhone 13 / `mobile-chromium` as the only #16 proof.

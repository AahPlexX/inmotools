# Tabular Sheet Workstation — agent handoff

Suite id: `sheets`. Path: `src/tools/sheets/`. Catalog slug: `tabular-sheet-workstation`.
Draft PR: https://github.com/AahPlexX/inmotools/pull/70 (`feature/tabular-sheet-workstation` → `main` only). Do not merge. Do not open a new PR.

**Tip SHA:** use `git rev-parse HEAD` on `feature/tabular-sheet-workstation`. Last verified code: `b57c65a5e479ab99314ad5e521874d531fd0677a`.

## What works

- All 36 FEATURE_MATRIX rows remain `done` with local-grid evidence for the audit fixes below.
- Portable DAG evaluator (named ranges, cross-sheet refs, fill rewrite, cycles).
- Local grid: range select (drag / Shift+click / Shift+arrows), merge paint, freeze pin, column/row size chrome, range TSV cut/copy/clear, case-insensitive find/replace, safe hyperlinks, inline sheet rename.
- Stage 2 chrome: number format, styles, wrap/overflow, autofilter, validation, CF, context menu + 500ms long-press, tap/focus formula help.
- Optional Univer `@univerjs/presets@0.25.1` + `@univerjs/preset-sheets-core@0.25.1` host (`contextMenu: false`). Live `engine-formula` is SSOT only while mounted (`data-testid=tsw-formula-ssot`).
- Persistence: Dexie IndexedDB + LocalStorage prefs. Import: SheetJS CE 0.20.3 (values, formulas, merges, safe links). Export: exceljs 4.4.0 ARGB styles, formula-safe CSV (blank rows kept), tagged JSON/zip.
- Charts reuse `chart.js@4.5.1`. Pivot is in-house group-by.

## Forensic audit (2026-09-20) — fixed vs deferred

### Fixed on this revision

1. Local grid never painted merges (Feature 13 stored only).
2. Freeze panes stored but not pinned on the local grid (Feature 14).
3. Resize helpers unused; widths/heights not applied; insert/delete did not shift hidden/size maps or A1 metadata (Feature 15).
4. Selection was always 1×1, so merge/sort/chart/aggregates could not operate on a range.
5. Copy joined every cell with tabs (no row newlines); cut/clear touched only the active cell (Feature 9).
6. Find was case-insensitive; replace was case-sensitive and skipped formulas (Feature 10).
7. Arrow keys could walk past the sheet bounds.
8. Hyperlinks used raw `href` (`javascript:` possible).
9. XLSX import used `sheet_to_json` and dropped formulas/merges (Feature 32).
10. exceljs color export wrote 6-digit hex instead of ARGB; underline omitted (Feature 33).
11. CSV export collapsed blank rows (`matrix.filter`) (Feature 34).
12. Sheet rename used `window.prompt`; formula help was hardcoded at (12,220).
13. Catalog audience line dropped “anyone who needs a private spreadsheet”.
14. Focused sheets e2e now covers range+merge+resize+freeze and a workspace axe pass.

### Deferred (with reason)

1. **Univer host remounts only on `book.id`.** Live Univer is a mounted snapshot, not a two-way sync of every portable edit. Remount-on-every-commit would drop Univer undo and is expensive. Portable grid remains the edit SSOT; switch engine off/on to reload a saved workbook. Not a Feature 3 status change.
2. **Pages / full-suite CI reds are out-of-suite.** PR validate run `35477210462` failed 13 browser tests, none in `tabular-sheet-workstation.spec.ts`: web-layout-studio axe, svg-sprite-compiler axe, stale lazy chunk recovery, Hardware Packet Inspector, GeoJSON Simplifier, regex-matrix Python re, crystal mobile symmetry-break. Do not chase unless a sheets change causes them. Catalog/lockfile edits select `__FULL_SUITE__` via `scripts/select-e2e-specs.mjs`.
3. **GOVERNANCE §4 `origin/main` invariant vs this task.** Human request: keep PR #70 draft, never merge. That conflicts with “intended changes must have reached `origin/main`”. Stop at draft PR; do not merge to resolve the conflict.
4. **Univer Pro packages appear in `pnpm-lock.yaml` as transitive metadata** of the 0.25.1 graph. Source and `package.json` do not import or declare `@univerjs-pro/*`, `preset-sheets-advanced`, `preset-sheets-drawing`, or HyperFormula. Leave the lockfile as installed; do not add those packages.

## Exact commands to verify

```bash
pnpm exec vitest run tests/unit/sheets-wiring.test.ts tests/unit/sheets-stage2.test.ts tests/unit/sheets-formula.test.ts tests/unit/sheets-persist.test.ts
pnpm build
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts
pnpm exec playwright test tests/e2e/accessibility.spec.ts -g 'tabular-sheet-workstation'
```

Catalog-wide `pnpm test:unit` may still be red on pre-existing `sightline-encoding` in some environments. Out of suite.

## Next sequential steps

1. Keep PR #70 draft. Do not merge. Do not open a new PR.
2. Do not chase out-of-suite Pages reds listed above.
3. If a later agent needs two-way Univer sync, that is a new scoped task — not a FEATURE_MATRIX status change without evidence.

## Fresh verification on `b57c65a5e479ab99314ad5e521874d531fd0677a`

- Focused sheets units: 27/27 pass
- `pnpm build`: pass
- `tests/e2e/tabular-sheet-workstation.spec.ts`: 13 passed, 1 skipped (mobile axe by design)
- Catalog axe `-g tabular-sheet-workstation`: 2/2 pass (desktop + mobile)

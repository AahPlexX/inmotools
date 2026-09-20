# Tabular Sheet Workstation — agent handoff

Suite id: `sheets`. Path: `src/tools/sheets/`. Catalog slug: `tabular-sheet-workstation`.
Draft PR: https://github.com/AahPlexX/inmotools/pull/70 — `feature/tabular-sheet-workstation` → `main` only. Do not merge. Do not open a new PR.

**Tip SHA:** `09fd0fc5c20da4e7f8640ff94b2b1706cd8932ca`  
**Last focused-gate code:** `b57c65a5e479ab99314ad5e521874d531fd0677a`  
**Stage 2 close (not current):** `bc406b78dc80bd958d65479096a20d3447af0139` — Stage 2 chrome + catalog-axe progress-list fix. TASK-022 is post-Stage-3.

## What works

- FEATURE_MATRIX 1–36 remain `done`. Stage 2 surfaces stay in place (formula SSOT, format/style/wrap, autofilter, validation, CF, context menu + long-press, tap/focus formula help).
- Post-Stage-3 local-grid audit fixes: range select (drag / Shift+click / Shift+arrows), merge paint, freeze pins, column/row size chrome, range TSV cut/copy/clear, case-insensitive find/replace, safe hyperlinks, inline sheet rename, SheetJS formula/merge import, exceljs ARGB, CSV blank rows kept.
- Portable DAG evaluator; optional Univer `@univerjs/presets@0.25.1` + `@univerjs/preset-sheets-core@0.25.1` (`contextMenu: false`). Live `engine-formula` is SSOT only while mounted.
- Local-only persist (IndexedDB + LocalStorage). Charts reuse `chart.js@4.5.1`. Pivot is in-house group-by.

## Sheets gates (green)

```bash
pnpm exec vitest run tests/unit/sheets-wiring.test.ts tests/unit/sheets-stage2.test.ts tests/unit/sheets-formula.test.ts tests/unit/sheets-persist.test.ts
# 27/27

pnpm build
# pass

pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts
# 13 passed, 1 skipped (mobile axe by design)

pnpm exec playwright test tests/e2e/accessibility.spec.ts -g 'tabular-sheet-workstation'
# 2/2 desktop + mobile
```

## Known out-of-suite CI reds

Pages / PR validate run `35477210462` is red. Failures are not sheets-owned:

- `accessibility.spec.ts` — web-layout-studio, svg-sprite-compiler (desktop + mobile)
- `app.spec.ts` — stale lazy chunk recovery
- `audit-hardening.spec.ts` — Hardware Packet Inspector; GeoJSON Simplifier
- `regex-matrix.spec.ts` — Python re named groups
- `crystal-lattice-studio.spec.ts` — mobile symmetry-break

Do not chase these unless a sheets change causes them. Catalog / lockfile edits select `__FULL_SUITE__` via `scripts/select-e2e-specs.mjs`.

## Deferred

1. Univer host remounts only on `book.id` (portable grid is the edit SSOT).
2. GOVERNANCE §4 vs keep-draft: do not merge PR #70 to satisfy `origin/main`.
3. `pnpm-lock.yaml` may list `@univerjs-pro/*` as transitive 0.25.1 metadata; source/`package.json` do not import them.

## Next sequential steps

1. Keep draft PR #70. Push only `feature/tabular-sheet-workstation`. Never merge. Never open a new PR.
2. After any later commit, put that tip SHA in this file and `.tasks/IN_PROGRESS.md` TASK-022 in the same cycle.
3. Do not chase out-of-suite Pages reds listed above.
4. Two-way Univer sync is a new scoped task if requested — not a FEATURE_MATRIX status change without evidence.

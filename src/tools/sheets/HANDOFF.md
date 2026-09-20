# Tabular Sheet Workstation — agent handoff

Suite id: `sheets`. Path: `src/tools/sheets/`. Catalog slug: `tabular-sheet-workstation`.
Draft PR: https://github.com/AahPlexX/inmotools/pull/71 — `feature/tabular-sheet-parity` → `main` only. Do not merge. Do not touch unrelated tools.

**Tip SHA:** `c455bd4b4dfc9874fe7e38a8ada854b54b1b30ca`  
**Last focused-gate code:** `c455bd4b4dfc9874fe7e38a8ada854b54b1b30ca`  
**Workstream:** Excel / Sheets parity slice (G1–G17) plus device-agnostic mobile widths.

## What works

- FEATURE_MATRIX 1–36 remain `done`. Gap ledger G1–G17 are `done` with focused units/e2e. Exclusions X1–X10 stay listed with reasons.
- Paste special (values / formats / transpose), clear contents vs clear all, AutoSum, Insert Function, named-range manager, Go to / Go to special, hide/unhide + tab color, remove duplicates, text to columns, custom number pattern, CF color scales, list-validation picker, Chart.js column/line/pie, print CSS, local SHA-256 PIN lock, F2 / Ctrl+Arrow / Ctrl+; .
- Formula help and Insert Function are tap/focus only. Cell and sheet-tab menus open from click and long-press. No hover-only actions.
- Portable DAG evaluator; optional Univer `@univerjs/presets@0.25.1` + `@univerjs/preset-sheets-core@0.25.1` (`contextMenu: false`). Live `engine-formula` is SSOT only while mounted.
- Local-only persist (IndexedDB + LocalStorage). Charts reuse `chart.js@4.5.1`. Pivot is in-house group-by.

## Sheets gates (green)

```bash
pnpm exec vitest run tests/unit/sheets-wiring.test.ts tests/unit/sheets-stage2.test.ts tests/unit/sheets-formula.test.ts tests/unit/sheets-persist.test.ts tests/unit/sheets-parity.test.ts
# 39/39

pnpm build
# pass

pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium
# 15 passed (includes 320/360/390/412/430 portrait + 740×360 landscape)

pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at'
# 6/6 generic CSS-width matrix; not an iPhone 13-only proof

pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=mobile-chromium
# remaining tests passed; viewport-matrix skipped here on purpose (generic CSS-width loop is desktop-chromium)

pnpm exec playwright test tests/e2e/accessibility.spec.ts -g 'tabular-sheet-workstation'
# 2/2 desktop + mobile
```

## Known out-of-suite CI reds

Pages / PR validate may still fail on other tools. Do not chase those unless a sheets change causes them. Catalog edits select `__FULL_SUITE__` via `scripts/select-e2e-specs.mjs`.

## Deferred / excluded

1. Univer host remounts only on `book.id` (portable grid is the edit SSOT).
2. FILTER / SORT / UNIQUE formulas — no spill arrays; use Autofilter, Sort, Remove duplicates.
3. Excel file encryption / IRM — local PIN is a hashed edit lock, not workbook crypto.
4. VBA, Apps Script, remote Power Query, Univer Pro, HyperFormula, collab/auth/db.

## Next sequential steps

1. Keep the `feature/tabular-sheet-parity` draft PR. Never merge.
2. After any later commit, put that tip SHA in this file and `.tasks/IN_PROGRESS.md` TASK-022 in the same cycle.
3. Do not chase out-of-suite Pages reds.
4. Two-way Univer sync is a new scoped task if requested.

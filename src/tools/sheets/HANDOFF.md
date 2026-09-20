# Tabular Sheet Workstation — agent handoff

Suite id: `sheets`. Path: `src/tools/sheets/`. Catalog slug: `tabular-sheet-workstation`.
Draft PR: https://github.com/AahPlexX/inmotools/pull/71 — `feature/tabular-sheet-parity` → `main` only. Do not merge. Do not touch unrelated tools. Do not open a second PR.

**Tip SHA:** pending this cycle (updated after the focused-gate commit lands)  
**Last focused-gate code:** pending this cycle  
**Workstream:** CoS-locked Excel / Sheets first parity slice **P1–P16** (not an XLOOKUP-only cut). FEATURE_MATRIX 1–36 stay `done`. Protect sheet is optional extra PX, not P15/P16.

## What works

- FEATURE_MATRIX 1–36 remain `done`. CoS gap ledger P1–P16 are `done` with focused units/e2e. Optional PX (local hashed PIN) is present. Exclusions X1–X10 stay listed with reasons.
- P1 paste special (values / formats / transpose). P2 Insert Function full catalog (`LOCKED_INSERT_FUNCTIONS`: SUM, AVERAGE, IF, VLOOKUP, XLOOKUP, INDEX-MATCH, TEXTJOIN, COUNTIF, SUMIF; INDEX/MATCH remain in the picker). P3 AutoSum. P4 named-range manager. P5 Go to / Go to special. P6 hide/unhide + tab color. P7 clear contents vs clear all. P8 remove duplicates. P9 text to columns. P10 custom number pattern. P11 CF color scales. P12 list-validation picker. P13 Chart.js column/line/pie. P14 print CSS. P15 F2 / Ctrl+Arrow / Ctrl+; / Ctrl+D fill (`fillDownSelection`, `tsw-fill-down`). P16 device-agnostic client harden.
- Formula help and Insert Function are tap/focus only. Cell and sheet-tab menus open from click and long-press. No hover-only actions. Catalog/sheets copy is anti-slop (no unlock-the-grid marketing).
- Portable DAG evaluator; optional Univer `@univerjs/presets@0.25.1` + `@univerjs/preset-sheets-core@0.25.1` (`contextMenu: false`). Live `engine-formula` is SSOT only while mounted.
- Local-only persist (IndexedDB + LocalStorage). Charts reuse `chart.js@4.5.1`. Pivot is in-house group-by.

## Sheets gates (run after this cycle’s code lands)

```bash
pnpm exec vitest run tests/unit/sheets-wiring.test.ts tests/unit/sheets-stage2.test.ts tests/unit/sheets-formula.test.ts tests/unit/sheets-persist.test.ts tests/unit/sheets-parity.test.ts

pnpm build

pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium

pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at'
# generic CSS-width matrix; not an iPhone 13-only proof

pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=mobile-chromium
# remaining tests; viewport-matrix skipped here on purpose (generic CSS-width loop is desktop-chromium)

pnpm exec playwright test tests/e2e/accessibility.spec.ts -g 'tabular-sheet-workstation'
```

Verify commands for P16 (device-agnostic, not iPhone 13-only):

```bash
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at 320-portrait'
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at 360-portrait'
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at 390-portrait'
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at 412-portrait'
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at 430-portrait'
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at 740x360-landscape'
```

## Known out-of-suite CI reds

Pages / PR validate may still fail on other tools. Do not chase those unless a sheets change causes them. Catalog edits select `__FULL_SUITE__` via `scripts/select-e2e-specs.mjs`.

## Deferred / excluded

1. Univer host remounts only on `book.id` (portable grid is the edit SSOT).
2. FILTER / SORT / UNIQUE formulas — no spill arrays and HyperFormula is banned; use Autofilter, Sort, Remove duplicates (X5).
3. Excel file encryption / IRM — local PIN is a hashed edit lock, not workbook crypto (X6). PX does not replace P15/P16.
4. Realtime collab, VBA / Apps Script, remote/cloud Power Query, Univer Pro pivots/drawing, HyperFormula, auth/db (X1–X4, X7–X10).

## Next sequential steps

1. Keep the `feature/tabular-sheet-parity` draft PR. Never merge. Do not open a second PR.
2. After any later commit, put that tip SHA in this file and `.tasks/IN_PROGRESS.md` TASK-022 in the same cycle.
3. Do not chase out-of-suite Pages reds.
4. Two-way Univer sync is a new scoped task if requested.

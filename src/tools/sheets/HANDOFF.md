# Tabular Sheet Workstation — agent handoff

Suite id: `sheets`. Path: `src/tools/sheets/`. Catalog slug: `tabular-sheet-workstation`.
Draft PR: https://github.com/AahPlexX/inmotools/pull/71 — `feature/tabular-sheet-parity` → `main` only. Do not merge. Do not touch unrelated tools. Do not open a second PR.

**Tip SHA:** 3aabf3260619eafff6dceb9b413731f5be066877  
**Last focused-gate code:** `65e8029f8c1b6f7c837d4d3387aadcc2fdb4ee8f`  
**Workstream:** **PRODUCT CUT APPROVED** — CoS P1–P16 only. Not an XLOOKUP-only cut. Do not invent extra product scope. FEATURE_MATRIX 1–36 stay `done` historical. Protect sheet (PX) is leftover, not in the approved 16.

## What works

- FEATURE_MATRIX 1–36 remain `done`. Approved gap ledger P1–P16 are `done` with focused units/e2e. Exclusions X1–X10 stay listed. Do not build the CoS-named exclusions.
- P1 paste special (values / formats / transpose). P2 Insert Function full catalog (`LOCKED_INSERT_FUNCTIONS`: SUM, AVERAGE, IF, VLOOKUP, XLOOKUP, INDEX-MATCH, TEXTJOIN, COUNTIF, SUMIF; INDEX/MATCH remain in the picker). P3 AutoSum. P4 named-range manager. P5 Go to / Go to special. P6 hide/unhide + tab color. P7 clear contents vs clear all. P8 remove duplicates. P9 text to columns. P10 custom number pattern. P11 CF color scales. P12 list-validation picker. P13 Chart.js column/line/pie (`chart.js@4.5.1` reuse). P14 print CSS. P15 F2 / Ctrl+Arrow / fill (`fillDownSelection`, `tsw-fill-down`). P16 client harden (no hover-only, no overlap at phone widths, anti-slop sheets-only copy).
- FILTER / SORT / UNIQUE formulas are excluded (X5): portable engine is scalar; HyperFormula is banned.
- Formula help and Insert Function are tap/focus only. Cell and sheet-tab menus open from click and long-press.
- Portable DAG evaluator; optional Univer `@univerjs/presets@0.25.1` + `@univerjs/preset-sheets-core@0.25.1` (`contextMenu: false`). Live `engine-formula` is SSOT only while mounted.
- Local-only persist (IndexedDB + LocalStorage). Pins stay exact (never `^`): `exceljs@4.4.0`, SheetJS CE `0.20.3`, reuse `chart.js@4.5.1`.

## Sheets gates (green at last focused-gate code)

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
# 8 passed, 7 skipped (axe + width matrix skipped here on purpose; generic CSS-width loop is desktop-chromium)

pnpm exec playwright test tests/e2e/accessibility.spec.ts -g 'tabular-sheet-workstation'
# 2/2 desktop + mobile
```

## Known out-of-suite CI reds

Pages / PR validate may still fail on other tools. Do not chase those unless a sheets change causes them.

## Excluded — do not build

- Realtime collab
- VBA / Apps Script
- Cloud Power Query
- Univer Pro pivots / drawing (`@univerjs-pro/*`, `preset-sheets-advanced`, `preset-sheets-drawing`)
- HyperFormula
- Auth / db / telemetry
- FILTER / SORT / UNIQUE formulas (no spill without HyperFormula)

## Next sequential steps

1. Keep the `feature/tabular-sheet-parity` draft PR. Never merge. Do not open a second PR.
2. After any later commit, put that tip SHA in this file and `.tasks/IN_PROGRESS.md` TASK-022 in the same cycle.
3. Do not invent extra product scope beyond P1–P16.
4. Do not chase out-of-suite Pages reds.

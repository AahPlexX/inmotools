# Tabular Sheet Workstation — agent handoff

Suite id: `sheets`. Path: `src/tools/sheets/`. Catalog slug: `tabular-sheet-workstation`.
Draft PR: https://github.com/AahPlexX/inmotools/pull/71 — `feature/tabular-sheet-parity` → `main` only. Do not merge. Do not touch unrelated tools. Do not open a second PR.

**Tip SHA:** d6063c3e806ad46fdca2eb0f15a622ba77eeafa4  
**Last focused-gate code:** `c4f55d32159e4ba751ece9f940ac90fb2560ebe7`  
**Workstream:** **PRODUCT CUT APPROVED** — CoS P1–P16 only. P16 proof is a device-agnostic portrait+landscape CSS-width matrix. Not an XLOOKUP-only cut. Do not invent extra product scope.

## What works

- FEATURE_MATRIX 1–36 remain `done`. Approved gap ledger P1–P16 are `done` with focused units/e2e. Exclusions X1–X10 stay listed.
- P16 client harden: no hover-only, no overlap at phone/tablet CSS widths, long-press + click, tap/focus formula help, anti-slop sheets-only copy. Proof is `CLIENT_VIEWPORTS` (six portrait + six landscape CSS sizes). `P16_PROOF_NOT_ACCEPTED`: iPhone 13, `mobile-chromium`.
- Insert Function stays the full locked catalog. FILTER / SORT / UNIQUE formulas stay excluded (X5).

## P16 / responsive proof (PR review must enforce)

Do **not** treat iPhone 13 or the `mobile-chromium` Playwright project as the only mobile gate. P16 and any responsive parity UI pass only when the CSS-width matrix is green on `desktop-chromium` via `page.setViewportSize`.

Portrait (narrow phone → tablet): 320×740, 360×800, 390×844, 412×915, 430×932, 768×1024  
Landscape (same widths, swapped): 740×320, 800×360, 844×390, 915×412, 932×430, 1024×768

Each case checks: parity chrome visible, no horizontal page overflow (>8px fails), formula help `data-trigger=focus-or-tap` (never hover), help closed so the grid stays reachable, long-press context menu.

## Sheets gates (green at last focused-gate code)

```bash
# focused units 39/39; pnpm build pass
# desktop-chromium 21 passed
# P16 matrix 12/12 (6 portrait + 6 landscape)
# mobile-chromium 8 passed / 13 skipped (matrix skipped — iPhone 13 is not the P16 gate)
```

Counts recorded at `c4f55d32159e4ba751ece9f940ac90fb2560ebe7`. Verify commands:

```bash
pnpm exec vitest run tests/unit/sheets-wiring.test.ts tests/unit/sheets-stage2.test.ts tests/unit/sheets-formula.test.ts tests/unit/sheets-persist.test.ts tests/unit/sheets-parity.test.ts

pnpm build

# P16 device-agnostic matrix — required. Not an iPhone 13-only story.
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at'

pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at 320-portrait'
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at 360-portrait'
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at 390-portrait'
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at 412-portrait'
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at 430-portrait'
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at 768-portrait'
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at 740-landscape'
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at 800-landscape'
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at 844-landscape'
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at 915-landscape'
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at 932-landscape'
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at 1024-landscape'

pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium

# mobile-chromium uses devices['iPhone 13'] and is NOT the P16 acceptance gate.
# The width matrix is skipped there on purpose.
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=mobile-chromium

pnpm exec playwright test tests/e2e/accessibility.spec.ts -g 'tabular-sheet-workstation'
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
4. Reject reviews that treat iPhone 13 / `mobile-chromium` as the only #16 proof.

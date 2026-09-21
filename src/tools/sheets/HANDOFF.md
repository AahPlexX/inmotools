# Tabular Sheet Workstation — agent handoff

Suite id: `sheets`. Path: `src/tools/sheets/`. Catalog slug: `tabular-sheet-workstation`.
Draft PR: https://github.com/AahPlexX/inmotools/pull/71 — `feature/tabular-sheet-parity` → `main` only. Do not open a second PR. Do not touch unrelated tools.

**Tip SHA:** `PLACEHOLDER_TIP_SHA`  
**Last focused-gate code:** `c37fff4c1bdd98827266be6f6fd611901756e75e`  
**Workstream:** **PRODUCT CUT P1–P16 DONE.** Client loop green on `c37fff4` / `3e87e0a`. CoS squash-merged #71 onto `main` at `b582c34`. This branch synced that tip. The agent does not merge, mark ready, or open a second PR. Not an XLOOKUP-only cut. Do not invent extra product scope. Do not expand PX.

## Merge readiness (for CoS squash-merge)

- `origin/main` fetched at `b582c34dea4ba97ab7080743dc290eeb45946b54` (`feat(sheets): local Excel/Sheets parity slice for Tabular Sheet Workstation (#71)`).
- Synced with `git merge origin/main` (ort). **No conflicts. No other-tool files rewritten.** Working tree matches `origin/main` after the sync merge.
- Validate reds remain **out-of-suite only** (same class as PR #70). That is not a sheets regression and is **not** a claim that the full Pages suite is green.

## What works

- FEATURE_MATRIX 1–36 remain `done`. Approved gap ledger P1–P16 are `done` with focused units/e2e. Exclusions X1–X10 stay listed.
- P16 client harden: no hover-only, no overlap at phone/tablet CSS widths, long-press + click, tap/focus formula help, anti-slop sheets-only copy. Proof is `CLIENT_VIEWPORTS` (six portrait + six landscape CSS sizes). `P16_PROOF_NOT_ACCEPTED`: iPhone 13, `mobile-chromium`.
- Insert Function stays the full locked catalog. FILTER / SORT / UNIQUE formulas stay excluded (X5).
- Client loop closed on stamp `c37fff4` / content `3e87e0a`: laptop keyboard P0 (type-into-cell + ArrowUp), phone context-menu clamp/Escape, formula help on focus, Copy Gate catalog strings.

## P16 / responsive proof (PR review must enforce)

Do **not** treat iPhone 13 or the `mobile-chromium` Playwright project as the only mobile gate. P16 and any responsive parity UI pass only when the CSS-width matrix is green on `desktop-chromium` via `page.setViewportSize`.

Portrait (narrow phone → tablet): 320×740, 360×800, 390×844, 412×915, 430×932, 768×1024  
Landscape (same widths, swapped): 740×320, 800×360, 844×390, 915×412, 932×430, 1024×768

Each case checks: parity chrome visible, no horizontal page overflow (>8px fails), formula help `data-trigger=focus-or-tap` (never hover), help closed so the grid stays reachable, long-press context menu.

## Sheets gates (green at last focused-gate code)

```bash
# focused units 42/42; pnpm build pass
# desktop-chromium 24 passed
# P16 matrix 12/12 (6 portrait + 6 landscape)
```

Counts recorded at client-loop code tip `c37fff4c1bdd98827266be6f6fd611901756e75e` (content `3e87e0a2f0ead527625925f4f0d7b83260e4a4ad`). Verify commands:

```bash
pnpm exec vitest run tests/unit/sheets-wiring.test.ts tests/unit/sheets-stage2.test.ts tests/unit/sheets-formula.test.ts tests/unit/sheets-persist.test.ts tests/unit/sheets-parity.test.ts

pnpm build

# P16 device-agnostic matrix — required. Not an iPhone 13-only story.
pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium -g 'keeps parity chrome readable at'

pnpm exec playwright test tests/e2e/tabular-sheet-workstation.spec.ts --project=desktop-chromium
```

## Known out-of-suite CI reds

Do **not** claim the full Pages / PR validate suite is green. Validate reds are out-of-suite only (same class as PR #70). **Do not chase or edit those tools:**

- `web-layout-studio` axe
- `svg-sprite-compiler` axe
- Hardware Packet Inspector
- GeoJSON Simplifier
- Python `re` / regex named groups
- `crystal-lattice-studio` mobile

Pages / PR validate reds on those suites are not sheets regressions. Do not touch them unless a sheets change causes them.

## Excluded — do not build

- Realtime collab
- VBA / Apps Script
- Cloud Power Query
- Univer Pro pivots / drawing (`@univerjs-pro/*`, `preset-sheets-advanced`, `preset-sheets-drawing`)
- HyperFormula
- Auth / db / telemetry
- FILTER / SORT / UNIQUE formulas (no spill without HyperFormula)

## Next sequential steps

1. Stay on PR #71 / `feature/tabular-sheet-parity`. Do not open a second PR. The agent does not merge.
2. CoS undraft + squash-merge is the vehicle (already landed on `main` at `b582c34` if that squash is the current default).
3. After any later commit, put that tip SHA in this file and `.tasks/IN_PROGRESS.md` TASK-022 in the same cycle.
4. Do not invent extra product scope beyond P1–P16. Do not expand PX.
5. Reject reviews that treat iPhone 13 / `mobile-chromium` as the only #16 proof.

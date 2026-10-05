---
tool: apca-token-matrix
folder: src/tools/contrast
doc: tracker
basis: as-built
status: done
spec: docs/superpowers/specs/2026-10-01-apca-token-matrix-design.md
tracker: src/tools/contrast/TRACKER.md
updated: 2026-10-04
---

# APCA Token Matrix — tracker

## Resume here

On `origin/main`. 16 requirements: 14 verified, 2 missing (APC-R15 site theme, APC-R16 OKLCH lightness suggestion). Next action: build APC-R16. No blocker.

## Documents

- Spec: [2026-10-01-apca-token-matrix-design.md](../../../docs/superpowers/specs/2026-10-01-apca-token-matrix-design.md)
- Original design: "Tool 17" in [2026-08-29-next-ten-local-tools-design.md](../../../docs/superpowers/specs/2026-08-29-next-ten-local-tools-design.md)
- Code: `contrast-engine.ts`, `ContrastWorkspace.tsx`
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/contrast.test.ts`; browser tests: `tests/e2e/contrast.spec.ts`

## Requirement status

`unit` = `tests/unit/contrast.test.ts`; `e2e` = `tests/e2e/contrast.spec.ts`.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| APC-R01 | verified | unit "parses CSS color tokens while reporting invalid source lines" | |
| APC-R02 | verified | unit "preserves alpha…", "composites translucent backgrounds…", "rejects translucent backdrops…"; e2e "composites alpha tokens…" | |
| APC-R03 | verified | unit "rejects duplicate exported token names…"; e2e "rejects duplicate exported token names and exports filtered CSV" | |
| APC-R04 | verified | unit "builds directional non-self pairings with separate APCA and WCAG values", "computes conventional WCAG 2 ratios independently of APCA"; e2e (self pairs excluded) | |
| APC-R05 | verified | unit "rejects token sets that would exceed the bounded synchronous matrix budget" | |
| APC-R06 | verified | e2e "APC-R06 role guidance with a filter that shows only passing or failing pairs" | |
| APC-R07 | verified | e2e "APC-R07 sorts pairings by token name, APCA magnitude or WCAG ratio" | |
| APC-R08 | verified | e2e (heatmap row and column headers) | |
| APC-R09 | verified | unit "chooses readable UI metric text independently of the tested foreground token" | |
| APC-R10 | verified | e2e "APC-R10 the component sandbox renders protanopia, deuteranopia and tritanopia previews of the chosen pair" | |
| APC-R11 | verified | e2e (`contrast-matrix.csv`) | |
| APC-R12 | verified | e2e "APC-R12 copied and downloaded CSS custom properties contain only the valid tokens" | |
| APC-R13 | verified | `tests/e2e/accessibility.spec.ts` route `apca-token-matrix` | |
| APC-R14 | verified | e2e "APC-R14 lays out without horizontal overflow at <width> px" (320, 375, 768, 1024, 1440, 1920, 2560) | |
| APC-R15 | missing | — | Delivered through the site-wide theme selector |
| APC-R16 | missing | — | Added 2026-10-02 |

## Open work

1. Build the requirement added 2026-10-02: APC-R16.
2. APC-R15 with the site-wide theme selector.

## Known limitations

- Colour-vision previews are approximations, not pass/fail checks (design).

## Verification evidence

- 2026-10-04, `expand/apca-token-matrix`: `pnpm build`; `PW_PORT=4204 pnpm exec playwright test tests/e2e/contrast.spec.ts --repeat-each=3` 57 passed, 21 skipped (the APC-R14 viewport matrix runs on the desktop project only).
- 2026-10-01, `main` @ `f2390dca`: `tests/unit/contrast.test.ts` 9/9; `tests/e2e/contrast.spec.ts` 4 passed (desktop and mobile); accessibility spec for the route 2 passed.

## Change log

- 2026-10-04 — Browser tests added for APC-R06, R07, R10, R12, R14 (now `verified`).
- 2026-10-02 — Added APC-R16 (default integration rule).
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.

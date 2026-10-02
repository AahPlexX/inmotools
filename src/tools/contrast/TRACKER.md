---
tool: apca-token-matrix
folder: src/tools/contrast
doc: tracker
basis: as-built
status: done
spec: docs/superpowers/specs/2026-10-01-apca-token-matrix-design.md
tracker: src/tools/contrast/TRACKER.md
updated: 2026-10-01
---

# APCA Token Matrix — tracker

## Resume here

On `origin/main`. 16 requirements: 9 verified, 5 implemented without a covering test, 2 missing. Next action: add tests for the `implemented` rows. No blocker.

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
| APC-R06 | implemented | e2e exports a filtered CSV | Pass/fail filter result not asserted |
| APC-R07 | implemented | — | |
| APC-R08 | verified | e2e (heatmap row and column headers) | |
| APC-R09 | verified | unit "chooses readable UI metric text independently of the tested foreground token" | |
| APC-R10 | implemented | — | |
| APC-R11 | verified | e2e (`contrast-matrix.csv`) | |
| APC-R12 | implemented | — | |
| APC-R13 | verified | `tests/e2e/accessibility.spec.ts` route `apca-token-matrix` | |
| APC-R14 | implemented | — | No viewport test for this route |
| APC-R15 | missing | — | Delivered through TASK-028 |
| APC-R16 | missing | — | Added 2026-10-02 |

## Open work

0. Build the requirements added 2026-10-02: APC-R16.
1. Add tests for APC-R06, R07, R10, R12, R14.
2. APC-R15 with TASK-028.

## Known limitations

- Colour-vision previews are approximations, not pass/fail checks (design).

## Verification evidence

- 2026-10-01, `main` @ `f2390dca`: `tests/unit/contrast.test.ts` 9/9; `tests/e2e/contrast.spec.ts` 4 passed (desktop and mobile); accessibility spec for the route 2 passed.

## Change log

- 2026-10-02 — Added APC-R16 (default integration rule).
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.

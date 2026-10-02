---
tool: fluid-type-matrix
folder: src/tools/typography
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-01-fluid-type-matrix-design.md
tracker: src/tools/typography/TRACKER.md
updated: 2026-10-01
---

# Fluid Type Matrix — tracker

## Resume here

On `origin/main`. 15 requirements: 11 verified, 2 implemented without a covering test, 2 missing. The catalog title promises a spacing scale (FTM-R12), which the tool does not have. Next action: owner decides whether to build FTM-R12 or change the title.

## Documents

- Spec: [2026-10-01-fluid-type-matrix-design.md](../../../docs/superpowers/specs/2026-10-01-fluid-type-matrix-design.md)
- Code: `fluid-engine.ts` (clamp math, scale, CSS evaluation), `TypographyWorkspace.tsx` (UI)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/typography.test.ts`; browser test: `tests/e2e/typography.spec.ts`

## Requirement status

`unit` = `tests/unit/typography.test.ts`; `e2e` = `tests/e2e/typography.spec.ts` "keeps emitted fluid CSS accurate across precision, resizing, unit, ratio, and preview controls".

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| FTM-R01 | verified | unit "converts rem-per-pixel slope into a correct vw coefficient"; e2e | |
| FTM-R02 | verified | unit "makes the root-size assumption change the generated vw coefficient"; e2e | |
| FTM-R03 | verified | e2e (20–40 px after switching) | |
| FTM-R04 | verified | unit "supports px output and rejects invalid ranges, roots, ratios, and fractional scale steps"; e2e (ratio 0) | |
| FTM-R05 | verified | unit "increases emitted precision instead of collapsing tiny valid clamps to zero"; e2e | |
| FTM-R06 | verified | unit "validates the serialized expression at both audited endpoints"; e2e | |
| FTM-R07 | verified | unit "creates named scale steps…", "gives every step its own clamp…", "interpolates midway and honours an arbitrary integer step range"; e2e (step truncation) | |
| FTM-R08 | verified | e2e (live size changes after resize) | |
| FTM-R09 | verified | e2e (two preview widths) | |
| FTM-R10 | implemented | — | |
| FTM-R11 | verified | e2e (download name) | |
| FTM-R12 | missing | — | Promised by the catalog title; not built |
| FTM-R13 | verified | `tests/e2e/accessibility.spec.ts` route `fluid-type-matrix` | |
| FTM-R14 | implemented | — | No viewport test for this route |
| FTM-R15 | missing | — | Delivered through TASK-028 |

## Open work

1. Owner decision on FTM-R12 (build the spacing scale or change the title).
2. Add tests for FTM-R10, R14.
3. FTM-R15 with TASK-028.

## Known limitations

- One base size range; the scale steps are derived from it by the ratio.

## Verification evidence

- 2026-10-01, `main` @ `9a828841`: `tests/unit/typography.test.ts` 8/8; `tests/e2e/typography.spec.ts` 2 passed (desktop and mobile); accessibility spec for the route 2 passed.

## Change log

- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.

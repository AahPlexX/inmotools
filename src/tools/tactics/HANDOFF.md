# Tactical Matchboard Studio Handoff

## Workstream identity

- Branch: `feature/tactical-matchboard-studio`
- Original branch base: `4dcc856bc97027862342513cdea7eb769c0ffbc1`
- Last validated source tip: `f4f4cdec43507ad9bf995264c95716dd04b9be44`
- Existing PR: **#76 only**; keep it draft/open/unmerged. Do not create a parallel Tactical Matchboard PR.
- Milestone: **Task 5 — timeline, trajectories and coordinated motion (Gauntlet reopened)**
- Verified functional features: **14/60**
- Registration: Tactical Matchboard Studio is registered in the catalog and lazy workspace loader.

Documentation commits after the validated source tip do not change Tactical runtime behavior. The live branch ref is authoritative after documentation updates.

## Exact next sequential action

Continue **T05-01**. Gauntlet invalidated the prior blanket 16–26 verification.

Exact order:
1. #17 interactive Bézier path nodes/tangent handles with pointer + keyboard/numeric alternatives.
2. #19 scene rename/reorder/split/join.
3. #20 generalized object/layer temporal visibility.
4. #22 typed markers/coaching triggers.
5. #23 named editable coordinated-action template library.
6. #24 linked-unit line-shift, step/drop and width/depth controls.
7. Re-run Task 5 units, TypeScript/build, desktop/mobile browser, Axe, keyboard and reflow evidence.
8. Only then close T05 and unlock T06.

Rows #16, #18, #21, #25 and #26 are verified. #25 has visible ball attachment/handoff/release proof and SVG ball rendering through `f4f4cde`.

## Task 5 closure evidence

Task 5 is **ACTIVE** after Gauntlet found accepted-scope gaps in rows 17, 19, 20, 22, 23 and 24.

## Current verified feature rows

Verified: **1, 2, 9, 10, 11, 12, 13, 14, 15, 16, 18, 21, 25, 26**.

In progress: **3, 4, 5, 7, 8, 17, 19, 20, 22, 23, 24, 51, 52, 55, 56, 59**.

All other accepted rows remain planned until their dependency-ordered work begins. The deterministic denominator remains 60.

## Core architecture that must be preserved

- Browser-local/static architecture only: no auth, backend database, telemetry, remote project processing, cloud project storage, client secret/API key, or AI product surface.
- Canonical positions use normalized `[0,1]` coordinates; physical calculations derive from pitch metre dimensions.
- Timeline/project time uses integer milliseconds.
- Pure deterministic engines own geometry, timing, and validation; React owns accessible interaction state.
- Scene-owned entities keep explicit scene/layer ownership.
- Timeline preview samples an immutable presentation copy; scrubbing/playback must not pollute canonical project state or undo history.
- Analytics must remain source-honest: geometric outputs are not probability, GPS, intent, or officiating claims.
- Preserve exact-pinned dependencies; do not add/upgrade dependencies without current official + registry verification and a demonstrated need.
- Continue test-first for new behavior/defects, but do not duplicate already-proven tests or reimplement dependency/library functionality.

## Multi-agent / branch rules

- Stay on `feature/tactical-matchboard-studio`.
- Use existing PR #76 only.
- Before every mutation, compare the last known branch tip with the live remote ref. If another agent advanced it, refresh and reconcile before writing.
- An ACTIVE queue item's Primary files are reserved.
- Forward agent takes the lowest-numbered READY item.
- Reverse agent takes the highest-numbered READY item whose dependencies are DONE and whose Primary files do not overlap ACTIVE work.
- Never force-push, destructively rebase, delete the branch, or merge partial work.
- Reconciliation with then-current `main` remains T14 after the branch-complete gate.

## Known non-Tactical repository context

A prior consolidated repository unit run had one unrelated Markdown Chicago author-date timeout. Do not chase unrelated failures from this workstream unless current Tactical changes demonstrably cause them.

## Documentation contract

Whenever material Tactical state changes, update together:
- `src/tools/tactics/FEATURE_MATRIX.md`
- `src/tools/tactics/TODO_SEQUENCE.md`
- `src/tools/tactics/HANDOFF.md`
- `.tasks/IN_PROGRESS.md`
- existing PR #76 summary when its milestone/count/evidence becomes stale.

# Tactical Matchboard Studio Handoff

## Workstream identity

- Branch: `feature/tactical-matchboard-studio`
- Original branch base: `4dcc856bc97027862342513cdea7eb769c0ffbc1`
- Last fully browser-validated source tip: `69bec32e29dbed806c4439b9a80314c918e4dda2`
- Existing PR: **#76 only**; keep it draft/open/unmerged. Do not create a parallel Tactical Matchboard PR.
- Milestone: **Task 5 — timeline, trajectories and coordinated motion (Gauntlet reopened)**
- Verified functional features: **16/60**
- Registration: Tactical Matchboard Studio is registered in the catalog and lazy workspace loader.

Documentation commits after the validated source tip do not change Tactical runtime behavior. The live branch ref is authoritative after documentation updates.

## Exact next sequential action

Finish the exact-source **T05-01 validation gate** at `c6550af2a0b32f970983e2aed2c70fed68817346`.

1. Read workflow run `36204645295` after completion.
2. Confirm the full Tactical Matchboard browser matrix has no tactical failures across desktop/mobile Chromium, including Axe, keyboard, pointer/touch-equivalent, reflow and target checks.
3. If Tactical is clean, promote rows #20, #22, #23 and #24 from `implemented` to `verified`, raising the deterministic count from 16/60 to 20/60.
4. Mark T05 DONE and T06 spatial analysis ACTIVE; then implement rows #27–#34 in the dependency order already recorded in `TODO_SEQUENCE.md`.
5. If any Tactical failure remains, repair it test-first before changing the verified numerator or unlocking T06.

Rows #16, #17, #18, #19, #21, #25 and #26 are already verified. Rows #20, #22, #23 and #24 are implemented at the candidate tip and are verification-pending.

## Task 5 closure evidence

Task 5 is **ACTIVE — exact browser validation pending**. The previously reopened accepted semantics for rows 20, 22, 23 and 24 are implemented. At `c6550af`, repository units and production/PWA build pass; browser run `36204645295` is the remaining closure gate.

## Current verified feature rows

Verified: **1, 2, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 25, 26**.

In progress/verification-pending: **3, 4, 5, 7, 8, 20, 22, 23, 24, 51, 52, 55, 56, 59**.

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

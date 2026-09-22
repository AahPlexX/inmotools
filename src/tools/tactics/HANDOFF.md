# Tactical Matchboard Studio Handoff

## Workstream identity

- Branch: `feature/tactical-matchboard-studio`
- Original branch base: `4dcc856bc97027862342513cdea7eb769c0ffbc1`
- Last validated source commit: `163a63d78131e90762246e86f58803e87d9d4788`
- Current comparison to `main`: **51 commits ahead / 5 behind**, status `diverged`
- Existing PR: **#76 only**; draft/open/unmerged. Do not create a replacement Tactical Matchboard PR.
- Milestone: **Task 3 — registered beginner vertical slice; focused browser contract next**
- Verified functional features: **0/60**
- Registration status: catalog entry and lazy workspace loader are now registered after executable unit/type/build gates passed.

A committed handoff file cannot contain its own final Git SHA because its contents participate in that SHA. The branch ref is authoritative after documentation commits.

## Exact next sequential action

Open `src/tools/tactics/TODO_SEQUENCE.md` and execute **T03-04**. It is the sole READY item.

T03-04 must add a focused browser contract in `tests/e2e/tactical-matchboard-studio.spec.ts` plus the repository selector entry in `scripts/select-e2e-specs.mjs`. Cover beginner setup, player selection, click-to-move, D-pad movement, numeric movement, two-point arrow authoring, undo/redo, SVG download, and touch-equivalent operation on desktop and mobile Chromium.

Do not advance to T03-05 until that focused browser contract is executable and green. T03-05 then owns Axe, keyboard-only, device-width/reflow, and target-size validation.

## Current executable evidence

- `1374fd43c025d20a661317b54def6dede1cedaaf`: focused tactical units **22/22 passed**, TypeScript exit 0, production Vite build successful (`✓ built in 1m 37s`).
- Registration TDD: new catalog contract was observed RED first (**22 passed / 1 failed**, Tactical entry undefined).
- `163a63d78131e90762246e86f58803e87d9d4788`: focused tactical units **23/23 passed** and TypeScript exit 0 on the exact committed SHA.
- Exact-commit Vite build log at `163a63d...` records `✓ built in 55.63s` and emits dedicated `TacticalMatchboardWorkspace` JS/CSS chunks.
- Existing Vite browser-externalization and large-chunk messages are repository-wide warnings from pinned dependencies, not Tactical Matchboard failures.

## Current implementation state

The pure/editor foundation includes schema-versioned canonical project state, normalized coordinates, physical conversion, provenance-bearing format/formation data, deterministic formation placement and mirroring, bounded immutable undo/redo, editor/layer operations, locked-layer protection, validation, and deterministic accessible SVG serialization.

The registered beginner slice now provides:
- editable project/team/colors/pitch dimensions/direction and formation selection;
- deterministic roster/token materialization;
- pointer/touch player selection and click-to-move;
- explicit D-pad and numeric X/Y precision movement as non-drag alternatives;
- two-point tactical arrow authoring;
- undo/redo and real local SVG download;
- pitch-first responsive styling and reduced-motion handling;
- one source-honest catalog entry and one lazy loader in the global workspace registry.

## Active feature state

In progress: **1, 3, 4, 5, 7, 8, 9, 10, 11, 13, 14, 51, 52, 55, 56, 59**.

All other accepted feature rows remain planned. No feature is verified yet. The numerator remains 0 until a row's complete accepted behavior has every required unit/build/browser/accessibility/persistence/export proof.

## Accessibility/input ruling

The current movement workflow intentionally does not require dragging: pitch taps/clicks move the selected player, visible player buttons provide explicit selection, D-pad buttons and numeric coordinates provide precision movement, and arrows use two single-pointer placements. Browser/Axe/keyboard validation is still pending and must not be inferred from source inspection.

## Execution-order / multi-agent contract

`TODO_SEQUENCE.md` is the authoritative task order.

- Forward agent: take the lowest-numbered READY item.
- Reverse agent: take the highest-numbered READY item whose dependencies are all DONE and whose Primary files do not overlap an ACTIVE item.
- Before every mutation, compare the last known branch tip to the live branch and refresh if another agent advanced it.
- Never edit Primary files reserved by another ACTIVE queue item.
- T14/T15 integration/deployment are never reverse-safe before branch-complete.
- Keep this file, `FEATURE_MATRIX.md`, `TODO_SEQUENCE.md`, and `.tasks/IN_PROGRESS.md` synchronized whenever material state changes.

## Open blockers / deferred evidence

- Focused desktop/mobile browser validation is not yet recorded; T03-04 is next.
- Axe, keyboard-only, viewport/reflow and target-size evidence is deferred to T03-05 after the browser contract exists.
- Current authoritative futsal/specialty geometry still requires exact primary-source verification before any preset can be labeled sourced/official.
- Task 4 through Task 15 remain accepted dependency-ordered scope exactly as enumerated in `TODO_SEQUENCE.md`; they are not removed from the 60-feature denominator.
# Tactical Matchboard Studio Handoff

## Workstream identity

- Branch: `feature/tactical-matchboard-studio`
- Original branch base: `4dcc856bc97027862342513cdea7eb769c0ffbc1`
- Last validated source commit: `b2ec46e39712796731bc83a8cd40f82ec9caeeec`
- Current comparison to `main`: **63 commits ahead / 12 behind**, status `diverged`
- Existing PR: **#76 only**; draft/open/unmerged. Do not create a replacement Tactical Matchboard PR.
- Milestone: **Task 5 — timeline, trajectories and coordinated motion**
- Verified functional features: **9/60**
- Registration status: catalog entry and lazy workspace loader are now registered after executable unit/type/build gates passed.

A committed handoff file cannot contain its own final Git SHA because its contents participate in that SHA. The branch ref is authoritative after documentation commits.

## Exact next sequential action

Open `src/tools/tactics/TODO_SEQUENCE.md` and continue **T05-01**. It is now the sole ACTIVE forward item.

Start with a pure deterministic timeline engine over the existing canonical project schema: integer-time tracks/keyframes, interpolation/easing, visibility spans, offsets and markers. Add behavioral contracts before implementation, then expose browser controls only after the engine invariants are green. Do not create a parallel scene graph or add a dependency unless a proven requirement cannot be met with the existing stack.

Task 4 is closed. Current sourced rules remain provenance-bearing and editable copies remain non-authoritative.

## Current executable evidence

- `1374fd43c025d20a661317b54def6dede1cedaaf`: focused tactical units **22/22 passed**, TypeScript exit 0, production Vite build successful (`✓ built in 1m 37s`).
- Registration TDD: new catalog contract was observed RED first (**22 passed / 1 failed**, Tactical entry undefined).
- `163a63d78131e90762246e86f58803e87d9d4788`: focused tactical units **23/23 passed** and TypeScript exit 0 on the exact committed SHA.
- Exact-commit Vite build log at `163a63d...` records `✓ built in 55.63s` and emits dedicated `TacticalMatchboardWorkspace` JS/CSS chunks.
- `f885ed383b0bac6e85a10115a765d85baaad34b0`: focused tactical plus selector units **26/26 passed**, production/PWA build succeeded, and the focused Tactical Matchboard spec passed **10/10** scenarios across desktop and mobile Chromium.
- `ff82ade9e8290d382ec868bcb1dc4c58eca6c2b8`: expanded Tactical Matchboard browser gate passed **14 scenarios** with **2 intentional duplicate-project skips**, covering keyboard activation, Axe, phone/tablet/laptop/desktop reflow, document overflow, and essential 44px targets.
- `a8ee9f46`: **29/29** focused tactical units and **3/3** selector units passed; TypeScript-checked production/PWA build passed (`✓ built in 1m 8s`); the expanded tactical browser gate passed **16 scenarios** with **2 intentional duplicate-project skips** across desktop/mobile Chromium.
- `b2ec46e39712796731bc83a8cd40f82ec9caeeec`: Task 4 closure source passes **30/30** focused tactical units plus **3/3** selector units, TypeScript and production/PWA build, and **16 browser scenarios** with **2 intentional duplicate-project skips**. Evidence includes current IFAB 2026/27, FIFA Futsal 2025-26 and U.S. Soccer PDI overlays/restart aids, sourced-profile forks, vertical/horizontal whole-project transforms, keyboard/touch, Axe, reflow and 44px targets.
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
- profile-driven rules/pitch application with visible provenance, custom rules profiles, and deterministic specialty overlays;
- source-honest formation libraries plus arbitrary-size custom formation authoring and count/assignment review;
- immutable phase capture/morphing and whole-project mirror/flip actions;
- provenance-bearing built-in restart starters and validated custom restart-template authoring.

## Active feature state

Verified: **1, 2, 9, 10, 11, 12, 13, 14, 15**.

In progress: **3, 4, 5, 7, 8, 51, 52, 55, 56, 59**.

All other accepted feature rows remain planned. The numerator includes only the nine rows whose complete accepted behavior has the relevant unit/build/browser/accessibility proof.

## Accessibility/input ruling

The current movement workflow intentionally does not require dragging: pitch taps/clicks move the selected player, visible player buttons provide explicit selection, D-pad buttons and numeric coordinates provide precision movement, and arrows use two single-pointer placements. The current rules/formation/restart panel is covered by desktop/mobile workflows, Axe, keyboard reachability, five CSS-width classes, overflow checks, and essential 44px target checks.

## Execution-order / multi-agent contract

`TODO_SEQUENCE.md` is the authoritative task order.

- Forward agent: take the lowest-numbered READY item.
- Reverse agent: take the highest-numbered READY item whose dependencies are all DONE and whose Primary files do not overlap an ACTIVE item.
- Before every mutation, compare the last known branch tip to the live branch and refresh if another agent advanced it.
- Never edit Primary files reserved by another ACTIVE queue item.
- T14/T15 integration/deployment are never reverse-safe before branch-complete.
- Keep this file, `FEATURE_MATRIX.md`, `TODO_SEQUENCE.md`, and `.tasks/IN_PROGRESS.md` synchronized whenever material state changes.

## Open blockers / deferred evidence

- Task 4 is closed with current-source rules geometry, legality aids, unit/build/browser/accessibility evidence and a reconciled 9/60 feature ledger.
- T05-01 is active; timeline, trajectory and coordinated-motion behavior is not yet implemented or verified.
- The branch is intentionally 63 commits ahead / 12 behind current main; reconciliation remains deferred until T14 after the branch-complete gate.
- Task 5 through Task 15 remain accepted dependency-ordered scope exactly as enumerated in `TODO_SEQUENCE.md`; they are not removed from the 60-feature denominator.

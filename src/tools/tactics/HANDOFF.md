# Tactical Matchboard Studio Handoff

## Workstream identity

- Branch: `feature/tactical-matchboard-studio`
- Original branch base: `4dcc856bc97027862342513cdea7eb769c0ffbc1`
- Tracked branch tip immediately before this handoff write: `cdc98273cd0142eec6af2e32bd7430a94d53b925`
- Last source-code commit before documentation-only synchronization: `a6225790fabfbc835e174cc439afbdf33a2a23cb`
- Current comparison to `main`: **44 commits ahead / 5 behind**, status `diverged`
- Existing PR: **#76 only**; draft/open/unmerged. Do not create a replacement Tactical Matchboard PR.
- Milestone: **Task 3 — unregistered beginner board/workspace slice authored; executable gate pending**
- Verified functional features: **0/60**
- Registration status: intentionally unregistered until T03-01/T03-02 executable gate is green.

A committed handoff file cannot contain the SHA of its own final commit because its contents participate in that SHA. The branch ref is authoritative after this file is committed.

## Exact next sequential action

Open `src/tools/tactics/TODO_SEQUENCE.md` and execute **T03-01**. It is the only READY item.

T03-01 requires executable evidence on the current branch tip:
1. `pnpm exec vitest run tests/unit/tactics-engine.test.ts`
2. `pnpm build`

The connected GitHub surface currently reports **no GitHub Actions workflow runs** for the tactical commits, so neither the RED contract nor the current implementation has repository-run unit/build proof. Do not claim green until an actual runner produces it. CodeRabbit success is not a unit/build gate.

If T03-01 is red, execute T03-02 against the exact diagnostics. If T03-01 is green, T03-03 becomes READY and may add the catalog/lazy-loader route. Do not register before that point.

## Current implementation state

The pure/editor foundation includes:
- schema-versioned canonical `TacticalProject`, integer timeline time, normalized `[0,1]` coordinates, physical metre conversion and validation;
- editable non-authoritative generic format profiles and provenance-bearing U.S. Soccer formation examples;
- deterministic formation count/goalkeeper validation, placement and direction mirroring;
- immutable bounded undo/redo history capped at 100 snapshots;
- team, roster, player-token, equipment and annotation mutations;
- explicit scene/layer ownership and locked-layer write protection;
- missing scene/layer reference validation;
- deterministic accessible SVG serialization preserving physical pitch aspect ratio and escaping user-authored text.

The current unregistered beginner slice adds:
- `workspace-engine.ts`: coherent formation project builder, client-to-normalized coordinate conversion, clamped precision nudges, collision-safe tactical-arrow creation;
- `TacticalBoard.tsx`: pointer/touch pitch selection, move-mode player selection, arrow-mode two-point placement surface, shared SVG preview;
- `TacticalMatchboardWorkspace.tsx`: editable project/team/colors/pitch dimensions/direction, formation selection, roster/token materialization, player picker, click-to-move, D-pad movement, numeric X/Y movement, two-point arrow authoring, undo/redo and real SVG download;
- `tactical-matchboard.css`: pitch-first responsive layout, narrow single-column fallback, 44px+ tactical controls and reduced-motion handling;
- focused unit contracts for beginner project materialization, normalized client mapping, precision nudging and deterministic arrow creation.

No global catalog/workspace registration has been added.

## Active feature state

In progress: **1, 3, 4, 5, 7, 8, 9, 10, 11, 13, 14, 51, 52, 55, 56, 59**.

All other accepted feature rows remain planned. No feature is verified. The numerator stays 0 until the complete accepted behavior of a feature has the evidence required by `FEATURE_MATRIX.md`.

## Accessibility/input ruling

The current interaction intentionally does not require dragging:
- pitch taps/clicks move the selected player;
- visible player buttons provide explicit selection;
- D-pad buttons and numeric coordinates provide non-drag precision movement;
- arrows use two single-pointer placements.

This is aligned with the current WCAG 2.2 requirement that drag functionality have a single-pointer non-drag alternative. Browser/Axe/keyboard validation is still pending and must not be inferred from source inspection.

## Execution-order / multi-agent contract

`TODO_SEQUENCE.md` is the authoritative task order.

- Forward agent: take the lowest-numbered READY item.
- Reverse agent: take the highest-numbered READY item whose dependencies are all DONE and whose Primary files do not overlap an ACTIVE item.
- Before every mutation, compare the last known branch tip to the live branch. Refresh first if another agent advanced it.
- Never edit Primary files reserved by another ACTIVE queue item.
- T14/T15 integration/deployment are never reverse-safe before branch-complete.
- Keep this file, `FEATURE_MATRIX.md`, `TODO_SEQUENCE.md`, and `.tasks/IN_PROGRESS.md` synchronized whenever material state changes.

## Open defects / blockers

- **Execution evidence blocker:** no repository Actions run exists for the current tactical commits through the connected GitHub surface.
- **Registration blocker:** route/catalog registration waits for T03-01/T03-02 green evidence.
- **Browser validation blocker:** there is no registered route yet, so focused Playwright/Axe/reflow proof is intentionally deferred to T03-04/T03-05.
- Current authoritative futsal/specialty geometry still requires exact primary-source verification before any preset can be labeled sourced/official.

## Intentionally deferred by sequence

Task 4 rules/restart authoring, timeline/animation, spatial analysis, Dexie persistence, synchronized 3D, local video, professional multi-format export, final accessibility/QoL hardening, adversarial/performance audit, branch-complete reconciliation, integration and deployment remain accepted scope. Their exact order and gates are enumerated in `TODO_SEQUENCE.md`; they are not removed from the 60-feature denominator.

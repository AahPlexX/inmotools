# Tactical Matchboard Studio Handoff

## Workstream identity

- Branch: `feature/tactical-matchboard-studio`
- Original branch base: `4dcc856bc97027862342513cdea7eb769c0ffbc1`
- Last fully validated source tip: `bdb28e447f50cf9e2009e5ed53ed67984a727bbd`
- Existing PR: **#76 only**; keep it draft/open/unmerged. Do not create a parallel Tactical Matchboard PR.
- Milestone: **Task 6 — spatial analysis**
- Verified functional features: **20/60**
- Registration: Tactical Matchboard Studio is registered in the catalog and lazy workspace loader.

Documentation commits after the validated source tip do not change Tactical runtime behavior. The live branch ref is authoritative after documentation updates.

## Exact next sequential action

Open `src/tools/tactics/TODO_SEQUENCE.md` and execute **T06-01**. It is the sole READY item.

T06-01 order is deterministic:
1. Pure Euclidean Voronoi plus convex hull/centroid/width/depth geometry.
2. Passing-lane clearance plus authored orientation/vision sectors.
3. Positional grid plus distance rings/dynamic tethers.
4. Trajectory occupancy heat map plus authored/imported speed and distance metrics.
5. Add explicit analytical-honesty labels to the UI.
6. Run focused unit, TypeScript/build, desktop/mobile browser, keyboard/Axe/reflow evidence.
7. Reconcile feature rows 27–34 before unlocking T07.

Do not start Dexie/persistence, 3D, local video, professional export, final QoL hardening, branch reconciliation, or deployment while T06 is incomplete.

## Task 5 closure evidence

Task 5 is DONE at validated source tip `bdb28e447f50cf9e2009e5ed53ed67984a727bbd`.

- Focused Task 5 engine gate: **35/35 passed** plus TypeScript exit 0.
- Production/PWA build: green; Vite transformed 6,619 modules and reported `built in 12.65s`.
- Full Tactical Playwright gate: **26 passed / 2 intentional duplicate-project skips** across desktop and mobile Chromium.
- Accessibility/reflow evidence remains green: focused Axe has no serious/critical violations; phone portrait/landscape, tablet, laptop, and desktop widths preserve no page overflow and 44px essential targets.
- The two browser skips intentionally avoid rerunning the same shared-DOM Axe and CSS-width matrices in the emulated mobile project; mobile user workflows execute independently.
- Existing repository-wide Vite browser-externalization and large-chunk warnings are not Tactical failures.

Task 5 verified rows **16–26**:
- multi-track timeline, sampled presentation, and deterministic transport;
- spatial quadratic/cubic Bézier motion authoring;
- preset and custom cubic-bezier timing easing;
- multi-scene sequencing with independent scene-owned clones and scene-local legality;
- temporal visibility spans;
- single-track offset plus grouped stagger timing;
- coaching-trigger markers;
- coordinated tactical actions;
- linked units;
- possession/release/handoffs;
- physical-metre potential path-conflict review.

## Current verified feature rows

Verified: **1, 2, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26**.

In progress: **3, 4, 5, 7, 8, 51, 52, 55, 56, 59**.

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

# Tactical Matchboard Studio Handoff

## Workstream identity

- Branch: `feature/tactical-matchboard-studio`
- Original branch base: `4dcc856bc97027862342513cdea7eb769c0ffbc1`
- Last fully browser-validated source tip: `c3ad7fb603f78456740f954b833c8db496d19d9e`
- Existing PR: **#76 only**; keep it draft/open/unmerged. Do not create a parallel Tactical Matchboard PR.
- Milestone: **Task 10 — professional export and metadata**
- Verified functional features: **42/60**
- Registration: Tactical Matchboard Studio is registered in the catalog and lazy workspace loader.

Documentation commits after the validated source tip do not change Tactical runtime behavior. The live branch ref is authoritative after documentation updates.

## Exact next sequential action

**T10-01 — professional export and metadata is ACTIVE.** Keep export local and capability-negotiated. Do not expose a video format combination before `VideoEncoder.isConfigSupported()` or the pinned Mediabunny API confirms it, and keep the frame-sequence ZIP plus project JSON/ZIP fallbacks. Analytics report export remains row 50; do not reopen rows 43–48.

## Task 9 closure evidence

Task 9 is **DONE** at runtime source `c3ad7fb603f78456740f954b833c8db496d19d9e`. Fresh focused Tactical/selector units pass **117/117**; TypeScript and the production/PWA build pass; and the full Tactical Playwright spec passes **56 / 2 intentional duplicate mobile Axe/reflow skips / 0 failures**. Desktop and mobile coverage includes unsupported local files, undecodable video, integer-millisecond seek and frame step, non-destructive telestration with scrubbing kept out of undo, manual hold/linear tracking, event tags, ordered clip playback, manual multi-angle sync, object-URL cleanup units, 44px controls, overflow, and Axe. Rows **43–48** are verified. The feature-matrix header that still said 32/60 after Task 8 is reconciled to the verified-row count **42/60**.

## Task 8 closure evidence

Task 8 is **DONE** at runtime source `5d76a91b74d78b913796875853af31977c22833f`. Fresh exact-source focused Tactical/selector units pass **106/106**; TypeScript and the production/PWA build pass; explicit lifecycle tests verify frame deduplication, hidden-tab pause/resume and geometry/material disposal; and the full Tactical Playwright contract passes **52 / 2 intentional duplicate mobile Axe/reflow skips / 0 failures**. The 3D runtime is lazy-loaded, derives pitch/players/ball from the same sampled project as 2D, preserves authored ball elevation, provides tactical/broadcast/touchline/goal-line camera presets plus deterministic keyframes, rejects invalid/duplicate camera states, shares selection/editing, prevents orbit drags from becoming player clicks, and cleans renderer resources. Rows **35–38** are verified.

## Task 7 closure evidence

Task 7 is **DONE** at runtime source `f22b134e3accd7c4bc0152a2a0d70b769851ce33`. Fresh exact-source local verification passes **10/10** persistence units, TypeScript/production/PWA build, and the full Tactical Playwright spec with **50 passed / 2 intentional duplicate mobile Axe/reflow skips / 0 failures**. ZIP/CSV interchange, corrupt-import preservation, session/snapshot editing, vault lifecycle, reload recovery, accessibility and responsive controls are covered. Rows **42, 49, 56, 60** are verified; row 50 remains Task 10 analytics report export.

## Task 6 closure evidence

Task 6 is **DONE** at runtime source `c41fe4704f3710a919912264f9a37f663b761f4e`. Fresh exact-source local verification passes **10/10** spatial-analysis units, production/PWA build, and the full Tactical browser spec with **40 passed / 2 intentional mobile duplicate Axe/reflow skips / 0 failures**. That browser contract explicitly covers keyboard operation, Axe, five responsive widths, 44px targets, all eight spatial overlays, authored orientation, metric/imperial tethers, and authored trajectory duration/speed/occupancy. GitHub run `36284500497` on the same tip independently passes repository units and build while its full repository browser matrix continues.

## Task 5 closure evidence

Task 5 is **DONE** at runtime source `c6550af2a0b32f970983e2aed2c70fed68817346`. Repository units and production/PWA build pass. Workflow run `36204645295` executed the complete Tactical browser spec in desktop/mobile Chromium with no Tactical failures: 36 passed plus 2 intentional mobile duplicate Axe/reflow skips. The workflow's 12 failures were outside Tactical scope.

## Current verified feature rows

Verified: **1, 2, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 42, 43, 44, 45, 46, 47, 48, 49, 56, 60**.

In progress: **3, 4, 5, 7, 8, 51, 52, 55, 59**.

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

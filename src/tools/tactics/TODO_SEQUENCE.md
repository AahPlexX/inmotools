# Tactical Matchboard Studio Execution Queue

**Updated:** 2026-09-29
**Branch:** `feature/tactical-matchboard-studio`  
**Existing PR:** #76 only — do not create a replacement/parallel PR.  
**T13-01 tested tip:** `d0e23d4763ac2c138845862f64f09299cdb66e19`  
**Runtime source unchanged:** `6dad76880d4da428fdae9a1d93b74d4c4e5c53f6`

## Purpose and source-of-truth roles

- `FEATURE_MATRIX.md` is the authoritative 60-feature status ledger.
- `TODO_SEQUENCE.md` is the authoritative execution order and concurrency contract.
- `HANDOFF.md` is the authoritative resume snapshot and exact next action.
- `.tasks/IN_PROGRESS.md` is the repository-wide pointer to this workstream.
- The implementation plan/spec define accepted scope and completion gates; this queue does not shrink them.

## Agent coordination protocol

1. Stay on the single branch above. Never create another Tactical Matchboard branch or PR unless the user explicitly changes this rule.
2. Before every write, compare the last known branch tip to the live branch. If another agent advanced it, refresh the affected files and re-evaluate before writing.
3. An agent must treat the **Primary files** on an `ACTIVE` item as reserved. Do not concurrently edit those files from another queue item.
4. A forward-working agent takes the lowest-numbered `READY` item.
5. A reverse-working agent takes the highest-numbered `READY` item **whose dependencies are all DONE** and whose Primary files do not overlap an ACTIVE item.
6. `BLOCKED` means do not implement it yet. `CONDITIONAL` means execute only if its condition becomes true.
7. Do not mark an item `DONE` from code inspection alone when its Exit evidence requires an executable gate.
8. Update this file, `HANDOFF.md`, `FEATURE_MATRIX.md`, and `.tasks/IN_PROGRESS.md` in the same development round whenever material state changes.

## Ordered queue

### T03-01 — Execute current Task 3 gate
- **Status:** DONE
- **Depends on:** none
- **Primary files:** `tests/unit/tactics-engine.test.ts`, current tactical source files only if the gate exposes a defect
- **Evidence:** exact SHA `1374fd43c025d20a661317b54def6dede1cedaaf` passed **22/22** focused tactical units, `tsc --noEmit -p tsconfig.app.json` with exit 0, and a production Vite build (`✓ built in 1m 37s`).
- **Exit evidence:** satisfied. The earlier verifier pnpm-path mismatch was environmental and required no repository change.
- **Reverse-safe:** complete.
### T03-02 — Correct gate defects
- **Status:** DONE — conditional branch not triggered
- **Depends on:** T03-01 produces a real failing diagnostic
- **Primary files:** only files named by a failing diagnostic; tactical scope only
- **Outcome:** T03-01 was green after correcting only the verifier invocation. No Tactical Matchboard source defect was produced, so no corrective code task was required.
- **Exit evidence:** no failing tactical diagnostic remained.
- **Reverse-safe:** complete.
### T03-03 — Register the coherent beginner vertical slice
- **Status:** DONE
- **Depends on:** T03-01 green; T03-02 not triggered
- **Primary files:** `src/catalog.ts`, `src/tools/workspaces.tsx`, `tests/unit/tactics-engine.test.ts`
- **Implementation:** commit `163a63d78131e90762246e86f58803e87d9d4788` adds one `ToolSlug`, one source-honest catalog entry, and one lazy workspace loader for the existing `TacticalMatchboardWorkspace`.
- **TDD evidence:** registration contract was RED first (**22 passed / 1 failed**, catalog entry undefined), then GREEN **23/23**. The exact committed SHA passed **23/23** focused units and TypeScript exit 0; exact-commit Vite log records `✓ built in 55.63s` and emits dedicated Tactical Matchboard JS/CSS chunks.
- **Exit evidence:** route registration compiles/builds without removing unrelated catalog/workspace entries.
- **Reverse-safe:** complete.
### T03-04 — Add focused browser contract
- **Status:** DONE
- **Depends on:** T03-03
- **Primary files:** `tests/e2e/tactical-matchboard-studio.spec.ts`, `scripts/select-e2e-specs.mjs`
- **Action:** cover beginner setup, player selection, click-to-move, D-pad movement, numeric movement, two-point arrow authoring, undo/redo, SVG download, and touch-equivalent operation.
- **Implementation:** commit `f885ed383b0bac6e85a10115a765d85baaad34b0` adds the focused Tactical Matchboard browser spec, repository selector mapping, and selector regression coverage.
- **Exit evidence:** exact SHA `f885ed38` passed **26/26** focused tactical/selector units, production/PWA build, and **10/10** focused Playwright scenarios across desktop and mobile Chromium.
- **Reverse-safe:** complete.

### T03-05 — Accessibility and responsive gate
- **Status:** DONE
- **Depends on:** T03-04
- **Primary files:** tactical workspace/board/CSS and tactical e2e only
- **Action:** run Axe plus keyboard-only and device-width coverage; verify no essential operation relies on dragging; verify target sizing/reflow and phone/tablet/laptop layouts.
- **Implementation:** commit `ff82ade9e8290d382ec868bcb1dc4c58eca6c2b8` extends the focused browser contract with keyboard activation, Axe, five CSS-width viewport classes, document overflow, and essential 44px target checks.
- **Exit evidence:** **14 passed / 2 intentionally skipped** across desktop and mobile Chromium. The skips avoid rerunning the same shared-DOM Axe and CSS-width matrices in the emulated mobile project; mobile workflow and keyboard cases still execute there.
- **Reverse-safe:** complete.

### T03-06 — Close Task 3 vertical-slice milestone
- **Status:** DONE
- **Depends on:** T03-05
- **Primary files:** `FEATURE_MATRIX.md`, `HANDOFF.md`, `TODO_SEQUENCE.md`, `.tasks/IN_PROGRESS.md`
- **Action:** reconcile feature-row states against evidence; do not inflate the verified numerator for partial features.
- **Exit evidence:** current ledgers agree; no partial row was promoted to verified; exact next task is T04-01.
- **Reverse-safe:** complete.

### T04-01 — Complete pitch/rules/formation authoring
- **Status:** DONE
- **Depends on:** T03-06
- **Primary files:** tactical pitch/formation/rules engines, Tactical workspace rules UI, focused tests
- **Implementation:** `a8ee9f46` established rules/profile application, custom rules/formations/restarts, phase morphing, transforms and accessible authoring UI; `f3a94e2` added editable sourced-profile forks, restart-specific legality review and whole-project vertical-transform evidence; `021cb63`/`42ec61c` updated current FIFA Futsal 2025-26 and IFAB provenance; `b2ec46e39712796731bc83a8cd40f82ec9caeeec` closed the declared-vs-rendered special-line gap with source-backed IFAB, FIFA futsal and U.S. Soccer geometry.
- **Exit evidence:** current primary-source provenance; **30/30** focused tactical units plus **3/3** selector units; TypeScript and production/PWA build; **16 browser scenarios** with **2 intentional duplicate-project skips** across desktop/mobile Chromium, including rules/restarts/transforms, keyboard/touch, Axe, five-width reflow and 44px targets.
- **Verified feature rows:** **1, 2, 9, 10, 11, 12, 13, 14, 15**. The deterministic numerator is **9/60**.
- **Reverse-safe:** complete.
### T05-01 — Timeline, trajectories and coordinated motion
- **Status:** DONE
- **Depends on:** T04-01 DONE
- **Verified rows:** 16–26.
- **Closure evidence:** runtime source `c6550af2a0b32f970983e2aed2c70fed68817346` passes repository units and production/PWA build. Workflow run `36204645295` executed all 19 Tactical scenarios across desktop/mobile Chromium with **36 passed / 2 intentional mobile duplicate Axe/reflow skips / 0 Tactical failures**. The 12 workflow failures were unrelated repository tests.
- **Reverse-safe:** complete.

### T06-01 — Spatial analysis
- **Status:** DONE
- **Depends on:** T05-01 DONE
- **Verified rows:** 27–34.
- **Closure evidence:** exact source `c41fe4704f3710a919912264f9a37f663b761f4e` passes 10/10 focused analysis units, TypeScript/production/PWA build, and the complete Tactical Playwright spec with **40 passed / 2 intentional mobile duplicate Axe/reflow skips / 0 failures**. The contract covers physical-Euclidean Voronoi/hull/clearance geometry, authored orientation/vision, grid/rings/tethers, authored-span occupancy/trajectory metrics, source-honest labels, keyboard operation, Axe, five-width reflow and target sizes. GitHub run `36284500497` independently passes repository units/build on the same tip.
- **Reverse-safe:** complete.

### T07-01 — Persistence, interchange and session planning
- **Status:** DONE
- **Depends on:** T06-01 DONE
- **Primary files:** tactical persistence/import/session modules + tests
- **Action:** Dexie vault, autosave/snapshots/recovery, migration, safe JSON/ZIP round-trip, assets, trajectory import/export, session plans.
- **Exit evidence:** exact runtime source `f22b134` passes 10/10 persistence units, TypeScript/production/PWA build and the full Tactical Playwright spec: 50 passed / 2 intentional duplicate mobile Axe/reflow skips / 0 failures. Desktop/mobile workflows cover ZIP/CSV round trips, corrupt-import preservation, session/snapshot editing, vault lifecycle and reload recovery. Rows 42, 49, 56 and 60 are verified; analytics report row 50 remains Task 10.
- **Reverse-safe:** complete.

### T08-01 — Synchronized 3D presentation
- **Status:** DONE
- **Depends on:** T07-01 DONE
- **Primary files:** tactical Three.js projection modules + UI/tests
- **Implementation:** exact runtime source `5d76a91b74d78b913796875853af31977c22833f` adds immutable normalized↔metre projection, sampled ball elevation, four pitch-aware camera presets, deterministic camera keyframing/interpolation, lazy shared-state Three.js presentation, click-vs-orbit selection guarding, on-demand hidden-tab-aware scheduling, WebGL recovery and explicit GPU/resource disposal.
- **Exit evidence:** fresh focused Tactical/selector units **106/106**, TypeScript + production/PWA build, explicit scheduler/disposal units, and the complete Tactical desktop/mobile Playwright spec **52 passed / 2 intentional duplicate mobile Axe/reflow skips / 0 failures**. Rows 35–38 are verified; numerator is **36/60**.
- **Reverse-safe:** complete.

### T09-01 — Local video review and telestration
- **Status:** DONE
- **Depends on:** T08-01
- **Primary files:** tactical local-media modules + UI/tests
- **Implementation:** runtime source `c3ad7fb603f78456740f954b833c8db496d19d9e` adds schema-v2 video review state, local video open/review, time-ranged telestration, manual hold/linear tracking, match-event tags, ordered clip playlists, manual multi-angle sync, and deterministic object-URL/listener cleanup. Scrubbing stays outside undo history.
- **Exit evidence:** focused Tactical/selector units **117/117**, TypeScript/production/PWA build, and the full Tactical Playwright spec **56 passed / 2 intentional duplicate mobile Axe/reflow skips / 0 failures**. Desktop/mobile coverage includes unsupported-file and undecodable-video failures, precision transport, overlay/tracking/event/playlist/sync workflows, 44px controls, overflow, and Axe. Rows 43–48 are verified; numerator is **42/60**.
- **Reverse-safe:** complete.

### T10-01 — Professional export and metadata
- **Status:** DONE
- **Depends on:** T09-01
- **Primary files:** tactical export modules + UI/tests
- **Implementation:** runtime source `48489a4b0a32ac8aed3455314af817dc790ac07b` adds a local metadata editor and still, social, standalone HTML, vector PDF/contact-sheet, analytics CSV/JSON, and project JSON/ZIP downloads. Video buttons appear only after Mediabunny `1.55.4` `canEncodeVideo` confirms the container, codec, size, and bitrate; frame-sequence ZIP remains the fallback.
- **Exit evidence:** focused Tactical units **125/125** plus e2e selector **3/3**, `tsc --noEmit -p tsconfig.app.json` exit 0, production build, and the full Tactical Playwright spec **58 passed / 2 intentional duplicate mobile Axe/reflow skips / 0 failures**. Artifact checks cover analytics honesty, HTML script isolation, social SVG, PDF ZIP literals, frame-sequence ZIP, raster magic bytes, and the first confirmed video container. Rows **50, 57, 58, 59** are verified; numerator is **46/60**. Rows 43–48 and 60 were not reopened.
- **Reverse-safe:** complete.

### T11-01 — Responsive/accessibility/QoL hardening
- **Status:** DONE
- **Depends on:** T10-01 DONE
- **Primary files:** tactical UI/CSS/help/shortcuts + e2e
- **Implementation:** runtime source `b538a655b7efdd35de83cd20478976f46494a1b8` adds a help dialog, collision-safe tooltips, conflict-safe shortcuts, Players/Timeline sheets, reduced-motion transport, and scene-layer grouping/reorder/solo/focus/lock. The workspace header instructional sentence was not rewritten.
- **Exit evidence:** focused Tactical units **130/130** plus e2e selector **3/3**, `tsc --noEmit -p tsconfig.app.json` exit 0, production build, and the full Tactical Playwright spec **68 passed / 2 intentional duplicate mobile Axe/reflow skips / 0 failures**. Viewport matrix, desktop Axe with help open, and desktop/mobile keyboard/touch equivalents are green. Rows **51, 52, 53, 54, 55** are verified; numerator is **51/60**. Rows 43–48, 50, and 56–60 were not reopened. Help reference copy changed.
- **Reverse-safe:** complete.

### T12-01 — Performance and adversarial audit
- **Status:** DONE
- **Depends on:** T11-01 DONE
- **Primary files:** tactical session bounds, timeline/analysis/conflict sampling, project import/export, video and standalone playback, persistence snapshots, `tests/unit/tactics-performance-audit.test.ts`
- **Implementation:** runtime source `6dad76880d4da428fdae9a1d93b74d4c4e5c53f6`. Dense trajectory sampling uses one forward pass and a track-identity cache. Generated samples, timeline duration/tracks/keyframes/markers, ZIP entry counts and declared uncompressed sizes, CSV formula text, hidden-document playback, and named snapshots are bounded. History, 3D disposal, and timeline hidden-tab pause were already bounded and were locked rather than rewritten. Timeline virtualization was not added.
- **Exit evidence:** focused Tactical units **144/144** plus e2e selector **3/3**, `tsc --noEmit -p tsconfig.app.json` exit 0, production build (`✓ built in 5.78s`), and the full Tactical Playwright spec **68 passed / 2 intentional duplicate mobile Axe/reflow skips / 0 failures**. Verified numerator stays **51/60**. Newly verified rows: none. Rows 43–48, 50, and 56–60 were not reopened. Help copy was not changed. Finding dispositions are in `HANDOFF.md`.
- **Reverse-safe:** complete.

### T13-01 — Branch-complete gate
- **Status:** DONE — gate executed; branch-complete is not satisfied
- **Depends on:** T12-01 DONE
- **Primary files:** tactical tests/docs; tactical defects only
- **Action:** focused units, production build, desktop/mobile Playwright, Axe, persistence/import/export/media/responsive matrices; reconcile all 60 rows.
- **Exit evidence:** tested tip `d0e23d4763ac2c138845862f64f09299cdb66e19`. Focused Tactical units **144/144** plus e2e selector **3/3**. `tsc --noEmit -p tsconfig.app.json` exit 0 and production build (`✓ built in 6.06s`). Full Tactical Playwright spec **68 passed / 2 intentional duplicate mobile Axe/reflow skips / 0 failures** on desktop and mobile Chromium, including Axe, responsive widths, persistence/import/export, and local media. Verified numerator stays **51/60**. Named blockers: in-progress **3, 4, 5, 7, 8**; planned **6, 39, 40, 41**. No tactical defect was produced. Help copy was not changed. Rows 43–48, 50, and 56–60 were not reopened.
- **Reverse-safe:** no.

### T14-01 — Reconcile and integrate
- **Status:** BLOCKED
- **Depends on:** T13-01 branch-complete, which is not satisfied. The T13-01 gate listing blockers does not unblock this item.
- **Primary files:** conflict files only, existing PR #76
- **Action:** fetch then-current `main`, non-destructively reconcile, rerun branch gate, use existing repository-supported PR integration.
- **Exit evidence:** exact integrated `main` SHA and green required gates.
- **Reverse-safe:** never before T13.

### T15-01 — Exact-main deployment and closure
- **Status:** BLOCKED
- **Depends on:** T14-01
- **Primary files:** deployment/task ledgers only as required
- **Action:** exact-main validation, Pages artifact/deployment/live route verification where feasible, task reconciliation.
- **Exit evidence:** exact deployed revision and closure records.
- **Reverse-safe:** never before T14.

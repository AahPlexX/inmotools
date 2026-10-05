# Tactical Matchboard Studio Handoff

> **Historical record (banner added 2026-10-05).** Written before the current workflow. Branches, pull requests, PR numbers and registration steps mentioned here (`src/catalog.ts` entries, `workspaces.tsx` loaders, `ToolSlug`, `.tasks/IN_PROGRESS.md`, `.tasks/config.json` IDs) are no longer used: tools register through `src/tools/<folder>/<slug>.meta.ts`, work starts with `pnpm task:start`, and pushes merge without pull requests ([AGENTS.md](../../../AGENTS.md)). Feature facts and evidence below stay valid as a record; current status is in the tool's tracker or task file.

## Workstream identity

- Branch: `cursor/matchboard-residuals-wave-8ddf`
- Base: `origin/main` `dd12e943576c9e0fb2abbc9772edec7e9cfafd39` (`feat(tactics): production audit for Tactical Matchboard Studio (#92)`)
Former instruction (no longer applies): - Do not push to PR #76 or PR #92. Do not reopen those PRs.
- Do not undraft or merge the new draft PR from this workstream.
- Milestone: **T17-01 residuals wave is DONE.**
- Verified functional features: **67/67**. Rows 1–63 stayed verified. Rows 64–67 are the residuals additions. Rows 3, 57, 58, 61, and 62 were updated in place.
- Registration: Tactical Matchboard Studio is registered in the catalog and lazy workspace loader. The catalog entry now names both teams and the real export set. The unit registration check still requires SVG in `outputs`.
- Dependencies: exact pins were not changed. `mediabunny` remains `1.58.0`. `jszip` remains `3.10.2`.

Historical SHAs below describe the pre-squash branch. They are not the branch to resume.

- Original branch base: `4dcc856bc97027862342513cdea7eb769c0ffbc1`
- Reconciled `origin/main` before the squash: `637a56960954eea2a6b8045a14c703c9a662b254`
- Reconcile merge: `47be37f3f0f74b0ed592f2b0723bf3882e3eb7f6`
- Last pre-squash browser-validated runtime: `fae25d868ec1fb56d3594872a53fa77ca73f8da7`
- Stage 1 authoring runtime: `0a8e45e38e3de161f8ec8a1362218a0896e9ad26`
- Test-only metre assertion: `4d4b0b2b74d5e2a3856af376160bbdee9209cb84`
- Earlier runtime before the T13 documentation gate: `6dad76880d4da428fdae9a1d93b74d4c4e5c53f6`

## Exact next sequential action

**Stop.** T17-01 is done. Do not start another feature row, do not reopen rows 1–67, and do not undraft or merge. Resume only for the PDF Unicode residual if CoS approves a font-embedder pin.

Help copy changed: YES. The workspace header sentence, help section `match-setup`, command-bar tooltips, the Build board tip, and the squad-growth note were rewritten. The catalog entry was not changed in this wave. Stage 2 instructional writing applies because help copy changed.

## 2026-10-01 fix on `main`: deterministic project ZIP (row 60)

- Found: `main` CI failed once in `tests/unit/tactics-persistence.test.ts` ("round-trips deterministic ZIP bundles…"); two exports of the same project differed in one header byte.
- Cause: `zip.file(path, …, { createFolders: true })` made JSZip create the `assets/` folder entry with the current time, so exports made in different seconds differed.
- Fix: `src/tools/tactics/project-io.ts` writes `assets/` itself with the fixed ZIP date. The test now sets the clock to two different times between the exports, so it fails without the fix.
- Evidence: Tactical units 165/165; full `pnpm test:unit` 344 files / 3,702 tests passed; `tsc` clean; build passed; Tactical e2e "round-trips a project ZIP…" passed on desktop and mobile.

## T17-01 residuals wave

T17-01 is **DONE** except the PDF encoding half of residual 7. The wave started from main `dd12e943576c9e0fb2abbc9772edec7e9cfafd39`.

1. **Timeline virtualization and track cap — closed.** The timeline renders at most 40 track rows, with Previous tracks and Next tracks. The session cap is 2,048 tracks, raised from 256. A project at 2,048 tracks validates. 2,049 tracks are rejected on import, and `addTimelineTrack` refuses a 2,049th track.
2. **Squad size — closed.** Growth is not limited to formation size. Row 3 still grows a 7-player board to 24 and can grow to 64 roster players on one team. A 65th player is refused. 64 is the Pages-safe roster ceiling, not a format cap. Existing projects above the ceiling are not rejected; only new growth is.
3. **Pitch zoom and pan — closed.** Zoom runs from 1 to 4 in steps of 0.25 and keeps the viewport center. Pan buttons and drag-to-pan move the view after zooming in. Reset returns to zoom 1 with no pan. Clicks map back through the viewport.
4. **Separate opposition formation — closed.** The workspace passes a separately chosen formation. A 4v4 board can place a 7v7 opposition. Omitting the formation still mirrors the current squad, which keeps the older engine tests valid.
5. **Persist training markings — closed.** Starter projects, Build board, rules application, and import of a bare overlay list store penalty areas, goal areas, penalty marks, goals, a centre circle, and corner arcs in `pitch.overlays`. IFAB and futsal overlay lists are left unchanged. SVG and PDF draw the stored list.
6. **Build board confirm — closed.** Build board opens a confirm dialog before it replaces the board and clears undo. Cancelling leaves the current board and undo history in place.
7. **Video frame cap — closed. PDF encoding — residual, CoS escalate.** `MAX_VIDEO_EXPORT_FRAMES` is 60, raised from 12. `sampleExportTimes` still refuses a requested cap above 240. The contact-sheet PDF sample cap stays 12. PDF page text remains WinAnsi. pdf-lib `1.17.1` standard fonts cannot draw beyond WinAnsi, and embedding a Unicode font needs `@pdf-lib/fontkit` (or an equivalent), which is not pinned. That pin was not added. No dependency pin or CI file changed.
8. **Board freehand — closed.** Freehand reuses the video telestration point rule: 2 to 2,000 normalized points (`MAX_TELESTRATION_POINTS`). Dragging on the pitch commits a stroke. Add freehand point and Save freehand are the non-drag path. The stroke is an annotation with kind `freehand`.

Evidence: focused Tactical units **165/165** across 21 `tactics-*.test.ts` files and the e2e selector check **3/3**. `tsc --noEmit -p tsconfig.app.json` exits 0. Production build succeeds (`✓ built in 6.38s`). Full Tactical Playwright spec **80 passed / 2 intentional duplicate mobile Axe/reflow skips / 0 failures** on desktop Chromium and mobile Chromium. Rows 1–63 were not reopened. Newly verified rows: **64, 65, 66, 67**.

## Residual backlog, in priority order

1. PDF page text remains WinAnsi. CoS escalate before adding `@pdf-lib/fontkit` or any other font embedder. Do not change pins or CI from this workstream. Non-ASCII notes become `?` on the page while the sidecar keeps the original text.

## T16-01 production audit

T16-01 is **DONE**. The audit started from main at the PR #76 squash. Findings that were fixed:

- The default board was a rectangle, a halfway line, and a centre spot. Fitted training markings now draw penalty areas, goal areas, penalty marks, goals, a centre circle, and corner arcs. A 105 m by 68 m pitch keeps 16.5 m boxes and a 9.15 m centre circle. Smaller pitches scale the boxes so they stay on the pitch. IFAB and futsal overlay lists are not rewritten. Markings are derived when the SVG or PDF is drawn and are labeled as training geometry, not a governing-body ruling.
- The board could place only one team. Place opposition fits the visible active squad into one half and a mirrored squad into the other, keeps the kits distinct, refits without duplicating players, and moves authored keyframes and phase positions with the squad. A locked layer is refused.
- Selection was not drawn on the pitch. The selected player, ball, or drawing now has a ring. Clicking the ball, then the pitch, moves the ball. Clicking a drawing and choosing Remove drawing, Delete, or Backspace removes that drawing and leaves the players. Backspace in a text field is unchanged.
- The header and catalog described the tool as an SVG exporter. They now name both teams and the local export set.

Evidence: focused Tactical units **162/162** across 21 `tactics-*.test.ts` files and the e2e selector check **3/3**. `tsc --noEmit -p tsconfig.app.json` exits 0. Production build succeeds (`✓ built in 6.46s`). Full Tactical Playwright spec **72 passed / 2 intentional duplicate mobile Axe/reflow skips / 0 failures** on desktop Chromium and mobile Chromium. The new browser scenario places an opposition, moves the ball, and removes a drawing. Rows 1–60 were not reopened. Newly verified rows: **61, 62, 63**.

T16 left eight residuals, recorded on the T16 queue item: timeline virtualization and the 256-track cap, uncapped squad size, no pitch zoom or pan, mirrored opposition, render-time training markings, Build board without a confirm, a 12-frame video cap, and WinAnsi PDF page text. T17 closed seven of them and the video-cap half of the last one. Scenario comparison still memoizes an unchanged project diff. No dependency was added or upgraded.

## T14-01 closure evidence

T14-01 is **DONE**. Then-current `origin/main` `637a56960954eea2a6b8045a14c703c9a662b254` was merged as `47be37f3f0f74b0ed592f2b0723bf3882e3eb7f6`. The only content conflict was `.tasks/IN_PROGRESS.md`. The Matchboard entry stayed. Main's GeoJSON, Markdown, Audio Mastering, and Site Intelligence entries stayed. The stale Wave A in-progress line yielded to main's Wave A DONE record. Catalog registration, the lazy workspace loader, and the tactics e2e selector route stayed. `package.json` auto-merged without a pin conflict: `jszip` stayed `3.10.2`, and `mediabunny` took main's exact `1.58.0`. Frozen `pnpm install --frozen-lockfile` succeeded. `canEncodeVideo` in `1.58.0` still accepts `width`, `height`, and `bitrate`, so runtime `fae25d868ec1fb56d3594872a53fa77ca73f8da7` sets `MEDIABUNNY_PIN` to `1.58.0`. That is the only tactics runtime change after stage 1. Focused Tactical units pass **155/155** across 20 `tactics-*.test.ts` files and the e2e selector check passes **3/3**. `tsc --noEmit -p tsconfig.app.json` exits 0 and the production build succeeds (`✓ built in 6.75s`). The full Tactical Playwright spec passes **70 / 2 intentional duplicate mobile Axe/reflow skips / 0 failures** on desktop Chromium and mobile Chromium. The verified numerator stays **60/60**. Help copy was not changed. Rows 1–56 and 58–60 were not reopened. Row 57 stays verified; its pin sentence now names the installed `1.58.0`. PR #76 stays the only vehicle and stays draft.

## Stage 1 closure evidence

Stage 1 is **DONE** at runtime source `0a8e45e38e3de161f8ec8a1362218a0896e9ad26`. The metre-coordinate browser assertion is test-only commit `4d4b0b2b74d5e2a3856af376160bbdee9209cb84`. Focused Tactical units pass **155/155** across 20 `tactics-*.test.ts` files and the e2e selector check passes **3/3**. TypeScript and the production build pass (`✓ built in 4.43s`). The full Tactical Playwright spec passes **70 / 2 intentional duplicate mobile Axe/reflow skips / 0 failures** on desktop Chromium and mobile Chromium. The new browser scenario scales a squad, sets a neutral token, writes the ball in pitch metres, places and transforms a cone, authors an elevation trajectory, adds a board spotlight, records onion-skin ghosts, compares two scenarios, and snaps a move after snapping is enabled. Newly verified rows: **3, 4, 5, 6, 7, 8, 39, 40, 41**. The verified numerator is **60/60**. Help copy was not changed. Rows 1, 2, 9–38, and 42–60 were not reopened.

## T13-01 gate evidence

T13-01 is **DONE as a gate** at tested tip `d0e23d4763ac2c138845862f64f09299cdb66e19`. Runtime source is unchanged at `6dad76880d4da428fdae9a1d93b74d4c4e5c53f6`. Focused Tactical units pass **144/144** across 19 `tactics-*.test.ts` files and the e2e selector check passes **3/3**. TypeScript and the production build pass (`✓ built in 6.06s`). The full Tactical Playwright spec passes **68 / 2 intentional duplicate mobile Axe/reflow skips / 0 failures** on desktop Chromium and mobile Chromium. Desktop Axe, the responsive width matrix, ZIP/JSON/CSV persistence and interchange, local video review, and capability-checked export are inside that spec and passed. No tactical defect was produced. The verified numerator stays **51/60**. Branch-complete is not claimed.

## Task 12 closure evidence

Task 12 is **DONE** at runtime source `6dad76880d4da428fdae9a1d93b74d4c4e5c53f6`. Focused Tactical units pass **144/144** across 19 `tactics-*.test.ts` files and the e2e selector check passes **3/3**. TypeScript and the production build pass (`✓ built in 5.78s`). The full Tactical Playwright spec passes **68 / 2 intentional duplicate mobile Axe/reflow skips / 0 failures**. The verified numerator stays **51/60**.

Measured findings:

- **Dense trajectory sampling — fixed.** A 12,000-keyframe span sampled every 10 ms took 7869.5 ms before the change. `sampleTrackAtTimes` now walks each track once, and `sampleAuthoredTrajectory` caches by track identity. The same span stays under 750 ms and keeps the first position and last time.
- **Unbounded analysis and conflict loops — fixed.** Sampling that would exceed 120,000 times throws before the loop. Analysis shows `trajectoryWarning` and keeps the selected token. Conflict review shows `role="alert"` and keeps the last successful review.
- **Hostile project import — fixed.** Duration above 6 hours, more than 256 tracks, more than 100,000 keyframes on one track, more than 8,000 markers, and trajectory times past 6 hours are rejected. The opened project identity is unchanged.
- **Hostile ZIP — fixed.** An end-of-directory count above 256 is rejected. Extra central-directory headers are counted even when that record understates them. Declared uncompressed sizes are checked before `JSZip.loadAsync`, including a lied 30,000,000-byte `project.json`.
- **CSV formula text — fixed.** `entity_id`, `team_id`, and `event` values that start with `=`, `+`, `-`, `@`, tab, or carriage return are prefixed on export and restored on import. The event `=press` round-trips.
- **Hidden playback — fixed.** Local video review pauses both elements when the document is hidden and does not auto-resume. Standalone HTML playback calls `stop()` when `document.hidden` is true.
- **Named snapshots — fixed.** The 41st named snapshot throws. The existing 40 snapshots and the saved project title stay in place. Autosave pruning is unchanged.
- **History bound — already satisfied.** `HISTORY_LIMIT` remains 100. One hundred ten commits keep the past stack at or below 100, and one hundred undos keep the future stack at or below 100. No history implementation change.
- **3D disposal and hidden-tab pause — already satisfied.** Existing presentation runtime tests cover disposal and hidden-tab scheduling. Not reimplemented.
- **Timeline playback pause — already satisfied.** Playback already stops while `document.hidden` and does not schedule frames while stopped. Collapsing the timeline details element does not pause board playback.
- **Realistic 11v11 session — already inside budget.** Twenty-two players, 30 equipment items, and 22 tracks of 10 keyframes over 90 seconds validate cleanly. Thirty playback samples stay under 1 second, SVG serialization stays under 500 ms, and 30 analysis derives stay under 1 second. No further optimization was applied.
- **Timeline virtualization — tracked residual, not required.** Two hundred fifty-six tracks validate, and each track is one text row. Virtualization was not added.
- **Squad size — tracked residual, intentionally uncapped.** Row 3 still requires arbitrary roster growth, so player and roster counts were not capped.
- **Scene-diff memoization — tracked residual.** The spec names efficient scene diffs. The measured 11v11 session did not miss its budgets, so no scene-diff cache was added.
- **Gauntlet.** The audited paths match the approved performance and import-security contract. No competitor trade dress was copied. Remaining spec gaps are the unfinished rows below, not untracked audit defects.

In progress remains **3, 4, 5, 7, 8**. Planned remains **6, 39, 40, 41**.

## Task 11 closure evidence

Task 11 is **DONE** at runtime source `b538a655b7efdd35de83cd20478976f46494a1b8`. Focused Tactical units pass **130/130** and the e2e selector check passes **3/3**. TypeScript and the production build pass. The full Tactical Playwright spec passes **68 / 2 intentional duplicate mobile Axe/reflow skips / 0 failures**. Desktop Axe on the workspace, with the layer panel and help dialog open, reports no serious or critical violations for WCAG 2 A/AA, 2.1 A/AA, and 2.2 AA. The viewport matrix is phone portrait 320×740, phone landscape 844×390, tablet portrait 768×1024, tablet landscape 1080×810, laptop 1024×768, desktop 1440×900, large desktop 1920×1080, 32px enlarged text, and 1.5 page zoom; document and workspace overflow stay ≤1px and essential targets stay ≥44px. Desktop and mobile coverage includes shortcut chords that leave text fields alone, right-click and Player actions equivalents, narrow Players/Timeline sheets with focus return, and reduced-motion keyframe stepping. Rows **51, 52, 53, 54, 55** are verified. Grouping is scene-layer membership, not a separate group schema. A long-press timer was not added.

## Task 10 closure evidence

Task 10 is **DONE** at runtime source `48489a4b0a32ac8aed3455314af817dc790ac07b`. Focused Tactical units pass **125/125** and the e2e selector check passes **3/3**. TypeScript and the production build pass. The full Tactical Playwright spec passes **58 / 2 intentional duplicate mobile Axe/reflow skips / 0 failures**. Desktop and mobile coverage saves export metadata and restores the prior title with undo, downloads source-honest analytics JSON, standalone HTML, a landscape social SVG, a PDF package ZIP, and a frame-sequence ZIP, and downloads PNG plus the first encoder-confirmed video when this Chromium probe succeeds. A production-build probe listed `mp4-avc-1280x720-30`, `mp4-avc-1920x1080-30`, `webm-vp9-1280x720-30`, and `webm-vp8-1280x720-30`, plus PNG, JPEG, and WebP. Rows **50, 57, 58, 59** are verified. The workspace header instructional sentence was not rewritten.

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

Verified: **1–67**.

In progress: none.

Planned: none.

Stage 1 verified rows **3, 4, 5, 6, 7, 8, 39, 40, and 41**. T16-01 added **61, 62, and 63**. T17-01 added **64, 65, 66, and 67** and updated rows **3, 57, 58, 61, and 62** in place. The deterministic denominator is 67. Rows 1–63 were not reopened.

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

- Stay on `cursor/matchboard-residuals-wave-8ddf`.
- Do not push to PR #76 or PR #92. Do not reopen those PRs.
- Do not undraft or merge the draft PR for this residuals wave.
- Before every mutation, compare the last known branch tip with the live remote ref. If another agent advanced it, refresh and reconcile before writing.
- An ACTIVE queue item's Primary files are reserved.
- Forward agent takes the lowest-numbered READY item. None are READY after T17-01.
- Never force-push, destructively rebase, delete the branch, or merge partial work.
- T14 history is recorded below. T15 is superseded because PR #76 was squash-merged to main as `b51a516`. T16-01 is DONE on main as `dd12e94` (PR #92). T17-01 is DONE on this branch.

## Known non-Tactical repository context

A prior consolidated repository unit run had one unrelated Markdown Chicago author-date timeout. Do not chase unrelated failures from this workstream unless current Tactical changes demonstrably cause them.

## Documentation contract

Whenever material Tactical state changes, update together:
- `src/tools/tactics/FEATURE_MATRIX.md`
- `src/tools/tactics/TODO_SEQUENCE.md`
- `src/tools/tactics/HANDOFF.md`
- `.tasks/IN_PROGRESS.md`
Former instruction (no longer applies): - the draft PR for `cursor/matchboard-residuals-wave-8ddf` when its milestone, count, or evidence becomes stale. Do not edit PR #76 or PR #92.

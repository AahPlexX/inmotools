# Next

## TASK-014: Work through the verified catalog-wide audit backlog
**Priority:** P1 | **Tags:** audit, correctness, accessibility, performance

A forensic audit covering all twenty-six suites produced roughly 130 findings. Each was checked against the code before being accepted, because a finding that does not reproduce is worse than no finding: acting on one means changing working code for no reason.

The two crash-class defects and the cross-cutting file-input defect are fixed under TASK-015. What remains is grouped below by the nature of the work rather than by tool, since the same fix usually applies in several places at once.

**2026-09-11 reconciliation:** the Convolution Room Profiler findings previously listed here are already resolved on `main`. The live graph now retains and updates its control nodes, playback cleanup disconnects the graph, unsupported impulse-response channel counts are rejected before assignment, render generations invalidate stale offline output, and active pre-delay changes reschedule tail cleanup. Those fixes are covered by current audio unit/browser tests and were integrated through `dfadd170de204e73aee8e3a329a85c7d764f670b`, `6b9feff695b1b997f866307027174dbbf8d156ec`, and `6d38cd60eeca7ac6ddf9a7eccf5bf1a551cadb7a`; stale audio bullets were removed instead of reimplemented. The Hardware Packet Inspector disconnect lifecycle is already recorded complete under TASK-018.

**2026-09-17 reconciliation:** most of `tests/e2e/audit-hardening.spec.ts`'s regression coverage for Regex Log Structurer and MIDI Harmony Lab was already fully implemented in source (the worker-with-deadline pattern, PagedTable clamping, per-mode flag disabling, the root-note validator) — the tests were failing on pure status-text wording that never matched what the tests asserted ("matched record(s)" vs "matched line(s)", a flag-note missing the phrase "no newline for them to act on", and a generic voicing error where the test wanted a root-note-specific one). Fixed directly; see `fix(logs)`/`fix(music)` commits on `fix/audit-hardening-wording`.
Two of this file's remaining findings are **not** simple wording fixes — they contradict an already-passing test for the same tool and need a human product decision, not a unilateral rename:
- **GeoJSON Simplifier's "coordinate positions loaded" wording** (line 346) collides with `tests/e2e/geo.spec.ts`'s two assertions for the exact substring "N positions loaded" (no "coordinate" between the count and the word). One phrasing must change, and only a human can say which test's wording is the intended one.
- **Hardware Packet Inspector's "Pause capture"/"Resume capture" button names** (lines 313-315) collide with `tests/e2e/hardware.spec.ts`'s "Pause display"/"Resume live display" naming, which encodes a real, explained distinction — the button freezes the visible log while capture keeps running underneath (see its own help text, "Pause display freezes the visible log only. Capture continues…"). `audit-hardening.spec.ts`'s naming implies capture itself stops, which isn't how the tool works. Resolving this needs someone to decide whether the audit test's premise is wrong, or whether the tool should grow an actual separate "stop capturing" control.

Three more of the shared 37 catalog-wide failures turned out to be the same class of locator-only mismatch against already-correct code, fixed on the same branch without touching source: `otel.spec.ts`'s service-name check was matching a hidden `<option>` ahead of the visible table cell it meant to test; `photo.spec.ts`'s radial-mask label check needed `{ exact: true }` against four legitimate sibling labels that all contain it as a substring; `contrast.spec.ts` had two locators each matching a second real, correct element (the same token pairing shown in both matrix directions; a static help sentence that happens to contain the same words as the live validation error).

**2026-09-17 reconciliation:** all three remaining Dedupe findings are fixed on `feat/dedupe-audit-features`. Export now sets a "Preparing reconciled export…" status and yields a tick before building the reconciled rows, so a large export shows feedback instead of looking hung. A CSV text-encoding selector (UTF-8 / Windows-1252) replaces the always-UTF-8 `File.text()` read, decoding the file as bytes through `TextDecoder` instead. Every cluster's review table now has a per-column visibility checkbox mirroring the existing "use for matching" pattern, defaulting to the first 8 columns visible. A fourth, previously uncatalogued issue was fixed alongside these: the cluster heading showed a bare percentage with no indication of what it measured, even though `findDuplicateClusters` already computes the weakest pairwise link across a transitively-formed cluster (see its own code comment) - the label now says "weakest pair" instead of just a number. All four verified with `tests/e2e/dedupe.spec.ts`, 12/12 passing across desktop and mobile Chromium.

**2026-09-17 reconciliation (second pass):** every item that was in the "Verified and confirmed by the TASK-019 sweep, not yet fixed" section is already resolved on `main` and has been removed rather than reimplemented. Checked against current source and each tool's own passing unit/e2e suites (`duckdb.test.ts`+`duckdb.spec.ts`, `har.test.ts`+`har.spec.ts`, `shader.test.ts`+`shader.spec.ts`, `contrast.spec.ts`):
- DuckDB queries already cancel: `DuckDbWorkspace.tsx` calls `startLocalQuery` (not the bare `runLocalQuery` the finding described) and wires its handle to a "Cancel query" button that calls `connection.cancelSent()`.
- The DuckDB result table already uses `PagedTable`.
- The APCA matrix's heatmap view already renders plain `<td>` cells (not one interactive element per pairing) and is capped at 30 tokens, falling back to the paged table above that with an explicit notice.
- The contrast heatmap already has proper `scope="col"`/`scope="row"` axis headers.
- The HAR waterfall canvas already sizes its own height to `headerHeight + rows.length * rowHeight`, and its wrapper is `overflow: auto` with `maxHeight: 440` - every row is drawn and reachable by scrolling, none are clipped outside the bitmap.
- HAR already has method/domain/status filter fields wired into `filteredRows`.
- The shader workspace already has a pause/resume toggle, a "Reset time" control, an active compiler-diagnostics panel parsed from `gl.getShaderInfoLog`, and a working line-jump (clicking a diagnostic's line sets `focusLine` and switches to the editor view).

The three-item TASK-016 carryover below was re-checked at the same time; two remain genuinely outstanding, and the third ("column kind in the header's accessible name") is fixed alongside this reconciliation - `PagedTableColumn` gained an `ariaLabel` override (`aria-label` on an element replaces its computed accessible name entirely, independent of visual content) and Regex Log Structurer's kind-annotated headers now use it, verified by a new regression test in `tests/e2e/audit-hardening.spec.ts`.

### Carried over from the TASK-016 review

An independent design review of the log-structurer work raised twenty points; the defects were fixed there. These were judged real but out of that change's scope:

- **One worker per run.** `log-runner.ts` constructs a worker, clones the whole input in, and clones the whole row set back, on every debounced keystroke. A single long-lived worker, replaced only when a deadline is missed, removes the construction and module-load cost; `cancel()` then means "ignore the response" for the common supersede case. Worth doing before the same runner is reused for GeoJSON and dedupe.
- **Coarse pager navigation.** `PagedTable` has no page-size select, first/last buttons, or page input, so a million-row result is five thousand single steps from its end. DuckDB Workbench has since adopted the component (2026-09-17) and is exactly the case this matters for, since its result sets are largest.

**2026-09-24 Markdown reconciliation:** the remaining Markdown main-thread finding is resolved. Live table-formula preparation now runs through a reusable local Web Worker; an in-flight stale request is terminated before newer source is evaluated, completed sequential runs reuse the idle worker, and runtimes without Worker support retain the prior synchronous fallback. Explicit export actions still prepare one exact snapshot synchronously by design; the removed finding was specifically the per-keystroke preview computation that could stall editing.

### Verified and outstanding

- **Unbounded DOM output.** The shared `PagedTable` primitive now exists and is adopted by Regex Log Structurer (TASK-016). DuckDB Workbench and the APCA token matrix's table view have since adopted it too (checked 2026-09-17 - `DuckDbWorkspace.tsx` and `ContrastWorkspace.tsx` both render their large result sets through `<PagedTable>`; the APCA heatmap view is a separate, intentionally bounded 30-token grid of plain cells, not the finding's "interactive button per pairing" concern). Nine workspaces still render an uncapped table and should adopt it, verified by searching for `result-table-wrap` outside the primitive: Cron Team Matrix, Fuzzy Deduplicator, EXIF Scrubber, HAR Sanitizer, JSON Lattice, Energy & Macro Planner, Trace Flamegraph, GLSL Sandbox, and SVG Sprite Compiler. Priority follows result size: the deduplicator's cluster-member tables can be the largest remaining. Several of these render a fixed handful of rows where paging would add controls without removing a risk, so each should be judged rather than converted mechanically.
- **Free-text input still unguarded elsewhere.** The Energy Planner accepts negative ages and zero stature and reports a negative basal rate. PDF Sanitizer validates page ranges only when processing begins rather than as the field is edited.
- **Mobile split panes.** RegexMatrix Studio, PlanCraft Studio and JSON Lattice place two working surfaces side by side and compress both below 768px. Markdown Workbench already stacks at 860px and is covered by a viewport test; the others need the same treatment or a tabbed switch.
- **Touch gestures.** JSON Lattice and PlanCraft canvases do not set `touch-action: none`, so dragging scrolls the page instead of the canvas. AetherCast's forecast scrubber listens for mouse events only, so it cannot be scrubbed on a touchscreen at all.
- **Per-tool quality of life.** Roughly seventy smaller items: clipboard buttons, byte-delta readouts, thumbnail previews, filename preservation on export, configurable projection horizons, schema chips, and similar. Individually minor, collectively the difference between a demo and a tool.

### Plan

- Build the shared primitives first (virtualised table, worker-backed execution wrapper, mobile split-pane switch), then adopt them per tool, so the same defect is not fixed four different ways.
- Verify each remaining finding against the code before acting on it, and record any that do not reproduce.
- Add a regression test with every fix; prove it fails against the unfixed code before accepting it.

**2026-09-25 reconciliation (branch `claude/photo-tool-completion-ama1g1`, PR #78).** Each finding in "Verified and outstanding" was re-checked against current source and in the browser before any change:
- *Free-text input* no longer reproduces. Energy & Macro Planner rejects negative ages and zero or tiny stature with inline field errors and withholds the plan (`validateEnergyPlanInput`; covered by `nutrition.spec.ts` "blocks ages outside…"). PDF Sanitizer validates page lists as they are typed (`aria-invalid` plus an inline message, output count shows "—"); regression test added to `pdf.spec.ts`.
- *Mobile split panes* no longer reproduces. RegexMatrix Studio, PlanCraft Studio, and JSON Lattice each stack to a single column at 390 px and 700 px with no document overflow (inspected with screenshots; existing reflow tests in `regex-matrix.spec.ts`, `floorplan.spec.ts`, `lattice.spec.ts`).
- *Touch gestures* no longer reproduces as written: `.plancraft-overlay` and `.lattice-viewport` set `touch-action: none` in `src/styles.css`, and AetherCast's scrubber uses pointer events with `touch-action: pan-y` (horizontal drag scrubs, vertical swipe still scrolls). Regression tests added to `aethercast.spec.ts` and `lattice.spec.ts`.
- Found and fixed while verifying: JSON Lattice had no way to zoom without a mouse wheel, so touch and keyboard users could not zoom at all. It now has − / + zoom buttons beside **Fit graph**. The same check exposed a real bug: pressing any button inside the graph area started a pan and captured the pointer, so **Fit graph** never received its click (reproduced on the unfixed build: 119 % stayed 119 %). Pans now ignore presses on controls. Covered by `lattice.spec.ts` "touch users can pan the graph and zoom it…".
- Still outstanding and deliberately not started on this branch: *Unbounded DOM output* (PagedTable adoption in nine tools) and the TASK-016 carryovers (coarse pager, one worker per run). `src/components/PagedTable.tsx`, `src/tools/logs/`, and `src/tools/dedupe/` have diverged on `main` since this branch's base, so that work must start from integrated `main`. *Per-tool quality of life* remains an unenumerated set; it needs its concrete items listed before it can be worked or closed.

**2026-09-25 continuation (after merging `main` into PR #78's branch).** Picked up the three items the reconciliation above deferred, from integrated `main`:
- *Coarse pager navigation* is done. `PagedTable` now has **First** and **Last** buttons and a **Go to page** field (committed on Enter or blur, clamped to the valid range, Escape discards the draft), so every adopting tool gets it. A page-size selector was not added: the fixed per-tool sizes are chosen for each table, and jumping covers the "five thousand steps from the end" problem. Regression test: `audit-hardening.spec.ts` "PagedTable jumps to the first, last, or a typed page…".
- *One worker per run* is done. `log-runner.ts` keeps one worker and reuses it while idle; it is replaced only after a deadline miss, a crash, an unreadable reply, or a cancel while busy (a new request would otherwise queue behind unwanted work). `LogWorkspace` releases it on unmount. Seven new cases in `tests/unit/log-runner.test.ts`, which fail against the previous runner.
- *Unbounded DOM output*, re-judged per tool on integrated `main`: Cron Team Matrix, HAR Sanitizer, and Trace Flamegraph's span table already use `PagedTable`. Fuzzy Deduplicator already pages clusters and cluster members itself; its two remaining tables are one row per input column. JSON Lattice's SQL results were unbounded (any query over the document or `range()`) and now use `PagedTable` (100 rows; regression test in `lattice.spec.ts`). SVG Sprite Compiler's symbol table now uses `PagedTable` (test in `svg.spec.ts`). The rest render a small fixed or input-bounded set and stay as plain tables: EXIF Scrubber (one row per chosen file, and sensitive fields per file), Energy & Macro Planner (three macros, one row per goal tier), GLSL Sandbox (compiler diagnostics for one shader).
- The two wording conflicts recorded under the 2026-09-17 reconciliation are resolved (2026-09-25, PR #78). GeoJSON Simplifier now reports "N coordinate positions loaded" (clearer about what is counted), and `geo.spec.ts` asserts the same text. For Hardware Packet Inspector, the tool's pause-display design (capture continues, help text says so) was kept, and `audit-hardening.spec.ts` now uses its real "Pause display" / "Resume live display" controls. That test also looked for a "Download GeoJSON" button that is actually named "Download generated GeoJSON".
- The other base-branch reds in the full browser suite were fixed at the same time: preload-error recovery now reloads immediately when no service worker controls the page (it waited on a first-visit precache and missed the 5 s window; unit test added), the catalog axe sweep skips script-disabled `sandbox=""` preview iframes and asserts their titles directly (axe stalled ~0.5 s per rule waiting on them), and the Python named-groups test allows for the 4.5-6.2 s Pyodide cold start.
- Flakes that CI's retries were absorbing were root-caused on the same PR. (1) The RegexMatrix PCRE2/Oniguruma watchdog started before the per-run worker had loaded its WebAssembly engine, so a trivial pattern could fail with "Execution stopped by the 500 ms watchdog target" on a busy device. Engine startup now has its own 30 s bound and the 500 ms watchdog times execution only (`tests/unit/regex-worker-client.test.ts`). (2) `html { scroll-behavior: smooth }` animated every scroll-into-view for about 2 s on phone layouts and ignored `prefers-reduced-motion`. Reduced-motion users now get instant scrolling (`app.spec.ts`), and the RegexMatrix saved-session test runs with reduced motion. (3) The first-Python-run assertions allow for the Pyodide cold start.
- Crystal Lattice Studio's intermittent mobile failure ("inspects a symmetry break after perturbing a site", red in `main`'s run 36143090713) was a real lost-tap bug. A site edit commits on blur, so tapping "Inspect symmetry break" right after editing made the stale-structure note appear above the buttons mid-tap. The button moved 48 px between press and release and the click never fired. The status line now reserves two lines, and "Analyzing…"/errors take priority over the stale note so the user sees work in progress. Regression test: "symmetry actions stay in place when a site edit commits…" in `crystal-lattice-studio.spec.ts` (fails on the previous CSS). Locally the spec's download tests report the filename "download" under the container's preinstalled Chromium; they pass in CI.
- SVG Sprite Compiler's preview grid (two decoded images per symbol) now renders in batches of 48 with a "Show N more previews" control; a new compile or search starts a fresh batch, and the symbol table stays complete. Covered in `svg.spec.ts`.

---

## TASK-005: Harden the shared scrollable regions for keyboard users
**Priority:** P2 | **Tags:** accessibility

`.code-output` and `.result-table-wrap` are shared by fourteen suites. Both were made keyboard reachable where axe proved a violation, but the remaining usages only pass today because their empty states do not overflow. The catalog-driven axe sweep audits empty states only, so a populated overflowing region can still regress.

### Plan

- Introduce one focusable, labelled scroll-region primitive and adopt it across the remaining usages.
- Extend accessibility coverage to at least one populated state per scrollable suite.

---

## TASK-006: Broaden per-tool browser coverage
**Priority:** P2 | **Tags:** testing

Seven of the twenty-six registered suites have behavioural browser specs: DuckDB Workbench, EXIF Scrubber, PlanCraft Studio, JSON Lattice Studio, RegexMatrix, Energy & Macro Planner, and Markdown Workbench. Every route receives an axe sweep and the landing page is covered, but the remaining nineteen suites have no interaction test, so regressions in their engines surface only through unit tests.

### Plan

- Add a focused behavioural spec per uncovered suite, exercising its primary local workflow and its export path.
- Keep each spec deterministic and independent of shared browser state.
- Prioritise suites whose engines carry the least unit coverage.

---

## TASK-012: Record the AetherCast design under docs/superpowers
**Priority:** P3 | **Tags:** documentation

Every other shipped suite has a plan and a design document under `docs/superpowers`. AetherCast has neither, so the reasoning behind its index selection, its anomaly-screening thresholds, and its Fitzpatrick exposure model exists only in the implementation.

This is deliberately left as a task rather than written retrospectively: the design rationale belongs to whoever made those modelling choices, and inventing a justification after the fact would produce a document that reads as authoritative while being a guess. Health-adjacent thresholds are the last place that is acceptable.

### Plan

- Have the original author record the intended scope, the standards each index implements, and the source of every threshold constant.
- Confirm the in-app wording still matches what the engine actually computes.

---

## TASK-023: Implement Crystal Lattice Studio Phase 3 — reciprocal space and diffraction
**Priority:** P1 | **Tags:** crystal, feature, science, tdd

Crystal Lattice Studio is governed by the 163-capability master design (`docs/superpowers/specs/2026-09-11-crystal-lattice-studio-design.md`). Phases 1 and 2 are complete and verified (see `IN_PROGRESS.md` → Crystal Lattice Studio). Phase 3 is the next sequential milestone: **reciprocal space and diffraction** (design lines 434–436), covering reciprocal lattice, planes/directions, stereographic projection, Ewald sphere, Wigner–Seitz/Brillouin geometry, reflection enumeration, X-ray/neutron/electron/single-crystal/Laue simulation, observed overlays, and reflection tables.

**Do not rebuild existing, tested foundations.** `cell-engine.ts` already exports `reciprocalMatrix` and `reciprocalMetricTensor` (both covered by `tests/unit/crystal-cell.test.ts`). Build Phase-3 engines on top of them.

### Plan
- Add `reciprocal-engine.ts`: reciprocal-basis helpers, d-spacing from (hkl), plane/direction indexing — TDD against `tests/unit/crystal-reciprocal.test.ts` using the existing cell-engine functions.
- Add `diffraction-engine.ts`: reflection enumeration with systematic-absence filtering, wavelength-parameterised X-ray/neutron/electron simulation — bounded enumeration (reuse the established `MAX_*`-cap pattern), TDD first.
- Wire a read-only diffraction panel into `CrystalWorkspace.tsx` only after both engines are green; keep every engine pure and backend-free per the repo privacy model.
- Add `tests/e2e/crystal-lattice-studio-phase3.spec.ts` and extend the spec-selection map so Crystal source changes also route to it.

### Completion gate — SATISFIED 2026-09-24
The reciprocal/diffraction capability set is implemented and verified: full unit suite 153 files / 1505 tests pass and `tsc --noEmit` is clean on `4f800253`; the phase-3 browser spec (5 tests) is routed through the spec-selection gate. Completion record: `docs/superpowers/plans/2026-09-24-crystal-lattice-studio-phase-3-completion.md`. This entry is retained pending a DONE.md move on the next tracker sweep; do not start new Phase-3 work from this entry — Phase 4 is the next milestone.

---

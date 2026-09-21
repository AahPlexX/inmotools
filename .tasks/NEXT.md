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

### Verified and outstanding

- **Unbounded DOM output.** The shared `PagedTable` primitive now exists and is adopted by Regex Log Structurer (TASK-016). DuckDB Workbench and the APCA token matrix's table view have since adopted it too (checked 2026-09-17 - `DuckDbWorkspace.tsx` and `ContrastWorkspace.tsx` both render their large result sets through `<PagedTable>`; the APCA heatmap view is a separate, intentionally bounded 30-token grid of plain cells, not the finding's "interactive button per pairing" concern). Nine workspaces still render an uncapped table and should adopt it, verified by searching for `result-table-wrap` outside the primitive: Cron Team Matrix, Fuzzy Deduplicator, EXIF Scrubber, HAR Sanitizer, JSON Lattice, Energy & Macro Planner, Trace Flamegraph, GLSL Sandbox, and SVG Sprite Compiler. Priority follows result size: the deduplicator's cluster-member tables can be the largest remaining. Several of these render a fixed handful of rows where paging would add controls without removing a risk, so each should be judged rather than converted mechanically.
- **Main-thread computation.** Regex execution (TASK-016) and GeoJSON simplification (TASK-018) are done, and fuzzy candidate blocking turned out to already run in a worker. The one remaining case is Markdown Workbench's table-formula evaluation, which recomputes synchronously on every keystroke. Two patterns now exist to follow: `src/tools/logs/log-runner.ts` where the input can be pathological and needs a deadline, and `src/tools/geo/geo.worker.ts` where it is merely large and only needs cancellation.
- **Free-text input still unguarded elsewhere.** The Energy Planner accepts negative ages and zero stature and reports a negative basal rate. PDF Sanitizer validates page ranges only when processing begins rather than as the field is edited.
- **Mobile split panes.** RegexMatrix Studio, PlanCraft Studio and JSON Lattice place two working surfaces side by side and compress both below 768px. Markdown Workbench already stacks at 860px and is covered by a viewport test; the others need the same treatment or a tabbed switch.
- **Touch gestures.** JSON Lattice and PlanCraft canvases do not set `touch-action: none`, so dragging scrolls the page instead of the canvas. AetherCast's forecast scrubber listens for mouse events only, so it cannot be scrubbed on a touchscreen at all.
- **Per-tool quality of life.** Roughly seventy smaller items: clipboard buttons, byte-delta readouts, thumbnail previews, filename preservation on export, configurable projection horizons, schema chips, and similar. Individually minor, collectively the difference between a demo and a tool.

### Plan

- Build the shared primitives first (virtualised table, worker-backed execution wrapper, mobile split-pane switch), then adopt them per tool, so the same defect is not fixed four different ways.
- Verify each remaining finding against the code before acting on it, and record any that do not reproduce.
- Add a regression test with every fix; prove it fails against the unfixed code before accepting it.

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

## TASK-013: Reconcile the two undo histories in Markdown Workbench
**Priority:** P3 | **Tags:** editor, ux

The suite deliberately runs two history levels: CodeMirror's own fine-grained text history, reached with Ctrl+Z inside the editor and preserving the caret, and the workspace's document-level snapshots behind the toolbar Undo and Redo. They no longer corrupt each other — externally applied document swaps are excluded from CodeMirror's history, so Ctrl+Z after a toolbar Undo no longer reverses the undo — but two separate stacks remain observable to the user, and the toolbar steps are per-keystroke because a snapshot is committed on every document change.

Left as a task rather than forced now because both obvious unifications regress something real: delegating the toolbar to CodeMirror loses document-level steps such as opening a file, while routing Ctrl+Z to the workspace snapshots replaces the whole document on each undo and so loses the caret.

### Plan

- Coalesce workspace snapshots by edit proximity so a document-level step spans a meaningful edit rather than one keystroke.
- Decide whether the toolbar should surface only coarse document events (open, draft load, revert) and label it accordingly.
- Cover the resulting behaviour in the browser spec.

---

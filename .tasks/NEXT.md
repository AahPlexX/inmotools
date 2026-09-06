# Next

## TASK-014: Work through the verified catalog-wide audit backlog
**Priority:** P1 | **Tags:** audit, correctness, accessibility, performance

A forensic audit covering all twenty-six suites produced roughly 130 findings. Each was checked against the code before being accepted, because a finding that does not reproduce is worse than no finding: acting on one means changing working code for no reason.

The two crash-class defects and the cross-cutting file-input defect are fixed under TASK-015. What remains is grouped below by the nature of the work rather than by tool, since the same fix usually applies in several places at once.

### Verified and confirmed by the TASK-019 sweep, not yet fixed

These reproduce in the code and are worth doing; they were left out of TASK-019 because that change was scoped to output correctness.

- **Audio parameters do not reach a running graph.** `connectRoomGraph` reads its config once and keeps every node in function-local consts, so moving wet mix, pre-delay, low cut or high cut does nothing until playback is restarted - the tool's central controls appear inert. Fix by retaining the nodes and writing to `gain.value` / `frequency.value` / `delayTime.value` from an effect keyed on the config. Deliberately deferred rather than rushed: audio behaviour cannot be verified in a headless browser, so this needs a plan for how it will be proven rather than assumed.
- **Audio node chains leak per playback.** `stopSource` disconnects only the buffer source; the dry/wet/master/analyser chain stays wired to the destination, so each play cycle leaves another chain behind. Silent and collectible, but unbounded.
- **A 6-channel impulse response fails with an unexplained error.** `ConvolverNode` accepts 1, 2 or 4 channels; the channel count is clamped only against the 32-channel ceiling, so a surround IR throws `NotSupportedError` from `convolver.buffer = impulse` and surfaces as a bare failure string. Needs a pre-flight check naming the real constraint.
- **DuckDB queries cannot be cancelled.** `runLocalQuery` is a bare `await connection.query(sql)`; duckdb-wasm's `cancelPendingQuery` is unused, so a long scan can only be escaped by leaving the tool. The worker-with-cancel pattern now exists twice in the repo to follow.
- **The DuckDB result table is unbounded.** It has no `max-height` and no row cap, so a large result forces very long page scrolling. This is the clean `PagedTable` drop-in: the table is a single expression, cells are plain strings, row identity is already positional, and both export paths read the full result rather than the visible page.
- **The APCA matrix mounts one interactive element per pairing.** Thirty tokens is a 900-cell cross product including self-pairs, each an interactive button with two contrast calculations. Paging alone may be the wrong shape here - consider excluding self-pairs and capping token count.
- **The contrast heatmap has no axis labels.** The compact view is a bare grid of colour buttons with no sticky row or column headers, so which tokens intersect is only discoverable through each button's `aria-label`.
- **The HAR waterfall clips beyond its height clamp.** Canvas height is capped at 440px while the draw loop still positions every row by index, so rows past roughly the twelfth are painted outside the bitmap; arrow-key navigation selects rows that can never be seen, and the wrapper has no scroll container.
- **HAR has no filtering.** No way to narrow entries by status, domain or method, which the trace explorer does provide.
- **The shader render loop never idles.** A static shader still redraws at full refresh rate with no pause, no time freeze or reset, and no visibility-based suspension; compiler diagnostics are also inert, and jumping to a line would need an imperative handle on the editor, which it does not currently expose.
- **Dedupe cannot read non-UTF-8 CSV.** `File.text()` is UTF-8 only, so a Windows-1252 export arrives with replacement characters and no encoding control exists.
- **Dedupe export has no progress signal.** It builds the whole reconciled set synchronously on the main thread and only then reports, so there is no way to tell a large export from a hang.
- **Wide dedupe datasets have no column controls.** Every cluster table renders every column; the existing checkboxes control match participation, not visibility.

### Carried over from the TASK-016 review

An independent design review of the log-structurer work raised twenty points; the defects were fixed there. These were judged real but out of that change's scope:

- **One worker per run.** `log-runner.ts` constructs a worker, clones the whole input in, and clones the whole row set back, on every debounced keystroke. A single long-lived worker, replaced only when a deadline is missed, removes the construction and module-load cost; `cancel()` then means "ignore the response" for the common supersede case. Worth doing before the same runner is reused for GeoJSON and dedupe.
- **Coarse pager navigation.** `PagedTable` has no page-size select, first/last buttons, or page input, so a million-row result is five thousand single steps from its end. Needed before the component is adopted by DuckDB Workbench, where result sets are largest.
- **Column kind in the header's accessible name.** The inferred kind sits inside the `<th>`, so screen-reader cell navigation repeats it on every cell. Move it out of the labelling path, for example with `aria-describedby`.

### Verified and outstanding

- **Unbounded DOM output.** The shared `PagedTable` primitive now exists and is adopted by Regex Log Structurer (TASK-016). Eleven workspaces still render an uncapped table and should adopt it, verified by searching for `result-table-wrap` outside the primitive: APCA token matrix, Cron Team Matrix, Fuzzy Deduplicator, DuckDB Workbench, EXIF Scrubber, HAR Sanitizer, JSON Lattice, Energy & Macro Planner, Trace Flamegraph, GLSL Sandbox, and SVG Sprite Compiler. Priority follows result size: DuckDB and the deduplicator can produce the largest tables. Two need more than a drop-in - the APCA matrix mounts an interactive button per pairing rather than plain cells, and several of the others render a fixed handful of rows where paging would add controls without removing a risk, so each should be judged rather than converted mechanically.
- **Main-thread computation.** Regex execution (TASK-016) and GeoJSON simplification (TASK-018) are done, and fuzzy candidate blocking turned out to already run in a worker. The one remaining case is Markdown Workbench's table-formula evaluation, which recomputes synchronously on every keystroke. Two patterns now exist to follow: `src/tools/logs/log-runner.ts` where the input can be pathological and needs a deadline, and `src/tools/geo/geo.worker.ts` where it is merely large and only needs cancellation.
- **Free-text input still unguarded elsewhere.** The Energy Planner accepts negative ages and zero stature and reports a negative basal rate. PDF Sanitizer validates page ranges only when processing begins rather than as the field is edited.
- **Mobile split panes.** RegexMatrix Studio, PlanCraft Studio and JSON Lattice place two working surfaces side by side and compress both below 768px. Markdown Workbench already stacks at 860px and is covered by a viewport test; the others need the same treatment or a tabbed switch.
- **Touch gestures.** JSON Lattice and PlanCraft canvases do not set `touch-action: none`, so dragging scrolls the page instead of the canvas. AetherCast's forecast scrubber listens for mouse events only, so it cannot be scrubbed on a touchscreen at all.
- **Resource lifecycle.** The Hardware Packet Inspector has no disconnect control, so serial stream locks persist until the tab is reloaded. The Convolution Room Profiler can leave orphaned audio nodes connected after rapid play/pause, and its sliders do not take effect until playback restarts.
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

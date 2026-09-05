# Next

## TASK-014: Work through the verified catalog-wide audit backlog
**Priority:** P1 | **Tags:** audit, correctness, accessibility, performance

A forensic audit covering all twenty-six suites produced roughly 130 findings. Each was checked against the code before being accepted, because a finding that does not reproduce is worse than no finding: acting on one means changing working code for no reason.

The two crash-class defects and the cross-cutting file-input defect are fixed under TASK-015. What remains is grouped below by the nature of the work rather than by tool, since the same fix usually applies in several places at once.

### Verified and outstanding

- **Unbounded DOM output.** DuckDB Workbench, Regex Log Structurer, Fuzzy Deduplicator and the APCA matrix mount one element per row or per token, so a large result set freezes the tab. Needs one shared virtualised or paginated table primitive, not four separate fixes.
- **Main-thread computation.** GeoJSON simplification, regex execution against large logs, fuzzy candidate blocking, and Markdown table-formula evaluation all run synchronously on the main thread. Regex execution is the most severe because a catastrophic-backtracking pattern locks the tab with no way out.
- **Missing file input.** Regex Log Structurer accepts pasted text only; a multi-megabyte log has to go through the clipboard.
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

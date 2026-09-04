# Next

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

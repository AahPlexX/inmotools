---
task: T-repository-scroll-regions-20261005-8cab
doc: task
kind: fix
state: next
branch: main (repository-wide)
created: 2026-10-05
updated: 2026-10-05
---

# Harden the shared scrollable regions for keyboard users (TASK-005)

## Request
**Priority:** P2 | **Tags:** accessibility

`.code-output` and `.result-table-wrap` are shared by fourteen suites. Both were made keyboard reachable where axe proved a violation, but the remaining usages only pass today because their empty states do not overflow. The catalog-driven axe sweep audits empty states only, so a populated overflowing region can still regress.

### Plan

- Introduce one focusable, labelled scroll-region primitive and adopt it across the remaining usages.
- Extend accessibility coverage to at least one populated state per scrollable suite.

---

## Resume here
Not started. Repository-wide change (shared components): follow GOVERNANCE.md §4 for repository-wide work.

## Log
- 2026-10-05: moved from the retired `.tasks` lists (`IN_PROGRESS.md`, `NEXT.md`, `BACKLOG.md`); their last text is in git history at the commit before this one.

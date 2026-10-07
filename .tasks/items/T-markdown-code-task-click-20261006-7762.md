---
task: T-markdown-code-task-click-20261006-7762
tool: markdown-workbench
doc: task
kind: fix
state: done
branch: fix/markdown-workbench
created: 2026-10-06
updated: 2026-10-07
---

# Preserve task state when interacting with nested code controls

## Request
Associated MDW-R29 defect: selecting the clipboard fallback in a task-list code block toggled the task and removed the fallback during preview rerender.

## Resume here

Done. Nested code/fallback clicks preserve task state while ordinary task clicks still toggle it. Scoped production checks passed 12/12; source integrated/deployed as f0ae66023ecdc754f5681b39b5502c3d59ca5c0e. Canonical full validation run 37551755268 passed, confirmed 2026-10-07 01:13 UTC. No outstanding work in this task.

## Log
- 2026-10-06 22:20 UTC: with clipboard access rejected, clicking the readonly fallback changed `- [ ] Task` to `- [x] Task` and removed the fallback. The owning code frame now isolates its clicks; ordinary task toggling remains in the preview handler.

- 2026-10-06 22:25 UTC: guarded production checks passed on desktop/touch. Initial test attempt clicked a disabled checkbox instead of its task text; stopped and corrected the test to match the preview's established interaction.

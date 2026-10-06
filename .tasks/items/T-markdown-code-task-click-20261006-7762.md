---
task: T-markdown-code-task-click-20261006-7762
tool: markdown-workbench
doc: task
kind: fix
state: active
branch: fix/markdown-workbench
created: 2026-10-06
updated: 2026-10-06
---

# Preserve task state when interacting with nested code controls

## Request
Associated MDW-R29 defect: selecting the clipboard fallback in a task-list code block toggled the task and removed the fallback during preview rerender.

## Resume here
Live-preview code frames stop click propagation to the task-item click handler. Baseline failed on desktop/touch; production acceptance passed on both, including ordinary task toggling, in the 12/12 guarded R29 checks (1.5m). TypeScript and clean build passed. Full regression and integration/deployment remain pending; the owning ordered task holds the cursor.

## Log
- 2026-10-06 22:20 UTC: with clipboard access rejected, clicking the readonly fallback changed `- [ ] Task` to `- [x] Task` and removed the fallback. The owning code frame now isolates its clicks; ordinary task toggling remains in the preview handler.

- 2026-10-06 22:25 UTC: guarded production checks passed on desktop/touch. Initial test attempt clicked a disabled checkbox instead of its task text; stopped and corrected the test to match the preview's established interaction.

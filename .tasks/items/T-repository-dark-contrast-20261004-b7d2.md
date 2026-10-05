---
task: T-repository-dark-contrast-20261004-b7d2
doc: task
kind: fix
state: next
branch: fix/<slug> per tool
created: 2026-10-04
updated: 2026-10-04
---

# Fix dark-theme contrast in ten tool workspaces, then default to System

## Request
Found 2026-10-04 by `E2E_THEME=dark pnpm exec playwright test tests/e2e/accessibility.spec.ts` (65 passed, 17 failed): `color-contrast` violations inside the workspace, none in the shell, for sightline-velocity, markdown-workbench, transcode-workstation, typing-workstation, tabular-sheet-workstation, svg-sprite-compiler, audio-mastering, digital-logic-workstation, energy-macro-planner, fiber-craft-workstation. Until they are fixed the site default is Light (docs/DECISIONS.md).

## Resume here
Not started. Per tool on `fix/<slug>`: fix the workspace colours for `[data-theme="dark"]`, rerun the dark axe check for that route. When all ten pass, change `DEFAULT_THEME_CHOICE` and the `index.html` pre-paint default to `system` (repository-wide change) and update the DECISIONS row.

## Log
- 2026-10-04: recorded.

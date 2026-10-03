---
task: T-cad-studio-20261003-f53e
tool: cad-studio
doc: task
kind: fix
state: done
branch: fix/cad-studio
created: 2026-10-03
updated: 2026-10-03
---

# Add a CAD Studio browser spec

## Request
Found during the workflow change: no Playwright spec opens `#/tools/cad-studio`; only the catalog-wide specs cover it (docs/DECISIONS.md, Known exceptions).

## Resume here
Done. `tests/e2e/cad-studio.spec.ts` covers what the workspace offers today (primitives, kernel tessellation, suppression, undo/redo). Sketch-to-export browser coverage belongs with the sketch and export UI when it is built (`.tasks/CAD_STUDIO.md`).

## Log
- 2026-10-03: recorded.
- 2026-10-03: claimed `fix/cad-studio`.
- 2026-10-03: spec added in `d1d76439`; local run desktop + mobile 20/20 over five repeats; CAD source changes now select this spec.

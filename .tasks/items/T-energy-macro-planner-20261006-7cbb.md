---
task: T-energy-macro-planner-20261006-7cbb
tool: energy-macro-planner
doc: task
kind: expand
state: done
branch: expand/energy-macro-planner
created: 2026-10-06
updated: 2026-10-06
---

# Standard spec and tracker

## Request
Owner, 2026-10-05: enumerate every function per tool in its spec, including the owner's notes; repo wins where they differ.

## Resume here
Done: standard spec and tracker written. Further work starts from the tracker's Open work.

## Log
- 2026-10-06: claimed `expand/energy-macro-planner`.
- 2026-10-05: spec [2026-10-05-energy-macro-planner-design.md](../../docs/superpowers/specs/2026-10-05-energy-macro-planner-design.md) and tracker [TRACKER.md](../../src/tools/nutrition/TRACKER.md): 47 functions; 25 verified, 9 implemented, 12 partial, 1 missing, 0 prohibited. `pnpm tool:check energy-macro-planner --base origin/main`: 25/47, no errors; `pnpm docs:sync`, `pnpm docs:check` passed; `pnpm exec vitest run tests/unit/cad-progress.test.ts tests/unit/sheets-wave-b.test.ts tests/unit/deployment-config.test.ts` passed.

---
task: T-cad-studio-20261005-2c4b
tool: cad-studio
doc: task
kind: expand
state: done
branch: expand/cad-studio
created: 2026-10-05
updated: 2026-10-05
---

# Standard spec and tracker

## Request
Owner, 2026-10-05: enumerate every function per tool in its spec, including the owner's notes; repo wins where they differ.

## Resume here
Done: standard spec and tracker written. Further work starts from the tracker's Open work.

## Log
- 2026-10-05: moved from the retired `.tasks` lists (`IN_PROGRESS.md`, `NEXT.md`, `BACKLOG.md`); their last text is in git history at the commit before this one.
- 2026-10-05: claimed `expand/cad-studio`.
- 2026-10-05: spec [2026-10-05-cad-studio-design.md](../../docs/superpowers/specs/2026-10-05-cad-studio-design.md) and tracker [TRACKER.md](../../src/tools/cad/TRACKER.md): 212 functions; 14 verified, 4 implemented, 74 partial, 120 missing, 0 prohibited. `pnpm tool:check cad-studio --base origin/main`: 14/212, no errors; `pnpm docs:sync`, `pnpm docs:check` passed; `pnpm exec vitest run tests/unit/cad-progress.test.ts tests/unit/sheets-wave-b.test.ts tests/unit/deployment-config.test.ts` passed.

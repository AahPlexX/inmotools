---
task: T-crystal-lattice-studio-20261005-4e6d
tool: crystal-lattice-studio
doc: task
kind: expand
state: done
branch: expand/crystal-lattice-studio
created: 2026-10-05
updated: 2026-10-06
---

# Standard spec and tracker

## Request
Owner, 2026-10-05: enumerate every function per tool in its spec, including the owner's notes; repo wins where they differ.

## Resume here
Done: standard spec and tracker written. Further work starts from the tracker's Open work.

## Log
- 2026-10-05: moved from the retired `.tasks` lists (`IN_PROGRESS.md`, `NEXT.md`, `BACKLOG.md`); their last text is in git history at the commit before this one.
- 2026-10-06: claimed `expand/crystal-lattice-studio`.
- 2026-10-05: spec [2026-10-05-crystal-lattice-studio-design.md](../../docs/superpowers/specs/2026-10-05-crystal-lattice-studio-design.md) and tracker [TRACKER.md](../../src/tools/crystal/TRACKER.md): 171 functions; 48 verified, 7 implemented, 93 partial, 21 missing, 2 prohibited. `pnpm tool:check crystal-lattice-studio --base origin/main`: 50/171, no errors; `pnpm docs:sync`, `pnpm docs:check` passed; `pnpm exec vitest run tests/unit/cad-progress.test.ts tests/unit/sheets-wave-b.test.ts tests/unit/deployment-config.test.ts` passed.

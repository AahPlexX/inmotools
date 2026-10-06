---
task: T-crystal-lattice-studio-20261005-4e6d
tool: crystal-lattice-studio
doc: task
kind: expand
state: active
branch: expand/crystal-lattice-studio
created: 2026-10-05
updated: 2026-10-06
---

# Continue Crystal Lattice Studio against its master design

## Request
Continue the 163-capability master design (`docs/superpowers/specs/2026-09-11-crystal-lattice-studio-design.md`). Phases 1–2 are complete; Phase 3 core and Phase 4 analysis are integrated; the Phase 3 remainder (structure-factor amplitudes, stereographic projection, Ewald construction) and later capabilities remain.

## Resume here
The per-capability ledger `docs/superpowers/plans/2026-09-29-crystal-lattice-studio-capability-ledger.md` is the source for what is done, partial and missing; continue with its first missing or partial capability. Known open items: single-crystal/Laue and reflection export still default to X-ray amplitudes; no UX/accessibility pass against the master design yet. Do not rebuild tested foundations (`cell-engine.ts`).

## Log
- 2026-10-05: moved from the retired `.tasks` lists (`IN_PROGRESS.md`, `NEXT.md`, `BACKLOG.md`); their last text is in git history at the commit before this one.
- 2026-10-06: claimed `expand/crystal-lattice-studio`.

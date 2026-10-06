---
task: T-web-layout-studio-20261005-3d5c
tool: web-layout-studio
doc: task
kind: expand
state: done
branch: expand/web-layout-studio
created: 2026-10-05
updated: 2026-10-06
---

# Standard spec and tracker

## Request
Owner, 2026-10-05: enumerate every function per tool in its spec, including the owner's notes; repo wins where they differ.

## Resume here
Spec and tracker written: 128 requirements (57 verified, 27 implemented, 4 partial, 40 missing). Next: the diagnostics WLS-R85 to WLS-R93 (see the tracker). The earlier request (complete the 60-feature ledger) continues from the tracker's Open work.

## Log
- 2026-10-05: moved from the retired `.tasks` lists (`IN_PROGRESS.md`, `NEXT.md`, `BACKLOG.md`); their last text is in git history at the commit before this one.
- 2026-10-06: claimed `expand/web-layout-studio`.
- 2026-10-05: wrote `docs/superpowers/specs/2026-10-05-web-layout-studio-design.md` and `src/tools/web-layout/TRACKER.md`: 128 requirements as built at `e83420d6`: 57 verified, 27 implemented, 4 partial, 40 missing, 0 prohibited; ledger IDs WL-01 to WL-60 appear as "formerly WL-nn". `pnpm tool:check web-layout-studio --base origin/main`: 57/128, no errors.

---
task: T-audio-mastering-20261005-bfde
tool: audio-mastering
doc: task
kind: expand
state: done
branch: expand/audio-mastering
created: 2026-10-05
updated: 2026-10-05
---

# Standard spec and tracker

## Request
Owner, 2026-10-05: enumerate every function per tool in its spec, including the owner's notes; repo wins where they differ.

Earlier request on this task: evidence-backed 2026-09-27 audit candidates: direct clip manipulation, editor clipboard, effect preview, recording, beat grid and snap, seamless-loop preparation, precise spectral selection, macros or batch loudness. Source: `docs/superpowers/plans/2026-09-27-audio-mastering-production-parity-audit.md`.

## Resume here
Done. Spec `docs/superpowers/specs/2026-10-05-audio-mastering-design.md` and tracker `src/tools/music/MASTERING_TRACKER.md` list 160 requirements (AMW-R01–AMW-R160); the parity candidates are AMW-R31–R33 (direct clip manipulation, clipboard), AMW-R81 (effect preview), AMW-R129–R130 (recording), AMW-R59 (beat grid and snap), AMW-R61 (seamless loop), AMW-R80 (spectral selection), AMW-R110–R111 (macros, batch loudness). Next work is the tracker's Open work list.

## Log
- 2026-10-05: moved from the retired `.tasks` lists (`IN_PROGRESS.md`, `NEXT.md`, `BACKLOG.md`); their last text is in git history at the commit before this one.
- 2026-10-05: claimed `expand/audio-mastering`.
- 2026-10-05: spec and tracker written: 160 requirements, verified 100, implemented 24, partial 1, missing 35, prohibited 0. `pnpm tool:check audio-mastering --base origin/main`: incomplete, 100/160, no errors.

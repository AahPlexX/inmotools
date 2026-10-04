---
task: T-midi-harmony-lab-20261004-8a99
tool: midi-harmony-lab
doc: task
kind: expand
state: done
branch: expand/midi-harmony-lab
created: 2026-10-04
updated: 2026-10-04
---

# Cover untested requirements

## Request
Owner, 2026-10-03: integrate and run missing tests for untested requirements; fix wrong statuses when fully resolvable.

## Resume here
Done. MHL-R04 and MHL-R13 are covered by browser tests and `verified`; remaining open work is the `missing` rows MHL-R14–R17 (see the tracker).

## Log
- 2026-10-04: claimed `expand/midi-harmony-lab`.
- 2026-10-04: added `MHL-R04 adds, removes (keeping one) and moves chords earlier or later` and `MHL-R13 lays out without horizontal overflow and keeps controls usable at <width> px` (7 widths) to `tests/e2e/music.spec.ts`; all passed 3/3. MHL-R04, MHL-R13 `implemented` → `verified`. The existing MHL-R09 loop test failed 1 of 6 runs because its final 0.25-beat audition ended before the assertion; its final audition now uses 4 beats (20/20 passed). No code defects found. `pnpm tool:check midi-harmony-lab --base origin/main`: 13 verified, 4 missing, no errors.

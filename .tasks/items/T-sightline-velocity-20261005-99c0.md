---
task: T-sightline-velocity-20261005-99c0
tool: sightline-velocity
doc: task
kind: expand
state: done
branch: expand/sightline-velocity
created: 2026-10-05
updated: 2026-10-05
---

# Standard spec and tracker

## Request
Owner, 2026-10-05: enumerate every function per tool in its spec, including the owner's notes; repo wins where they differ.

## Resume here
Done: standard spec and tracker written. Further work starts from the tracker's Open work; owner question on SLV-R15 is in the spec's Intent not recorded.

## Log
- 2026-10-05: claimed `expand/sightline-velocity`.
- 2026-10-05: spec [2026-10-05-sightline-velocity-design.md](../../docs/superpowers/specs/2026-10-05-sightline-velocity-design.md) and tracker [TRACKER.md](../../src/tools/sightline/TRACKER.md): 59 functions (35 from the 2026-09-15 ledger F1–F35, 11 from the code, 10 from the owner notes, 3 standard rows); 42 verified, 2 implemented, 7 partial, 5 missing, 3 prohibited. `pnpm tool:check sightline-velocity --base origin/main`: 45/59, no errors.

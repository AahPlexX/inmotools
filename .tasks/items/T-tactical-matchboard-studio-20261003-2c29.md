---
task: T-tactical-matchboard-studio-20261003-2c29
tool: tactical-matchboard-studio
doc: task
kind: fix
state: done
branch: fix/tactical-matchboard-studio
created: 2026-10-03
updated: 2026-10-04
---

# Align MEDIABUNNY_PIN with the installed MediaBunny

## Request
Found during the baseline: `MEDIABUNNY_PIN` in `src/tools/tactics/export-types.ts` is 1.58.0 while `package.json` pins 1.60.0. Depends on the owner answer about 1.61.0 (docs/DECISIONS.md).

## Resume here
Done. `MEDIABUNNY_PIN` is `1.60.0`, equal to `package.json`; `tests/unit/tactics-export.test.ts` "pins MEDIABUNNY_PIN to the mediabunny version installed by package.json" fails if they differ. The 1.61.0 bump stays an owner question in docs/DECISIONS.md.

## Log
- 2026-10-03: recorded.
- 2026-10-04: claimed `fix/tactical-matchboard-studio`.
- 2026-10-04: `src/tools/tactics/export-types.ts` `MEDIABUNNY_PIN` 1.58.0 → 1.60.0 (package.json unchanged). Replaced the hard-coded `1.58.0` assertion with a test that reads `package.json` and compares; it fails with the old value (`expected '1.58.0' to be '1.60.0'`) and passes 20/20. Removed the MediaBunny pin row from docs/DECISIONS.md "Version pins"; the 1.61.0 open question stays.

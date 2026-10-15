---
task: T-tactical-matchboard-studio-20261014-r82
tool: tactical-matchboard-studio
doc: task
kind: fix
state: active
branch: fix/tactical-matchboard-studio
created: 2026-10-14
updated: 2026-10-14
---

# Make Matchboard dark styling follow the site theme

## Request

Owner, 2026-10-14: continue where the previous agent stopped in `AahPlexX/inmotools` and keep all associated internal documentation current so another model or provider can resume from any stopping point without stale state. Continue the current tracker sequence with TMS-R82.

## Scope

- Implement TMS-R82 only in this work unit: Matchboard dark styling follows the resolved site-wide theme (`light`, `dark`, `system`) rather than consulting the operating-system colour preference independently.
- Add focused browser evidence that stored Dark remains dark even when the emulated operating-system preference is light, and that the workspace has no axe `color-contrast` violation in that state.
- Shared edit reason: route-level browser acceptance evidence belongs in `tests/e2e/`; no shared runtime behavior or dependencies are changed.
- Close the stale PDF-Unicode review-fix task/handoff state now that #122 is on `main` at `2eb5bec8bf112057cafd51f63705b843825bd554`.
- No dependency changes.

## Resume here

Claimed from `main` `2eb5bec8bf112057cafd51f63705b843825bd554`. TMS-R82 remains partial until fresh browser/integration evidence passes. Implement the site-theme selector correction, add the regression, and keep the tracker and handoff synchronized. After verified TMS-R82, resume from the tracker’s remaining ordered work.

## Log

- 2026-10-14: #122 was squash-merged to `main` as `2eb5bec8bf112057cafd51f63705b843825bd554`. The previous review-fix task is therefore complete and its historical `awaits merge` wording is stale.
- 2026-10-14: claimed `fix/tactical-matchboard-studio` from that exact `main` commit. No dependencies or shared runtime files are in scope.

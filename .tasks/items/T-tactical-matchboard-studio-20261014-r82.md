---
task: T-tactical-matchboard-studio-20261014-r82
tool: tactical-matchboard-studio
doc: task
kind: fix
state: done
branch: fix/tactical-matchboard-studio
created: 2026-10-14
updated: 2026-10-15
---

# Make Matchboard dark styling follow the site theme

## Request

Owner, 2026-10-14: continue where the previous agent stopped in `AahPlexX/inmotools` and keep all associated internal documentation current so another model or provider can resume from any stopping point without stale state. Continue the current tracker sequence with TMS-R82.

## Scope

- Implement TMS-R82 only in this work unit: Matchboard dark styling follows the resolved site-wide theme (`light`, `dark`, `system`) rather than consulting the operating-system colour preference independently.
- Add focused browser evidence that stored Dark remains dark even when the emulated operating-system preference is light, and that the workspace has no axe `color-contrast` violation in that state.
- Shared edit reason: route-level browser acceptance evidence belongs in `tests/e2e/`; no dependencies were changed.
- Close the stale PDF-Unicode review-fix state now that #122 is on `main` at `2eb5bec8bf112057cafd51f63705b843825bd554`.

## Resume here

DONE. The GREEN integration workflow `38664068636`, job `116191941882`, completed successfully for runtime commit `901eaf0ea6a7852ba821067de871b035cc3015fe`. The repository integrated that branch as merge commit `f5b22c8f6f78b589a458e28d25be96c1dfe119c1` and then generated the task/index sync commit `539bf012171ecc9caeaddbffe0fd1579d5854c00`. TMS-R82 is verified. Continue with `T-tactical-matchboard-studio-20261015-r33` / TMS-R33.

## Log

- 2026-10-14: #122 was squash-merged to `main` as `2eb5bec8bf112057cafd51f63705b843825bd554`; the prior Unicode-PDF review-fix task was closed.
- 2026-10-14: claimed `fix/tactical-matchboard-studio` from that exact `main` commit. No dependency changes were in scope.
- 2026-10-15: added `tests/e2e/tactical-matchboard-theme.spec.ts`. It forces stored Dark + OS light and stored Light + OS dark, checks the resolved `html[data-theme]`, and runs axe `color-contrast` over the workspace in Dark.
- 2026-10-15: workflow `38662668259` stopped before product RED because the focused-E2E selector unit expected Tactical source changes to map to only the existing Matchboard spec. Updated that expectation only so Tactical changes select both Matchboard browser contracts; selector runtime behavior and product runtime were unchanged.
- 2026-10-15: workflow `38663048599`, job `116188548818`, was the valid RED gate. Unit/build checks passed; all four desktop/mobile browser cases failed on the exact OS/site-theme inversion. Failure artifact: `11939468710`.
- 2026-10-15: runtime `901eaf0ea6a7852ba821067de871b035cc3015fe` bound the affected Matchboard export-note, video-error, dialog, tooltip and sheet surfaces to the resolved `html[data-theme]` contract with explicit Light and Dark selectors in the cross-workspace correction layer.
- 2026-10-15: GREEN workflow `38664068636`, job `116191941882`, completed successfully, including the repository's merge/check/push gate. `main` integrated the work at `f5b22c8f6f78b589a458e28d25be96c1dfe119c1`; generated documentation sync advanced `main` to `539bf012171ecc9caeaddbffe0fd1579d5854c00`.

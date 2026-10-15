---
task: T-tactical-matchboard-studio-20261014-r82
tool: tactical-matchboard-studio
doc: task
kind: fix
state: active
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
- Shared edit reason: route-level browser acceptance evidence belongs in `tests/e2e/`; no shared runtime behavior or dependencies are changed.
- Close the stale PDF-Unicode review-fix task/handoff state now that #122 is on `main` at `2eb5bec8bf112057cafd51f63705b843825bd554`.
- No dependency changes.

## Resume here

RED is established. Workflow run `38663048599`, job `116188548818`, passed branch/tool/docs/unit/build gates and then failed all four desktop/mobile preference-inversion cases in `tests/e2e/tactical-matchboard-theme.spec.ts`: stored Dark rendered the light Matchboard surface when the OS preference was light, and stored Light rendered the dark Matchboard surface when the OS preference was dark. Next: replace only the three Matchboard `prefers-color-scheme: dark` style blocks with `:root[data-theme="dark"]` selectors, then rerun the governed integration gates. TMS-R82 remains partial until fresh GREEN browser/integration evidence passes.

## Log

- 2026-10-14: #122 was squash-merged to `main` as `2eb5bec8bf112057cafd51f63705b843825bd554`. The previous review-fix task is therefore complete and its historical `awaits merge` wording is stale.
- 2026-10-14: claimed `fix/tactical-matchboard-studio` from that exact `main` commit. No dependencies or shared runtime files are in scope.
- 2026-10-15: added `tests/e2e/tactical-matchboard-theme.spec.ts` as the TMS-R82 browser regression. It forces stored Dark + OS light and stored Light + OS dark, checks the resolved `html[data-theme]`, and runs axe `color-contrast` over the workspace in Dark.
- 2026-10-15: workflow `38662668259` stopped before product RED because the focused-E2E selector unit expected Tactical source changes to map to only the existing Matchboard spec. Updated that expectation only so Tactical changes select both Matchboard browser contracts; selector runtime behavior and product runtime were unchanged.
- 2026-10-15: workflow `38663048599`, job `116188548818`, is the valid RED gate. Unit/build checks passed; all four desktop/mobile browser cases failed on the exact OS/site-theme inversion. Failure artifact: `11939468710`. This isolates the defect to the Matchboard OS-media CSS rather than the site theme resolver.

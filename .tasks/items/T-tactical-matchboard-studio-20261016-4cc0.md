---
task: T-tactical-matchboard-studio-20261016-4cc0
tool: tactical-matchboard-studio
doc: task
kind: fix
state: done
branch: fix/tactical-matchboard-studio
created: 2026-10-16
updated: 2026-10-16
---

# TMS-R07 ball trajectory presets and elevation arcs

## Request
[@GitHub](plugin://github@openai-curated-remote/) inmotools — continue from where the previous agent stopped [@Handoff](plugin://engineering-suite-handoff@openai-curated-remote/) While preserving full quality expectations, without cutting corners, arbitrarily deferring tasks or integrations, omitting code. /snip snip init — use the snip plug in for writing efficient, clean and lean code aka to achieve the same or expected outcomes that we would get without it, but without unnecessary complexity. Make sure as you work -all associated  internal documentation updated and does not become stale, because at any point any other model from any other provider could assume continuing the project from any point (now or in the future) that you stop.

## Resume here
DONE. TMS-R07 runtime `4e05ed2d731de2cfd38b0359bb85942967294ea3` and selector expectation correction `3b7b53d44e77d0ca9cd70e556da238cba72da126` passed GREEN workflow `38934899167`, job `117087815510`, and integrated as `336643b4`. Tracker and current handoff record R07 verified. Next ordered work is TMS-R31 from current main; see `src/tools/tactics/CURRENT_HANDOFF.md`.

## Log
- 2026-10-16: claimed `fix/tactical-matchboard-studio`.

## Scope and design

- TMS-R07 uses the existing normalized ball timeline, physical pitch dimensions and integer milliseconds. No dependency, schema or playback-state addition.
- Presets are local authoring aids: ground 0°, driven 10°, lofted 35°, chipped 55°; airborne angles are editable between 0° and 90° exclusively. Flight duration is authored, not predicted.
- A straight horizontal path uses no-drag equal-height geometry `z = distance * tan(angle) * u * (1 - u)`; stored linear keyframes approximate the parabola in 32 intervals, including existing timestamps and both endpoints. Existing non-motion fields and keyframes outside the interval remain intact.
- Manual elevation authoring stays available. Applying a preset deliberately replaces position/elevation and interpolation inside its interval as one undoable edit.
- External reference checked 2026-10-16: OpenStax University Physics Volume 1, §4.3 Projectile Motion, https://openstax.org/books/university-physics-volume-1/pages/4-3-projectile-motion (equal-height projectile trajectory, without air resistance). This is authoring geometry, not football aerodynamics.
- Snip was initialized for the local Codex account; it compresses shell output and adds no project runtime dependency or provider-specific repository instruction.

## Verification

- RED source `6c1944b2`: new flight contracts fail because the preset API is absent (`authorBallFlight is not a function`, missing preset list); receipt `/tmp/inmotools-r07-red.log`.
- Local GREEN: 22 Tactical unit files / 182 tests passed with the first five flight contracts; all six final flight tests pass after adding JSON-round-trip coverage, receipt `/tmp/inmotools-r07-roundtrip.log`.
- Production build includes TypeScript, succeeds in 10.37 s; PWA precache generated (408 entries). Receipt `/tmp/inmotools-r07-build.log`.
- Focused flight browser contract: 2 passed on desktop/mobile Chromium, 0 failures, 0 skips, 0 retries (25.7 s). It covers presets, physical-metre midpoint elevation, undo/redo, manual edits, ground/driven re-authoring, invalid-interval preservation, 44px controls, page reflow and scoped Axe. Receipt `/tmp/inmotools-r07-browser.log`.
- `pnpm lint`: exit 0; existing warning debt remains. New inline type import warning was corrected; no unrelated lint cleanup.
- Governed integration `38934899167` succeeded on `3b7b53d4`: 4,186 units passed / 18 skipped; build including TypeScript passed (8.28 s); four owned Tactical specs passed, 88 browser passes / 2 existing duplicate mobile skips / no failures or reported retries (3.7 min). Product merged as `336643b4`.

## Integration correction

- Workflow `38934606163`, job `117086813623`, failed before build/browser execution: all 4,185 other units passed (18 skipped), but `tests/unit/e2e-spec-selection.test.mjs` still expected three Tactical specs. The route-based selector correctly returned the new fourth flight spec. Its expected list now includes the new spec; no selector/runtime behavior changed.
- Shared-file reason: `tests/unit/e2e-spec-selection.test.mjs` must assert the complete Tactical owned browser scope after adding the flight acceptance spec. This is a test-list update on the required `fix/<slug>` branch; no shell or unrelated tool source is changed.

## Closure validation scope

- `CURRENT_HANDOFF.md` has no client imports, but the selector recognized only ordinary `HANDOFF.md`, so a handoff-only update selected all Tactical browser specs. The record-name pattern now also recognizes `CURRENT_HANDOFF.md`; runtime changes still select all four owned specs. This follows the existing documentation-only validation policy and adds no runtime behavior.
- Shared-file reason: the one-pattern change in `scripts/select-e2e-specs.mjs` and its regression in `tests/unit/e2e-spec-selection.test.mjs` keep current handoff updates from rerunning unchanged browser coverage. `pnpm exec vitest run tests/unit/e2e-spec-selection.test.mjs tests/unit/validation-runner.test.mjs`: 23 passed, receipt `/tmp/inmotools-r07-handoff-scope.log`.
- Product evidence above remains valid: closure changes only current records and the tested scope classifier. The final closure workflow independently checks units/docs; its selected browser plan must be empty, with no runtime/dependency/browser-test changes.

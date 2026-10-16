---
task: T-tactical-matchboard-studio-20261016-4cc0
tool: tactical-matchboard-studio
doc: task
kind: fix
state: active
branch: fix/tactical-matchboard-studio
created: 2026-10-16
updated: 2026-10-16
---

# TMS-R07 ball trajectory presets and elevation arcs

## Request
[@GitHub](plugin://github@openai-curated-remote/) inmotools — continue from where the previous agent stopped [@Handoff](plugin://engineering-suite-handoff@openai-curated-remote/) While preserving full quality expectations, without cutting corners, arbitrarily deferring tasks or integrations, omitting code. /snip snip init — use the snip plug in for writing efficient, clean and lean code aka to achieve the same or expected outcomes that we would get without it, but without unnecessary complexity. Make sure as you work -all associated  internal documentation updated and does not become stale, because at any point any other model from any other provider could assume continuing the project from any point (now or in the future) that you stop.

## Resume here
TMS-R07 is implemented from baseline main `6a6bef39`. Local unit/build/lint and focused desktop/mobile browser checks pass; next complete governed integration and record the exact remote evidence before marking R07 verified. Remaining order: R31, R44, R52, R78, R75, R83.

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
- Local GREEN: 22 Tactical unit files / 182 tests passed before adding possession/JSON-round-trip coverage; all six final flight tests pass, receipt `/tmp/inmotools-r07-roundtrip.log`.
- Production build includes TypeScript, succeeds in 10.37 s; PWA precache generated (408 entries). Receipt `/tmp/inmotools-r07-build.log`.
- Focused flight browser contract: 2 passed on desktop/mobile Chromium, 0 failures, 0 skips, 0 retries (25.7 s). It covers presets, physical-metre midpoint elevation, undo/redo, manual edits, ground/driven re-authoring, invalid-interval preservation, 44px controls, page reflow and scoped Axe. Receipt `/tmp/inmotools-r07-browser.log`.
- `pnpm lint`: exit 0; existing warning debt remains. New inline type import warning was corrected; no unrelated lint cleanup.
- Governed integration and selected dependency/consumer browser gate: pending.

---
tool: tactical-matchboard-studio
doc: handoff
status: active
updated: 2026-10-16
tracker: src/tools/tactics/TRACKER.md
---

# Tactical Matchboard Studio — current handoff

This file is the current continuation record. `HANDOFF.md` is a preserved historical record from the older workflow and must not be used as a resume instruction when it conflicts with this file, `TRACKER.md`, or the active task.

## Current state

- Repository: `AahPlexX/inmotools`; canonical branch: `main`.
- Last verified product requirement: **TMS-R07 ball flight presets**.
- R07 runtime: `4e05ed2d731de2cfd38b0359bb85942967294ea3`; browser-selector expectation correction: `3b7b53d44e77d0ca9cd70e556da238cba72da126`.
- R07 GREEN workflow/job: `38934899167` / `117087815510`, conclusion `success`; product integration merge: `336643b4`.
- Closure/scope-classifier workflow `38935859420` / job `117091052612` passed and integrated as `40c5ace3`: 4,187 units passed / 18 skipped, build/TypeScript passed, actual browser plan `[]`. Completed task: `.tasks/items/T-tactical-matchboard-studio-20261016-4cc0.md`.
- R07 gate: 4,186 unit passes / 18 skips; TypeScript/production build passed (8.28 s); all four Tactical browser specs passed, 88 passes / 2 existing duplicate mobile skips / no failures or reported retries (3.7 min).
- R33 remains verified: runtime `0e60a3aecca4eef01327d31d950cbcffcabe8ecc`, test-only locator correction `7313bf00bbb4ca3642da859d42935fb0c2495ced`, GREEN workflow/job `38672289731` / `116217961540`, integration merge `ef68da5206c1fe6b9ef627caf4ed141bf7babcb4`.
- R82 site-theme correction remains verified: runtime `901eaf0ea6a7852ba821067de871b035cc3015fe`, GREEN workflow `38664068636`, integration merge `f5b22c8f6f78b589a458e28d25be96c1dfe119c1`.
- Unicode PDF review-fix PR #122 is merged as `2eb5bec8bf112057cafd51f63705b843825bd554`; no PDF review work is in flight.

## Exact next action

Start **TMS-R31 scene transitions** from current `main` using `pnpm task:start tactical-matchboard-studio fix "TMS-R31 scene transitions"` after these closure records integrate. Read the spec's R31 acceptance and its owner-overridable transition-kind note, then establish a focused RED preview/export contract before implementation. Relevant existing modules are `scene-engine.ts`, `timeline-engine.ts`, `board-engine.ts` and `export-engine.ts`; preview and export must share the same deterministic transition sampling. No dependency is currently justified. Do not revive archived PDF branches.

## Verified R07 behavior

- Ground/driven/lofted/chipped presets use `elevation-engine.ts` and the single canonical ball track. Local default angles are 0°/10°/35°/55°; airborne angles remain editable.
- Horizontal positions stay normalized; pitch length and width convert endpoint distance to metres. Equal-height no-drag geometry supplies elevation over 32 intervals (fewer for very short integer-millisecond spans), retaining existing timestamps. Duration is authored, not predicted; the controls identify presets as local authoring aids rather than measured football physics.
- Applying a preset replaces position/elevation/interpolation inside its interval, preserves existing event/visibility/rotation fields and frames outside the interval, and commits one normal immutable undoable edit. Manual elevation editing remains available.
- Invalid endpoints, timing, angles, dimensions and overlapping ball possession are rejected. A flight must not be silently overridden by a possession holder; release possession first. Generated flights round-trip through project JSON.
- No project schema, dependency, 3D state or alternate playback model was added.
- A selector regression now includes the fourth Tactical browser spec. Current handoff records receive the same documentation-only scope treatment as ordinary handoffs; a runtime change accompanying a handoff still selects every owned browser spec.

## Remaining ordered work

1. TMS-R31 — scene transitions.
2. TMS-R44 — defender interception cones.
3. TMS-R52 — first-person player camera.
4. TMS-R78 — touch long-press/radial actions.
5. TMS-R75 — missing 1200×630 social card.
6. TMS-R83 — focused offline route proof.

## Verified R33 behavior

- One authoring action writes paired outgoing/incoming visibility changes at the same integer millisecond on the canonical timeline.
- Additive structured substitution tags preserve pre-existing imported/rich-CSV keyframe `event` text.
- Same-team, same-scene, player-token, and immediate-before visibility constraints prevent invalid swaps.
- The Timing panel uses labeled native selects and the existing `onEdit` path, so undo/redo remains the workspace's normal immutable edit flow.
- Focused browser acceptance proves the board shows outgoing/incoming state immediately before the authored millisecond and swaps them at the authored millisecond.

## Verification history relevant to continuation

- R33 RED: `1056fb6ffb53a1764d4c58be01607e6a75b145a4`, workflow `38670429054`, job `116212029288`; exactly the new contract failed because the helper did not exist yet.
- R33 first GREEN attempt: workflow `38671314945`, job `116214857092`; browser setup failed on an ambiguous `Status` test locator before runtime behavior was exercised. Artifact `11944378830` documents it.
- R33 corrective GREEN: workflow `38672289731`, job `116217961540`; success, with no failure-evidence upload.
- R82 GREEN: workflow `38664068636`, job `116191941882`; success.

## Documentation authority

For resuming this tool, read in this order:

1. `src/tools/tactics/CURRENT_HANDOFF.md` — exact continuation and latest verified integration.
2. `src/tools/tactics/TRACKER.md` — requirement-by-requirement as-built status.
3. `.tasks/items/<active tactical task>.md` — current work-unit evidence while a task is active.
4. `docs/superpowers/specs/2026-10-05-tactical-matchboard-studio-design.md` — approved requirement/acceptance source.
5. `src/tools/tactics/HANDOFF.md` — archive only.

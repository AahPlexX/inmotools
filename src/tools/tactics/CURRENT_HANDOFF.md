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

- Repository: `AahPlexX/inmotools`.
- Canonical branch: `main`.
- Last verified product requirement: **TMS-R33 timed substitutions**.
- TMS-R33 runtime: `0e60a3aecca4eef01327d31d950cbcffcabe8ecc`.
- TMS-R33 test-only locator correction: `7313bf00bbb4ca3642da859d42935fb0c2495ced`.
- TMS-R33 GREEN workflow/job: `38672289731` / `116217961540`, conclusion `success`.
- TMS-R33 integration merge: `ef68da5206c1fe6b9ef627caf4ed141bf7babcb4`.
- Post-integration generated documentation/index sync: `af4fed70446dccc2ff4b1ab25188f5f845af6570`.
- TMS-R82 site-theme correction is also verified: runtime `901eaf0ea6a7852ba821067de871b035cc3015fe`, GREEN workflow `38664068636`, integration merge `f5b22c8f6f78b589a458e28d25be96c1dfe119c1`.
- Unicode PDF review-fix PR #122 is already merged as `2eb5bec8bf112057cafd51f63705b843825bd554`; nothing from that review is in flight.

## Exact next action

TMS-R07 is implemented on `fix/tactical-matchboard-studio`, task `.tasks/items/T-tactical-matchboard-studio-20261016-4cc0.md`. Six new flight units and focused desktop/mobile browser acceptance pass locally. First integration `38934606163` failed only on the stale three-spec selector expectation; the fourth flight spec was correctly selected. That expected list is corrected. Next: complete governed integration, record its exact workflow and merge, then mark R07 verified and start TMS-R31 from current main. Do not revive archived PDF branches.

R07 reuses `elevation-engine.ts` and the canonical ball track: ground/driven/lofted/chipped presets write normalized positions and metre-based elevation keyframes from pitch distance and editable launch angle. Flight duration is authored; the piecewise-linear keyframes approximate equal-height no-drag geometry. Existing event/visibility fields and frames outside the interval are preserved; manual elevation remains editable. Overlapping ball possession must be released first. No dependency or schema changed.

## Remaining ordered work

1. TMS-R07 — trajectory presets and computed elevation arc.
2. TMS-R31 — scene transitions.
3. TMS-R44 — defender interception cones.
4. TMS-R52 — missing camera preset scope.
5. TMS-R78 — touch long-press/radial actions.
6. TMS-R75 — add the missing 1200×630 social card.
7. TMS-R83 — focused offline route proof.

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

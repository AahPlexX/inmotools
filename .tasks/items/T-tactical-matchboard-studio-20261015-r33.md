---
task: T-tactical-matchboard-studio-20261015-r33
tool: tactical-matchboard-studio
doc: task
kind: fix
state: active
branch: fix/tactical-matchboard-studio
created: 2026-10-15
updated: 2026-10-15
---

# Author timed Matchboard substitutions

## Request

Owner, 2026-10-14: continue `AahPlexX/inmotools` from the previous agent's stopping point and keep all associated internal documentation current enough for any model/provider to resume without stale state. After verified TMS-R82, continue the tracker sequence with TMS-R33.

## Scope

- Implement TMS-R33: author one atomic timed substitution so an outgoing player leaves the board and an incoming off-field roster player appears at the authored integer-millisecond time.
- Reuse the existing canonical timeline and player-token visibility model; do not add a parallel clock or second playback state machine.
- Preserve existing imported/rich-CSV keyframe event text, immutable project editing, scene reorder/join behavior, persistence, undo/redo integration through the existing workspace edit path, and prior visibility/possession behavior.
- Expose the authoring control inside the existing Timing panel using native labeled form controls. Current W3C WAI and MDN guidance confirms form controls, including selects, need descriptive associated labels; the existing Timing panel's visible label/control pattern remains the baseline.
- Add focused unit evidence first (RED then GREEN) and focused desktop/mobile browser acceptance. No dependency changes.

## Resume here

RED is established. Workflow `38670429054`, job `116212029288`, reached the full unit gate: 377 files (`1 failed | 374 passed | 2 skipped`) and 4,198 tests (`1 failed | 4,179 passed | 18 skipped`). The only failure is the new TMS-R33 contract because `addTimelineSubstitutionEvent` did not exist. Runtime implementation is now being added as one atomic project edit that writes paired visibility keyframes at the same millisecond and appends structured substitution tags to the existing keyframe `event` strings without replacing prior event text. Next: run the governed GREEN gate, then close TMS-R33 only if focused desktop/mobile browser acceptance also passes.

## Design notes

- A substitution uses the canonical timeline only. The outgoing target gets `visible: false` and the incoming target gets `visible: true` at the same integer millisecond; `sampleTacticalProjectAtTime` already applies that state to the board.
- Semantic pairing is persisted inside the two existing keyframes as additive `[substitution:<encoded-id>:outgoing]` / `[substitution:<encoded-id>:incoming]` tags. Existing keyframe `event` text is retained and the substitution tag is appended, avoiding a new schema field and avoiding data loss for imported/rich-CSV events.
- Authoring validates player-token identity, same team, same scene, and actual visibility immediately before the authored time. This supports later sequential substitutions without incorrectly treating the roster's static `active`/`substitute` category as a second timeline state.
- `addSquadParticipant` and status editing already make initial substitutes hidden, so no duplicate player/token model is required.
- Scene reordering/joining and persistence already move/merge/round-trip timeline keyframes and their event text; using the same keyframes therefore preserves those semantics without special-case migration code.
- The Timing panel lists only active/substitute roster players (not coaches or neutral participants) and explains that actual on/off-field eligibility is checked at the chosen time.

## Log

- 2026-10-15: TMS-R82 GREEN integration confirmed at workflow `38664068636`; current baseline `main` is `539bf012171ecc9caeaddbffe0fd1579d5854c00` after generated documentation sync.
- 2026-10-15: reviewed current W3C WAI form labeling/instruction guidance plus MDN `<label>`/`<select>` references before changing the client-side Timing panel. Visible associated labels remain the required pattern; no custom widget is justified.
- 2026-10-15: RED commit `1056fb6ffb53a1764d4c58be01607e6a75b145a4`; workflow `38670429054`, job `116212029288`. All prior unit coverage passed; only the newly introduced timed-substitution contract failed with `TypeError: addTimelineSubstitutionEvent is not a function`.
- 2026-10-15: implementation design was narrowed after checking `TacticalKeyframe.event` persistence/export behavior. The helper appends a structured substitution tag instead of overwriting existing event text and does not introduce a new timeline schema or clock.

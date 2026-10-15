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

- Implement TMS-R33: author one atomic timed substitution event so an outgoing player leaves the board and an incoming substitute appears at the authored integer-millisecond time.
- Reuse the existing canonical timeline and player-token visibility model; do not add a parallel clock or second playback state machine.
- Preserve immutable project editing, scene reorder/join semantics, project validation/persistence, undo/redo integration through the existing workspace edit path, and prior visibility/possession behavior.
- Expose the authoring control inside the existing Timing panel using native labeled form controls. Current W3C WAI and MDN guidance confirms form controls, including selects, need descriptive associated labels; the existing Timing panel's visible label/control pattern remains the baseline.
- Add focused unit evidence first (RED then GREEN) and browser acceptance in the existing Tactical Matchboard spec. No dependency changes.

## Resume here

Claimed from `main` `539bf012171ecc9caeaddbffe0fd1579d5854c00` after TMS-R82 integration. The first RED contract is added with this task claim: a hidden substitute token must remain hidden before 2000 ms, then atomically replace an outgoing visible token at 2000 ms through a structured timeline substitution event. Next: run the governed gate to capture RED, then implement the smallest event/type/sampling/validation/UI/persistence-compatible change that satisfies it.

## Design notes

- `TacticalTimeline` already owns ordered typed events for possession and integer-millisecond keyframes; timed substitutions belong in that same canonical record.
- `sampleTacticalProjectAtTime` already applies sampled visibility to player tokens. A substitution event can therefore set outgoing visibility false and incoming visibility true at/after its authored time without mutating roster identity or inventing new playback state.
- `addSquadParticipant` already creates substitute tokens hidden by default when a placement is supplied, so no duplicate player/token model is required.
- Scene reordering and joining already remap/shift possession event references. Substitution references must follow the same lossless rules.

## Log

- 2026-10-15: TMS-R82 GREEN integration confirmed at workflow `38664068636`; current `main` is `539bf012171ecc9caeaddbffe0fd1579d5854c00` after generated documentation sync.
- 2026-10-15: reviewed current W3C WAI form labeling/instruction guidance plus MDN `<label>`/`<select>` references before changing the client-side Timing panel. Visible associated labels remain the required pattern; no custom widget is justified.

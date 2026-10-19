---
task: T-tactical-matchboard-studio-20261019-b823
tool: tactical-matchboard-studio
doc: task
kind: fix
state: active
branch: fix/tactical-matchboard-studio
created: 2026-10-19
updated: 2026-10-19
---

# TMS-R31 chapter transitions in preview and export

## Request
Continue

Continuation of the owner’s standing request to resume inmotools, preserve full implementation/verification quality, use Snip for command output, and keep internal documentation portable and current.

## Resume here
Active: TMS-R31 from main `160a3c39`. Establish RED transition sampling/export contracts, implement, then run the governed integration gate. Remaining order after R31: R44, R52, R78, R75, R83.

## Log
- 2026-10-19: claimed `fix/tactical-matchboard-studio`.

## Scope and defaults

- Persist an optional exit transition on each scene: cut (0 ms), fade-through-background, or morph. Existing projects with no transition setting retain their selected-scene preview/export behavior; setting a transition enables chapter playback following the canonical integer-millisecond playhead.
- A transition occupies the outgoing scene’s final duration and ends exactly at the next contiguous scene’s start. Fade and morph use frozen outgoing/arrival snapshots, avoiding a second timeline clock or mutating project history during preview.
- Morph pairs visible players by team/roster identity and interpolates their positions and shortest rotation plus the ball position/elevation. Unpaired players, props and drawings switch halfway; labels explain this default. Owner may override these transition semantics.
- Preview, 3D, SVG animation/frame exports, standalone HTML/video and PDF contact sheets share deterministic chapter sampling. Animated frame exports retain transition samples within the existing frame cap or report an insufficient cap rather than silently dropping a transition.
- Additive optional scene data needs no schema bump or dependency. Validate transition data on import; preserve it through clone/split/reorder/join according to scene-boundary ownership.
- Shared-file reason: Tactical unit/browser acceptance and the existing E2E selector regression must cover the new owned transition contract. No unrelated tool, shell, dependency or workflow changes.

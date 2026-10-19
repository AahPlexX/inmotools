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
TMS-R31 is implemented from main `160a3c39`. Local unit/build/type/lint and focused desktop/mobile acceptance pass; next push for the governed repository/owned-browser gate, record its exact result, and mark verified only after acceptance. Remaining order after R31: R44, R52, R78, R75, R83.

## Log
- 2026-10-19: claimed `fix/tactical-matchboard-studio`.

## Scope and defaults

- Persist an optional exit transition on each scene: cut (0 ms), fade-through-background, or morph. Existing projects with no transition setting retain their selected-scene preview/export behavior; setting a transition enables chapter playback following the canonical integer-millisecond playhead.
- A transition occupies the outgoing scene’s final duration and ends exactly at the next contiguous scene’s start. Fade and morph use frozen outgoing/arrival snapshots, avoiding a second timeline clock or mutating project history during preview.
- Morph pairs visible players by team/roster identity and interpolates their positions and shortest rotation plus the ball position/elevation. Unpaired players, props and drawings switch halfway; labels explain this default. Owner may override these transition semantics.
- Preview, 3D, SVG animation/frame exports, standalone HTML/video and PDF contact sheets share deterministic chapter sampling. Animated frame exports retain transition samples within the existing frame cap or report an insufficient cap rather than silently dropping a transition.
- Additive optional scene data needs no schema bump or dependency. Validate transition data on import; preserve it through clone/split/reorder/join according to scene-boundary ownership.
- Shared-file reason: Tactical unit/browser acceptance and the existing E2E selector regression must cover the new owned transition contract. No unrelated tool, shell, dependency or workflow changes.

## Verification

- RED `9d291755`: focused suite cannot import the missing `transition-engine`; receipt `/tmp/inmotools-r31-red.log`.
- GREEN local: 23 Tactical unit files / 188 tests pass before the final presentation-mark and implicit-cut contracts; all seven final transition contracts pass, including PDF opacity and JSON/scene-edit validation. Receipts `/tmp/inmotools-r31-units-final.log`, `/tmp/inmotools-r31-transitions-final.log`.
- TypeScript passed on final source (`/tmp/inmotools-r31-tsc-final.log`); production/PWA build passed (`/tmp/inmotools-r31-build-final.log`). Local lint exited 0 with existing warning debt; no transition-engine or transition-test diagnostics.
- Focused desktop/mobile Chromium: 2 passed / 0 skipped / 0 failures / 0 retries, 33.0 s (`/tmp/inmotools-r31-browser-final.log`). This covers keyboard authoring, 500 ms fade samples, undo/redo, 3D opacity, standalone HTML samples, morph geometry, invalid duration, 44px controls, reflow and scoped Axe.
- First browser trial failed because the test sought the playhead before undo, so Undo correctly reverted the separately authored Set playhead operation. The test now checks transition undo/redo immediately after authoring. Runtime history behavior and original assertions/timeouts are unchanged.
- Governed integration: pending. Final implicit-cut sampling and input-copy refinements are covered by fresh unit/type checks and will receive the governed browser gate on the exact pushed source.

## Implementation notes

- Scene transitions are optional exit metadata; legacy payloads keep schema version 2 and remain unchanged without settings. Import rejects invalid transition kinds, durations, scene ranges and overlaps.
- Split transfers the exit setting to the right part and clamps duration; join inherits the right part’s exit; reorder clears settings with no valid next boundary; cloning cannot create overlaps while chapter playback is configured.
- Presentation annotation visibility is frozen with the same snapshots for preview and all timed exports. PDF opacity is applied to vector fill/stroke/text; Unicode font detection includes scenes actually drawn in chapter contact sheets.
- Timed exports reserve visible fade/morph samples and explicit/implicit cut boundaries; they report an insufficient frame cap rather than omitting a chapter.

## Keyboard focus correction

- Candidate runtime `640213fd9282f0145e522231a2cb34ff64d1ead2` entered integration `39194465660`. A follow-up keyboard-cycle assertion reproduced focus loss after saving: the form key changed with the stored transition kind and remounted the focused Save button. RED receipt `/tmp/inmotools-r31-focus-red.log`.
- The form now keeps its DOM identity; controlled kind/duration drafts synchronize with canonical scene settings for undo/redo and scene selection. The same browser contract asserts Save retains focus. Final acceptance must use the corrected successor, not the initial candidate.

- Corrected focus-preserving source passes the same desktop/mobile browser contract: 2 passed / 0 skips / 0 failures / 0 retries, 30.2 s (`/tmp/inmotools-r31-focus-green.log`); build/TypeScript pass (`/tmp/inmotools-r31-focus-build.log`). Draft values are derived from canonical settings plus event-local edits, without an effect-driven state reset.
- Final focused transition suite: 8 passed (`/tmp/inmotools-r31-final-eight.log`), including a PDF regression proving later drawn chapters with Unicode labels embed the page font. Focused lint passes; the draft implementation adds no effect-driven-render warning.

## Authored export timing

- R31 requires authored transition duration in actual playback, not only retained frame geometry. Existing standalone HTML and CanvasSource encoding advanced by frame index, shortening capped sequences. Both now use the retained `timeMs` values; video samples receive authored seconds and consecutive sample durations, and HTML preserves elapsed time while paused.
- The browser contract drives the exported HTML’s requestAnimationFrame callbacks with controlled timestamps and verifies the 625 ms and 875 ms fade samples at the corresponding elapsed times. Native encoded-video metadata is checked against the authored final timestamp whenever a negotiated encoder is available; the test attaches a duration receipt.
- Initial timing checks used a running/paused mock clock and assumed no interleaved uniform sample or initial frame delay. The final check supplies deterministic animation-frame timestamps to the actual exported script; elapsed-time and frame assertions remain explicit. Receipts from these diagnostics are `/tmp/inmotools-r31-clock-red.log` and `/tmp/inmotools-r31-timing-browser*.log`.
- Local corrected timing gate: 4 passed on desktop/mobile Chromium (45.2 s), including chapter/HTML timing and existing capability-checked video export. Focused export/transition units: 30 passed; type/build and focused lint pass. Receipts `/tmp/inmotools-r31-timing-proof.log`, `/tmp/inmotools-r31-timing-units.log`, `/tmp/inmotools-r31-timing-build.log`.
- Source facts checked 2026-10-19: MDN SVG opacity reference, https://developer.mozilla.org/en-US/docs/Web/SVG/Reference/Attribute/opacity ; pinned MediaBunny 1.60.0 `CanvasSource.add(timestamp, duration)` typings in `dist/modules/src/media-source.d.ts` specify both arguments in seconds. No dependency change.
- This correction also strengthens existing TMS-R71 video and TMS-R74 standalone-playback acceptance; neither requirement’s verified status is reduced.

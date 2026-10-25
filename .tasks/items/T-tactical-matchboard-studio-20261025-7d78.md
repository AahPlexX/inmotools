---
task: T-tactical-matchboard-studio-20261025-7d78
tool: tactical-matchboard-studio
doc: task
kind: fix
state: active
branch: arena/981e49e9-inmotools
created: 2026-10-25
updated: 2026-10-25
timestamp: 2026-10-25T22:03:00Z
agent: Arena.ai Agent Mode (model name not exposed)
validator: Arena.ai Agent Mode (same agent); automated baseline passed and R78 RED observed; acceptance pending
documentation: TMS-R78 baseline and executable RED before runtime
---

# TMS-R78 touch long-press radial player actions

## Request

> Continue development- prefer Claude fable 5.1 as the orchestration model

Standing quality/TDD/documentation/no-PR/metadata instructions are recorded verbatim in [R44 task](T-tactical-matchboard-studio-20261025-4d44.md); the owner's authorization to continue/push on this chat branch and handle integration is in [R52 task](T-tactical-matchboard-studio-20261025-7d52.md). The connector must not be closed/disconnected. Model selection/identity is not exposed here; no preferred-model selection, independent reviewer or subagent is claimed.

## Resume here

R44/R52 are locally verified; continue **R78**, then R75/R83. R78 remains missing. Contract commit `6473cab` precedes the new tests; runtime is unchanged. Fresh baseline: 227 Tactical units / 25 files, type/production/PWA build (15.74 s / 408 precache entries) and existing R77 browser actions (2 passed / both projects / one worker / 12.3 s). RED: all 17 new units fail on missing APIs; both executed native-touch browser cases fail on absent radial dialog. Six browser contracts are written; the other ten project-cases have not run yet. Next: implement pure controller/visibility/placement, stable-board touch hook and responsive radial dialog sharing the seven existing callbacks, then run the focused contracts and frozen acceptance. Main integration remains owner-managed and nonblocking; no hosted CI/deployment is claimed.

## Source and workflow

- Published baseline `0b300d2258886661aa1798f40d3fed6a00790445`; accepted runtime `bedf5ece25cab5a541e8f09605b0dd52e7323f06`; main `fa4dd291c0b4556025a5e58f21e4268f6748e9d6` at inspection. This restored checkout initially had main HEAD and 17 R44/R52 modified/untracked files. All 17 matched the published branch byte-for-byte; staged/index verified equal to that remote tree, then fast-forwarded without discarding file content. Baseline is clean.
- All work/explicit pushes stay on `arena/981e49e9-inmotools`. No PR, main push, branch switch/creation/rename, workflow/branch-policy bypass or connector disconnection. Owner handles integration; `task:start` is not executed because it would change branches. Standard task format is retained; the existing branch-name gate remains incompatible with the fixed chat branch.
- Shared-file reason: owned unit/e2e contracts and generated task/index views support this Tactical-only feature. No other tool, shell, global helper/configuration, workflow, dependency or schema change.
- Ignored cache/artifacts from prior sandboxes did not restore. Exact pinned pnpm/dependencies/browser were recovered with the R52 method: immutable SheetJS GitHub blob, identical lockfile SHA-512, external frozen install (9.3 s), ignored dependency links and verify-deps wrapper. Repository manifests/lockfile/patches are unchanged. Local Chromium 153.0.8010.0 / revision-1243 launcher is not the official 153.0.8010.12 downloadable browser or hosted CI environment.

## Contract and decisions (before runtime)

- A single primary touch on a currently visible player token/label in Move mode, with drag-to-pan off and no overlay, selects that player immediately as before. A **500 ms** stationary hold opens a radial presentation of the same existing seven R77 actions: Lock/Unlock, Move tool, Arrow tool and four precision nudges. Locked players remain eligible so they can be unlocked. Mouse/pen, non-primary contacts, blank pitch, ball, annotation, Arrow/Freehand/Pan modes do not start holds.
- Use **10 CSS px Euclidean movement tolerance**; beyond it cancels permanently for that contact, even if it moves back. Release/cancel, unexpected capture loss, another contact, scroll, resize, blur, hidden tab, scene/project/pose/mode changes, selection changes, overlays or unmount cancel pending work. Validate against the latest sampled scene/layer/token visibility at recognition; no second animation clock or automatic token rebinding.
- Keep native scrolling/pinch and the existing tap-to-select/tap-to-move flow. Capture the eligible touch on the stable board container so selection-driven SVG replacement does not lose it. Release of the initiating finger never executes a menu action or moves the player; compatibility click/native touch context-menu events cannot reopen the legacy dialog or click through. A subsequent deliberate button activation executes an action.
- Radial actions share the existing canonical callbacks, lock checks, undo/redo and status messages with R77; no alternate edit model. Movement/lock commands stay in the menu as before; tool choices preserve their existing semantics. Menu/gesture state is ephemeral and does not persist in project JSON/ZIP/history. Replacing a project dismisses actions; an unavailable radial target disables actions and leaves Close available.
- Use labelled native buttons in a modal dialog/group, not a new ARIA menu keyboard model. Reuse focus trapping, Escape and focus return; focus the stable board without scrolling for touch restoration. Keep the existing Player actions button, right-click and Shift+F10 equivalents. Do not introduce drag-only access or accidental edits from releasing a hold.
- Anchor/clamp the panel to the visual viewport with 8 px gutters, 44 px or larger targets and no horizontal overflow. Use a radial ring when space/text size fits; use a compact scrollable button layout for constrained height/width or enlarged text rather than overlap/clipping. Reposition on viewport changes. Preserve light/dark/forced-color/reduced-motion behavior and no page-scroll lock leak.
- Defaults (500 ms / 10 px, deliberate native button activation, compact layout when radial geometry cannot fit) are conservative authoring choices; **owner may override**. Browser Pointer Events, native timers, existing React/ReactDOM/focus utility and canonical editing suffice; no dependency, backend or schema addition.

## Validation plan

1. Baseline: existing Tactical units/type/production/PWA build, R77 desktop/mobile browser and docs/completion checks.
2. RED before runtime: deadline/cancellation/stale callbacks/disposal/compatibility behavior; sampled visibility and bounded menu placement (fast-check); real Chromium touch via CDP, not only synthetic dispatch.
3. GREEN: real touch on a non-selected token through SVG replacement, release/callout/click suppression, cancel/move/second contact/scroll/mode/unmount cycles, ordinary taps, seven-action parity, lock/nudge/tool commands with undo/redo/JSON, zoomed pitch and viewport edges, focus/keyboard/touch, 44 px, 320/390/768 px/large text, axe and resolved dark theme.
4. Frozen requirement checkpoint: full repository units, TypeScript/production/PWA build, full lint, canonical four owned browser specs with one worker and original assertions/timeouts/zero local retries, docs sync/check and `tool:check --base origin/main`. No full-product/full-site browser, official browser-download or hosted/integration/deployment claim.
5. Commit/push working steps and update task/spec/tracker/handoff throughout; task remains active only for owner integration once local acceptance completes. Follow R75 then R83 after R78.

## Log

- timestamp: 2026-10-25T21:56:31Z | agent: Arena.ai Agent Mode (model name not exposed) | validator: repository/rules/remote/source inspection | documentation: Re-read governance, standards, decisions, validation policy, current handoff, PRD and tracker. Restored published source safely; latest owner-authorized branch remains active. Existing R77 has seven actions sharing canonical edits; R78 contract/defaults recorded before runtime changes. No connector action or unrelated file change.

- timestamp: 2026-10-25T22:03:00Z | agent: Arena.ai Agent Mode (model name not exposed) | validator: automated Vitest/TypeScript/Vite/Playwright; same-agent evidence review | documentation: Baseline on `6473cab`: 227 Tactical units / 25 files passed (5.62 s), type/production/PWA build passed (Vite 15.74 s, 408 entries), existing R77 browser 2 passed (one worker, 12.3 s). New `tactics-long-press.test.ts`: 17 expected failures (749 ms), missing `createTacticalLongPress`, `isVisiblePlayerActionTarget` and `placePlayerActionMenu`, not module-resolution errors. Native CDP touch on nonselected token survives selection, but the new radial dialog does not exist: 2 expected browser failures (both projects), no runtime edit. Other five new browser contracts remain unexecuted at RED. Original assertions/timeouts/retries unchanged. Sandbox receipts: `/home/user/inmotools-r78-baseline-{units,build,browser}.log`, `/home/user/inmotools-r78-red-{units,browser}.log`; raw traces are sandbox-local, not durable hosted evidence.

## Primary API source review

- Reviewed 2026-10-25: [W3C Pointer Events editor source](https://github.com/w3c/pointerevents/blob/gh-pages/index.html), current `gh-pages` content retrieved with GitHub API. Implicit touch capture, explicit capture ownership and suppression of the pointer stream during native pan/zoom support capture on the stable board, cancellation handling and preserving `touch-action`. This is API evidence, not third-party runtime code or a physical-device claim. Chosen 500 ms / 10 px thresholds remain documented authoring defaults, not a claimed browser standard.

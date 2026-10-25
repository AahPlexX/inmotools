---
task: T-tactical-matchboard-studio-20261025-7d78
tool: tactical-matchboard-studio
doc: task
kind: fix
state: active
branch: arena/981e49e9-inmotools
created: 2026-10-25
updated: 2026-10-25
timestamp: 2026-10-25T22:36:50Z
agent: Arena.ai Agent Mode (model name not exposed)
validator: Arena.ai Agent Mode (same agent); automated focused gates; full R78 acceptance pending
documentation: R78 candidate implementation and corrective TDD; R44/R52 locally accepted
---

# TMS-R78 touch long-press radial player actions

## Request

> Continue development- prefer Claude fable 5.1 as the orchestration model

Standing quality/TDD/documentation/no-PR/metadata instructions are recorded verbatim in [R44 task](T-tactical-matchboard-studio-20261025-4d44.md); the owner's authorization to continue/push on this chat branch and handle integration is in [R52 task](T-tactical-matchboard-studio-20261025-7d52.md). The connector must not be closed/disconnected. Model selection/identity is not exposed here; no preferred-model selection, independent reviewer or subagent is claimed.

## Resume here

R44/R52 are locally verified; continue **R78**, then R75/R83. R78 is partial: controller/hook, shared seven callbacks and responsive native-button dialog are implemented, but final acceptance has not run. Contract `6473cab`, original RED `61ed61a`. Current focused unit gate: 19 new / 24 accessibility-plus-gesture units pass; new helpers/components/units lint 0 warnings / 0 errors; type/production/PWA build passes (18.37 s / 408 precache entries). The complete current focused browser batch passed all 16 cases (one worker, 2.0 min, no failures/retries). Earlier batches and corrective RED are preserved below. Next: finish focused checks, freeze/commit candidate, run full units/lint/type/build and the canonical four owned browser specs (one worker), then update computed completion. No other implementation is reopened; owner integration remains nonblocking.

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

## Candidate implementation and corrective TDD

- Pure helpers in `accessibility-engine.ts`: injectable 500 ms / 10 px controller with cancellation/disposal/stale-callback guards, latest sampled visibility and bounded placement. `usePlayerLongPress.ts` captures on the stable board before selection updates SVG, invalidates on sampled-project/view/selection/overlay/window interruptions, and disposes listeners/timers. Presentation changes, including playback, cancel an in-flight hold; no second playback clock is introduced.
- The legacy and radial presentations use exactly one JSX/callback definition for the seven commands. The radial target ID stays bound, unavailable commands disable without rebinding, and replacement projects dismiss actions. Gesture/anchor state is component-only. `TacticalRadialMenu.tsx` portals a native dialog/fieldset and native buttons, reuses the existing focus trap with opt-in prevent-scroll restoration, measures real content/zoom/visual viewport, and falls back to scrollable compact controls. Existing modes, history, locking and accessible fallback commands remain canonical.
- Original RED: all 17 new units and both executed touch cases fail on absent APIs/dialog. Engine GREEN initially 17 units. Additional inherited-coordinate RED reproduced `undefined` coordinates when spreading native-like getters (17 pass / 1 fail); explicit numeric copying fixes it. Compatibility-guard peek RED then 18 pass / 1 fail; current pure gate is 19 pass, plus 5 existing accessibility units (24 total), including 150 seeded geometry cases.
- First browser candidate: 10 pass / 4 fail (14 cases). Two new interruption cases used `A` instead of the existing `Shift+A` shortcut: corrected to the registered chord and added a mode assertion, without weakening the no-menu assertion. Two focus cases genuinely failed after release. A native-event diagnostic proved Lock focused before release, then compatibility `mousedown` focused Close underneath the finger. Suppress mouse-down/up defaults and the initiating click, not pointer-down/pan/pinch. New deliberate pointer-down or keyboard activation remains allowed.
- Second candidate: 13 pass / 1 mobile repeat-hold failure. Existing global smooth scrolling could still be in flight when the low-level touch helper started; the new test helper now waits for normal Playwright stable/hit-target trial actionability before dispatching native touch. Production scroll cancellation is retained. Full focused acceptance is pending, not inferred from isolated results.
- Additional availability RED: 2 failed, because disabling a focused command did not focus Close. Close now receives focus on unavailability (after the reused trap captures its restoration target). Root-font probes alone passed; the decisive short-viewport 16 px root / 20 px body-caption probe failed (desktop, 1 case). Actual panel content overflow now triggers compact layout, not only button glyph overflow. New seven-browser-contract coverage also includes real label holds, subsequent native-touch button activation, Freehand exclusion, sampled-pose cancellation, disabled-target focus and project replacement.
- Current build/lint/unit receipts: `/home/user/inmotools-r78-{green-engine,focused-lint,fourth-build}.log`. Focused browser receipt `/home/user/inmotools-r78-focused-browser-final.log`: 16 passed (14 R78 plus 2 unchanged R77), one worker, 2.0 min, no failures/retries. Full required checkpoint has not started.
- Raw initial RED/first-candidate/availability traces and logs were archived and `tar --compare` verified before removal: `/home/user/.cache/inmotools-validation/receipts/inmotools-r78-diagnostics-v1.tar.xz`, 122,137,388 bytes, SHA-256 `e496ec2f0b77d2f4f6458da1bc88e49c6608e226bd7e24ef48bbcd0c4c290d3e`. Per-file manifest is alongside it; extraction into `/home/user/inmotools-r78-receipts` restores its absolute manifest paths. The second candidate's failed mobile trace was overwritten by the next run; its full failure log remains. These are sandbox cache receipts, not committed artifacts or guaranteed durable hosting. No failure is converted into acceptance.

- timestamp: 2026-10-25T22:36:50Z | agent: Arena.ai Agent Mode (model name not exposed) | validator: automated local focused gates; same-agent evidence review | documentation: Complete focused desktop/mobile batch: 16 passed / 0 failures / 0 retries (one worker, 2.0 min), including all seven new R78 contracts and unchanged R77. 19 new units / 24 focused units, 150 seeded geometry samples, clean new-module lint and type/production/PWA build (18.37 s / 408 entries) pass. Candidate is ready to freeze; full required acceptance remains pending and R78 stays partial.

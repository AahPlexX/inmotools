---
task: T-tactical-matchboard-studio-20261025-7d52
tool: tactical-matchboard-studio
doc: task
kind: fix
created: 2026-10-25
state: active
branch: arena/981e49e9-inmotools
spec: docs/superpowers/specs/2026-10-05-tactical-matchboard-studio-design.md
tracker: src/tools/tactics/TRACKER.md
updated: 2026-10-25
timestamp: 2026-10-25T19:12:52Z
agent: Arena.ai Agent Mode (model name not exposed)
validator: Arena.ai Agent Mode (same agent); focused GREEN passed; full owned acceptance pending
documentation: TMS-R52 contract and owner-authorized branch continuation
---

# TMS-R52 first-person player camera

## Request

> Continue work, you are permitted to push to the branch enabled in this chat, I will take care of it on my side— do not close the connector until I give specific permission to do so.

Standing quality, TDD, documentation, no-PR and metadata requirements remain recorded verbatim in [task 4d44](T-tactical-matchboard-studio-20261025-4d44.md). The latest request authorizes continuing on this fixed branch while the owner handles integration. No connector is to be closed or disconnected.

## Resume here

R52 implementation is ready for frozen acceptance; R44 remains unchanged. All 16 new units pass (22 including existing camera/runtime contracts); type/production/PWA build passes. Six new desktop/mobile contracts passed (12 cases), and the added level-capture regression passes both projects after its correction (2 cases); complete current four-spec acceptance is still pending. Next run full repository units/lint, canonical four-spec browser gate with one worker and unchanged timeouts/retries, then refresh exact results and push records. No further runtime edit is intended unless a gate identifies a defect. R52 stays partial until that acceptance; owner handles main integration and no connector is to be disconnected. After R52, continue R78, R75, R83.

## Workflow and source identity

- Baseline pushed head: `7699047992396ee95d00a3b14149a6617668379e`; main remains `fa4dd291c0b4556025a5e58f21e4268f6748e9d6` when inspected. The restored checkout initially had that main HEAD and 11 modified/untracked R44 files. All 11 matched the pushed branch byte-for-byte; they were staged, the index was verified equal to the remote tree, and the fixed branch was fast-forwarded without changing/discarding file content. The resulting baseline was clean.
- All work and explicit pushes stay on `arena/981e49e9-inmotools`. The owner handles main integration. No PR, branch rename/switch/new branch, connector disconnection, dependency/schema change or workflow/branch-check bypass is authorized. `task:start` is not executed because it would change branches; its task format is retained. The existing branch-name gate is still incompatible with the platform-fixed branch.
- Shared-file reason: owned unit/browser contracts plus generated task/index records support this Tactical-only requirement. No other tool, shell, dependency, shared helper or workflow is changed.
- No subagent or independent model review is claimed; the available agent identity is recorded truthfully. Automated validators are named with their actual evidence.

## R52 contract and decisions (before implementation)

- Opt-in **First-person player camera** in the existing lazy 3D controls; off by default. Use the same materialized presentation project, scene and playhead as 2D/3D, not a second animation or possession clock. Follow the selected visible roster-backed player token's sampled normalized position and authored rotation. Roster status does not exclude a visible person token (including substitutes and neutrals); ball/equipment are not player views.
- Map X to pitch length and normalized Y to world Z, with Y as eye height above the pitch. Heading 0° faces +X, 90° +Z, matching the existing vision/Three.js actor convention. Target is 10 m ahead horizontally without pitch-edge clamping or inferred look-at-ball intent. Normalize finite turns before trigonometry.
- Configured eye height defaults to **1.7 m**, editable within **0.1–3 m**; field of view defaults to **70°**, editable within the existing camera interval **10–120°**. These are authoring settings, not measured anatomy or a biomechanical model; owner may override. Invalid/empty drafts get accessible validation, no invalid camera or accidental capture.
- Respect sampled scene/layer/token visibility, including R33's exact substitution millisecond. If the selected player is absent/hidden or the selection is not a player, explain that first-person is unavailable and show the existing draft/authored camera; do not silently follow another token. Selection/visibility recovery resumes the opt-in view. A preset explicitly exits player-view mode; replacing/importing a project resets it.
- Lock orbit/pan/zoom while a live player camera is active so OrbitControls cannot move the eye away from the player or clamp its level heading. Keep player selection and existing keyboard/touch precision controls available. Omit only the viewer's own 3D actor to prevent self-occlusion; canonical/2D visibility remains unchanged.
- Keep settings ephemeral, outside project schema, history and JSON/ZIP. **Capture camera at playhead** explicitly snapshots the resolved position/target/FOV into existing camera states, with existing same-time replacement and undo/redo; it does not persist a live player binding. Turning player view off restores the existing orbit/draft/authored camera behavior.
- Preserve lazy loading, on-demand rendering, context-loss/error fallback, tab-visibility suspension and disposal. WebGL failure still leaves 2D and the accessible camera description usable. No predicted movement, automatic tracking, external service or library addition.

## Validation plan

1. Baseline focused Tactical units, type/build and existing 3D browser contract on unchanged source; keep environment failures separate.
2. RED before runtime: named geometry/visibility/sampling/immutability/settings/capture contracts plus desktop/mobile control contract; use fast-check and real Three.js camera math where applicable.
3. GREEN: cardinal/non-cardinal rotations, non-square pitches and edges, timed visibility/substitution, invalid input, OrbitControls lock, actual WebGL render, canonical edits/undo/redo, capture/JSON round-trip and ephemeral reset.
4. Stable checkpoint: repository units, TypeScript/production/PWA build, full lint, docs sync/check and `tool:check --base origin/main`; canonical owned four-spec browser scope, unchanged assertions/timeouts, one worker/zero local retries, keyboard/touch, 320/390/768 px reflow, 44 px targets and scoped axe. This is scoped requirement acceptance, not a full-product/release or hosted CI claim.
5. Commit/push each working step; keep this task, spec, tracker and handoff current. Task remains active for owner integration until actual integration evidence exists.

## Log

- timestamp: 2026-10-25T18:45:50Z | agent: Arena.ai Agent Mode (model name not exposed) | validator: repository/remote inspection and docs/completion check | documentation: Owner-authorized continuation recorded; baseline docs 193 pass; computed tool state 81/85 verified, 1 implemented, 1 partial, 2 missing. R44 accepted source and main are unchanged. Restored pinned pnpm 12.3.4 and exact-lockfile SheetJS archive via the immutable GitHub blob documented in task 4d44; external frozen installation succeeds in 8.9 s. Repository manifests/lockfile/patches are unchanged; cache-only dependency locator and verify-deps wrapper match the prior documented method.

## TDD baseline and RED

- timestamp: 2026-10-25T18:55:14Z | agent: Arena.ai Agent Mode (model name not exposed) | validator: Vitest 5.0.1 / TypeScript 7.0.2 / Vite 8.3.0 / PWA 1.3.0 | documentation: Baseline records-only `2fab4c5`, runtime still R44 `117c119`: all 211 Tactical units pass across 24 files (5.03 s); type and production/PWA build pass (15.66 s, 408 precache entries). Existing lazy-3D browser acceptance passes desktop/mobile, 2 passed / 0 skips / 0 retries, one worker, 16.3 s. Receipts `/home/user/inmotools-r52-baseline-{units,build,browser}.log`.
- timestamp: 2026-10-25T18:55:14Z | agent: Arena.ai Agent Mode (model name not exposed) | validator: Vitest RED contracts | documentation: Before any R52 runtime change, all **15 new unit cases fail** (715 ms), because `createPlayerCameraState`/`applyTactical3DCamera` do not exist. Contracts cover cardinal/wrapped/large finite headings, edge and non-square physical geometry (150 seeded cases), sampled pose/visibility, all roster statuses, exact substitution/layer time, invalid inputs/finite overflow, real Three.js eye/heading without orbit clamps, restoration, immutability and explicit capture/undo/redo/interchange. Receipt `/home/user/inmotools-r52-red-units.log`.
- timestamp: 2026-10-25T18:55:14Z | agent: Arena.ai Agent Mode (model name not exposed) | validator: Playwright RED / Chromium 153.0.8010.0 | documentation: New first-person render contract fails desktop/mobile at the absent First-person player camera control after successful import and existing 3D load: **2 failed**, no existing assertions or timeouts modified. Six new browser contracts are authored before runtime for sampled WebGL pose/orbit lock, visibility/substitution, canonical editing/capture/JSON, invalid drafts, keyboard/touch/reflow/axe and WebGL-unavailable fallback. RED artifacts copied under ignored `review-receipts/r52-red-browser/`. Receipt `/home/user/inmotools-r52-red-browser.log`.
- timestamp: 2026-10-25T18:55:14Z | agent: Arena.ai Agent Mode (model name not exposed) | validator: exact archive/browser smoke | documentation: Environment-only recovery uses the prior immutable SheetJS blob and matching lockfile SHA-512. Pinned Chromium package extracted to `/tmp/chromium`, bundled NSS/NSPR to `/tmp/al2023/lib`, with local revision-1243 launcher and software ANGLE/SwiftShader. Browser reports 153.0.8010.0; WebGL2 smoke returns true. This is not the official downloadable 153.0.8010.12 browser or hosted Node 24 CI. Dependencies, test config and lockfile stay unchanged.

## Implementation and focused GREEN

- timestamp: 2026-10-25T19:12:52Z | agent: Arena.ai Agent Mode (model name not exposed) | validator: unit/type/build and focused Playwright | documentation: Pure `createPlayerCameraState` derives a level metre-space camera from the shared snapshot; `applyTactical3DCamera` locks controls without moving/clamping the eye. UI adds opt-in settings and an accessible text equivalent; the viewer actor is omitted only from 3D. Capture/import/history continue using existing camera fields. Source remains Tactical-only, no dependency/schema/config change. Initial GREEN: 21 camera/runtime units pass; type/build pass; first browser batch 8 passed / 4 failed, with failures diagnosed below rather than labelled acceptance.
- timestamp: 2026-10-25T19:12:52Z | agent: Arena.ai Agent Mode (model name not exposed) | validator: focused browser diagnostics and additional RED | documentation: New test locator `getByLabel` exact matched option text rather than the existing accessible combobox, and ValidityState does not serialize its prototype properties. Corrected only the new evaluator to exact combobox role and direct `.validity.valid` reads, without changing expected values or existing assertions/timeouts. This then reproduced the real fractional-setting step mismatch (1 RED desktop case). Inputs now accept fractional settings (`step=any`); bounded keyboard stepping remains 0.1 m / 5°. The six new contracts then passed **12/12 desktop/mobile**, 1.9 min, one worker, no skips/retries. Receipts `/home/user/inmotools-r52-{first-green-browser,precision-red,focused-browser}.log`; initial artifacts retained under `review-receipts/r52-first-browser/` and `r52-precision-red/`.
- timestamp: 2026-10-25T19:12:52Z | agent: Arena.ai Agent Mode (model name not exposed) | validator: extra geometry and captured-render RED → GREEN | documentation: Added a 16th unit before correcting a partially lost direction at large finite world coordinates; heading representability now checks both intended components. Added a seventh browser contract before correcting OrbitControls' 0.015 rad near-horizon tilt of a captured level camera; its polar boundary now includes the horizon, preserving captured eye/heading exactly. Both regressions failed first, then pass: all **22/22 camera/runtime units** (653 ms); type/build **14.48 s / 408 precache entries**; level capture desktop/mobile **2 passed / 0 skipped / 0 retries** (18.2 s), with byte-identical before/after canvas PNGs. Latest camera binding ref is synchronized in a layout effect, not a new render-time ref write. Receipts `/home/user/inmotools-r52-{heading-red,capture-red,final-focused-units,final-build,capture-green}.log`; RED artifacts retained under `review-receipts/r52-capture-red/`.
- timestamp: 2026-10-25T19:12:52Z | agent: Arena.ai Agent Mode (model name not exposed) | validator: local static-analysis review | documentation: Focused new engine/unit contracts have no diagnostics; remaining owned-file warnings are existing debt. Unbound native-method and unsafe asymmetric-test matcher additions were corrected with unknown/narrowing and equivalent explicit numeric assertions. Canvas equality uses exact Buffer equality, not a pixel tolerance or weakened rendering oracle. No skip, retry override or timeout increase is introduced. Full fresh lint is still pending.

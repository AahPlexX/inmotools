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
timestamp: 2026-10-25T18:45:50Z
agent: Arena.ai Agent Mode (model name not exposed)
validator: Arena.ai Agent Mode (same agent; automated TDD and acceptance pending)
documentation: TMS-R52 contract and owner-authorized branch continuation
---

# TMS-R52 first-person player camera

## Request

> Continue work, you are permitted to push to the branch enabled in this chat, I will take care of it on my side— do not close the connector until I give specific permission to do so.

Standing quality, TDD, documentation, no-PR and metadata requirements remain recorded verbatim in [task 4d44](T-tactical-matchboard-studio-20261025-4d44.md). The latest request authorizes continuing on this fixed branch while the owner handles integration. No connector is to be closed or disconnected.

## Resume here

R44 remains locally verified and unchanged. Continue **R52**, then R78, R75 and R83. This task records the R52 contract before runtime code; next establish the focused baseline, write/run RED unit and browser contracts, then implement and validate on frozen inputs. TMS-R52 remains missing until runtime exists, and is not verified until its affected local acceptance passes. Hosted workflow-dispatch permission previously returned HTTP 403; no unchanged retry, CI/deployment success or main integration is claimed.

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

# glTF / GLB Optimizer Completion Design

> **Historical record (banner added 2026-10-05).** Written before the current workflow. Branches, pull requests, PR numbers and registration steps mentioned here (`src/catalog.ts` entries, `workspaces.tsx` loaders, `ToolSlug`, `.tasks/IN_PROGRESS.md`, `.tasks/config.json` IDs) are no longer used: tools register through `src/tools/<folder>/<slug>.meta.ts`, work starts with `pnpm task:start`, and pushes merge without pull requests ([AGENTS.md](../../../AGENTS.md)). Feature facts and evidence below stay valid as a record; current status is in the tool's tracker or task file.

**Status:** Approved for planning on 2026-09-28; product implementation still requires approval of the separate implementation plan.
**Baseline:** `origin/main` at `796f3afa371fba151cbcecb51889b135680998e7` (2026-09-28).
**Scope:** Finish and accurately describe the existing local-first GLB optimizer without replacing its architecture or adding runtime dependencies.

## Intent and constraints

The existing GLB Optimizer is a shipped catalog tool with working local inspection, geometry simplification, same-format texture resizing, preview, cancellation affordance, and download. The purpose of this completion pass is to make its user-visible claims trustworthy and its real processing/export contracts demonstrably safe, especially for files beyond the current one-triangle fixture.

Keep the existing React/Vite static application, glTF Transform and meshoptimizer pipeline, Three.js preview, browser-local file flow, installed dependencies, and source-format-preserving defaults. Do not alter unrelated tools, broad shared architecture, or the active Photo Studio worktree. Do not add speculative formats, remote services, authentication, or cloud storage. All input and output bytes remain on-device.

## User-facing contract

1. Accept self-contained binary glTF 2.0 `.glb` files. Validate the GLB 2 header and declared total length against the exact input length; require a first JSON chunk, 4-byte-aligned complete chunk framing with no truncation/trailing bytes, and valid JSON with `asset.version` equal to `2.0`. Permit a BIN chunk only in the valid position and multiplicity. Unknown chunk types may be inspected read-only but block rewriting unless their bytes can be proven preserved. Reject malformed containers with actionable status text; do not replace a valid current source with stale data after a failed replacement. External-resource `.gltf` packages remain unsupported and the input control/help must say so. This is container and required-field validation, not a full glTF schema validator.
2. Inspection is read-only. Report counts only when they are known; if extension preflight blocks parsing before geometry is decoded, show geometry counts as unavailable rather than as a misleading zero. Preserve the original source bytes throughout.
3. Before any transformation, identify extensions used/required. If unknown payloads cannot be safely round-tripped, block transformation and explain the reason. Continue to report supported preview blockers independently of transformation blockers.
4. Geometry simplification remains explicitly lossy below 100%. A successful run must be judged by actual measured results, not merely by requested target: report actual vertices/triangles and whether/why topology or error constraints prevented the requested reduction. Do not promise an exact target ratio.
5. Texture resizing keeps the input format by default and only applies if decoding, resizing, and encoding in the same MIME type all succeed. On failure, preserve the original texture and disclose the skip. Provide a separate explicit WebP-conversion opt-in; it is off by default, and user-facing text must disclose that a converted output uses `EXT_texture_webp` as a required extension with no PNG/JPEG fallback in the installed glTF Transform implementation. Add the extension only if at least one image was converted; report the exact count and require-compatible output. When a codec cannot encode WebP, preserve that image's original bytes/format and report the skip. Do not silently weaken the output extension policy.
6. Preserve non-geometry scene content and supported extension data through optimization; verify actual animation/channel and camera preservation with a meaningful non-empty animation fixture, not just counts for an empty list. Compare animation names, channels/targets and sampler data that the transform is expected to leave unchanged. Do not emit a result if preservation checks fail.
7. A downloadable result is a complete, parseable GLB built from the current source and current settings. Filename derives from the selected source, MIME is `model/gltf-binary`, and the source is never overwritten. Output must be re-inspected in tests; no partial or stale bytes may become downloadable.
8. Cancellation means the user can cancel a run and the UI immediately invalidates its result, shows a stable status, and never exposes partial/stale output. To make cancellation work while expensive processing is underway and keep the UI responsive, move the existing optimization operation into a local Web Worker. Worker messages carry a run identifier; cancellation terminates/invalidates the active worker so that late replies cannot win. If workers are unavailable, inspection and preview remain available but optimization is disabled with a clear explanation; there is no main-thread processing fallback. Do not claim in-place interruption of synchronous WASM work; worker termination is the cancellation boundary.
9. Preview remains optional and local. Keep the existing orbit, fit, wireframe, animation selection/play/pause, resize, and explicit disposal behavior. Preserve responsive layout, labels, visible focus, useful status/progress announcements, and all existing capabilities.
10. Tool metadata, UI copy, the older Tool 13 design, Task 9 plan, and `.tasks` state must describe the actual supported behavior; remove the stale claim that WebP conversion is already performed. Do not mark the tool complete until integrated validation evidence meets the completion contract.

## Proposed completion areas

A. Intake, replacement, and actionable malformed-file errors.
B. GLB container framing and JSON/asset validation.
C. Extension preflight and safe transform blocking.
D. Truthful inspection statistics, including unavailable counts when blocked.
E. Measured multi-triangle geometry reduction and target shortfall reporting.
F. Texture resize behavior, MIME fidelity, graceful skip, and explicit WebP conversion opt-in/required-extension compatibility.
G. Scene preservation, including non-empty animations and cameras.
H. Output GLB revalidation, correct suggested filename/MIME, and safe download.
I. Worker-backed cancellation, stale-run suppression, UI responsiveness, preview lifecycle, keyboard/a11y, and viewport reflow.
J. Accurate tool documentation and current repository task tracking.

## Architecture and data flow

The workspace retains file selection, UI state, revision checks, progress presentation, and browser download. The engine retains deterministic GLB parsing, extension policy, inspection/statistics, and optimization logic. A narrow worker client owns worker creation, message correlation, cancellation/termination, and cleanup; a Vite module-worker entry imports the engine and posts progress/result/error messages. Transfer or clone data only as required by structured-clone safety, and keep a pristine source snapshot for preview/retries. The worker must not access remote resources or DOM APIs unavailable in its context; texture-processing capability is feature-detected and unsupported paths preserve originals. WebP conversion creates and marks `EXT_texture_webp` required only when conversion succeeded for one or more images. The viewport stays on the main thread and keeps owning renderer and GPU-resource disposal.

If actual texture work cannot run in the worker because the required browser codec API is unavailable there, that format is reported skipped with original bytes preserved; do not silently move a long synchronous re-encode back onto the main thread. The implementation plan must identify the minimal compatibility behavior from verified browser support and existing test infrastructure.

## Validation and evidence

- Unit tests use generated, deterministic GLBs covering valid framing, declared-length mismatch, malformed/truncated/misaligned chunks, JSON/asset version, unknown-chunk and extension blockers, truthful unavailable stats, multi-triangle simplification, meaningful animation/camera preservation, MIME-preserving resize and opt-in WebP conversion/required-extension outcomes where reliably testable, worker cancellation/stale replies, and output re-inspection.
- Browser tests exercise invalid upload/replacement, successful optimization and current-settings invalidation, output download bytes/name/type, cancellation with no downloadable output, meaningful before/after metrics, responsive populated states, keyboard-reachable controls, and Axe checks. Tests that rely on timing must use controlled worker replies instead of arbitrary slow model processing.
- Run the existing focused glTF units first and capture the full unit/build baseline before product edits. Then run focused glTF units, `pnpm test:unit`, `pnpm build`, and the focused desktop/mobile Chromium glTF spec. Build immediately before Playwright because preview serves `dist`; if results seem stale, inspect the port-4173 process and existing preview reuse.
- No performance, standards-conformance, or full Khronos-validator claim is made unless the corresponding validator is explicitly run and its results are captured.

## Files expected to change (subject to plan)

- `src/tools/gltf/gltf-engine.ts` and a minimal worker/client seam under `src/tools/gltf/` for container/transform/cancellation contracts.
- `src/tools/gltf/GltfWorkspace.tsx` for worker lifecycle, truthful status and count presentation, and UX only where required.
- `src/tools/gltf/GltfViewport.tsx` only if verified preview/a11y/lifecycle regression is found.
- `src/catalog.ts` for inaccurate WebP/conversion/privacy copy.
- `tests/unit/gltf.test.ts`, `tests/e2e/gltf.spec.ts`, and E2E selector coverage only if needed.
- `.tasks/IN_PROGRESS.md`, then appropriate `.tasks/DONE.md` and `.tasks/WORK_LOG.md` only after the completion gates; possibly `.tasks/NEXT.md`/`BACKLOG.md` for accepted but excluded findings.
- `docs/superpowers/specs/2026-08-29-next-ten-local-tools-design.md` and `docs/superpowers/plans/2026-08-29-next-ten-local-tools.md` to reconcile stale Tool 13 / Task 9 history without pretending historical steps occurred in the earlier commit.

No production dependency or public route/catalog-registration changes are expected.

## Explicit exclusions and open decisions

- WebP conversion is not the default and has no legacy PNG/JPEG fallback in the installed glTF Transform extension. The opt-in output may not work in viewers that do not implement required `EXT_texture_webp`; the control's help must disclose this before running.
- Supporting standalone `.gltf` plus external assets, Draco decoding, KTX2 transcoding, or arbitrary unknown extensions is excluded.
- This is not a claim of complete Khronos glTF Validator conformance; the scope is robust GLB framing and the concrete invariants this tool needs before reading and writing.
- Geometry reduction is best-effort and lossy; unsupported topology/error constraints may leave output above the target. Report the measured outcome, never manufacture success.
- The task tracker has currently active unrelated workstreams. Any glTF task-state update must be additive and preserve their entries.

## Risks and mitigations

- A worker changes the bundling/runtime seam: keep protocol narrow, test worker messages and stale IDs, and avoid duplicate optimizer implementations.
- If workers are unavailable, optimization is unavailable rather than silently falling back to a blocking main-thread task; communicate and test that capability state.
- Full GLB checks may surface files accepted by the former partial parser; produce actionable errors and restrict checks to the documented GLB 2.0 container requirements.
- Simplifier results can vary within algorithmic constraints; assert valid measured reduction on a deterministic fixture but avoid a brittle exact percentage.
- Browser image codec output varies; assert source-MIME invariants and valid image signatures/dimensions where deterministic, and otherwise prove the original is retained and a skip is reported.
- Git worktrees share refs and metadata. The isolated branch is based on the verified tip and the original untracked probe is preserved; any later integration must re-check branch topology and use only repository-evidenced non-destructive mechanics.

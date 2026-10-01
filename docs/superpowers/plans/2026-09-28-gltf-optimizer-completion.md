# glTF / GLB Optimizer Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Complete the existing local-first GLB optimizer's validation, measurable optimization, explicit WebP option, cancellation, export and documentation contracts without changing its route or adding dependencies.

**Architecture:** Retain the current glTF Transform engine and Three.js viewport. Harden parsing and optimization with generated GLB unit fixtures; run optimization through a small module-worker client so cancellation terminates the computation; keep UI state, preview, and downloads in the workspace. Reconcile tool copy and historical planning records, and keep `.tasks` current through branch work and integration.

**Tech Stack:** React 19, TypeScript 7, Vite 8, Vitest 4, Playwright, `@gltf-transform/core` / `extensions` / `functions` 4.4.2, `meshoptimizer` 1.2.0, Three.js 0.185.1. No new dependency.

**Spec:** `docs/superpowers/specs/2026-09-28-gltf-optimizer-completion-design.md`

## Global Constraints

- Keep all input/output processing local; never upload model bytes.
- Preserve original bytes and source image formats by default; WebP is a separate explicit opt-in and requires `EXT_texture_webp` with no PNG/JPEG fallback.
- Treat geometry simplification below 100% as lossy and best-effort; report measured results rather than promising the requested ratio.
- Preserve supported scene content and extensions; unknown extensions/chunks that cannot be round-tripped safely block rewriting.
- Cancellation terminates/invalidates the worker; do not run optimization synchronously on the UI thread as a fallback.
- Do not add dependencies, change route/catalog registration, or touch unrelated tools/worktrees.
- Do not move a workstream to `.tasks/DONE.md` / `WORK_LOG.md` until all applicable completion gates and integration evidence pass.

## Review Focus

1. **Wrong or truncated GLB framing / false declared total length:** reject before parsing or transformation; unit cases cover malformed header, chunk boundary, alignment, ordering/multiplicity, and trailing bytes (Task 2).
2. **Unknown extension or chunk payload silently lost in serialization:** inspect without rewriting and expose a blocking reason; tests preserve source bytes and disable optimization (Task 2).
3. **Valid unknown-extension model displays zero geometry as fact:** distinguish unavailable counts from true zeros and keep catalog/UI/report wording aligned (Tasks 2 and 5).
4. **Simplifier reaches a topology/error limit or changes scene animation data:** validate actual triangle/vertex results and non-empty animation targets/samplers, not just requested settings or list counts (Task 3).
5. **Worker cancellation, late replies, unavailable APIs, or codec fallback exposes stale/bad output:** controlled worker tests plus browser cancellation/download checks prove no stale output; conversion must verify actual WebP MIME and extension requirements (Tasks 3–5).

---

## File Map

| File | Responsibility |
|---|---|
| `src/tools/gltf/gltf-engine.ts` | GLB structure/extensions, truthful metrics, same-format resize, optional WebP conversion, optimization and preservation checks. |
| `src/tools/gltf/gltf-worker-client.ts` | Correlate one optimization request, relay progress, cancel/terminate and ignore late replies. |
| `src/tools/gltf/gltf.worker.ts` | Execute the existing engine off-thread and return typed progress/result/error messages. |
| `src/tools/gltf/GltfWorkspace.tsx` | Keep source/settings/results coherent, invoke worker, explain availability and conversion compatibility, and offer only validated current output. |
| `src/catalog.ts` | Correct claims about texture conversion and output compatibility. |
| `tests/unit/gltf.test.ts` | Deterministic GLB fixtures and parser/optimizer regression coverage. |
| `tests/unit/gltf-worker-client.test.ts` | Fake-worker protocol, cancel, error, and stale-response coverage. |
| `tests/e2e/gltf.spec.ts` | User-visible invalid-input, conversion, cancellation, download, responsive and accessibility regression coverage. |
| `tests/unit/e2e-spec-selection.test.mjs` | Assert source changes select the focused glTF E2E spec. |
| `scripts/select-e2e-specs.mjs` | Existing glTF source mapping; modify only if the focused-selection assertion finds it missing. |
| `docs/superpowers/specs/2026-08-29-next-ten-local-tools-design.md` | Correct the historical Tool 13 description without rewriting its provenance. |
| `docs/superpowers/plans/2026-08-29-next-ten-local-tools.md` | Reconcile stale Task 9 claims/checklist and link the completion plan. |
| `.tasks/IN_PROGRESS.md`, `.tasks/DONE.md`, `.tasks/WORK_LOG.md` | Track active work now; record completion only after verified integration. |

## Task 1: Register active work and capture baseline

**Files:** Modify `.tasks/config.json` and `.tasks/IN_PROGRESS.md`; read-only baseline across the repository.

**Interfaces:** Adds `TASK-024: glTF / GLB Optimizer completion` without changing other active workstream entries. Product changes remain unauthorized until this plan and execution method are approved.

- [x] Reconfirm branch `feat/gltf-optimizer-completion`, base commit ancestry, worktree status, and the exact `origin/main` ref; preserve the other worktree lock metadata and the untracked `.probe-opencv/` in the Photo Studio checkout.
- [x] Insert a concise TASK-024 entry into `.tasks/IN_PROGRESS.md` describing the approved spec and completion gate, and advance `.tasks/config.json` `nextId` from 24 to 25.
- [x] Install the lockfile-exact dependencies in the isolated worktree with `pnpm install --frozen-lockfile`; confirm it completes without modifying `package.json` or `pnpm-lock.yaml`.
- [x] Run `pnpm exec vitest run tests/unit/gltf.test.ts` and `pnpm test:unit`; record baseline pass/fail counts and any unrelated failure signature in the active task entry before attributing later failures.
- [x] Run `pnpm build` and record its baseline result. Do not run Playwright before a fresh build.
- [x] Commit only the task-state start record as `docs(tasks): track gltf optimizer completion`.

## Task 2: Validate GLB framing and report known statistics

**Files:** Modify `src/tools/gltf/gltf-engine.ts`, `tests/unit/gltf.test.ts`, and (if required for accurate presentation) `src/tools/gltf/GltfWorkspace.tsx`.

**Interfaces:** Preserve `readGlbJson(input: Uint8Array): Record<string, any>` as the JSON accessor. Add an internal framing scanner returning the JSON plus encountered chunk metadata/blockers. Change `GltfStats.vertices` and `triangles` to `number | null` when unavailable; known JSON counts remain numbers. Extend inspection blockers without weakening existing unknown-extension / Draco policy.

- [x] Add generated-GLB tests named for header total-length mismatch, first/missing JSON chunk, truncated chunk header/payload, unaligned chunk length, invalid JSON/`asset.version`, invalid chunk ordering/duplicate BIN, missing BIN when the JSON buffer has no URI, and unknown trailing chunk blocking rewrite while inspection remains possible.
- [x] Run `pnpm exec vitest run tests/unit/gltf.test.ts`; confirm every new case fails for the specific missing validation, not because the fixture is malformed.
- [x] Implement strict GLB 2 container framing: header length equals input bytes; JSON is first and unique; each chunk header/payload is complete and four-byte aligned; optional BIN is in the valid next position and occurs at most once; if JSON declares an embedded first buffer without a URI, require the BIN chunk; unknown chunk types may be inspected but block serialization unless preservation is proven; JSON parses and declares `asset.version: "2.0"`.
- [x] Make preflight-blocked geometry counts explicitly unavailable (not zero) while retaining safe known mesh/primitive/texture/camera/animation counts. Render unavailable values clearly in every relevant metric/status location.
- [x] Run `pnpm exec vitest run tests/unit/gltf.test.ts`; confirm malformed inputs reject with specific actionable messages and existing fixtures/policies pass.
- [x] Commit as `fix(gltf): validate GLB container framing`.

## Task 3: Prove optimization, scene preservation, and texture policies

**Files:** Modify `src/tools/gltf/gltf-engine.ts`, `tests/unit/gltf.test.ts`, and focused UI copy in `src/tools/gltf/GltfWorkspace.tsx` as needed.

**Interfaces:** Extend `GltfOptimizeOptions` with `textureFormat: 'preserve' | 'webp'`; default missing/invalid option to `'preserve'`. Add report fields for converted texture count, measured geometry outcome/target shortfall, and preservation status. Keep `optimizeGlb(input, options, control)` and add no separate optimizer implementation.

- [x] Add a deterministic multi-triangle fixture and failing tests for measured reduction, original input immutability, valid output re-inspection, and best-effort behavior when the simplifier cannot meet the requested ratio.
- [x] Add a non-empty animation fixture targeting a node property and a camera fixture; assert names, channel targets/sampler semantics/accessor values, and camera preservation survive the output read/write cycle.
- [x] Add image fixtures with controlled codec behavior: same-format resizing keeps MIME; decode/encode failures retain original bytes and report a skip; unsupported browser APIs report a skip. Add WebP opt-in tests that assert actual encoded MIME before mutation, only count successful conversions, serialize `EXT_texture_webp` in both `extensionsUsed` and `extensionsRequired` only if at least one texture converted, and make WebP preview work in the bundled Three.js loader.
- [x] Run the new engine cases and confirm RED. Use injected/mocked codec functions only at the narrow codec seam; do not depend on platform-specific lossy image bytes.
- [x] Implement minimal measured before/after and preservation checks. Reject output on invariant mismatch. Compare non-empty animation names and channel/sampler targets against the input document while allowing buffer/accessor indices to be rewritten. Keep geometry shortfall informational and never fabricate the requested ratio.
- [x] Add an explicit opt-in checkbox/control, off by default, with visible pre-run help that converted output requires `EXT_texture_webp` and has no PNG/JPEG fallback; preserve same-format resize by default and disclose per-image skips.
- [x] Run `pnpm exec vitest run tests/unit/gltf.test.ts`; confirm reduction, animation, MIME, extension and re-inspection assertions pass.
- [x] Commit as `feat(gltf): verify optimization and texture outcomes`.

## Task 4: Move optimization into a cancellable local worker

**Files:** Create `src/tools/gltf/gltf-worker-client.ts`, `src/tools/gltf/gltf.worker.ts`, and `tests/unit/gltf-worker-client.test.ts`; modify `src/tools/gltf/GltfWorkspace.tsx`; test `src/tools/gltf/gltf-engine.ts` through the existing unit file.

**Interfaces:** Define discriminated worker messages with a numeric `requestId`: request `{ type: 'optimize', requestId, bytes, options }`; response `progress { requestId, value, stage }`, `completed { requestId, result }`, or `error { requestId, message }`. Export `GltfWorkerClient.run(bytes, options, onProgress): { promise: Promise<GltfOptimizeResult>; cancel(): void }` and `dispose(): void`. Cancellation terminates the active worker and rejects the pending promise with an `AbortError`; completion/error/cancel/dispose all settle the request at most once. The client creates the Vite module worker using the repository's `new Worker(new URL(..., import.meta.url), { type: 'module' })` pattern. Keep a copy of source bytes in the workspace; transfer only a separate copy if transferables are used.

- [x] Add fake-worker tests for successful result/progress correlation, mismatched request IDs, `onerror`/`messageerror`, post failure, cancellation/termination with `AbortError`, cancel-after-completion no-op, and late response after cancel ignored; confirm RED.
- [x] Implement the worker protocol and one-run client. Terminate the worker on completion, error, cancellation or disposal; settle pending requests on unexpected worker exits and posting failures; never accept a late or mismatched reply.
- [x] Route Optimize, settings invalidation, explicit cancel, and workspace unmount through the client. Invalidate result immediately on cancel and disable download. If `Worker` is unavailable, leave inspection/preview enabled, disable optimization, and explain that processing is unavailable rather than falling back to main-thread work.
- [x] Ensure progress/status remains announced and controls stay keyboard reachable. Keep preview and WebGL renderer on the UI thread; do not broaden worker ownership into preview.
- [x] Run `pnpm exec vitest run tests/unit/gltf-worker-client.test.ts tests/unit/gltf.test.ts`; confirm all protocol and engine cases pass.
- [x] Commit as `feat(gltf): run optimization in cancellable worker`.

## Task 5: Verify visible workflows and reconcile documentation

**Files:** Modify `tests/e2e/gltf.spec.ts`, `tests/unit/e2e-spec-selection.test.mjs`, `tests/unit/gltf-workspace.test.tsx`, `src/catalog.ts`, `docs/superpowers/specs/2026-08-29-next-ten-local-tools-design.md`, and `docs/superpowers/plans/2026-08-29-next-ten-local-tools.md`.

**Interfaces:** Keep route `#/tools/gltf-optimizer`, existing E2E selector behavior, and `downloadBytes` output type/name contract. Docs must distinguish historical initial implementation from current completion work and link this approved spec/plan.

- [x] Add the E2E-selector assertion that a `src/tools/gltf/` change selects `tests/e2e/gltf.spec.ts`; update the selector only if the assertion exposes a missing mapping.
- [x] Add browser cases for invalid/non-GLB upload feedback; valid model optimization with actual before/after metrics; settings invalidation; explicit WebP warning/default-off behavior; cancel leaves no download; and download event suggested filename, MIME type, and downloaded GLB magic/length/JSON parseability. Capture the Blob passed to `URL.createObjectURL` in the browser test to assert its MIME without adding a component-test dependency. Use a controlled worker test seam for cancellation rather than a timing-dependent heavy model.
- [x] Exercise populated workspace at phone portrait, landscape and tablet widths; assert no horizontal document overflow, keyboard access to optimizer and preview controls, and no serious/critical Axe violations.
- [x] Correct catalog privacy text to say parsing, same-format resizing/optional extension-aware conversion, preview and export remain local. Correct Tool 13 stale WebP wording and Task 9 stale implementation checklist without changing historical commit claims; link the completion plan.
- [x] Run focused selector, worker-client, and engine tests. Run `pnpm build` immediately before `pnpm exec playwright test tests/e2e/gltf.spec.ts`; both desktop and mobile Chromium projects must pass. If preview appears stale, inspect port 4173 before rerunning.
- [x] Commit as `test(gltf): verify output and local workflows` and `docs(gltf): reconcile optimizer behavior` (keep commits separated by concern).

## Task 6: Final evidence and integration handoff

**Files:** Update `.tasks/IN_PROGRESS.md`; after integration only, update `.tasks/DONE.md` and `.tasks/WORK_LOG.md`. No unrelated task files.

- [ ] Run `pnpm exec vitest run tests/unit/gltf.test.ts tests/unit/gltf-worker-client.test.ts tests/unit/e2e-spec-selection.test.mjs`, then `pnpm test:unit`, then `pnpm build`, recording actual results and unrelated baseline failures accurately.
- [ ] Rebuild and run `pnpm exec playwright test tests/e2e/gltf.spec.ts` on desktop and mobile Chromium; verify downloaded output through browser test bytes and verify responsive/Axe checks.
- [ ] Review the final diff for scope, accessibility, truthful copy, worker/resource cleanup, privacy, and `.tasks` freshness; run `git diff --check` and verify no product dependency or unrelated file change.
- [ ] Update TASK-024 with branch evidence, unresolved limitations and required integration mechanism; do not mark it DONE before the exact change is integrated and repository completion gates pass.
- [ ] Present the branch/PR and exact validation evidence for human integration approval. Do not force-push, rewrite shared history, or merge into `origin/main` without explicit authorization.
- [ ] After authorized integration, verify exact `origin/main` contains the changes, rerun applicable exact-main CI/Pages gates, and only then move TASK-024 to `.tasks/DONE.md` and summarize evidence in `.tasks/WORK_LOG.md`.

## Self-review Coverage Matrix

| Spec area | Plan task |
|---|---|
| Intake, malformed errors, GLB framing and required JSON | 2, 5 |
| Extension/chunk preflight and truthful unavailable stats | 2 |
| Measured, lossy, best-effort geometry optimization | 3, 5 |
| Same-format texture resize and explicit WebP compatibility | 3, 5 |
| Non-empty animation/camera and extension preservation | 3 |
| Current-source output validity, download name/type/MIME | 3, 5 |
| Worker cancellation, stale result invalidation, responsive UX/a11y | 4, 5 |
| Catalog/spec/plan copy and task-state accuracy | 1, 5, 6 |
| Full verification and exact-main integration | 1, 6 |

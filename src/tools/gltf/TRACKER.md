---
tool: gltf-optimizer
folder: src/tools/gltf
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-gltf-optimizer-design.md
tracker: src/tools/gltf/TRACKER.md
updated: 2026-10-05
---

# GLB Optimizer — tracker

## Resume here

74 requirements: 45 verified, 18 implemented, 8 partial, 3 missing, 0 prohibited. Next action: build the missing rows in the Open work order, starting with GLB-R69 (Draco decoding). No blocker.

## Documents

- Spec: [2026-10-05-gltf-optimizer-design.md](../../../docs/superpowers/specs/2026-10-05-gltf-optimizer-design.md)
- Older design and plans (history): [2026-09-28-gltf-optimizer-completion-design.md](../../../docs/superpowers/specs/2026-09-28-gltf-optimizer-completion-design.md), [2026-08-29-next-ten-local-tools-design.md](../../../docs/superpowers/specs/2026-08-29-next-ten-local-tools-design.md) (Tool 13), [2026-09-28-gltf-optimizer-completion.md](../../../docs/superpowers/plans/2026-09-28-gltf-optimizer-completion.md), [2026-08-29-next-ten-local-tools.md](../../../docs/superpowers/plans/2026-08-29-next-ten-local-tools.md)
- Task history: TASK-024 in [.tasks/DONE.md](../../../.tasks/DONE.md)
- Dark-theme contrast task: [T-repository-dark-contrast-20261004-b7d2](../../../.tasks/items/T-repository-dark-contrast-20261004-b7d2.md)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/gltf.test.ts`, `tests/unit/gltf-worker-client.test.ts`; fixtures `tests/fixtures/gltf-binary.ts`; browser tests: `tests/e2e/gltf.spec.ts`, `tests/e2e/accessibility.spec.ts`, `tests/e2e/app.spec.ts`

## Requirement status

`unit` = `tests/unit/gltf.test.ts`; `e2e` = `tests/e2e/gltf.spec.ts` unless another file is named.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| GLB-R01 | verified | e2e "binds optimized output to the current settings and exposes fit/preview controls" |  |
| GLB-R02 | implemented | Help text and `accept=".glb,model/gltf-binary"` in `GltfWorkspace.tsx` | No test chooses a `.gltf` file |
| GLB-R03 | verified | e2e "resets the preview model identity for a new source and reflows populated UI across target viewports" |  |
| GLB-R04 | implemented | `sourceRevisionRef` in `chooseFile`, `GltfWorkspace.tsx` | No test races two selections |
| GLB-R05 | implemented | `disabled={busy}` on `#gltf-file` | No test |
| GLB-R06 | verified | e2e "rejects a corrupt container without loading a model or offering optimization" |  |
| GLB-R07 | verified | unit "parses only a valid glTF 2.0 JSON chunk" |  |
| GLB-R08 | implemented | `readGlbContainer` in `gltf-engine.ts` | No test sets the header version |
| GLB-R09 | verified | unit "rejects a header whose declared total length disagrees with the file size" |  |
| GLB-R10 | verified | unit "rejects a document whose first chunk is not JSON", "rejects a second JSON chunk and a BIN chunk that appears twice or before the JSON chunk" |  |
| GLB-R11 | verified | unit "rejects a truncated chunk header and a chunk payload that runs past the declared length" |  |
| GLB-R12 | verified | unit "rejects a chunk length that is not four-byte aligned" |  |
| GLB-R13 | verified | unit "rejects invalid JSON and any asset version other than 2.0" |  |
| GLB-R14 | verified | unit "rejects a second JSON chunk and a BIN chunk that appears twice or before the JSON chunk" |  |
| GLB-R15 | verified | unit "requires a BIN chunk when the JSON declares an embedded first buffer without a URI" |  |
| GLB-R16 | implemented | `chooseFile` clears source, inspection and result before reading | Only a corrupt first file is tested |
| GLB-R17 | verified | unit "inspects original GLB bytes without invoking a transform or rewriting them" |  |
| GLB-R18 | implemented | Metric row in `GltfWorkspace.tsx` | No test reads these metrics |
| GLB-R19 | verified | unit "still reports real geometry counts for a readable model" |  |
| GLB-R20 | verified | unit "reports blocked geometry counts as unavailable rather than a misleading zero" |  |
| GLB-R21 | verified | e2e "blocks transformation when an unknown optional extension payload cannot be preserved" |  |
| GLB-R22 | verified | unit "classifies registered Khronos extensions separately from unknown payloads" |  |
| GLB-R23 | verified | e2e "blocks transformation when an unknown optional extension payload cannot be preserved"; unit "blocks unknown optional extensions before a read/write cycle can silently discard their payload" |  |
| GLB-R24 | verified | unit "inspects an unknown chunk but blocks rewriting because its payload cannot be guaranteed to survive" |  |
| GLB-R25 | partial | unit "preflights Draco as unsupported rather than trying to transform undecodable geometry" | The transform block is tested; the preview block has no test |
| GLB-R26 | implemented | `previewBlockers` in `inspectGlb` | No test |
| GLB-R27 | implemented | `previewBlocked` branch in `GltfWorkspace.tsx` | No test |
| GLB-R28 | verified | e2e "binds optimized output to the current settings and exposes fit/preview controls" |  |
| GLB-R29 | partial | e2e "binds optimized output to the current settings and exposes fit/preview controls" | Only the enabled state is tested; no test presses the button and checks the camera |
| GLB-R30 | implemented | `shouldReuseGltfCamera` and `cameraStateRef` in `GltfViewport.tsx` | The model key change is tested (GLB-R03); the camera position is not |
| GLB-R31 | implemented | `wireframe` effect in `GltfViewport.tsx` | No test |
| GLB-R32 | verified | e2e "binds optimized output to the current settings and exposes fit/preview controls" |  |
| GLB-R33 | implemented | Animation picker and `playing` state in `GltfViewport.tsx` | No test plays a clip in the preview |
| GLB-R34 | implemented | `loader.parse` error callback in `GltfViewport.tsx` | No test |
| GLB-R35 | implemented | `ResizeObserver`, `disposeScene` and the effect cleanup in `GltfViewport.tsx` | No test |
| GLB-R36 | partial | e2e "reports the measured geometry outcome instead of the requested target" | The test sets 0.5 and reads the resulting report; the label, step and help text are not asserted |
| GLB-R37 | partial | e2e "binds optimized output to the current settings and exposes fit/preview controls" | The test selects 4096 and 8192; the list and the default are not asserted |
| GLB-R38 | verified | unit "clamps lossy controls to supported bounds", "defaults to preserving source texture formats and never converts by default" |  |
| GLB-R39 | verified | e2e "leaves textures in their original format by default and discloses the WebP consequence before running" |  |
| GLB-R40 | verified | e2e "binds optimized output to the current settings and exposes fit/preview controls" |  |
| GLB-R41 | verified | e2e "cancels a running optimization without producing a downloadable result" |  |
| GLB-R42 | verified | unit "measures real polygon reduction and reports the achieved ratio" |  |
| GLB-R43 | verified | unit "does not claim a reduction that the simplifier could not achieve"; e2e "reports the measured geometry outcome instead of the requested target" |  |
| GLB-R44 | verified | unit "leaves geometry untouched and says so at a 100% target" |  |
| GLB-R45 | verified | unit "measures real polygon reduction and reports the achieved ratio" |  |
| GLB-R46 | verified | unit "resizes a texture only in its own MIME format and reports the count" |  |
| GLB-R47 | verified | unit "keeps the original texture and reports a skip when the browser cannot re-encode the source format" |  |
| GLB-R48 | verified | unit "reports a skip instead of failing when browser image APIs are missing" |  |
| GLB-R49 | implemented | `resizeBrowserTextures` in `gltf-engine.ts` | No test |
| GLB-R50 | verified | unit "converts to WebP only on explicit opt-in and requires EXT_texture_webp only when it converted something", "does not add a required extension when an opted-in WebP conversion produced nothing" |  |
| GLB-R51 | verified | unit "preserves a non-empty animation and its camera through the read/write cycle"; e2e "preserves cameras and animation targets and downloads a valid GLB with the expected name and type" |  |
| GLB-R52 | implemented | Preservation checks in `optimizeGlb` | No test can produce a mismatch |
| GLB-R53 | partial | unit "round-trips an uncompressed triangle while preserving cameras and source texture formats policy" | The test checks the report for a model without extensions; no test round-trips a registered extension payload |
| GLB-R54 | verified | e2e "cancels a running optimization without producing a downloadable result" |  |
| GLB-R55 | verified | e2e "cancels a running optimization without producing a downloadable result"; unit (`tests/unit/gltf-worker-client.test.ts`) "ignores a late reply that arrives after cancellation" |  |
| GLB-R56 | verified | unit (`tests/unit/gltf-worker-client.test.ts`) "rejects with the worker error message when the worker fails", "rejects when the worker reports an engine error", "rejects and releases the worker when the message cannot be cloned or posted" |  |
| GLB-R57 | verified | unit (`tests/unit/gltf-worker-client.test.ts`) "rejects pending work when disposed mid-run" |  |
| GLB-R58 | verified | e2e "disables optimization with an explanation when the browser has no Web Worker support"; unit (`tests/unit/gltf-worker-client.test.ts`) "refuses to start a run when the browser has no Worker support" |  |
| GLB-R59 | verified | e2e "reports the measured geometry outcome instead of the requested target" |  |
| GLB-R60 | partial | e2e "reports the measured geometry outcome instead of the requested target" | Only the Triangles value is asserted |
| GLB-R61 | implemented | `preview` state in `GltfWorkspace.tsx` | No test presses the toggle |
| GLB-R62 | verified | e2e "binds optimized output to the current settings and exposes fit/preview controls", "leaves textures in their original format by default and discloses the WebP consequence before running" |  |
| GLB-R63 | verified | e2e "preserves cameras and animation targets and downloads a valid GLB with the expected name and type" |  |
| GLB-R64 | verified | e2e "produces a downloadable file that is a valid GLB container with an intact scene" |  |
| GLB-R65 | verified | unit "re-reads its own output as a valid GLB built from the current source" |  |
| GLB-R66 | verified | e2e (`tests/e2e/app.spec.ts`) "every registered suite opens with guidance, privacy status, and a usable workspace" |  |
| GLB-R67 | implemented | `gltf-engine.ts`, `gltf.worker.ts` and `GltfWorkspace.tsx` make no network call; privacy text in `gltf-optimizer.meta.ts` | No test blocks the network |
| GLB-R68 | implemented | `role="status"` and `aria-label="GLB optimization progress"` in `GltfWorkspace.tsx` | Axe passes on the populated workspace (GLB-R74); announcements are not tested |
| GLB-R69 | missing | — | Today the model is blocked (GLB-R25); no Draco decoder is bundled |
| GLB-R70 | missing | — | The preview is disabled today (GLB-R26) |
| GLB-R71 | missing | — | Only self-contained `.glb` is accepted (GLB-R02) |
| GLB-R72 | partial | `.tasks/items/T-repository-dark-contrast-20261004-b7d2.md` | The route is not among the dark-theme failures listed in that task; no test stores a theme and loads a model |
| GLB-R73 | partial | e2e "resets the preview model identity for a new source and reflows populated UI across target viewports" | Tested at 390 × 844, 844 × 390 and 768 × 1024 only |
| GLB-R74 | verified | e2e "resets the preview model identity for a new source and reflows populated UI across target viewports"; e2e (`tests/e2e/accessibility.spec.ts`) "has no serious or critical axe violations at <route>" |  |

## Open work

1. GLB-R69 Draco decoding; GLB-R70 KTX2 transcoding; GLB-R71 external-resource `.gltf` packages.
2. GLB-R72 dark-theme check with a model loaded; GLB-R73 widths 320, 1920 and 2560 px.
3. GLB-R25 preview block test; GLB-R29 Fit model to view click test.
4. Tests for the `implemented` rows: Show before / Show after, Wireframe, animation playback, preview failure alert, resource release, skipped textures, camera and animation mismatch, network isolation.

## Known limitations

- Simplification is lossy; topology or error limits can leave the result above the target, and the report says so.
- Converted WebP output requires viewers that implement `EXT_texture_webp`; conversions the browser cannot encode are skipped and reported.
- Draco, KTX2 and external-resource models cannot be optimized or previewed (GLB-R25, GLB-R26, GLB-R02).
- This is container and required-field validation, not a full Khronos glTF Validator run.
- Very large models are bounded by browser memory.

## Verification evidence

- 2026-10-05, `expand/gltf-optimizer` from `main` @ `c371f847`: `pnpm tool:check gltf-optimizer --base origin/main` 45/74, no errors; `pnpm docs:sync` and `pnpm docs:check` passed; `pnpm exec vitest run tests/unit/cad-progress.test.ts tests/unit/sheets-wave-b.test.ts tests/unit/deployment-config.test.ts` passed.

## Change log

- 2026-10-05 — Created: 74 requirements as built at `c371f847`.

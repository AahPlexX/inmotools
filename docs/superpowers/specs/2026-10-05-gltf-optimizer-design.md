---
tool: gltf-optimizer
folder: src/tools/gltf
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-gltf-optimizer-design.md
tracker: src/tools/gltf/TRACKER.md
updated: 2026-10-05
---

# GLB Optimizer — spec

As built at `origin/main` `c371f847`. Requirement prefix: `GLB`. Status of each requirement: [TRACKER.md](../../../src/tools/gltf/TRACKER.md). History: [2026-09-28-gltf-optimizer-completion-design.md](2026-09-28-gltf-optimizer-completion-design.md), the Tool 13 section of [2026-08-29-next-ten-local-tools-design.md](2026-08-29-next-ten-local-tools-design.md), plans [2026-09-28-gltf-optimizer-completion.md](../plans/2026-09-28-gltf-optimizer-completion.md) and [2026-08-29-next-ten-local-tools.md](../plans/2026-08-29-next-ten-local-tools.md).

## Purpose

Inspect a self-contained GLB, reduce its geometry with topology-aware simplification, resize oversized textures in their own format (or convert to WebP on request), compare the original and the result in an orbit viewport and download a new GLB, for 3D web developers, technical artists and performance teams, without uploading the model.

## Scope

In scope:
- Reading binary glTF 2.0 (`.glb`) files with container validation and extension preflight.
- Read-only inspection, statistics and an orbit preview with wireframe and animation playback.
- Geometry simplification, texture resizing and opt-in WebP conversion in a cancellable Web Worker.
- A before/after comparison, an optimization report and download of the optimized GLB.
- Decoding Draco and KTX2 content and opening external-resource `.gltf` packages, as requirements not yet built.

Out of scope: nothing is excluded beyond the platform rules.

## Constraints

- Platform rules: no accounts or authentication; no server or server-side database (static files on GitHub Pages); everything runs in the browser and model data stays in this browser; network use only for the site's own files ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- No large language models; other ML only on the device under the ML ruleset.
- WebAssembly runs single-threaded: GitHub Pages cannot send COOP/COEP headers. Large models are bounded by browser memory.
- Libraries as pinned in `package.json`: `@gltf-transform/core`, `extensions` and `functions` 4.5.1, `meshoptimizer` 1.2.0, `three` 0.185.1.
- Geometry reduction below 100% is lossy and best-effort; the result is reported from measured triangle counts.
- The installed glTF Transform WebP writer cannot emit a PNG/JPEG fallback, so converted output requires `EXT_texture_webp`.
- The slug, route, file names (`<name>.optimized.glb`) and accessible names are not changed.

## Requirements

### Loading and container validation

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| GLB-R01 | A self-contained binary GLB is chosen with the file input (Binary GLB model); the status reports "Loaded original bytes unchanged" with mesh, triangle and camera counts | Choose a valid `.glb`; the status line shows the counts |
| GLB-R02 | External-resource `.gltf` packages are not accepted and the control says so | The help text under the file input states it; a `.gltf` JSON file is rejected |
| GLB-R03 | Choosing another file replaces the previous model, inspection, result and preview; the preview model identity restarts for the new source | Load `first.glb` then `second.glb`; the model key changes from `source-1` to `source-2` |
| GLB-R04 | A slower read of an earlier selection never replaces a newer selection (revision check) | Select file A then file B before A finishes; B stays loaded |
| GLB-R05 | The file input is disabled while a file is being inspected or optimized | During Optimize the file input is disabled |
| GLB-R06 | A corrupt container shows "GLB inspection failed" with the reason in the error style, and creates no metrics, optimize or download controls and no preview | Load a GLB whose header length is wrong; only the error status is shown |
| GLB-R07 | A file that is too small or lacks the GLB magic number is rejected | `readGlbJson` on 24 zero bytes throws |
| GLB-R08 | A GLB header version other than 2 is rejected with "Only glTF 2.0 GLB files are supported" | A header with version 1 is refused |
| GLB-R09 | The header length must equal the file size; a truncated or padded file is rejected | Drop the last 4 bytes, or declare 9999 bytes; both are refused |
| GLB-R10 | The first chunk must be the JSON chunk and there must be exactly one JSON chunk | A BIN-first file and a two-JSON file are refused |
| GLB-R11 | A truncated chunk header or a chunk payload running past the declared length is rejected | A 19-byte file and a BIN chunk declaring the whole file length are refused |
| GLB-R12 | A chunk length that is not four-byte aligned is rejected | A 21-byte JSON chunk is refused with an alignment message |
| GLB-R13 | Invalid JSON, a missing asset, or an `asset.version` other than 2.0 is rejected | `{ not json`, `asset.version` 1.0 and a document without `asset` are each refused |
| GLB-R14 | At most one BIN chunk is allowed and it must follow the JSON chunk | A file with two BIN chunks is refused |
| GLB-R15 | A JSON that declares an embedded first buffer without a URI requires a BIN chunk | An embedded buffer with no BIN chunk is refused; with a BIN chunk it is accepted |
| GLB-R16 | A rejected replacement file leaves no previous model, controls or preview in the workspace | Load a valid file, then a corrupt one; the metrics, controls and preview are gone and the error is shown |

### Inspection

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| GLB-R17 | Inspection is read-only: the source bytes are not changed or rewritten | `inspectGlb` leaves the input array equal to a copy taken before |
| GLB-R18 | The loaded model shows original bytes, meshes, cameras, animations and textures | Load a model; the five metrics show its values |
| GLB-R19 | Vertex and triangle counts are read from the decoded model | A one-triangle model reports 3 vertices and 1 triangle |
| GLB-R20 | When the model cannot be decoded for a stated reason, vertex and triangle counts show "not available" instead of zero | A model with an unknown extension reports null geometry counts and the UI prints "not available" |
| GLB-R21 | The Extension and texture preflight panel lists extensions used, required, registered, unknown, the transform policy and the image formats | Open the panel for a model with `VENDOR_unknown_payload`; it is listed as unknown and the policy reads "blocked to preserve unknown payloads" |
| GLB-R22 | Registered Khronos extensions are classified separately from unknown extensions | `KHR_materials_unlit` is supported, `VENDOR_custom` is unsupported |
| GLB-R23 | An unknown extension blocks optimization, names the extension, and disables Optimize GLB; inspection still works | Load a model using `VENDOR_unknown_payload`; Optimize GLB is disabled and an alert names it |
| GLB-R24 | An unknown GLB chunk type blocks optimization while inspection still works and the bytes stay unchanged | A GLB with a vendor chunk is inspected; `optimizeGlb` refuses it |
| GLB-R25 | A model using `KHR_draco_mesh_compression` blocks optimization and preview with a message that no Draco decoder is bundled | A Draco model shows the message, Optimize GLB is disabled and the preview is replaced by a notice |
| GLB-R26 | A model using `KHR_texture_basisu` disables the preview with a message and can still be optimized with the texture unchanged | A KTX2 model shows the notice and Optimize GLB stays enabled |
| GLB-R27 | When a preview blocker exists, the preview is replaced by a notice that the source is untouched | A Draco model shows "Preview disabled" instead of the canvas |

### Preview

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| GLB-R28 | The loaded model is drawn in an interactive orbit viewport (rotate, zoom, pan with damping) | After loading, the viewport exists and Fit model to view becomes enabled |
| GLB-R29 | Fit model to view re-frames the model | Orbit away, press Fit model to view; the whole model is in view |
| GLB-R30 | Switching between original and optimized views of one model keeps the camera position; a new source starts from a fitted view | Orbit, press Show after; the camera is unchanged. Load another file; the view is fitted |
| GLB-R31 | The Wireframe checkbox switches the model to wireframe rendering | Tick Wireframe; the mesh materials render as wireframe |
| GLB-R32 | A model without animations shows "No animations in this model." | Load a triangle model; the message is shown |
| GLB-R33 | A model with animations offers a Preview animation picker and a Play/Pause animation button that plays the chosen clip | Load an animated model, choose a clip, press Play animation; the clip plays and the button reads Pause animation |
| GLB-R34 | A model the browser cannot decode shows a "GLB preview failed" alert and the source stays unchanged | A preview parse error shows the alert |
| GLB-R35 | The viewport resizes with its container and releases geometry, materials, textures, renderer and controls when the model changes or the workspace closes | Resize the window; the canvas follows. Switch models; no GPU resources remain |

### Settings

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| GLB-R36 | Target polygon ratio slider runs from 5% to 100% in 5% steps, shows the percentage, and states that values below 100% are lossy | Move the slider to 50%; the label reads 50% and the help says it is lossy |
| GLB-R37 | Maximum texture dimension is chosen from 512, 1024, 2048, 4096 and 8192 px (default 2048) | Open the select; the five sizes are listed and 2048 is selected |
| GLB-R38 | Option values are clamped to the supported range (ratio 0.05–1, texture 64–8192 px) and the texture format defaults to preserve | `clampGltfOptions` with ratio 4 and texture 16 returns ratio 1 and 64 px |
| GLB-R39 | Convert textures to WebP is an opt-in checkbox, off by default, with the EXT_texture_webp consequence (required extension, no PNG/JPEG fallback) stated before running | The checkbox is unchecked and the help text names EXT_texture_webp and the missing fallback |
| GLB-R40 | Changing the ratio, texture size or WebP setting cancels any running optimization, discards the result, disables download and says so | After an optimization, select another texture size; Download is disabled and the status says the settings changed |

### Optimization

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| GLB-R41 | Optimize GLB runs in a local Web Worker with a labelled progress bar and stage text, and never on the page thread | Press Optimize GLB; a progress bar is shown while the worker runs |
| GLB-R42 | Geometry is simplified (weld, mesh simplification, dedup) toward the target ratio when the target is below 100% | A 16 × 16 grid at 50% has fewer triangles afterwards |
| GLB-R43 | The reported geometry result is the measured triangle ratio; a shortfall against the target is disclosed | A target the simplifier cannot reach reports the measured ratio and a best-effort note; the status shows a measured percentage |
| GLB-R44 | A 100% target leaves geometry untouched and says so | Triangle counts are equal and the stage reads "Geometry unchanged (100% target)" |
| GLB-R45 | The original file is never modified; optimization works on a copy | The input array equals its pre-run copy |
| GLB-R46 | Oversized PNG, JPEG and WebP textures are resized to the maximum dimension in their own format and the count is reported | A 2048 × 1024 PNG at a 1024 cap becomes a resized PNG; resized count 1, converted 0 |
| GLB-R47 | A texture the browser cannot re-encode in its own format keeps its original bytes and the skip is listed in the report | A codec that returns WebP for a PNG leaves the PNG and lists a skip |
| GLB-R48 | When the browser has no image or canvas APIs, textures are kept and a skip is reported instead of failing | Without `createImageBitmap` and `OffscreenCanvas` the run completes with a skip |
| GLB-R49 | Unsupported or unknown image formats, canvas-less contexts and decode failures leave the texture unchanged and are listed as skipped | A texture with an unknown MIME type is listed as skipped |
| GLB-R50 | With WebP conversion on, converted textures are stored as WebP and EXT_texture_webp is added as a required extension only when at least one texture converted | Converting one PNG adds the required extension; a run that converts nothing adds none |
| GLB-R51 | Cameras and animations (count, names, channel targets, samplers) are preserved and the report shows each check | An animated model with a camera reports all three preservation checks as yes |
| GLB-R52 | A run whose camera or animation check fails produces no output | A changed camera or animation count ends in an error and no result |
| GLB-R53 | Registered extensions are preserved through optimization and listed in the report; unknown extensions are blocked before the run | The report lists preserved extensions and "unknown extensions none detected" |
| GLB-R54 | Cancel optimization stops the run by terminating the worker, discards the result, disables download and reports the cancellation | Press Cancel optimization during a run; the status says canceled and Download stays disabled |
| GLB-R55 | A reply from a canceled or superseded run is never accepted | Release the gated worker reply after cancel; the result stays empty |
| GLB-R56 | A worker error, an engine error, an unreadable message or a failed post ends the run with "Optimization failed" and the reason, and releases the worker | A worker error event rejects the run with its message |
| GLB-R57 | Closing the workspace cancels an in-flight run and releases the worker | Dispose the client during a run; the run rejects |
| GLB-R58 | Without Web Worker support, Optimize GLB is disabled with an explanation while inspection and preview stay available | Delete `window.Worker`; the notice is shown, Optimize GLB is disabled and Fit model to view is enabled |

### Results and export

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| GLB-R59 | After a run the status reports the result triangles, the measured percentage of the original, the output size with the percentage smaller or larger, and the textures resized or converted | Optimize a grid model; the status shows "% of the original" |
| GLB-R60 | The metric row shows the shown version (before or after), its bytes, triangles, vertices and cameras | Optimize, then read the row for both views |
| GLB-R61 | Show before / Show after switches the viewport and metrics between the original and the optimized model; the optimized view is shown when a run finishes | After a run the view is "after"; the button switches it back |
| GLB-R62 | The Optimization report lists the settings, the geometry result, stages, textures resized and converted, the preservation checks, preserved extensions and each skipped texture | Open the report after a run; each line is present |
| GLB-R63 | Download optimized GLB saves `<source name>.optimized.glb` as `model/gltf-binary`, is enabled only for the current result when no run is active, and the status says the original was not modified | Download after a run; the file name and type match and the status confirms |
| GLB-R64 | The downloaded file is a complete GLB container (magic, version 2, declared length equals size, JSON first, BIN chunk) with meshes, scenes and accessors | Read the downloaded bytes and parse the header and JSON |
| GLB-R65 | The optimized output can be inspected again as a valid GLB built from the current source | `inspectGlb` on the result has no blockers and one mesh |

### Site and catalog

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| GLB-R66 | The route `#/tools/gltf-optimizer` opens the workspace with guidance and the privacy statement | Open the catalog link and the route |
| GLB-R67 | Model bytes and textures are processed on this device and never uploaded; the workspace makes no network request for them | Optimize a model with the network blocked |
| GLB-R68 | The status line is a live region, the progress bar is labelled and every control has a visible label | A screen reader announces status changes; axe reports no missing names |

### Compressed and external resources

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| GLB-R69 | A model compressed with `KHR_draco_mesh_compression` is decoded in the browser so it can be previewed and optimized | Load a Draco-compressed GLB; the preview shows and Optimize GLB is enabled |
| GLB-R70 | A model with KTX2 (`KHR_texture_basisu`) textures is previewed by transcoding in the browser | Load a KTX2 GLB; the textures show in the preview |
| GLB-R71 | A standalone `.gltf` file is opened together with its external `.bin` and image files chosen in the same selection | Select a `.gltf`, its `.bin` and images; the model loads |

## Non-functional requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| GLB-R72 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) and passes the colour-contrast check in dark | With each theme stored, the workspace uses it; `E2E_THEME=dark` axe on `#/tools/gltf-optimizer` has no `color-contrast` violation |
| GLB-R73 | No horizontal page overflow at any width from 320 to 2560 px | Overflow ≤ 1 px at 320, 390, 768, 844, 1440, 1920 and 2560 px with a model loaded |
| GLB-R74 | No serious or critical axe violations on the workspace | axe on `#/tools/gltf-optimizer` with and without a loaded model reports none |

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Technique decisions

None: no function was compared between an ML and a non-ML method.

## Intent not recorded

None.

## Change log

- 2026-10-05 — Created: 74 requirements as built at `c371f847`.

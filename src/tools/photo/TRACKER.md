---
tool: photo-studio
folder: src/tools/photo
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-photo-studio-design.md
tracker: src/tools/photo/TRACKER.md
updated: 2026-10-05
---

# Photo Studio — tracker

## Resume here

270 requirements: 192 verified, 48 implemented, 5 partial, 22 missing, 3 prohibited. Next action: build the `missing` rows in Open work, then add tests for the `implemented` rows.

## Documents

- Spec: [2026-10-05-photo-studio-design.md](../../../docs/superpowers/specs/2026-10-05-photo-studio-design.md)
- Older design records: [2026-09-11 design](../../../docs/superpowers/specs/2026-09-11-photo-studio-design.md), [2026-09-12 capability expansion](../../../docs/superpowers/specs/2026-09-12-photo-studio-capability-expansion.md)
- Plans: [2026-09-11](../../../docs/superpowers/plans/2026-09-11-photo-studio.md), [2026-09-12](../../../docs/superpowers/plans/2026-09-12-photo-studio-capability-expansion.md)
- Older ledger: [.tasks/PHOTO_STUDIO.md](../../../.tasks/PHOTO_STUDIO.md)
- Task: `.tasks/items/T-photo-studio-20261005-aa18.md`
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Tests: `tests/unit/photo*.test.ts`, `tests/e2e/photo*.spec.ts`

## Requirement status

`e2e` = `tests/e2e/photo*.spec.ts`; `unit` = `tests/unit/photo*.test.ts`.

### Input and sources

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| PHS-R01 | verified | e2e "opens a dropped image through the shared import target" |  |
| PHS-R02 | verified | e2e "opens a clipboard image when direct clipboard reading is available", "opens an image pasted while focus is outside the Photo Studio root", "clipboard denial explains the fallback without replacing the active edit", "explains the fallback when direct clipboard reading is unavailable" |  |
| PHS-R03 | partial | e2e "routes the progressive camera input through the same importer" | [awaiting physical testing by human] Phone with a camera, any mobile browser: tap the camera input, take a photo; expected: it opens as the active photo. |
| PHS-R04 | verified | e2e "loads a local photo, edits, compares, undoes, and opens export" |  |
| PHS-R05 | verified | e2e "TIFF shares preview, comparison, export and durable recovery while preserving original source bytes", "Deflate TIFF decodes through the browser worker"; unit "retains exact 16-bit samples until the disclosed 8-bit raster conversion", "uses only the first page, even when the next directory cycles" |  |
| PHS-R06 | verified | e2e "RAW DNG imports through the actual worker and retains its original source through recovery and export"; unit "decodes actual Bayer samples through LibRaw into an owned 16-bit intermediate" |  |
| PHS-R07 | verified | e2e "embedded RAW preview (<format>) is temporary and preserves the document until <terminal>" |  |
| PHS-R08 | verified | e2e "RAW development controls are source-gated and survive undo, recovery and pixel export", "RAW exposure brightens before demosaic and is reset independently"; unit "RAW exposure EV shifts sensor data before demosaic in both directions without changing input bytes" |  |
| PHS-R09 | verified | unit "summarises camera, capture, location, and embedded profile facts" |  |
| PHS-R10 | verified | e2e "original file details and the duplicate prompt use the source itself" |  |
| PHS-R11 | verified | e2e "batch export queues multiple local files and reports per-file completion"; unit "processes files strictly sequentially and consumes each result before moving on" |  |
| PHS-R12 | verified | e2e "original file details and the duplicate prompt use the source itself"; unit "fingerprints are SHA-256 hex of the bytes" |  |
| PHS-R13 | missing | — |  |

### Projects, variants and history

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| PHS-R14 | verified | e2e "recovers an autosaved source and recipe after reload"; unit "saves serializable metadata in IndexedDB and the source in OPFS when available", "falls back to the IndexedDB blob store when OPFS writing is unavailable" |  |
| PHS-R15 | verified | e2e "recovers an autosaved source and recipe after reload" |  |
| PHS-R16 | verified | e2e "saves, loads, and deletes a named local project while reporting storage honestly" |  |
| PHS-R17 | verified | e2e "saves, loads, and deletes a named local project while reporting storage honestly"; unit "classifies quota failures and does not leave an orphaned source" |  |
| PHS-R18 | verified | e2e "virtual copies share a source while keeping independent editable histories"; unit "creates virtual copies with independent edits and snapshots while sharing the immutable source" |  |
| PHS-R19 | verified | e2e "virtual copies share a source while keeping independent editable histories", "saves, loads, and deletes a named local project while reporting storage honestly" |  |
| PHS-R20 | implemented | — |  |
| PHS-R21 | verified | e2e "a deleted local project can be restored with undo" |  |
| PHS-R22 | verified | e2e "creates, edits, exports, imports, applies, and removes local user presets" |  |
| PHS-R23 | implemented | e2e "creates, edits, exports, imports, applies, and removes local user presets" | The cited test covers rename, delete, import and export; duplicate is not covered |
| PHS-R24 | verified | e2e "snapshots can be renamed, duplicated, compared, and deleted" |  |
| PHS-R25 | verified | e2e "snapshots can be renamed, duplicated, compared, and deleted" |  |
| PHS-R26 | verified | e2e "snapshots can be renamed, duplicated, compared, and deleted" |  |
| PHS-R27 | verified | unit "migrates a legacy version-zero project into the current schema", "a recipe with no layers field normalizes to an empty stack and renders byte-identical to before layers existed" |  |
| PHS-R28 | verified | e2e "named snapshots save and restore a user-labelled recipe state" |  |
| PHS-R29 | implemented | — |  |
| PHS-R30 | verified | e2e "keyboard undo and redo work without pointer-only interaction"; unit "history undo and redo preserve recipe revisions" |  |
| PHS-R31 | implemented | — |  |
| PHS-R32 | missing | — |  |

### Comparison, inspection and proofing

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| PHS-R33 | verified | e2e "split comparison has a draggable and keyboard-adjustable boundary" |  |
| PHS-R34 | verified | e2e "side-by-side comparison keeps before and after at the same zoom" |  |
| PHS-R35 | verified | e2e "holding backslash or the button shows the original, and the 100% view renders actual pixels" |  |
| PHS-R36 | verified | e2e "side-by-side comparison keeps before and after at the same zoom" |  |
| PHS-R37 | verified | e2e "inspection scopes, overlays, pinned samples, background, and navigator use the rendered preview" |  |
| PHS-R38 | verified | e2e "RGB histogram, clipping warnings, and color sampler inspect the rendered preview"; unit "reports stable RGB, HSL and hexadecimal values" |  |
| PHS-R39 | verified | e2e "ICC assign, convert, proof, gamut, and proof-aware sampling stay distinct" |  |
| PHS-R40 | verified | e2e "inspection scopes, overlays, pinned samples, background, and navigator use the rendered preview"; unit "maps image position and luminance into deterministic waveform bins" |  |
| PHS-R41 | verified | e2e "inspection scopes, overlays, pinned samples, background, and navigator use the rendered preview"; unit "keeps RGB parade channels independent and maps neutral chroma to vectorscope center" |  |
| PHS-R42 | verified | e2e "inspection scopes, overlays, pinned samples, background, and navigator use the rendered preview"; unit "keeps RGB parade channels independent and maps neutral chroma to vectorscope center" |  |
| PHS-R43 | verified | e2e "inspection scopes, overlays, pinned samples, background, and navigator use the rendered preview"; unit "creates deterministic focus and exposure overlays without changing source pixels" |  |
| PHS-R44 | verified | e2e "inspection scopes, overlays, pinned samples, background, and navigator use the rendered preview"; unit "bins exposure in stops around 18 percent middle gray" |  |
| PHS-R45 | verified | e2e "ICC assign, convert, proof, gamut, and proof-aware sampling stay distinct" |  |
| PHS-R46 | verified | e2e "inspection scopes, overlays, pinned samples, background, and navigator use the rendered preview" |  |
| PHS-R47 | verified | e2e "inspection scopes, overlays, pinned samples, background, and navigator use the rendered preview" |  |
| PHS-R48 | verified | e2e "inspection scopes, overlays, pinned samples, background, and navigator use the rendered preview" |  |
| PHS-R49 | verified | e2e "RGB histogram, clipping warnings, and color sampler inspect the rendered preview"; unit "histogram accounts for every pixel" |  |
| PHS-R50 | verified | e2e "RGB histogram, clipping warnings, and color sampler inspect the rendered preview" |  |

### Crop, composition and geometry

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| PHS-R51 | verified | e2e "geometry, detail, and local tools produce reversible recipe state" |  |
| PHS-R52 | implemented | — |  |
| PHS-R53 | partial | — | 1:1, 4:3, 3:2 and 16:9 exist; 4:5, 9:16, 5:7 and 8:10 are missing |
| PHS-R54 | verified | e2e "custom crop ratio applies a centered 5:4 frame to a 4:3 photo" |  |
| PHS-R55 | verified | e2e "direct crop handles commit one undoable crop change and expose composition guides" |  |
| PHS-R56 | verified | e2e "direct crop resize and movement use source coordinates at zoom and commit one undo step" |  |
| PHS-R57 | verified | e2e "composition <mode> stays registered and never alters edited pixels" |  |
| PHS-R58 | verified | e2e "composition <mode> stays registered and never alters edited pixels" |  |
| PHS-R59 | verified | e2e "composition <mode> stays registered and never alters edited pixels" |  |
| PHS-R60 | verified | e2e "composition <mode> stays registered and never alters edited pixels" |  |
| PHS-R61 | verified | e2e "rulers and guides are a view-only aid labelled in output pixels" |  |
| PHS-R62 | missing | — |  |
| PHS-R63 | verified | e2e "on-image straighten traces a reference line and commits one undoable correction"; unit "levels a traced horizontal reference line" |  |
| PHS-R64 | verified | e2e "geometry, detail, and local tools produce reversible recipe state"; unit "quarter-turn normalization is stable for negative and large rotations" |  |
| PHS-R65 | implemented | — |  |
| PHS-R66 | implemented | — |  |
| PHS-R67 | verified | e2e "geometry, detail, and local tools produce reversible recipe state"; unit "lens and perspective corrections displace edges while keeping finite coordinates" |  |
| PHS-R68 | verified | e2e "geometry, detail, and local tools produce reversible recipe state"; unit "lens and perspective corrections displace edges while keeping finite coordinates" |  |
| PHS-R69 | verified | unit "lens and perspective corrections displace edges while keeping finite coordinates" |  |
| PHS-R70 | verified | unit "independent horizontal scale keeps the centre and halves the width", "a one-pixel offset shifts every pixel by exactly one column", "forward mapping agrees with the pixel warp for rotation in a non-square frame" |  |
| PHS-R71 | verified | e2e "corner perspective pins corners and uncovers transparency on the side pulled in"; unit "the square-to-quad map sends each unit corner exactly to its pinned corner" |  |
| PHS-R72 | verified | e2e "mesh warp, liquify, and deterministic detail filters are reachable and reversible"; unit "a drag near a grid point nudges it toward the drag delta" |  |
| PHS-R73 | verified | e2e "mesh warp, liquify, and deterministic detail filters are reachable and reversible"; unit "a push stroke displaces points within its radius in the stroke direction", "a restore stroke shrinks displacement already accumulated by an earlier push stroke" |  |
| PHS-R74 | verified | e2e "canvas size adds a transparent or coloured border to the export and trimming removes uncovered edges" |  |
| PHS-R75 | verified | e2e "canvas size adds a transparent or coloured border to the export and trimming removes uncovered edges" |  |

### Light, tone and colour

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| PHS-R76 | verified | e2e "loads a local photo, edits, compares, undoes, and opens export"; unit "one EV increases linear-light exposure without changing alpha" |  |
| PHS-R77 | implemented | — |  |
| PHS-R78 | implemented | — |  |
| PHS-R79 | implemented | — |  |
| PHS-R80 | implemented | — |  |
| PHS-R81 | implemented | — |  |
| PHS-R82 | implemented | — |  |
| PHS-R83 | verified | e2e "tone curve points are user-editable and reversible through normal history"; unit "adds points in sorted input order without colliding with endpoints" |  |
| PHS-R84 | verified | e2e "per-channel curves and levels use ordinary undoable recipe state"; unit "per-channel curves can change red without changing green or blue" |  |
| PHS-R85 | verified | e2e "per-channel curves and levels use ordinary undoable recipe state"; unit "levels map input endpoints through gamma into output endpoints" |  |
| PHS-R86 | verified | e2e "channel mixer exposes each output channel and remains reversible"; unit "channel mixer can swap red and blue output channels" |  |
| PHS-R87 | verified | e2e "selective color changes only the chosen family and survives a method switch"; unit "adding cyan to reds lowers red only in red pixels" |  |
| PHS-R88 | verified | e2e "automatic tone and white balance write visible numeric recipe values and undo as one step"; unit "auto tone maps stable luminance percentiles to visible bounded recipe values" |  |
| PHS-R89 | verified | e2e "automatic tone and white balance write visible numeric recipe values and undo as one step"; unit "auto white balance uses deterministic gray-world channel means" |  |
| PHS-R90 | verified | e2e "the white-balance eyedropper neutralizes a picked gray"; unit "recovers the correction that neutralizes a known cast" |  |
| PHS-R91 | verified | e2e "3D Cube LUT import, strength, faithful export, errors, and history stay explicit"; unit "parses common 3D Cube metadata and red-fastest sample order" |  |
| PHS-R92 | verified | e2e "3D Cube LUT import, strength, faithful export, errors, and history stay explicit"; unit "interpolates inside a domain and blends the configured strength" |  |
| PHS-R93 | verified | e2e "3D Cube LUT import, strength, faithful export, errors, and history stay explicit"; unit "bakes strength into a faithful supported Cube export" |  |
| PHS-R94 | verified | e2e "ICC assign, convert, proof, gamut, and proof-aware sampling stay distinct"; unit "performs real sRGB assign, output, and proof transforms while preserving alpha" |  |
| PHS-R95 | verified | e2e "ICC assign, convert, proof, gamut, and proof-aware sampling stay distinct" |  |
| PHS-R96 | verified | e2e "ICC assign, convert, proof, gamut, and proof-aware sampling stay distinct" |  |
| PHS-R97 | verified | e2e "ICC assign, convert, proof, gamut, and proof-aware sampling stay distinct" |  |
| PHS-R98 | verified | e2e "ICC assign, convert, proof, gamut, and proof-aware sampling stay distinct" |  |
| PHS-R99 | verified | e2e "ICC assign, convert, proof, gamut, and proof-aware sampling stay distinct" |  |
| PHS-R100 | verified | e2e "ICC assign, convert, proof, gamut, and proof-aware sampling stay distinct"; unit "keeps an unproofed buffer for proof-aware sampling and never proof-processes export" |  |
| PHS-R101 | verified | unit "recovers the correction that neutralizes a known cast" |  |
| PHS-R102 | verified | unit "recovers the correction that neutralizes a known cast" |  |
| PHS-R103 | implemented | — |  |
| PHS-R104 | implemented | — |  |
| PHS-R105 | implemented | — |  |
| PHS-R106 | implemented | — |  |
| PHS-R107 | implemented | — |  |
| PHS-R108 | implemented | — |  |
| PHS-R109 | implemented | — |  |
| PHS-R110 | implemented | — |  |
| PHS-R111 | implemented | — |  |
| PHS-R112 | missing | — |  |
| PHS-R113 | missing | — |  |
| PHS-R114 | missing | — |  |

### Detail and finishing

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| PHS-R115 | implemented | — |  |
| PHS-R116 | implemented | — |  |
| PHS-R117 | implemented | — |  |
| PHS-R118 | verified | unit "sharpening increases local edge contrast without changing flat alpha" |  |
| PHS-R119 | implemented | — |  |
| PHS-R120 | implemented | — |  |
| PHS-R121 | verified | unit "luminance denoise reduces an isolated one-pixel spike" |  |
| PHS-R122 | implemented | — |  |
| PHS-R123 | implemented | — |  |
| PHS-R124 | implemented | — |  |
| PHS-R125 | implemented | — |  |
| PHS-R126 | verified | e2e "mesh warp, liquify, and deterministic detail filters are reachable and reversible" |  |
| PHS-R127 | verified | e2e "mesh warp, liquify, and deterministic detail filters are reachable and reversible"; unit "softens a checkerboard toward mid-gray" |  |
| PHS-R128 | verified | e2e "mesh warp, liquify, and deterministic detail filters are reachable and reversible"; unit "removes an isolated single-pixel spike that a blur would only soften" |  |
| PHS-R129 | verified | e2e "mesh warp, liquify, and deterministic detail filters are reachable and reversible" |  |
| PHS-R130 | verified | e2e "mesh warp, liquify, and deterministic detail filters are reachable and reversible"; unit "negative detail softens toward the low-frequency base; positive boosts away from it" |  |
| PHS-R131 | verified | e2e "mesh warp, liquify, and deterministic detail filters are reachable and reversible"; unit "desaturates a matching-hue pixel sitting on a strong luminance edge" |  |
| PHS-R132 | verified | e2e "mesh warp, liquify, and deterministic detail filters are reachable and reversible"; unit "softens a busy repetitive pattern while leaving a flat region untouched" |  |
| PHS-R133 | verified | e2e "mesh warp, liquify, and deterministic detail filters are reachable and reversible"; unit "replaces an isolated hot pixel with its neighborhood median" |  |
| PHS-R134 | verified | e2e "dust visualization renders a preview-only overlay distinct from clipping/focus overlays" |  |
| PHS-R135 | verified | e2e "holding backslash or the button shows the original, and the 100% view renders actual pixels" |  |

### Selection and masking

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| PHS-R136 | verified | e2e "selection geometry, combinations, refinement, clear, and mask conversion share one reversible workflow" |  |
| PHS-R137 | verified | e2e "selection geometry, combinations, refinement, clear, and mask conversion share one reversible workflow" |  |
| PHS-R138 | verified | e2e "selection geometry, combinations, refinement, clear, and mask conversion share one reversible workflow" |  |
| PHS-R139 | verified | e2e "selection geometry, combinations, refinement, clear, and mask conversion share one reversible workflow"; unit "color tolerance and luminance selection evaluate rendered pixel values" |  |
| PHS-R140 | verified | e2e "selection geometry, combinations, refinement, clear, and mask conversion share one reversible workflow"; unit "color tolerance and luminance selection evaluate rendered pixel values" |  |
| PHS-R141 | verified | e2e "selection geometry, combinations, refinement, clear, and mask conversion share one reversible workflow"; unit "add, subtract, and intersect combine deterministically" |  |
| PHS-R142 | verified | e2e "selection geometry, combinations, refinement, clear, and mask conversion share one reversible workflow"; unit "feather, grow/shrink, and invert change the boundary without destroying operations" |  |
| PHS-R143 | verified | e2e "selection geometry, combinations, refinement, clear, and mask conversion share one reversible workflow"; unit "feather, grow/shrink, and invert change the boundary without destroying operations" |  |
| PHS-R144 | verified | e2e "selection geometry, combinations, refinement, clear, and mask conversion share one reversible workflow"; unit "feather, grow/shrink, and invert change the boundary without destroying operations" |  |
| PHS-R145 | verified | e2e "selection geometry, combinations, refinement, clear, and mask conversion share one reversible workflow" |  |
| PHS-R146 | verified | e2e "selection geometry, combinations, refinement, clear, and mask conversion share one reversible workflow"; unit "converted selection masks drive the shared preview/export pixel engine" |  |
| PHS-R147 | verified | e2e "local masks rename, duplicate, bypass, visualize, and compose with an active selection" |  |
| PHS-R148 | verified | e2e "local masks rename, duplicate, bypass, visualize, and compose with an active selection" |  |
| PHS-R149 | verified | e2e "local masks rename, duplicate, bypass, visualize, and compose with an active selection" |  |
| PHS-R150 | verified | e2e "local masks rename, duplicate, bypass, visualize, and compose with an active selection" |  |
| PHS-R151 | verified | e2e "local masks rename, duplicate, bypass, visualize, and compose with an active selection" |  |
| PHS-R152 | verified | e2e "local masks rename, duplicate, bypass, visualize, and compose with an active selection" |  |
| PHS-R153 | verified | e2e "brush masks expose flow, spacing, and smoothing controls and record erase strokes separately"; unit "an erase stroke multiplicatively removes coverage a paint stroke added" |  |
| PHS-R154 | implemented | — |  |
| PHS-R155 | verified | e2e "brush masks expose flow, spacing, and smoothing controls and record erase strokes separately"; unit "a single stroke pass is capped at the flow ceiling, not full coverage" |  |
| PHS-R156 | verified | e2e "brush masks expose flow, spacing, and smoothing controls and record erase strokes separately"; unit "coarse spacing thins interior dabs while keeping the stroke start and end" |  |
| PHS-R157 | implemented | — | [awaiting physical testing by human] Pressure-sensitive pen or tablet, any browser: paint one stroke light then heavy; expected: coverage follows pressure. |
| PHS-R158 | verified | e2e "brush masks expose flow, spacing, and smoothing controls and record erase strokes separately"; unit "smoothing pulls interior points toward the prior smoothed point but keeps the ends exact" |  |
| PHS-R159 | verified | e2e "local masks rename, duplicate, bypass, visualize, and compose with an active selection"; unit "nested composite masks clone independently and normalize bounded operations" |  |
| PHS-R160 | implemented | — |  |
| PHS-R161 | implemented | — |  |
| PHS-R162 | implemented | — |  |
| PHS-R163 | implemented | — |  |
| PHS-R164 | verified | e2e "radial masks stay spatially accurate above 100% zoom and undo as one gesture"; unit "radial local exposure changes its target more than an outside corner" |  |
| PHS-R165 | implemented | — |  |
| PHS-R166 | implemented | — |  |
| PHS-R167 | implemented | — |  |
| PHS-R168 | implemented | — |  |
| PHS-R169 | missing | — |  |
| PHS-R170 | missing | — |  |
| PHS-R171 | missing | — | Method (threshold or on-device ML) is chosen with the ML ruleset when built |

### Retouch

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| PHS-R172 | verified | e2e "retouch operations paint multi-stroke coverage, bypass, reorder, and clear independently"; unit "a stroke point away from the anchor samples the source shifted by the same locked delta" |  |
| PHS-R173 | verified | e2e "retouch operations paint multi-stroke coverage, bypass, reorder, and clear independently"; unit "a second stroke keeps the locked anchor and appends its own points instead of replacing it" |  |
| PHS-R174 | verified | e2e "retouch operations paint multi-stroke coverage, bypass, reorder, and clear independently"; unit "a disabled operation is skipped entirely" |  |
| PHS-R175 | verified | unit "red-eye correction reduces red dominance only inside the correction circle" |  |
| PHS-R176 | verified | e2e "clone retouch supports explicit source then target placement on the photo"; unit "clone spot copies a sampled source into its target region" |  |
| PHS-R177 | implemented | — |  |

### Layers and compositing

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| PHS-R178 | verified | e2e "layers import, blend, transform, mask, duplicate, reorder, and remove independently" |  |
| PHS-R179 | verified | e2e "layers import, blend, transform, mask, duplicate, reorder, and remove independently" |  |
| PHS-R180 | verified | e2e "layers import, blend, transform, mask, duplicate, reorder, and remove independently" |  |
| PHS-R181 | verified | e2e "layers import, blend, transform, mask, duplicate, reorder, and remove independently"; unit "an invisible layer changes nothing" |  |
| PHS-R182 | verified | e2e "layers import, blend, transform, mask, duplicate, reorder, and remove independently"; unit "opacity partially blends the layer toward the base rather than fully replacing it" |  |
| PHS-R183 | verified | e2e "layers import, blend, transform, mask, duplicate, reorder, and remove independently"; unit "multiply darkens toward black and is idempotent with white", "luminosity keeps the base hue/saturation but takes the top layer brightness" |  |
| PHS-R184 | missing | — |  |
| PHS-R185 | verified | e2e "layers import, blend, transform, mask, duplicate, reorder, and remove independently"; unit "a mask restricts the composited area to where its weight is non-zero" |  |
| PHS-R186 | verified | e2e "adjustment, text, shape, and watermark layers can each be added and configured"; unit "an adjustment layer changes pixels beneath it without needing a supplied pixel buffer" |  |
| PHS-R187 | verified | e2e "layers import, blend, transform, mask, duplicate, reorder, and remove independently" |  |
| PHS-R188 | verified | e2e "layers import, blend, transform, mask, duplicate, reorder, and remove independently" |  |
| PHS-R189 | verified | e2e "layers import, blend, transform, mask, duplicate, reorder, and remove independently" |  |
| PHS-R190 | verified | e2e "layer groups hide and fade their members together" |  |
| PHS-R191 | missing | — |  |
| PHS-R192 | verified | e2e "adjustment, text, shape, and watermark layers can each be added and configured"; unit "createTextLayer and createShapeLayer default sensible role-specific fields" |  |
| PHS-R193 | missing | — |  |
| PHS-R194 | missing | — |  |
| PHS-R195 | missing | — |  |
| PHS-R196 | missing | — |  |
| PHS-R197 | missing | — |  |
| PHS-R198 | verified | e2e "adjustment, text, shape, and watermark layers can each be added and configured" |  |
| PHS-R199 | verified | e2e "adjustment, text, shape, and watermark layers can each be added and configured" |  |
| PHS-R200 | verified | e2e "watermark presets stamp exports without changing the project" |  |

### Multi-photo merges

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| PHS-R201 | verified | e2e "handheld exposure fusion aligns frames in the background engine and reports confidence"; unit "exposure fusion recovers both highlights and shadows the single frames lose" |  |
| PHS-R202 | verified | e2e "HDR is blocked until every photo has a distinct shutter speed"; unit "HDR merge with true exposure times produces a finite, tone-mapped, ordered result for every operator" |  |
| PHS-R203 | verified | unit "HDR merge with true exposure times produces a finite, tone-mapped, ordered result for every operator" |  |
| PHS-R204 | verified | unit "planar stitching recovers each camera rotation and rebuilds the ground-truth composite" |  |
| PHS-R205 | verified | unit "cylindrical stitching widens the view, keeps horizontal steps equal, and crops to full coverage", "cropping to coverage removes the edges some frames do not reach" |  |
| PHS-R206 | verified | unit "each half of the result comes from the frame that is sharp there" |  |
| PHS-R207 | verified | e2e "an average stack of tripod frames opens as a new editable photo"; unit "average is the per-channel mean of covering frames only" |  |
| PHS-R208 | verified | unit "median rejects a transient value present in a minority of frames" |  |
| PHS-R209 | verified | e2e "handheld exposure fusion aligns frames in the background engine and reports confidence"; unit "recovers a known integer translation to sub-pixel accuracy" |  |
| PHS-R210 | verified | e2e "stacks refuse photos of different sizes and name the offending photo"; unit "frames that do not overlap fail with a diagnostic naming the pair" |  |

### Workflow and batch

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| PHS-R211 | verified | e2e "copies a complete edit recipe across photos and pastes it as one undo step" |  |
| PHS-R212 | verified | e2e "copies a complete edit recipe across photos and pastes it as one undo step" |  |
| PHS-R213 | verified | e2e "selected setting groups copy between photos without the crop"; unit "copying selected groups changes only those fields" |  |
| PHS-R214 | verified | e2e "selected setting groups copy between photos without the crop" |  |
| PHS-R215 | verified | e2e "batch sync can apply the look without the crop" |  |
| PHS-R216 | verified | e2e "batch naming rules, failure isolation, retry, and a CSV summary"; unit "file name rules expand tokens, keep typos visible, and always end in the right extension" |  |
| PHS-R217 | verified | e2e "metadata templates fill exports and keep location out unless opted in" |  |
| PHS-R218 | verified | e2e "export presets persist across reloads and apply every saved setting" |  |
| PHS-R219 | implemented | — |  |
| PHS-R220 | verified | e2e "contact sheets are produced as a PDF from the queued photos"; unit "fills rows left to right, paginates, and fits each photo whole inside its square box" |  |
| PHS-R221 | verified | e2e "watermark presets stamp exports without changing the project"; unit "text watermarks scale with the frame and stay inside the margin" |  |
| PHS-R222 | verified | e2e "export presets persist across reloads and apply every saved setting" |  |
| PHS-R223 | verified | e2e "print planner reports density and sizes the export for a paper"; unit "a 6000 × 4000 photo on 8 × 10 in paper turns sideways and prints at 600 ppi" |  |
| PHS-R224 | verified | e2e "snapshots can be renamed, duplicated, compared, and deleted"; unit "lists changed fields with readable before/after values, grouped in editor order" |  |
| PHS-R225 | verified | e2e "batch naming rules, failure isolation, retry, and a CSV summary"; unit "items can be reordered and failed or cancelled ones retried", "cancelled items are skipped, and a cancel during rendering discards the result" |  |
| PHS-R226 | verified | e2e "batch export queues multiple local files and reports per-file completion"; unit "isolates a failed file and continues with the rest of the queue" |  |
| PHS-R227 | missing | — |  |
| PHS-R228 | missing | — |  |
| PHS-R229 | missing | — |  |
| PHS-R230 | missing | — |  |

### Export and delivery

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| PHS-R231 | verified | e2e "PNG export embeds reviewed XMP and honors safe custom filename plus output sharpening"; unit "output filename extension follows requested MIME" |  |
| PHS-R232 | verified | e2e "TIFF export with Lanczos resampling writes a real baseline TIFF at the requested size"; unit "each format states whether it is lossless or lossy" |  |
| PHS-R233 | verified | e2e "TIFF export with Lanczos resampling writes a real baseline TIFF at the requested size"; unit "lanczos3 and bilinear reproduce the input exactly at the same size" |  |
| PHS-R234 | partial | e2e "TIFF export with Lanczos resampling writes a real baseline TIFF at the requested size"; unit "an independent decoder reads back identical RGB pixels, size, and resolution" | 8-bit TIFF is written; 16-bit TIFF is not offered because editing runs at 8 bits per channel |
| PHS-R235 | verified | e2e "AVIF export encodes in the background, decodes back at the planned size, and keeps metadata in the sidecar" |  |
| PHS-R236 | verified | unit "output conversion requires successful ICC embedding and reports the tagged export", "embeds the selected profile in JPEG APP2, PNG iCCP, and WebP ICCP containers" |  |
| PHS-R237 | verified | e2e "metadata templates fill exports and keep location out unless opted in"; unit "location is dropped unless the template explicitly opts in" |  |
| PHS-R238 | verified | e2e "export presets persist across reloads and apply every saved setting" |  |
| PHS-R239 | verified | e2e "one photo exports to several presets in sequence" |  |
| PHS-R240 | verified | unit "duplicate names get numbered copies, case-insensitively", "never overwrites an existing file and writes the bytes it was given" |  |
| PHS-R241 | verified | e2e "one photo exports to several presets in sequence"; unit "summarises totals and settings as JSON", "CSV escapes quotes/commas and neutralises spreadsheet formulas" |  |
| PHS-R242 | implemented | unit "picker dismissal is recognised as a cancel, not an error" | The cited unit test covers cancel handling; the picker save path has no test |
| PHS-R243 | implemented | — |  |
| PHS-R244 | verified | e2e "long and short edge sizing expose planned output and require an explicit safe choice for oversized export"; unit "percentage resize preserves aspect ratio", "exact width and height resize preserve edited aspect ratio", "long-edge and short-edge resize preserve aspect ratio in either orientation" |  |
| PHS-R245 | verified | e2e "PNG export embeds reviewed XMP and honors safe custom filename plus output sharpening"; unit "uses an edited user stem and enforces the selected format extension", "sanitizes reserved filename characters without discarding useful words" |  |
| PHS-R246 | verified | unit "composites JPEG transparency in working RGB before any output transform" |  |
| PHS-R247 | verified | e2e "PNG export embeds reviewed XMP and honors safe custom filename plus output sharpening"; unit "output sharpening is additive, bounded, and does not mutate the edit recipe" |  |
| PHS-R248 | verified | unit "strip policy exports only rendered pixels with a safe edited filename", "rights policy excludes location while custom policy retains explicit location" |  |
| PHS-R249 | verified | e2e "metadata editor creates a reviewed XMP sidecar"; unit "XMP escapes text and maps reviewed rights/descriptive fields", "XMP omits GPS when coordinates are not explicitly provided" |  |
| PHS-R250 | verified | e2e "PNG export embeds reviewed XMP and honors safe custom filename plus output sharpening"; unit "reviewed metadata is embedded when the container writer succeeds", "metadata packaging failure preserves the rendered pixel export and reports fallback" |  |
| PHS-R251 | verified | e2e "long and short edge sizing expose planned output and require an explicit safe choice for oversized export"; unit "safe fitting honors both edge and area limits without changing aspect ratio materially" |  |
| PHS-R252 | verified | unit "targets larger than the edited frame keep the frame size; smaller targets still apply" |  |
| PHS-R253 | verified | unit "an independent decoder reads back identical RGB pixels, size, and resolution" |  |
| PHS-R254 | missing | — |  |
| PHS-R255 | verified | e2e "every open-source notice linked from Photo Studio is served" |  |

### Excluded by platform limits

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| PHS-R256 | prohibited | — | Cannot run in a browser: no vendor-independent camera-control API |
| PHS-R257 | prohibited | — | Cannot run in a browser: web pages cannot configure the OS colour pipeline |
| PHS-R258 | prohibited | — | Cannot run in a browser: no cross-platform printer-driver API |

### Non-functional

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| PHS-R259 | partial | — | Workspace colours use the site palette variables (`--surface`, `--accent`); no dark-theme contrast check covers this workspace |
| PHS-R260 | partial | e2e "at 320 CSS px every panel reflows without horizontal page scrolling", "reflows editor and export dialog without page-level horizontal overflow at 320 CSS pixels", "merge panel reflows without page-level horizontal scrolling at 320 CSS px" | Checked at 320 px only; wider widths have no check |
| PHS-R261 | verified | e2e "every Photo panel, with every section expanded, has no serious or critical axe violations" |  |
| PHS-R262 | verified | e2e "keyboard undo and redo work without pointer-only interaction", "Escape disarms an active canvas tool from the keyboard" |  |
| PHS-R263 | implemented | — |  |
| PHS-R264 | missing | — |  |
| PHS-R265 | verified | unit "stale render results cannot replace the active revision", "keeps overlapping callers with the same revision independently correlated" |  |
| PHS-R266 | implemented | — |  |
| PHS-R267 | verified | e2e "malformed RAW leaves the active photo intact and a subsequent DNG import succeeds", "unsupported TIFF preserves the current document and gives variant-specific guidance" |  |
| PHS-R268 | verified | e2e "RAW decoding is on-demand and a cached decoder can recover a project offline" |  |
| PHS-R269 | verified | e2e "TIFF shares preview, comparison, export and durable recovery while preserving original source bytes" |  |
| PHS-R270 | implemented | — |  |

## Open work

1. Editing: asset library, portable project file, social/print crop presets, snapping, sepia, duotone, colour tint, vector masks, clipping paths, background removal, four further blend modes, layer lock, text fonts, spacing, outline, shadow and curved text, SVG export, pinch zoom.
2. Workflow: batch ZIP, templates with placeholder slots, CSV-driven batch generation, smart mockup replacement.
3. Dark-theme contrast check for the workspace; viewport check from 375 to 2560 px.
4. Tests for the `implemented` rows.

## Known limitations

- Editing runs at 8 bits per channel; TIFF export is 8-bit.
- Browser memory and canvas limits cap image size; oversized exports are reduced to a verified safe size.
- WebAssembly runs single-threaded (no COOP/COEP on GitHub Pages).

## Verification evidence

- 2026-10-05, `expand/photo-studio` from `main` @ `6c991e75`: `pnpm tool:check photo-studio --base origin/main` 195/270 (verified 192, implemented 48, partial 5, missing 22, prohibited 3), no errors; `pnpm docs:sync` and `pnpm docs:check` passed; `pnpm exec vitest run tests/unit/cad-progress.test.ts tests/unit/sheets-wave-b.test.ts tests/unit/deployment-config.test.ts` 23 passed.

## Change log

- 2026-10-05 — Created per `docs/DOCUMENTATION_STANDARD.md`: 270 requirements, 192 verified, 48 implemented, 5 partial, 22 missing, 3 prohibited.

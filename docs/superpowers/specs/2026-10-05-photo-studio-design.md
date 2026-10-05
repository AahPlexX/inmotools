---
tool: photo-studio
folder: src/tools/photo
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-photo-studio-design.md
tracker: src/tools/photo/TRACKER.md
updated: 2026-10-05
---

# Photo Studio — spec

As built at `947272db` (last code change under `src/tools/photo/`). Requirement prefix: `PHS`. Status of each requirement: [TRACKER.md](../../../src/tools/photo/TRACKER.md).

History (kept as written): [2026-09-11 design](2026-09-11-photo-studio-design.md) (design items 1–62), [2026-09-12 capability expansion](2026-09-12-photo-studio-capability-expansion.md) (capabilities 1–164), plans [2026-09-11](../plans/2026-09-11-photo-studio.md) and [2026-09-12](../plans/2026-09-12-photo-studio-capability-expansion.md), ledger [.tasks/PHOTO_STUDIO.md](../../../.tasks/PHOTO_STUDIO.md). "Formerly capability N" and "formerly design item N" refer to those numbers.

## Purpose

A non-destructive photo editor for photographers, creators and families: open photos, TIFF scans and camera RAW files, edit them with reversible global, local, layer and retouch tools, merge multi-photo sets, and export finished copies with chosen metadata, all on the user's device.

## Scope

In scope: still-image import (browser formats, TIFF, camera RAW), non-destructive editing, selections and masks, retouch, layers and text, multi-photo merges, projects and presets in this browser, batch and template workflows, and export to JPEG, PNG, WebP, TIFF, AVIF, SVG, PDF contact sheets, XMP sidecars and JSON recipes.

Out of scope: tethered camera control, OS display calibration and printer-driver control (the `prohibited` rows under "Excluded by platform limits"); unlimited image size (browser memory and canvas limits apply; oversized exports are reduced to a verified safe size).

## Constraints

- Platform rules: no accounts or authentication; no server, API proxy or hosted database; everything runs in the browser and tool data stays in this browser (IndexedDB, OPFS, localStorage, Cache API); network use is limited to the site's own files ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- No large language models; other ML only on the device under the ML ruleset.
- GitHub Pages cannot send COOP/COEP headers, so WebAssembly runs single-threaded.
- Libraries in use stay as they are: `tiff`, `@colorhythm/libraw-wasm`, `lcms-wasm`, `@techstark/opencv-js`, `@jsquash/avif`, `exifreader`, `pdf-lib`. Storage: the IndexedDB project database with OPFS source storage, and the `inmotools.photo-studio.templates` database.
- Editing runs at 8 bits per channel after decode; sources are never modified.

## Requirements

### Input and sources

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PHS-R01 | Opens a photo dropped on the workspace (formerly capability 1) | Drop a JPEG; it opens |
| PHS-R02 | Opens an image from the clipboard (direct read or paste), and explains the fallback when reading is denied or unavailable (formerly capability 2) | Paste an image; it opens; a denied read shows the fallback text |
| PHS-R03 | Captures a photo from a mobile camera through the file input's capture behaviour (formerly capability 3) | On a phone, the camera input opens the camera and the shot opens in the editor |
| PHS-R04 | Opens JPEG, PNG, WebP and other still images the browser decodes (formerly capability 4) | Choose a JPEG; preview renders |
| PHS-R05 | Opens 8- and 16-bit uncompressed or Deflate TIFF through a lazily loaded decoder, first page only (formerly capability 5) | Open a 16-bit TIFF; it previews and exports |
| PHS-R06 | Opens camera RAW (DNG, CR2, CR3, NEF, ARW, RAF, ORF, RW2, PEF, SRW) through a WebAssembly decoder in a worker (formerly capability 6) | Open a DNG; it develops and exports |
| PHS-R07 | Shows the RAW file's embedded preview while the full decode runs, without replacing the document (formerly capability 7) | Embedded preview appears, then the developed photo |
| PHS-R08 | RAW development controls shown only when the decoder supports them: exposure before demosaic with highlight protection, white balance (camera, daylight, custom), highlight mode, demosaic method, and camera facts (formerly capability 8) | Change RAW white balance and exposure; pixels change; undo restores |
| PHS-R09 | Detects the source's embedded colour profile (formerly capability 9) | Original file details list the ICC profile description and colour space |
| PHS-R10 | Shows the original file's camera, capture, location and profile details separately from the export metadata policy (formerly capability 10) | Inspect & workflow → Original file details lists the source facts |
| PHS-R11 | Opens several files into a queue processed one at a time, without keeping every decoded full-resolution image in memory (formerly capability 11) | Queue three files; each is processed in turn |
| PHS-R12 | Detects that an imported file is already saved as a local project (SHA-256 of the bytes) and offers to open it or keep a copy (formerly capability 12) | Re-import a saved photo; the prompt offers Open saved project or Keep this copy |
| PHS-R13 | Asset library: keeps imported images (photos, logos, textures) in this browser for reuse as sources or layers | Add an image to the library, reload, place it as a layer |

### Projects, variants and history

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PHS-R14 | Autosaves the active project (source and recipe) in this browser (IndexedDB metadata, OPFS or IndexedDB source) (formerly capability 13) | Edit, wait, reload; recovery offers the project |
| PHS-R15 | Recovers the active project after a crash or reload (formerly capability 14) | Reload mid-edit; Recover project restores source and edits |
| PHS-R16 | Saves, loads and deletes named local projects (formerly capability 15) | Save, reload, load, delete a project |
| PHS-R17 | Reports storage quota, persistence and capability, and degrades gracefully when durable storage is unavailable (formerly capability 16) | Project panel shows storage state; a quota failure is reported without an orphaned source |
| PHS-R18 | Virtual copies share one immutable source while keeping independent recipes, histories and snapshots (formerly capability 17) | Create a copy, edit it; the original is unchanged |
| PHS-R19 | Virtual copies carry a user-chosen name (formerly capability 18) | Name a copy; the name lists in Projects |
| PHS-R20 | Duplicates a variant (formerly capability 19) | Create a virtual copy from a copy; both list |
| PHS-R21 | Deleting a variant or project can be undone (formerly capability 20) | Delete a project; Undo delete restores it |
| PHS-R22 | User presets are saved in this browser, applied and removed (formerly capability 21) | Save current as preset, reload, apply, delete |
| PHS-R23 | User presets can be renamed, duplicated, deleted, imported and exported as versioned JSON (formerly capability 22) | Rename, duplicate, export and import a preset |
| PHS-R24 | Snapshots can be renamed (formerly capability 23) | Rename a snapshot; the new name lists |
| PHS-R25 | Snapshots can be deleted (formerly capability 24) | Delete a snapshot; it leaves the list |
| PHS-R26 | Snapshots can be duplicated (formerly capability 25) | Duplicate a snapshot; a copy lists |
| PHS-R27 | Saved projects and recipes from older versions migrate to the current schema (formerly capability 26) | Load a version-0 project; it opens |
| PHS-R28 | Named snapshots save and restore a recipe state (formerly design item 58) | Save snapshot "Warm proof", change exposure, restore it |
| PHS-R29 | Built-in starting presets (Clean color, Soft portrait, Landscape depth, Monochrome) apply editable values (formerly design item 59) | Apply Monochrome; black and white turns on and sliders stay editable |
| PHS-R30 | Undo and redo of every edit within a bounded history (formerly design item 57) | Edit twice, undo twice, redo |
| PHS-R31 | Exports and imports the edit recipe as JSON without source pixels (formerly design item 61) | Export recipe, import it on another photo; values match |
| PHS-R32 | Exports and opens one portable project file that inlines the source image and every layer asset | Export a project file, open it in a clean browser; source, layers and edits restore |

### Comparison, inspection and proofing

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PHS-R33 | Before/after split with a pointer-draggable, keyboard-adjustable boundary (formerly capability 27; design item 56) | Drag the split and press arrow keys; the split moves |
| PHS-R34 | Side-by-side before/after view (formerly capability 28; design item 56) | Switch to side-by-side; both views show |
| PHS-R35 | Holding the backslash key or the Hold for original button shows the unedited photo (formerly capability 29) | Hold backslash; the original shows; release returns the edit |
| PHS-R36 | Comparison views share zoom and pan (formerly capability 30) | Zoom in side-by-side; both views share the zoom |
| PHS-R37 | Up to eight pinned colour samples that refresh as edits change (formerly capability 31) | Pin two samples, change exposure; values update |
| PHS-R38 | Colour sampler reports hexadecimal, RGB and HSL, plus alpha when relevant (formerly capability 32; design item 55) | Sample a pixel; readout shows hex, RGB and HSL |
| PHS-R39 | Lab and XYZ (D65) readout when colour management is active (formerly capability 33) | Assign a profile; readout adds Lab D65 |
| PHS-R40 | Luminance waveform of the rendered preview (formerly capability 34) | Open scopes; waveform renders |
| PHS-R41 | RGB parade (formerly capability 35) | Open scopes; parade shows three channels |
| PHS-R42 | Vectorscope (formerly capability 36) | Open scopes; vectorscope renders |
| PHS-R43 | Focus/detail map overlay from local edge energy (formerly capability 37) | Turn on focus overlay; edges highlight; pixels unchanged |
| PHS-R44 | Exposure-zone overlay in stops around middle grey (formerly capability 38) | Turn on exposure zones; zone distribution lists |
| PHS-R45 | Gamut-warning overlay for the selected proof profile (formerly capability 39) | Enable soft proof and gamut warning; out-of-gamut pixels mark magenta |
| PHS-R46 | Pixel-coordinate readout (formerly capability 40) | Sample a pixel; its coordinates show |
| PHS-R47 | Navigator minimap when zoomed in (formerly capability 41) | Zoom in; Navigator minimap shows |
| PHS-R48 | Configurable checkerboard or solid canvas background (formerly capability 42) | Choose a light background; canvas class changes |
| PHS-R49 | Live RGB and luminance histogram of the rendered preview (formerly design item 20) | Histogram shows four channels |
| PHS-R50 | Highlight and shadow clipping-warning overlay (formerly design item 19) | Turn on Clipping warnings; overlay shows |

### Crop, composition and geometry

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PHS-R51 | Free crop by numeric edges or on-image handles (formerly design item 1) | Set crop width 75 %; preview crops |
| PHS-R52 | Aspect-ratio crop presets: original, 1:1, 4:3, 3:2, 16:9 (formerly design item 2) | Click 16:9; crop takes that ratio |
| PHS-R53 | Aspect-ratio presets for social and print formats (4:5, 9:16, 5:7, 8:10) | Choose 4:5; crop takes that ratio |
| PHS-R54 | Validated custom crop ratio (formerly capability 43; design item 2) | Apply 5:4 on a 4:3 photo; centred 5:4 frame |
| PHS-R55 | Direct crop handles on the image (formerly capability 44) | Drag a corner handle; one undo step |
| PHS-R56 | Movable crop frame (formerly capability 45) | Drag inside the crop; frame moves in source coordinates |
| PHS-R57 | Rule-of-thirds overlay (formerly capability 46) | Choose Rule of thirds; guides show; pixels unchanged |
| PHS-R58 | Golden-ratio overlay (formerly capability 47) | Choose Golden ratio; guides show |
| PHS-R59 | Diagonal overlay (formerly capability 48) | Choose Diagonal; guides show |
| PHS-R60 | Grid overlay with 2–10 divisions (formerly capability 49) | Choose Grid, 6 divisions; guides show |
| PHS-R61 | Rulers in output pixels and up to 12 numeric guides, view only (formerly capability 50) | Turn on rulers; add a guide; export unchanged |
| PHS-R62 | Snapping of crop edges, layers and guides to guides and image edges | Drag a crop edge near a guide; it snaps |
| PHS-R63 | Straighten in fractional degrees, numerically or by tracing a line on the image (formerly capability 51; design item 3) | Trace a tilted horizon; one undoable correction |
| PHS-R64 | Rotate in 90° steps (formerly design item 4) | Rotate right; frame turns |
| PHS-R65 | Flip horizontal (formerly design item 5) | Flip horizontal; preview mirrors |
| PHS-R66 | Flip vertical (formerly design item 6) | Flip vertical; preview mirrors |
| PHS-R67 | Lens barrel/pincushion correction (formerly design item 8) | Set lens distortion 0.25; edges move |
| PHS-R68 | Horizontal perspective (keystone) correction (formerly design item 9) | Set horizontal perspective; preview changes |
| PHS-R69 | Vertical perspective (keystone) correction (formerly design item 10) | Set vertical perspective; preview changes |
| PHS-R70 | Free transform: move, independent width/height scale with optional proportion lock, rotation (affine) (formerly capability 52) | Scale width 50 %; photo halves horizontally |
| PHS-R71 | Corner perspective transform with four pinned corners (formerly capability 53) | Pull a corner in; transparency uncovers on that side |
| PHS-R72 | Mesh warp on a 5×5 control grid (formerly capability 54) | Drag the mesh; pixels warp; reset restores |
| PHS-R73 | Liquify push, pull and restore brushes (formerly capability 55) | Paint a push stroke, then restore; displacement shrinks |
| PHS-R74 | Canvas size: add transparent or coloured space on each side (formerly capability 56) | Add 10 % per side; export is larger with the border |
| PHS-R75 | Trim transparent borders (formerly capability 57) | Trim; uncovered edges are removed |

### Light, tone and colour

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PHS-R76 | Exposure in EV in linear light (formerly design item 11) | Set +1 EV; mid-grey brightens one stop |
| PHS-R77 | Contrast (formerly design item 12) | Raise contrast; tonal spread widens |
| PHS-R78 | Highlights recovery/compression (formerly design item 13) | Lower highlights; bright areas darken |
| PHS-R79 | Shadow lift/compression (formerly design item 14) | Raise shadows; dark areas lighten |
| PHS-R80 | White point (formerly design item 15) | Lower white point; whites dim |
| PHS-R81 | Black point (formerly design item 16) | Raise black point; blacks lift |
| PHS-R82 | Midtone (gamma) (formerly design item 17) | Raise midtone; mid-greys lighten |
| PHS-R83 | Multi-point luminance tone curve with add, move and remove points (formerly design item 18) | Add a point and drag it; undo restores |
| PHS-R84 | Per-channel red, green and blue tone curves (formerly capability 58) | Raise the red curve; only red changes |
| PHS-R85 | Levels with input black, gamma, input white and output endpoints (formerly capability 59) | Set levels; values map through gamma |
| PHS-R86 | Channel mixer for each output channel (formerly capability 60) | Swap red and blue outputs |
| PHS-R87 | Selective colour (cyan, magenta, yellow, black per colour family; relative or absolute) (formerly capability 61) | Add cyan to reds; only red pixels change |
| PHS-R88 | Automatic tone suggestion with visible, editable numeric output (formerly capability 62) | Suggest automatic tone; sliders take values; one undo |
| PHS-R89 | Automatic white-balance suggestion with visible, editable numeric output (formerly capability 63) | Suggest automatic white balance; temperature and tint take values |
| PHS-R90 | White-balance eyedropper that neutralises a picked grey (formerly capability 64) | Pick a grey patch; it becomes neutral |
| PHS-R91 | Imports a 3D LUT from a .cube file and applies it (formerly capability 65) | Import a .cube; preview changes |
| PHS-R92 | LUT strength 0–100 % (formerly capability 66) | Set strength 50 %; effect halves |
| PHS-R93 | Exports the active LUT with strength baked in as .cube (formerly capability 67) | Export LUT; file re-imports identically |
| PHS-R94 | ICC profile conversion through a LittleCMS transform (formerly capability 68) | Convert to an output profile; export is tagged |
| PHS-R95 | Assign profile distinct from convert profile (formerly capability 69) | Assign then convert; results differ as expected |
| PHS-R96 | Soft-proof profile selection (formerly capability 70) | Choose a proof profile; Soft proof enables |
| PHS-R97 | Rendering-intent selection for conversion and proof (formerly capability 71) | Choose Perceptual and Absolute colorimetric |
| PHS-R98 | Black-point compensation (formerly capability 72) | Toggle black-point compensation |
| PHS-R99 | Output gamut warning tied to the proof profile (formerly capability 73) | Enable gamut warning under soft proof |
| PHS-R100 | Colour readout before and after the proof transform (formerly capability 74) | Sample under proof; Before proof and After proof show |
| PHS-R101 | White-balance temperature (formerly design item 21) | Raise temperature; image warms |
| PHS-R102 | Tint (formerly design item 22) | Raise tint; image shifts magenta |
| PHS-R103 | Saturation (formerly design item 23) | Lower saturation to −1; image greys |
| PHS-R104 | Vibrance weighted toward less-saturated pixels (formerly design item 24) | Raise vibrance; muted colours gain more |
| PHS-R105 | Eight-range hue adjustment (formerly design item 25) | Shift Blue hue; only blues shift |
| PHS-R106 | Eight-range saturation adjustment (formerly design item 26) | Lower Green saturation; only greens fade |
| PHS-R107 | Eight-range luminance adjustment (formerly design item 27) | Raise Orange luminance; only oranges lighten |
| PHS-R108 | Shadow colour grading (formerly design item 28) | Grade shadows blue; shadows tint |
| PHS-R109 | Midtone colour grading (formerly design item 29) | Grade midtones; midtones tint |
| PHS-R110 | Highlight colour grading (formerly design item 30) | Grade highlights; highlights tint |
| PHS-R111 | Black-and-white (greyscale) conversion with colour-channel weights (formerly design item 31) | Turn on black and white; adjust red weight |
| PHS-R112 | Sepia toning | Apply sepia; image takes a brown monochrome tone |
| PHS-R113 | Duotone with two chosen colours | Choose two colours; shadows map to one, highlights to the other |
| PHS-R114 | Single-colour tint (colourise) with chosen colour and strength | Apply a teal tint at 50 % |

### Detail and finishing

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PHS-R115 | Texture (fine detail) (formerly design item 32) | Raise texture; fine detail increases |
| PHS-R116 | Clarity (local contrast) (formerly design item 33) | Raise clarity; midtone contrast increases |
| PHS-R117 | Dehaze (formerly design item 34) | Raise dehaze; haze reduces |
| PHS-R118 | Sharpen amount (formerly design item 35) | Raise amount; edge contrast increases |
| PHS-R119 | Sharpen radius (formerly design item 36) | Change radius; sharpening width changes |
| PHS-R120 | Sharpen threshold (formerly design item 37) | Raise threshold; flat areas are not sharpened |
| PHS-R121 | Luminance noise reduction (formerly design item 38) | Raise luminance denoise; a one-pixel spike reduces |
| PHS-R122 | Colour (chroma) noise reduction (formerly design item 39) | Raise colour denoise; colour speckle reduces |
| PHS-R123 | Chromatic-aberration (fringe) correction (formerly design item 40) | Adjust chromatic edge correction; fringes reduce |
| PHS-R124 | Edge vignette with midpoint and feather (formerly design item 53) | Set vignette −0.5; corners darken |
| PHS-R125 | Film grain with amount, size and colour (formerly design item 54) | Raise grain; noise appears |
| PHS-R126 | High-pass detail effect (formerly capability 102) | Raise high-pass; edges emphasise |
| PHS-R127 | Gaussian blur (formerly capability 103) | Raise blur; checkerboard softens to grey |
| PHS-R128 | Median filter (formerly capability 104) | Raise median; an isolated spike is removed |
| PHS-R129 | Edge-preserving (bilateral) smoothing (formerly capability 105) | Raise bilateral smoothing; flat areas smooth, edges stay |
| PHS-R130 | Frequency separation: boost or soften the high-frequency band relative to the low-frequency base (formerly capability 106) | Set detail −1 then +1; image softens then sharpens |
| PHS-R131 | Defringe by hue and range on edges (formerly capability 107) | Target purple; purple edge pixels desaturate |
| PHS-R132 | Moiré reduction (formerly capability 108) | Raise moiré reduction; a repetitive pattern softens |
| PHS-R133 | Hot/dead-pixel correction (formerly capability 109) | Raise correction; an isolated hot pixel takes its neighbourhood median |
| PHS-R134 | Dust/spot visualisation overlay, preview only (formerly capability 110) | Turn on Dust; overlay shows; export unchanged |
| PHS-R135 | 100 % detail view with a warning when judging sharpening or noise below 100 % (formerly capability 111) | Zoom below 100 %; warning and Check at 100% show |

### Selection and masking

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PHS-R136 | Rectangular selection (formerly capability 75) | Add centred rectangle; selection shows |
| PHS-R137 | Elliptical selection (formerly capability 76) | Add centred ellipse |
| PHS-R138 | Polygon/lasso selection (formerly capability 77) | Trace lasso on the photo |
| PHS-R139 | Colour-tolerance selection (formerly capability 78) | Select by colour with tolerance |
| PHS-R140 | Luminance-range selection (formerly capability 79) | Apply luminance selection |
| PHS-R141 | Selection add, subtract and intersect (formerly capability 80) | Combine two shapes with each mode |
| PHS-R142 | Selection feather (formerly capability 81) | Feather the selection |
| PHS-R143 | Selection grow/shrink (formerly capability 82) | Grow the selection |
| PHS-R144 | Selection invert (formerly capability 83) | Invert the selection |
| PHS-R145 | Selection clear (formerly capability 84) | Clear the selection |
| PHS-R146 | Converts a selection to a local mask (formerly capability 85) | Convert to mask; a local adjustment appears |
| PHS-R147 | Mask rename (formerly capability 86) | Rename a mask |
| PHS-R148 | Mask duplicate (formerly capability 87) | Duplicate a mask |
| PHS-R149 | Mask delete (formerly capability 88) | Remove a mask |
| PHS-R150 | Mask enable/bypass toggle (formerly capability 89) | Uncheck Enabled; effect disappears |
| PHS-R151 | Mask overlay visualisation (formerly capability 90) | Show mask overlay |
| PHS-R152 | Mask overlay colour and opacity (formerly capability 91) | Set overlay red at 0.6 |
| PHS-R153 | Brush-mask erase mode (formerly capability 92) | Paint, then erase; coverage removed |
| PHS-R154 | Brush hardness through the shared feather control (formerly capability 93) | Lower feather; brush edge hardens |
| PHS-R155 | Brush flow (formerly capability 94) | Set flow 0.3; one pass is capped |
| PHS-R156 | Brush spacing (formerly capability 95) | Coarse spacing thins dabs |
| PHS-R157 | Brush pressure response where the pointer reports pressure (formerly capability 96) | Paint with a pen; light pressure gives weaker coverage |
| PHS-R158 | Brush stroke smoothing (formerly capability 97) | Raise smoothing; interior path smooths, ends stay |
| PHS-R159 | Local masks combine with add, subtract and intersect (formerly capability 98) | Add, subtract, intersect selection with a mask |
| PHS-R160 | Dodge brush (local exposure increase) (formerly design item 41) | Brush with positive exposure; area lightens |
| PHS-R161 | Burn brush (local exposure decrease) (formerly design item 42) | Brush with negative exposure; area darkens |
| PHS-R162 | Saturation/desaturation brush (formerly design item 43) | Brush with −1 saturation; area greys |
| PHS-R163 | Blur/sharpen brush (formerly design item 44) | Brush with blur; area softens |
| PHS-R164 | Radial adjustment mask placed on the image, accurate above 100 % zoom (formerly design item 45) | Place a radial at 200 % zoom; one undo |
| PHS-R165 | Linear-gradient adjustment mask (formerly design item 46) | Add linear mask; gradient effect shows |
| PHS-R166 | Luminance-range mask (formerly design item 47) | Add luminance mask; only that range changes |
| PHS-R167 | Hue-range mask (formerly design item 48) | Add hue mask; only that hue changes |
| PHS-R168 | Mask feather, opacity and invert controls (formerly design item 49) | Invert a radial mask; effect moves outside |
| PHS-R169 | Vector masks (editable Bézier paths) on layers and local adjustments | Draw a path mask; edit a point; mask follows |
| PHS-R170 | Clipping path: clip a layer to the shape or alpha of the layer below | Clip a texture layer to a text layer; it shows only inside the text |
| PHS-R171 | Background removal producing a transparent background | Remove background on a portrait; background becomes transparent |

### Retouch

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PHS-R172 | Clone/heal source locking with source-offset visualisation (formerly capability 99) | Place source and target; later strokes keep the offset |
| PHS-R173 | Multi-stroke clone/heal (formerly capability 100) | Paint two strokes; both sample the locked offset |
| PHS-R174 | Retouch operation list with visibility/bypass, reorder and clear (formerly capability 101) | Bypass an operation; it stops rendering |
| PHS-R175 | Manual red-eye correction circles (formerly design item 50) | Place red-eye on a red pupil; red reduces |
| PHS-R176 | Clone spot with explicit source and target (formerly design item 51) | Set source then target on the photo |
| PHS-R177 | Healing spot blending a sampled source (formerly design item 52) | Add heal spot; target blends with surroundings |

### Layers and compositing

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PHS-R178 | Adds image layers from local files (formerly capability 112) | Add image layer; it composites |
| PHS-R179 | Layer rename (formerly capability 113) | Rename a layer |
| PHS-R180 | Layer reorder (formerly capability 114) | Move a layer up |
| PHS-R181 | Layer visibility (hide/show) (formerly capability 115) | Hide a layer; it stops rendering |
| PHS-R182 | Layer opacity (formerly capability 116) | Set opacity 50 % |
| PHS-R183 | Twelve blend modes: normal, multiply, screen, overlay, soft light, hard light, darken, lighten, colour, luminosity, hue, saturation (formerly capability 117) | Choose multiply; result darkens |
| PHS-R184 | Blend modes colour dodge, colour burn, difference and exclusion (completing the 16 W3C compositing modes) | Choose difference; identical layers give black |
| PHS-R185 | Layer masks (radial, linear, brush raster alpha) (formerly capability 118) | Add a radial mask to a layer; it restricts the layer |
| PHS-R186 | Adjustment layers using the recipe's local effects (formerly capability 119) | Add adjustment layer; pixels beneath change |
| PHS-R187 | Non-destructive layer move, scale and rotate (formerly capability 120) | Move and rotate a layer; undo restores |
| PHS-R188 | Layer duplicate (formerly capability 121) | Duplicate a layer |
| PHS-R189 | Layer delete (formerly capability 122) | Remove a layer |
| PHS-R190 | Layer groups with name, visibility and opacity (formerly capability 123) | Hide a group; its members hide |
| PHS-R191 | Layer lock preventing edits and moves | Lock a layer; its controls and canvas drag are disabled |
| PHS-R192 | Text layer with content, colour and size (formerly capability 124) | Add text layer; text renders |
| PHS-R193 | Text layers use a font the user loads from a local file | Load a .woff2; text renders in it |
| PHS-R194 | Text layer letter spacing (kerning) | Set spacing +20; letters spread |
| PHS-R195 | Text layer outline (stroke) with colour and width | Add a 2 px black outline |
| PHS-R196 | Text layer drop shadow with offset, blur and colour | Add a shadow; it renders under the text |
| PHS-R197 | Curved text along an arc with adjustable curvature | Set curvature 50 %; text follows an arc |
| PHS-R198 | Image watermark/logo layer with anchor presets (formerly capability 125) | Add watermark, anchor bottom-right |
| PHS-R199 | Rectangle, ellipse and line shape overlays (formerly capability 126) | Add a shape, switch to ellipse |
| PHS-R200 | Export flattens layers into a copy without changing the project (formerly capability 127) | Export with a watermark; project layers unchanged |

### Multi-photo merges

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PHS-R201 | Exposure fusion of bracketed photos (formerly capability 128) | Fuse three brackets; highlights and shadows both keep detail |
| PHS-R202 | HDR merge from exposure times (formerly capability 129) | Merge brackets with distinct shutter speeds |
| PHS-R203 | Tone mapping of merged HDR (Reinhard, Drago, Mantiuk) (formerly capability 130) | Choose each operator; result is finite and ordered |
| PHS-R204 | Panorama stitching (formerly capability 131) | Stitch three overlapping frames |
| PHS-R205 | Panorama projection (planar, cylindrical) and crop to coverage (formerly capability 132) | Choose cylindrical; crop to full coverage |
| PHS-R206 | Focus stacking (formerly capability 133) | Stack two frames focused at different depths |
| PHS-R207 | Average stack (formerly capability 134) | Average tripod frames; result opens as a new photo |
| PHS-R208 | Median stack (formerly capability 135) | Median of five frames removes a transient object |
| PHS-R209 | Alignment before merging, with per-photo confidence (formerly capability 136) | Check alignment on handheld frames |
| PHS-R210 | Merge diagnostics naming the photo or pair at fault (size, count, memory, overlap) (formerly capability 137) | Stack two different sizes; the offending photo is named |

### Workflow and batch

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PHS-R211 | Copies the full edit recipe in-session (formerly capability 138; design item 60) | Copy on photo A |
| PHS-R212 | Pastes the copied recipe to another photo as one undo step (formerly capability 139; design item 60) | Paste on photo B; one undo restores |
| PHS-R213 | Copies only chosen setting groups (formerly capability 140) | Copy Light and Color groups only |
| PHS-R214 | Pastes only chosen setting groups (formerly capability 141) | Paste without the crop group |
| PHS-R215 | Syncs chosen setting groups across the batch queue (formerly capability 142) | Batch with the look but not the crop |
| PHS-R216 | Batch rename rules with tokens ({name}, {n}, {date}, {preset}, {w}, {h}) and live preview (formerly capability 143) | Rule {name}-{n:3} names outputs in order |
| PHS-R217 | Metadata templates saved in this browser (formerly capability 144) | Save a template; apply it at export |
| PHS-R218 | Named export presets (formerly capability 145) | Save a preset, reload, apply it |
| PHS-R219 | Batch export uses the active export preset settings (formerly capability 146) | Apply a preset, run batch; outputs use it |
| PHS-R220 | Contact/proof sheet as PDF or PNG pages from the queued photos (formerly capability 147) | Make a contact sheet; a PDF downloads |
| PHS-R221 | Watermark presets (text or image, anchor, size) (formerly capability 148) | Save a watermark preset; export stamps it |
| PHS-R222 | Delivery-size presets described by purpose (4K screen, web, social feed, thumbnail) (formerly capability 149) | Choose thumbnail; dimensions update |
| PHS-R223 | Print-size and PPI planner for ISO, North American and photo papers (formerly capability 150) | Choose 8×10 in; density and size report |
| PHS-R224 | Field-level differences between current edits, snapshots and saved variants (formerly capability 151) | Compare a snapshot; Exposure 0.70 lists |
| PHS-R225 | Reorderable batch queue with per-file cancel and retry (formerly capability 152) | Reorder, cancel one, retry a failed one |
| PHS-R226 | Applies the current recipe to several chosen files with per-file status and failure isolation (formerly design item 62) | Batch three files with one bad; two succeed, one fails |
| PHS-R227 | Downloads batch output as one ZIP archive | Batch three photos as ZIP; one archive with three files |
| PHS-R228 | Templates with placeholder slots that each take a photo | Create a two-slot template; drop photos into each slot |
| PHS-R229 | CSV-driven batch generation: each CSV row fills a template's slots and text, output as a ZIP | Load a 3-row CSV; a ZIP of three images downloads |
| PHS-R230 | Smart mockup replacement: swaps the photo in a placeholder while keeping its mask, transform, perspective, shadow and blend | Replace the photo in a mockup slot; framing and shadow stay |

### Export and delivery

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PHS-R231 | Exports JPEG, PNG and WebP, offering only formats whose encoder produces the requested type (formerly capability 153) | Export PNG; file is image/png with the right extension |
| PHS-R232 | States lossless or lossy behaviour per format, with a lossless AVIF option (formerly capability 154) | Choose TIFF; format facts say Lossless |
| PHS-R233 | Resampling choice for final resize: browser, Lanczos, Mitchell, Catmull-Rom (bicubic), bilinear (formerly capability 155) | Choose Lanczos; output is the requested size |
| PHS-R234 | TIFF export (formerly capability 156) | Export TIFF; an independent decoder reads it back |
| PHS-R235 | AVIF export encoded in a worker (formerly capability 157) | Export AVIF; decodes back at the planned size |
| PHS-R236 | Converts to and embeds an ICC output profile in JPEG, PNG, WebP and TIFF (formerly capability 158) | Convert to a profile; export carries it |
| PHS-R237 | Applies a metadata template at export, filling only empty fields and leaving location out unless opted in (formerly capability 159) | Export with a template; location absent |
| PHS-R238 | Export presets save and reuse every export setting (formerly capability 160) | Save, reload, apply; every setting matches |
| PHS-R239 | Exports one photo through several presets in sequence (formerly capability 161) | Export 2 versions; two files download |
| PHS-R240 | Resolves duplicate output names as numbered copies and never overwrites a file in a chosen folder (formerly capability 162) | Export two scene.jpg; second is scene (2).jpg |
| PHS-R241 | Export manifest (JSON or CSV) with dimensions, format, metadata policy, profile and safety scaling (formerly capability 163) | After multi-export the manifest shows |
| PHS-R242 | Save to file and Export to a folder through File System Access where available, with downloads as the fallback (formerly capability 164) | In Chromium, Save to file writes the chosen file; elsewhere a download starts |
| PHS-R243 | Quality control for lossy formats | Set JPEG quality 60; file is smaller |
| PHS-R244 | Resize by original, percentage, exact width/height, long edge or short edge, keeping aspect ratio (formerly design item 7) | Long edge 1200 on a portrait; height 1200 |
| PHS-R245 | Editable output file name with a safe extension matching the format | Type a name with reserved characters; it is cleaned |
| PHS-R246 | Solid background colour for JPEG export of transparency | Export a transparent canvas as JPEG on white |
| PHS-R247 | Output sharpening: none, screen low, standard, high | Choose screen standard; export is sharper; recipe unchanged |
| PHS-R248 | Metadata policy: strip (pixels only), descriptive + rights, or custom groups; original metadata is never copied automatically | Strip; exported file carries no metadata |
| PHS-R249 | Metadata editor (title, creator, copyright, keywords, location, GPS, alt text and more) with XMP sidecar download | Fill fields; download sidecar; fields present |
| PHS-R250 | Embeds reviewed XMP in JPEG, PNG, WebP and TIFF; a packaging failure keeps the pixel export and reports it | Export PNG with metadata; XMP iTXt present |
| PHS-R251 | Probes canvas limits, shows planned dimensions, and requires an explicit safe size before an oversized export | Request 40000 px; export blocks until the safe size is chosen |
| PHS-R252 | Don't enlarge option keeps small photos at their size for delivery presets | Thumbnail preset on a small photo; size unchanged |
| PHS-R253 | PPI value written to the sidecar and TIFF resolution | Set 300 ppi; TIFF resolution reads 300 |
| PHS-R254 | SVG export wrapping the rendered image | Export SVG; file opens in a browser at the planned size |
| PHS-R255 | Lists every shipped open-source notice with a working link | Open-source components; every link loads |

### Excluded by platform limits

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PHS-R256 | General-purpose tethered camera control | — |
| PHS-R257 | Operating-system display calibration or monitor-profile installation | — |
| PHS-R258 | Direct printer-driver control | — |

### Non-functional

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PHS-R259 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) and passes the colour-contrast check in dark | Switch the site theme to dark; workspace colours follow; axe colour-contrast passes |
| PHS-R260 | No horizontal overflow from 320 to 2560 px | Viewport check at 320, 375, 768, 1024, 1440, 1920, 2560 px |
| PHS-R261 | No serious or critical axe violations in any panel | Axe on every panel with sections expanded |
| PHS-R262 | Core editing and export are keyboard operable; Escape disarms any canvas tool | Undo/redo and Escape from the keyboard |
| PHS-R263 | Reduced-motion preference disables non-essential animation | Emulate reduced motion; no transitions |
| PHS-R264 | Pinch-to-zoom and two-finger pan on the canvas | On a touch screen, pinch zooms and two fingers pan |
| PHS-R265 | A stale render cannot replace a newer revision | Overlapping renders resolve to the newest |
| PHS-R266 | Heavy pixel work runs in a worker with a main-thread fallback | Disable Worker; editing still renders |
| PHS-R267 | A decode failure names the file and keeps the current document | Open malformed RAW; previous photo stays |
| PHS-R268 | Works offline once loaded; heavy decoders are cached on demand | Go offline; recover a RAW project |
| PHS-R269 | Source files stay immutable; edits are a serializable recipe | Export; original bytes unchanged |
| PHS-R270 | No network requests carry photo data; all processing is local | Network log during edit and export shows only site files |

## Non-functional requirements

Theme, responsive layout, accessibility, keyboard operation, reduced motion, render correctness, offline behaviour and local processing are the rows under "Non-functional" above.

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Technique decisions

None recorded. Background removal (under "Selection and masking") is decided with the ML ruleset before it is built.

## Intent not recorded

- Whether the social and print crop presets list more ratios than 4:5, 9:16, 5:7 and 8:10 (owner may override).

## Change log

- 2026-10-05 — Created: 270 requirements as built at `947272db`.

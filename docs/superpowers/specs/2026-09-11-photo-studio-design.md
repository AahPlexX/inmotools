# Photo Studio Design

**Date:** 2026-09-11

## Product intent

Photo Studio is a local-first, non-destructive photo editor for INMOTOOLS. It must be approachable to a first-time editor while still providing controls that experienced photographers can use deliberately. Source pixels stay on the device. Edits are represented as parameters and reversible operations until export.

The initial production release targets JPEG, PNG, WebP, and other still-image formats that the browser can decode reliably. The import boundary is intentionally modular so additional decoders can be added without changing the editor state model or rendering pipeline.

## Definition of done

A release is complete when all of the following are true:

1. The tool is reachable from the INMOTOOLS catalog and lazy workspace router on GitHub Pages.
2. A user can open a supported local photo, make reversible edits, inspect before/after, undo/redo, reset individual controls, and export a rendered copy.
3. At least 30 distinct editing capabilities are functional, not decorative controls.
4. Common workflows are grouped into understandable sections rather than exposing a wall of sliders.
5. The editor remains keyboard usable, responsive at narrow widths, zoom-safe, and usable with touch/pointer input.
6. Export supports JPEG, PNG, and WebP where the browser encoder supports them, quality controls where applicable, resize controls, filename editing, metadata policy, standards-based XMP sidecar export, and editable descriptive/rights/location tags.
7. The app detects render/export capability limits instead of allowing silent blank-canvas or failed exports.
8. Focused unit/browser coverage verifies edit math, history, metadata serialization, the primary editing flow, narrow reflow, and export behavior.
9. The existing repository validation and Pages deployment complete without a new regression attributable to Photo Studio.

## Experience architecture

The workspace uses five zones:

- **Top command bar:** open, undo, redo, before/after, fit/zoom, reset, export.
- **Canvas stage:** checkerboard-capable image surface with pan/zoom, crop guides, pointer tools, clipping indicators, and before/after split.
- **Tool rail:** Edit, Crop, Local, Retouch, Inspect, Export.
- **Inspector:** grouped controls with search-friendly labels, numeric values, reset buttons, and short plain-language help.
- **Status strip:** source dimensions, zoom, render state, color readout, and export-capability warning when relevant.

On narrow screens the inspector becomes a bottom sheet/stacked region without hiding the image behind fixed-width panels. Essential actions remain directly reachable and advanced groups use disclosure controls.

## Editing capabilities

The first production target contains these functional capabilities.

### Geometry and framing

1. Free crop.
2. Aspect-ratio crop presets plus custom ratio.
3. Straighten in fractional degrees.
4. Rotate 90 degrees.
5. Horizontal flip.
6. Vertical flip.
7. Resize by pixels or percentage with aspect lock.
8. Lens/barrel-pincushion distortion correction.
9. Horizontal perspective/keystone correction.
10. Vertical perspective/keystone correction.

### Light and tone

11. Exposure in EV.
12. Contrast.
13. Highlights recovery/compression.
14. Shadow lift/compression.
15. White point.
16. Black point.
17. Midtone/gamma control.
18. Multi-point luminance tone curve.
19. Clipping-warning overlay.
20. Histogram with live luminance/RGB distribution.

### Color

21. White-balance temperature.
22. Tint.
23. Saturation.
24. Vibrance with lower weighting for already-saturated pixels.
25. Eight-range hue adjustment.
26. Eight-range saturation adjustment.
27. Eight-range luminance adjustment.
28. Shadow color grading.
29. Midtone color grading.
30. Highlight color grading.
31. Black-and-white mix using color-channel weights.

### Detail and atmosphere

32. Texture/fine-detail enhancement.
33. Local contrast/clarity.
34. Dehaze/haze softening.
35. Sharpen amount.
36. Sharpen radius.
37. Sharpen threshold.
38. Luminance noise reduction.
39. Chroma noise reduction.
40. Chromatic-fringe correction.

### Local editing and retouching

41. Dodge brush.
42. Burn brush.
43. Saturation/desaturation brush.
44. Blur/sharpen brush.
45. Radial adjustment mask.
46. Linear-gradient adjustment mask.
47. Luminance-range mask.
48. Hue-range mask.
49. Mask feather/opacity/invert controls.
50. Manual red-eye correction circles.
51. Clone spots with explicit source and destination.
52. Healing spots using a blended source sample.

### Finishing and workflow

53. Edge vignette with midpoint/feather.
54. Film-style monochrome/chroma grain control.
55. Color sampler with RGB, HSL, and hexadecimal readout.
56. Side-by-side and draggable split before/after comparison.
57. Unlimited-session undo/redo within a bounded memory history.
58. Named snapshots.
59. Built-in starting presets that remain fully editable.
60. Copy/paste edit recipe between loaded images.
61. Project recipe export/import as JSON without embedding source pixels.
62. Batch application of the current recipe to multiple selected files with explicit per-file status.

## Rendering model

### Source and preview

- The source `File` remains immutable.
- `createImageBitmap()` decodes source pixels with image orientation respected.
- A preview bitmap is resized to a device-appropriate working edge for responsive interaction.
- Expensive pixel operations execute in a dedicated module worker when the browser exposes the required APIs. A main-thread fallback remains available rather than making the tool unusable.
- Pixel math uses floating-point intermediates even when decoded source/output channels are 8-bit.
- Geometry changes are normalized and applied consistently to preview and final export.

### Operation graph

The document stores a serializable `PhotoRecipe` rather than destructive canvas snapshots. The stable order is:

1. source orientation
2. crop/rotate/flip/perspective/lens transform
3. global linear-light exposure/white-balance operations
4. tone and color transforms
5. detail operations
6. local masks/retouch operations
7. finishing effects
8. output resize and encoding

History stores recipe revisions, not duplicate full-resolution pixel buffers. Pointer strokes are simplified before history insertion to keep memory bounded.

### Capability-aware export

Browsers impose device-dependent canvas dimension/area limits. Before full-resolution export the tool probes a safe canvas capability. If the requested dimensions exceed the verified limit, the UI must clearly offer a maximum-safe render size instead of attempting an export that may become blank or fail.

PNG is always offered when canvas encoding is available. JPEG/WebP are offered only after an encoder capability probe confirms that the requested MIME type is produced rather than silently falling back to PNG.

## Metadata and export

The export panel separates pixel encoding from metadata.

### Pixel output

- JPEG, PNG, WebP when supported.
- Quality slider for lossy outputs.
- Original dimensions, custom dimensions, percentage, long-edge, and short-edge resize modes.
- Resampling happens once at final export.
- Editable filename with safe extension synchronization.
- Optional solid background when exporting transparency to JPEG.
- Optional output sharpening: none, screen-low, screen-standard, screen-high.
- PPI field retained in the export recipe and standards-based sidecar metadata; no misleading claim is made that browser canvas encoding necessarily writes arbitrary physical-resolution tags into every format.

### Metadata policy

The user can choose:

- **Strip metadata:** rendered pixels only.
- **Descriptive + rights:** export only fields the user can review in Photo Studio.
- **Custom:** select individual metadata groups.

Editable fields include title, headline, description/caption, creator, credit, copyright notice, usage terms, source, job identifier, rating, label, keywords, hierarchical keywords, city, state/province, country, sublocation, GPS latitude/longitude/altitude, creation date, and accessibility alt text/extended description.

The editor serializes these fields to an XMP packet using IPTC Core/Extension and common Dublin Core/XMP namespaces where applicable. XMP sidecar download is always available. Embedded metadata is added only for output formats where our byte-level writer has deterministic coverage and verification; unsupported embedding falls back to an explicit sidecar rather than silently dropping metadata.

Original sensitive metadata is never copied automatically into a newly rendered output. Camera/location information must be intentionally selected in the custom export policy.

## State model

`PhotoDocument` owns source identity, source dimensions, metadata inspection, active recipe, history, snapshots, and render status.

`PhotoRecipe` contains:

- geometry
- light/tone
- color/HSL
- detail
- local adjustments
- retouch operations
- finishing
- export defaults

All numeric values have documented domains and neutral defaults. Reducer actions clamp values at the state boundary so renderers never receive invalid values.

## Performance boundaries

- Preview edge defaults to a maximum near 1600 CSS-independent source pixels and can be reduced automatically for constrained devices.
- Render requests carry monotonically increasing revision IDs; stale worker results are discarded.
- Sliders coalesce preview requests to animation frames.
- Full-resolution rendering begins only on explicit export.
- Object URLs and ImageBitmaps are revoked/closed when replaced or on unmount.
- History stores recipes and vector operations, never duplicate source files.
- Batch export processes files sequentially by default to avoid multiplying peak memory.

## Accessibility and responsive behavior

- Every icon-only control has an accessible name and visible tooltip/help text on focus/hover where useful.
- Sliders pair with numeric inputs so precision does not depend on dragging.
- Pointer actions have button/form alternatives where feasible; crop values can be edited numerically.
- Undo/redo, open, export, before/after, zoom, and reset are keyboard accessible.
- Visible focus states are preserved.
- Status/progress announcements use polite live regions.
- The canvas has text alternatives/status describing the loaded image and active transform; editing controls remain DOM-based rather than canvas-only.
- At 320 CSS px width the interface reflows without requiring horizontal page scrolling for primary controls.
- Reduced-motion preferences disable nonessential panel/canvas transition animation.

## Error handling

- Decode failure names the unsupported file without destroying the current document.
- Worker initialization failure falls back to the synchronous renderer and reports reduced performance only when relevant.
- A stale render result cannot replace a newer revision.
- Unsupported export MIME types are hidden/disabled after capability probing.
- Oversized export requests provide a safe maximum rather than producing blank data.
- Metadata serialization failure cannot invalidate the rendered image; pixel export remains available and the metadata error is reported separately.
- Batch failures are isolated per file and do not discard successful outputs.

## Testing strategy

### Unit

Cover neutral-default identity, exposure math, tone/HSL clamping, curve interpolation, geometry normalization, recipe reducer/history semantics, mask falloff, metadata XMP escaping/serialization, output filename/format selection, and capability decisions.

### Browser

Cover load -> adjust -> before/after -> undo/redo -> export, crop/rotate, metadata editing + sidecar download, batch recipe application, stale-render rejection, unsupported-format messaging, keyboard operation, and reflow at phone portrait/landscape plus a wide desktop viewport.

### Deployment

Add Photo Studio to the focused-spec selector. Catalog/router changes are global paths and therefore continue to receive the repository's full-suite Pages validation while tool-only follow-up commits select the Photo Studio browser spec.

## Release decomposition

### Milestone A — Foundation and global editor

Catalog/router wiring, document model/history, preview/export renderer, geometry, global light/color/detail/finish controls, histogram, before/after, and safe JPEG/PNG/WebP export.

### Milestone B — Local tools and retouching

Brush strokes, radial/linear/range masks, red-eye, clone/heal operations, and mask overlays.

### Milestone C — Professional export and workflow

Metadata inspector/editor, XMP sidecars/verified embedding, snapshots/presets, recipe import/export, batch recipe application/export, export sharpening, and capability-aware error surfaces.

### Milestone D — Hardening

Focused regression suite, mobile/reflow/accessibility passes, memory/object-URL cleanup verification, large-image capability testing, full repository CI, and live GitHub Pages verification.

Each milestone must leave the tool usable and must not claim later-milestone capabilities before they are implemented.
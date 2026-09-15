# Photo Studio Capability Expansion Design

**Date:** 2026-09-12

## Purpose

This addendum extends the approved Photo Studio design with a stricter capability rule: Photo Studio must include every materially useful photo-editing function that is realistically deliverable inside the existing INMOTOOLS architecture and GitHub Pages deployment. The original feature inventory is a floor, not a stopping point.

A candidate capability may be excluded only when it is:

1. technically infeasible in the browser/static-hosting environment;
2. unrelated to photo editing, photo inspection, photo workflow, photo metadata, or photo output;
3. fully superseded by an already planned or implemented capability; or
4. excluded for another reason that is written into the authoritative tracker with explicit rationale before completion.

No capability may disappear silently from the audit.

## Completion impact

Photo Studio cannot be marked complete merely because the original design checklist is exhausted. Before release closure, the authoritative tracker must contain a capability ledger that accounts for every item in this addendum as one of:

- **implemented and verified**;
- **implementation scheduled in the current release**;
- **environment-limited exclusion**, with the precise platform limitation;
- **unrelated exclusion**, with the scope boundary;
- **superseded**, naming the replacement capability; or
- **other exclusion**, with explicit rationale.

Items categorized as implementation scheduled remain release blockers until implemented and verified.

## Architecture guardrails

Capability growth must preserve the existing Photo Studio invariants:

- source files remain immutable;
- edits remain non-destructive and serializable;
- preview and export use equivalent operation semantics;
- large or expensive work runs off the main thread where practical;
- feature modules that add substantial codec/runtime weight are dynamically loaded only when required;
- browser/device memory limits are capability-checked rather than ignored;
- unsupported advanced APIs use a documented fallback when a practical fallback exists;
- local processing remains the default architecture;
- accessibility, keyboard operation, touch/pointer operation, narrow reflow, and reduced-motion behavior remain release requirements;
- new controls must never be decorative or inert;
- every new state-bearing feature participates correctly in reset, undo/redo, snapshots/project persistence, and export where semantically applicable.

## Expanded capability inventory

### A. Input, decoding, and source acquisition

1. Drag-and-drop photo opening.
2. Clipboard image paste with permission/capability fallback.
3. Mobile camera capture through standard file-input capture behavior where supported.
4. Browser-decodable raster import through the existing native path.
5. TIFF import through a dynamically loaded decoder, including high-bit-depth source data where the selected decoder supports it.
6. Camera RAW import through a dynamically loaded worker/WASM decoder adapter.
7. RAW embedded-preview extraction for fast initial viewing when available.
8. RAW development controls exposed only when the decoder provides the required source data: exposure baseline, white balance, highlight handling, demosaic choice where practical, and camera/source metadata inspection.
9. Source color-profile detection where profile data is available.
10. Source metadata inspection separated from export metadata policy.
11. Multi-file open/queue workflow without retaining all decoded full-resolution images simultaneously.
12. Duplicate-file/source detection inside the active local project where a stable local fingerprint can be computed economically.

### B. Project persistence and variants

13. Local project autosave using browser durable storage.
14. Crash/reload recovery of the active project state.
15. Explicit local project save/load.
16. Storage quota/capability reporting and graceful degradation when durable storage is unavailable.
17. Virtual copies/variants that share one immutable source while maintaining independent recipes.
18. User-named variants.
19. Variant duplication.
20. Variant deletion with confirmation/undo-safe workflow.
21. User presets stored locally.
22. Preset rename, duplicate, delete, import, and export.
23. Snapshot rename.
24. Snapshot delete.
25. Snapshot duplicate.
26. Project-level recipe/version migration with explicit compatibility handling.

### C. Comparison, navigation, and proofing

27. Draggable before/after split.
28. Side-by-side before/after mode.
29. Hold-to-view-original shortcut.
30. Synchronized zoom/pan between comparison views.
31. Multiple pinned color samplers.
32. RGB, HSL, and hexadecimal sampler readouts retained from the base design.
33. Lab/XYZ readout when an active color-management transform makes it meaningful.
34. Luminance waveform.
35. RGB parade.
36. Vectorscope.
37. Focus/detail map based on deterministic local edge/detail energy.
38. Exposure-zone overlay.
39. Gamut-warning overlay for the selected proof/output profile.
40. Pixel-coordinate readout.
41. Navigator/minimap for highly zoomed images.
42. Configurable background/checkerboard for evaluating edges and transparency.

### D. Crop, composition, and geometry

43. True custom crop ratio.
44. Direct crop handles on the image.
45. Movable crop frame.
46. Rule-of-thirds overlay.
47. Golden-ratio/spiral composition overlay where useful.
48. Diagonal composition overlay.
49. Configurable grid overlay.
50. User guides/rulers where practical in the responsive canvas.
51. Crop rotation/straighten interaction directly on the image.
52. Free transform with independent scale/translate/rotate.
53. Perspective corner transform in addition to numeric keystone correction.
54. Mesh warp for deliberate local geometry edits.
55. Liquify-style push/pull/restore tools implemented deterministically.
56. Canvas expansion with configurable background/transparency.
57. Trim-transparent-borders command.

### E. Tone and color

58. Per-channel RGB tone curves in addition to luminance curve.
59. Levels with black, gamma, white, and output endpoints.
60. Channel mixer.
61. Selective color controls where their behavior is distinct from existing HSL ranges.
62. Deterministic automatic tone suggestion with reversible numeric output.
63. Deterministic automatic white-balance suggestion with reversible numeric output.
64. Color-temperature eyedropper using a sampled neutral target.
65. Imported 3D LUT application from common `.cube` files.
66. LUT strength/opacity.
67. LUT export when the active transform can be faithfully represented by the supported LUT format.
68. Color-profile conversion through a standards-based ICC transform engine.
69. Assign-profile versus convert-profile distinction where source data permits it.
70. Soft-proof output profile selection.
71. Rendering-intent selection when supported by the color transform engine.
72. Black-point compensation where supported.
73. Output gamut warning tied to proof profile.
74. Color readout before/after the selected proof transform.

### F. Selection and masking

75. Rectangular selection.
76. Elliptical selection.
77. Polygon/lasso selection.
78. Color-tolerance selection.
79. Luminance-based selection.
80. Selection add/subtract/intersect combination modes.
81. Selection feather.
82. Selection grow/shrink.
83. Selection invert.
84. Selection clear/deselect.
85. Convert selection to local mask.
86. Mask rename.
87. Mask duplicate.
88. Mask delete.
89. Mask visibility toggle.
90. Mask overlay visualization.
91. Mask overlay opacity/color controls.
92. Brush-mask erase mode.
93. Brush hardness.
94. Brush flow.
95. Brush spacing.
96. Brush pressure response where pointer pressure is available.
97. Brush stroke smoothing.
98. Local mask combine add/subtract/intersect semantics.

### G. Retouch and detail

99. Clone/heal source locking and source-offset visualization.
100. Multi-stroke clone/heal workflow.
101. Spot list visibility/bypass controls.
102. High-pass detail layer/effect.
103. Gaussian blur.
104. Median noise/filter operation.
105. Edge-preserving/bilateral smoothing where performance remains interactive.
106. Frequency-separation workflow with editable low/high-frequency components.
107. Additional deterministic defringe controls by hue/range where distinct from chromatic-aberration correction.
108. Moiré reduction control where a deterministic algorithm performs reliably.
109. Hot/dead-pixel correction for isolated defects.
110. Dust/spot visualization mode based on high-pass/local contrast.
111. Output/detail preview at 100% with explicit warning when judging sharpening/noise below 100% zoom.

### H. Layers and compositing

112. Additional image layers imported from local files.
113. Layer rename.
114. Layer reorder.
115. Layer visibility.
116. Layer opacity.
117. Core photographic blend modes: normal, multiply, screen, overlay, soft light, hard light, darken, lighten, color, luminosity, hue, and saturation.
118. Layer masks.
119. Adjustment layers backed by the same deterministic recipe operations where practical.
120. Non-destructive layer transform.
121. Layer duplicate.
122. Layer delete.
123. Layer grouping if the implemented stack complexity justifies it.
124. Text/watermark layer.
125. Image watermark/logo layer.
126. Basic shape overlays useful for proofing/annotation.
127. Layer-aware export flattening without mutating project state.

### I. Multi-image photographic operations

128. Exposure fusion from bracketed images.
129. HDR merge where source data and memory allow.
130. Tone mapping of merged HDR data into standard output.
131. Panorama stitching.
132. Panorama projection/crop controls supported by the selected stitching engine.
133. Focus stacking using deterministic sharpness selection/blending.
134. Average stack for noise reduction/long-exposure simulation.
135. Median stack for transient-object/noise suppression.
136. Alignment before stack/merge operations where the selected library provides reliable registration.
137. Merge failure diagnostics that identify incompatible dimensions/source count/memory constraints.

### J. Workflow and batch operations

138. In-session copy edits.
139. In-session paste edits to another source as one undo step.
140. Copy only selected adjustment groups.
141. Paste only selected adjustment groups.
142. Sync edits across a selected batch queue.
143. Batch rename rules.
144. Metadata templates.
145. Export presets.
146. Batch export presets.
147. Contact sheet/proof sheet generation.
148. Watermark presets.
149. Resize presets for common delivery targets without hard-coding service brands into the editing model.
150. Print-size/PPI calculator.
151. Recipe diff/summary between two variants or snapshots.
152. Reorderable batch queue with per-file cancel/retry.

### K. Export and delivery expansion

153. Existing JPEG/PNG/WebP exports retained with capability probing.
154. Explicit lossless/lossy behavior where the selected output codec exposes it.
155. High-quality resampling method selection for final resize when multiple deterministic kernels are implemented.
156. 8/16-bit TIFF export if the selected browser-compatible encoder passes fidelity and memory verification.
157. Additional modern still-image output only when a browser/WASM encoder can be capability-probed and validated without silent format fallback.
158. ICC output-profile conversion/embedding where the target format writer supports it.
159. Metadata-template application at export.
160. Export recipe naming/save/reuse.
161. Multi-output export: render one source to several named export presets sequentially.
162. Export collision handling for duplicate filenames.
163. Export manifest summarizing output dimensions, format, metadata policy, profile, and any safety scaling.
164. File System Access save/open integration as progressive enhancement only; ordinary file input/download remains the universal fallback.

## Progressive-enhancement boundaries

The following platform APIs may improve Photo Studio but must never become the sole path when a practical cross-browser fallback exists:

- File System Access API;
- Clipboard image reading;
- WebCodecs image decoding;
- OPFS synchronous worker handles;
- pointer pressure;
- additional hardware acceleration paths.

Feature detection must drive the UI so unsupported controls are hidden/disabled with truthful explanation rather than failing after user work is invested.

## Known environment-limited exclusions

These are currently excluded because the static browser environment cannot provide a reliable general implementation across the intended user base:

1. **General-purpose tethered-camera control.** Browser APIs do not provide a stable, vendor-independent control surface for the range of professional cameras expected by a general photo editor. Source capture through normal file/camera input remains supported.
2. **Operating-system display calibration or monitor-profile installation.** Photo Studio can perform in-app profile transforms and soft proofing, but it cannot configure the user’s OS/display calibration pipeline.
3. **Direct printer-driver control.** Photo Studio can prepare print dimensions/profile-aware files and proof sheets, but a static web app cannot reliably control native printer drivers across platforms.
4. **Unlimited full-resolution memory.** Browser/device memory and canvas/texture limits are finite. Photo Studio must tile, stream, dynamically reduce previews, or offer a verified safe maximum rather than claiming unlimited megapixel capacity.

No `other` exclusion exists at the time of this addendum. If one arises, it must be called out explicitly in the tracker and user-facing progress report before release closure.

## Verification rule

Every implemented capability must have the narrowest meaningful verification layer:

- pure math/state/codec contracts: focused unit tests;
- worker message and stale-result contracts: focused worker/unit tests plus browser coverage when timing can be made deterministic;
- direct manipulation, keyboard/touch/pointer, persistence, import/export, and progressive enhancement: focused browser tests;
- heavyweight codecs/merges: small deterministic fixtures plus memory/error-path tests;
- final release: exact integrated `origin/main` unit/build/focused browser evidence followed by exact-SHA Pages deployment verification.

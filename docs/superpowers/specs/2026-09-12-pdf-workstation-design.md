# PDF Workstation Design

## Goal

Evolve the existing `pdf-sanitizer` route into a local-first PDF editor, document annotation, digital-form, legal-review, OCR, security, archival-preflight, and export workstation that remains approachable for first-time users while providing credible professional workflows for paralegals, records teams, educators, archivists, and document-heavy office work.

The existing splice/sanitize behavior remains available and regression-protected. This is an expansion of the existing tool, not a second competing PDF tool.

## Product boundary

PDF Workstation runs entirely in the browser on the static GitHub Pages deployment. Source files remain local unless a future feature explicitly tells the user otherwise. The editor must never imply a stronger guarantee than the underlying operation provides.

The workstation distinguishes three edit classes in the UI:

- **Reversible/editor-layer** — annotations, overlays, comments, measurements, staged form edits, and other operations that can be removed before export.
- **Structural** — page order, forms, metadata, attachments, page boxes, encryption, optimization, and other changes to PDF structure.
- **Destructive** — flattening, raster redaction, sanitization, or other operations that intentionally remove editability or underlying source data.

Every destructive operation requires a clear pre-export summary and an equivalent non-drag/keyboard-operable confirmation path.

## Current repository and dependency baseline

Research baseline: 2026-09-12.

- Existing writer/manipulator: `pdf-lib@1.17.1` (already pinned; upstream latest stable remains 1.17.1).
- Planned renderer/text/annotation parser: `pdfjs-dist@6.3.289`.
- Planned OCR worker: `tesseract.js@7.0.0`.
- Planned custom-font helper: `@pdf-lib/fontkit@1.1.1`.
- Planned structural security/optimization worker adapter: `qpdf-run@0.2.1`, accepted only after a repository browser smoke test proves worker asset loading under the GitHub Pages base path.
- Planned PKI/CMS engine for local signature work: `pkijs@3.4.0`, accepted only after the signature milestone proves exact PDF ByteRange/incremental-update compatibility.
- All package versions must remain exact pins. No `^`, `~`, floating tags, or unversioned CDN imports.

Dependencies are introduced only in the milestone that needs them. A planned dependency does not become a runtime dependency until focused tests justify it.

## Architecture

### Document model

React owns a deterministic workstation model containing source documents, page identities, page-order operations, editor-layer objects, form definitions, metadata, export settings, safety state, and history. Large binary buffers do not get duplicated in React state unnecessarily.

### Write path

`pdf-lib` remains the primary high-level writer for page manipulation, new content, AcroForms, standard metadata, attachments, and deterministic PDF rebuilds. Existing `pdf-engine.ts` safety rules remain compatible.

### Render/read path

PDF.js provides page rendering, text extraction, text-selection geometry, annotation inspection, document metadata inspection, and visual comparison. Rendering is lazy by page and canceled when a page leaves the active viewport.

### OCR path

Tesseract.js is lazy-loaded only when OCR is requested. OCR runs in workers and exposes progress/cancel controls. Searchable text-layer export is generated from reviewed OCR geometry rather than silently treating recognition as ground truth.

### Structural security path

qpdf WASM is isolated behind a typed worker adapter. It is used only for capabilities it is designed to provide: encryption/decryption with an authorized password, permissions, linearization, structural inspection, and compatible optimization transforms. It is not used as a semantic text editor.

### Signature path

The signature milestone uses Web Crypto plus a reviewed CMS/X.509 library and a PDF-specific incremental-update writer. Existing signatures must not be silently invalidated. Signature creation and signature verification remain separate operations, and local cryptographic validity is not presented as equivalent to online trust/revocation status.

### Persistence

Autosave/project recovery stores editor state in IndexedDB/local browser storage. Source PDFs are not uploaded to a server. Persisted binary data is bounded and evictable, with visible storage controls.

## Interaction model

The default desktop layout is four regions: document/page rail, primary page canvas, tool rail, and context inspector. Narrow screens collapse rails into drawers/sheets while keeping the page viewport primary. The same document model powers every layout.

- Dragging may enhance reordering/positioning, but every drag action has a single-pointer non-drag alternative and keyboard/numeric equivalent.
- All authored controls are keyboard reachable with visible focus.
- Pointer targets meet WCAG 2.2 target-size requirements; primary toolbar controls target at least 40 CSS pixels.
- Non-canvas semantic controls remain native HTML wherever practical.
- The rendered PDF canvas is never the only source of accessible information: page number, selection, tool state, form fields, annotations, and status are represented in semantic DOM controls/lists.
- The workspace reflows without loss of controls at 320 CSS-pixel equivalent width; the page itself may use two-dimensional panning because its spatial layout is essential.
- Reduced-motion preferences disable nonessential transitions.

## Functional capability set

Every capability below must be working behavior, not a decorative control. Status is tracked independently in `src/tools/pdf/STATUS.md`.

### Document intake, diagnostics, and page operations

1. Local multi-PDF open with native file input.
2. Authorized password prompt for supported encrypted PDFs.
3. Document diagnostics summary: pages, dimensions, size, forms, metadata, attachments, encryption, active-content indicators, and structural warnings.
4. Lazy visual thumbnail page rail.
5. Multi-document merge with explicit output order.
6. Deterministic range split supporting individual pages and ranges.
7. Burst split into one PDF per page.
8. Best-fit split by target output-size ceiling with clearly reported actual sizes.
9. Extract selected pages to a new PDF.
10. Insert pages from another PDF at an exact destination.
11. Insert blank pages using common/custom sizes.
12. Duplicate pages.
13. Delete pages with undo before export.
14. Reorder pages by drag plus position selector/move controls/keyboard alternative.
15. Rotate selected pages 90/180/270 degrees.
16. Flip selected page content horizontally.
17. Flip selected page content vertically.
18. Visual page cropping.
19. MediaBox, CropBox, BleedBox, and TrimBox inspection/editing.
20. Resize page canvas with scale-content or preserve-content-position modes.
21. N-up imposition with 2-up, 4-up, and custom grids.
22. Booklet imposition with front/back spread ordering.
23. Page-label editor for Arabic/Roman/section-prefixed labels.

### Viewing, navigation, and base-content assistance

24. High-DPI PDF.js page rendering.
25. Zoom in/out, 100%, fit width, fit page, and fit selection.
26. Pan with pointer, touch, keyboard, and scroll alternatives.
27. Document text search with per-page result navigation.
28. Text selection and copy from extractable PDF text.
29. Add vector text overlays at exact coordinates.
30. Existing-text replacement workflow using explicit cover/redraw semantics rather than falsely claiming arbitrary base-object reflow.
31. TTF/OTF custom font embedding for new/replacement text.
32. Live text measurement, wrapping, alignment, line-height, and overflow warning.
33. PNG/JPEG/WebP image placement.
34. Image scale, crop, rotate, opacity, aspect lock, and stacking controls.
35. Rectangle, ellipse, line, polyline, polygon, arrow, and callout vector overlays.
36. Sanitized SVG overlay placement.
37. Select/move/resize/rotate/delete for editor-layer objects.
38. Align/distribute/snap controls for editor-layer objects.
39. Deterministic layer/order panel for editor-layer objects.
40. Undo/redo for reversible workstation actions.

### Annotation, review, stamps, and measurement

41. Highlight markup.
42. Underline markup.
43. Strikethrough markup.
44. Squiggly markup.
45. Freehand pen/stylus ink with smoothing and pressure-aware input where available.
46. Erase added ink/markup without touching base content.
47. Sticky note/comment annotations.
48. Threaded comment history in the project model with exportable author/time metadata.
49. Multi-segment callouts with text boxes.
50. Standard review/legal stamp library.
51. Custom image/SVG stamp creation.
52. Variable stamps using date, filename, page, reviewer, and custom text tokens.
53. Measurement scale calibration using two known points.
54. Linear distance measurement.
55. Polyline perimeter measurement.
56. Polygon area measurement.
57. Rulers, pointer coordinates, and calibrated unit readout.

### AcroForm workstation

58. Existing AcroForm field inventory by page, name, type, state, and flags.
59. Existing field filling.
60. Text-field authoring.
61. Checkbox authoring.
62. Radio-group authoring.
63. Dropdown authoring.
64. Multi-select option-list authoring.
65. Field properties: required, read-only, multiline, font size, alignment, defaults, and options where supported by the field type.
66. Visual/tab-order manager with explicit keyboard-order preview.
67. Deterministic calculation rules: sum, product, average, minimum, and maximum over named fields.
68. Input formatting/validation rules for date, currency, phone, numeric ranges, and user-supplied regular expressions with safe-regex checks.
69. Form-data JSON import/export.
70. Clear/reset staged form values.
71. One-click form flattening with a pre-export loss-of-editability warning and post-export verification.

### Legal, records, redaction, and document structure

72. Secure raster redaction rectangles that rebuild affected pages from rendered pixels so covered source text/vector/image data is not retained behind an overlay.
73. Optional visible redaction-reason labels.
74. Redaction verification pass that re-renders/re-extracts exported affected pages and blocks download if selected hidden text survives the defined verification check.
75. Sequential Bates numbering with prefix, suffix, start, padding, placement, and multi-document continuity.
76. Header overlays with token templates.
77. Footer overlays with token templates.
78. Text/image watermark overlays with opacity/rotation/placement controls.
79. Page numbering and `{Page}`, `{TotalPages}`, `{Date}`, `{Filename}`, `{Bates}` token expansion.
80. Hierarchical bookmark/outlines inspection and editing.
81. Interactive table-of-contents generation linked to page destinations.
82. Embedded-file attachment authoring with filename, MIME type, description, and dates.
83. Attachment inventory and extraction for supported embedded-file structures.

### Comparison and version review

84. Side-by-side synchronized page comparison.
85. Adjustable-opacity visual overlay comparison.
86. Pixel-difference heatmap with tolerance control.
87. Extracted-text diff with added/removed/changed navigation.
88. Metadata/form-field structural diff.
89. Before/after comparison of the current staged document against source state.

### OCR and scanned-document workflows

90. OCR selected pages.
91. Full-document OCR queue with progress/cancel.
92. Optional canvas preprocessing for rotation/deskew, grayscale, contrast, and threshold before recognition.
93. Searchable invisible text-layer reconstruction from reviewed OCR word geometry.
94. OCR confidence review with low-confidence navigation.
95. Search/copy/export of reviewed OCR text.

### Metadata, archival, accessibility, security, and optimization

96. Standard document metadata editor: title, author, subject, keywords/tags, creator, producer, language, creation date, and modification date.
97. XMP/Dublin Core metadata inspection/editing where a validated metadata packet can be preserved/rebuilt safely.
98. Custom XMP namespace/property editor with schema-safe serialization.
99. Metadata scrub profile with before/after report.
100. Reusable metadata/export presets stored locally.
101. Compression profiles with configurable image downsampling/quality.
102. Duplicate/unused resource cleanup where the selected engine can prove content preservation.
103. Fast Web View/linearized PDF export through the qpdf worker.
104. AES-256 password encryption with owner/user password distinction.
105. PDF permission controls for print, copy/extract, modify, annotate, form-fill, and assemble, mapped only to combinations supported by the selected encryption revision.
106. Authorized decryption/export of password-protected PDFs when the user supplies the correct password.
107. PDF/A readiness preflight report for metadata, fonts, color/profile, encryption, and other locally testable archival requirements; this is not labeled certification.
108. PDF/UA/accessibility readiness preflight for locally inspectable tagging, language, title, form, link, and image-description issues.
109. Structure/tag tree inspection where present.
110. Accessible descriptions for workstation-added images/objects and preservation into supported export metadata/tag structures.
111. Viewer-preference editor for title display, page mode, reading direction, print scaling, duplex, and related supported flags.
112. Flatten annotations/forms/editor layers into page content when explicitly requested.
113. Active-content inventory for document/open actions and embedded JavaScript detectable by the parser/structural engine.
114. Sanitization profile that removes selected metadata, attachments, actions/scripts, and other explicitly supported document-level structures, with an audit report of what was removed.
115. SHA-256 source/output checksum display and copy action.

### Signatures and certificate workflows

116. Signature-field placement and visual signature appearance design.
117. Local CMS/PKCS#7 cryptographic PDF signing using a user-supplied certificate/private-key container after the PDF incremental-update milestone is independently verified.
118. Cryptographic signature integrity verification against the embedded signer certificate and signed ByteRange.
119. Certificate detail viewer: subject, issuer, serial, validity period, key/signature algorithms, and chain material present in the file.
120. Clear separation between local cryptographic validity and external trust/revocation status; no unsupported trust claim.

### Export, batch, reproducibility, and advanced UX

121. Save edited full PDF.
122. Export selected pages as PDF.
123. Export pages as PNG/JPEG/WebP images with scale/quality controls.
124. Export extractable/reviewed text as TXT.
125. Export page/text/form/metadata diagnostics as JSON.
126. Export comments/annotations as JSON and CSV.
127. Export N-up/booklet print-ready PDF.
128. ZIP multi-file/batch outputs.
129. Per-export filename editor and deterministic batch-renaming pattern.
130. Per-export metadata/tags review before bytes are generated.
131. Export operation summary describing destructive/structural/reversible changes.
132. Export preview with page count, target profile, filename, estimated consequences, and warnings.
133. Project/recipe JSON containing reproducible workstation operations without embedding secrets.
134. Apply a saved recipe to another compatible document with a dry-run compatibility report.
135. Batch recipe execution across multiple PDFs with per-file result/error reporting.
136. Safety lens that labels each staged action as reversible, structural, or destructive before export.
137. Simple/Professional workspace modes that expose different control density without changing the document model or hiding saved edits.
138. Searchable command palette for tools/actions.
139. Discoverable keyboard-shortcut help; shortcuts never replace labeled controls.
140. Local session autosave, crash recovery, and bounded history timeline.
141. Touch/stylus-optimized tool layout and pointer handling.
142. Responsive drawer/sheet layout for phone portrait, phone landscape, tablets, split-screen, zoom, and enlarged text.
143. Reusable export presets.
144. Drag-and-drop intake with equivalent native file-input fallback.
145. Page/document status badges for forms, OCR, comments, redactions, encryption, signatures, and diagnostics.
146. Task-oriented starter workflows for legal filing, archive preparation, school worksheets, review/redline, form preparation, and accessibility review.

## Explicit exclusions and honest substitutions

These are not silently dropped; each is excluded for a concrete reason.

### Environment/engine constraints

- **Arbitrary semantic editing/reflow of every pre-existing PDF text/vector object** is not promised. The browser stack can reliably render/extract and can add/cover/redraw content, but `pdf-lib`/qpdf do not expose an Acrobat-style semantic object DOM. The workstation uses explicit replacement-overlay semantics unless a later independently verified content-stream editor earns a stronger claim.
- **Certified PDF/A conversion or certification** is not promised. Local readiness/preflight is included; claiming certification would require a complete conformance engine and validation corpus not currently present in this static client.
- **Full XFA form authoring/rendering** is excluded. The existing high-level form engine is AcroForm-oriented and does not provide full XFA parity.
- **Long-term signature validation with guaranteed OCSP/CRL/timestamp network reachability** is not promised by the static/offline client. Local cryptographic checks are included; network trust status may be shown only when independently reachable and clearly labeled.

### Other exclusion: security boundary

- **Executing arbitrary JavaScript embedded in untrusted PDFs** is intentionally excluded. The workstation may inventory and remove supported active content, but it will not execute document scripts as an editor feature.

### Unrelated product scope

- Cloud collaboration/accounts, server document routing, proprietary Office authoring/conversion suites, and remote storage are outside this tool. They do not improve the local PDF workstation and would violate the current static/local-first product boundary.

## Accessibility and responsive acceptance

- WCAG 2.2 AA is the minimum interaction target for the workstation UI.
- All drag interactions have same-page single-pointer non-drag alternatives.
- All functionality except inherently path-dependent freehand input is keyboard operable.
- Authored pointer targets are at least 24×24 CSS pixels or meet the criterion's spacing/equivalent exceptions; primary controls target 40+ CSS pixels.
- UI content reflows at 320 CSS-pixel equivalent width without losing controls or forcing two-dimensional scrolling. Spatial PDF/page canvases may pan because two-dimensional spatial layout is essential, but surrounding controls must reflow.
- Canvas rendering is paired with semantic DOM state, labels, controls, status, and alternatives.
- Focus is visible; dialogs/sheets manage focus and Escape behavior; status updates use appropriate live regions.
- Text remains readable at zoom/enlarged-text settings without typographical overlap or control clipping.

## Safety invariants

- Never silently discard editable AcroForms during cross-document page copying.
- Never describe a black rectangle overlay as secure redaction.
- Never claim encryption when only a password-like form flag is present.
- Never claim a PDF/A or PDF/UA certification without a conforming validator.
- Never claim a signature is trusted merely because its cryptographic math verifies.
- Never execute embedded document scripts.
- Never send source document bytes to a server as part of normal operation.
- Destructive exports must be reinspected when a meaningful machine-check is available.

## Deterministic completion goal

PDF Workstation is complete only when all 146 capabilities above have one of three durable states in `src/tools/pdf/STATUS.md`: `verified`, `excluded` with the exact approved reason from this design, or `blocked` with a named external/technical dependency and an explicit remaining gate. `planned`, `started`, and ambiguous partial states are not completion.

For a `verified` capability:

1. The control/flow is reachable from the existing `pdf-sanitizer` route or its evolved route without a dead/decorative UI.
2. The behavior has focused unit/contract/browser evidence at the lowest meaningful level.
3. Existing sanitizer/splice safety behavior remains green.
4. Responsive and keyboard/non-drag alternatives are present where applicable.
5. Export claims match the bytes actually produced.

Project completion additionally requires:

- exact dependency pins and a frozen lockfile;
- TypeScript build green;
- repository unit suite green;
- focused PDF Playwright coverage green on desktop and mobile Chromium projects used by the repository;
- fresh adversarial/security review with all blocker/high findings closed or explicitly accepted by the user;
- the exact integrated `main` revision to pass validation;
- the corresponding GitHub Pages deployment to succeed.

No milestone may mark the overall workstation complete merely because its own controls render or its own narrow tests pass.

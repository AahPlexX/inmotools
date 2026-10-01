# PDF Workstation Status

This is the durable single-tool progress ledger for the PDF Workstation. Keep it current whenever a capability changes state. Routine PDF progress stays here rather than in repository-wide task files while other tools are developed in parallel.

## Completion contract

Design source of truth: `docs/superpowers/specs/2026-09-12-pdf-workstation-design.md`.

Capability states:

- `planned` — accepted scope, no implementation claim.
- `started` — implementation exists but the full capability contract is not yet verified.
- `verified` — implementation and fresh focused acceptance evidence both exist.
- `blocked` — external/technical dependency is named with a concrete release gate.
- `excluded` — only for an exclusion explicitly approved in the design.

Overall completion requires every capability 1–146 to be `verified`, `blocked` with an accepted disposition, or `excluded`; no capability may remain `planned` or `started`. Exact-current-main validation, adversarial/security review, and GitHub Pages deployment must also be green.

## Current state

- Branch: `feat/pdf-workstation`
- Branch creation base: `main@79ac4629c4e7110e43a81945ef5017319c4a1f76`
- Draft integration PR: **#31** (`feat(pdf): evolve sanitizer into PDF Workstation`)
- Current milestone: **B — renderer and editor-layer foundation — STARTED**
- Current gate: **high-DPI rendering and selectable/copyable PDF.js text are verified; current-page search is live but whole-document result navigation remains; numeric zoom still needs fit-width/fit-page/actual-size modes**
- Current counts: **27 verified / 7 started / 112 planned / 0 blocked / 0 excluded capabilities**
- Current integration state: branch remains intentionally isolated and has diverged substantially from current `main`; PR #31 is not presently mergeable. Reconciliation is a separate conflict-safe Milestone H task, not a reason to rewrite the branch while parallel agents are active.
- Existing `pdf-sanitizer` route/deep link remains the workstation route.

## Milestones

### A — document/export foundation — VERIFIED

Verified foundation includes:

- local multi-PDF intake;
- explicit queue ordering, merge, selected-page extraction, repeated-page duplication, and 90/180/270-degree rotation;
- deterministic blank-page insertion with common/custom sizes and copied-page anchors;
- MediaBox/CropBox/BleedBox/TrimBox inspection and bounded editing;
- complete standard metadata replacement with deterministic UTC creation/modification dates and custom output filename;
- recursive embedded-file inventory/extraction plus explicit attachment inclusion/authoring; source attachments are never silently inherited and ambiguous duplicate display names fail closed;
- text, checkbox, radio-group, dropdown, and multiselect option-list AcroForm authoring;
- required/read-only/current/reset-default (`/V` versus `/DV`) form semantics, standard font/font-size/alignment properties, rich existing-field inventory, and source-form flattening with post-export verification;
- Bates numbering, page/total/date/filename/Bates tokens, headers, footers, text watermarks, and PNG/JPEG watermarks;
- live pre-export impact review and metadata review;
- responsive 320 CSS-pixel foundation and keyboard/non-drag queue controls.

Milestone A exit evidence: workflow `34853637913` ran the PDF slice on a synthetic merge ref and passed **26/26 focused PDF unit tests**, production TypeScript/Vite build, and **30/30 focused desktop/mobile PDF browser executions**. The repository-wide failures that followed were in unrelated parallel Crystal/Vector work and were kept separate from the PDF acceptance claim.

### B — renderer and editor-layer foundation — STARTED

Implemented/proven:

- exact `pdfjs-dist@6.3.289` runtime dependency with frozen-lock/supply-chain validation;
- worker imported through Vite `?url`, producing a real fingerprinted `pdf.worker.min-*.mjs` asset under the `/inmotools/` production base;
- one reusable `PdfJsDocumentSession` owns `PDFDocumentLoadingTask`, page rendering, text extraction, cancellation, cleanup, and worker destruction;
- active source/page preview with previous/next controls;
- bounded high-DPI canvas backing store separated from CSS size, capped at 3× device pixel ratio for display-memory safety;
- numeric zoom from 25%–500%; stale canvas/text renders are cancelled rather than layered;
- selectable/copyable DOM text layer built with the public PDF.js `TextLayer` API and scoped workstation CSS;
- bounded explicit current-page text search with stale-request guards and capped result counts;
- renderer/text lifecycle contracts are unit tested and production builds are verified;
- focused desktop/mobile browser acceptance proves real-worker rendering, native text selection, current-page search, page navigation, zoom rerendering, and all earlier PDF flows together.

Still required for Milestone B exit:

- thumbnails;
- full zoom modes (fit width, fit page, actual size) and explicit pan behavior;
- whole-document text search with result-to-page navigation;
- editor object model for text/image/vector placement;
- transforms, alignment/distribution/snap, layers, undo/redo history;
- mobile/keyboard alternatives and final renderer cancellation/memory/reflow Gauntlet.

### C — annotation and measurement — PLANNED

Scope: highlight/underline/strike/squiggly, ink, comments/callouts/stamps, calibration, distance/perimeter/area, rulers/coordinates.

### D — legal, redaction, structure, and security — PLANNED

Scope: secure raster redaction + verification; bookmarks/TOC; qpdf worker adapter; encryption/decryption/permissions/linearization; active-content inventory/sanitization.

### E — OCR and comparison — PLANNED

Scope: Tesseract worker, preprocessing, searchable OCR text layer, confidence review, and visual/text/metadata/form comparison.

### F — archival, accessibility, and signatures — PLANNED

Scope: XMP, PDF/A and PDF/UA readiness/preflight, structure/tag inspection, viewer preferences, signature placement, incremental CMS signing, and local cryptographic verification.

### G — batch, recipes, and export matrix — PLANNED

Scope: recipes, dry-run/batch execution, full export matrix, ZIP outputs, batch naming, presets, diagnostics exports, safety lens, simple/pro modes, command palette, and local recovery.

### H — Gauntlet, integration, and deployment — STARTED

Already hardened:

- metadata replacement clears Info before writing selected fields so source metadata cannot leak through partial replacement;
- page-box containment validates independently in UI and engine;
- attachment name-tree parsing is bounded, avoids unsafe unbounded date parsing, validates output filenames, does not silently copy source attachments, and fails closed on ambiguous actionable names;
- form authoring validates geometry/options independently and verifies output field counts;
- reset/default form semantics persist independently from current values;
- rich form inventory mirrors PDF widget-page fallback and proves input bytes are not mutated;
- overlay inputs bound opacity/rotation/image width/Bates sequence/margins and use explicit deterministic date tokens;
- PDF.js render and text-layer work share one session/worker lifecycle; result counts and device-pixel backing scale are explicitly bounded;
- focused PDF gates have been run before unchanged global gates when moving-main failures otherwise obscured PDF evidence.

Still required: reconcile with current `main` without discarding parallel work, fresh full-surface/adversarial/security review, exact-main workflows green, and Pages deployment green.

## Capability state ledger

### Verified

- **1** Local multi-PDF open with native file input — `verified`
- **5** Multi-document merge with explicit output order — `verified`
- **9** Extract selected pages to a new PDF — `verified`
- **11** Insert blank pages using common/custom sizes — `verified`
- **12** Duplicate pages — `verified`
- **15** Rotate selected pages 90/180/270 degrees — `verified`
- **19** MediaBox/CropBox/BleedBox/TrimBox inspection/editing — `verified`
- **24** High-DPI PDF.js page rendering with bounded backing pixels and real bundled worker — `verified`
- **28** Select/copy PDF text through a selectable PDF.js DOM text layer — `verified`
- **58** Existing AcroForm field inventory — `verified`
- **60** Text-field authoring — `verified`
- **61** Checkbox authoring — `verified`
- **62** Radio-group authoring — `verified`
- **63** Dropdown authoring — `verified`
- **64** Multi-select option-list authoring — `verified`
- **65** Field properties — `verified`
- **71** One-click form flattening with pre-export loss-of-editability warning and post-export verification — `verified`
- **75** Bates numbering with prefix/suffix/start/padding/placement — `verified`
- **76** Header token overlays — `verified`
- **77** Footer token overlays — `verified`
- **78** Text/image watermarks with opacity/rotation/placement — `verified`
- **79** Page tokens for page/total/date/filename/Bates — `verified`
- **82** Attachment authoring with filename/MIME/description/dates — `verified`
- **83** Attachment inventory/extraction — `verified`
- **96** Standard document metadata editor — `verified`
- **130** Per-export metadata/tags review before bytes are generated — `verified`
- **131** Export operation summary describing destructive/structural/reversible changes — `verified`

### Started

- **3** Document diagnostics summary — `started` (page count/size/forms/common metadata/page geometry/attachments exist; active-content and richer encryption/security detail remain)
- **25** Zoom modes — `started` (25%–500% numeric zoom is browser-verified; fit width, fit page, and actual-size modes remain)
- **27** Text search — `started` (bounded current-page search is desktop/mobile browser-verified; whole-document result navigation remains)
- **121** Save edited full PDF — `started` (current supported edits export; the complete editor model is not yet present)
- **129** Per-export filename editor and deterministic batch-renaming pattern — `started` (filename editor is live; batch pattern remains)
- **142** Responsive drawer/sheet layout for phone/tablet/split-screen/zoom/enlarged text — `started` (foundation passes 320 CSS-pixel reflow; later workstation rails/drawers remain)
- **144** Drag-and-drop intake with native file-input fallback — `started` (native file fallback exists; drag/drop intake remains)

### Planned

All capability IDs not listed above remain `planned`: **2, 4, 6–8, 10, 13–14, 16–18, 20–23, 26, 29–57, 59, 66–70, 72–74, 80–81, 84–95, 97–120, 122–128, 132–141, 143, 145–146**.

No capability is currently `blocked` or `excluded`. Architectural exclusions in the design constrain claims and implementation approach; they are not numbered capabilities.

## Dependency state

Active exact PDF runtime dependencies:

- `pdf-lib@1.17.1` — deterministic high-level PDF writer/editor foundation;
- `pdfjs-dist@6.3.289` — renderer/text-display foundation; frozen-lock install, production worker asset, unit lifecycle checks, selectable text, and focused browser execution are proven.

Milestone-gated dependencies not yet added:

- `@pdf-lib/fontkit@1.1.1` — only when custom-font upload is wired and tested;
- `qpdf-run@0.2.1` — only after standalone Pages worker/base-path/security transform proof;
- `tesseract.js@7.0.0` — only with OCR worker lifecycle/progress/cancel proof;
- `pkijs@3.4.0` — only after incremental-signature/ByteRange proof.

Every introduced package remains exact-pinned and must pass frozen-lock and supply-chain policy validation.

## Evidence log

- 2026-09-12 — Metadata/workstation foundation established through workflows `34717409260`, `34717521965`, `34717591400`, `34717705502`, and `34717903615`.
- 2026-09-12 — Page/date/geometry slice finalized in `34726249725`; attachment slice finalized in `34726735769`.
- 2026-09-12 — Five-type AcroForm authoring finalized in `34729484871`; overlay/Bates/token/watermark slice finalized in `34729800517`.
- 2026-09-13 — Advanced form properties/export-impact/inventory were hardened through `34730133278`, `34798238251`, `34798518917`, and `34798685152`.
- 2026-09-14 — Milestone A focused merge-ref acceptance `34853637913`: **26/26 PDF unit**, production build, and **30/30 PDF browser** executions green; Milestone A promoted to verified.
- 2026-09-14 — Renderer pre-final run `34855762778`: **30/30 PDF unit tests** and production build green; Vite emitted the real `pdf.worker.min-*.mjs` asset. Browser failures were isolated to a base-path route in the new renderer spec and two filename locators made ambiguous by the new preview-source option, not to renderer engine assertions.
- 2026-09-15 — Renderer confirmation run `35019607950`: after the two minimal test-harness corrections, PDF unit acceptance, production build, and the complete focused PDF browser acceptance all passed. The unchanged repository unit suite and production build also passed afterward.
- 2026-09-15 — Selectable-text/search run `35020470889`: **33/33 focused PDF unit tests**, production build, and **32/32 focused desktop/mobile PDF browser executions** passed. The renderer test proves a real worker, native DOM text selection/copy, bounded current-page search, page navigation, zoom rerendering, and HiDPI output together. Capability 28 was promoted to `verified`; capability 27 remains `started` until search spans the document and navigates results.

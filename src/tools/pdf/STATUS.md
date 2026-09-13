# PDF Workstation Status

This file is the durable single-tool progress ledger for the PDF Workstation. Update it whenever a PDF Workstation capability changes state. Do not use repository-wide task files for routine PDF progress while other tools are being developed in parallel.

## Completion contract

Design source of truth: `docs/superpowers/specs/2026-09-12-pdf-workstation-design.md`.

Allowed capability states:

- `planned` — accepted scope, no completion claim.
- `started` — implementation exists but acceptance evidence is incomplete/stale.
- `verified` — implementation and the required fresh focused evidence both exist.
- `blocked` — external/technical dependency is named with a concrete release gate.
- `excluded` — only for an exclusion explicitly approved in the design.

Overall completion requires every capability 1–146 to be `verified`, `blocked` with an explicit accepted disposition, or `excluded`; no capability may remain `planned` or `started`. Exact-main validation, adversarial/security review, and Pages deployment must also be green.

## Current state

- Branch: `feat/pdf-workstation`
- Base at branch creation: `main@79ac4629c4e7110e43a81945ef5017319c4a1f76`
- Current milestone: **A — deterministic document/export foundation**
- Current gate: **attachments and visible five-type AcroForm authoring are verified; advancing to token overlays/Bates and remaining field/export properties**
- Current counts: **13 verified / 12 started / 121 planned / 0 blocked / 0 excluded capabilities**
- Draft integration PR: **#31** (`feat(pdf): evolve sanitizer into PDF Workstation`)
- Existing `pdf-sanitizer` route/deep link is preserved; the workstation evolves that surface rather than creating a duplicate tool.

## Milestones

### A — document/export foundation — STARTED

Scope: preserve existing splice/sanitizer behavior; richer inspection; metadata authoring; token overlays/Bates; page boxes; attachments; AcroForm authoring; deterministic export summary; first responsive workstation shell.

Completed/proven portions:

- local multi-file intake remains functional;
- existing queue order/page selection/form-flatten safety remains intact;
- complete standard metadata replacement UI covers title, author, subject, keywords/tags, creator, producer, language, creation date, and modification date;
- metadata dates use explicit UTC interpretation for deterministic export and reopen exactly;
- metadata replacement defensively clears the output Info dictionary before writing selected replacement fields;
- custom export filename is live;
- blank-page insertion supports Letter, A4, Legal, Tabloid, and custom dimensions, preset orientation, quantity, and exact copied-page anchors;
- final-output MediaBox/CropBox/BleedBox/TrimBox editing is live with independent UI and engine containment checks;
- final output plan/preview includes staged blank pages and stable-key geometry edits;
- attachment inventory recursively traverses valid embedded-file name trees with bounded parsing and extracts bytes only on demand;
- source attachments are never silently inherited; explicit source inclusion and new local attachment authoring both reopen correctly in desktop/mobile browser tests;
- attachment authoring supports filename, MIME type, description, creation date, and modification date with deterministic UTC handling and output inventory verification;
- text, checkbox, dropdown, radio-group, and option-list authoring are implemented through typed engine contracts and visible coordinate-first controls;
- required/read-only state, text multiline/initial value, checkbox state, dropdown options/selection, radio options/selection, and option-list multiselect/selection are live;
- staged form fields are revalidated against current final output pages after page/MediaBox changes, and export is verified against the exact expected authored-field count;
- source forms can be flattened while newly authored output fields remain editable and are verified after reopen;
- visible metadata export, blank-page insertion, page-box edits, attachments, and all five editable field types reopen correctly in browser tests across desktop/mobile Chromium;
- the responsive metadata/export foundation continues to pass the 320 CSS-pixel reflow assertion;
- export status reports source-form flattening, authored editable fields, replacement metadata, blank-page insertion, page-box mutations, and attachment authoring.

Still required for Milestone A exit:

- remaining advanced field properties in capability 65 (font, alignment, and explicit default-value semantics beyond current initial values);
- Bates/header/footer/watermark token overlays;
- deterministic export-change summary broad enough to cover every Milestone A mutation;
- focused browser evidence for all remaining behaviors.

### B — renderer and editor-layer foundation — PLANNED

Scope: PDF.js render/text layer; thumbnails; zoom/pan/search/select; overlay model; text/image/vector placement; layer transforms; history; mobile/keyboard alternatives.

Exit: renderer cancellation/memory behavior, desktop/mobile browser flows, reflow and non-drag controls verified.

### C — annotation and measurement — PLANNED

Scope: markup matrix, ink, comments, callouts, stamps, calibration/distance/perimeter/area, rulers/coordinates.

Exit: geometry and export persistence verified on representative rotated/cropped pages.

### D — legal, redaction, structure, and security — PLANNED

Scope: secure raster redaction + verification; bookmarks/TOC; qpdf worker adapter; encryption/decryption/permissions/linearization; active-content inventory/sanitization; attachments.

Exit: destructive/security operations fail closed and adversarial fixtures prove no overlay-only redaction claim.

### E — OCR and comparison — PLANNED

Scope: Tesseract worker; preprocessing; searchable OCR text layer; confidence review; visual/text/metadata/form diff.

Exit: worker cancellation, geometry mapping, scanned fixtures, and comparison navigation verified.

### F — archival, accessibility, and signatures — PLANNED

Scope: metadata/XMP; PDF/A readiness; PDF/UA readiness; structure/tag inspection; viewer preferences; signature placement; CMS signing; local cryptographic verification.

Exit: no certification/trust overclaim; signed ByteRange survives save/reopen; existing signatures are protected from silent invalidation.

### G — batch, recipes, and export matrix — PLANNED

Scope: recipes, dry-run/batch execution, full export matrix, ZIP outputs, batch naming, presets, diagnostics exports, safety lens, simple/pro modes, command palette, local recovery.

Exit: deterministic batch error isolation, bounded local persistence, export previews, and responsive workflows verified.

### H — Gauntlet, integration, and deployment — STARTED

Scope: fresh full-surface falsification, security/adversarial review, dependency/claim audit, exact-main validation, GitHub Pages deploy verification.

Current review outcome:

- Foundation Gauntlet found one privacy-robustness weakness: explicit metadata mode depended on the fresh output document having no incidental Info entries. The engine now clears the Info dictionary first and then writes only selected replacement values.
- Tests were strengthened to use real typed output-options contracts instead of casting around TypeScript and to prove a partial metadata replacement cannot leak unspecified source Info fields.
- Page-box editing uses independent UI and engine validation so invalid Crop/Bleed/Trim rectangles cannot bypass the UI to reach exported bytes.
- Attachment parsing has explicit name-tree/attachment limits, avoids the unbounded date-decoding path for untrusted attachment metadata, validates output filenames, and proves source attachments are not silently copied.
- Form authoring independently validates staged UI geometry and engine geometry/options; source-field flattening and newly authored fields use separate post-export expectations.
- Browser expansion exposed one stale Playwright text locator, not an output defect; it was narrowed to exact metric text and the full focused browser suite subsequently passed.
- Full final Gauntlet remains open because most workstation milestones are still planned.

Exit: zero blocker/high findings without explicit acceptance, exact-main workflows green, Pages deployment green, counts reconcile to the design.

## Capability state ledger

Every ID below maps one-for-one to the numbered capability in the design document.

### Verified

- **1** Local multi-PDF open with native file input — `verified`
- **11** Insert blank pages using common/custom sizes — `verified`
- **19** MediaBox/CropBox/BleedBox/TrimBox inspection/editing — `verified`
- **60** Text-field authoring — `verified`
- **61** Checkbox authoring — `verified`
- **62** Radio-group authoring — `verified`
- **63** Dropdown authoring — `verified`
- **64** Multi-select option-list authoring — `verified`
- **71** One-click form flattening with pre-export loss-of-editability warning and post-export verification — `verified`
- **82** Attachment authoring with filename/MIME/description/dates — `verified`
- **83** Attachment inventory/extraction — `verified`
- **96** Standard document metadata editor — `verified`
- **130** Per-export metadata/tags review before bytes are generated — `verified`

### Started

- **3** Document diagnostics summary — `started` (page count/size/forms/common metadata/page geometry/attachments exist; active-content and richer encryption/security detail remain)
- **5** Multi-document merge with explicit output order — `started` (queue/order behavior exists; final merged-byte order needs dedicated browser proof)
- **9** Extract selected pages to a new PDF — `started` (range/order engine and UI exist; focused download/reopen proof remains)
- **12** Duplicate pages — `started` (repeated page selections are preserved by the engine; dedicated user-flow proof remains)
- **15** Rotate selected pages 90/180/270 degrees — `started` (engine/UI exist; focused rendered/reopened proof remains)
- **58** Existing AcroForm field inventory — `started` (field count exists; page/name/type/state/flags inventory remains)
- **65** Field properties — `started` (required/read-only/multiline/options/selections are live; font, alignment, and remaining default-property controls remain)
- **121** Save edited full PDF — `started` (current supported edits export; the complete editor model is not yet present)
- **129** Per-export filename editor and deterministic batch-renaming pattern — `started` (filename editor is live; batch pattern remains)
- **131** Export operation summary describing destructive/structural/reversible changes — `started` (status reports source-form flattening, authored fields, replacement metadata, blank insertions, page-box edits, and attachments; complete action classification/summary remains)
- **142** Responsive drawer/sheet layout for phone/tablet/split-screen/zoom/enlarged text — `started` (current foundation passes 320 CSS-pixel reflow; later workstation rails/drawers are not built)
- **144** Drag-and-drop intake with native file-input fallback — `started` (native file fallback exists; drag/drop intake remains)

### Planned

All capability IDs not listed above remain `planned`: **2, 4, 6–8, 10, 13–14, 16–18, 20–57, 59, 66–70, 72–81, 84–95, 97–120, 122–128, 132–141, 143, 145–146**.

No capability is currently `blocked` or `excluded`. The architectural exclusions in the design constrain claims and implementation approach; they are not numbered capabilities.

## Dependency state

No new runtime dependency has been added yet. Current PDF foundation continues to use the repository's exact `pdf-lib@1.17.1` pin.

Planned dependencies remain gated by the milestone that needs them:

- `pdfjs-dist@6.3.289` — renderer/text extraction milestone;
- `tesseract.js@7.0.0` — OCR milestone;
- `@pdf-lib/fontkit@1.1.1` — custom-font milestone;
- `qpdf-run@0.2.1` — only after production-build worker/base-path proof;
- `pkijs@3.4.0` — only after the incremental-signature/ByteRange proof.

Every introduced package must remain exact-pinned and must pass the repository's frozen-lockfile and supply-chain policy checks.

## Evidence log

- 2026-09-12 — Repository discovery: existing route `pdf-sanitizer` dynamically loads `src/tools/pdf/PdfWorkspace.tsx`; writer baseline is exact `pdf-lib@1.17.1`; existing unit/e2e tests protect page selection/order and form-flatten safety.
- 2026-09-12 — Current-version research: planned exact pins identified for PDF.js, OCR, font embedding, qpdf browser worker, and PKI/CMS; dependencies remain unmodified until their owning milestones establish tests.
- 2026-09-12 — Accessibility acceptance bound to WCAG 2.2 keyboard, dragging-alternative, target-size, and reflow requirements.
- 2026-09-12 — TDD RED, workflow run `34717409260`: the three new engine contracts failed for the intended missing behavior (metadata replacement, output AcroForm authoring, page-box inspection) while the pre-existing unit suite remained green.
- 2026-09-12 — Engine GREEN, workflow run `34717521965`: unit tests, production build, and focused PDF browser flow passed after the minimal engine implementation.
- 2026-09-12 — Browser TDD RED, workflow run `34717591400`: 676 unit tests and the production build passed; the only new browser failure on both desktop/mobile Chromium was the intentionally missing `Document properties & export` surface; four existing PDF browser cases remained green.
- 2026-09-12 — Visible-workstation GREEN, workflow run `34717705502`: validation completed successfully; unit, production build, and all six focused PDF browser cases passed, including custom filename, metadata byte reopen, desktop/mobile execution, and 320 CSS-pixel reflow.
- 2026-09-12 — Gauntlet improvement cycle: metadata output privacy was hardened by clearing Info before replacement writes; typed tests include partial-replacement non-leakage and document-language presence.
- 2026-09-12 — Hardened code validation, workflow run `34717903615`: unit tests, production build, and focused browser tests all completed successfully on the hardened implementation commit.
- 2026-09-12 — Page-geometry slice unit evidence, workflow run `34725996675`: all 688 repository unit tests passed, including 12 PDF tests covering metadata dates, deterministic blank insertion, page-box persistence, and out-of-MediaBox rejection. Build/browser execution was prevented solely by an unrelated current-main syntax error in `src/tools/web-layout/WebLayoutWorkspace.tsx`.
- 2026-09-12 — External base correction observed immediately afterward: `main` commit `e9557b99b5feb95218a72dad1581bdce627ce255` (`fix(web-layout): correct preview orientation state formatting`) corrected that parallel-tool syntax failure without PDF-scope edits.
- 2026-09-12 — Merge-ref timing evidence, workflow run `34726080825`: all 688 unit tests again passed, but its checkout merged this PDF branch into `main@9d1e9e2ffe10df8b7ad6daaea36751519ab04741`; the web-layout syntax error therefore still blocked build before browser tests. The repaired `main@597e7b0c746545df0a90dc08440b3ad10c61b65c` landed seconds later.
- 2026-09-12 — Clean merge-ref validation, workflow run `34726166983`: checkout was `Merge 73124e41… into 597e7b0c…`; all 688 unit tests and the production build passed. Six of eight focused desktop/mobile browser executions passed; the only failure was an older non-exact `Output pages` text locator made ambiguous by the new `Geometry output page` label. The new blank-page/date/page-box scenario passed on both browser projects.
- 2026-09-12 — Final page/metadata slice GREEN, workflow run `34726249725`: after narrowing that stale locator to exact text, unit tests, production build, Chromium installation, and the full focused PDF browser suite all completed successfully. Capabilities 11, 19, and 96 were promoted to `verified`.
- 2026-09-12 — Attachment foundation GREEN, workflow run `34726735769`: unit tests, production build, and focused desktop/mobile PDF browser tests passed. The visible browser case inventories a source attachment, extracts and verifies its bytes, authors a new attachment with description/dates, reopens it, and proves the source attachment was not silently carried forward. Capabilities 82 and 83 were promoted to `verified`.
- 2026-09-12 — Advanced-form TDD RED, workflow run `34729171676`: 700 pre-existing repository tests passed while both new radio/option-list tests failed on the intentionally missing engine handling (`client.priority` attempted the legacy top-level page path). This establishes the missing-behavior baseline before implementation.
- 2026-09-12 — Advanced-form GREEN, workflow run `34729484871`: unit tests, production build, and focused browser tests completed successfully after typed radio/option-list support and visible five-type form staging. Dedicated browser coverage creates and reopens text, checkbox, dropdown, radio-group, and multiselect option-list values and separately proves a source field can be flattened while a newly authored output field remains editable. Capabilities 60–64 are promoted to `verified`; capability 65 remains `started` for its unimplemented advanced properties.

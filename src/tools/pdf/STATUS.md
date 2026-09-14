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
- Current milestone: **B — renderer and editor-layer foundation**
- Current gate: **Milestone A is PDF-scope verified; begin current-version PDF.js dependency/worker research and a production-base-path RED/GREEN renderer slice without weakening the still-red repository-wide integration gate**
- Current counts: **25 verified / 5 started / 116 planned / 0 blocked / 0 excluded capabilities**
- Draft integration PR: **#31** (`feat(pdf): evolve sanitizer into PDF Workstation`)
- Existing `pdf-sanitizer` route/deep link is preserved; the workstation evolves that surface rather than creating a duplicate tool.

## Milestones

### A — document/export foundation — VERIFIED

Scope: preserve existing splice/sanitizer behavior; richer inspection; metadata authoring; token overlays/Bates; page boxes; attachments; AcroForm authoring; deterministic export summary; first responsive workstation shell.

Completed/proven portions:

- local multi-file intake remains functional;
- explicit multi-document queue order, selected-page extraction, intentional repeated-page duplication, and 90/180/270-degree rotation are verified by downloaded-byte reopen tests;
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
- ambiguous duplicate source attachment display names fail closed in actionable inventory instead of allowing a filename-based action to select an arbitrary embedded file;
- attachment authoring supports filename, MIME type, description, creation date, and modification date with deterministic UTC handling and output inventory verification;
- text, checkbox, dropdown, radio-group, and option-list authoring are implemented through typed engine contracts and visible coordinate-first controls;
- required/read-only state, text multiline/current value, checkbox current state, dropdown options/selection, radio options/selection, and option-list multiselect/selection are live;
- advanced field-property contracts distinguish current `/V` values from reset/default `/DV` values and support Helvetica/Times Roman/Courier, optional font size, and text alignment; desktop/mobile browser reopen tests verify the persisted semantics;
- staged form fields are revalidated against current final output pages after page/MediaBox changes, and export is verified against the exact expected authored-field count;
- source forms can be flattened while newly authored output fields remain editable and are verified after reopen;
- rich read-only AcroForm inventory reports field name/type/page(s)/required/read-only/current/reset-default state, follows the library's widget-page fallback, does not mutate input bytes, and is verified through the on-demand desktop/mobile UI;
- deterministic export-time tokens support page, total pages, explicit date, final filename, and Bates sequence values;
- Bates numbering supports start/padding/prefix/suffix and six header/footer placements;
- header/footer overlays support left/center/right placement; text watermarks support opacity/rotation; PNG/JPEG watermarks support opacity/rotation/width and nine placements;
- overlays are applied after the rebuilt document is created, then the final bytes are reinspected so authored forms/attachments remain protected by post-export verification;
- the live pre-export impact summary classifies destructive-output, structural-output, and reversible-before-export changes and updates from the current page/metadata/attachment/form/overlay/filename plan before bytes are generated;
- visible metadata export, blank-page insertion, page-box edits, attachments, all five editable field types, overlay/Bates, advanced field properties, source-form inventory, and structural page operations pass focused desktop/mobile browser acceptance;
- the responsive metadata/export foundation passes the 320 CSS-pixel reflow assertion;
- export status reports source-form flattening, authored editable fields, replacement metadata, overlays, blank-page insertion, page-box mutations, and attachment authoring.

Milestone A exit evidence: workflow run `34853637913` executed on synthetic merge ref `ae73f8b99f867a431cc4e06cccbc70a482208b61` (`9430d7ad…` merged into `main@3ec9e435…`). Its PDF-first acceptance produced **26/26 focused PDF unit tests**, a successful production TypeScript/Vite build, and **30/30 focused PDF browser executions** across desktop and mobile Chromium. The unchanged repository-wide unit suite ran afterward and failed only in unrelated Crystal/Vector tests; exact-main integration therefore remains an open Milestone H gate rather than a Milestone A defect.

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
- Attachment parsing has explicit name-tree/attachment limits, avoids the unbounded date-decoding path for untrusted attachment metadata, validates output filenames, proves source attachments are not silently copied, and now suppresses actionable inventory for duplicate display names that would make filename-based extraction ambiguous.
- Form authoring independently validates staged UI geometry and engine geometry/options; source-field flattening and newly authored fields use separate post-export expectations.
- Advanced reset/default form semantics write `/DV` independently from current `/V`; focused desktop/mobile reopen coverage verifies those values together with standard fonts, point sizes, and text alignment.
- Rich form inventory mirrors `pdf-lib` widget-to-page resolution (`/P`, then annotation-ref fallback), has a byte-for-byte non-mutation unit assertion, and is browser-verified on demand.
- Overlay input validation bounds opacity, rotation, image width, Bates sequence values, and margins; the explicit date token avoids nondeterministic clock reads.
- A PDF-specific merge-ref acceptance gate was temporarily placed before the unchanged global unit suite to distinguish PDF defects from parallel-tool failures; it proved the PDF slice green without bypassing the global gate.
- Full final Gauntlet remains open because most workstation milestones are still planned.

Exit: zero blocker/high findings without explicit acceptance, exact-main workflows green, Pages deployment green, counts reconcile to the design.

## Capability state ledger

Every ID below maps one-for-one to the numbered capability in the design document.

### Verified

- **1** Local multi-PDF open with native file input — `verified`
- **5** Multi-document merge with explicit output order — `verified`
- **9** Extract selected pages to a new PDF — `verified`
- **11** Insert blank pages using common/custom sizes — `verified`
- **12** Duplicate pages — `verified`
- **15** Rotate selected pages 90/180/270 degrees — `verified`
- **19** MediaBox/CropBox/BleedBox/TrimBox inspection/editing — `verified`
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
- **121** Save edited full PDF — `started` (current supported edits export; the complete editor model is not yet present)
- **129** Per-export filename editor and deterministic batch-renaming pattern — `started` (filename editor is live; batch pattern remains)
- **142** Responsive drawer/sheet layout for phone/tablet/split-screen/zoom/enlarged text — `started` (current foundation passes 320 CSS-pixel reflow; later workstation rails/drawers are not built)
- **144** Drag-and-drop intake with native file-input fallback — `started` (native file fallback exists; drag/drop intake remains)

### Planned

All capability IDs not listed above remain `planned`: **2, 4, 6–8, 10, 13–14, 16–18, 20–57, 59, 66–70, 72–74, 80–81, 84–95, 97–120, 122–128, 132–141, 143, 145–146**.

No capability is currently `blocked` or `excluded`. The architectural exclusions in the design constrain claims and implementation approach; they are not numbered capabilities.

## Dependency state

No new PDF runtime dependency has been added yet. Current PDF foundation continues to use the repository's exact `pdf-lib@1.17.1` pin.

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
- 2026-09-12 — Advanced-form GREEN, workflow run `34729484871`: unit tests, production build, and focused browser tests completed successfully after typed radio/option-list support and visible five-type form staging. Dedicated browser coverage creates and reopens text, checkbox, dropdown, radio-group, and multiselect option-list values and separately proves a source field can be flattened while a newly authored output field remains editable. Capabilities 60–64 were promoted to `verified`; capability 65 remained `started` for its advanced properties.
- 2026-09-12 — Overlay/Bates production validation, workflow run `34729732734`: unit tests, production build, and existing focused browser regression passed after integrating deterministic export-time overlays after the rebuilt document stage.
- 2026-09-12 — Overlay/Bates focused GREEN, workflow run `34729800517`: unit tests, production build, and the dedicated visible overlay browser test passed. The browser flow stages explicit date/filename/page/total/Bates tokens, Bates start/padding/prefix/placement, text watermark, and a PNG watermark, then reopens the two-page output and verifies Font and XObject page resources. Capabilities 75–79 were promoted to `verified`.
- 2026-09-13 — Advanced field-property engine validation, workflow run `34730133278`: 708 repository unit tests and the production build passed, including real `/V` versus `/DV`, standard-font/font-size, and alignment contracts. Browser execution exposed only a stale export-summary `Pages` locator; that locator was narrowed subsequently.
- 2026-09-13 — Combined visible properties/impact-summary run `34798238251`: 731 unit tests and the production build passed; 18 of 20 focused browser executions passed. The deterministic export-impact summary passed on both browser projects. The only two failures stopped at the same ambiguous `Field font` locator before output generation; that locator was subsequently narrowed to exact text. Capability 131 was promoted to `verified`; capability 65 remained `started` pending the selector-corrected rerun.
- 2026-09-13 — Rich AcroForm inventory contract: a read-only helper reports field name/type/widget page(s)/required/read-only/current/reset-default state and proves source bytes are unchanged. The page mapper mirrors `pdf-lib`'s `/P` lookup followed by annotation-reference fallback.
- 2026-09-13 — Moving-base validation run `34798518917`: the new PDF form-inventory test passed, as did the advanced-form tests, but the repository-wide unit gate failed before build/browser because the merge base lacked a parallel Crystal module and had three Vector path-motion failures. No unrelated files were modified from the PDF branch.
- 2026-09-13 — Moving-base validation run `34798685152`: the Crystal failure had been repaired and 740 repository tests passed, including all PDF inventory/property/summary tests. The only failures were three unrelated Vector path-motion assertions, so production build/browser steps were skipped. Focused browser contracts for merge/extract/duplicate/rotate were committed and awaited clean execution.
- 2026-09-14 — Attachment Gauntlet hardening: actionable source attachment inventory now fails closed when multiple embedded-file entries resolve to the same display filename; the low-level extraction API still exposes the raw entries for diagnostics. The new duplicate-name regression joined the focused attachment suite.
- 2026-09-14 — Milestone A focused merge-ref acceptance, workflow run `34853637913`: checkout was synthetic merge `ae73f8b99f867a431cc4e06cccbc70a482208b61` (`9430d7ad…` into `main@3ec9e435…`). All 6 focused PDF unit files passed (**26/26 tests**), the production TypeScript/Vite build completed, Chromium installed, and all **30/30** focused PDF browser executions passed across desktop/mobile. This included advanced `/V` versus `/DV` field properties, rich source-form inventory, export impact review, overlays, attachments, metadata/page geometry/reflow, and byte-reopen proofs for merge/extract/duplicate/rotate. The unchanged global unit step then failed only on one missing Crystal symmetry module and three Vector path-motion assertions (**746 other tests passed**); those unrelated failures keep Milestone H exact-main integration open but do not invalidate the PDF-specific Milestone A evidence.

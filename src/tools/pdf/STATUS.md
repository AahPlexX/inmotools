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
- Current gate: **blank-page insertion, full standard metadata dates, and page-box editing are implemented and unit-green; fresh browser/build evidence is pending a clean PR merge-ref validation**
- Current counts: **3 verified / 17 started / 126 planned / 0 blocked / 0 excluded capabilities**
- Draft integration PR: **#31** (`feat(pdf): evolve sanitizer into PDF Workstation`)
- Existing `pdf-sanitizer` route/deep link is preserved; the workstation evolves that surface rather than creating a duplicate tool.

## Milestones

### A — document/export foundation — STARTED

Scope: preserve existing splice/sanitizer behavior; richer inspection; metadata authoring; token overlays/Bates; page boxes; attachments; AcroForm authoring; deterministic export summary; first responsive workstation shell.

Completed/proven portions:

- local multi-file intake remains functional;
- existing queue order/page selection/form-flatten safety remains intact;
- standard metadata replacement UI is live for title, author, subject, keywords/tags, creator, producer, and language;
- custom export filename is live;
- text/checkbox/dropdown form authoring contracts exist in the engine;
- metadata replacement defensively clears the output Info dictionary before writing selected replacement fields;
- visible metadata export reopens correctly in browser tests and reflows at 320 CSS pixels.

Implemented in the current validation slice (not promoted to `verified` until fresh browser/build evidence is green):

- creation and modification date controls with deterministic UTC interpretation and reopened-byte unit proof;
- blank-page insertion using Letter, A4, Legal, Tabloid, or custom dimensions; portrait/landscape preset handling; quantity control; and exact copied-page anchors;
- final-output MediaBox/CropBox/BleedBox/TrimBox editing with UI and engine fail-closed containment checks;
- final output plan/preview now includes staged blank pages and stable-key geometry edits;
- export status now reports blank-page and page-box structural mutations.

Still required for Milestone A exit after this slice is verified:

- attachment authoring/inventory;
- visible AcroForm authoring UI including radio/option-list support;
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
- Tests were strengthened to use the real typed output-options contract instead of casting around TypeScript and to prove a partial metadata replacement cannot leak unspecified source Info fields.
- Current page-geometry slice uses independent UI and engine validation so invalid Crop/Bleed/Trim rectangles cannot bypass the UI to reach exported bytes.
- Full final Gauntlet remains open because most workstation milestones are still planned.

Exit: zero blocker/high findings without explicit acceptance, exact-main workflows green, Pages deployment green, counts reconcile to the design.

## Capability state ledger

Every ID below maps one-for-one to the numbered capability in the design document.

### Verified

- **1** Local multi-PDF open with native file input — `verified`
- **71** One-click form flattening with pre-export loss-of-editability warning and post-export verification — `verified`
- **130** Per-export metadata/tags review before bytes are generated — `verified`

### Started

- **3** Document diagnostics summary — `started` (page count/size/forms/common metadata/page geometry exist; attachments, active-content, encryption/security detail remain)
- **5** Multi-document merge with explicit output order — `started` (queue/order behavior exists; final merged-byte order needs dedicated browser proof)
- **9** Extract selected pages to a new PDF — `started` (range/order engine and UI exist; focused download/reopen proof remains)
- **11** Insert blank pages using common/custom sizes — `started` (engine/UI/unit proof exist; fresh browser download/reopen proof is pending)
- **12** Duplicate pages — `started` (repeated page selections are preserved by the engine; dedicated user-flow proof remains)
- **15** Rotate selected pages 90/180/270 degrees — `started` (engine/UI exist; focused rendered/reopened proof remains)
- **19** MediaBox/CropBox/BleedBox/TrimBox inspection/editing — `started` (engine/UI/unit proof exist; fresh browser download/reopen proof is pending)
- **58** Existing AcroForm field inventory — `started` (field count exists; page/name/type/state/flags inventory remains)
- **60** Text-field authoring — `started` (engine contract proven; visual authoring UI remains)
- **61** Checkbox authoring — `started` (engine contract proven; visual authoring UI remains)
- **63** Dropdown authoring — `started` (engine contract proven; visual authoring UI remains)
- **96** Standard document metadata editor — `started` (all standard fields including creation/modification dates are implemented; fresh browser proof for dates is pending)
- **121** Save edited full PDF — `started` (current supported edits export; the complete editor model is not yet present)
- **129** Per-export filename editor and deterministic batch-renaming pattern — `started` (filename editor is live; batch pattern remains)
- **131** Export operation summary describing destructive/structural/reversible changes — `started` (status now reports forms, replacement metadata, blank insertions, and page-box edits; complete action classification/summary remains)
- **142** Responsive drawer/sheet layout for phone/tablet/split-screen/zoom/enlarged text — `started` (current foundation passes 320 CSS-pixel reflow; later workstation rails/drawers are not built)
- **144** Drag-and-drop intake with native file-input fallback — `started` (native file fallback exists; drag/drop intake remains)

### Planned

All capability IDs not listed above remain `planned`: **2, 4, 6–8, 10, 13–14, 16–18, 20–57, 59, 62, 64–70, 72–95, 97–120, 122–128, 132–141, 143, 145–146**.

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

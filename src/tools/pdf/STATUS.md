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
- Base: `main@79ac4629c4e7110e43a81945ef5017319c4a1f76`
- Current milestone: **A — deterministic document/export foundation**
- Current gate: design is committed; implementation plan and test-first foundation are next.
- Current counts: **0 verified / 0 started / 146 planned / 0 blocked**
- Existing `pdf-sanitizer` behavior is preserved as a regression baseline but is not automatically counted as verified for the expanded workstation until fresh evidence runs against the new branch.

## Milestones

### A — document/export foundation

Scope: preserve existing splice/sanitizer behavior; richer inspection; metadata authoring; token overlays/Bates; page boxes; attachments; AcroForm authoring; deterministic export summary; first responsive workstation shell.

Exit: focused unit tests + PDF Playwright flow + TypeScript build green for this milestone.

### B — renderer and editor-layer foundation

Scope: PDF.js render/text layer; thumbnails; zoom/pan/search/select; overlay model; text/image/vector placement; layer transforms; history; mobile/keyboard alternatives.

Exit: renderer cancellation/memory behavior, desktop/mobile browser flows, reflow and non-drag controls verified.

### C — annotation and measurement

Scope: markup matrix, ink, comments, callouts, stamps, calibration/distance/perimeter/area, rulers/coordinates.

Exit: geometry and export persistence verified on representative rotated/cropped pages.

### D — legal, redaction, structure, and security

Scope: secure raster redaction + verification; bookmarks/TOC; qpdf worker adapter; encryption/decryption/permissions/linearization; active-content inventory/sanitization; attachments.

Exit: destructive/security operations fail closed and adversarial fixtures prove no overlay-only redaction claim.

### E — OCR and comparison

Scope: Tesseract worker; preprocessing; searchable OCR text layer; confidence review; visual/text/metadata/form diff.

Exit: worker cancellation, geometry mapping, scanned fixtures, and comparison navigation verified.

### F — archival, accessibility, and signatures

Scope: metadata/XMP; PDF/A readiness; PDF/UA readiness; structure/tag inspection; viewer preferences; signature placement; CMS signing; local cryptographic verification.

Exit: no certification/trust overclaim; signed ByteRange survives save/reopen; existing signatures are protected from silent invalidation.

### G — batch, recipes, and export matrix

Scope: recipes, dry-run/batch execution, full export matrix, ZIP outputs, batch naming, presets, diagnostics exports, safety lens, simple/pro modes, command palette, local recovery.

Exit: deterministic batch error isolation, bounded local persistence, export previews, and responsive workflows verified.

### H — Gauntlet, integration, and deployment

Scope: fresh full-surface falsification, security/adversarial review, dependency/claim audit, exact-main validation, GitHub Pages deploy verification.

Exit: zero blocker/high findings without explicit acceptance, exact-main workflows green, Pages deployment green, counts reconcile to the design.

## Capability state ledger

All capabilities below correspond one-for-one with the numbered list in the design document.

- 1–23 Document intake/diagnostics/page operations — `planned`
- 24–40 Viewing/navigation/base-content assistance — `planned`
- 41–57 Annotation/review/stamps/measurement — `planned`
- 58–71 AcroForm workstation — `planned`
- 72–83 Legal/records/redaction/document structure — `planned`
- 84–89 Comparison/version review — `planned`
- 90–95 OCR/scanned-document workflows — `planned`
- 96–115 Metadata/archival/accessibility/security/optimization — `planned`
- 116–120 Signatures/certificates — `planned`
- 121–146 Export/batch/reproducibility/advanced UX — `planned`

## Evidence log

- 2026-09-12 — Repository discovery: existing route `pdf-sanitizer` dynamically loads `src/tools/pdf/PdfWorkspace.tsx`; current writer is `pdf-lib@1.17.1`; existing unit/e2e tests protect page selection/order and form-flatten safety.
- 2026-09-12 — Current-version research: planned exact pins identified for PDF.js, OCR, font embedding, qpdf browser worker, and PKI/CMS; dependencies remain unmodified until their owning milestones establish tests.
- 2026-09-12 — Accessibility acceptance bound to WCAG 2.2 keyboard, dragging-alternative, target-size, and reflow requirements.

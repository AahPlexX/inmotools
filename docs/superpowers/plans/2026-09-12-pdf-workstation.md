# PDF Workstation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use a disciplined task-by-task execution workflow. Each task below has an independently testable deliverable and must update `src/tools/pdf/STATUS.md` before handoff.

**Goal:** Evolve the existing local `pdf-sanitizer` route into the 146-capability PDF Workstation defined by the design, without weakening current sanitizer/form safety or overclaiming unsupported PDF guarantees.

**Architecture:** Preserve `pdf-lib` as the deterministic high-level writer, add PDF.js as a lazy render/read layer, Tesseract.js as a lazy OCR worker, qpdf WASM behind a narrow security/optimization worker adapter, and a later PDF-specific incremental signing layer using Web Crypto/PKI.js. React owns a serializable workstation operation model rather than treating canvas pixels as the source of truth.

**Tech Stack:** React 19, TypeScript 7, Vite 8, `pdf-lib@1.17.1`, planned exact pins `pdfjs-dist@6.3.289`, `tesseract.js@7.0.0`, `@pdf-lib/fontkit@1.1.1`, `qpdf-run@0.2.1`, `pkijs@3.4.0`, Vitest, Playwright, WCAG 2.2-oriented semantic HTML/CSS.

**Spec:** `docs/superpowers/specs/2026-09-12-pdf-workstation-design.md`

## Global Constraints

- Keep the existing route slug `pdf-sanitizer` and preserve current deep links.
- Source PDF bytes remain browser-local during normal operation.
- Exact dependency versions only; never `^`, `~`, floating tags, or unversioned CDN URLs.
- Existing cross-document AcroForm safety stays fail-closed: forms are never silently discarded.
- Overlay rectangles are never described as secure redaction.
- PDF/A and PDF/UA workflows are readiness/preflight unless a complete conforming validator is independently integrated.
- Embedded PDF JavaScript is never executed by the workstation.
- Every drag action has a single-pointer non-drag and keyboard/numeric alternative.
- Authored pointer targets meet WCAG 2.2 target-size rules; primary controls target 40+ CSS pixels.
- Surrounding UI reflows at 320 CSS-pixel equivalent width. Spatial page content may pan when two-dimensional layout is essential.
- Do not edit unrelated tools or shared project tracking except when an integration change is strictly required.
- Update `src/tools/pdf/STATUS.md` in every implementation batch.

---

### Task 1: Metadata-aware deterministic output foundation

**Files:**
- Modify: `tests/unit/pdf.test.ts`
- Modify: `src/tools/pdf/pdf-engine.ts`
- Modify: `src/tools/pdf/STATUS.md`

**Interfaces:**
- Extends `splicePdfs(selections, options?)` without breaking existing one-argument callers.
- Produces `PdfOutputOptions`, `PdfMetadataEdits`, `PdfStampOptions`, and `PdfBatesOptions` for later UI tasks.

**Behavior contract:** Existing splicing/sanitization remains unchanged when no output options are supplied. When metadata output options are supplied, only explicitly supplied metadata is written; blank fields are omitted. Stamps operate on final output page order, so `{Page}`, `{TotalPages}`, and Bates values reflect exported pages rather than source indexes.

- [ ] **Step 1: Add a RED metadata test without introducing an unresolved import.**

Add to `tests/unit/pdf.test.ts` using the already-existing `splicePdfs` symbol:

```ts
it('writes explicitly requested output metadata without restoring source metadata', async () => {
  const source = await onePagePdf('Sensitive source title');
  const output = await (splicePdfs as unknown as (
    selections: Array<{ bytes: Uint8Array }>,
    options: { metadata: { title: string; author: string; subject: string; keywords: string[]; language: string } },
  ) => Promise<Uint8Array>)([{ bytes: source }], {
    metadata: {
      title: 'Filed copy',
      author: 'Records team',
      subject: 'Matter 24-001',
      keywords: ['filed', 'reviewed'],
      language: 'en-US',
    },
  });
  const loaded = await PDFDocument.load(output, { updateMetadata: false });
  expect(loaded.getTitle()).toBe('Filed copy');
  expect(loaded.getAuthor()).toBe('Records team');
  expect(loaded.getSubject()).toBe('Matter 24-001');
  expect(loaded.getKeywords()).toBe('filed reviewed');
  expect(loaded.catalog.get(PDFName.of('Lang'))).toBeDefined();
});
```

The cast intentionally exercises a backward-compatible future second argument while keeping the test harness compilable. Before implementation, current code ignores the second argument and the assertions fail on observable output metadata.

- [ ] **Step 2: Run the repository PR validation and preserve the RED evidence.**

Expected focused unit failure: output title/author/subject are undefined because the current implementation always clears the output Info dictionary.

- [ ] **Step 3: Implement the optional output contract.**

Add:

```ts
export interface PdfMetadataEdits {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string[];
  creator?: string;
  producer?: string;
  language?: string;
  creationDate?: Date;
  modificationDate?: Date;
}

export interface PdfBatesOptions {
  prefix: string;
  suffix: string;
  start: number;
  padding: number;
  position: 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
}

export interface PdfStampOptions {
  header?: string;
  footer?: string;
  watermark?: string;
  bates?: PdfBatesOptions;
  fontSize?: number;
  opacity?: number;
}

export interface PdfOutputOptions {
  metadata?: PdfMetadataEdits;
  stamps?: PdfStampOptions;
  sourceFilename?: string;
  exportDate?: Date;
}
```

Change the signature to:

```ts
export async function splicePdfs(
  selections: PdfSelection[],
  options: PdfOutputOptions = {},
): Promise<Uint8Array>
```

Apply metadata after copying pages. Keep `output.context.trailerInfo.Info = undefined` only when `options.metadata` is absent; otherwise use the public `setTitle`, `setAuthor`, `setSubject`, `setKeywords`, `setCreator`, `setProducer`, `setLanguage`, `setCreationDate`, and `setModificationDate` methods for supplied values.

- [ ] **Step 4: Implement token stamps on final page order.**

Use one embedded `StandardFonts.Helvetica` instance, a pure token helper, and final `output.getPages()`. Token expansion is:

```ts
const TOKENS: Record<string, string> = {
  '{Page}': String(pageIndex + 1),
  '{TotalPages}': String(totalPages),
  '{Date}': exportDate.toISOString().slice(0, 10),
  '{Filename}': sourceFilename,
  '{Bates}': batesText,
};
```

Never use locale/timezone-sensitive formatting for deterministic tests. Header/footer anchors use measured font width so center/right placement remains inside page bounds. Watermark uses page center, 45-degree rotation, and bounded opacity.

- [ ] **Step 5: Run `tests/unit/pdf.test.ts`, then the full unit suite/build through repository validation.**

Acceptance: existing metadata-clean sanitizer test still passes with no output options; new metadata test passes; all existing page/form tests stay green.

- [ ] **Step 6: Update `STATUS.md` capability states for the portions actually proven.**

Mark only capabilities with fresh evidence as `verified`; stamping remains `started` until rendered output is verified through PDF.js/browser evidence.

---

### Task 2: Rich inspection, page boxes, attachments, and form authoring

**Files:**
- Modify: `tests/unit/pdf.test.ts`
- Modify: `src/tools/pdf/pdf-engine.ts`
- Modify: `src/tools/pdf/STATUS.md`

**Interfaces:**

Extend inspection with deterministic serializable records:

```ts
export interface PdfBox { x: number; y: number; width: number; height: number }
export interface PdfPageInspection {
  page: number;
  width: number;
  height: number;
  rotation: number;
  mediaBox: PdfBox;
  cropBox: PdfBox;
  bleedBox: PdfBox;
  trimBox: PdfBox;
}

export interface PdfFormFieldInspection {
  name: string;
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'option-list' | 'button' | 'signature' | 'unknown';
  readOnly: boolean;
  required: boolean;
}
```

Add a single-document edit entry point:

```ts
export async function editPdfDocument(
  bytes: Uint8Array,
  operations: PdfDocumentEdits,
): Promise<Uint8Array>
```

`PdfDocumentEdits` owns metadata, page boxes, new blank pages, attachments, form field definitions, and optional form flattening. It rejects encrypted input rather than using `ignoreEncryption`.

**Test cycles:**

- [ ] RED: page inspection returns all four page boxes and rotation from a generated fixture.
- [ ] GREEN: map `PDFPage` public getters into serializable inspection.
- [ ] RED: edit a CropBox and verify `getCropBox()` after reopen.
- [ ] GREEN: validate finite positive width/height and page bounds before setters.
- [ ] RED: author text/checkbox/radio/dropdown/option-list fields and verify names/types after reopen.
- [ ] GREEN: use public `PDFForm.create*` APIs; reject duplicate names and out-of-page geometry.
- [ ] RED: attach a small text payload and verify the embedded-file name tree exists after reopen.
- [ ] GREEN: use `PDFDocument.attach` with explicit MIME/name/description/dates.
- [ ] Fresh unit suite/build; update status only for evidenced capabilities.

---

### Task 3: First responsive workstation shell and export-properties flow

**Files:**
- Modify: `tests/e2e/pdf.spec.ts`
- Modify: `src/tools/pdf/PdfWorkspace.tsx`
- Create: `src/tools/pdf/pdf-workstation.css`
- Modify: `src/tools/pdf/STATUS.md`

**Behavior:** Preserve the current queue/splice surface as the first section. Add a single-document `Document properties & export` section that becomes available with one queued PDF and exposes the metadata contract from Task 1 without forcing the user into a new route.

- [ ] RED browser test: load one PDF, fill Title/Author/Subject/Keywords/Language, export edited copy, reopen downloaded bytes with `pdf-lib`, and assert metadata values.
- [ ] RED browser test: controls remain reachable at 320×800 viewport; no workspace-level horizontal overflow; export button remains visible and keyboard reachable.
- [ ] GREEN UI: controlled fields with explicit labels, reset-to-source/clear actions, export filename, destructive-change summary, and status live region.
- [ ] CSS: responsive grid/drawers use CSS Grid/Flex with `minmax(0, 1fr)`, wrapping controls, `overflow-wrap:anywhere`, minimum target sizes, focus-visible styling, and reduced-motion handling.
- [ ] Run focused PDF Playwright spec in desktop/mobile projects selected by the repository config, then build/unit validation.

---

### Task 4: PDF.js renderer and editor-layer core

**Files:**
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Create: `src/tools/pdf/pdf-renderer.ts`
- Create: `src/tools/pdf/pdf-model.ts`
- Create: `src/tools/pdf/PdfCanvas.tsx`
- Modify: `src/tools/pdf/PdfWorkspace.tsx`
- Modify/Create focused unit and E2E PDF tests
- Modify: `src/tools/pdf/STATUS.md`

**Dependencies:** add exactly `pdfjs-dist@6.3.289`; worker assets must resolve under the Vite/GitHub Pages base path without an external CDN.

**Model:**

```ts
export type PdfEditorObject =
  | PdfTextObject
  | PdfImageObject
  | PdfShapeObject
  | PdfInkObject
  | PdfMarkupObject
  | PdfCommentObject
  | PdfStampObject
  | PdfMeasurementObject
  | PdfRedactionObject;

export interface PdfWorkstationProject {
  version: 1;
  sourceFingerprint: string;
  activeDocumentId: string;
  pageOrder: PdfPageRef[];
  objects: PdfEditorObject[];
  history: PdfHistoryEntry[];
  exportSettings: PdfExportSettings;
}
```

- [ ] Test worker/base-path loading in production build.
- [ ] Render only active/nearby pages; cancel stale render tasks.
- [ ] Add semantic page navigation/text-search result list outside canvas.
- [ ] Add high-DPI scale handling without CSS-size distortion.
- [ ] Add overlay transforms with numeric/button alternatives for every drag transform.
- [ ] Add history reducer tests for undo/redo invariants.
- [ ] Add safe custom-font dependency exactly `@pdf-lib/fontkit@1.1.1` only when font upload is wired and tested.

---

### Task 5: Annotation, stamps, and measurement suite

**Files:** focused modules under `src/tools/pdf/` for annotation model, geometry, export adapter, and UI; focused unit/E2E tests; status update.

**Acceptance contracts:**

- Markup geometry derives from PDF.js text item geometry or explicit user rectangles.
- Freehand ink uses pointer capture but remains optional; all non-path-dependent actions have keyboard/button equivalents.
- Measurements store calibration as PDF-point-to-unit ratio and are invariant under zoom.
- Exported visual geometry is mapped from viewport coordinates back to PDF user space and tested on rotated/cropped pages.
- Comments preserve author label/timestamp supplied by the user/project; the app does not invent identity.

---

### Task 6: Forms, legal review, secure redaction, qpdf security adapter

**Files:** form engine/UI, redaction engine/UI, qpdf worker adapter, security tests, browser fixtures, status.

**Dependencies:** add exactly `qpdf-run@0.2.1` only after a standalone production-build worker smoke test succeeds under the Pages base path.

**Redaction invariant:** secure redaction rasterizes each affected page from the source render after applying every approved redaction rectangle, rebuilds that page as pixels in a new PDF, and then verifies the export. The UI explicitly warns that text search/accessibility/vector fidelity on that page is sacrificed.

**Security adapter contract:**

```ts
export interface QpdfTransformResult {
  bytes: Uint8Array;
  exitCode: number;
  warnings: string[];
  stderr: string;
  durationMs: number;
}
```

No qpdf stderr/warning is silently ignored for encryption/decryption/security operations.

Acceptance includes authorized decrypt, AES-256 encryption, permissions, linearization, malformed-PDF failure, wrong-password failure, and worker cleanup/cancel behavior.

---

### Task 7: OCR, comparison, archival/accessibility preflight, metadata/XMP

**Files:** OCR worker adapter, preprocessing helpers, comparison engine, preflight engine, metadata/XMP adapter, tests, status.

**Dependencies:** add exactly `tesseract.js@7.0.0` only with worker lifecycle/progress/cancel tests.

- OCR text is reviewable before searchable-layer export.
- OCR coordinates are mapped deterministically to PDF user space.
- Comparison has separate pixel, extracted-text, metadata, and form-field result models.
- PDF/A/PDF/UA output is labeled `readiness`/`preflight`; no pass means certified conformance.
- XMP edits preserve a parseable packet and do not silently discard unknown namespaces unless the user chooses a scrub action.

---

### Task 8: Incremental digital signing and verification

**Files:** signing model, PKCS#12/CMS adapter, PDF incremental-update writer, signature inspector, security/unit/browser fixtures, status.

**Dependency:** add exactly `pkijs@3.4.0` only after a browser Web Crypto/PKCS#12/CMS proof fixture passes.

**Critical invariant:** never rewrite already-signed bytes with the ordinary `pdf-lib.save()` path after signing. Signing appends an incremental update with a fixed-size `/Contents` reservation and valid `/ByteRange`, hashes exactly the declared byte ranges, and inserts CMS bytes without changing prior bytes.

Acceptance fixtures include valid signature, altered signed byte, wrong key/certificate pairing, expired certificate metadata, multiple incremental signatures, and reopen in at least one independent parser. The UI distinguishes cryptographic integrity from external trust/revocation status.

---

### Task 9: Batch/recipe/export matrix and local recovery

**Files:** recipe schema/executor, IndexedDB persistence adapter, export engine, batch UI, tests, status.

**Contracts:**

- Recipe schema is versioned and rejects unknown future major versions.
- Secret/password/private-key material is never serialized into recipes/autosave.
- Batch execution isolates per-file failures and never returns a global success when any file failed.
- IndexedDB storage is bounded, user-clearable, and source-document persistence is opt-in when byte size exceeds the defined recovery threshold.
- ZIP and image/text/JSON/CSV exports use existing dependencies/native APIs where practical rather than adding overlapping packages.

---

### Task 10: Gauntlet verification, integration, exact-main validation, deployment

**Files:** only PDF tests/docs/status plus conflict-resolution edits strictly necessary for integration.

- [ ] Reconcile every capability ID in `STATUS.md` against the design.
- [ ] Run dependency pin audit and confirm no range specifiers were introduced.
- [ ] Run full unit suite and production TypeScript/Vite build.
- [ ] Run focused PDF browser suite across repository desktop/mobile Chromium projects.
- [ ] Run adversarial/security review concentrating on redaction, password handling, embedded active content, signature integrity, worker lifecycle, unbounded memory, malicious metadata/text, and export-claim accuracy.
- [ ] Perform at least one improvement cycle based on the strongest fresh finding.
- [ ] Re-run affected validation after the final mutation.
- [ ] Before integration, compare branch base/head against current `main`; do not overwrite unrelated parallel-agent work.
- [ ] Merge only through a verified non-destructive integration path.
- [ ] Verify the exact integrated `main` commit has green repository validation and successful Pages deployment.
- [ ] Set overall status complete only when the deterministic completion contract in the design is satisfied.

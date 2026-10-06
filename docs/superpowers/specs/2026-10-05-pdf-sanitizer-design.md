---
tool: pdf-sanitizer
folder: src/tools/pdf
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-pdf-sanitizer-design.md
tracker: src/tools/pdf/TRACKER.md
updated: 2026-10-05
---

# PDF Sanitizer — spec

As built at `947272db` (last code change under `src/tools/pdf/`). Requirement prefix: `PDF`. Status of each requirement: [TRACKER.md](../../../src/tools/pdf/TRACKER.md). History: [2026-09-12 PDF Workstation design](2026-09-12-pdf-workstation-design.md) (capabilities 1–146, cited below as "formerly <n>"), [STATUS.md](../../../src/tools/pdf/STATUS.md), [plan](../plans/2026-09-12-pdf-workstation.md). Owner input: [owner feature notes 2026-10-05](../../research/owner-feature-notes-2026-10-05.md#pdf-sanitizer-pdf-editor--document-studio).

## Purpose

Let anyone who handles PDFs merge, split, reorder and rebuild documents, author and flatten forms, stamp Bates numbers and watermarks, edit metadata and attachments, and produce a sanitized copy without uploading the file anywhere.

## Scope

In scope:
- Page operations, viewing and search, an editing and annotation layer, measurement, forms, redaction, Bates and overlays, bookmarks, attachments, comparison, OCR, metadata and XMP, encryption, optimization, signatures, and PDF, image, text and ZIP export.

Out of scope:
- Executing JavaScript embedded in a PDF: the tool inventories and removes active content but never runs it (2026-09-12 design, "Explicit exclusions").
- Certified PDF/A or PDF/UA conversion: only readiness preflight reports are produced; certification needs a conforming validator.
- XFA form authoring and rendering: the form engine is AcroForm-based.

## Constraints

- Platform rules: no accounts or authentication; no server, backend or server-side database (static GitHub Pages); everything runs in the browser and documents stay on the device (downloads, this browser's storage); network use is limited to the site's own files ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- No large language models; other ML (OCR) only on the device under the ML ruleset.
- Libraries stay as pinned in `package.json`: pdf-lib 1.17.1 (writing), pdfjs-dist (rendering and text, bundled worker). New libraries named in the 2026-09-12 design are exact-pinned when their milestone needs them.
- WebAssembly runs single-threaded: GitHub Pages cannot send the COOP/COEP headers that threads need.
- Output is rebuilt into a new PDF; source document-level metadata and attachments are carried only when the user opts in.
- Never describe an overlay as secure redaction, never claim encryption, certification or signature trust that the bytes do not prove.

## Architecture and engine

- Engines and libraries: `pdf-lib@1.17.1` reads and rewrites the PDF (metadata sanitising, page edits, overlays, attachments, form fields); `pdfjs-dist@6.3.289` renders pages to canvas and builds the selectable text layer and text search.
- Workers: the PDF.js worker (`pdfjs-dist/build/pdf.worker.min.mjs`, configured in `pdfjs-browser.ts`) parses and renders pages off the main thread.
- Browser APIs: Canvas 2D (`getContext('2d')`) displays rendered pages at the device pixel ratio; the File API reads the PDF and attachments; Blob downloads save the exported PDF and summary.

## Requirements

### Intake, diagnostics and page operations

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PDF-R01 | Open one or more local PDFs with the native file input; new selections append to the queue (formerly 1) | Choose two PDFs, then a third; all three are queued |
| PDF-R02 | Password prompt that opens supported encrypted PDFs when the user supplies the password (formerly 2) | Open an encrypted PDF; a password prompt appears and the correct password opens it |
| PDF-R03 | An encrypted PDF is refused with a message instead of being modified | Process an encrypted PDF; the message says it cannot be modified and no file downloads |
| PDF-R04 | Document diagnostics summary: pages, dimensions, size, forms, metadata, attachments, encryption, active-content indicators and structural warnings (formerly 3) | Queue a PDF; the item lists each diagnostic |
| PDF-R05 | Lazy thumbnail page rail (formerly 4) | Open a 20-page PDF; thumbnails render as the rail scrolls |
| PDF-R06 | Merge several documents in an explicit output order (formerly 5) | Queue A then B; the output has A pages then B pages |
| PDF-R07 | Range split into several output PDFs from individual pages and ranges (formerly 6) | Split "1-2, 3, 4-5"; three PDFs download |
| PDF-R08 | Burst split into one PDF per page (formerly 7) | Burst a 3-page PDF; three one-page PDFs download |
| PDF-R09 | Best-fit split by a target output-size ceiling with the actual sizes reported (formerly 8) | Split at 1 MB; every part is at most 1 MB and its size is listed |
| PDF-R10 | Split by bookmark level: one PDF per outline entry at the chosen level | Split a PDF with three top-level bookmarks at level 1; three PDFs download, named after the bookmarks |
| PDF-R11 | Extract selected pages to a new PDF (formerly 9) | Select "2-3"; the output has those two pages |
| PDF-R12 | Page selection presets All, Odd, Even and Reverse; an empty Even preset stays distinct from All | On a one-page PDF Even is disabled; Reverse lists pages last to first |
| PDF-R13 | Insert pages from another PDF at an exact destination (formerly 10) | Insert B page 1 after A page 2; the output order is A1, A2, B1, A3 |
| PDF-R14 | Insert blank pages (Letter, A4, Legal, Tabloid, custom; portrait or landscape) before the first page or after any output page (formerly 11) | Stage two A4 blank pages after page 1; the output has them there |
| PDF-R15 | Duplicate pages by repeating a page number (formerly 12) | Select "1,1"; the output has page 1 twice |
| PDF-R16 | Delete pages, including several selected pages, with undo before export (formerly 13) | Delete pages 2 and 4, undo one deletion; the output omits only the remaining one |
| PDF-R17 | Reorder pages by drag plus position selector, move controls and keyboard (formerly 14) | Move page 3 to position 1 by keyboard; the output starts with page 3 |
| PDF-R18 | Remove a document from the queue and clear the whole queue | Remove one queued PDF; Clear queue empties the list |
| PDF-R19 | Rotate selected pages 90, 180 or 270 degrees (formerly 15) | Rotate 90°; the downloaded page has /Rotate 90 |
| PDF-R20 | Flip selected page content horizontally (formerly 16) | Flip; text reads mirrored left to right |
| PDF-R21 | Flip selected page content vertically (formerly 17) | Flip; the page content is upside-down mirrored |
| PDF-R22 | Visual page cropping by dragging a crop rectangle on the page (formerly 18) | Drag a crop box; the CropBox matches the drawn rectangle |
| PDF-R23 | Margin trim: detect blank page margins and set the CropBox to the content | Trim a page with 1 in white margins; the CropBox excludes them |
| PDF-R24 | MediaBox, CropBox, BleedBox and TrimBox inspection and editing per output page (formerly 19) | Set a CropBox inside the MediaBox; a box outside it is refused |
| PDF-R25 | Resize page canvas with scale-content or preserve-content-position modes (formerly 20) | Resize Letter to A4 in each mode; content scales or keeps its position |
| PDF-R26 | N-up imposition with 2-up, 4-up and custom grids (formerly 21) | 4-up a 4-page PDF; one output page holds all four |
| PDF-R27 | Booklet imposition with front/back spread ordering (formerly 22) | Booklet an 8-page PDF; sheet 1 front is 8 and 1 |
| PDF-R28 | Page-label editor for Arabic, Roman and section-prefixed labels (formerly 23) | Label pages i–iii then 1–; a viewer shows the labels |
| PDF-R29 | Images (PNG, JPEG) to PDF: each image becomes a page | Convert two images; a two-page PDF downloads |

### Viewing and navigation

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PDF-R30 | High-DPI PDF.js rendering in a bundled worker with bounded backing pixels (formerly 24) | Preview a page; it renders through the worker and backing pixels are capped at 3× |
| PDF-R31 | Zoom in/out, 100 %, fit width, fit page and fit selection (formerly 25) | Choose fit width; the page fills the viewer width |
| PDF-R32 | Zoom out to 10 % | Set zoom 10 %; the page renders at 10 % |
| PDF-R33 | Pan with pointer, touch, keyboard and scroll alternatives (formerly 26) | At 300 % pan with arrow keys and drag; the view moves |
| PDF-R34 | Document text search with per-page result navigation (formerly 27) | Search "page two"; the result lists page 2 and selecting it shows that page |
| PDF-R35 | Select and copy extractable PDF text through the text layer (formerly 28) | Select text on the page; the selection contains the page text |
| PDF-R36 | Two-page spread view and continuous scroll view | Switch to spread; pages 2–3 show side by side; continuous shows all pages in one scroll |
| PDF-R37 | Rendering runs off the main thread (PDF.js worker, OffscreenCanvas where supported) | During a 300 % render the page stays responsive; the canvas is transferred to a worker where OffscreenCanvas exists |

### Editing layer

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PDF-R38 | Vector text boxes at exact coordinates with font, size, line height and colour (formerly 29) | Add a text box at 72,72 in 14 pt red; the export contains it |
| PDF-R39 | Existing-text replacement by explicit cover and redraw (formerly 30) | Replace a word; the export covers the old word and draws the new one |
| PDF-R40 | TTF/OTF custom font embedding for new text (formerly 31) | Upload a TTF; new text uses it in the export |
| PDF-R41 | Live text measurement, wrapping, alignment, line height and overflow warning (formerly 32) | Type past the box width; text wraps and an overflow warning shows |
| PDF-R42 | PNG, JPEG and WebP image placement (formerly 33) | Place a PNG; the export contains the image |
| PDF-R43 | Image scale, crop, rotate, opacity, aspect lock and stacking (formerly 34) | Rotate a placed image 45° at 50 % opacity; the export matches |
| PDF-R44 | Rectangle, ellipse, line, polyline, polygon, arrow and callout shapes (formerly 35) | Draw each shape; the export contains vector paths |
| PDF-R45 | Sanitized SVG overlay placement (formerly 36) | Place an SVG with a script; the script is removed and the shapes draw |
| PDF-R46 | Select, move, resize, rotate and delete editor objects (formerly 37) | Move and delete a shape; the export reflects it |
| PDF-R47 | Align, distribute and snap editor objects (formerly 38) | Align three boxes left; their x is equal |
| PDF-R48 | Layer and stacking order panel for editor objects (formerly 39) | Send a box backward; it draws under the image |
| PDF-R49 | Undo and redo for reversible actions (formerly 40) | Add a shape, undo, redo; it returns |

### Annotation and measurement

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PDF-R50 | Highlight markup (formerly 41) | Highlight a line; the export has a Highlight annotation |
| PDF-R51 | Underline markup (formerly 42) | Underline a line; the export has an Underline annotation |
| PDF-R52 | Strikethrough markup (formerly 43) | Strike a line; the export has a StrikeOut annotation |
| PDF-R53 | Squiggly markup (formerly 44) | Squiggle a line; the export has a Squiggly annotation |
| PDF-R54 | Freehand pen and stylus ink with smoothing and pressure where available (formerly 45) | Draw a stroke with a pen; the export has an Ink annotation with smoothed points |
| PDF-R55 | Erase added ink or markup without touching base content (formerly 46) | Erase a stroke; page text is unchanged |
| PDF-R56 | Sticky notes and comments, collapsible, with Markdown text (formerly 47) | Add a note with **bold**; it collapses and exports as a Text annotation |
| PDF-R57 | Threaded comment history with exportable author and time (formerly 48) | Reply to a comment; the thread lists author and time |
| PDF-R58 | Multi-segment callouts with text boxes (formerly 49) | Add a two-segment callout; it exports as FreeText callout |
| PDF-R59 | Standard review and legal stamp library (formerly 50) | Apply "Approved"; the stamp exports |
| PDF-R60 | Custom image or SVG stamps (formerly 51) | Create a stamp from a PNG; it can be applied |
| PDF-R61 | Variable stamps with date, filename, page, reviewer and custom tokens (formerly 52) | Apply a stamp with {Date}; the date is filled in |
| PDF-R62 | Measurement scale calibration from two known points (formerly 53) | Calibrate 1 in = 10 ft; later measurements use feet |
| PDF-R63 | Linear distance measurement (formerly 54) | Measure between two points; the distance shows in calibrated units |
| PDF-R64 | Polyline perimeter measurement (formerly 55) | Measure a three-segment line; the perimeter shows |
| PDF-R65 | Polygon area measurement (formerly 56) | Measure a rectangle; the area shows |
| PDF-R66 | Rulers, pointer coordinates and calibrated unit readout (formerly 57) | Hover the page; coordinates show in calibrated units |

### Forms

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PDF-R67 | Existing AcroForm field inventory by page, name, type, state and flags (formerly 58) | Open a form PDF; the inventory lists each field |
| PDF-R68 | Fill existing form fields (formerly 59) | Type into an existing text field; the export holds the value |
| PDF-R69 | Text-field authoring (formerly 60) | Stage a text field; the export has it |
| PDF-R70 | Checkbox authoring (formerly 61) | Stage a checkbox; the export has it |
| PDF-R71 | Radio-group authoring (formerly 62) | Stage a radio group; the export has its options |
| PDF-R72 | Dropdown authoring (formerly 63) | Stage a dropdown; the export has its options |
| PDF-R73 | Multi-select option-list authoring (formerly 64) | Stage an option list with two selections; the export keeps both |
| PDF-R74 | Field properties: required, read-only, multiline, font, font size, alignment, defaults and options (formerly 65) | Stage a required read-only field; the export carries the flags and the reset default |
| PDF-R75 | Tab-order manager with keyboard-order preview (formerly 66) | Reorder two fields; the export tab order matches |
| PDF-R76 | Calculation rules (sum, product, average, minimum, maximum) over named fields (formerly 67) | Sum two fields into a third; the export has the calculation |
| PDF-R77 | Input formatting and validation rules (date, currency, phone, ranges, safe regular expressions) (formerly 68) | Set a date format; an invalid date is rejected |
| PDF-R78 | Form-data JSON import and export (formerly 69) | Export field values as JSON and import them into a copy; values match |
| PDF-R79 | XFDF and FDF form-data export and import | Export XFDF and import it into a blank copy; values match |
| PDF-R80 | Clear or reset staged form values (formerly 70) | Reset; staged fields return to their defaults |
| PDF-R81 | One-click form flattening with a loss-of-editability warning and post-export verification (formerly 71) | Flatten a form PDF; the export has no fields and the appearances remain |
| PDF-R82 | Processing is blocked while source form fields would be lost by page copying without flattening | Queue a form PDF with flattening off; Process is disabled and the reason shows |

### Legal, redaction and document structure

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PDF-R83 | True redaction: affected pages are rebuilt from pixels so covered text, vector and image data are removed (formerly 72) | Redact a word; the export has neither the text nor the pixels |
| PDF-R84 | Optional visible redaction-reason labels (formerly 73) | Add reason "(b)(6)"; it prints on the redaction |
| PDF-R85 | Redaction verification that re-extracts exported pages and blocks download if redacted text survives (formerly 74) | A redaction that leaves text blocks the download |
| PDF-R86 | Bates numbering with prefix, suffix, start, padding, placement and multi-document continuity (formerly 75) | Bates ABC0001 on two documents; numbers continue across them |
| PDF-R87 | Header overlays with token templates (formerly 76) | Header "Page {Page}"; each page shows its number |
| PDF-R88 | Footer overlays with token templates (formerly 77) | Footer "{Filename}"; each page shows the filename |
| PDF-R89 | Text and image watermarks with opacity, rotation (angle) and placement (formerly 78) | Text watermark at 45° and 30 %; the export matches |
| PDF-R90 | Watermark drawn either behind (background) or in front of (foreground) page content | Choose background; page text draws over the watermark |
| PDF-R91 | Page numbering and {Page}, {TotalPages}, {Date}, {Filename}, {Bates} tokens (formerly 79) | Footer "{Page} of {TotalPages}"; page 2 of 3 shows "2 of 3" |
| PDF-R92 | Bookmark and outline inspection and editing (formerly 80) | Add a nested bookmark; the export outline has it |
| PDF-R93 | Linked table-of-contents page generation (formerly 81) | Generate a TOC; each entry links to its page |
| PDF-R94 | Attachment authoring with filename, MIME type, description and dates (formerly 82) | Attach a file with a description; reopening shows it |
| PDF-R95 | Attachment inventory and extraction, without silently carrying source attachments forward (formerly 83) | Open a PDF with an attachment; it is listed and downloads; the export omits it unless included |

### Comparison

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PDF-R96 | Side-by-side synchronized page comparison (formerly 84) | Compare two PDFs; scrolling one scrolls the other |
| PDF-R97 | Adjustable-opacity overlay comparison (formerly 85) | Overlay at 50 %; both pages show |
| PDF-R98 | Pixel-difference heat map with tolerance (formerly 86) | Compare a changed page; the changed area is highlighted |
| PDF-R99 | Extracted-text diff with added, removed and changed navigation (formerly 87) | Diff two versions; a changed word is listed |
| PDF-R100 | Metadata and form-field structural diff (formerly 88) | Diff two versions; a changed title is listed |
| PDF-R101 | Before/after comparison of the staged output against the source (formerly 89) | Stage a rotation; before/after shows both |

### OCR

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PDF-R102 | OCR selected pages on the device (formerly 90) | OCR a scanned page; recognised text is listed |
| PDF-R103 | Full-document OCR queue with progress and cancel (formerly 91) | Start OCR on 10 pages and cancel; progress stops |
| PDF-R104 | Preprocessing (deskew, grayscale, contrast, threshold) before recognition (formerly 92) | Deskew a tilted scan; recognition improves |
| PDF-R105 | Searchable invisible text layer from reviewed OCR words (formerly 93) | Export after OCR; the text is searchable in a viewer |
| PDF-R106 | OCR confidence review with low-confidence navigation (formerly 94) | Low-confidence words are listed and selectable |
| PDF-R107 | Search, copy and export of reviewed OCR text (formerly 95) | Copy OCR text; the clipboard has it |

### Metadata, archival, security and optimization

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PDF-R108 | Standard metadata editor: title, author, subject, keywords, creator, producer, language, creation and modification dates (formerly 96) | Enter a title and UTC dates; the export Info dictionary matches |
| PDF-R109 | XMP / Dublin Core metadata inspection and editing (formerly 97) | Edit dc:title; the export XMP packet has it |
| PDF-R110 | Custom XMP namespace and property editor (formerly 98) | Add a custom property; the export XMP has it |
| PDF-R111 | Metadata sanitization (Info and XMP) with a before/after report (formerly 99) | Sanitize a PDF with author and XMP; the export has neither and a report lists what was removed |
| PDF-R112 | Reusable metadata and export presets stored locally (formerly 100) | Save a preset, reload, apply it; fields fill |
| PDF-R113 | Compression profiles with image downsampling and quality (formerly 101) | Compress at 150 dpi; the export is smaller and images are 150 dpi |
| PDF-R114 | Lossless deduplication of fonts and images and unused-resource cleanup (formerly 102) | Dedupe a PDF with a repeated image; one image object remains |
| PDF-R115 | Grayscale conversion of pages | Convert to grayscale; no colour remains in the rendered pages |
| PDF-R116 | Fast Web View (linearized) export (formerly 103) | Export linearized; the file has a linearization dictionary |
| PDF-R117 | AES-256 encryption with user and owner passwords (formerly 104) | Encrypt; opening needs the user password |
| PDF-R118 | AES-128 encryption with user and owner passwords | Encrypt with AES-128; the encryption dictionary is revision 4 AESV2 |
| PDF-R119 | Permission flags for print, copy, modify, annotate, form-fill and assemble (formerly 105) | Disallow copy; the P value forbids extraction |
| PDF-R120 | Decryption with the correct password and export without encryption (formerly 106) | Decrypt with the password; the export opens without one |
| PDF-R121 | PDF/A readiness preflight report, not labelled certification (formerly 107) | Preflight a PDF; missing fonts and metadata are listed |
| PDF-R122 | PDF/UA accessibility readiness preflight (formerly 108) | Preflight; missing language and title are listed |
| PDF-R123 | Structure and tag tree inspection (formerly 109) | Open a tagged PDF; the tag tree is shown |
| PDF-R124 | Accessible descriptions for added images and objects in the export (formerly 110) | Add alt text to an image; the export carries it |
| PDF-R125 | Viewer-preference editor (title display, page mode, reading direction, print scaling, duplex) (formerly 111) | Set DisplayDocTitle; the export has it |
| PDF-R126 | Flatten annotations, forms and editor layers into page content on request (formerly 112) | Flatten a PDF with comments; the export has no annotations and their appearance remains |
| PDF-R127 | Active-content inventory for open actions and embedded JavaScript (formerly 113) | Open a PDF with an OpenAction script; it is listed |
| PDF-R128 | Sanitization profile removing selected metadata, attachments, actions and scripts, with an audit report (formerly 114) | Sanitize; the report lists each removed item |
| PDF-R129 | SHA-256 source and output checksums with copy (formerly 115) | Process; both checksums show and copy |

### Signatures

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PDF-R130 | Signature created by drawing, typing or importing an image, stored as an SVG path | Draw a signature; it is saved as an SVG path and can be placed |
| PDF-R131 | Signature-field placement and visual signature appearance (formerly 116) | Place a signature field; the export has it with the appearance |
| PDF-R132 | Local CMS/PKCS#7 signing with a user-supplied certificate (formerly 117) | Sign with a .p12; a viewer reports a valid signature |
| PDF-R133 | PKCS#7 signature integrity verification against the signer certificate and ByteRange (formerly 118) | Verify a signed PDF; integrity is reported; a modified one fails |
| PDF-R134 | Certificate detail viewer (formerly 119) | Open a signed PDF; subject, issuer, serial and validity show |
| PDF-R135 | Local cryptographic validity shown separately from trust and revocation status (formerly 120) | A valid self-signed signature is shown as cryptographically valid, trust unknown |

### Export, batch and workspace

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PDF-R136 | Save the edited full PDF (formerly 121) | Process and download; the PDF reopens with every staged change |
| PDF-R137 | Export selected pages as PDF (formerly 122) | Select pages 2–3 and download; the PDF has two pages |
| PDF-R138 | Export pages as PNG, JPEG or WebP with scale and quality (formerly 123) | Export page 1 as PNG at 2×; the image has double size |
| PDF-R139 | Export pages as SVG | Export page 1 as SVG; the file opens as vector |
| PDF-R140 | Export extractable or reviewed text as TXT with lines sorted by page coordinates (formerly 124) | Export TXT of a two-column page; lines follow reading order |
| PDF-R141 | Export text as Markdown with lines sorted by page coordinates | Export Markdown; headings and paragraphs follow the page |
| PDF-R142 | Export page, text, form and metadata diagnostics as JSON (formerly 125) | Export diagnostics; the JSON lists pages and fields |
| PDF-R143 | Export comments and annotations as JSON and CSV (formerly 126) | Export comments; JSON and CSV list them |
| PDF-R144 | Export N-up or booklet print-ready PDF (formerly 127) | Export a booklet; pages are imposed |
| PDF-R145 | ZIP of multi-file and batch outputs (formerly 128) | Burst to ZIP; one ZIP holds every page PDF |
| PDF-R146 | Per-export filename editor and deterministic batch-renaming pattern (formerly 129) | Set "case-{n}"; outputs are case-1, case-2 |
| PDF-R147 | Per-export metadata and tag review before bytes are generated (formerly 130) | Enter metadata; the review lists it before download |
| PDF-R148 | Export operation summary of destructive, structural and reversible changes (formerly 131) | Stage flattening; the summary lists it as destructive |
| PDF-R149 | Export preview with page count, target profile, filename, consequences and warnings (formerly 132) | Before download the preview lists page order, count and warnings |
| PDF-R150 | Project / recipe JSON of reproducible operations without secrets (formerly 133) | Save a recipe; the JSON lists the staged operations |
| PDF-R151 | Apply a saved recipe to another document with a dry-run compatibility report (formerly 134) | Apply a recipe; the dry run lists incompatible steps |
| PDF-R152 | Batch recipe execution across PDFs with per-file results (formerly 135) | Run a recipe on three PDFs; each result is listed |
| PDF-R153 | Safety lens labelling each staged action reversible, structural or destructive before export (formerly 136) | Stage flattening and a blank page; each is labelled |
| PDF-R154 | Simple and Professional workspace modes (formerly 137) | Switch to Simple; fewer controls show; staged edits remain |
| PDF-R155 | Searchable command palette (formerly 138) | Open the palette and type "rotate"; the action runs |
| PDF-R156 | Keyboard-shortcut help; shortcuts never replace labelled controls (formerly 139) | Open shortcut help; shortcuts are listed |
| PDF-R157 | Undo history timeline, local session autosave and crash recovery (formerly 140) | Reload after staging; recovery restores the session |
| PDF-R158 | Local document vault in this browser (IndexedDB) with direct downloads | Save a PDF to the vault, reload; it is listed and downloads |
| PDF-R159 | Touch and stylus-optimized tool layout and pointer handling (formerly 141) | On a tablet, tools are reachable and pen input draws |
| PDF-R160 | Responsive drawer and sheet layout for phone, tablet, split screen, zoom and enlarged text (formerly 142) | At 320 px all controls reflow without two-dimensional scrolling |
| PDF-R161 | No horizontal page overflow from 320 to 2560 px | At 320, 768, 1440 and 2560 px document scroll width equals the viewport |
| PDF-R162 | Reusable export presets (formerly 143) | Save an export preset; it reapplies |
| PDF-R163 | Drag-and-drop intake with the native file input as fallback (formerly 144) | Drop two PDFs on the workspace; both are queued |
| PDF-R164 | Page and document status badges for forms, OCR, comments, redactions, encryption, signatures and diagnostics (formerly 145) | A form PDF shows a forms badge |
| PDF-R165 | Task-oriented starter workflows (legal filing, archive, worksheets, review, forms, accessibility) (formerly 146) | Choose "Legal filing"; the matching tools are set up |
| PDF-R166 | No serious or critical axe violations in the workspace | axe on the route reports none |
| PDF-R167 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) and passes the colour-contrast check in dark | With Dark chosen, axe colour-contrast on the workspace passes |

## Non-functional requirements

Rows PDF-R160 (responsive sheets), PDF-R161 (no horizontal overflow 320–2560 px), PDF-R166 (accessibility), PDF-R167 (site theme) and PDF-R37 (off-main-thread rendering) in the table above.

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Technique decisions

None: no function was compared between an ML and a non-ML method.

## Intent not recorded

- PDF-R102–PDF-R107: OCR is on-device ML (the 2026-09-12 design names tesseract.js); the ML ruleset comparison is recorded under Technique decisions when OCR is built.
- PDF-R32: the current minimum is 25 %; whether 10 % replaces it or is added below it is not recorded; owner may override.

## Change log

- 2026-10-05 — Created per `docs/DOCUMENTATION_STANDARD.md`. 167 requirements.

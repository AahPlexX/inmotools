---
tool: pdf-sanitizer
folder: src/tools/pdf
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-pdf-sanitizer-design.md
tracker: src/tools/pdf/TRACKER.md
updated: 2026-10-09
---

# PDF Sanitizer — tracker

## Resume here

2026-10-09 22:21 UTC: PDF-R02 and PDF-R03 remain partial; task 7f9e is active. Main `43eef1b1497e5744944bcfe0f8893fb472bff754` includes initial password-opening source `7fe9ac49606237e0b41b9de76acba4beb32eaa23`. Its dark dialog used undefined `--text` against dark `--surface`: the new measured-contrast regression fails in both profiles at 1.13257:1. The standalone axe scan returned no violations despite that visible defect; do not treat axe alone as contrast proof.

The narrow correction uses the existing `--ink` and `--line` tokens. Types and clean production build passed. After confirmed preview HTTP 200, the strengthened theme regression passed 2/2 in 41.8s, without retries or skips: desktop and touch each exercise Light, Dark and System, require at least 4.5:1 for dialog heading/filename/labels, run unrestricted dialog and owned read-only-control axe, open/render and clear. Earlier 14/14 password-flow cases and 42 PDF unit cases remain accepted only in their stated prior-source scopes. Existing 32 legacy browser cases retain their original receipts.

Old owned run `37997434143` and full run `37997433850` on `7fe9ac4` completed cancelled and are superseded. Cancellation happened after main contained the first runtime; that source was not kept off main. Publish the corrected immutable candidate through GitHub MCP, then run one replacement full gate. Do not reuse cancelled full validation or change runtime/tests during the replacement gate. Corrected main, Pages, qualified-live 16-case and completed full receipts are still pending. Complete those before verifying R02/R03 or implementing the next frozen item, PDF-R04. Current primary sources and distinct failed setup/baseline/repair attempts remain in VERIFICATION.md; no new auth, backend, dependency, workflow or password persistence.

## Documents

- Spec: [2026-10-05-pdf-sanitizer-design.md](../../../docs/superpowers/specs/2026-10-05-pdf-sanitizer-design.md)
- Older design: [2026-09-12-pdf-workstation-design.md](../../../docs/superpowers/specs/2026-09-12-pdf-workstation-design.md)
- Plan: [2026-09-12-pdf-workstation.md](../../../docs/superpowers/plans/2026-09-12-pdf-workstation.md)
- Older tracking: [STATUS.md](STATUS.md)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/pdf*.test.ts`; browser tests: `tests/e2e/pdf*.spec.ts`

## Requirement status

`unit` = `tests/unit/pdf*.test.ts`; `e2e` = `tests/e2e/pdf*.spec.ts`.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| PDF-R01 | verified | e2e "merges multiple source PDFs in the visible queue order" |  |
| PDF-R02 | partial | unit "does not create a loading task after the caller already cancelled"; e2e "PDF-R02 opens AES256 with password retry and actual reader text, search, pages and zoom" | Initial runtime on main43eef1b; dark correction is ready. Prior42units/14flow cases and corrected2theme cases pass in stated scopes. Corrected owned/full/main/Pages/live acceptance pending. |
| PDF-R03 | partial | e2e "PDF-R03 keeps empty-user protected documents read-only and produces no protected download" | Existing engine refusal preserved;3realfixture unit cases/newappcase pass. Final exact-source full/main/live gate pending withR02. |
| PDF-R04 | partial | unit "reports final page geometry for workstation page-box tooling" | Page count, size, form fields, Info metadata, page geometry and attachments are shown; encryption detail, active content and structural warnings are not |
| PDF-R05 | missing | — |  |
| PDF-R06 | verified | e2e "merges multiple source PDFs in the visible queue order"; unit "combines local PDFs without changing the source buffers" |  |
| PDF-R07 | missing | — | One output per export; a range selection extracts into that output (PDF-R11) |
| PDF-R08 | missing | — |  |
| PDF-R09 | missing | — |  |
| PDF-R10 | missing | — |  |
| PDF-R11 | verified | e2e "extracts an exact selected page range into the rebuilt output"; unit "validates ranges before processing and preserves explicit order/repeats" |  |
| PDF-R12 | verified | e2e "keeps an empty Even preset distinct from All and reorders output without requiring drag gestures"; unit "keeps an empty preset distinct from the all-pages sentinel" |  |
| PDF-R13 | partial | e2e "merges multiple source PDFs in the visible queue order" | Pages from another PDF are placed by queue order of whole selections; there is no insert-at-page control |
| PDF-R14 | verified | unit "inserts custom-sized blank pages at deterministic anchors"; e2e "inserts blank pages, edits page boxes, and writes metadata dates through the visible workstation" |  |
| PDF-R15 | verified | e2e "duplicates pages when a page number is intentionally repeated"; unit "uses the requested page order and preserves duplicates" |  |
| PDF-R16 | partial | unit "validates ranges before processing and preserves explicit order/repeats" | Pages are left out by the page selection; no delete control, multi-select or undo |
| PDF-R17 | partial | e2e "keeps an empty Even preset distinct from All and reorders output without requiring drag gestures" | Documents reorder by position select and Move up/down; pages reorder only by typing the selection order; no drag |
| PDF-R18 | implemented | — | `PdfWorkspace.tsx`; no test |
| PDF-R19 | verified | e2e "persists the selected 90 degree page rotation in downloaded bytes" |  |
| PDF-R20 | missing | — |  |
| PDF-R21 | missing | — |  |
| PDF-R22 | partial | unit "applies final-output page-box edits and rejects boxes outside the MediaBox" | CropBox is edited numerically (PDF-R24); no visual crop |
| PDF-R23 | missing | — |  |
| PDF-R24 | verified | unit "applies final-output page-box edits and rejects boxes outside the MediaBox", "reports final page geometry for workstation page-box tooling" |  |
| PDF-R25 | partial | unit "applies final-output page-box edits and rejects boxes outside the MediaBox" | Enlarging the MediaBox keeps content in place; no scale-content mode |
| PDF-R26 | missing | — |  |
| PDF-R27 | missing | — |  |
| PDF-R28 | missing | — |  |
| PDF-R29 | missing | — |  |
| PDF-R30 | verified | e2e "renders through a real worker with selectable text, document search navigation, and zoom"; unit "keeps CSS viewport dimensions separate from bounded HiDPI backing pixels" |  |
| PDF-R31 | partial | unit "normalizes zoom to a finite usable range"; e2e "renders through a real worker with selectable text, document search navigation, and zoom" | Numeric zoom 25–500 %; fit width, fit page and fit selection are missing |
| PDF-R32 | missing | — | Current minimum is 25 % |
| PDF-R33 | missing | — |  |
| PDF-R34 | verified | e2e "renders through a real worker with selectable text, document search navigation, and zoom"; unit "finds bounded case-insensitive matches with useful excerpts", "bounds results to protect the UI from pathological documents" |  |
| PDF-R35 | verified | e2e "renders through a real worker with selectable text, document search navigation, and zoom" |  |
| PDF-R36 | missing | — |  |
| PDF-R37 | partial | unit "cancels a stale render before replacing it and cancels all active renders on destroy" | Parsing runs in the PDF.js worker; painting is on a main-thread canvas |
| PDF-R38 | missing | — |  |
| PDF-R39 | missing | — |  |
| PDF-R40 | missing | — |  |
| PDF-R41 | missing | — |  |
| PDF-R42 | missing | — |  |
| PDF-R43 | missing | — |  |
| PDF-R44 | missing | — |  |
| PDF-R45 | missing | — |  |
| PDF-R46 | missing | — |  |
| PDF-R47 | missing | — |  |
| PDF-R48 | missing | — |  |
| PDF-R49 | missing | — |  |
| PDF-R50 | missing | — |  |
| PDF-R51 | missing | — |  |
| PDF-R52 | missing | — |  |
| PDF-R53 | missing | — |  |
| PDF-R54 | missing | — |  |
| PDF-R55 | missing | — |  |
| PDF-R56 | missing | — |  |
| PDF-R57 | missing | — |  |
| PDF-R58 | missing | — |  |
| PDF-R59 | missing | — |  |
| PDF-R60 | missing | — |  |
| PDF-R61 | missing | — |  |
| PDF-R62 | missing | — |  |
| PDF-R63 | missing | — |  |
| PDF-R64 | missing | — |  |
| PDF-R65 | missing | — |  |
| PDF-R66 | missing | — |  |
| PDF-R67 | verified | unit "reports field type, pages, flags, current state, and reset/default state without mutating the source"; e2e "shows rich existing AcroForm inventory on demand without requiring another upload" |  |
| PDF-R68 | missing | — | Existing fields are listed (PDF-R67) but not editable |
| PDF-R69 | verified | unit "authors deterministic workstation form fields onto copied output pages"; e2e "authors text, checkbox, dropdown, radio, and option-list fields through visible controls" |  |
| PDF-R70 | verified | e2e "authors text, checkbox, dropdown, radio, and option-list fields through visible controls" |  |
| PDF-R71 | verified | unit "authors radio groups and multiselect option lists with flags and selections" |  |
| PDF-R72 | verified | e2e "authors text, checkbox, dropdown, radio, and option-list fields through visible controls" |  |
| PDF-R73 | verified | unit "authors radio groups and multiselect option lists with flags and selections", "rejects duplicate radio options and option-list selections outside the declared options" |  |
| PDF-R74 | verified | unit "persists standard font, alignment, font size, and real reset defaults separately from current values"; e2e "persists visible font, alignment, and reset defaults separately from current form values" |  |
| PDF-R75 | missing | — |  |
| PDF-R76 | missing | — |  |
| PDF-R77 | missing | — |  |
| PDF-R78 | missing | — |  |
| PDF-R79 | missing | — |  |
| PDF-R80 | partial | e2e "authors text, checkbox, dropdown, radio, and option-list fields through visible controls" | Staged fields can be removed one by one; no reset of staged values |
| PDF-R81 | verified | unit "flattens form fields and rebuilds into a metadata-clean output document"; e2e "flattens an existing source field while retaining a newly authored editable field" |  |
| PDF-R82 | verified | unit "blocks form-bearing page copies when flattening is disabled instead of silently losing fields"; e2e "blocks unsupported editable-form preservation and verifies flattened output before download" |  |
| PDF-R83 | missing | — |  |
| PDF-R84 | missing | — |  |
| PDF-R85 | missing | — |  |
| PDF-R86 | verified | unit "draws header, footer, Bates, text watermark, and image watermark with a resolved audit plan", "rejects invalid Bates and watermark settings before drawing"; e2e "exports deterministic page tokens, Bates numbering, text watermark, and image watermark from visible controls" |  |
| PDF-R87 | verified | unit "draws header, footer, Bates, text watermark, and image watermark with a resolved audit plan" |  |
| PDF-R88 | verified | unit "draws header, footer, Bates, text watermark, and image watermark with a resolved audit plan" |  |
| PDF-R89 | verified | e2e "exports deterministic page tokens, Bates numbering, text watermark, and image watermark from visible controls" |  |
| PDF-R90 | missing | — | Watermarks draw over the content |
| PDF-R91 | verified | unit "resolves deterministic page, total, date, filename, and Bates tokens" |  |
| PDF-R92 | missing | — |  |
| PDF-R93 | missing | — |  |
| PDF-R94 | verified | unit "authors attachments with metadata and reopens their exact bytes", "rejects blank, duplicate, path-like, and oversized staged attachment names" |  |
| PDF-R95 | verified | unit "recursively inventories and extracts attachments stored under name-tree Kids", "does not silently carry source attachments into rebuilt output", "fails closed when two source entries resolve to the same actionable display filename"; e2e "inventories, extracts, and authors embedded file attachments without silently carrying source files forward" |  |
| PDF-R96 | missing | — |  |
| PDF-R97 | missing | — |  |
| PDF-R98 | missing | — |  |
| PDF-R99 | missing | — |  |
| PDF-R100 | missing | — |  |
| PDF-R101 | missing | — |  |
| PDF-R102 | missing | — |  |
| PDF-R103 | missing | — |  |
| PDF-R104 | missing | — |  |
| PDF-R105 | missing | — |  |
| PDF-R106 | missing | — |  |
| PDF-R107 | missing | — |  |
| PDF-R108 | verified | unit "writes explicit workstation metadata without restoring source metadata"; e2e "authors export metadata from the visible workstation and reflows at 320 CSS pixels" |  |
| PDF-R109 | missing | — |  |
| PDF-R110 | missing | — |  |
| PDF-R111 | partial | unit "flattens form fields and rebuilds into a metadata-clean output document", "keeps unspecified source Info metadata out of partial replacement exports" | The rebuilt output carries no source Info or catalog XMP; no before/after report |
| PDF-R112 | missing | — |  |
| PDF-R113 | missing | — |  |
| PDF-R114 | missing | — |  |
| PDF-R115 | missing | — |  |
| PDF-R116 | missing | — |  |
| PDF-R117 | missing | — |  |
| PDF-R118 | missing | — |  |
| PDF-R119 | missing | — |  |
| PDF-R120 | missing | — |  |
| PDF-R121 | missing | — |  |
| PDF-R122 | missing | — |  |
| PDF-R123 | missing | — |  |
| PDF-R124 | missing | — |  |
| PDF-R125 | missing | — |  |
| PDF-R126 | partial | unit "flattens form fields and rebuilds into a metadata-clean output document" | Form fields flatten (PDF-R81); annotations and editor layers do not |
| PDF-R127 | missing | — |  |
| PDF-R128 | partial | unit "does not silently carry source attachments into rebuilt output", "keeps unspecified source Info metadata out of partial replacement exports" | Rebuild drops document-level metadata, attachments and catalog actions; page-level annotations and their actions are kept; no audit report |
| PDF-R129 | missing | — |  |
| PDF-R130 | missing | — |  |
| PDF-R131 | missing | — |  |
| PDF-R132 | missing | — |  |
| PDF-R133 | missing | — |  |
| PDF-R134 | missing | — |  |
| PDF-R135 | missing | — |  |
| PDF-R136 | partial | e2e "inserts blank pages, edits page boxes, and writes metadata dates through the visible workstation" | Every current staged change exports; the editing layer (PDF-R38–R49) does not exist |
| PDF-R137 | verified | e2e "extracts an exact selected page range into the rebuilt output" |  |
| PDF-R138 | missing | — |  |
| PDF-R139 | missing | — |  |
| PDF-R140 | missing | — |  |
| PDF-R141 | missing | — |  |
| PDF-R142 | missing | — |  |
| PDF-R143 | missing | — |  |
| PDF-R144 | missing | — |  |
| PDF-R145 | missing | — |  |
| PDF-R146 | partial | e2e "authors export metadata from the visible workstation and reflows at 320 CSS pixels" | The output filename is editable; no batch pattern |
| PDF-R147 | verified | e2e "updates destructive, structural, and reversible export impacts before bytes are generated" |  |
| PDF-R148 | verified | unit "classifies destructive, structural, and reversible staged changes before export", "returns a single neutral staging entry when no extra mutation is staged" |  |
| PDF-R149 | partial | e2e "keeps an empty Even preset distinct from All and reorders output without requiring drag gestures" | Output page order preview, page count, summary and filename exist; no target profile |
| PDF-R150 | missing | — |  |
| PDF-R151 | missing | — |  |
| PDF-R152 | missing | — |  |
| PDF-R153 | verified | unit "classifies destructive, structural, and reversible staged changes before export"; e2e "updates destructive, structural, and reversible export impacts before bytes are generated" |  |
| PDF-R154 | missing | — |  |
| PDF-R155 | missing | — |  |
| PDF-R156 | missing | — |  |
| PDF-R157 | missing | — |  |
| PDF-R158 | missing | — |  |
| PDF-R159 | missing | — |  |
| PDF-R160 | partial | e2e "authors export metadata from the visible workstation and reflows at 320 CSS pixels" | Single-column layout reflows at 320 px; no drawers or sheets |
| PDF-R161 | partial | e2e "authors export metadata from the visible workstation and reflows at 320 CSS pixels" | 320 px is tested; wider widths are not |
| PDF-R162 | missing | — |  |
| PDF-R163 | partial | e2e "merges multiple source PDFs in the visible queue order" | The native file input works; drop intake is missing |
| PDF-R164 | partial | e2e "inventories, extracts, and authors embedded file attachments without silently carrying source files forward" | Queue items list form-field, attachment and metadata counts; other badges are missing |
| PDF-R165 | missing | — |  |
| PDF-R166 | verified | `tests/e2e/accessibility.spec.ts` "has no serious or critical axe violations at <route>" (route `pdf-sanitizer`) |  |
| PDF-R167 | partial | — | Password dialog and read-only controls have Light/Dark/System contrast/accessibility coverage; whole-tool theme acceptance is incomplete, and the viewer frame remains fixed light (`PdfCanvas.tsx`) |

## Open work

1. Finish corrected-source PDF-R02/R03 acceptance, then PDF-R04 in frozen inventory order. PDF-R31, PDF-R33 and PDF-R05 remain later viewer work.
2. PDF-R68, PDF-R78, PDF-R79: fill existing fields and form-data interchange.
3. PDF-R07, PDF-R08, PDF-R145: multi-output splitting with ZIP.
4. PDF-R38–PDF-R49: editing layer.
5. PDF-R50–PDF-R66: annotation and measurement.
6. PDF-R83–PDF-R85: true redaction.
7. PDF-R167, PDF-R161: dark theme and the width matrix.
8. Remaining `missing` and `partial` rows in table order.

## Known limitations

- Protected PDFs can be opened for local read-only viewing; protected inputs remain excluded from editable processing and downloads. Final corrected-source acceptance is pending.
- Source form fields must be flattened before page copying; editable source fields are not carried into the output.
- Page-level annotations (and any actions they carry) are kept in the rebuilt output.

## Verification evidence

- 2026-10-05, `expand/pdf-sanitizer` from `main` @ `6c991e75`: `pnpm tool:check pdf-sanitizer --base origin/main` 33/167, no errors.

## Change log

- 2026-10-05 — Created per `docs/DOCUMENTATION_STANDARD.md`.

- 2026-10-09 21:49 UTC: PDF-R02 partial; strengthened final browser run exposed a native reverse-Tab boundary failure before axe analysis. Direct focus probe and W3C modal-dialog APG refreshedHTTP200 today corroborate first/last tabbable wrapping. Added owned first/last Tab handling; no test assertion/timeout weakened. Existing final10queue/exportcases and42units/types/build remain prior-source receipts. Fresh repaired TypeScript/build and password keyboard/axe/long-name acceptance required; all final partition results will be read separately. No candidate release/full claim.

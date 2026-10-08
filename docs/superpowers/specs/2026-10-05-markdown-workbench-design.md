---
tool: markdown-workbench
folder: src/tools/markdown
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-markdown-workbench-design.md
tracker: src/tools/markdown/TRACKER.md
updated: 2026-10-07
---

# Markdown Workbench — spec

Historical specification baseline: `947272db`. Current implementation and exact release/checkpoint receipts are recorded in the tracker. Requirement prefix: `MDW`. Status of each requirement: [TRACKER.md](../../../src/tools/markdown/TRACKER.md).

"(formerly Fnn)" gives the function number in the ten-function ledger of [markdown-audit-2026-09-16.md](../../markdown-audit-2026-09-16.md) ("Real-world remediation pass" and "Historical branch reconciliation", 2026-09-27).

History (kept as written): [2026-09-04-markdown-workbench-design.md](2026-09-04-markdown-workbench-design.md), plan [2026-09-04-markdown-workbench.md](../plans/2026-09-04-markdown-workbench.md), audits [markdown-audit-2026-09-16.md](../../markdown-audit-2026-09-16.md) and [markdown-audit-2026-09-19.md](../../markdown-audit-2026-09-19.md), [README.md](../../../src/tools/markdown/README.md).

## Purpose

Write CommonMark and GFM documents with live preview, math, diagrams, table formulas and formatted citations, and export them as Markdown, HTML, PDF, DOCX, EPUB or a syntax tree, entirely in the browser; for technical writers, researchers and documentation engineers.

## Scope

In scope: editing, preview, rendering extensions, citations, navigation and metrics, local files and drafts, and exports listed below.

Out of scope: real-time collaboration, cloud sync and comment threads (need a server: platform rules); PlantUML and LaTeX-package diagrams such as `tikz-cd` (need a server or a full TeX engine that cannot run in the browser).

## Constraints

- Platform rules: no accounts or authentication; no server, backend or server-side database (static files on GitHub Pages); everything runs in the browser and data the tool keeps stays in this browser; network use only for the site's own files and public keyless sources on the person's own action ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- No large language models; other ML only on the device under the ML ruleset ([standard](../../DOCUMENTATION_STANDARD.md#machine-learning-and-ai)).
- GitHub Pages cannot send COOP/COEP headers, so WebAssembly runs single-threaded only.
- Rendering never enables raw HTML; output is sanitized with `rehype-sanitize`.
- Citation styles (APA 7th, IEEE, Chicago author-date, MLA 9th) and the en-US locale are bundled; formatting never fetches. Vancouver is not offered: published Vancouver CSL files are dependent styles and multi-file style resolution is not implemented.
- Table formulas use a closed grammar with no `eval` or `Function`.
- DOCX math is plain text; EPUB is structural and not EPUBCheck-validated; PDF uses the browser print pipeline.
- Drafts are stored in IndexedDB; editor settings in localStorage under `inmotools.markdown-workbench.prefs`.

## Architecture and engine

- Engines and libraries: `unified@11.0.5`, `remark-parse@11.0.0`, `remark-gfm@4.0.1`, `remark-math@6.0.0`, `remark-rehype@11.1.2`, `rehype-sanitize@6.0.0`, `rehype-katex@7.0.1` and `hast-util-to-html@9.0.5` parse, sanitise and render Markdown; `katex@0.18.9` typesets math; `mermaid@12.0.0` renders Mermaid diagrams on the main thread; `@hpcc-js/wasm-graphviz@1.28.0` renders Graphviz DOT; `citeproc@2.4.63` formats citations with bundled APA, IEEE, Chicago author-date and MLA styles and the en-US locale; `yaml@2.9.0` and `smol-toml@1.9.0` parse front matter; `turndown@7.2.4` converts pasted HTML to Markdown; `docx@9.7.1` and `jszip@3.10.2` build DOCX and EPUB exports; `@codemirror/state@6.7.1`, `@codemirror/view@6.43.9`, `@codemirror/commands@6.11.1`, `@codemirror/language@6.12.4`, `@codemirror/lang-markdown@6.5.2`, `@codemirror/autocomplete@6.20.3`, `@codemirror/search@6.7.1`, `@codemirror/legacy-modes@6.5.4`, `@lezer/highlight@1.2.3` and `@replit/codemirror-vim@6.4.0` provide the editor with code-block highlighting and optional Vim keys.
- Readability: `syllable@5.0.1` estimates English syllables on the main thread with per-computation caching and a 128-character token limit; Flesch–Kincaid and Coleman–Liau use native authored prose counts. Distributed MIT declarations/notices: `public/markdown/readability-LICENSE.txt`.
- Workers: `diagram.worker.ts` renders Graphviz DOT with WebAssembly, one worker per request terminated after its response; `table-formula.worker.ts` evaluates Markdown table formulas and falls back to the main thread when Workers are unavailable or fail to start.
- Storage: IndexedDB database `inmotools.markdown-workbench` (version 1), object store `drafts` (keyPath `id`), holds per-document autosaved drafts; localStorage key `inmotools.markdown-workbench.prefs` holds editor preferences.
- Browser APIs: IndexedDB (autosave is skipped when it is missing), `navigator.storage.estimate` (storage usage), Clipboard API (copy; a blocked clipboard reports a status message), FileReader (pasted or dropped images embedded as data URLs), `window.print` (print or PDF output), Blob downloads, Web Workers.

## Requirements

### Editing

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| MDW-R01 | Source, Split and Preview views; Preview is full width and the editor stays mounted so text, caret and history survive (formerly F05) | Switch to Preview and back; the text and caret are unchanged |
| MDW-R02 | The preview updates live as the source changes | Type a heading; it appears in the preview |
| MDW-R03 | In Split view, scrolling either pane moves the other without moving the caret | Scroll the source; the preview follows; scroll the preview; the source follows |
| MDW-R04 | Source syntax highlighting and line numbers in the editor | Headings and emphasis in the source carry highlight styles |
| MDW-R05 | Formatting toolbar: heading cycle, bold, italic, strikethrough, inline code, code block, blockquote, bullet and numbered lists, horizontal rule, link, image, task and table starter, each one undoable | Each button inserts its Markdown around the selection |
| MDW-R06 | Keyboard shortcuts Ctrl/Cmd+B, I, E, K and Ctrl/Cmd+Shift+. / 8 / 7 match the toolbar actions (formerly F07) | Ctrl+B wraps the selection in ** |
| MDW-R07 | Toolbar buttons have keyboard-reachable explanatory tooltips | Focusing Heading shows its tooltip |
| MDW-R08 | Find and replace through a visible button and the editor's search panel | Find / replace opens the search panel and replaces a word |
| MDW-R09 | Find and replace with regular expressions and match case | Regex `\d+` replaces every number |
| MDW-R10 | Context-aware syntax suggestions, on by default and switchable off | Typing `[` offers link syntax; turning suggestions off stops it |
| MDW-R11 | Font size control with a visible value, keeping the caret and document when changed | Press ArrowRight on Font size; the value reads 14 px and the text is unchanged |
| MDW-R12 | Wrap lines, Vim keys and Spellcheck switches, with editor settings remembered in this browser (`inmotools.markdown-workbench.prefs`); unknown/wrong-type settings and out-of-range font sizes fall back to usable defaults | Turn on Vim keys and reload; Vim keys is still on and Esc enters normal mode; malformed preference values cannot select an unknown view or unusable font size |
| MDW-R13 | Toolbar Undo step and Redo step group adjacent typing into document steps; the editor keeps its own Ctrl/Cmd+Z history | Type twice, Undo step removes both; Redo step restores them |
| MDW-R14 | Focus writing hides export and panels and keeps the save state, live counts and an exit control | Focus writing hides the panels; Exit focus restores them |
| MDW-R15 | Typewriter mode keeps the caret line vertically centred while typing | Type at the end of a long document; the caret line stays at mid-height |
| MDW-R16 | Syntax guide dialog with examples, focus return and a reachable close control on small screens | Open the guide, press Escape; focus returns to its trigger |
| MDW-R17 | A table builder inserts a table with a chosen number of data rows (1–100) and columns (1–20), retaining the quick starter | Choose 3 data rows and 4 columns; a header plus 3 data rows, each with 4 cells, is inserted; invalid/fractional/out-of-range dimensions cannot insert |
| MDW-R18 | Markdown checks report line-linked style suggestions for heading level jumps, unnecessary trailing whitespace and adjacent unordered-list marker changes; preserve hard breaks and literal code/math/HTML/frontmatter; no source mutation | A document jumping from # to ### reports the real source line; selecting a suggestion reveals that line; valid two-space hard breaks are not reported. Display the first 200 suggestions and disclose the total if capped |
| MDW-R19 | Auto-format normalises Markdown list markers, spacing and table alignment in a cancellable local worker; retains frontmatter/code/single-tilde delimiters, maps the caret and preserves a separate Undo step | Auto-format aligns a ragged table's pipes; Undo restores the exact source. A delayed formatter cannot overwrite newer edits |
| MDW-R20 | Vim mode command set beyond keybindings: ex commands such as :w save the draft | :w saves the draft |

### Markdown syntax and rendering

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| MDW-R21 | CommonMark and GFM: headings, tables, strikethrough, task lists, autolinks and footnotes | A GFM table and a footnote render |
| MDW-R22 | Rendered HTML is sanitized: scripts, javascript: URLs and event handlers are removed | A <script> in the source renders as inert text |
| MDW-R23 | Heading levels are visibly distinct in the preview | H1 to H6 render at decreasing sizes |
| MDW-R24 | Headings get GitHub-style anchor ids with duplicates numbered, matching the outline | Two "Intro" headings get intro and intro-1 |
| MDW-R25 | Fragment links in the preview scroll inside the preview without changing the tool's route (formerly F04) | Clicking a TOC link lands on its heading and the address still shows #/tools/markdown-workbench |
| MDW-R26 | Insert a table of contents built from the headings | Table of contents inserts a nested link list |
| MDW-R27 | Fenced code is coloured by language (about 40 aliases); unknown languages stay plain (formerly F08) | A javascript fence shows coloured tokens; an unknown tag stays plain |
| MDW-R28 | Fences over 20,000 characters are shown plain without highlighting (formerly F09) | A 26,000-character fence renders with no token spans |
| MDW-R29 | Live-preview code blocks show bounded line numbers and a Copy button; controls remain usable in narrow/oriented views and absent from exports/print | Copy preserves every literal line and terminal newline; blocked clipboard access offers selectable code; nested task controls preserve source; long blocks keep only visible line numbers in the DOM |
| MDW-R30 | GitHub alert callouts: NOTE, TIP, IMPORTANT, WARNING and CAUTION | > [!TIP] renders a styled tip callout |
| MDW-R31 | A DANGER callout kind, documented as a Workbench extension; alert styling persists in standalone HTML and EPUB | > [!DANGER] renders a titled danger callout with formatting; escaped markers stay literal; portrait/landscape and dark themes stay readable; detached HTML/EPUB include self-contained alert styling |
| MDW-R32 | Emoji shortcodes (about 150) render as emoji outside code; unknown codes stay as written | :tada: renders 🎉; `:tada:` in code stays text |
| MDW-R33 | Subscript and superscript (H~2~O, x^2^) as short literal spans; unescaped spaces/newlines are excluded and double tildes retain strikethrough | Preview, HTML, EPUB and DOCX preserve script formatting; AST exposes positioned script nodes; escaped/entity-written markers, code and math remain literal; escaped spaces work; source text and auto-format retain meaning |
| MDW-R34 | One-line abbreviation definitions (`*[HTML]: HyperText Markup Language`) anywhere in the document; case-sensitive whole labels, longest matching label and first definition wins | Preview/HTML/EPUB render semantic abbr with an escaped title; definition lines are hidden; code/math/raw HTML and larger words stay literal; empty expansions omit title; DOCX keeps readable labels; auto-format preserves definitions; a collapsible glossary makes used expansions available without hover at phone/keyboard sizes |
| MDW-R35 | Definition lists using the primary Markdown Extra grammar and pinned remark-definition-list@2.0.1 | Term followed by `: definition` renders semantic dl/dt/dd; multiple terms/definitions and continued/nested blocks retain meaning; code/math and malformed markers remain literal; AST/HTML/EPUB/DOCX preserve readable structure; local HTML import retains terms/definitions; auto-format and narrow/oriented layouts preserve content |
| MDW-R36 | Source-positioned details/summary disclosure blocks with optional open/name attributes | Native keyboard/touch toggle; nested Markdown content and literal code remain intact; malformed/unsafe wrappers stay inert and readable; source/AST/DOCX/HTML/EPUB/import retain content; grouping, stable unique-caption expansion within a document, narrow/oriented wrapping, closed-target navigation, print and format/Undo work without toggling a surrounding task; quoted task clicks edit only their native checkbox marker and preserve all source outside it |
| MDW-R37 | Clicking a task checkbox in the preview toggles that line in the source | Click an open task; the source line reads - [x] |
| MDW-R38 | Native task progress (completed of total) for the current document | Two of three tasks checked shows 2/3; nested quotes/lists/disclosures/footnotes count once, code/metadata/literal fallback are excluded; zero tasks is explicit without an indeterminate bar; preview toggles, source edits, Undo/Redo, import and document replacement update counts; accessible determinate progress and text stay readable without overlap at narrow portrait/landscape sizes |
| MDW-R39 | Frontmatter in YAML, TOML or JSON is parsed, shown in a panel, and its title names the document | YAML title: Notes names exports notes.*; circular/shared aliases display without blanking the app; non-finite values stay readable; original downloads and narrow/oriented label/value bounds are retained |
| MDW-R40 | Math with KaTeX (inline and display, mhchem, CD) | $a^2$ renders KaTeX markup |
| MDW-R41 | Math check panel lists malformed expressions by line without breaking the preview | A broken expression is listed with its line |
| MDW-R42 | Mermaid diagrams render in the preview, with visible line-specific errors and a size limit | A flowchart renders as SVG; a broken one shows an error |
| MDW-R43 | Graphviz (dot) diagrams render in a worker, and their SVG is sanitized | A dot graph renders; a javascript: link in it is removed |
| MDW-R44 | Table formulas (=SUM, AVERAGE, MIN, MAX, COUNT, ROUND, cell arithmetic) evaluate in a worker, with cycles reported as #REF! | =B2*C2 shows its value; a cycle shows #REF! |
| MDW-R45 | Slides panel splits the document at --- and jumps to each slide | Three sections give three slides |

### Citations

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| MDW-R46 | Load a bibliography by pasting BibTeX or CSL-JSON or from a local file | Load a .bib file; its keys resolve |
| MDW-R47 | [@key] markers are replaced by formatted citations in APA 7th, IEEE, Chicago (author-date) or MLA 9th | APA formats (Author, 2020) |
| MDW-R48 | Unresolved keys are listed and left as written; markers in code are never rewritten | [@missing] stays visible and is reported |
| MDW-R49 | Changing the style never shows the previous style's output while the new one loads | Switch APA to IEEE; no APA text remains |
| MDW-R50 | An invalid bibliography explains the parse problem | Pasting broken BibTeX shows an explanation |
| MDW-R51 | A generated References section lists resolved document citations once in the bundled CSL style order, without editing original source | Preview, rendered Markdown, HTML, DOCX, EPUB and AST include cited entries; code/metadata/literal markers and uncited library entries are excluded; style/library/document resets remove stale entries; long references wrap on phone portrait/landscape and tablet |

### Navigation and metrics

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| MDW-R52 | Outline panel from headings with click-to-jump, filtering and the current section marked | Filter "Intro"; clicking it moves the editor to that line |
| MDW-R53 | Words, lines and reading time in the status bar | Typing updates the live counts |
| MDW-R54 | Metrics panel: words, characters, source characters, lines, sentences, reading and speaking time, Gunning Fog index | A two-sentence passage reports 2 sentences |
| MDW-R55 | Flesch-Kincaid grade and Coleman-Liau index for English prose, with unavailable empty/unsupported state and native Markdown exclusions | Official published rounded Coleman fixtures and independently counted Flesch formula fixture match; lifecycle preserves source and metrics fit narrow/rotated viewports |
| MDW-R56 | Syntax-tree (AST) inspector panel showing the parsed tree next to the source | Selecting a node highlights its source range |
| MDW-R57 | Diff view between the current text and a saved draft or the opened file | Edit a line; the diff shows it as changed |

MDW-R56 detail: the Syntax tree panel (collapsed by default) shows the document's mdast tree below the toolbar as an ARIA tree. Arrow Up/Down move and select, Right/Left expand, collapse or move to the parent, Home/End jump, Enter/Space select. Selecting a node highlights its source range in the editor (front matter lines are accounted for) without moving focus. Only expanded branches are built and rows are windowed; at most 20000 rows are listed. The highlight and selection follow edits by node path and clear when the path no longer exists.

MDW-R57 detail: the Compare changes panel (collapsed by default) compares the current text with a baseline chosen from a list: the file opened this session (selected automatically when a file is opened) or any saved local draft. The unified read-only view marks added or changed lines and shows removed lines as struck blocks, with unchanged runs collapsed; a summary states the number of changes and lines. Line-ending style is ignored. The view is built only while the panel is open.

MDW-R69 detail: each saved draft keeps earlier versions in IndexedDB (store `snapshots`, database version 2). Every manual save (button or Ctrl/Cmd+S) adds a version; automatic saves add one at most every 60 seconds; identical text is not stored twice in a row; the newest 20 versions per draft are kept. The "Local drafts and storage" panel lists the current draft's versions newest first with time and first line. Restore puts that text in the editor; the text it replaces is kept as a version first. Deleting a draft deletes its versions; New and Open start with none.

MDW-R70 detail: a tab bar appears once more than one document is open. "New tab" starts a blank document and "Open in new tab" opens a file, each leaving the current document open; "Open document" and "New" still replace the document in the current tab. Switching keeps each tab's text, undo steps, name and draft link. A tab's document is saved as a local draft before it is left, so closing a tab or reloading keeps the draft in the draft list; open tabs themselves are not restored after a reload. Choosing a draft that is already open in a tab switches to that tab. At most 10 tabs; the tab strip wraps and long names are shortened. Tabs are keyboard operable (Arrow keys, Home, End).

MDW-R71 detail: the "Local drafts and storage" panel has "Export all drafts (ZIP)" and "Import drafts (ZIP)". Export first saves the current document if it changed, then downloads `markdown-drafts.zip` with one `<draft name>.md` per saved draft (UTF-8; characters not allowed in file names are removed; equal names get ` (2)`, ` (3)`). Entries are sorted by name, have a fixed modification time and the same compression, so the same drafts give the same bytes. Import reads every `.md`, `.markdown` and `.txt` file in any ZIP (folders, hidden files, `__MACOSX` and other types are ignored) and adds each as a new local draft named after the file; a document whose name and text match a saved draft is skipped, and the status reports both counts. Limits: 500 documents, 5 MB per document, 50 MB in total; a file that is not a ZIP is refused with a message. Import does not change the document being edited.

MDW-R72 detail: the Table builder dialog gains "Table from CSV" and "Table as CSV". Pasted CSV follows RFC 4180 (quoted fields, doubled quotes, line breaks inside quotes); the separator is a comma, or a semicolon or tab when the first row uses it. The first row becomes the header, short rows are padded, `|` is written `\|` and line breaks inside a cell are written `<br>`; the pipe table replaces the selection like other table inserts. Limits: 5000 rows, 100 columns; empty input and an unclosed quote are reported in the dialog. "Copy as CSV" copies the table that contains the cursor (found from the parsed document, so tables in code blocks are not offered) with the delimiter row removed, `\|` and `<br>` restored, fields quoted when they contain a comma, quote, line break or edge spaces, and lines separated by `\n`; it is disabled when the cursor is not in a table.

### Files and storage

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| MDW-R58 | Open a local .md, .markdown or .txt file by picker or by dropping it, without upload; other kinds are refused (formerly F06) | Open notes.md; it replaces the document; a .png is refused |
| MDW-R59 | Open a local HTML file and convert it to Markdown | Open page.html; its headings become # lines |
| MDW-R60 | Opening a file saves dirty work first and gives the opened file its own draft (formerly F01, F02) | Edit, open a file; the previous draft keeps the edit |
| MDW-R61 | A file read or new document that races a newer edit is cancelled, keeping the edit | Type during a slow file read; the edit stays |
| MDW-R62 | Paste or drop an image to embed it as a data URI, up to 5 MB | Paste a PNG; ![](data:image/png…) is inserted |
| MDW-R63 | Autosave drafts to IndexedDB after edits; untouched starter text is not saved | Edit, wait; the draft is listed; the untouched starter creates none |
| MDW-R64 | Drafts keep their name and timestamp; a name-only change is saved (formerly F03) | Rename the document; the draft shows the new name after reload |
| MDW-R65 | Save draft (Ctrl/Cmd+S), list, reload and delete drafts; New saves first and starts a blank document | Save, reload the draft, delete it |
| MDW-R66 | A failed save is reported and the edits are kept | With storage failing, Save reports the failure |
| MDW-R67 | Storage usage and quota shown in the drafts panel | The panel shows used and available storage |
| MDW-R68 | Leaving the page with unsaved changes asks for confirmation; a clean document does not | Edit, close the tab; the browser asks |
| MDW-R69 | Snapshots: earlier versions of a draft are kept and can be restored | Save twice; the first version can be restored |
| MDW-R70 | Several documents open at once in tabs, switchable without reloading | Open two documents; switching keeps both texts |
| MDW-R71 | Export every draft as one ZIP and import such a ZIP | Three drafts export to a ZIP with three .md files and import back |
| MDW-R72 | CSV to a Markdown table and a Markdown table to CSV | Paste CSV; a pipe table is inserted; Copy as CSV returns the CSV |

### Export

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| MDW-R73 | The document name drives every export filename and title, defaulting to the frontmatter title, then the first heading | Name "Field notes" exports field-notes.md |
| MDW-R74 | Export Markdown as typed, and rendered Markdown with formulas and citations filled in | The rendered export has formula values; the plain export keeps =B2*C2 |
| MDW-R75 | Standalone HTML with images, KaTeX CSS, diagrams and code colours bundled, from any view | Exported HTML from Source view contains the body and token CSS |
| MDW-R76 | Print / PDF through the browser print dialog with a print stylesheet that prints only the document | Print / PDF opens the print dialog |
| MDW-R77 | DOCX export with headings, emphasis, tables, code, lists, links, footnotes and math as plain text | The DOCX is a valid ZIP with the document text |
| MDW-R78 | Structural EPUB with OPF, NCX, nav, images, stylesheet, code colours and diagrams | The EPUB has an uncompressed mimetype and the chapter |
| MDW-R79 | AST JSON export of the prepared document | The JSON parses back to the same tree |
| MDW-R80 | Copy Markdown and Copy HTML to the clipboard, with diagrams and code colours in the HTML | Copy HTML yields token classes and rendered Mermaid |
| MDW-R81 | Plain text (.txt) export | Export TXT gives the text without Markdown marks |
| MDW-R82 | Pandoc-compatible Markdown export (Pandoc citation, footnote and metadata syntax) | The export converts with pandoc to the same headings and citations |

### Non-functional

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| MDW-R83 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) and passes the colour-contrast check in dark | `E2E_THEME=dark` axe scan of `#/tools/markdown-workbench` has no color-contrast violation |
| MDW-R84 | Dark workspace switch for the tool, reversible without changing the document | Turn it on and off; the document is unchanged |
| MDW-R85 | Reading view themes for the preview (for example sepia and high contrast) | Choose sepia; the preview background changes |
| MDW-R86 | Responsive layout: no horizontal overflow, overlapping text or clipped containers from 320 to 2560 px; split collapses below 860 px | At each width the page does not scroll sideways |
| MDW-R87 | Accessibility: no serious or critical axe violations | axe scans pass |
| MDW-R88 | The catalog link, the exact alias and the generic route open the same workspace | Each route shows the Markdown Workbench |
| MDW-R89 | Page copy reads as product guidance | The guidance text has no implementation notes |
| MDW-R90 | Toolbar groups workspace, document, editor and export controls | Each group is a labelled region |
| MDW-R91 | HTML and EPUB exports share one export-asset contract (`path`, `mediaType`, `data`) (formerly F10) | `markdown-types.ts` declares no second `ExportAsset`; images bundle into both formats |
| MDW-R92 | Lazy Mermaid chunks are cached for offline use | After a visit, Mermaid renders offline |

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Technique decisions

- 2026-10-07: An optional component import failure within the loaded/current Markdown workspace reports through its local catch without automatic shell reload, preserving open text. Initial tool loading and navigation outside the workspace retain shell recovery. Citation pending/failure states block rendered exports and leave original Markdown available; another valid style/library input can recover.

- 2026-10-07: R51 generates a separate native document section from sanitized CSL fragments. Generated nodes have no authored source positions; original Markdown export/drafts remain unchanged. Rendered Markdown export may serialize its final literal block with complete delimiters or omit a final inert raw HTML block so References cannot become part of that block. Existing authored References headings remain; the generated list is separate. Preserve text, emphasis and safe links across export formats; recognized emoji shortcodes in reference metadata are inline literals. CSL small-cap/font/hanging-indent typography is not a claim of exact publication layout. Rendered exports wait for current citation formatting, with a visible status; original Markdown stays available. Owner may override these conservative presentation defaults.

- 2026-10-06: Typewriter mode is an independent editor option, default off, remembered locally. It centers the caret inside the source editor while typing, with padding for first/last lines and resizing; it does not alter document text or require Focus writing. Owner may override.

## Intent not recorded

- MDW-R55 conservative defaults (2026-10-07; owner may override): count authored native text in paragraphs, headings, table cells, definition terms/descriptions and explicit disclosure captions; captions generated from empty/removed markup are excluded even when the original syntax is nonempty. Omit metadata, code/diagrams, math, inert HTML, image destinations/alt text, URL-only links and definition syntax. Keep inline emphasis adjacent; separate excluded literals and block boundaries. Count Unicode letter/number words, with internal straight/right-curly apostrophes and U+002D/U+2010/U+2011 hyphens as one word (counting-only normalization; en/em dashes separate words); count Unicode letters/numbers as Characters and letters separately for Coleman. Sentences use terminal .!? runs with closing quotes/brackets and nonempty trailing prose, one sentence minimum per nonempty prose block; decimal dots are not sentence boundaries. Grades are English estimates, not language detection: unavailable for zero words or words containing non-ASCII letters or numerals, or tokens exceeding 128 characters (bounded estimator work); ordinary Latin foreign-language prose cannot be detected automatically. Apostrophe variants normalize for syllable estimation. Finite negative and high grades remain unclamped, displayed to one decimal. Existing 225/140 WPM and Fog formula/proper-noun heuristic remain; corrected prose/syllable inputs affect estimates. syllable 5.0.1 is a pinned browser heuristic corroborated on selected CMU pronunciation fixtures, not a pronunciation dictionary or comprehension assessment.

- MDW-R81 conservative defaults (2026-10-08; owner may override): Export TXT writes the words of the prepared document (formulas evaluated, citations formatted, References included) without Markdown marks. Blocks are separated by one blank line. Unordered list items start with "•", ordered items keep their number and a full stop, task items start with "[ ]" or "[x]", nested items are indented. Blockquotes and definition descriptions are indented four spaces; a GitHub alert becomes its title (for example "Warning") above its text. A link keeps its address in brackets after its text unless the text already is the address; an image becomes its alternative text; a table row is one line with tab-separated cells with no rule row. Code, math and diagram source are written exactly as authored, without fences. Metadata, inert HTML, link definitions and thematic breaks produce no text. Footnote references become [1], [2] in order of first appearance and the notes follow the document. The file is UTF-8 with LF line endings and one final newline.

- Reading view themes (MDW-R85): relation to Focus writing and Dark workspace is not settled. Owner may override.

## Change log

- **2026-10-05:** Created as-built at `947272db`; 92 requirements.


### Script content default (2026-10-07)
The R33 delimiters and whitespace rules follow the documented Pandoc-style notation. Span contents are literal text with character escapes/references; ordinary Markdown can wrap a span. This conservative content rule is not full Pandoc compatibility. Owner may override. No raw HTML processing is enabled. A direct dev pin `micromark-util-types@2.0.2` reuses the existing locked package to type the native parser extension.

### Abbreviation defaults (2026-10-07)
One-line definitions follow the primary Markdown Extra notation, with case-sensitive labels and empty expansions allowed. Multiline titles are not part of this initial grammar. First definition wins; matching prefers the longest full label and Unicode punctuation/spacing boundaries. Code, math, raw HTML, image alt text and literal script contents are excluded. Used nonempty expansions appear in a native collapsible glossary so readers can access them without hover. These conservative choices are not a claim of full Markdown Extra compatibility; owner may override.

- 2026-10-07 01:45 UTC: R35 production acceptance passed 6/6 (43.9s): orientation/bounds, actual HTML/EPUB/DOCX/AST exports and nested local HTML import. Additional unit formatter regression remains failing, so R35 stays partial. Frozen R34 full Markdown regression ended 199 passed/1 failed (16.9m); desktop preview-scroll setup timed out locating the source editor. No full-pass claim; inspect and reproduce that failure. Next: formatter block preservation and focused scroll reproduction.

R35 formatting uses micromark parse/preprocess/postprocess to preserve definition lists and enclosing quote/list containers exactly. Safe opaque-block restoration must preserve caret offsets and reject ambiguous changes before editing the source. Direct exact pins micromark@4.0.2, micromark-extension-gfm@3.0.0, micromark-extension-math@3.1.0 and patched micromark-extension-definition-list@2.0.2 reuse locked versions; no dependency upgrade is intended. This worker integration passed scoped unit, production and corrected isolated development acceptance as of 2026-10-07 02:00 UTC. Canonical integration/full browser validation remains pending.

The R35 worker requires the official non-DOM default implementation of decode-named-character-reference@1.3.0; its browser entry evaluates document during module loading. An exact Vite alias resolves the package’s public default entry through createRequire; the exact existing version is a dev pin for configuration resolution. This applies consistently in development/production and requires full cross-tool checks. Native worker acceptance passed on desktop/touch; full cross-tool integration remains pending.

- 2026-10-07 02:00 UTC: R35 scoped acceptance verified; current cursor R36. R35/R19 production 12/12 and corrected isolated dev worker 2/2 passed, with TypeScript/build/frozen install and unit evidence in the current tracker/task/evidence record. Canonical full browsers/integration remain pending.

- 2026-10-07 02:02 UTC: final R35 runtime/tests published through GitHub MCP as 906c087ab87d60e6f5dedc4721fac18d4d6b0a3c; fetched tree equals the local validated source. Frozen 208-case Markdown regression is running on that source/test content and immutable decoder-corrected artifact. Optional local evidence: markdown-regression-r35.log/json; runner session 48534, preview 47229 (4197), dev 28546 (4199). These sessions/paths are not required for reproduction: use committed tests and pinned pnpm commands. GitHub MCP observed integration 37559967437 pending on 906c087ab87d60e6f5dedc4721fac18d4d6b0a3c at 02:01 UTC; record-only publication may supersede it, so refresh latest branch runs. Main was independently verified as 1e85224354e3513485ccf583c38d4fb1b93c3a01 at 02:01 UTC. No R33–R35 deployment/full-suite success is claimed. Current cursor R36; tool remains incomplete at 76/92 verified, 1 implemented, 2 partial, 13 missing.

- 2026-10-07 03:17 UTC: GitHub MCP verified main f644133f28f1ff306283bd71dd61fd693561e1c2, integration 37560176754 success and Pages 37564223040 success. Downloaded official workflow logs show 3821 unit passes/14 skips; full browser suite 1676 passes/1 flaky/171 skips in 48.0m, with the flaky Crystal Lattice desktop site-coordinate case passing on retry. Zero open PRs. Separate local R35 208-case regression has progress only, not a completion result; no local full-pass claim. R31 associated task can close against this canonical full validation. Current R36 work starts from integrated main; no PR workflow is used. Current primary disclosure and unified references refreshed HTTP 200 at 03:13:38–41 UTC.

### Disclosure defaults (2026-10-07)

Native named groups follow HTML conformance: first initially open sibling wins; a descendant with its ancestor’s group name becomes independent so its content remains reachable. Structural EPUB expands every disclosure and removes exclusive names; standalone HTML preserves native grouping. Local HTML import retains summary labels as escaped literal text and body Markdown, including empty blocks with the default Details label. Owner may override these conservative content-preserving defaults.
R36 recognizes owned details/summary wrappers only, following the official GitHub examples. Allowed details attributes are open (boolean presence) and name (native grouping); arbitrary attributes and source HTML remain inert. Summary labels support inline Markdown; absent/empty labels become Details. Unclosed, unmatched or rejected owned wrappers render as literal code rather than hiding subsequent content. Nested source is parsed as Markdown, with source positions retained; wrappers inside code/math remain literal. Preview expansion is transient, retained for unique unchanged captions while editing the same document, and reset on document changes or source-default changes. EPUB structural output expands sections and normalizes boolean attributes to valid XHTML; DOCX includes label and body. Owner may override these conservative defaults.

### Task progress defaults (2026-10-07)

Count native mdast list items with boolean checked values across the already parsed current document, including closed disclosures and nested/footnote tasks. Do not infer tasks from text or checkbox-looking code/metadata/malformed disclosure fallback. Empty documents show Tasks: none and omit the progress element; nonempty task sets show completed/total text and a labeled native determinate progress element. Counts follow current source through real preview edits and document history/import/reset. Keep task announcements scoped to progress changes and preserve ordinary operation/save status announcements; prose metrics are readable without announcing each keystroke. The display is workspace UI, never inserted into source or exports. Owner may override these conservative defaults.

HTML task import retains the checked state of a leading checkbox input directly in a list item or its leading paragraph as a Markdown task marker. Nested items remain independent. Non-leading and standalone form controls are not inferred as document tasks. Labels remain escaped by the existing converter and executable content stays removed. R38 actual import/export acceptance covers this associated repair.

- 2026-10-07 04:57 UTC: R38 scoped acceptance/main/Pages verified at main 58be2be; native counter, leading HTML task import, mixed keyboard/document history and narrow/oriented status layout pass. Official integration: 3852 unit passes/14 skips, 228 owned browsers passed. Latest full-site 37572856847 remains pending; associated tasks stay active. Cursor advances to R51; its native-code boundary failures are recorded before implementation.

- 2026-10-07 13:54:07 UTC: R51 shared recovery opt-in guard is necessary because the earlier shell listener reloads before a later workspace capture listener can preserve source. Current-route mounted workspace guard unregisters on cleanup; absent/false/throwing guards retain ordinary recovery. 370 units, TypeScript/build and two actual asset-failure/recovery browser cases passed. Final 28-case production acceptance and fresh full/main/Pages receipts remain pending.

- 2026-10-07 13:56 UTC: R51 final runtime passed all 28 R36/R38/R51 production cases (3.7m), 370 units, TypeScript/build. R51 implemented; cursor stays R51 until exact full integration/main/Pages receipts, then R55. Shared recovery guard requires full browsers; no duplicate dispatch is needed when integration selects the full suite.

- 2026-10-07 13:58:06 UTC: Final R51 runtime/tests and current records published through GitHub MCP as 46a147c11158796de59174a7d1a6236570cc544c; fetched tree equals locally tested 5d7d036. Full integration request 37632747834 is pending on that source. A record-only checkpoint will supersede this initial request before lengthy validation; inspect the latest fix/markdown-workbench integration run and its exact head SHA. Main remains 500adae; no R51 main/Pages/full success claim. All 28 focused production cases/370 units, TypeScript/build pass. Integration selects __FULL_SUITE__ for the shared recovery edit; no PR or separate duplicate full dispatch.

- 2026-10-07 14:15:46 UTC: R51 associated metadata repair must recognize LF/CRLF/CR and quote-aware JSON delimiters, canonicalize parser payload only, and preserve the body as an original source slice. Regression baseline 8 failed/49 passed; no repair pass claim.

- 2026-10-07 14:25:51 UTC: Final metadata-repaired R51 scoped acceptance passed 34/34 production cases (4.2m), 391 units, TypeScript/build. Current R51 implemented; associated tasks active for fresh required full integration/main/Pages; R55 follows. Publish real repair before inspecting its new full receipt; prior 37632859293 validates earlier runtime only.

- 2026-10-07 14:52:19 UTC: Associated MDW-R39 display repair must keep valid cyclic YAML metadata from blanking the app, mark cycle edges only in read-only display, preserve repeated non-circular aliases and raw source, and display non-finite numeric values truthfully. Task 42ab records unchanged/current baseline and primary MDN evidence before implementation.

- 2026-10-07 15:20:46 UTC: References runtime a924c377/checkpoint a3885a9 is integrated at main 230f637d3c60a31a45559aaa05bc41c1c05de582 (exact tree equality). Full integration 37637141396 succeeded at 15:19:16 UTC: 3896 unit passes/14 skips and 1711 browser passes/171 skips (46.5m), zero browser retries/flaky cases. Pages build/deploy jobs 112856996133/112857318705 succeeded in run 37640254171; deploy completed 14:52:34 UTC. Live deployed actual References export acceptance passed 2/2 desktop/touch (27.7s). Separate duplicate main/PR validate jobs may still be running; they are not needed to invent or replace this exact full receipt. R51 verified, associated scoped tasks done; cursor R55 after independent owned metadata-display repair release. Tool incomplete.

- 2026-10-07 15:44:07 UTC: Metadata repair main d424ad3 is tree-identical to 6b1f5f1/runtime d1edf246. Official integration 37643618750: 3908 unit passes/14 skips and 246 owned browser passes (7.3m), zero retries/skips. Pages 37645772950 succeeded; live acceptance 4/4 (29.3s). Fresh full 37643618281 still running on exact checkpoint; no full-pass claim and task 42ab remains active. Duplicate prior-source R51 main full 37640254171: 1710 browser passes/1 Crystal retry/171 skips (43.5m), 3896 units/14 skips. New backlog c492 records the unattributed Crystal failure; no source/timeout changes.

- 2026-10-07 16:10:49 UTC: Fresh full validation 37643618281 on exact checkpoint 6b1f5f1e2f3a78ac623115da73b890365828e1e4 succeeded: 3908 unit passes/14 skips and 1715 browser passes/171 skips (43.8m), zero browser retry markers/flaky summaries. Official browser summary completed 16:09:49 UTC. Runtime is d1edf246, integrated at main d424ad3 and retained unchanged in record-only main aba873bd2ea5f51f80e6b15734322dcd81de1a10; Pages 37645772950/37647083329 succeeded. Owned integration 37643618750 passed 246 browsers without retries/skips; live metadata/lifecycle/viewport acceptance 4/4 passed. Associated metadata display task 42ab done; frozen cursor R55, no readability implementation. Tool-check 79/92 incomplete; current full is fresh evidence, not an R15/Crystal cause or fix attribution.

- 2026-10-07 16:37:09 UTC: R55 locally implemented, 436 units and 4 production browser acceptance cases passed with TypeScript/build. Native prose exclusions repair associated R54 count/syllable defects; required full integration/main/deployment/live acceptance pending.

- 2026-10-07 16:38:53 UTC: R55 runtime/test checkpoint d9a94abb1f8f9a32e9138ded2181b349d138d847 published through GitHub MCP and fetched tree matches local validated 301cc68. Initial full integration 37653657545 is pending; this immediate record checkpoint supersedes that initial request before lengthy validation. Let the latest integration finish without further record-only pushes; inspect its exact head and official full-suite receipts, then main/Pages/live acceptance. Shared package/lock/public notices correctly select __FULL_SUITE__. Local 436 units and 4 production browsers, TypeScript/build passed. Main still 2410e7a (R55 specification only), no runtime deployment/full-pass claim. Frozen cursor R55; R15/compound citation/Crystal concerns remain open.

- 2026-10-07 16:42:04 UTC: Final R55 candidate retains runtime d9a94abb unchanged and strengthens the existing R54 test to exact independent prose/source counts. Combined R55/R54/R53 production acceptance passed 8/8 (41.3s), desktop/touch, no retries/skips; 436 Markdown/recovery units and TypeScript/build passed on this runtime. Publish this corrected legacy test/current records through GitHub MCP; let its final full-suite integration finish without further record-only pushes. Earlier requests 37653657545/37653763696 do not validate this corrected test. Inspect latest exact source/run, retrieve official full receipts, then main/Pages/live acceptance before completing R55/advancing R56. Cursor R55, tool incomplete 79/92; R15/citation/Crystal concerns stay open.

- 2026-10-07 16:47:28 UTC: Final R55 runtime/test source 13a456e1f72429031eaed9dc7c10e3d45e210ad2 is published through GitHub MCP and fetched tree equals locally tested 5743f8c; its corrected R54 assertion is included. Full integration 37654245633 is active on that exact source. This immediate publication-record checkpoint contains documentation only and replaces that initial request; inspect the latest integration head for the final full receipt and allow it to finish without further record-only pushes. Runtime is d9a94abb; all candidate runtime/tests remain exact 13a456e. Local 436 units, TypeScript/build and combined 8/8 production browser checks (41.3s), zero retries/skips, passed. Main still 2410e7a (specification only). No R55 main/Pages/full-success claim. After full success: compare main tree, verify Pages and live acceptance, then close R55/advance R56. Cursor R55; tool incomplete 79/92; R15/citation/Crystal concerns remain open.

- 2026-10-07 17:01:21 UTC: Final R55 hyphen/generated-caption repairs passed all 443 Markdown/recovery units (15.49s), TypeScript/clean build and 12/12 combined production browsers (59.8s), desktop/touch, no retries/skips. Counter normalizes U+002D/U+2010/U+2011 compounds without editing source; generated Details from empty/removed markup is excluded while authored Details counts. Independent exact legacy R54 assertions are retained. Current repaired source is ready for GitHub MCP publication; older 13a456e/7c4a94a receipts do not validate these repairs. Publish candidate then one immediate source-record checkpoint and allow final full integration to finish without further record-only pushes. Verify exact official full receipt/main tree/Pages/live acceptance before R55 completion or R56 advancement. Cursor R55, 79/92 incomplete; R15/citation/Crystal concerns remain open.

- 2026-10-07 17:02:50 UTC: Final R55 runtime/test checkpoint 64e17739586fac7c92a38ea94ef436fc11312d2b is published through GitHub MCP and fetched tree equals locally validated 406af5f. It includes both grades, native boundary/count/syllable fixes, exact legacy R54 assertions, Unicode hyphen equivalence and actual generated-caption decisions. Local 443 units (15.49s), TypeScript/clean production build and 12/12 combined browsers (59.8s), zero retries/skips, passed. Fresh full integration 37655869959 is pending on exact source. This immediate documentation-only checkpoint supersedes that initial request; obtain the latest integration head/official full receipt without further record-only pushes. Runtime/tests must remain identical to 64e1773. Earlier R55 full requests apply to older source and cannot establish final repair acceptance. Main still 2410e7a; no final R55 main/Pages/full-success claim. After full success compare main tree, verify Pages and live cases, then finish R55/advance R56. Frozen cursor R55; tool incomplete 79/92. R15/citation/Crystal concerns remain open.

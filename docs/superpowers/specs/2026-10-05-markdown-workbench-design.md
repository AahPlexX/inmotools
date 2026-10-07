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

As built at `947272db` (last code change under `src/tools/markdown/`). Requirement prefix: `MDW`. Status of each requirement: [TRACKER.md](../../../src/tools/markdown/TRACKER.md).

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
| MDW-R33 | Subscript and superscript (H~2~O, x^2^) | H~2~O renders H<sub>2</sub>O |
| MDW-R34 | Abbreviations (`*[HTML]: HyperText Markup Language`) | HTML renders as <abbr> with the title |
| MDW-R35 | Definition lists | Term followed by `: definition` renders <dl> |
| MDW-R36 | Details/summary disclosure blocks | A details block renders a collapsible section |
| MDW-R37 | Clicking a task checkbox in the preview toggles that line in the source | Click an open task; the source line reads - [x] |
| MDW-R38 | Task progress (done of total) for the document | Two of three tasks checked shows 2/3 |
| MDW-R39 | Frontmatter in YAML, TOML or JSON is parsed, shown in a panel, and its title names the document | YAML title: Notes names exports notes.* |
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
| MDW-R51 | A bibliography section listing every cited entry is appended | A cited key appears in a generated References list |

### Navigation and metrics

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| MDW-R52 | Outline panel from headings with click-to-jump, filtering and the current section marked | Filter "Intro"; clicking it moves the editor to that line |
| MDW-R53 | Words, lines and reading time in the status bar | Typing updates the live counts |
| MDW-R54 | Metrics panel: words, characters, source characters, lines, sentences, reading and speaking time, Gunning Fog index | A two-sentence passage reports 2 sentences |
| MDW-R55 | Flesch-Kincaid grade and Coleman-Liau index | A known passage gives its published scores |
| MDW-R56 | Syntax-tree (AST) inspector panel showing the parsed tree next to the source | Selecting a node highlights its source range |
| MDW-R57 | Diff view between the current text and a saved draft or the opened file | Edit a line; the diff shows it as changed |

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

- 2026-10-06: Typewriter mode is an independent editor option, default off, remembered locally. It centers the caret inside the source editor while typing, with padding for first/last lines and resizing; it does not alter document text or require Focus writing. Owner may override.

## Intent not recorded

- Reading view themes (MDW-R85): relation to Focus writing and Dark workspace is not settled. Owner may override.

## Change log

- **2026-10-05:** Created as-built at `947272db`; 92 requirements.

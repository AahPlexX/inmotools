---
tool: web-layout-studio
folder: src/tools/web-layout
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-web-layout-studio-design.md
tracker: src/tools/web-layout/TRACKER.md
updated: 2026-10-05
---

# Web Layout Studio — spec

As built at `origin/main` `e83420d6`. Requirement prefix: `WLS`. Status of each requirement: [TRACKER.md](../../../src/tools/web-layout/TRACKER.md). History: the 60-feature ledger and build record [2026-09-12-web-layout-studio.md](../plans/2026-09-12-web-layout-studio.md) (ledger IDs WL-01 to WL-60 appear as "formerly WL-nn").

## Purpose

Arrange a web page visually with CSS Grid or Flexbox, compare it at several viewport widths, author design tokens and appearance, write HTML, CSS and JavaScript in an isolated workbench, and take the result as standalone HTML, CSS, token files, a code ZIP or a project backup, for learners, designers and front-end developers, without uploading anything.

## Scope

In scope:
- Visual page builder: grid and flex layout, named areas, custom tracks, nested semantic blocks, starters, component patterns and per-block spacing.
- Theme and appearance: themes, color expressions, gradients, shadows, backdrop filters and motion, with reduced-motion and print rules.
- Design tokens (DTCG types, aliases, JSON Pointers) with CSS, Sass and JSON exports.
- Multi-viewport sandboxed previews.
- Code workbench: HTML, CSS and JS editing, formatting, CSS compilation, JS minification, isolated script runs, accessibility scan and code ZIP.
- Metadata, exports, project backups, snapshots, undo and redo, and local autosave.
- Diagnostics, asset, component and library features listed as `missing` requirements.

Out of scope:
- Nothing is excluded beyond the platform rules.

## Constraints

- Platform rules: no accounts or authentication; no server or server-side database (static files on GitHub Pages); everything runs in the browser and data stays in this browser; network use only for the site's own files ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- No large language models; other ML only on the device under the ML ruleset.
- Libraries as pinned in `package.json`: `monaco-editor`, `prettier`, `lightningcss-wasm`, `terser`, `axe-core` and `web-layout-zip` (alias of `jszip` 3.10.2).
- Previews are same-engine iframes with CSS viewport widths, not emulated devices; iframes use `sandbox=""` with a restrictive content security policy, and the code run frame uses `sandbox="allow-scripts"` without `allow-same-origin`.
- DTCG 2025.10 is a Community Group specification, not a W3C Recommendation; axe-core findings do not certify accessibility.
- Project backups are JSON version 1, at most 1,000,000 bytes, at most 100 blocks and 150,000 characters per code language.
- The slug, route, storage keys (`inmotools:web-layout:project:v1`, `inmotools:web-layout:library:v1`), file names (`web-layout.html.html`, `web-layout.css.css`, `web-layout.tokens.json`, `web-layout.project.json`, `web-layout.tokens.scss`, `web-layout.snapshot.json`, `web-layout.zip`) and accessible names are not changed.

## Requirements

### Page layout

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| WLS-R01 | Layout offers CSS Grid with Desktop columns (1–12, a maximum: cards wrap sooner so text stays readable) using auto-fit tracks (formerly WL-01) | Set Desktop columns to 4; the exported CSS divides the width by 4 and the 375 px preview shows single readable cards |
| WLS-R02 | Named grid areas: Apply areas accepts up to 12 rows of area names and dots that form rectangles, maps areas to blocks in first-appearance order, reflows below the container width, and keeps an unapplied draft across edits and panel switches (formerly WL-01) | Apply "a a b" over "a a c"; the 1440 px preview has grid-template-areas "a a b" "a a c". Apply "a a b" over "a b b"; an alert says the area must form a rectangle and the layout is unchanged |
| WLS-R03 | Changing Desktop columns clears the named-area map; empty text restores automatic flow (formerly WL-01) | Apply areas, change columns to 4; the area map is empty |
| WLS-R04 | Custom grid tracks accept fr, px, rem, %, auto, min-content, max-content, minmax() and repeat() (count 1–12, auto-fit, auto-fill) up to 500 characters, and refuse anything else (formerly WL-01) | Apply "1fr 2fr 1fr"; the export has grid-template-columns:1fr 2fr 1fr. "1fr; color:red" and "repeat(999, 1fr)" are refused |
| WLS-R05 | Accessible track resizing: tracks can be resized visually with pointer and keyboard controls (formerly WL-01) | Focus a track handle, press arrow keys; the track size changes |
| WLS-R06 | Layout offers Flexbox with Direction (row, column), Alignment and Distribution (formerly WL-02) | Choose Flexbox, Direction Column; the preview stacks cards and the CSS has display:flex and flex-direction:column |
| WLS-R07 | Flexbox wrapping (Wrap onto new lines, Keep one line, Wrap in reverse) sets flex-wrap (formerly WL-02) | Choose Keep one line; the CSS has flex-wrap:nowrap |
| WLS-R08 | Gap, Page padding, Content maximum and Stack below are numeric fields with ranges, accept fractional values, show an error for bad input and restore the committed value on Escape | Type 24.5 in Gap and press Tab; the field keeps 24.5. Clear it; an alert names the valid range |
| WLS-R09 | Stack below (px) sets the width under which the columns stack, 320–1200 | Set Stack below to 710; the CSS contains @media(max-width:710px) |
| WLS-R10 | Breakpoint cascade: mobile-first overrides per breakpoint with visible inheritance and reset-to-inherited values (formerly WL-08) | Override Gap at 768 px; the editor shows the inherited value and offers Reset |
| WLS-R11 | Container-query lab: resize a component parent independently and author named size queries (formerly WL-09) | Author a named container query and resize its parent; the component responds |
| WLS-R12 | Page heading (up to 200 characters) and Introduction (up to 2000) set the page title, heading and introduction | Set the heading to "A school project"; the preview and `<title>` show it |
| WLS-R13 | Reading order follows the block list, including on narrow screens | Reorder blocks; the exported HTML and the 375 px preview follow the list |

### Blocks and components

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| WLS-R14 | Add a pattern (card, accordion, form, navigation, notice) with Add block appends a block with placeholder text (formerly WL-05) | Choose navigation, press Add block; a block "New navigation" appears |
| WLS-R15 | A project with more than 100 blocks, a duplicate id, a reserved id or malformed structure is refused; Add block is disabled at 100 | Import 101 blocks; the import fails naming the 100-block limit |
| WLS-R16 | Each block exposes Title, Text and Tag; edits are grouped into one undo step per field (formerly WL-05) | Edit a block title; the preview heading changes and one Undo restores it |
| WLS-R17 | Move up and Move down reorder a block among its siblings without changing other blocks; dragging a block summary onto another places it before it (formerly WL-03, WL-05, WL-58) | Press Move down on the first block; it is second in the list and in the preview |
| WLS-R18 | Duplicate copies a block with all its descendants and fresh ids (formerly WL-05) | Duplicate a block with one child; five blocks exist and two sit at depth 2 |
| WLS-R19 | Remove deletes a block and keeps its children, moved to the parent level, with Undo restoring the nesting (formerly WL-05) | Remove a parent block; its child stays in the page; Undo re-nests it |
| WLS-R20 | Parent selection nests a block inside a card or notice, up to five levels, refuses cycles, and has a keyboard-reachable select beside drag (formerly WL-03, WL-58) | Set the parent of "How does this work?" to the first card; the preview nests it |
| WLS-R21 | Starters Learning, Portfolio, Landing page and Dashboard replace the page with three cards each and Undo restores the previous page (formerly WL-04) | Press Portfolio starter; the heading reads "Work with purpose" |
| WLS-R22 | Component patterns render as a card article, a native details accordion, a form with a visibly labelled email field, a navigation linking to every block and a notice aside (formerly WL-20) | Export a page with all five patterns; the HTML has article, details/summary, nav, aside and label for="join-email" |
| WLS-R23 | Dialog and further accessible scaffolds with keyboard behaviour (formerly WL-20) | Add a dialog pattern; Escape closes it and focus returns to its trigger |
| WLS-R24 | Form-control styling: checkbox, radio, switch, range and local drop-zone patterns with labels (formerly WL-19) | Add a switch pattern; it is a labelled native control |
| WLS-R25 | Per-block Spacing, border and Flexbox sizing: padding and margin per side, border width, radius, grow, shrink and basis, with rem readouts at 16 px, Apply block style and Use shared style (formerly WL-06) | Set paddingTop 40 and Apply block style; the block CSS has 40px top padding |
| WLS-R26 | Box model workshop also covers outlines and logical properties (formerly WL-06) | Set an outline and inline-start margin; the CSS uses outline and margin-inline-start |
| WLS-R27 | Local asset library for images, SVG and fonts with size limits, previews, dependency tracking and removal checks (formerly WL-24) | Add a PNG; it is listed with a preview and cannot be removed while a block uses it |
| WLS-R28 | Inline SVG workshop: safe markup optimization, fill and stroke, viewBox inspection and data-URI export (formerly WL-23) | Paste an SVG; the viewBox is shown and a data URI can be copied |
| WLS-R29 | Web Component sandbox: custom elements and Shadow DOM with portable component export in an isolated preview (formerly WL-21) | Define a custom element; it renders in the sandbox and exports |
| WLS-R30 | Interaction-state lab: hover, focus, active, disabled, checked and target approximations with keyboard-state checks (formerly WL-22) | Force :hover on a card; its hover style shows |
| WLS-R31 | Reusable user library: save component variants and page templates locally and export or import the library (formerly WL-52) | Save a component variant, export the library, import it in another session |

### Theme, typography and appearance

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| WLS-R32 | Theme selects Light, Dark or High contrast for the page and Accent color sets the accent; the export carries the matching color-scheme (formerly WL-12) | Select Dark; the exported HTML has color-scheme:dark |
| WLS-R33 | Accent color, numeric settings and option values that could inject CSS or fall outside their range are refused (accent with url(), columns 2.5, heading minimum above maximum) | Import a project with accent "red; background:url(https://example.com)"; the import fails |
| WLS-R34 | Heading minimum and maximum (px) size headings fluidly between 320 and 1440 px wide (formerly WL-07) | Set 28 and 56; the exported heading size is a clamp between them |
| WLS-R35 | Fluid typography also offers editable clamp ranges with viewport curves, modular scales and readable line-length controls (formerly WL-07) | Pick a 1.25 modular scale; heading sizes follow it |
| WLS-R36 | Include responsive CSS reset writes a reset, focus and base styles to the export (formerly WL-42) | Uncheck the box; the exported CSS no longer contains the reset |
| WLS-R37 | Exports and previews stop animation and transitions under prefers-reduced-motion (formerly WL-18, WL-42) | Emulate reduced motion; the animated block has animation-name none |
| WLS-R38 | Exports use a black-on-white print palette with blocks kept together under print media (formerly WL-42, WL-53) | Emulate print; the preview body is black text on no background image |
| WLS-R39 | Theme color expressions per theme (light, dark, contrast) for accent, ink, canvas and surface accept CSS color expressions such as hex, rgb(), oklch() and color-mix() and refuse injection (formerly WL-12, WL-14) | Set light ink to #334455 and Apply appearance; the preview body text is rgb(51, 68, 85) |
| WLS-R40 | Color authoring reports gamut and fallback diagnostics for Display-P3 and relative colors (formerly WL-14) | Enter color(display-p3 1 0 0); a note states the sRGB fallback used |
| WLS-R41 | Layered gradients: up to six layers of linear, radial or conic gradients with up to twelve editable stops, sorted by position, with Add gradient layer, Remove gradient and stop removal (formerly WL-15) | Add a conic layer; the preview body has a background-image and the CSS has conic-gradient(from 45deg,#000 0%,#fff 100%) |
| WLS-R42 | Gradient interpolation controls (color space and hue method) (formerly WL-15) | Choose oklch interpolation; the CSS has "in oklch" |
| WLS-R43 | Box shadow layers with offsets, blur, spread, color and inset are editable and exported (formerly WL-16) | Add a shadow 0 8 24 2 #123456; the CSS has box-shadow:0px 8px 24px 2px #123456 |
| WLS-R44 | Text shadow layers with offsets, blur and color are editable and exported (formerly WL-16) | Add a text shadow; the CSS has text-shadow |
| WLS-R45 | Backdrop filters: blur, saturation and brightness are applied to blocks (formerly WL-17) | Set blur 8; the CSS has backdrop-filter with blur(8px) |
| WLS-R46 | Backdrop workshop also covers transparent border styling and a fallback preview (formerly WL-17) | Enable the fallback comparison; a non-blurred preview is shown next to the blur |
| WLS-R47 | Motion timeline: Animate top-level blocks with duration, delay, iterations, a cubic-bezier timing curve (control x values 0–1) and motion stops (opacity, x, y, scale, rotate) with Add motion stop and removal (formerly WL-18) | Check Animate top-level blocks and Apply appearance; the export contains @keyframes wl-enter |
| WLS-R48 | Transitions with editable properties and timing are authored and exported (formerly WL-18) | Add a hover transition; the CSS has a transition declaration |
| WLS-R49 | Appearance edits stay as a draft across panel switches; Apply appearance commits them to previews and exports, Discard appearance draft drops them (formerly WL-12) | Edit light ink, switch to Build and back; the draft remains; Apply appearance changes the preview |
| WLS-R50 | Invalid appearance values (NaN blur, timing x outside 0–1, duplicate motion stops, CSS injection in a color) are refused | Validate blur NaN; validation throws |

### Design tokens

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| WLS-R51 | The Design-token library edits tokens by path with a type from the 13 DTCG types (color, dimension, fontFamily, fontWeight, duration, cubicBezier, number, strokeStyle, border, transition, shadow, gradient, typography), a value mode (Simple value, Reuse another token, Structured JSON value) and a description, saved with Save token to draft (formerly WL-13) | Save spacing.base as 20px; it appears in the list |
| WLS-R52 | Find tokens filters the token list | Type "card" in Find tokens; only matching tokens remain |
| WLS-R53 | Token aliases ({path}) and local JSON Pointers resolve, keep their source reference, and circular references, missing targets and type mismatches are refused (formerly WL-13) | Alias spacing.card to spacing.base; removing spacing.base fails with "Missing token alias" |
| WLS-R54 | Token values are validated per type, including color spaces and ranges, dimension units, composite border, shadow, gradient, transition and typography values, and unknown types are refused (formerly WL-13) | A color in hsl with hue 360 is refused |
| WLS-R55 | Apply token library commits the draft and emits `--token-*` CSS variables into previews and exports; Discard token draft drops the draft (formerly WL-13) | Apply; the preview body has --token-spacing--card: 20px |
| WLS-R56 | Import token JSON loads a DTCG document into the draft, validated before it replaces anything (formerly WL-13) | Import a document with a missing alias; the status names the error |
| WLS-R57 | Export token JSON, Export token CSS and Export token Sass download the token library (formerly WL-48) | Press Export token CSS; a CSS file with the variables downloads |
| WLS-R58 | Export token Sass downloads `web-layout.tokens.scss` with a map keyed by original token paths, numeric aliases, types, CSS declarations and inert interpolation (formerly WL-48) | Export Sass after the alias test; the file has "spacing.card": ( and "value": 20px |
| WLS-R59 | Download Tokens (Export tab) and Download design tokens (Theme tab) save DTCG JSON; without a token library the file carries typed color and dimension values, with a library it carries the original references (formerly WL-48) | Download Tokens after the alias test; spacing.card.$value is "{spacing.base}" |
| WLS-R60 | Tailwind mapping export of tokens (formerly WL-48) | Export Tailwind; a theme mapping file downloads |
| WLS-R61 | Structured token values are edited with visual fields and group extensions are kept (formerly WL-13) | Edit a shadow token with color and number inputs |

### Preview

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| WLS-R62 | Previews show the page at several CSS viewport widths side by side (375, 768 and 1440 by default) in sandboxed iframes, with checkboxes for 320, 375, 768, 1024, 1440 and 1920 px (at most eight, at least one) (formerly WL-10) | Open Preview; three frames titled "Layout at 375 pixels", 768 and 1440 show the page |
| WLS-R63 | Custom viewport width (240–3840 px) is added with Add viewport (formerly WL-10) | Enter 1280 and press Add viewport; a 1280 px frame appears |
| WLS-R64 | Preview orientation switches the frame between portrait and landscape presentation while the CSS width stays exact (formerly WL-10) | Choose landscape; the 375 px frame matches (orientation: landscape) at width 375 |
| WLS-R65 | Actual-size view shows each frame at scale 1 and scrolls inside it; fitted view scales frames to the available width (formerly WL-10) | Check Actual-size view; the 1280 px frame has transform matrix(1, 0, 0, 1, 0, 0) |
| WLS-R66 | Refresh previews while editing can be switched off; the previews keep their interactive state until Refresh previews, while downloads use the current project | Type in the preview email field, edit the heading, the field keeps its value; Refresh previews shows the new heading |
| WLS-R67 | Previews are script-free sandboxed documents with a restrictive content security policy, and the exported HTML does not carry that policy (formerly WL-60) | The preview source has default-src 'none' and form-action 'none'; the download has no Content-Security-Policy |
| WLS-R68 | Synchronized preview interaction: opt-in scroll, click and form-state synchronization across frames without event loops (formerly WL-11) | Scroll one frame; the others follow |
| WLS-R69 | Media-condition preview for reduced motion, light or dark and forced colors as labelled approximations (formerly WL-35) | Choose forced colors; the preview shows the approximation and its limit note |
| WLS-R70 | Direction and writing-mode preview: Text direction (left to right, right to left) and Writing mode (horizontal, vertical right to left, vertical left to right) are exported (formerly WL-57) | Choose Right to left; the export has dir="rtl" |
| WLS-R71 | Direction and writing-mode diagnostics check logical spacing and vertical-writing problems (formerly WL-57) | Choose vertical-rl with a fixed height; a warning lists clipped text |

### Code workstation

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| WLS-R72 | Code tab: Use code instead of visual blocks swaps the page body for the HTML source; HTML, CSS and JS sources (150,000 characters each) are edited in labelled text areas; Apply code records them in project history and switching back keeps the code (formerly WL-25) | Enter an article, check the box, Apply code; the 375 px preview shows the heading |
| WLS-R73 | Enhanced code editor loads Monaco on demand with syntax highlighting and falls back to the standard editor when it cannot load (formerly WL-25) | Check Enhanced code editor; a Monaco editor appears |
| WLS-R74 | Abbreviation expansion for HTML and CSS with completion and reversible insertion (formerly WL-26) | Type ul>li*3 and expand; three list items appear and Undo removes them |
| WLS-R75 | Format draft formats the current language with Prettier, reports parse errors in the status and leaves the result as a draft until Apply code (formerly WL-27) | Format an article; the status reads "Formatted draft. Apply to record it in project history." |
| WLS-R76 | Production compiler compiles CSS with Lightning CSS (WebAssembly) for minimum Chrome, Firefox and Safari versions, minifies it, and offers Download compiled output as `web-layout.min.css` (formerly WL-28) | Compile ".demo { color: red; padding: 10px; }"; the compiled output and its download button appear |
| WLS-R77 | JavaScript is minified with Terser in a cancellable worker; Cancel operation stops it; the source draft is unchanged and the compiled file downloads as `web-layout.min.js` (formerly WL-29) | Compile JS; the minified text appears; Cancel operation during a run reports cancelled |
| WLS-R78 | HTML minification with conservative whitespace defaults (formerly WL-30) | Minify HTML; comments and redundant whitespace are removed and pre content is kept |
| WLS-R79 | Download source saves the current language as `web-layout.html`, `.css` or `.js` | Press Download source on CSS; web-layout.css downloads |
| WLS-R80 | Download code ZIP saves `web-layout.zip` with index.html, css/style.css, js/main.js, project.json, manifest.json and README.txt in sorted order with a fixed 1980-01-01 timestamp (formerly WL-46, WL-54) | Download the ZIP twice; both files are byte-identical and list six entries |
| WLS-R81 | Run / restart preview runs the code draft in an isolated opaque-origin frame (sandbox allow-scripts only) with a nonce content security policy; JavaScript runs only after Allow this draft’s JavaScript to run is checked; Stop preview removes the frame (formerly WL-55, WL-60) | Run without consent; the log has no output. Allow and run; the log shows "Opt-in script ran". Stop; the frame is gone |
| WLS-R82 | Console output, errors and unhandled rejections from the running preview are listed in "Runtime and accessibility results", limited to 100 messages of 4000 characters (formerly WL-55) | Run console.log("Opt-in script ran"); the list contains the line |
| WLS-R83 | Run accessibility scan runs axe-core inside the preview and lists violations with rule help and affected elements plus checks that need review (formerly WL-31) | Scan a page with an unlabeled input; the list names the rule |
| WLS-R84 | A manual accessibility guide beside the results names keyboard order, visible focus, reading order, zoom and screen-reader checks and states that automated scanning does not certify accessibility (formerly WL-56) | Open Run and inspect; the guidance text is shown |

### Diagnostics

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| WLS-R85 | WCAG contrast checks with alpha compositing and AA or AAA text thresholds for foreground and background pairs (formerly WL-32) | Use #777 on #fff; the check reports AA fail for body text |
| WLS-R86 | APCA legibility guidance shown separately from WCAG with size and weight guidance (formerly WL-33) | Use #777 on #fff; an APCA Lc score and a minimum size are shown |
| WLS-R87 | Color-vision simulation lenses for protanopia, deuteranopia, tritanopia and achromatopsia (formerly WL-34) | Choose deuteranopia; the preview is filtered |
| WLS-R88 | Computed-style inspector for selected preview elements with resolved properties and box geometry (formerly WL-36) | Click a card; its computed font-size and box are listed |
| WLS-R89 | Cascade and specificity inspector with selector weights, layers, importance and source order (formerly WL-37) | Select a rule; its specificity is listed |
| WLS-R90 | Unused-selector report lists potentially unmatched selectors with state and viewport caveats and never deletes anything (formerly WL-38) | Add .ghost{}; the report lists .ghost |
| WLS-R91 | HTML conformance diagnostics for duplicate ids, invalid nesting, void elements and attributes (formerly WL-39) | Enter two elements with id="a"; a diagnostic names it |
| WLS-R92 | Overflow and collision checks find clipped or overflowing content and overlapping text across the selected viewports (formerly WL-40) | Add a 2000 px wide image; the 375 px check reports overflow |
| WLS-R93 | Content stress testing with long labels, empty content, enlarged text and localization fixtures without changing the source (formerly WL-41) | Apply the long-label fixture; previews change and the source is unchanged |
| WLS-R94 | Publication checks list a missing page title and blocks without titles in the Export tab | Clear the heading; "The page needs a title before publication." is listed |

### Export and metadata

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| WLS-R95 | Download HTML saves `web-layout.html.html` as a single self-contained page with inline CSS, no script, escaped text, the chosen theme and the metadata (formerly WL-45, WL-47) | Download HTML; the file has <title>A school project</title>, color-scheme:dark and no <script |
| WLS-R96 | Portable single-file export inlines approved local assets, checks external references and works offline (formerly WL-45) | Export a page with an image asset; the file embeds it and lists external URLs |
| WLS-R97 | Download CSS saves the generated stylesheet as `web-layout.css.css`, identical to the CSS in the HTML (formerly WL-47) | Download CSS; it matches the style block of the HTML |
| WLS-R98 | Generated HTML can be inspected in the Export tab before download | Open "Generated HTML"; the source is shown |
| WLS-R99 | Document metadata: Author, Language (en, es, fr, de, pt, ja, ar), Canonical URL (http or https) and Search indexing (allow or no indexing) are written to the HTML (formerly WL-43) | Set language fr, author "A & B", canonical with query; the HTML has lang="fr", escaped author, rel="canonical" and robots noindex |
| WLS-R100 | An invalid Canonical URL blocks HTML download with "Correct the canonical URL before exporting." while the project, CSS and token downloads stay available | Enter "invalid" as canonical; Download Project still downloads web-layout.project.json |
| WLS-R101 | Document title, Document description, Tags / keywords, Social title and Social description override the page values; empty overrides inherit (formerly WL-43, WL-44) | Set Document title "Published portfolio" and Tags "design, portfolio"; the HTML has that title and name="keywords" |
| WLS-R102 | Additional meta fields (JSON array of name and content, up to 30, unique names) are written as meta tags; names reserved for standard fields are refused (formerly WL-43) | Add application-name; it appears escaped. Add viewport; it is refused |
| WLS-R103 | OpenGraph and Twitter card tags carry the social title, description, type and canonical URL (formerly WL-44) | Export; the HTML has og:title, og:description, og:type, og:url, twitter:card, twitter:title and twitter:description |
| WLS-R104 | An illustrative share preview card shows the social title and description (formerly WL-44) | Open the metadata section; a card preview is shown |
| WLS-R105 | Social image and favicon assets are set and written as og:image, twitter:image and icon links (formerly WL-44) | Choose a social image; the HTML has og:image |
| WLS-R106 | Export manifest lists asset references, dependency and licence notices and warnings besides the generated files (formerly WL-54) | Export; the manifest lists each asset with its licence |
| WLS-R107 | Code and component exports: selected snippets and portable component packages (formerly WL-47) | Select a card; export it as a component package |
| WLS-R108 | Print and PDF workflow with a paged preview and a print action that does not claim native PDF generation (formerly WL-53) | Press Print; the browser print dialog opens with the paged layout |
| WLS-R109 | Exports escape hostile text in titles, descriptions and content so markup in them never executes | Set the title to "</title><script>alert(1)</script>"; the export has &lt;script&gt; |

### Projects, history and persistence

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| WLS-R110 | Download Project saves the whole project as versioned JSON (`web-layout.project.json`); Open a project backup validates it (version 1, 1 MB, all fields) before replacing the page and reports "Import failed:" with the reason otherwise; Undo restores the previous page (formerly WL-49) | Open {"version":99}; the status shows "Import failed:" and the page is unchanged |
| WLS-R111 | Project JSON round-trips without loss for layout, options, code, nested blocks, appearance and tokens (formerly WL-49) | Parse the stringified project; it equals the original |
| WLS-R112 | Projects saved before grid areas, options, code or appearance existed open with default values and unchanged flow (formerly WL-49) | Open a project without gridAreas; it opens with an empty area map |
| WLS-R113 | Autosave on this browser is an opt-in checkbox; when on, the project is saved to local storage shortly after each change and when the page is hidden, the status reports "Saved on this browser.", and the project is restored on the next visit (formerly WL-50) | Check Autosave, edit the heading, reload; the heading is restored and the box is checked |
| WLS-R114 | A saved draft that cannot be read is not overwritten and a full or blocked storage reports an error with advice to download a backup (formerly WL-50) | Store invalid JSON under the project key; the status says it was not overwritten |
| WLS-R115 | Assets and larger drafts persist in IndexedDB with recoverable snapshots (formerly WL-50) | Add an asset, reload; the asset is listed |
| WLS-R116 | Save snapshot stores the current page under a unique name (up to 20, names up to 80 characters) in the local library; Open local library lists them; Restore snapshot loads one; Compare with current shows saved and current values for each differing field (formerly WL-59) | Save "Before edits", change the heading, Compare; the output shows Saved: "Work with purpose" and Current: "Changed". Restore returns the heading |
| WLS-R117 | Export snapshot saves `web-layout.snapshot.json` and Remove snapshot deletes a snapshot without touching the current page (formerly WL-59) | Export a snapshot; web-layout.snapshot.json downloads. Remove it; it leaves the list |
| WLS-R118 | Version comparison also shows readable token and source differences (formerly WL-59) | Change a token and the CSS; Compare lists both |
| WLS-R119 | Undo and Redo buttons step through bounded history (50 steps) of edits, imports, snapshot restores and starter loads; consecutive edits of one text field form one step and a new edit after Undo drops the redo branch (formerly WL-51) | Type a sentence, Undo once; the original heading returns; Redo returns the sentence |
| WLS-R120 | Ctrl or Cmd with Z undoes, Shift with it or Y redoes when no text field has focus, and text fields keep their own shortcuts (formerly WL-58) | Focus the Build tab and press Ctrl+Z; the heading reverts |
| WLS-R121 | Keyboard-first editing also restores focus after structural operations and documents shortcuts for tree operations (formerly WL-58) | Press Remove on a block with the keyboard; focus moves to a neighbouring block |

### Site, privacy and non-functional

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| WLS-R122 | The route `#/tools/web-layout-studio` opens the workstation with guidance and the privacy statement | Open the catalog link and the route |
| WLS-R123 | Everything runs in this browser: projects, previews, compilers, snapshots and downloads use no server, upload or fetch; the Monaco, Prettier, Lightning CSS, Terser, axe-core and JSZip dependencies ship with the site | Use every function with the network blocked |
| WLS-R124 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) and passes the colour-contrast check in dark | With each theme stored, the workspace uses it; `E2E_THEME=dark` axe on `#/tools/web-layout-studio` has no `color-contrast` violation |
| WLS-R125 | No horizontal page overflow at any width from 320 to 2560 px on every panel | Overflow ≤ 1 px at 320, 390, 768, 844, 1440, 1920 and 2560 px on Build, Theme, Preview, Code and Export |
| WLS-R126 | No serious or critical axe violations on the workspace (sandboxed preview frames are excluded and must each have a title) | axe on `#/tools/web-layout-studio` reports none and every sandboxed frame has a title |
| WLS-R127 | Panels are tabs (Build, Theme, Preview, Code, Export) with pressed state, and the editing controls reflow in portrait and landscape | Press each tab at 320 × 568 and 844 × 390; no page overflow |
| WLS-R128 | Status changes and save state are announced in live status regions | The status line and "Project saving" region have role status and change after edits, imports and saves |

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Technique decisions

None: no function was compared between an ML and a non-ML method.

## Intent not recorded

None.

## Change log

- 2026-10-05 — Created: 128 requirements as built at `e83420d6`.

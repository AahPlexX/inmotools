---
tool: svg-sprite-compiler
folder: src/tools/svg
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-svg-sprite-compiler-design.md
tracker: src/tools/svg/TRACKER.md
updated: 2026-10-05
---

# SVG Sprite Compiler — spec

As built at `origin/main` `e83420d6`. Requirement prefix: `SVG`. Status of each requirement: [TRACKER.md](../../../src/tools/svg/TRACKER.md). History: [2026-09-11-vector-studio-design.md](2026-09-11-vector-studio-design.md) and plan [2026-09-11-vector-studio.md](../plans/2026-09-11-vector-studio.md).

## Purpose

Compile many SVG files into one deterministic, collision-safe `<symbol>` sprite with per-file size savings, and draw, style, organize and export standards-native vector artwork in Vector Studio, for web performance engineers, frontend developers and designers, without uploading any file.

## Scope

In scope:
- Batch SVG optimization (SVGO), optional currentColor normalization, symbol sprite compilation, light and dark previews, searchable results and sprite download.
- Vector Studio: a scene-graph editor that serializes to SVG, with drawing tools, precision editing, arranging, appearance, artboard navigation, import (project JSON, SVG, images) and export (SVG, optimized SVG, PNG, JPEG, WebP, PDF, project JSON, embed snippets).

Out of scope:
- Nothing is excluded beyond the platform rules.

## Constraints

- Platform rules: no accounts or authentication; no server or server-side database (static files on GitHub Pages); everything runs in the browser and data stays in this browser; network use only for the site's own files ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- No large language models; other ML only on the device under the ML ruleset.
- Libraries as pinned in `package.json`: `svgo` (sprite compiler and optimized export) and `pdf-lib` (PDF export).
- The slug `svg-sprite-compiler`, the route, the element id `svg-files`, the project format id `inmotools-vector` (version 1), the file extension `.inmovector.json`, the download name `inmotools-sprite.svg` and accessible names are not changed.
- Vector Studio's canonical document is a structured scene graph that serializes to SVG; raster and PDF exports are rendered from the same SVG. The PDF holds a raster render of the artboard, not editable vector objects.
- Imported images are embedded as data URLs; no external URL is fetched.

## Requirements

### Sprite compiler: input and compile

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SVG-R01 | Choose SVG files accepts one or many `.svg` files; the status reports how many are ready for local optimization | Choose three files; the status reads "3 SVGs ready for local optimization." |
| SVG-R02 | Compile sprite is enabled once files are chosen and produces one `<symbol>` per valid file inside a hidden `<svg>` sprite, with the status reporting the symbol, failure and warning counts | Choose two valid files and press Compile sprite; the status reads "Compiled 2 symbols locally." |
| SVG-R03 | Each symbol gets a deterministic id from its file name (lower case, runs of other characters become "-") | Compile "Arrow Left.svg"; the symbol id is "arrow-left" |
| SVG-R04 | Colliding ids get a numeric suffix and stay unique across the whole sprite, including names that already end in a suffix | Compile foo.svg, foo-2.svg and foo.svg; the ids are foo, foo-2 and foo-3 |
| SVG-R05 | A file that is not valid SVG is listed under "Files not compiled" with its name and reason while the valid files still compile | Compile good.svg with a text file named broken.svg; broken.svg is listed and good.svg has a symbol |
| SVG-R06 | Each file is optimized with SVGO (multipass, default preset) and the table reports original bytes, optimized bytes and the percentage saved | Compile an SVG with comments; the Optimized column is smaller than Original and Savings is above 0% |
| SVG-R07 | Executable content (script elements and event-handler attributes) is removed from the compiled sprite | Compile an SVG with onload, onclick and a script element; the sprite source contains none of them |
| SVG-R08 | Normalize literal fill/stroke colors to currentColor (checked by default) rewrites literal fill and stroke attributes | Compile `<path fill="red">` with the box checked; the symbol has fill="currentColor" |
| SVG-R09 | Normalization also rewrites literal fill and stroke declarations inside style attributes | Compile `style="fill:#ff0000;stroke:blue"`; both declarations become currentColor |
| SVG-R10 | Normalization leaves paint-server references, CSS variables, none, transparent, inherit and context paint as they are | Compile fill="url(#paint)", fill="none" and fill="var(--c)"; none becomes currentColor |
| SVG-R11 | With normalization off, colours and style declarations are left as authored | Uncheck the box and compile `style="fill:#ff0000"`; the style is unchanged |
| SVG-R12 | Changing the normalization box discards the compiled result and the status asks for a recompile | Compile, then uncheck the box; the sprite source disappears and the status mentions Recompile |
| SVG-R13 | Internal ids (gradients, clip paths, masks) are prefixed with the symbol id and every local url(#…) and href reference is rewritten to match | Compile two files that both define id="paint"; the sprite has two different prefixed ids and each use points to its own |
| SVG-R14 | Paint references on the root svg element are rewritten with the same id mapping as those on descendants | Compile an svg with fill="url(#grad)" on the root; the symbol references the prefixed id |
| SVG-R15 | A clip-path on the root svg element is kept and rewritten to the prefixed id | Compile an svg with clip-path="url(#clip)" on the root; the symbol keeps a clip-path to the prefixed id |
| SVG-R16 | Root presentation attributes (class, style, fill, stroke, opacity, transform and similar) are carried onto the symbol | Compile an svg with fill, stroke, class and style on the root; the symbol has them |
| SVG-R17 | An explicit viewBox is used as written | Compile viewBox="0 0 48 48" width="24" height="24"; the symbol viewBox is 0 0 48 48 |
| SVG-R18 | Without a viewBox, numeric width and height (with or without px) define one | Compile width="24" height="16"; the symbol viewBox is 0 0 24 16; width="32px" gives 0 0 32 32 |
| SVG-R19 | When no viewBox can be derived (for example em or percentage sizes) the symbol is compiled without one and a warning under "Compiled with warnings" names the file | Compile width="2em" height="100%"; the warning list names the file and mentions viewBox |
| SVG-R20 | Selecting a file with the same name again after a recompile loads the new content | Compile same.svg, choose a changed same.svg, compile; the sprite shows the new content only |
| SVG-R21 | Download sprite saves `inmotools-sprite.svg` and is enabled only while a compiled result with symbols exists | Compile, press Download sprite; the file inmotools-sprite.svg contains the sprite source |

### Sprite compiler: review

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SVG-R22 | Every compiled symbol has a light and a dark preview rendered as an image from the symbol | Compile four valid files; eight preview images are shown, two per symbol |
| SVG-R23 | Previews are static images, so markup in a file never runs while previewing | Compile a file with script and handlers; the page counter stays 0 |
| SVG-R24 | Previews appear in batches of 48 with "Show N more previews" and a "Showing X of Y previews" count | Compile 120 files; 48 previews show, then 96, then 120 |
| SVG-R25 | Search compiled symbols filters previews and the table by file name or symbol id and restarts the preview batch | Compile 120 files, search "icon-11"; ten previews remain |
| SVG-R26 | The symbol table (File, Symbol ID, Original, Optimized, Savings) is paged at 100 rows | Compile 120 files; rows 1–100 show, Last shows 20 rows ending at icon-119.svg |
| SVG-R27 | The compiled sprite source is shown in a keyboard-focusable block labelled "Compiled SVG sprite source" | Compile a file; the block is present and contains the symbol |
| SVG-R28 | Copy <use> on each symbol copies `<svg aria-hidden="true"><use href="#id"></use></svg>`, or reports that the clipboard is unavailable | Press Copy <use> on arrow-left; the clipboard holds the snippet for arrow-left |
| SVG-R29 | Status changes of the compiler are announced in a live status region | The status line has role status and changes after choose, compile and setting change |

### Vector Studio: documents and import

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SVG-R30 | Blank starts an empty document with the default artboard and metadata | Press Blank; the layer list is empty and the status reads "Started a blank vector document." |
| SVG-R31 | Logo, App icon and Poster start from a template with its own artboard size, grid and starter objects | Press Poster; the artboard is 1080 × 1350 with two layers |
| SVG-R32 | Open project loads a `.inmovector.json` file as the document and restores its artboard, objects and swatches | Open a fixture project; its layer "Imported rectangle" and 640 width appear |
| SVG-R33 | A file that is not a Vector Studio project version 1 is refused with a message and the document is unchanged | Open {"hello":"world"}; the status says it is not a Vector Studio project |
| SVG-R34 | Import SVG turns rect, ellipse, circle, line, path, text and data-URL image elements of an SVG file into editable objects and uses its viewBox and title/desc for the artboard and metadata | Import an SVG with a rect and a circle; two layers appear and the status reports 2 objects |
| SVG-R35 | Import SVG removes script, foreignObject, iframe, object and embed elements, on* attributes and external hrefs before building objects | Import an SVG with onclick and an external image href; neither reaches the document |
| SVG-R36 | Place image embeds a PNG, JPEG, WebP or GIF file as a data URL image object; nothing is fetched | Place a PNG; an image layer named after the file appears |

### Vector Studio: drawing tools

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SVG-R37 | The tool rail offers Select, Rectangle, Ellipse, Line, Polygon, Star, Pen, Pencil, Text and Pan as toggle buttons with pressed state and title | Press Rectangle tool; it reports pressed |
| SVG-R38 | Select picks an object by click and extends the selection with Shift, Ctrl or Cmd; clicking empty canvas clears it | Click one rectangle, Shift-click another; both are selected |
| SVG-R39 | Rectangle adds a rounded rectangle at the click point | Choose Rectangle and click the canvas; one layer appears |
| SVG-R40 | Ellipse adds an ellipse at the click point | Choose Ellipse and click the canvas; a layer named Ellipse appears |
| SVG-R41 | Line adds a horizontal line at the click point | Choose Line and click the canvas; a layer named Line appears |
| SVG-R42 | Polygon adds a closed regular polygon with the chosen number of sides (3–64) | Set Polygon sides to 8 and click; the path has 8 vertices |
| SVG-R43 | Star adds a closed star with the chosen number of points (2–64) and inner ratio (0.05–0.95) | Set points 7 and ratio 0.35 and click; the path has 14 vertices |
| SVG-R44 | Pen adds a point per click, draws the open path, and finishes with a double-click or Finish pen path | Choose Pen, click three points, press Finish pen path; a Pen path layer appears |
| SVG-R45 | Pencil draws a freehand stroke that is simplified by the Pencil smoothing setting (0.25–12) while keeping its endpoints | Drag with Pencil; a smoothed Pencil path layer appears with fewer points than the stroke |
| SVG-R46 | Text adds a text object; its text, font size, weight and font family are editable in the inspector | Choose Text, click, edit the Text field; the artboard text changes |
| SVG-R47 | Pan drags the artboard viewport by scrolling it and does not select or draw | With Pan chosen, drag on the artboard; the viewport scrolls |
| SVG-R48 | Single-letter shortcuts choose tools (V, R, O, L, G, S, P, N, T, H) when no field has focus | Press R with focus on the tool rail; Rectangle tool is pressed |
| SVG-R49 | Dragging a selected object moves it, with snapping when enabled | Drag a rectangle 50 px right; its X increases |
| SVG-R50 | Snap to grid rounds pointer positions to the grid spacing within a threshold | With grid 10, a point at 48,53 snaps to 50,55 together with object guides |
| SVG-R51 | Smart object guides snap pointer positions to the edges and centres of other objects and of the artboard | A point near another object's edge snaps to it |
| SVG-R52 | Clicking a child of a group selects the owning top-level group | Group two rectangles, click one; the group is selected |

### Vector Studio: editing and arranging

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SVG-R53 | X and Y fields in Precision move the selected object to the typed position | Type 120 in X; the object's X is 120 |
| SVG-R54 | Width, height, rotation and opacity fields resize, rotate and fade the selected object (width and height at least 1, opacity 0–1) | Type 200 in W; the object is 200 wide |
| SVG-R55 | Name renames the selected object and the layer list shows the new name | Type "Logo" in Name; the layer reads Logo |
| SVG-R56 | Corner radius changes a rectangle's corner rounding; Path data edits a path's `d` value | Move the Corner radius slider; the rectangle corners round |
| SVG-R57 | Arrow keys nudge the selection by 1 unit when no field has focus | Press ArrowRight with a rectangle at X 120; X reads 121 |
| SVG-R58 | Shift with an arrow key nudges by 10 units | Press Shift+ArrowRight; X increases by 10 |
| SVG-R59 | Align left, center, right, top, middle and bottom align the selection to its bounds | Select two objects and press Align left; their left edges match |
| SVG-R60 | Distribute ↔ and ↕ space three or more selected objects evenly | Select three objects and press Distribute ↔; the gaps are equal |
| SVG-R61 | Duplicate copies the selection with fresh ids (including every descendant of a group) and selects the copies | Press Duplicate; the layer count doubles and all ids are unique |
| SVG-R62 | Moving or duplicating a path offsets its coordinates and keeps relative commands intact | Move a path by 10,10; absolute points shift and relative segments stay |
| SVG-R63 | Ctrl or Cmd with D duplicates the selection | Press Ctrl+D with an object selected; a copy appears |
| SVG-R64 | Delete removes the selection; the Delete or Backspace key does the same when no field has focus | Press Delete; the selected layers disappear and the status reads "Selection deleted." |
| SVG-R65 | Group combines two or more objects into one group; Ungroup releases a group or composition into its original objects | Group two objects, then Ungroup; both return with their geometry |
| SVG-R66 | Back, Backward, Forward and Front reorder the selection in the stack | Select the top object and press Back; it is first in the layer order |
| SVG-R67 | Mirror H and Mirror V reflect the selection around its own centre on one axis, on the live artboard and in export | Press Mirror H; the shape has transform scale(-1 1) on canvas and in the SVG source |
| SVG-R68 | Symmetry H and Symmetry V add an editable mirrored copy reflected around the artboard centre | Select a rectangle and press Symmetry H; one more layer appears |
| SVG-R69 | 3×3 repeat creates eight independent copies of the selection in a grid with a 24-unit gap | Select a rectangle and press 3×3 repeat; nine objects exist |
| SVG-R70 | Radial ×8 creates an eight-part radial repeat of the selection around the artboard centre, each an independent object | Select a rectangle and press Radial ×8; eight objects with unique ids exist |
| SVG-R71 | Make symbol turns the selection into a reusable symbol component and places a symbol instance referencing it | Select two objects and press Make symbol; one symbol-instance layer replaces them |
| SVG-R72 | Clip (two or more objects) builds a reversible SVG clip-path composition from the selection | Select two rectangles and press Clip; one layer and one clipPath exist; Ungroup restores both |
| SVG-R73 | Difference (two or more objects) builds a reversible SVG mask composition that cuts the later objects out of the first, including nested compositions | Select two rectangles and press Difference; one mask exists; nested difference stays on the live canvas |
| SVG-R74 | Undo and Redo step through document changes (bounded history); Undo is disabled with no past and Redo with no future | Add two objects, press Undo twice, Redo once; one object remains |
| SVG-R75 | Ctrl or Cmd with Z undoes and with Shift redoes when no field has focus | Press Ctrl+Z after adding an object; it is removed |
| SVG-R76 | Layers lists objects top-down; clicking selects, Shift-click extends | Open Layers and click a layer; it is selected |
| SVG-R77 | The eye toggle hides or shows an object and the lock toggle locks it so the canvas cannot select it | Hide a layer; it disappears from the artboard. Lock a layer; clicking it does not select it |

### Vector Studio: appearance

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SVG-R78 | Fill style offers Solid, Linear gradient, Radial gradient and Pattern and applies defaults for the chosen kind to the selection | Choose Linear gradient; the object shows a two-colour gradient |
| SVG-R79 | Solid fill colour is set with a colour input | Change Fill color to #ff0000; the object is red |
| SVG-R80 | Linear gradient has start and end colours and an angle (0–360) | Move Gradient angle; the gradient direction changes |
| SVG-R81 | Radial gradient has centre and edge colours | Change Edge; the outer colour changes |
| SVG-R82 | Pattern fill offers Stripes, Dots and Grid with foreground, background, size and angle | Choose Pattern then Dots; the object shows dots |
| SVG-R83 | Document swatches list the saved colours; a swatch button applies it as the solid fill | Press Apply #7c3aed fill; the fill becomes #7c3aed |
| SVG-R84 | Save swatch adds the chosen colour to the document swatches once; a colour already saved is refused with a message | Save #123456; "Apply #123456 fill" appears; saving it again adds nothing |
| SVG-R85 | Stroke colour and width are set per object | Set Width 4; the object has a 4-unit outline |
| SVG-R86 | Stroke cap (butt, round, square) and join (miter, round, bevel) are set per object | Choose Cap Square; the stroke ends are square |
| SVG-R87 | Dash pattern accepts a dash array such as "8 4" | Type 8 4; the stroke is dashed |
| SVG-R88 | Blend offers blend modes for the selection | Choose multiply; the object blends with what is below |
| SVG-R89 | Object title and description are stored per object and written to the exported SVG | Enter a title; the SVG source has a title for that element |

### Vector Studio: artboard and view

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SVG-R90 | Artboard Preset sets width and height from HD landscape, Square social, Portrait social, App icon, Share card and A4 ratio | Choose Square social; the artboard is 1080 × 1080 |
| SVG-R91 | Artboard Width and Height accept 1–100000 and resize the artboard | Type 3000 in Width; the artboard is 3000 wide |
| SVG-R92 | Preview background sets the artboard colour shown on screen; it is written to exports only when Include artboard background is checked | Change the colour; the artboard changes while the SVG source has no background rect |
| SVG-R93 | Show grid toggles the grid and Grid spacing (2–1000) sets its size | Uncheck Show grid; the grid disappears |
| SVG-R94 | Snap to grid and Smart object guides checkboxes switch snapping on and off | Uncheck Snap to grid; a click lands at the exact pointer position |
| SVG-R95 | Zoom to 100 percent sets the view to 100% | Press 100%; the readout shows 100% |
| SVG-R96 | Zoom in and Zoom out change the zoom by 10 points between 20% and 300% | Press + ; the readout rises by 10 |
| SVG-R97 | Fit artboard chooses the zoom at which the whole artboard fits the viewport and centres it | Set the artboard to 3000 wide and press Fit; the readout is no longer 70% |
| SVG-R98 | Fit selection (header and artboard panel) zooms to the selection bounds and is disabled with nothing selected | Select an object and press Fit selection |
| SVG-R99 | Rulers along the top and left with an origin label mark the artboard extent | The "Artboard ruler origin" label is visible |
| SVG-R100 | A readout shows the pointer position in artboard units and the zoom percentage | Move over the artboard; the readout shows x and y |
| SVG-R101 | A status bar reports the last action, the object count, artboard size and zoom | Add an object; the bar reads "1 objects" |
| SVG-R102 | On narrow screens the Design, Layers and Export panels are shown one at a time through tabs | At 360 px choose the Export tab; the export panel shows |
| SVG-R103 | Scrollable regions (artboard viewport, inspector, layers, export) are keyboard focusable and scroll with the arrow keys | Focus the artboard viewport and press ArrowDown |

### Vector Studio: export

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SVG-R104 | Download saves the artwork in the chosen Format (SVG, Optimized SVG, PNG, JPEG, WebP, PDF, Editable project JSON) under the typed Filename with path characters replaced | Choose SVG, name it "logo"; logo.svg downloads |
| SVG-R105 | SVG export is standards-native with escaped title, description, creator, rights, license, language, tags and custom metadata | Set the title "Brand <Launch>"; the source has `<title>Brand &lt;Launch&gt;</title>` |
| SVG-R106 | Document metadata fields (Title, Description, Creator, Rights, License, Language, Tags / keywords, Custom metadata) are editable and appear in the SVG source | Fill Title and Tags; Preview SVG shows the title and inmo:tag entries |
| SVG-R107 | Preview SVG shows the current SVG source (optimized when that format is chosen) before download | Press Preview SVG; the block "Vector SVG export source" shows the markup |
| SVG-R108 | Responsive SVG (viewBox only) omits fixed width and height; unchecking it writes them | Toggle the box and preview; the svg element gains width and height |
| SVG-R109 | Hidden objects are left out of the export and locked objects are exported as normal content | Hide a layer and preview; the element is absent |
| SVG-R110 | Optimized SVG uses SVGO while keeping title, description and metadata | Choose Optimized SVG and preview; the title, desc and metadata remain and the size is not larger |
| SVG-R111 | Clip and difference compositions are written as native SVG clipPath and mask definitions | Export a Difference composition; the source holds a mask and a group using it |
| SVG-R112 | Mirror transforms are written to the SVG with the same axis transform the canvas uses | Mirror H then preview; the source has scale(-1 1) |
| SVG-R113 | PNG export renders the artboard at 1×–4× scale | Choose PNG at 2×; the file is twice the artboard size |
| SVG-R114 | JPEG export renders at 1×–4× with a Quality slider (0.4–1) on an opaque background | Choose JPEG; a Quality slider appears and the file has no transparency |
| SVG-R115 | WebP export renders at 1×–4× with a Quality slider | Choose WebP; the file is image/webp |
| SVG-R116 | PDF export places a high-resolution render of the artboard on one page sized to the artboard and sets title, author, subject and keywords from the metadata | Choose PDF; the file opens as one page with the title set |
| SVG-R117 | Editable project JSON saves the document as `<name>.inmovector.json` and reopening it restores the document | Export JSON and Open project it; the layers match |
| SVG-R118 | Include artboard background writes the preview background into SVG, PNG, WebP and PDF exports | Check the box and preview; the source has a background rect |
| SVG-R119 | Copy SVG puts the responsive SVG markup on the clipboard, or reports that the clipboard is unavailable | Press Copy SVG; the status reads "SVG markup copied." |
| SVG-R120 | Copy inline embed and Copy data URI copy an inline HTML wrapper and a `data:image/svg+xml` URI built from the same SVG | Copy the data URI; decoding it gives the SVG source |
| SVG-R121 | Copy image embed copies an `<img>` tag for the SVG with the description as alt text | Press Copy image embed; the clipboard holds an img element |

### Site, privacy and non-functional

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SVG-R122 | The route `#/tools/svg-sprite-compiler` opens Vector Studio above the sprite compiler with guidance and the privacy statement | Open the catalog link and the route |
| SVG-R123 | Everything runs in the browser: SVG, images and projects are read, edited and exported locally and nothing is uploaded or fetched | Use every function with the network blocked |
| SVG-R124 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) and passes the colour-contrast check in dark | With each theme stored, the workspace uses it; `E2E_THEME=dark` axe on `#/tools/svg-sprite-compiler` has no `color-contrast` violation |
| SVG-R125 | No horizontal page overflow at any width from 320 to 2560 px | Overflow ≤ 1 px at 320, 390, 768, 844, 1440, 1920 and 2560 px with a document open |
| SVG-R126 | No serious or critical axe violations on the workspace | axe on `#/tools/svg-sprite-compiler` reports none |
| SVG-R127 | Every drag action has a numeric or button alternative and controls stay keyboard reachable with a visible focus outline | Create, move, resize, order and export using only the keyboard |
| SVG-R128 | Animations and transitions stop when the device requests reduced motion | With reduced motion on, no transition runs in the workspace |

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Technique decisions

None: no function was compared between an ML and a non-ML method.

## Intent not recorded

None.

## Change log

- 2026-10-05 — Created: 128 requirements as built at `e83420d6`.

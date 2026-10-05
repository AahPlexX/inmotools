---
tool: fiber-craft-workstation
folder: src/tools/fiber-craft
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-09-15-fiber-craft-workstation-design.md
tracker: src/tools/fiber-craft/TRACKER.md
updated: 2026-10-04
---

# Fiber Craft Workstation — Design Spec

Requirement prefix: `FC`. Status of each requirement: [TRACKER.md](../../../src/tools/fiber-craft/TRACKER.md).

**Date:** 2026-09-15
**Route:** `#/fiber-craft-workstation` (canonical), `#/tools/fiber-craft-workstation` (registry form)
**Execution:** 100% browser-local, static GitHub Pages, no authentication or backend
**Plan:** `docs/superpowers/plans/2026-09-15-fiber-craft-workstation.md`

## Summary

A single registry-driven InmoTools workspace for designing, charting, and exporting patterns
across five textile disciplines — crochet, machine embroidery digitizing, quilting/patchwork,
counted cross-stitch, and knitting colorwork/cables — from one shared canvas shell, one project
model, and one export/metadata pipeline. Every discipline gets a purpose-built canvas (polar,
grid, gauge-corrected, or vector-path) rather than a single generic square-pixel grid, and every
chart can be compiled to a human-readable written pattern in addition to its visual form.

## Non-goals (excluded by static, local-first architecture, or already covered)

- **Cloud-managed multi-tenant pattern servers / remote databases.** Excluded: this is a static
  site with no backend. Projects, palettes, and swatches persist in the browser (IndexedDB) and in
  portable local files.
- **Direct OS/USB machine-firmware spoolers.** Excluded: the workstation exports universal,
  vendor-neutral files (`.dst`, `.pes`, `.jef`, `.exp`, `.svg`, `.dxf`) that any compatible
  embroidery machine, fabric cutter, or laser cutter already reads; it does not drive hardware
  directly.
- **Server-side 3D fabric/yarn render farms.** Excluded: drape/texture preview runs in-browser on
  Canvas 2D; no WebGL render cluster or remote job queue is needed for this feature set.
- **License-dongle validation layers.** Excluded (other): this is an open, static, no-account tool;
  there is nothing to license-gate, so a validation layer would add friction with no purpose here.

## Constraints

- Platform rules: no accounts, no server or database, everything runs in the browser ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).

## Requirements

### Shared canvas & workspace infrastructure

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| FC-R01 | **Discipline switcher.** One shell hosts all five craft canvases; switching disciplines preserves the active project's shared metadata (title, author, tags) without data loss. | Switch between every discipline canvas in one project; title, author and tags are unchanged after each switch. |
| FC-R02 | **Layered undo/redo history.** A bounded, reversible history (matching this repository's existing 100-entry `{past, present, future}` reducer pattern) covers every drawing, symbol, and metadata edit. | Make drawing, symbol and metadata edits, undo and redo each one; history keeps at most 100 entries. |
| FC-R03 | **Local autosave & recovery.** Debounced IndexedDB autosave with an explicit "restore last session" prompt on reload, mirroring the existing per-tool autosave pattern. | Edit a chart, reload the page; a "Restore last session" prompt appears and restores the edit. |
| FC-R04 | **Single-file project bundle (`.craftproj`).** One JSON file bundling chart data, custom palette, fabric/yarn swatches (as embedded data URIs), and metadata, for portable save/load with no account. | Save a `.craftproj` file and load it; chart, palette, swatches and metadata are identical. |
| FC-R05 | **Zoom, pan, and ruler guides.** Canvas-native zoom/pan with physical-unit ruler overlays (inches/cm) driven by the active gauge or fabric count. | Zoom and pan a chart; ruler overlays show inches or centimetres derived from the active gauge or fabric count. |
| FC-R06 | **Symmetry & transform tools.** Mirror (horizontal/vertical), 90°/180° rotate, and radial repeat, applied non-destructively to a selection. | Mirror, rotate 90°/180° and radial-repeat a selection; the original selection data is unchanged. |
| FC-R07 | **High-contrast & dark-room print themes.** Screen themes for low-light craft sessions and a dedicated print stylesheet that maximizes symbol/grid-line contrast on paper. | Switch light, dark-room and high-contrast themes; print media uses the high-contrast print stylesheet. |
| FC-R08 | **Keyboard- and touch-first input.** Full drawing, selection, and navigation available from keyboard alone and from touch/stylus, so the same chart is usable by a child on a tablet or a professional on a desktop. | Draw, select and navigate a chart with the keyboard only and with touch/stylus input. |

### Crochet symbol charting & pattern drafting

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| FC-R09 | **Concentric polar/round canvas.** Radial coordinate canvas for mandalas, doilies, granny squares, and amigurumi bases, with angular snapping to the active round's stitch count. | Place stitches on a round chart; positions snap to the active round's stitch count. |
| FC-R10 | **Universal US/UK crochet symbol library.** Standard vector glyphs for slip stitch, chain, single/half-double/double/treble crochet, front/back-post variants, clusters, puffs, popcorns, picots, and increases/decreases, switchable between US and UK naming without re-drawing the chart. | Every listed stitch has a vector glyph; switching US/UK changes names without changing the chart. |
| FC-R11 | **Corner-to-corner (C2C) compiler.** Converts a pixel design into diagonal C2C blocks with row-by-row block counts. | Compile a pixel design to C2C; every cell is covered exactly once with per-row block counts. |
| FC-R12 | **Filet crochet mesh mode.** Binary filled/open-mesh grid with block-and-space written output. | Fill and open filet cells; written output gives block-and-space instructions matching the grid. |
| FC-R13 | **Amigurumi round-shaping assistant.** Tracks stitch count per round against a target shaping curve and flags unintended increases/decreases before they compound. | Set a shaping curve; rounds whose stitch count drifts from the target are flagged. |
| FC-R14 | **Automated written-pattern compiler.** Real-time, discipline-correct row-by-row or round-by-round text generation from the visual chart, kept in sync by construction (one pipeline, not a second hand-written copy). | Edit the chart; the written row/round pattern updates from the same data in US and UK terms. |
| FC-R15 | **Stitch-count & growth validator.** Live auditor comparing each row/round's actual stitch count to its expected count and explaining any mismatch. | A row or round whose stitch count differs from its expected count is reported with the reason. |
| FC-R16 | **Yarn weight & hook-gauge reference panel.** Standard Craft Yarn Council weight categories with recommended hook ranges, editable per project. | The panel lists Craft Yarn Council weight categories with hook ranges; project values are editable. |

### Machine embroidery digitizing & export

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| FC-R17 | **Vector stitch-path authoring.** Bézier path drawing that classifies each path as a running stitch, triple/bean stitch, satin column, or tatami fill. | Draw Bézier paths and classify each as running, triple/bean, satin or tatami fill. |
| FC-R18 | **Satin column width & pull-compensation control.** Per-column width modulation with a configurable pull-compensation percentage to reduce fabric pucker. | Change a satin column's width and pull-compensation percentage; the stitch output changes accordingly. |
| FC-R19 | **Automated underlay generator.** Edge-walk, center-walk, and zig-zag underlay generation beneath fill/satin areas for stabilization. | Generate edge-walk, center-walk and zig-zag underlay beneath fill and satin areas. |
| FC-R20 | **Density & stitch-length controls.** Per-region fill density and minimum/maximum stitch length limits, validated against common machine tolerances. | Set fill density and stitch-length limits per region; values outside machine tolerances are rejected. |
| FC-R21 | **Color-stop & thread-trim sequencer.** Ordered stitch-block list with color-change, stop, and jump-trim commands, reorderable before export. | Reorder stitch blocks with color-change, stop and jump-trim commands; the export follows the new order. |
| FC-R22 | **Multi-hoop layout splitter.** Splits an oversized design across hoop-sized tiles with registration marks for realignment. | Split a design larger than the hoop into hoop-sized tiles with registration marks. |
| FC-R23 | **Appliqué placement & tackdown generator.** Placement line, tackdown pass, and satin-border cap generation for fabric appliqué. | Generate placement line, tackdown pass and satin border for an appliqué shape. |
| FC-R24 | **Multi-format machine file exporter.** Pure, unit-tested TypeScript encoders producing Tajima `.dst`, Melco `.exp`, Janome `.jef`, and Brother/Baby Lock `.pes` from the same internal stitch-command list, so every format stays in agreement. | Encode one stitch-command list to `.dst`, `.exp`, `.jef` and `.pes`; unit tests decode identical stitches from each. |
| FC-R25 | **Stitch-out time & thread-length estimator.** Estimated run time and thread consumption per color, computed from stitch count and machine speed presets. | Show estimated run time and thread length per color for a selected machine speed preset. |

### Quilting, patchwork & block engineering

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| FC-R26 | **Parametric quilt block designer.** Grid and freeform geometric drafting for traditional and modern blocks (Log Cabin, Flying Geese, stars, pinwheels) with editable seam allowance. | Draft Log Cabin, Flying Geese, star and pinwheel blocks on grid or freeform with editable seam allowance. |
| FC-R27 | **Foundation paper-piecing (FPP) generator.** Automatic sewing-order numbering and printable, to-scale FPP template pages with a configurable seam allowance. | Generate numbered sewing order and printable to-scale FPP template pages with the chosen seam allowance. |
| FC-R28 | **Curved-piecing template support.** Drunkard's-path/orange-peel style curved seam templates with clip-notch marks. | Create drunkard's-path/orange-peel curved templates with clip-notch marks. |
| FC-R29 | **Rotary cutting calculator.** Exact fractional cut dimensions for squares, half-square triangles, quarter-square triangles, and flying-geese units, including trimming allowance. | Cut dimensions for squares, HSTs, QSTs and flying-geese units include the trimming allowance. |
| FC-R30 | **Quilt-top layout & sashing arranger.** Multi-block staging with sashing width, cornerstones, and inner/outer borders. | Stage multiple blocks with sashing width, cornerstones and inner/outer borders. |
| FC-R31 | **Binding & backing calculator.** Continuous or double-fold binding length and backing panel/seam layout for a given finished quilt size. | For a finished quilt size, show binding length and backing panel/seam layout. |
| FC-R32 | **Fabric swatch import & draping.** User photographs of real fabric tiled across patches with grain-line rotation, for an accurate finished-look preview. | Import a fabric photo and tile it across patches with grain-line rotation. |
| FC-R33 | **Quilt yardage & shopping estimator.** Bolt-yardage requirement per fabric across top, sashing, borders, backing, and binding, accounting for seam and print-direction waste. | Yardage per fabric covers top, sashing, borders, backing and binding including waste. |
| FC-R34 | **Block library & template starters.** A curated set of named traditional blocks (public-domain geometry) usable as a starting point and fully editable afterward. | Start from a named traditional block and edit it freely. |

### Counted thread, cross-stitch & tapestry grids

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| FC-R35 | **Precision counted grid canvas.** Full cross, half, quarter, and three-quarter stitches, French knots, and backstitch lines on one addressable grid. | Place full, half, quarter and three-quarter stitches, French knots and backstitch lines on one grid. |
| FC-R36 | **Raster-to-floss quantization.** Worker-based image import with adjustable color-count limit and dithering, producing a stitchable chart from a photo. | Import an image with a color-count limit and optional dithering in a worker; a counted chart is produced. |
| FC-R37 | **Universal floss palette matcher.** CIEDE2000 nearest-match against DMC, Anchor, Madeira, and Sullivan palettes (via the existing `culori` dependency), with substitution suggestions when an exact match is unavailable. | Match a color to DMC, Anchor, Madeira and Sullivans palettes by CIEDE2000 with substitution suggestions. |
| FC-R38 | **High-contrast symbol-over-color chart mode.** Distinct printable glyphs per thread color so black-and-white prints stay legible without color. | Print or view symbols-only; each thread color has a distinct glyph. |
| FC-R39 | **Fabric count & confetti-stitch controls.** Aida/linen/evenweave count selection with isolated-stitch ("confetti") warnings for stitches likely to be missed while working. | Select fabric type and count; isolated confetti stitches are warned. |
| FC-R40 | **Floss skein & length calculator.** Yardage and skein counts per color from fabric count, stitch total, and strand count. | Yardage and skein count per color follow fabric count, stitch total and strand count. |
| FC-R41 | **Backstitch & specialty-technique layer.** A separate line layer for backstitch and blackwork/hardanger-style pulled-thread outlines over the counted base. | Draw backstitch, blackwork and pulled-thread outlines on a separate line layer. |
| FC-R42 | **Auto-generated symbol key/legend.** A printable legend mapping every symbol to its floss code and name, regenerated automatically as the palette changes. | The legend maps every used symbol to its floss code and name and updates when the palette changes. |

### Knitting colorwork & cable diagramming

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| FC-R43 | **Gauge-corrected non-square grid.** Row/stitch aspect ratio locked to the project's actual gauge (for example 4:5) so a knitted result matches the charted proportions. | Change the measured gauge; cell width/height proportions follow it. |
| FC-R44 | **Flat & in-the-round chart modes.** Row-direction and right-side/wrong-side handling switch automatically between flat and circular construction. | Switch flat and in-the-round; row direction and RS/WS labels change accordingly. |
| FC-R45 | **Knitting symbol & cable notation matrix.** Standard glyphs for knit, purl, yarn-over, SSK/K2tog-family decreases, and cable-cross twists of configurable width. | Place knit, purl, yarn-over, decreases and cables of configurable width. |
| FC-R46 | **Stranded Fair Isle & intarsia float analyzer.** Flags floats longer than a configurable threshold that would need trapping or a bobbin/intarsia block. | Floats longer than the configured threshold are flagged with a trapping or intarsia suggestion. |
| FC-R47 | **Written knitting-instruction compiler.** Row-by-row text generation from the colorwork or cable chart, kept in sync with the visual chart by construction. | Edit the knitting chart; row-by-row written instructions update from the same data. |
| FC-R48 | **Repeat & panel marking.** Marks pattern repeats and panel boundaries directly on the chart, propagated into the written instructions. | Mark repeats and panels on the chart; the written instructions show them. |
| FC-R49 | **Yarn dye-lot & quantity planner.** Per-color yardage estimate from stitch/row counts and yarn weight, flagging colors likely to need a second dye lot. | Per-color yardage is estimated from stitch/row counts and yarn weight; colors likely to need a second dye lot are flagged. |

### Interactive progress tracking & ergonomics

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| FC-R50 | **Tap-to-track row/round progress.** Interactive marking of completed rows/rounds/stitches that persists with the saved project. | Mark rows/rounds/stitches complete, save and reload; the marks persist. |
| FC-R51 | **Active-row/round highlighting.** The current working row or round is visually highlighted and can be recentered with one action. | The working row/round is highlighted and one action recenters it. |
| FC-R52 | **Physical dimension & gauge scaling.** Bidirectional calculator between chart dimensions and finished project size from a measured gauge swatch. | Enter chart dimensions to get finished size, and finished size to get chart dimensions, from a measured gauge. |
| FC-R53 | **Metric/imperial unit toggle.** Every measurement (gauge, seam allowance, hoop size, yardage) switches units without re-entering data. | Toggle metric/imperial; every measurement converts without re-entry. |
| FC-R54 | **Difficulty & technique tagging.** Editable skill-level rating and a technique tag list (for example "cables," "C2C," "satin stitch") shown alongside the pattern. | Set a skill level and technique tags; they are shown with the pattern and persist. |
| FC-R55 | **Accessible chart description mode.** A structured, screen-reader-friendly text summary of the chart's symbols and layout, generated from the same underlying data as the visual chart. | A screen-reader text summary of the chart's symbols and layout is generated from the chart data. |

### Export, metadata, and publishing

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| FC-R56 | **Vector multi-page pattern-book PDF.** `pdf-lib`-based export combining a cover, materials key, legend table, full-size diagram, and written instructions into one paginated PDF. | Export a PDF with cover, materials key, legend, full-size diagram and written instructions. |
| FC-R57 | **Fabric/laser cutter vector export.** Clean `.svg` (via `svgo`) and hand-written `.dxf` (R12/R2000, following this repository's existing DXF-writer pattern) for rotary cutters, laser cutters, and craft plotters. | Export `.svg` (svgo-optimised) and `.dxf` (R12/R2000) cut files that open in cutter software. |
| FC-R58 | **Machine embroidery bundle export.** `.dst`/`.exp`/`.jef`/`.pes` files packaged together with a human-readable color/thread-sequence sheet. | Export `.dst`/`.exp`/`.jef`/`.pes` together with a color/thread-sequence sheet. |
| FC-R59 | **High-resolution raster export.** PNG export at selectable scale for sharing or printing without a PDF viewer. | Export PNG at a selected scale; the image has the expected pixel size. |
| FC-R60 | **Materials & shopping-list export.** `papaparse`-based `.csv` and matching printable PDF listing thread/floss codes, skein counts, yarn weights, fabric yardages, and notions. | Export the materials list as CSV and as a matching printable PDF. |
| FC-R61 | **Pattern metadata & copyright studio.** Editable title, author, difficulty, craft type, yarn weight class, hook/needle size, and a free-text license/attribution field embedded in every export's metadata (PDF document info, image EXIF-safe text fields where applicable, and the `.craftproj` JSON). | Edit metadata fields; they are embedded in every export's metadata and in `.craftproj`. |
| FC-R62 | **Export-time tag editor.** A final review step before every export where title, author, keywords, and license tags can be edited or corrected without reopening the project. | Before each export, title, author, keywords and license can be edited without reopening the project. |
| FC-R63 | **OpenGraph/social preview card generator.** A generated 1200×630 PNG preview card showing the pattern's title, a chart thumbnail, and craft-type badge, for sharing the exported pattern elsewhere. | Export a 1200×630 PNG preview card with title, chart thumbnail and craft badge. |
| FC-R64 | **Offline PWA project bundling.** The workspace registers for full offline use (service worker precache) consistent with this repository's existing PWA setup, and can export/import the same `.craftproj` bundle for moving a project between devices without an account. | Install the PWA, go offline and reload; the workspace opens and `.craftproj` import/export works. |
| FC-R65 | **Batch export queue.** Queue multiple export targets (PDF, SVG, DST, CSV, PNG) from one project and download them together, so a full pattern release does not require repeating the export dialog per format. | Queue several export formats and download them together in one action. |

## Persistence and privacy

Everything above operates on data already local to the browser. No project, swatch photo, or
palette is transmitted anywhere; `.craftproj` files, PDFs, SVGs, DXFs, and machine embroidery files
are generated in-memory and handed to the browser's native download, exactly like every other tool
in this catalog.

## Registration (deferred to Slice 1)

Following the existing mechanism used by every other tool: a `catalog.ts` entry, a lazy loader in
`workspaces.tsx`, and a route alias in `App.tsx`, added together only once the shared workspace
shell renders a real (even if minimal) view — no route is wired to a placeholder.

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Change log

- 2026-10-04 — Standard header block, requirement prefix line, Constraints and requirement tables added (T-fiber-craft-workstation-20261003-124b). Requirement IDs converted to the standard form: FC-R01 … FC-R65 were formerly FC-01 … FC-65 (FC-Rnn formerly FC-nn, same number, same requirement); requirement text unchanged, acceptance tests derived from it. Older records (plan, ledgers, `.tasks/` history, code comments, test titles) keep the former IDs.
- 2026-09-15 — Created as the design spec (FC-01 … FC-65).

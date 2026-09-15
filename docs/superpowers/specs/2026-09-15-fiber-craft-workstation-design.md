# Fiber Craft Workstation — Design Spec

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

## Shared canvas & workspace infrastructure

1. **FC-01 Discipline switcher.** One shell hosts all five craft canvases; switching disciplines
   preserves the active project's shared metadata (title, author, tags) without data loss.
2. **FC-02 Layered undo/redo history.** A bounded, reversible history (matching this repository's
   existing 100-entry `{past, present, future}` reducer pattern) covers every drawing, symbol, and
   metadata edit.
3. **FC-03 Local autosave & recovery.** Debounced IndexedDB autosave with an explicit "restore last
   session" prompt on reload, mirroring the existing per-tool autosave pattern.
4. **FC-04 Single-file project bundle (`.craftproj`).** One JSON file bundling chart data, custom
   palette, fabric/yarn swatches (as embedded data URIs), and metadata, for portable save/load with
   no account.
5. **FC-05 Zoom, pan, and ruler guides.** Canvas-native zoom/pan with physical-unit ruler overlays
   (inches/cm) driven by the active gauge or fabric count.
6. **FC-06 Symmetry & transform tools.** Mirror (horizontal/vertical), 90°/180° rotate, and radial
   repeat, applied non-destructively to a selection.
7. **FC-07 High-contrast & dark-room print themes.** Screen themes for low-light craft sessions and
   a dedicated print stylesheet that maximizes symbol/grid-line contrast on paper.
8. **FC-08 Keyboard- and touch-first input.** Full drawing, selection, and navigation available
   from keyboard alone and from touch/stylus, so the same chart is usable by a child on a tablet or
   a professional on a desktop.

## Crochet symbol charting & pattern drafting

9. **FC-09 Concentric polar/round canvas.** Radial coordinate canvas for mandalas, doilies, granny
   squares, and amigurumi bases, with angular snapping to the active round's stitch count.
10. **FC-10 Universal US/UK crochet symbol library.** Standard vector glyphs for slip stitch,
    chain, single/half-double/double/treble crochet, front/back-post variants, clusters, puffs,
    popcorns, picots, and increases/decreases, switchable between US and UK naming without
    re-drawing the chart.
11. **FC-11 Corner-to-corner (C2C) compiler.** Converts a pixel design into diagonal C2C blocks
    with row-by-row block counts.
12. **FC-12 Filet crochet mesh mode.** Binary filled/open-mesh grid with block-and-space written
    output.
13. **FC-13 Amigurumi round-shaping assistant.** Tracks stitch count per round against a target
    shaping curve and flags unintended increases/decreases before they compound.
14. **FC-14 Automated written-pattern compiler.** Real-time, discipline-correct row-by-row or
    round-by-round text generation from the visual chart, kept in sync by construction (one
    pipeline, not a second hand-written copy).
15. **FC-15 Stitch-count & growth validator.** Live auditor comparing each row/round's actual
    stitch count to its expected count and explaining any mismatch.
16. **FC-16 Yarn weight & hook-gauge reference panel.** Standard Craft Yarn Council weight
    categories with recommended hook ranges, editable per project.

## Machine embroidery digitizing & export

17. **FC-17 Vector stitch-path authoring.** Bézier path drawing that classifies each path as a
    running stitch, triple/bean stitch, satin column, or tatami fill.
18. **FC-18 Satin column width & pull-compensation control.** Per-column width modulation with a
    configurable pull-compensation percentage to reduce fabric pucker.
19. **FC-19 Automated underlay generator.** Edge-walk, center-walk, and zig-zag underlay generation
    beneath fill/satin areas for stabilization.
20. **FC-20 Density & stitch-length controls.** Per-region fill density and minimum/maximum stitch
    length limits, validated against common machine tolerances.
21. **FC-21 Color-stop & thread-trim sequencer.** Ordered stitch-block list with color-change,
    stop, and jump-trim commands, reorderable before export.
22. **FC-22 Multi-hoop layout splitter.** Splits an oversized design across hoop-sized tiles with
    registration marks for realignment.
23. **FC-23 Appliqué placement & tackdown generator.** Placement line, tackdown pass, and
    satin-border cap generation for fabric appliqué.
24. **FC-24 Multi-format machine file exporter.** Pure, unit-tested TypeScript encoders producing
    Tajima `.dst`, Melco `.exp`, Janome `.jef`, and Brother/Baby Lock `.pes` from the same internal
    stitch-command list, so every format stays in agreement.
25. **FC-25 Stitch-out time & thread-length estimator.** Estimated run time and thread consumption
    per color, computed from stitch count and machine speed presets.

## Quilting, patchwork & block engineering

26. **FC-26 Parametric quilt block designer.** Grid and freeform geometric drafting for traditional
    and modern blocks (Log Cabin, Flying Geese, stars, pinwheels) with editable seam allowance.
27. **FC-27 Foundation paper-piecing (FPP) generator.** Automatic sewing-order numbering and
    printable, to-scale FPP template pages with a configurable seam allowance.
28. **FC-28 Curved-piecing template support.** Drunkard's-path/orange-peel style curved seam
    templates with clip-notch marks.
29. **FC-29 Rotary cutting calculator.** Exact fractional cut dimensions for squares, half-square
    triangles, quarter-square triangles, and flying-geese units, including trimming allowance.
30. **FC-30 Quilt-top layout & sashing arranger.** Multi-block staging with sashing width,
    cornerstones, and inner/outer borders.
31. **FC-31 Binding & backing calculator.** Continuous or double-fold binding length and backing
    panel/seam layout for a given finished quilt size.
32. **FC-32 Fabric swatch import & draping.** User photographs of real fabric tiled across patches
    with grain-line rotation, for an accurate finished-look preview.
33. **FC-33 Quilt yardage & shopping estimator.** Bolt-yardage requirement per fabric across top,
    sashing, borders, backing, and binding, accounting for seam and print-direction waste.
34. **FC-34 Block library & template starters.** A curated set of named traditional blocks
    (public-domain geometry) usable as a starting point and fully editable afterward.

## Counted thread, cross-stitch & tapestry grids

35. **FC-35 Precision counted grid canvas.** Full cross, half, quarter, and three-quarter stitches,
    French knots, and backstitch lines on one addressable grid.
36. **FC-36 Raster-to-floss quantization.** Worker-based image import with adjustable color-count
    limit and dithering, producing a stitchable chart from a photo.
37. **FC-37 Universal floss palette matcher.** CIEDE2000 nearest-match against DMC, Anchor,
    Madeira, and Sullivan palettes (via the existing `culori` dependency), with substitution
    suggestions when an exact match is unavailable.
38. **FC-38 High-contrast symbol-over-color chart mode.** Distinct printable glyphs per thread
    color so black-and-white prints stay legible without color.
39. **FC-39 Fabric count & confetti-stitch controls.** Aida/linen/evenweave count selection with
    isolated-stitch ("confetti") warnings for stitches likely to be missed while working.
40. **FC-40 Floss skein & length calculator.** Yardage and skein counts per color from fabric
    count, stitch total, and strand count.
41. **FC-41 Backstitch & specialty-technique layer.** A separate line layer for backstitch and
    blackwork/hardanger-style pulled-thread outlines over the counted base.
42. **FC-42 Auto-generated symbol key/legend.** A printable legend mapping every symbol to its
    floss code and name, regenerated automatically as the palette changes.

## Knitting colorwork & cable diagramming

43. **FC-43 Gauge-corrected non-square grid.** Row/stitch aspect ratio locked to the project's
    actual gauge (for example 4:5) so a knitted result matches the charted proportions.
44. **FC-44 Flat & in-the-round chart modes.** Row-direction and right-side/wrong-side handling
    switch automatically between flat and circular construction.
45. **FC-45 Knitting symbol & cable notation matrix.** Standard glyphs for knit, purl, yarn-over,
    SSK/K2tog-family decreases, and cable-cross twists of configurable width.
46. **FC-46 Stranded Fair Isle & intarsia float analyzer.** Flags floats longer than a configurable
    threshold that would need trapping or a bobbin/intarsia block.
47. **FC-47 Written knitting-instruction compiler.** Row-by-row text generation from the colorwork
    or cable chart, kept in sync with the visual chart by construction.
48. **FC-48 Repeat & panel marking.** Marks pattern repeats and panel boundaries directly on the
    chart, propagated into the written instructions.
49. **FC-49 Yarn dye-lot & quantity planner.** Per-color yardage estimate from stitch/row counts
    and yarn weight, flagging colors likely to need a second dye lot.

## Interactive progress tracking & ergonomics

50. **FC-50 Tap-to-track row/round progress.** Interactive marking of completed rows/rounds/stitches
    that persists with the saved project.
51. **FC-51 Active-row/round highlighting.** The current working row or round is visually
    highlighted and can be recentered with one action.
52. **FC-52 Physical dimension & gauge scaling.** Bidirectional calculator between chart dimensions
    and finished project size from a measured gauge swatch.
53. **FC-53 Metric/imperial unit toggle.** Every measurement (gauge, seam allowance, hoop size,
    yardage) switches units without re-entering data.
54. **FC-54 Difficulty & technique tagging.** Editable skill-level rating and a technique tag list
    (for example "cables," "C2C," "satin stitch") shown alongside the pattern.
55. **FC-55 Accessible chart description mode.** A structured, screen-reader-friendly text summary
    of the chart's symbols and layout, generated from the same underlying data as the visual chart.

## Export, metadata, and publishing

56. **FC-56 Vector multi-page pattern-book PDF.** `pdf-lib`-based export combining a cover, materials
    key, legend table, full-size diagram, and written instructions into one paginated PDF.
57. **FC-57 Fabric/laser cutter vector export.** Clean `.svg` (via `svgo`) and hand-written `.dxf`
    (R12/R2000, following this repository's existing DXF-writer pattern) for rotary cutters, laser
    cutters, and craft plotters.
58. **FC-58 Machine embroidery bundle export.** `.dst`/`.exp`/`.jef`/`.pes` files packaged together
    with a human-readable color/thread-sequence sheet.
59. **FC-59 High-resolution raster export.** PNG export at selectable scale for sharing or printing
    without a PDF viewer.
60. **FC-60 Materials & shopping-list export.** `papaparse`-based `.csv` and matching printable PDF
    listing thread/floss codes, skein counts, yarn weights, fabric yardages, and notions.
61. **FC-61 Pattern metadata & copyright studio.** Editable title, author, difficulty, craft type,
    yarn weight class, hook/needle size, and a free-text license/attribution field embedded in every
    export's metadata (PDF document info, image EXIF-safe text fields where applicable, and the
    `.craftproj` JSON).
62. **FC-62 Export-time tag editor.** A final review step before every export where title, author,
    keywords, and license tags can be edited or corrected without reopening the project.
63. **FC-63 OpenGraph/social preview card generator.** A generated 1200×630 PNG preview card showing
    the pattern's title, a chart thumbnail, and craft-type badge, for sharing the exported pattern
    elsewhere.
64. **FC-64 Offline PWA project bundling.** The workspace registers for full offline use (service
    worker precache) consistent with this repository's existing PWA setup, and can export/import the
    same `.craftproj` bundle for moving a project between devices without an account.
65. **FC-65 Batch export queue.** Queue multiple export targets (PDF, SVG, DST, CSV, PNG) from one
    project and download them together, so a full pattern release does not require repeating the
    export dialog per format.

## Persistence and privacy

Everything above operates on data already local to the browser. No project, swatch photo, or
palette is transmitted anywhere; `.craftproj` files, PDFs, SVGs, DXFs, and machine embroidery files
are generated in-memory and handed to the browser's native download, exactly like every other tool
in this catalog.

## Registration (deferred to Slice 1)

Following the existing mechanism used by every other tool: a `catalog.ts` entry, a lazy loader in
`workspaces.tsx`, and a route alias in `App.tsx`, added together only once the shared workspace
shell renders a real (even if minimal) view — no route is wired to a placeholder.

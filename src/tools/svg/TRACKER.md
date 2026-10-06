---
tool: svg-sprite-compiler
folder: src/tools/svg
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-svg-sprite-compiler-design.md
tracker: src/tools/svg/TRACKER.md
updated: 2026-10-05
---

# SVG Sprite Compiler — tracker

## Resume here

128 requirements: 72 verified, 49 implemented, 7 partial, 0 missing, 0 prohibited. Next action: SVG-R124 and SVG-R125 (dark-theme contrast, widths 320 to 2560 px), then tests for the `implemented` rows. No blocker.

## Documents

- Spec: [2026-10-05-svg-sprite-compiler-design.md](../../../docs/superpowers/specs/2026-10-05-svg-sprite-compiler-design.md)
- Older design and plan (history): [2026-09-11-vector-studio-design.md](../../../docs/superpowers/specs/2026-09-11-vector-studio-design.md), [2026-09-11-vector-studio.md](../../../docs/superpowers/plans/2026-09-11-vector-studio.md)
- Dark-theme contrast task: [T-repository-dark-contrast-20261004-b7d2](../../../.tasks/items/T-repository-dark-contrast-20261004-b7d2.md)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/svg.test.ts`, `tests/unit/vector-engine.test.ts`, `tests/unit/vector-export.test.ts`, `tests/unit/vector-selection.test.ts`, `tests/unit/vector-duplicate-ids.test.ts`, `tests/unit/vector-engine-path-motion.test.ts`; browser tests: `tests/e2e/svg.spec.ts`, `tests/e2e/vector-nested-composition.spec.ts`, `tests/e2e/accessibility.spec.ts`, `tests/e2e/app.spec.ts`

## Requirement status

Evidence names the test file in parentheses before each quoted title.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| SVG-R01 | verified | e2e (`tests/e2e/svg.spec.ts`) "compiles collision-safe symbols, isolates bad files, previews safely, and reports viewBox uncertainty" |  |
| SVG-R02 | verified | e2e (`tests/e2e/svg.spec.ts`) "compiles collision-safe symbols, isolates bad files, previews safely, and reports viewBox uncertainty"; e2e (`tests/e2e/svg.spec.ts`) "allows the same SVG filename to be selected again after recompiling" |  |
| SVG-R03 | verified | unit (`tests/unit/svg.test.ts`) "creates deterministic symbol IDs and can normalize fills" |  |
| SVG-R04 | verified | unit (`tests/unit/svg.test.ts`) "allocates globally unique symbol IDs even when suffix-like filenames collide"; e2e (`tests/e2e/svg.spec.ts`) "compiles collision-safe symbols, isolates bad files, previews safely, and reports viewBox uncertainty" |  |
| SVG-R05 | verified | unit (`tests/unit/svg.test.ts`) "isolates one invalid file instead of dropping valid siblings"; e2e (`tests/e2e/svg.spec.ts`) "compiles collision-safe symbols, isolates bad files, previews safely, and reports viewBox uncertainty" |  |
| SVG-R06 | implemented | `compileSvgSprite` in `svg-engine.ts`; `SvgWorkspace.tsx` table | No test asserts the byte columns or the savings percentage |
| SVG-R07 | verified | unit (`tests/unit/svg.test.ts`) "strips scripts and SVG event-handler attributes from compiled output"; e2e (`tests/e2e/svg.spec.ts`) "strips executable SVG content before output and never runs it in preview" |  |
| SVG-R08 | verified | unit (`tests/unit/svg.test.ts`) "creates deterministic symbol IDs and can normalize fills" |  |
| SVG-R09 | verified | unit (`tests/unit/svg.test.ts`) "rewrites literal fill and stroke declarations inside a style attribute" |  |
| SVG-R10 | verified | unit (`tests/unit/svg.test.ts`) "preserves non-literal paint semantics instead of turning them into visible currentColor paint"; unit (`tests/unit/svg.test.ts`) "preserves paint-server references while scoping the optimized internal ID" |  |
| SVG-R11 | verified | unit (`tests/unit/svg.test.ts`) "does not touch style declarations when normalization is off" |  |
| SVG-R12 | verified | e2e (`tests/e2e/svg.spec.ts`) "compiles collision-safe symbols, isolates bad files, previews safely, and reports viewBox uncertainty" |  |
| SVG-R13 | verified | unit (`tests/unit/svg.test.ts`) "prefixes optimized internal IDs and rewrites local URL and href references per symbol"; e2e (`tests/e2e/svg.spec.ts`) "compiles collision-safe symbols, isolates bad files, previews safely, and reports viewBox uncertainty" |  |
| SVG-R14 | verified | unit (`tests/unit/svg.test.ts`) "rewrites preserved root paint references with the same scoped ID mapping as descendants" |  |
| SVG-R15 | verified | unit (`tests/unit/svg.test.ts`) "preserves and rewrites a root clip-path reference instead of dropping clipping" |  |
| SVG-R16 | verified | unit (`tests/unit/svg.test.ts`) "preserves inherited root presentation and style attributes on the symbol" |  |
| SVG-R17 | verified | unit (`tests/unit/svg.test.ts`) "prefers an explicit viewBox over dimensions" |  |
| SVG-R18 | verified | unit (`tests/unit/svg.test.ts`) "synthesizes a viewBox from width and height when none is present"; unit (`tests/unit/svg.test.ts`) "accepts px dimensions" |  |
| SVG-R19 | verified | unit (`tests/unit/svg.test.ts`) "warns instead of guessing when dimensions cannot safely define a viewBox"; e2e (`tests/e2e/svg.spec.ts`) "compiles collision-safe symbols, isolates bad files, previews safely, and reports viewBox uncertainty" |  |
| SVG-R20 | verified | e2e (`tests/e2e/svg.spec.ts`) "allows the same SVG filename to be selected again after recompiling" |  |
| SVG-R21 | implemented | `SvgWorkspace.tsx` Download sprite button | No test presses the button |
| SVG-R22 | verified | e2e (`tests/e2e/svg.spec.ts`) "compiles collision-safe symbols, isolates bad files, previews safely, and reports viewBox uncertainty"; e2e (`tests/e2e/svg.spec.ts`) "strips executable SVG content before output and never runs it in preview" |  |
| SVG-R23 | verified | e2e (`tests/e2e/svg.spec.ts`) "strips executable SVG content before output and never runs it in preview" |  |
| SVG-R24 | verified | e2e (`tests/e2e/svg.spec.ts`) "pages the compiled symbol table for a large icon set" |  |
| SVG-R25 | verified | e2e (`tests/e2e/svg.spec.ts`) "pages the compiled symbol table for a large icon set" |  |
| SVG-R26 | verified | e2e (`tests/e2e/svg.spec.ts`) "pages the compiled symbol table for a large icon set" |  |
| SVG-R27 | verified | e2e (`tests/e2e/svg.spec.ts`) "compiles collision-safe symbols, isolates bad files, previews safely, and reports viewBox uncertainty" |  |
| SVG-R28 | implemented | `copyUse` in `SvgWorkspace.tsx` | No test presses the button |
| SVG-R29 | verified | e2e (`tests/e2e/svg.spec.ts`) "compiles collision-safe symbols, isolates bad files, previews safely, and reports viewBox uncertainty" |  |
| SVG-R30 | verified | unit (`tests/unit/vector-engine.test.ts`) "creates an SVG-native starter document with editable metadata and artboard" | The button handler is not exercised; the document factory is |
| SVG-R31 | implemented | `starterDocument` in `VectorStudio.tsx` | No test loads a template |
| SVG-R32 | verified | e2e (`tests/e2e/svg.spec.ts`) "Vector Studio imports project JSON and offers accessible non-drag layer ordering" |  |
| SVG-R33 | verified | unit (`tests/unit/vector-export.test.ts`) "round-trips project JSON and rejects unrelated JSON" | Parser is tested; the status message is not |
| SVG-R34 | partial | `importSvg` in `VectorStudio.tsx` | No test imports an SVG; polygon, polyline, group, use and transform content is not converted; fills that are url() references become the default colour |
| SVG-R35 | implemented | `importSvg` in `VectorStudio.tsx` | No test imports an SVG |
| SVG-R36 | implemented | `importImage` in `VectorStudio.tsx` | No test places an image |
| SVG-R37 | verified | e2e (`tests/e2e/svg.spec.ts`) "Vector Studio creates, precisely edits, exports metadata, and reflows without drag-only controls"; e2e (`tests/e2e/svg.spec.ts`) "Vector Studio pan tool moves the artboard viewport rather than acting as a decorative control" |  |
| SVG-R38 | verified | e2e (`tests/e2e/svg.spec.ts`) "Vector Studio exposes non-destructive clip, difference, and symmetry duplicate workflows" |  |
| SVG-R39 | verified | e2e (`tests/e2e/svg.spec.ts`) "Vector Studio creates, precisely edits, exports metadata, and reflows without drag-only controls" |  |
| SVG-R40 | implemented | `defaultElement` in `VectorCanvas.tsx` | No test uses the tool |
| SVG-R41 | implemented | `defaultElement` in `VectorCanvas.tsx` | No test uses the tool |
| SVG-R42 | verified | e2e (`tests/e2e/svg.spec.ts`) "Vector Studio exposes configurable shape tools, saved swatches, rulers, and real fit navigation"; unit (`tests/unit/vector-engine.test.ts`) "creates closed polygon and star path data" |  |
| SVG-R43 | verified | e2e (`tests/e2e/svg.spec.ts`) "Vector Studio exposes configurable shape tools, saved swatches, rulers, and real fit navigation"; unit (`tests/unit/vector-engine.test.ts`) "creates closed polygon and star path data" |  |
| SVG-R44 | implemented | `handlePointerDown`, `finishPen` in `VectorCanvas.tsx` | No test uses the tool |
| SVG-R45 | partial | unit (`tests/unit/vector-engine.test.ts`) "simplifies freehand points while preserving endpoints"; e2e (`tests/e2e/svg.spec.ts`) "Vector Studio exposes configurable shape tools, saved swatches, rulers, and real fit navigation" | Simplification and the setting are tested; no test drags a stroke on the canvas |
| SVG-R46 | implemented | `defaultElement` in `VectorCanvas.tsx`; text controls in `VectorStudio.tsx` | No test uses the tool |
| SVG-R47 | verified | e2e (`tests/e2e/svg.spec.ts`) "Vector Studio pan tool moves the artboard viewport rather than acting as a decorative control" |  |
| SVG-R48 | implemented | `onKeyDown` in `VectorStudio.tsx` | No test presses the letters |
| SVG-R49 | implemented | `selectElement`, `handlePointerMove` in `VectorCanvas.tsx` | No test drags an object; numeric alternatives are tested separately |
| SVG-R50 | verified | unit (`tests/unit/vector-engine.test.ts`) "snaps to grid and nearby object guides with deterministic thresholds" | Toggle checkbox is not exercised |
| SVG-R51 | verified | unit (`tests/unit/vector-engine.test.ts`) "snaps to grid and nearby object guides with deterministic thresholds" | Toggle checkbox is not exercised |
| SVG-R52 | verified | unit (`tests/unit/vector-selection.test.ts`) "maps rendered descendants back to their owning top-level group" |  |
| SVG-R53 | partial | e2e (`tests/e2e/svg.spec.ts`) "Vector Studio creates, precisely edits, exports metadata, and reflows without drag-only controls" | Only X is exercised |
| SVG-R54 | implemented | `transformPrimary` in `VectorStudio.tsx` | No test edits these fields |
| SVG-R55 | implemented | Name field in `VectorStudio.tsx` | No test renames |
| SVG-R56 | implemented | Inspector controls in `VectorStudio.tsx` | No test |
| SVG-R57 | verified | e2e (`tests/e2e/svg.spec.ts`) "Vector Studio creates, precisely edits, exports metadata, and reflows without drag-only controls" |  |
| SVG-R58 | implemented | `onKeyDown` in `VectorStudio.tsx` | No test uses Shift |
| SVG-R59 | verified | unit (`tests/unit/vector-engine.test.ts`) "aligns and distributes selections using visual bounds"; e2e (`tests/e2e/svg.spec.ts`) "Vector Studio creates, precisely edits, exports metadata, and reflows without drag-only controls" |  |
| SVG-R60 | verified | unit (`tests/unit/vector-engine.test.ts`) "aligns and distributes selections using visual bounds" |  |
| SVG-R61 | verified | unit (`tests/unit/vector-engine.test.ts`) "adds, updates, moves and duplicates selected elements without mutating the source"; unit (`tests/unit/vector-duplicate-ids.test.ts`) "refreshes every descendant id when duplicating nested groups"; e2e (`tests/e2e/svg.spec.ts`) "Vector Studio creates, precisely edits, exports metadata, and reflows without drag-only controls" |  |
| SVG-R62 | verified | unit (`tests/unit/vector-engine-path-motion.test.ts`) "moves absolute path coordinates while preserving relative segments"; unit (`tests/unit/vector-engine-path-motion.test.ts`) "translates only the first relative moveto and keeps later relative commands unchanged"; unit (`tests/unit/vector-engine-path-motion.test.ts`) "duplicates path geometry at the requested offset without changing the source path" |  |
| SVG-R63 | implemented | `onKeyDown` in `VectorStudio.tsx` | No test |
| SVG-R64 | implemented | `removeSelection` in `vector-engine.ts`; `VectorStudio.tsx` | No test |
| SVG-R65 | verified | unit (`tests/unit/vector-engine.test.ts`) "groups and ungroups elements while preserving child geometry"; e2e (`tests/e2e/svg.spec.ts`) "Vector Studio exposes non-destructive clip, difference, and symmetry duplicate workflows" |  |
| SVG-R66 | verified | unit (`tests/unit/vector-engine.test.ts`) "reorders selection without losing unrelated elements"; e2e (`tests/e2e/svg.spec.ts`) "Vector Studio creates, precisely edits, exports metadata, and reflows without drag-only controls"; e2e (`tests/e2e/svg.spec.ts`) "Vector Studio imports project JSON and offers accessible non-drag layer ordering" |  |
| SVG-R67 | verified | unit (`tests/unit/vector-engine.test.ts`) "mirrors geometry independently on each axis instead of faking a rotation"; e2e (`tests/e2e/svg.spec.ts`) "Vector Studio mirrors the live artboard with the same axis transform used by export" |  |
| SVG-R68 | verified | unit (`tests/unit/vector-engine.test.ts`) "creates a separate symmetry duplicate reflected around a requested axis"; e2e (`tests/e2e/svg.spec.ts`) "Vector Studio exposes non-destructive clip, difference, and symmetry duplicate workflows" |  |
| SVG-R69 | implemented | `repeatGrid` in `VectorStudio.tsx` | No test presses the button |
| SVG-R70 | verified | unit (`tests/unit/vector-engine.test.ts`) "creates radial repeats as independent editable clones" | Engine is tested; the button is not pressed |
| SVG-R71 | implemented | `createSymbol` in `VectorStudio.tsx` | No test |
| SVG-R72 | verified | unit (`tests/unit/vector-engine.test.ts`) "builds non-destructive clip and difference compositions that release back to source objects"; e2e (`tests/e2e/svg.spec.ts`) "Vector Studio exposes non-destructive clip, difference, and symmetry duplicate workflows" |  |
| SVG-R73 | verified | unit (`tests/unit/vector-engine.test.ts`) "builds non-destructive clip and difference compositions that release back to source objects"; unit (`tests/unit/vector-export.test.ts`) "serializes every descendant of a grouped difference cutter as black luminance"; unit (`tests/unit/vector-export.test.ts`) "preserves nested difference composition semantics when a composition becomes a cutter"; e2e (`tests/e2e/svg.spec.ts`) "Vector Studio exposes non-destructive clip, difference, and symmetry duplicate workflows"; e2e (`tests/e2e/vector-nested-composition.spec.ts`) "Vector Studio preserves nested difference compositions on the live canvas" |  |
| SVG-R74 | verified | unit (`tests/unit/vector-engine.test.ts`) "supports bounded undo and redo history" | Buttons are not pressed in a browser test |
| SVG-R75 | implemented | `onKeyDown` in `VectorStudio.tsx` | No test |
| SVG-R76 | verified | e2e (`tests/e2e/svg.spec.ts`) "Vector Studio imports project JSON and offers accessible non-drag layer ordering" |  |
| SVG-R77 | implemented | Layer toggles in `VectorStudio.tsx`; `selectElement` in `VectorCanvas.tsx` | No test presses the toggles |
| SVG-R78 | implemented | `setFillKind` in `VectorStudio.tsx`; `PaintDefinitions` in `VectorCanvas.tsx` | No test |
| SVG-R79 | implemented | Appearance panel in `VectorStudio.tsx` | No test |
| SVG-R80 | implemented | Appearance panel in `VectorStudio.tsx` | No test |
| SVG-R81 | implemented | Appearance panel in `VectorStudio.tsx` | No test |
| SVG-R82 | implemented | Appearance panel in `VectorStudio.tsx`; pattern serialization in `vector-export.ts` | No test |
| SVG-R83 | implemented | Swatch row in `VectorStudio.tsx` | No test applies a swatch |
| SVG-R84 | verified | e2e (`tests/e2e/svg.spec.ts`) "Vector Studio exposes configurable shape tools, saved swatches, rulers, and real fit navigation" | Duplicate refusal is not exercised |
| SVG-R85 | implemented | Appearance panel in `VectorStudio.tsx` | No test |
| SVG-R86 | implemented | Appearance panel in `VectorStudio.tsx` | No test |
| SVG-R87 | implemented | Appearance panel in `VectorStudio.tsx` | No test |
| SVG-R88 | partial | `VectorStudio.tsx` blend select; `BlendMode` in `vector-types.ts` | The list offers 8 of the 12 modes the model supports (color-dodge, color-burn, hard-light and soft-light are not offered); no test |
| SVG-R89 | implemented | Accessible description panel in `VectorStudio.tsx`; `vector-export.ts` | No test |
| SVG-R90 | implemented | `applyPreset` in `VectorStudio.tsx` | No test |
| SVG-R91 | verified | e2e (`tests/e2e/svg.spec.ts`) "Vector Studio exposes configurable shape tools, saved swatches, rulers, and real fit navigation" |  |
| SVG-R92 | implemented | Artboard panel in `VectorStudio.tsx`; `serializeVectorSvg` | No test |
| SVG-R93 | implemented | Artboard panel in `VectorStudio.tsx` | No test |
| SVG-R94 | implemented | Artboard panel in `VectorStudio.tsx`; `svgPoint` in `VectorCanvas.tsx` | No test toggles them |
| SVG-R95 | verified | e2e (`tests/e2e/svg.spec.ts`) "Vector Studio pan tool moves the artboard viewport rather than acting as a decorative control" |  |
| SVG-R96 | implemented | Header buttons in `VectorStudio.tsx` | No test |
| SVG-R97 | verified | unit (`tests/unit/vector-engine.test.ts`) "calculates bounded artboard and selection fit zoom from real viewport dimensions"; e2e (`tests/e2e/svg.spec.ts`) "Vector Studio exposes configurable shape tools, saved swatches, rulers, and real fit navigation" |  |
| SVG-R98 | verified | unit (`tests/unit/vector-engine.test.ts`) "calculates bounded artboard and selection fit zoom from real viewport dimensions"; e2e (`tests/e2e/svg.spec.ts`) "Vector Studio exposes configurable shape tools, saved swatches, rulers, and real fit navigation" |  |
| SVG-R99 | verified | e2e (`tests/e2e/svg.spec.ts`) "Vector Studio exposes configurable shape tools, saved swatches, rulers, and real fit navigation" |  |
| SVG-R100 | implemented | `vector-coordinate-readout` in `VectorCanvas.tsx` | The zoom readout is used by tests; the pointer position is not asserted |
| SVG-R101 | implemented | `vector-status` in `VectorStudio.tsx` | No test |
| SVG-R102 | verified | e2e (`tests/e2e/svg.spec.ts`) "Vector Studio creates, precisely edits, exports metadata, and reflows without drag-only controls"; e2e (`tests/e2e/svg.spec.ts`) "Vector Studio imports project JSON and offers accessible non-drag layer ordering" |  |
| SVG-R103 | verified | e2e (`tests/e2e/svg.spec.ts`) "Vector Studio keeps scrollable regions keyboard reachable and free of serious axe violations" |  |
| SVG-R104 | implemented | `exportFile` in `VectorStudio.tsx` | No test downloads a file |
| SVG-R105 | verified | unit (`tests/unit/vector-export.test.ts`) "serializes a responsive SVG with escaped descriptive metadata and editable tags" |  |
| SVG-R106 | verified | e2e (`tests/e2e/svg.spec.ts`) "Vector Studio creates, precisely edits, exports metadata, and reflows without drag-only controls"; unit (`tests/unit/vector-export.test.ts`) "serializes a responsive SVG with escaped descriptive metadata and editable tags" |  |
| SVG-R107 | verified | e2e (`tests/e2e/svg.spec.ts`) "Vector Studio creates, precisely edits, exports metadata, and reflows without drag-only controls"; e2e (`tests/e2e/svg.spec.ts`) "Vector Studio mirrors the live artboard with the same axis transform used by export" |  |
| SVG-R108 | verified | unit (`tests/unit/vector-export.test.ts`) "serializes a responsive SVG with escaped descriptive metadata and editable tags" | Checkbox is not toggled in a test |
| SVG-R109 | verified | unit (`tests/unit/vector-export.test.ts`) "omits hidden elements and preserves locked artwork as normal SVG content" |  |
| SVG-R110 | verified | unit (`tests/unit/vector-export.test.ts`) "optimizes SVG without removing title, description, or metadata" |  |
| SVG-R111 | verified | unit (`tests/unit/vector-export.test.ts`) "serializes clip and difference compositions with native SVG definitions" |  |
| SVG-R112 | verified | unit (`tests/unit/vector-export.test.ts`) "serializes true axis reflection around an element center"; e2e (`tests/e2e/svg.spec.ts`) "Vector Studio mirrors the live artboard with the same axis transform used by export" |  |
| SVG-R113 | implemented | `renderVectorRaster` in `vector-export.ts` | No test renders a raster |
| SVG-R114 | implemented | `renderVectorRaster` in `vector-export.ts` | No test renders a raster |
| SVG-R115 | implemented | `renderVectorRaster` in `vector-export.ts` | No test renders a raster; browsers without WebP encoding show "export is unavailable" |
| SVG-R116 | implemented | `renderVectorPdf` in `vector-export.ts` | No test renders a PDF; the panel says the PDF is not editable vector content |
| SVG-R117 | verified | unit (`tests/unit/vector-export.test.ts`) "round-trips project JSON and rejects unrelated JSON" |  |
| SVG-R118 | implemented | `serializeVectorSvg`, `exportFile` | No test |
| SVG-R119 | implemented | `copy` in `VectorStudio.tsx` | No test presses the button |
| SVG-R120 | verified | unit (`tests/unit/vector-export.test.ts`) "generates portable inline and data-URI representations from the same SVG source" | Buttons are not pressed |
| SVG-R121 | implemented | `buildImageEmbed` in `vector-export.ts` | No test |
| SVG-R122 | verified | e2e (`tests/e2e/app.spec.ts`) "every registered suite opens with guidance, privacy status, and a usable workspace" |  |
| SVG-R123 | implemented | No `fetch`, `XMLHttpRequest` or `WebSocket` under `src/tools/svg/`; privacy text in `svg-sprite-compiler.meta.ts` | No test blocks the network |
| SVG-R124 | partial | `.tasks/items/T-repository-dark-contrast-20261004-b7d2.md` | The route is listed there among the dark-theme contrast failures; the workspace uses Canvas and CanvasText system colours with a fixed white text on accent buttons and fixed white and #111 preview tiles; no test stores a theme and loads this route |
| SVG-R125 | partial | e2e (`tests/e2e/svg.spec.ts`) "Vector Studio creates, precisely edits, exports metadata, and reflows without drag-only controls" | Tested at 360 px only |
| SVG-R126 | verified | e2e (`tests/e2e/svg.spec.ts`) "Vector Studio keeps scrollable regions keyboard reachable and free of serious axe violations"; e2e (`tests/e2e/accessibility.spec.ts`) "has no serious or critical axe violations at <route>" |  |
| SVG-R127 | partial | e2e (`tests/e2e/svg.spec.ts`) "Vector Studio creates, precisely edits, exports metadata, and reflows without drag-only controls"; e2e (`tests/e2e/svg.spec.ts`) "Vector Studio imports project JSON and offers accessible non-drag layer ordering"; e2e (`tests/e2e/svg.spec.ts`) "Vector Studio keeps scrollable regions keyboard reachable and free of serious axe violations" | Keyboard-only resize and rotate fields are not asserted |
| SVG-R128 | implemented | `@media (prefers-reduced-motion: reduce)` in `vector-studio.css` | No test |

## Open work

1. SVG-R124 dark-theme contrast check with a document open; SVG-R125 widths 320 to 2560 px; SVG-R127 keyboard-only resize and rotate.
2. Browser tests for the `implemented` rows: downloads and raster, JPEG, WebP and PDF export; SVG import and image placement; Ellipse, Line, Pen and Text tools; appearance controls; artboard presets and toggles.
3. SVG-R34 import of polygon, polyline, group and transform content; SVG-R45 pencil stroke on the canvas; SVG-R88 the four blend modes the model supports but the list omits.

## Known limitations

- Imported SVG keeps only rect, ellipse, circle, line, path, text and data-URL image elements.
- PDF export embeds a raster render of the artboard.
- WebP export depends on browser canvas encoding support.
- Large artboards (up to 100000 units) are bounded by browser canvas and memory limits when rasterized.

## Verification evidence

- 2026-10-05, `expand/svg-sprite-compiler` from `main` @ `e83420d6`: `pnpm tool:check svg-sprite-compiler --base origin/main` 72/128, no errors; `pnpm docs:sync` and `pnpm docs:check` passed; `pnpm exec vitest run tests/unit/cad-progress.test.ts tests/unit/sheets-wave-b.test.ts tests/unit/deployment-config.test.ts` 23 passed.

## Change log

- 2026-10-05 — Created: 128 requirements as built at `e83420d6`.

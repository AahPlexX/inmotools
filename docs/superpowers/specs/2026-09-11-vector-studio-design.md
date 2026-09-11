# Vector Studio Design

## Goal

Evolve the existing SVG Sprite Compiler into a local-first Vector Studio that is approachable for first-time creators while providing credible professional illustration, brand-asset, SVG engineering, and export workflows. Preserve the current sprite compiler and route for backward compatibility.

## Product boundary

Vector Studio edits standards-native 2D vector documents in the browser. Its canonical document is a structured scene graph that serializes to SVG. It does not attempt desktop publishing, 3D modeling, video animation, cloud collaboration, or proprietary document compatibility. Raster export is an output path, not the editing model.

## Architecture

- React owns editor state and accessible controls.
- Native SVG is the interactive scene/canvas and export source of truth.
- A small immutable document model keeps artboards, elements, styles, reusable symbols, metadata, and history deterministic.
- Pure geometry/state helpers implement creation, transforms, alignment, snapping, grouping, ordering, repetition, freehand smoothing, and path helpers.
- Export helpers serialize clean SVG, optimized SVG, raster formats, PDF, project JSON, embed markup, data URIs, and the existing sprite workflow.
- Existing `svg-engine.ts` and `#svg-files` sprite compiler behavior remain available and regression-tested.
- No server, account, external API, or network dependency is required.

## Interaction model

The default surface is a three-region editor: tool rail, artboard, and inspector/layers. Regions collapse into stacked/drawer-style sections on narrow screens. Pointer manipulation always has numeric/button alternatives. Keyboard shortcuts supplement, rather than replace, labeled controls. Touch targets are at least 24 CSS pixels and primary controls target 40+ CSS pixels.

## Functional capability set

Every capability below must be represented by working behavior, not decorative controls.

### Create and draw

1. Select and multi-select objects.
2. Rectangle with editable corner radius.
3. Ellipse/circle.
4. Line.
5. Polygon with configurable sides.
6. Star with configurable points and inner ratio.
7. Pen/path creation.
8. Freehand pencil with adjustable smoothing.
9. Text creation and editing.
10. Image placement as an embedded data URL.
11. Reusable symbols/components with `<symbol>/<use>` semantics.
12. Starter shapes/templates appropriate to quick learning and professional setup.

### Edit and transform

13. Drag move with precise X/Y controls.
14. Resize with numeric width/height controls.
15. Rotate with numeric angle control.
16. Flip horizontal/vertical.
17. Duplicate.
18. Delete.
19. Group/ungroup.
20. Bring forward/send backward/to front/to back.
21. Align left/center/right/top/middle/bottom.
22. Distribute horizontally/vertically.
23. Grid snapping.
24. Object-edge/center smart snapping.
25. Keyboard nudge with larger modified-step nudge.
26. Undo/redo history.
27. Lock/unlock objects.
28. Hide/show objects.
29. Layer rename and deterministic reordering.
30. Repeat/grid clones.
31. Radial repeat.
32. Mirror/symmetry duplicate.

### Appearance

33. Solid fill.
34. Linear gradient fill.
35. Radial gradient fill.
36. Stroke color and width.
37. Stroke cap/join/dash controls.
38. Opacity.
39. Blend mode.
40. Saved/global swatches.
41. Pattern fills from reusable definitions.
42. Clip-mask composition.
43. Non-destructive intersection/difference compositions using SVG clip/mask primitives where applicable.
44. Accessible object title/description.

### Artboard and navigation

45. Artboard width/height and common presets.
46. Artboard background preview without forcing exported background.
47. Zoom in/out, fit, and 100%.
48. Pan.
49. Grid visibility and spacing.
50. Rulers/origin readout and live pointer coordinates.
51. Focus-selection/fit-selection navigation.

### Export and interoperability

52. Safe SVG import.
53. Project JSON import/export.
54. Standards-native SVG export.
55. Optimized/minified SVG export through the existing SVGO dependency.
56. PNG export with selectable scale.
57. JPEG export with selectable scale/quality/background.
58. WebP export with selectable scale/quality.
59. PDF export using the existing `pdf-lib` dependency, embedding a high-resolution artboard render.
60. Copy SVG markup.
61. HTML `<img>`/inline embed snippet.
62. SVG data URI output.
63. Per-export editable filename, document title, description, creator, rights/license, keywords/tags, language, and custom metadata text.
64. SVG `<title>`, `<desc>`, and `<metadata>` serialization.
65. Existing collision-safe SVG sprite compilation and currentColor normalization.
66. Export preview/source inspection before download.

## Export semantics

SVG is the fidelity-preserving canonical export. Raster formats are rendered from the same SVG serialization. PDF is a browser-local print/share export containing a high-resolution artboard rendering; the UI must not imply that its contents remain individually editable vector objects. Metadata controls apply where the target format supports them; SVG receives structured descriptive metadata directly, while project JSON retains the full editable metadata model.

## Accessibility and responsive requirements

- Meet WCAG 2.2 AA interaction expectations relevant to the editor.
- Any drag-based reordering or transform has button/numeric alternatives.
- Primary controls remain keyboard reachable with visible focus.
- Do not use tiny node handles as the only way to edit geometry; the inspector provides equivalent numeric controls.
- Layout must reflow without horizontal page overflow at phone portrait widths, split-screen widths, browser zoom, and enlarged text.
- Respect reduced-motion preference.
- Status updates use polite live regions and destructive actions remain undoable.

## Compatibility and safety

- Keep slug `svg-sprite-compiler` and existing sprite DOM IDs so saved links and existing tests continue to work.
- SVG import must strip executable script/event-handler content before placing imported markup into the editable model.
- Embedded images are local data URLs; no external URL fetch is required.
- Export must escape metadata and text content.
- No user artwork leaves the browser.

## Validation

Must pass repository unit tests, TypeScript build, the existing SVG Playwright regression suite, new Vector Studio unit tests, and new focused browser interactions. The PR workflow is the pre-integration gate; after merge, both validation workflows and Pages deployment must succeed before the implementation is reported as deployed.

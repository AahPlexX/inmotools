---
tool: floorplan-studio
folder: src/tools/floorplan
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-floorplan-studio-design.md
tracker: src/tools/floorplan/TRACKER.md
updated: 2026-10-05
---

# PlanCraft Studio — tracker

## Resume here

82 requirements: 52 verified, 19 implemented, 6 partial, 5 missing, 0 prohibited. Next action: the Open work list, item 1. No blocker.

## Documents

- Spec: [2026-10-05-floorplan-studio-design.md](../../../docs/superpowers/specs/2026-10-05-floorplan-studio-design.md)
- Older design and plan (history): [2026-08-30-plancraft-studio-design.md](../../../docs/superpowers/specs/2026-08-30-plancraft-studio-design.md), [2026-08-30-plancraft-studio.md](../../../docs/superpowers/plans/2026-08-30-plancraft-studio.md)
- Older ledger (history, F01–F38): [TRACKING.md](TRACKING.md)
- Task file: [T-floorplan-studio-20261005-b571](../../../.tasks/items/T-floorplan-studio-20261005-b571.md)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/floorplan-*.test.ts`; browser tests: `tests/e2e/floorplan.spec.ts`, `tests/e2e/floorplan-audit.spec.ts`, `tests/e2e/floorplan-hardening.spec.ts`

## Requirement status

`unit` = `tests/unit/floorplan-*.test.ts`; `e2e` = `tests/e2e/floorplan*.spec.ts` unless named.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| PCS-R01 | verified | e2e "drafts a room, hosts a door, stages a component, and supports undo/redo" |  |
| PCS-R02 | verified | e2e "Escape stops a run of walls without leaving the wall tool" |  |
| PCS-R03 | verified | e2e "drafts a room, hosts a door, stages a component, and supports undo/redo"; unit "continues from open floor without joining anything" |  |
| PCS-R04 | verified | e2e "a partition drawn wall-to-wall splits one room into two"; unit "splits both host walls when a partition runs wall-to-wall, producing two rooms", "keeps each opening on the half of a split wall that contains it, at the same position" |  |
| PCS-R05 | verified | unit "refuses a zero-length wall, a duplicate wall, and a wall lying along another" |  |
| PCS-R06 | partial | unit "queries nearby snap targets deterministically" | Target lookup is tested; the priority order, the join marker and the Snap checkbox have no test |
| PCS-R07 | implemented | `GRID_CHOICES` and `updateMeta` in `FloorplanWorkspace.tsx` | No test selects a grid size |
| PCS-R08 | verified | unit "snaps to fractional imperial grids without drifting off the inch grid" |  |
| PCS-R09 | implemented | `resolvePoint` and `constrainAngle` in `FloorplanWorkspace.tsx`, `geometry-engine.ts` | No test covers the Shift lock |
| PCS-R10 | missing |  | Only T junctions are split; the X case is a listed limitation |
| PCS-R11 | verified | e2e "drafts a room, hosts a door, stages a component, and supports undo/redo" |  |
| PCS-R12 | implemented | `addOpening` in `FloorplanWorkspace.tsx` | No test places a window |
| PCS-R13 | verified | unit "fits an opening inside its wall and refuses walls that are too short or already occupied" |  |
| PCS-R14 | implemented | `flipSelected` in `FloorplanWorkspace.tsx` and the opening buttons in `FloorplanInspector.tsx` | The Swing other way button is checked for presence only; no test flips the door |
| PCS-R15 | missing |  | The types are declared in `floorplan-types.ts`; the workspace places only the single door and the casement window |
| PCS-R16 | verified | e2e "a dimension can be selected and deleted" |  |
| PCS-R17 | verified | e2e "a dimension can be selected and deleted"; unit "hit-tests openings before their wall, components by footprint, and dimensions by distance" |  |
| PCS-R18 | implemented | `onDimensionUpdate` in `FloorplanInspector.tsx` | No test edits a label |
| PCS-R19 | verified | unit "covers every requested component discipline including MEP"; e2e "drafts a room, hosts a door, stages a component, and supports undo/redo" |  |
| PCS-R20 | verified | unit "labels rooms and furniture, and writes dimensions in the chosen display units" |  |
| PCS-R21 | implemented | `drawBaseScene` in `render-engine.ts` | No test checks the glyphs |
| PCS-R22 | implemented | `handleWorldClick` mode `ada` in `FloorplanWorkspace.tsx` | The rule is tested (see the clearance rows); the tool button is not |
| PCS-R23 | verified | e2e "a door stays selectable after clicking away, and its properties open"; unit "hit-tests openings before their wall, components by footprint, and dimensions by distance" |  |
| PCS-R24 | implemented | `drawOverlayScene` in `render-engine.ts` | No test checks the highlight |
| PCS-R25 | verified | e2e "furniture can be dragged, nudged with arrow keys, and each move undoes in one step" |  |
| PCS-R26 | verified | e2e "furniture can be dragged, nudged with arrow keys, and each move undoes in one step" | The Shift ×10 step is not tested |
| PCS-R27 | verified | unit "moves a corner and merges it onto another corner without leaving zero-length or duplicate walls" |  |
| PCS-R28 | implemented | `rotateSelected` in `FloorplanWorkspace.tsx`, `DegreesField` in `FloorplanInspector.tsx` | No test rotates an item |
| PCS-R29 | verified | unit "duplicates a component beside the original and deletes every selectable kind" |  |
| PCS-R30 | verified | unit "duplicates a component beside the original and deletes every selectable kind" |  |
| PCS-R31 | missing |  | Listed as not modelled in the known limits |
| PCS-R32 | verified | e2e "property fields ignore half-typed values and commit once"; e2e "feet-and-inches units apply to lengths and inputs" |  |
| PCS-R33 | partial | unit "maps wall states to distinct visual treatments" | The drawing style is tested; the panel controls are not |
| PCS-R34 | implemented | `FloorplanInspector.tsx` opening branch, `updateOpening`, `setOpeningOffset` | No test edits an opening's size |
| PCS-R35 | verified | e2e "furniture can be dragged, nudged with arrow keys, and each move undoes in one step" | Size and clear-space readouts are not asserted |
| PCS-R36 | verified | e2e "property fields ignore half-typed values and commit once" |  |
| PCS-R37 | implemented | `TextField` and `onProjectMeta` in `FloorplanInspector.tsx` | No test edits the name or author |
| PCS-R38 | verified | e2e "PlanCraft export inputs stay usable and truthful across target viewports" |  |
| PCS-R39 | verified | e2e "feet-and-inches units apply to lengths and inputs"; unit "formats imperial lengths as feet and inches to the nearest eighth", "parses the imperial forms people actually type", "formats areas in the unit system people quote rooms in" |  |
| PCS-R40 | partial | e2e "PlanCraft export inputs stay usable and truthful across target viewports" | The seven checkboxes are tested for presence; hiding a layer is not tested |
| PCS-R41 | implemented | `newPlan` in `FloorplanWorkspace.tsx` | No test starts a new plan |
| PCS-R42 | verified | e2e "drafts a room, hosts a door, stages a component, and supports undo/redo"; unit "extracts one interior room face from a closed wall cycle", "computes shoelace area, perimeter and centroid for a rectangle", "returns room metrics, snap targets and clearance violations from one project snapshot" |  |
| PCS-R43 | partial | unit "labels rooms and furniture, and writes dimensions in the chosen display units" | Export labels are tested; the rename field and canvas label are not |
| PCS-R44 | verified | unit "accepts a sofa pushed against a wall and a nightstand beside the bed", "reports two items occupying the same floor", "reports an item that runs into a wall", "tests a rectangular clearance envelope against wall thickness instead of a small-radius approximation" |  |
| PCS-R45 | verified | unit "reports furniture placed in the space in front of another item", "lets chairs sit in a dining table clearance" |  |
| PCS-R46 | verified | unit "checks a toilet against the ADA 60" × 56" water-closet clearance (604.3.1)", "applies the current library clearance to toilets saved with the old 30" × 48" envelope" |  |
| PCS-R47 | verified | unit "flags an obstructed ADA turning space" |  |
| PCS-R48 | verified | unit "never reports wall-mounted MEP devices as collisions" |  |
| PCS-R49 | implemented | `FloorplanInspector.tsx` Clearance check | No test clicks a finding |
| PCS-R50 | verified | unit "returns room metrics, snap targets and clearance violations from one project snapshot"; e2e "drafts a room, hosts a door, stages a component, and supports undo/redo" |  |
| PCS-R51 | verified | e2e "PlanCraft export inputs stay usable and truthful across target viewports" |  |
| PCS-R52 | missing |  | `ada_door_approach` is declared in `floorplan-types.ts` and not evaluated |
| PCS-R53 | verified | e2e "the mouse wheel zooms the plan without scrolling the page"; unit "round-trips world and screen coordinates at extreme supported zoom levels" |  |
| PCS-R54 | verified | e2e "Space still presses a focused button"; e2e "a touch tap selects while a touch drag pans without selecting" |  |
| PCS-R55 | verified | e2e "a touch tap selects while a touch drag pans without selecting"; e2e "an interrupted gesture does not wedge the drafting canvas" |  |
| PCS-R56 | verified | e2e "single-pointer viewport controls remain usable at a 320px viewport" |  |
| PCS-R57 | implemented | `fitToDrawing` in `FloorplanWorkspace.tsx` | No test presses Fit |
| PCS-R58 | implemented | Keyboard handler in `FloorplanWorkspace.tsx` | No test covers the modifier guard or the zoom keys |
| PCS-R59 | verified | e2e "drafts a room, hosts a door, stages a component, and supports undo/redo"; unit "undoes and redoes a committed geometry edit", "clears redo history after a new committed edit", "caps committed undo history at one hundred states" |  |
| PCS-R60 | implemented | `MODE_HELP` and the status region in `FloorplanWorkspace.tsx` | No test asserts the wording |
| PCS-R61 | verified | unit "creates a layered SVG containing every populated plan layer", "expands export bounds far enough to contain a wide door swing", "gives the SVG a white sheet so opening cut-outs never show on dark viewers", "includes dimension label extents when computing SVG export bounds" |  |
| PCS-R62 | verified | unit "keeps R12 and R2000 DXF vocabularies version-correct while exporting all populated layers", "subtracts hosted opening intervals from DXF wall centerlines" |  |
| PCS-R63 | verified | unit "writes the complete section, table, and handle structure a DXF R2000 reader requires" |  |
| PCS-R64 | verified | unit "flips Y so a CAD program shows the plan the same way up as the canvas" |  |
| PCS-R65 | verified | unit "draws door swing arcs in every export format" |  |
| PCS-R66 | verified | unit "labels rooms and furniture, and writes dimensions in the chosen display units" |  |
| PCS-R67 | partial | unit "honors an explicit export-layer selection instead of always emitting every populated layer" | The export functions take a layer selection; the workspace has no control for it |
| PCS-R68 | verified | unit "creates a readable one-page PDF without dropping the project", "labels fitted PDF placement honestly and preserves nominal scale only as metadata"; e2e "a PDF that cannot fit at scale explains why, and Fit to page downloads" |  |
| PCS-R69 | verified | unit "supports a real 1:50 PDF placement instead of labeling every PDF as fit-to-page"; e2e "a PDF that cannot fit at scale explains why, and Fit to page downloads" |  |
| PCS-R70 | verified | unit "serializes a human-readable lossless project payload" |  |
| PCS-R71 | verified | unit "restores a valid backup and names what is wrong with a broken one", "fills defaults an older backup may lack instead of rejecting it" |  |
| PCS-R72 | verified | e2e "autosaves locally and restores the drawing after reload" |  |
| PCS-R73 | implemented | `exported` in `FloorplanWorkspace.tsx`, `src/lib/support.ts` | No test covers the prompt |
| PCS-R74 | verified | e2e "PlanCraft catalog link, exact alias, and generic route open the same local workspace" |  |
| PCS-R75 | verified | e2e "the tab title names the tool while it is open" |  |
| PCS-R76 | verified | e2e "PlanCraft catalog link, exact alias, and generic route open the same local workspace" |  |
| PCS-R77 | verified | e2e "on a phone the drafting tools sit above the drawing" |  |
| PCS-R78 | implemented | `render-engine.ts` wall colours (`#94a3b8` on `#0b1120`) | No test measures the contrast |
| PCS-R79 | missing |  | The workspace colours are fixed dark values in `.plancraft` (`src/styles.css`) |
| PCS-R80 | partial | e2e "PlanCraft export inputs stay usable and truthful across target viewports" | Tested at 320, 390, 768, 844×390 and 1440 px; 1920 to 2560 px not tested |
| PCS-R81 | verified | e2e (`tests/e2e/accessibility.spec.ts`) "has no serious or critical axe violations at <route>"; e2e "exposes local export controls and has no serious or critical axe violations" |  |
| PCS-R82 | implemented | `aria-label` on `floorplan-overlay` in `FloorplanCanvas.tsx`, `role="status"` in `FloorplanWorkspace.tsx` | Not asserted by a test |

## Open work

1. Build: PCS-R10, PCS-R15, PCS-R31, PCS-R52, PCS-R79.
2. Finish: PCS-R06, PCS-R33, PCS-R40, PCS-R43, PCS-R67, PCS-R80.
3. Add tests for: PCS-R07, PCS-R09, PCS-R12, PCS-R14, PCS-R18, PCS-R21, PCS-R22, PCS-R24, PCS-R28, PCS-R34, PCS-R37, PCS-R41, PCS-R49, PCS-R57, PCS-R58, PCS-R60, PCS-R73, PCS-R78, PCS-R82.

## Known limitations

- Walls that cross mid-span are not split automatically; only T junctions are.
- Toilet clearance is modelled for a left-side wall; rotate the fixture for other orientations.
- Access zones are a single strip in front of an item; seating around a table is exempt.
- DXF R12 has no Unicode text, so non-ASCII label characters become "?"; R2000 keeps them as `\U+XXXX` escapes.
- Tool pages use hash routes; per-tool search indexing needs a site-wide routing change.

## Verification evidence

- 2026-10-05, `expand/floorplan-studio` from `main` @ `c371f847`: `pnpm tool:check floorplan-studio --base origin/main` result in the task file.

## Change log

- 2026-10-05 — Created per `docs/DOCUMENTATION_STANDARD.md`.

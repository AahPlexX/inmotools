---
tool: floorplan-studio
folder: src/tools/floorplan
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-floorplan-studio-design.md
tracker: src/tools/floorplan/TRACKER.md
updated: 2026-10-05
---

# PlanCraft Studio — spec

As built at `origin/main` `c371f847`. Requirement prefix: `PCS`. Status of each requirement: [TRACKER.md](../../../src/tools/floorplan/TRACKER.md). History: [2026-08-30-plancraft-studio-design.md](2026-08-30-plancraft-studio-design.md) (original design), plan [2026-08-30-plancraft-studio.md](../plans/2026-08-30-plancraft-studio.md), ledger [TRACKING.md](../../../src/tools/floorplan/TRACKING.md). Former ledger IDs are given as "(formerly F07)".

## Purpose

Draw floor plans in the browser — walls, doors, windows, furniture and fixtures — see room areas and clearance problems (including ADA clearances) as the plan grows, and export a PDF, a DXF for CAD or a layered SVG, for homeowners, interior designers, architects and facilities teams.

## Scope

In scope:
- Wall, door, window and dimension drafting with snapping, in millimeters or feet-and-inches, by mouse, pen, touch and keyboard.
- A library of furniture, fixtures and electrical/mechanical symbols with per-item clearance rules.
- Room detection with areas, collision, access-zone and ADA clearance checks.
- Exports: PDF (Letter, A4, Arch sheets), DXF R12 and R2000, layered SVG, JSON backup and restore; local autosave.

Out of scope:
- Code-compliance certification: clearance and ADA indicators are planning aids.
- Three-dimensional modelling, structural analysis and cost estimation (not part of the 2026-08-30 design).

## Constraints

- Platform rules: no accounts or authentication; no server or server-side database (static files on GitHub Pages); everything runs in the browser and data stays in this browser; network use only for the site's own files and public keyless sources requested by the user ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- No large language models; other ML only on the device under the ML ruleset.
- Libraries as in `package.json` (`pdf-lib` for the PDF export). The plan JSON format (`schemaVersion` 1), geometry in millimeters, the autosave key `inmotools_plancraft_autosave`, the slug `floorplan-studio` and the folder `src/tools/floorplan/` are not changed.
- The name PlanCraft Studio is to be renamed under the naming convention ([DECISIONS.md](../../DECISIONS.md), open questions); the slug, prefix and storage key stay.

## Requirements

### Wall drafting

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PCS-R01 | The Continuous Wall tool (W) places a wall between each pair of clicked corners and continues from the last corner; the status bar reports each wall's length | Press W, click four corners; four walls exist and the Walls count reads 4 |
| PCS-R02 | Escape ends the current run of walls and keeps the wall tool; a second Escape returns to Select (formerly F19) | Draw two walls, press Escape, the next click starts a new wall; press Escape again, Select is active |
| PCS-R03 | A wall that ends on an existing corner or wall ends the run, so closing a room does not continue drawing (formerly F29) | Close a four-wall outline; the draft line disappears and one room is counted |
| PCS-R04 | A wall ending on the interior of another wall splits that wall at the junction and re-hosts its openings by position, so partitions create rooms (formerly F09) | Draw a partition from one wall to the opposite wall; two rooms are counted and a door keeps its place |
| PCS-R05 | A zero-length wall, a duplicate wall and a wall lying along another wall are refused with a message | Click the same point twice with the wall tool; no wall is added and the status bar explains |
| PCS-R06 | Points snap to existing corners, wall midpoints, anywhere along a wall centerline, item centres and the grid, in that order of priority, with a marker where a corner or wall will be joined; the Snap checkbox turns snapping off | Hover near a corner with snapping on; the marker appears and the click lands on the corner; with Snap off the click lands where pointed |
| PCS-R07 | The Grid list sets the snap grid (10 mm to 1000 mm, or 1" to 2' in feet-and-inches) and switching units picks the nearest grid of the new system | Choose 500 mm; a click lands on a multiple of 500 mm; switch to feet and inches and a feet-inch grid is selected |
| PCS-R08 | Imperial grids stay on whole inches: a 6" grid does not drift (formerly F38) | With a 6" grid, twelve steps measure 6'-0" |
| PCS-R09 | Holding Shift locks a wall to 45° steps and snaps its length to the grid | Hold Shift while drawing; the wall ends at a multiple of 45° |
| PCS-R10 | Walls that cross mid-span (X junction) are split automatically at the crossing | Draw two walls that cross; four wall pieces and the enclosed rooms result |

### Doors, windows and dimensions

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PCS-R11 | The Parametric Door tool (D) adds a 915 mm door where a wall is clicked; a click away from a wall says to click on a wall | Press D, click a wall; the Doors & windows count reads 1 |
| PCS-R12 | The Window Cutout tool (N) adds a 1200 mm window with a 900 mm sill where a wall is clicked | Press N, click a wall; a window is counted and drawn |
| PCS-R13 | An opening is kept inside its wall: it is clamped so it cannot overhang an end, walls shorter than the opening and spots already occupied are refused (formerly F18) | Place a door 100 mm from a wall end; it moves inward to fit |
| PCS-R14 | A door's swing is flipped with F or Swing other way, and its hinge moved with Move hinge | Select a door, press F; the swing arc mirrors across the wall |
| PCS-R15 | Double, pocket, bifold and sliding doors, double-hung windows and cased openings can be placed | Each kind appears as a tool or list choice and draws its own symbol |
| PCS-R16 | The Dimension Tape (M) adds a measured dimension between two clicked points and reports its length | Press M, click two points; a dimension with the measured length is drawn |
| PCS-R17 | A dimension can be selected by clicking near its line and deleted (formerly F08) | Click a dimension and press Delete; it is gone |
| PCS-R18 | A selected dimension's label can be replaced with text, and an empty label shows the measurement again | Type "Hall" as the label; the dimension shows Hall; clear it and the length returns |

### Furniture, fixtures and symbols

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PCS-R19 | The library offers 39 furniture, fixture and electrical/mechanical symbols in six groups (living, bedroom, dining, kitchen and bath, office and storage, electrical and mechanical), each placed by choosing it and clicking the plan | Choose 3-Seat Sofa, click the plan; the Items count reads 1 |
| PCS-R20 | Items placed on the plan are labelled on the canvas and in exports, with short tags for small electrical/mechanical symbols (formerly F26) | Place a toilet; its name shows on the canvas and in the SVG |
| PCS-R21 | Symbols are drawn with plan-style glyphs (bed, sofa, chair, fixture, circle, device) | Pick a bed; the bed glyph is drawn at the clicked place |
| PCS-R22 | The ADA 60" Circle tool places a turning-space circle that is checked against walls and items | Click the ADA tool and the plan; the circle appears and an item inside it raises a warning |

### Selecting and editing

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PCS-R23 | Select & Transform (V) selects a wall, door, window, item or dimension under the pointer; openings are tested before their wall and items by footprint (formerly F07) | Click a door on a wall; the door, not the wall, is selected, and again after clicking away |
| PCS-R24 | The selected object is highlighted in amber on the canvas with the wall length, and selected walls show corner handles (formerly F36) | Select a wall; it turns amber and shows its length |
| PCS-R25 | Items drag to a new place with mouse, pen or touch; a drag is one undo step (formerly F20) | Drag a sofa 400 mm; X changes by 400; Undo restores it |
| PCS-R26 | Arrow keys nudge the selected item by the grid step, Shift by ten steps (formerly F22) | Select an item, press ArrowRight; X grows by the grid step |
| PCS-R27 | Wall corners drag to a new place; dropping on another corner merges them and dropping on a wall connects to it, leaving no zero-length or duplicate walls (formerly F21) | Drag a corner onto another corner; one corner remains |
| PCS-R28 | R rotates the selected item by 90°, and its rotation can also be typed in degrees; with nothing applicable no undo step is added (formerly F16) | Select an item, press R; rotation reads 90 |
| PCS-R29 | Duplicate (button or Ctrl/Cmd+D) copies the selected item beside the original (formerly F23) | Select an item and press Ctrl+D; the Items count grows by one |
| PCS-R30 | Delete or Backspace removes the selected wall, opening, item or dimension and is one undo step; with nothing selected it changes nothing (formerly F16) | Select a wall, press Delete; the wall is gone and Undo brings it back |
| PCS-R31 | Mirror flips the selected item left to right | Select a toilet and press Mirror; the fixture and its clearance flip |

### Properties panel

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PCS-R32 | A selected wall shows its length (changing it moves the end corner along the wall) and thickness | Select a wall, set Thickness to 200; it changes and Undo restores 150 |
| PCS-R33 | A selected wall also sets height, status (existing, new construction, to be demolished), material and a load-bearing hatch | Set the status to To be demolished; the wall is drawn with the demolition style |
| PCS-R34 | A selected door or window shows width, centre position along the wall, height and (windows) sill height | Set a door width to 1000; the opening widens, clamped to the wall |
| PCS-R35 | A selected item shows X and Y position, its size and the clear space it needs | Select a sofa; X and Y are editable and the clear space reads 450 mm in front |
| PCS-R36 | Numeric fields keep a draft while typing and commit on Enter or blur; Escape or unreadable input restores the value; each commit is one undo step (formerly F05) | Clear Thickness and press Tab; it returns to 150; type 200 and Enter; one Undo returns to 150 |
| PCS-R37 | Project name and author commit on blur or Enter as one undo step (formerly F06); the author appears on the PDF title block | Rename the plan; one Undo restores the old name |
| PCS-R38 | Drawing scale is chosen from 1:20, 1:50, 1:100 and 1/4" = 1'-0" | Open Drawing scale; four options; choose 1:50 |
| PCS-R39 | Units switch between millimeters and feet-and-inches for readouts, inputs, dimension labels and exports; lengths parse the forms people type, such as 8'6" (formerly F25) | Switch Units to Feet and inches; a 6 ft wall reads 6'-0" and 8'6" is accepted |
| PCS-R40 | The Layer stack lists walls, doors, windows, furniture, MEP, clearance and dimensions with a visibility checkbox each | Untick FURNITURE; furniture disappears from the canvas |
| PCS-R41 | Start a new plan clears the drawing, keeps the units and view, and can be undone (formerly F33) | Press Start a new plan; counts read 0; Undo restores the plan |

### Rooms, areas and clearance checks

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PCS-R42 | Rooms are detected wherever walls enclose a space and show area, perimeter and centre; the summary shows wall, room, opening and item counts and total floor area | Draw a 4 m × 3 m rectangle; one room of 12 m² is listed |
| PCS-R43 | Rooms can be named in the Rooms list; names stay with the room and appear on the canvas and in exports (formerly F24) | Rename Room 1 to Kitchen; the canvas and SVG show Kitchen |
| PCS-R44 | Two items on the same floor area, and an item running into a wall, are reported as collisions; a sofa against a wall or a nightstand beside a bed is not (formerly F10) | Place two sofas on top of each other; a collision is listed |
| PCS-R45 | Furniture placed in the access zone in front of another item is reported, and chairs may sit in a dining table's zone | Put a sofa 200 mm in front of a wardrobe; access is reported; a chair at a dining table is not |
| PCS-R46 | A toilet is checked against the 2010 ADA 60" × 56" water-closet clearance (604.3.1), also for plans saved with the older envelope (formerly F11) | Place a toilet near a wall; the ADA clearance zone is checked |
| PCS-R47 | An obstructed ADA 60" turning space is reported | Drop a bed in a turning circle; a warning names it |
| PCS-R48 | Electrical and mechanical devices never raise collision warnings | Put an outlet on a wall; nothing is reported |
| PCS-R49 | Each clearance finding is a button that selects the item concerned, and the panel counts the findings | Click a finding; the item is selected |
| PCS-R50 | Rooms, snap targets and clearance findings are computed off the main thread by a worker, with an identical main-thread pass when the worker is slow or fails; the workspace reports whether the analysis is current | Draw a room; data-analysis-state becomes current |
| PCS-R51 | The workspace states that clearance and ADA indicators are planning aids and not code-compliance certification | The disclaimer text is visible |
| PCS-R52 | Door approach clearance (ADA door maneuvering space) is checked at each door | A door with a wall or item inside its approach space raises a warning |

### View and navigation

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PCS-R53 | The mouse wheel zooms about the pointer without scrolling the page; trackpad pinch zooms with a stronger response, within a clamped zoom range (formerly F03) | Scroll over the plan; the zoom readout changes and the page does not scroll |
| PCS-R54 | The view pans by Space with drag (only while the pointer is over the plan), by dragging empty space, and by one-finger drag on touch; Space elsewhere still presses buttons and scrolls (formerly F12) | Focus a button and press Space; it activates |
| PCS-R55 | On touch, a tap acts on release, a drag pans, a two-finger gesture pans and pinch-zooms, and an interrupted gesture leaves the canvas usable (formerly F15) | Drag with one finger; the view pans without selecting; tap; it selects |
| PCS-R56 | On-screen Pan, Zoom in, Zoom out and Fit buttons with 44 px targets work without a wheel or keys | At 320 px wide, Zoom view in raises the scale and Pan view left shifts the view |
| PCS-R57 | Fit to drawing (button or 0) frames all walls, items and dimensions, and an empty plan returns to the start view (formerly F34) | Draw far apart items, press 0; all are visible |
| PCS-R58 | The + and − keys zoom, arrow keys pan when the plan has focus, and letter shortcuts are ignored while a modifier is held or a field has focus (formerly F13) | Press Ctrl+R; the plan does not rotate |
| PCS-R59 | Undo and Redo (buttons, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl+Y) step through up to 100 edits; a new edit clears Redo; undoing while drawing clears the rubber-band line (formerly F14) | Place an item, Undo removes it, Redo restores it |
| PCS-R60 | The status bar and hints give plain-language guidance for the active tool, with pointer hints on desktop and touch hints on phones (formerly F30) | Pick each tool; the status line describes it |

### Export and backup

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PCS-R61 | Exports a layered SVG with a white sheet, room and item labels, door swings and dimensions, with bounds that contain wide door swings and dimension labels (formerly F35) | Export SVG; it opens with a white background and all populated layers |
| PCS-R62 | Exports DXF R12 and R2000 with version-correct vocabulary, one layer per populated plan layer and wall lines cut at openings | Export DXF R12 and R2000; each loads in a CAD program with walls broken at doors |
| PCS-R63 | The DXF R2000 file carries the full section, table and handle structure a strict reader needs, with units set to millimeters (formerly F01) | A strict reader opens the R2000 file with no errors |
| PCS-R64 | DXF plans appear the same way up as on the canvas (formerly F02) | A wall drawn downward on screen runs downward in the CAD program |
| PCS-R65 | Doors are drawn with swing arcs in SVG, PDF and DXF (formerly F27) | Each export shows the door leaf arc |
| PCS-R66 | Room names and areas, item labels and dimensions are written in SVG and DXF in the chosen display units (formerly F28) | Export in feet-and-inches; labels read in feet and inches |
| PCS-R67 | Exports can be limited to chosen layers | Choose only WALLS and DOORS for the export; the file holds only those |
| PCS-R68 | Exports a one-page PDF on Letter, A4 or Arch sheets with a title block, fitted to the page and labelled as fitted | Export PDF with Fit to page on Letter; a one-page PDF named untitled-plan-letter.pdf downloads |
| PCS-R69 | The PDF can be placed at the drawing scale (for example 1:50); when the plan does not fit the sheet at that scale, the status bar says so instead of failing silently (formerly F04) | Choose a 20 m wall on Letter at drawing scale; the status bar says the plan is larger than the sheet |
| PCS-R70 | Backup JSON downloads the whole plan as a readable file without loss | Back up and restore; the plan is identical |
| PCS-R71 | Restore JSON opens a backup as one undoable step and fits the view; a malformed file is refused with a plain message naming the problem, and fields an older backup lacks are filled with defaults (formerly F17) | Restore a broken file; the message names what is wrong; restore an older file; it opens |
| PCS-R72 | The drawing autosaves in this browser every two seconds and is restored after a reload | Draw a wall, wait, reload; the wall count is 1 |
| PCS-R73 | After the first export in a visit the site's support prompt is offered once, and a support link is shown in the export bar | Export twice; the prompt is requested once |

### Page, privacy and non-functional

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| PCS-R74 | The catalog link, the `#/floorplan-studio` alias and the generic tool route open the same workspace | Open each address; the workspace shows |
| PCS-R75 | The browser tab title and description name the tool while it is open and are restored after leaving (formerly F32) | Open the tool; the tab reads PlanCraft Studio; return to the home page; it does not |
| PCS-R76 | The plan, its autosave and every export stay in this browser and the workspace shows a local-privacy status; nothing is uploaded | The privacy status mentions local or browser storage; no network request carries plan data |
| PCS-R77 | On narrow screens the drafting tools sit above the drawing and the page has no horizontal overflow (formerly F31) | At 390 px wide the tools end above the canvas |
| PCS-R78 | Existing walls, items and grid are drawn with at least 3:1 contrast against the canvas (formerly F37) | Measure the wall stroke against the canvas background; the ratio is 3:1 or higher |
| PCS-R79 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) and passes the colour-contrast check in dark | With the theme set to Light the workspace is light; in Dark the axe color-contrast rule reports nothing |
| PCS-R80 | Layout has no horizontal overflow from 320 to 2560 px, and viewport controls do not cover the canvas on narrow or short screens | Resize from 320 to 2560 px; the page never scrolls sideways |
| PCS-R81 | No serious or critical axe violations in the workspace | Run axe on the tool route |
| PCS-R82 | The drawing area is keyboard focusable with a label that explains the tools and arrow-key movement, and the status line is a polite live region | Tab to the drawing area; a screen reader announces the label; a tool change is announced |

## Non-functional requirements

Responsive layout, theme, accessibility and privacy are the rows under the last requirements subheading above.

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Technique decisions

None. No requirement compares a machine-learning and a non-ML method.

## Intent not recorded

- PCS-R79: whether the workspace canvas keeps a dark drafting surface in the light theme or follows the theme completely is not settled; owner may override.

## Change log

- 2026-10-05: Created: 82 requirements as built at `c371f847`.

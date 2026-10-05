---
tool: tactical-matchboard-studio
folder: src/tools/tactics
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-tactical-matchboard-studio-design.md
tracker: src/tools/tactics/TRACKER.md
updated: 2026-10-05
---

# Tactical Matchboard Studio — spec

As built at `d89700d1` (last code change under `src/tools/tactics/`). Requirement prefix: `TMS`. Status of each requirement: [TRACKER.md](../../../src/tools/tactics/TRACKER.md). History: [2026-09-21 design](2026-09-21-tactical-matchboard-studio-design.md), [2026-09-02 ethical support addendum](2026-09-02-tactical-ethical-support-addendum.md), [FEATURE_MATRIX.md](../../../src/tools/tactics/FEATURE_MATRIX.md) (rows 1–67, cited below as "formerly <n>"), [HANDOFF.md](../../../src/tools/tactics/HANDOFF.md), [TODO_SEQUENCE.md](../../../src/tools/tactics/TODO_SEQUENCE.md), [plan](../plans/2026-09-21-tactical-matchboard-studio.md). Owner input: [owner feature notes 2026-10-05](../../research/owner-feature-notes-2026-10-05.md#tactical-matchboard-studio-tactical-animation--matchboard-studio).

## Purpose

Let coaches, from grassroots to professional level, set up a pitch and squad, author formations, restarts and animated tactical sequences, analyse their geometry, review local match video and publish boards, PDFs and videos, entirely in the browser.

## Scope

In scope:
- Pitch and rules profiles from 1v1 training formats to 11v11 IFAB and futsal, squads, formations, restarts and training equipment.
- Keyframed multi-track timeline, Bézier motion, scenes, coordinated actions, linked units and possession.
- Geometric analysis (Voronoi, hull, passing lanes, vision sectors, grids, rings, occupancy, authored speed).
- Synchronized 3D view, presentation marks, scenarios, session plans and local video review.
- Local project vault, JSON/ZIP/CSV interchange and SVG, raster, PDF, HTML and video export.

Out of scope:
- Automatic computer-vision tracking or GPS data feeds: analysis and tracking use authored or imported samples only (2026-09-21 design, "Spatial-analysis honesty").

## Constraints

- Platform rules: no accounts or authentication; no server, backend or server-side database (static GitHub Pages); everything runs in the browser and project data stays in this browser (IndexedDB via Dexie, downloads); network use is limited to the site's own files ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- No large language models; other ML only under the ML ruleset (none is used).
- Canonical positions are normalized `[0,1]` pitch coordinates; physical dimensions are stored separately; time is integer milliseconds.
- Libraries stay as pinned in `package.json`: Three.js (3D), pdf-lib 1.17.1 (PDF, standard WinAnsi fonts), MediaBunny (video), JSZip (`web-layout-zip`), Dexie.
- Video export is offered only for combinations the browser's WebCodecs encoder confirms.
- Rulesets carry provenance; validators are authoring aids, not officiating decisions.

## Requirements

### Pitch, rules and squad

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TMS-R01 | Versioned pitch and ruleset profiles from 1v1 to 11v11 training tiers plus sourced IFAB 11v11, FIFA futsal and U.S. Soccer 7v7 profiles, with provenance, editable forks and custom profiles (formerly 1) | Apply each profile; dimensions and provenance show; a sourced profile can be forked and edited |
| TMS-R02 | Special-line and restart overlays: IFAB goal/penalty/corner geometry, futsal marks and substitution zones, U.S. Soccer build-out lines with the retreat note, custom build-out overlays and restart-distance review (formerly 2) | Apply the 7v7 profile; build-out lines draw; restart review reports opponent distance |
| TMS-R03 | Squad scaling for any format, active and substitute counts, neutral players (jokers) and coaches kept out of the active count, growth to the 64-player Pages-safe roster ceiling (formerly 3) | Grow a 7-player board to 24 and back without losing roster players; a 65th player is refused |
| TMS-R04 | Every player, ball, equipment and official position is stored in normalized `[0,1]` coordinates and shown with derived metres (formerly 4) | Enter 30 m by 20 m on a 60 m by 40 m pitch; the inspector shows 0.5, 0.5 |
| TMS-R05 | Token editor for jersey, role, kit colours, status, developmental (age) tag and local avatar (formerly 5) | Edit each field; invalid colours and missing avatars are refused |
| TMS-R06 | Authored ball elevation keyframes on the ball track draw a trajectory independent of the resting elevation (formerly 6) | Author 0 m to 8 m; the board draws the elevated path |
| TMS-R07 | A ball loft preset (ground, driven, lofted, chipped) computes the flight arc between two points from launch angle and distance | Choose "lofted" between two points; elevation keyframes follow a parabolic arc |
| TMS-R08 | Training equipment library: cones, flat markers, poles, hurdles, agility ladders, mannequins, mini goals and rings, with rotation, scale and position transforms (formerly 7) | Place a cone and transform it; it stays inside the pitch |
| TMS-R09 | Optional snapping to grid, halfway and channel guides, teammate alignment and equal spacing (formerly 8) | Enable snapping; a move lands on the nearest guide; off by default |
| TMS-R10 | Fitted training pitch markings (penalty and goal areas, marks, goals, centre circle, corner arcs) scaled to the pitch size (formerly 62) | A 105 m by 68 m pitch keeps a 16.5 m box; a small pitch scales it inside the pitch |

### Formations and restarts

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TMS-R11 | Small-sided formation library (3v3, 4v4, 5v5) and custom formations of any size (formerly 9) | Apply a 4v4 starter; counts match the team size |
| TMS-R12 | 7v7 and 9v9 developmental formations labelled as U.S. Soccer examples, plus custom alternatives (formerly 10) | Apply a 7v7 example; its provenance says recommendation |
| TMS-R13 | 11v11 formation library (1-4-3-3, 1-4-2-3-1, 1-3-5-2, 1-4-4-2, 1-5-3-2, 1-3-4-3, 1-4-1-4-1) (formerly 11) | Build each 11v11 formation; 11 players are placed |
| TMS-R14 | Phase-of-play formation states captured and morphed by deterministic interpolation (formerly 12) | Capture two phases; morphing moves players between them |
| TMS-R15 | Mirror, horizontal and vertical flip and direction-of-play swap of the whole project (formerly 13) | Flip; players, ball, overlays and keyframes mirror |
| TMS-R16 | Formation count and restart legality validator as an authoring aid (formerly 14) | Wrong goalkeeper count or duplicate roster assignment is reported |
| TMS-R17 | Set-piece and restart templates with provenance plus custom ball and guide authoring (formerly 15) | Apply a corner starter; layers update without mutating the prior project |
| TMS-R18 | Opposition with a separately chosen formation placed in the other half, distinct kit colours, refit without duplicates (formerly 61) | On a 4v4 board place a 7v7 opposition; a second place refits |
| TMS-R19 | Build board asks for confirmation before replacing the board and clearing undo (formerly 66) | Cancel keeps players and undo history |

### Board editing

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TMS-R20 | Players are placed and moved by click or tap, D-pad buttons, arrow-key nudges and exact numeric coordinates, without dragging | Select a player, tap the pitch, nudge, type coordinates; the position updates each time |
| TMS-R21 | Arrows and annotations are drawn on the board and respect layer locks | Draw an arrow; on a locked layer it is refused |
| TMS-R22 | The selected player, ball or drawing is marked; the ball moves by click; a drawing is removed by button, Delete or Backspace (formerly 63) | Remove a drawing; players stay; Backspace in a text field is unchanged |
| TMS-R23 | Pitch zoom 1–4 in 0.25 steps with clamped pan, reset and drag-to-pan (formerly 64) | Zoom in, pan, reset; clicks still write normalized coordinates |
| TMS-R24 | Freehand strokes on the board by dragging or by Add point / Save freehand (formerly 65) | Save a two-point stroke; a one-point stroke is refused |
| TMS-R25 | Layers with selection, grouping onto a named layer, reorder, solo, focus, show/hide and lock (formerly 55) | Group players onto a layer, reorder, solo and lock it |
| TMS-R26 | Bounded undo/redo, named snapshots and crash-safe autosave with recovery after reload (formerly 56) | Reload after an edit; recovery restores it |

### Timeline and motion

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TMS-R27 | Multi-track timeline with integer-millisecond keyframes, frame-accurate scrubber, frame step, previous/next keyframe, frame rate, speed, loop, play/pause/stop (formerly 16) | Author two keyframes; scrub and step land on exact times |
| TMS-R28 | Bézier motion paths with draggable and keyboard-adjustable nodes and tangent handles (formerly 17) | Drag a handle and move it with arrow keys; the path curves |
| TMS-R29 | Easing per segment: linear, smooth, ease-in, ease-out, ease-in-out, hold and custom cubic-bezier (formerly 18) | Set a custom cubic-bezier; sampling follows it |
| TMS-R30 | Multi-scene sequencing: create, duplicate, rename, reorder, split and join scenes (formerly 19) | Split a scene, rename and reorder; authored motion is kept |
| TMS-R31 | Chapter transitions between scenes (cut, fade or morph with a duration) play in preview and export | Set a 500 ms fade between two scenes; preview and export show it |
| TMS-R32 | Per-object and per-layer visibility spans over time (formerly 20) | Hide a layer from 1 s; players reappear before 1 s and stay in the project |
| TMS-R33 | Timed substitutions: at an authored time a substitute comes on and a player goes off | Author a substitution at 2 s; the board swaps the players at 2 s |
| TMS-R34 | Track offsets, grouped timing and ordered stagger for selected targets (formerly 21) | Stagger three players by 200 ms; their tracks shift in order |
| TMS-R35 | Typed timeline markers and coaching triggers (pass, press, line-break, switch, shot, transition, coaching cue) (formerly 22) | Add a press marker; it appears on the timeline |
| TMS-R36 | Timeline shows at most 40 track rows at a time with Previous/Next tracks; session cap 2,048 tracks (formerly 67) | A 2,049th track is refused on add and on import |

### Coordinated play

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TMS-R37 | Named action presets (overlap, underlap, third-player run, wall pass, switch, give-and-go, decoy, press, recovery) mapped to timeline motion and editable (formerly 23) | Apply an overlap to two players; one track per player is created |
| TMS-R38 | Linked defensive, midfield and attacking units with line shift, step, drop, width and depth controls (formerly 24) | Shift a back four 5 m; spacing is kept |
| TMS-R39 | Ball possession, handoff and release events attach the ball to the moving holder (formerly 25) | Author a handoff; the ball follows the new holder |
| TMS-R40 | Path-conflict indicator for authored paths that come within a set distance (formerly 26) | Two crossing paths are flagged; distant paths are not |

### Spatial analysis

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TMS-R41 | Voronoi territory in physical metres clipped to the pitch (formerly 27) | Turn on Voronoi; one cell per player is drawn |
| TMS-R42 | Team convex hull with centroid, width, depth, area and perimeter, goalkeeper optional (formerly 28) | Turn on the hull; the summary lists area in m² |
| TMS-R43 | Passing-lane clearance from the nearest defender, in metres, without probability (formerly 29) | Select a lane; clearance and blocked/open are shown |
| TMS-R44 | Interception cones show the area each defender can reach across a selected passing lane | Select a lane; each defender's cone is drawn and labelled in metres |
| TMS-R45 | Authored player orientation drives a vision sector of configurable angle and range (default 90°, 120° settable) (formerly 30) | Set 120° and 20 m; the sector draws at the player's rotation |
| TMS-R46 | Positional play grid (default five channels with half-spaces and three rows, custom rows/columns) (formerly 31) | Turn on the grid; channels and thirds draw |
| TMS-R47 | Distance rings and player/ball tethers in metres with imperial display (formerly 32) | Tether two players; the distance shows |
| TMS-R48 | Occupancy heat map from authored motion samples (formerly 33) | Animate a player; heat cells follow the path |
| TMS-R49 | Distance, duration, average and maximum speed from authored or imported trajectories (formerly 34) | A 1,000 ms authored track reports speed over 1,000 ms |

### 3D presentation

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TMS-R50 | Lazy Three.js (WebGL) pitch view with markings, goals, players and ball elevation from the same project as 2D, rendered on demand (formerly 35) | Open 3D; players match the 2D board |
| TMS-R51 | Camera presets: tactical, broadcast, touchline, goal-line (formerly 36) | Choose each preset; the camera moves |
| TMS-R52 | First-person camera from a selected player's position and orientation | Choose a player's view; the camera sits at the player and faces their rotation |
| TMS-R53 | Camera keyframes captured at the playhead and interpolated (formerly 37) | Capture two cameras; playback moves between them |
| TMS-R54 | 2D edits drive the 3D view and 3D selection feeds the 2D inspector (formerly 38) | Move a player in 2D; 3D updates; click in 3D selects it |

### Presentation and coaching

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TMS-R55 | Time-ranged spotlight, presentation arrow and label marks (telestration on the board) (formerly 39) | Add a spotlight from 1–2 s; it shows only in that span |
| TMS-R56 | Onion-skin ghosts of previous and next positions around the playhead (formerly 40) | Record two positions; ghosts draw |
| TMS-R57 | Named scenarios captured and compared in pitch metres (formerly 41) | Capture two scenarios; the comparison lists movement |
| TMS-R58 | Coaching session and drill plan with structured fields and coaching cues, saved with the project (formerly 42) | Edit the session; it round-trips through a snapshot |

### Local video review

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TMS-R59 | Local MP4, WebM, Ogg and QuickTime review with millisecond seek, frame step and rate; unreadable files are reported (formerly 43) | Open a local file; step one frame; an invalid file shows an error |
| TMS-R60 | Video telestration (arrow, line, circle, text, freehand) on time ranges, outside undo history (formerly 44) | Draw on a range; scrubbing does not add undo steps |
| TMS-R61 | Manual overlay tracking from authored anchors with hold or linear timing (formerly 45) | Add two anchors; the overlay interpolates between them |
| TMS-R62 | Match event tags (goal, shot, chance, turnover, foul, set-piece, press, transition, note) seekable by time (formerly 46) | Tag a shot; selecting it seeks the video |
| TMS-R63 | Clip and playlist builder with ordered playback (formerly 47) | Add two clips and reorder; playback follows the order |
| TMS-R64 | Second-angle video synchronized from one manual anchor (formerly 48) | Set an anchor; seeking moves both videos |

### Projects and interchange

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TMS-R65 | Trajectory import and export as CSV/JSON with normalized or metre coordinates and provenance (formerly 49) | Round-trip a trajectory CSV; tracks match |
| TMS-R66 | Local project vault (save, list, load, remove), validated JSON, deterministic ZIP with assets, schema migration, corrupt imports leave the open project intact (formerly 60) | Export a ZIP twice; bytes match; a corrupt JSON import keeps the project |
| TMS-R67 | Imports with hostile ZIP sizes or entry counts, or track, keyframe or marker counts above the session bounds, are refused before they replace the project | Import an oversized ZIP; it is refused and the open project remains |
| TMS-R68 | Trajectory CSV export neutralizes spreadsheet formula prefixes | A keyframe event `=press` is not written as a formula; the imported event is unchanged |

### Export

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TMS-R69 | Export metadata (title, coach, club, age group, session type, theme, tags, rights, licence, language, notes) is edited, stored with the project and undoable | Save metadata; undo restores the previous title |
| TMS-R70 | Analytics CSV/JSON with per-track distance and speed and team geometry, each row stating it is a geometric measurement (formerly 50) | Download analytics JSON; rows carry the claim boundary |
| TMS-R71 | Client-side video export through WebCodecs and MediaBunny, offered only for encoder-confirmed MP4/WebM combinations, with frame-sequence ZIP fallback (formerly 57) | The first offered format downloads with MP4 or WebM magic bytes |
| TMS-R72 | Vector coaching PDF with contact sheet, packaged with a metadata sidecar (formerly 58) | Download the PDF ZIP; `coaching.pdf` contains vector pitch operators |
| TMS-R73 | PDF page text keeps non-ASCII characters instead of replacing them with `?` (formerly part of 58) | A note with "é" and "ß" appears unchanged in the PDF |
| TMS-R74 | Still export (SVG, PNG, JPEG, WebP after a write probe), social cards (square, portrait, story, landscape) and standalone HTML playback (formerly 59) | Download the board as SVG and PNG; the HTML plays without a remote script |
| TMS-R75 | OpenGraph social card export at 1200×630 for link previews | Export the OpenGraph card; the image is 1200×630 |

### Interaction, layout and accessibility

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TMS-R76 | Responsive workspace from phone portrait to large desktop, enlarged text and 1.5 zoom without page overflow, 44 px targets, pitch-first narrow sheets with focus return (formerly 51) | At 320–1920 px document overflow ≤1 px |
| TMS-R77 | Context menu on right-click with a Player actions button and Shift+F10 as touch and keyboard equivalents (formerly 52) | Right-click and the button lock the same player |
| TMS-R78 | Long-press on a player on touch opens a radial menu of the same player actions | Long-press a player on a touch device; the radial menu lists the actions |
| TMS-R79 | Help dialog and edge-aware tooltips that flip and clamp inside the viewport (formerly 53) | A tooltip near the bottom edge opens above its anchor |
| TMS-R80 | Keyboard shortcuts and transport (play, step, nudge) that ignore text fields; reduced motion steps instead of animating (formerly 54) | Typing in a field does not trigger shortcuts |
| TMS-R81 | No serious or critical axe violations in the workspace | axe on the route reports none |
| TMS-R82 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) and passes the colour-contrast check in dark | With Dark chosen, axe colour-contrast on the workspace passes |
| TMS-R83 | Works offline after the first visit (installed PWA precache) | Load once, go offline, reload; the workspace opens |
| TMS-R84 | Standalone playback and local video review pause while the tab is hidden; 3D rendering pauses while hidden | Hide the tab during playback; playback stops and does not resume by itself |
| TMS-R85 | A realistic 11v11 session samples, draws and analyses within the performance budget | The 11v11 audit session stays within its time budget |

## Non-functional requirements

Rows TMS-R76 to TMS-R85 above (layout, accessibility, theme, offline, hidden-tab behaviour, performance) and TMS-R67 (import bounds).

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Technique decisions

None: no function was compared between an ML and a non-ML method.

## Intent not recorded

- TMS-R73: Unicode PDF text needs a font embedder (`@pdf-lib/fontkit` or equivalent) that is not in `package.json`; adding a dependency is the owner's decision (HANDOFF residual).
- TMS-R31: which transition kinds count as "chapter transitions" (cut, fade, morph) is not recorded; owner may override.

## Change log

- 2026-10-05 — Created per `docs/DOCUMENTATION_STANDARD.md`. 85 requirements.

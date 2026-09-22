# Tactical Matchboard Studio Feature Matrix

**Deterministic denominator:** 60 accepted functional features
**Allowed states:** `planned` | `in-progress` | `implemented` | `verified` | `blocked` | `rejected`
**Verification rule:** UI presence alone is never verification. A row reaches `verified` only when its complete accepted behavior exists and the relevant unit/build/browser/accessibility/persistence/export evidence is recorded.
**Current verified count:** 0/60
**Current executable evidence:** source commit `163a63d78131e90762246e86f58803e87d9d4788` passes **23/23** focused tactical units and TypeScript with exit 0; its exact-commit Vite log records a successful production build in 55.63s and emits dedicated Tactical Matchboard JS/CSS chunks. Focused desktop/mobile browser, Axe and reflow evidence remain pending.

| ID | Feature | Status | Implementation surface | Validation evidence / limitation |
| ---: | --- | --- | --- | --- |
| 1 | Versioned Multi-Tier Pitch & Ruleset Matrix | in-progress | `tactics-types.ts`, `pitch-engine.ts` | Generic editable 1v1/2v2/3v3/4v4/5v5/7v7/9v9/11v11 profile foundation exists; sourced specialty presets and profile UI remain. |
| 2 | Grassroots Special-Line / Restart Overlay Engine | planned | — | — |
| 3 | Dynamic Squad & Neutral-Player Scaler | in-progress | `tactics-types.ts`, `editor-engine.ts` | Team/roster/token primitives support arbitrary roster growth; neutral/substitute/coach workflow and UI remain. |
| 4 | Normalized `[0,1]` Tactical Coordinate System | in-progress | `tactics-types.ts`, `pitch-engine.ts`, `tactics-engine.ts` | Normalization, metre conversion, transforms, and validation exist for current spatial entities; focused tactical units and production build are green, while the broader accepted coordinate/editing surface remains incomplete. |
| 5 | Roster, Jersey, Role & Developmental Token Editor | in-progress | `tactics-types.ts`, `editor-engine.ts` | Team/roster/player-token creation and scene/layer ownership exist; interactive editor, kit/status/avatar/development controls remain. |
| 6 | Authored Ball Elevation & Trajectory Layer | planned | — | — |
| 7 | Training Equipment & Prop Library | in-progress | `tactics-types.ts`, `editor-engine.ts` | Validated scene/layer equipment placement primitive exists; full sourced prop catalog and transform UI remain. |
| 8 | Precision Snapping & Tactical Guides | in-progress | `pitch-engine.ts` | Pure grid/guide snapping exists; board guides, teammate/equal-spacing assistance, and UI integration remain. |
| 9 | Small-Sided Formation Library | in-progress | `formation-engine.ts`, `workspace-engine.ts`, `TacticalMatchboardWorkspace.tsx` | Editable starter templates plus deterministic normalized starter placement exist for 3v3/4v4/5v5 and are selectable in the registered beginner workspace; custom authoring remains. |
| 10 | 7v7 & 9v9 Developmental Formation Library | in-progress | `formation-engine.ts`, `workspace-engine.ts`, `TacticalMatchboardWorkspace.tsx` | Provenance-bearing U.S. Soccer examples, deterministic mirrored starter placement, and formation selection exist in the registered workspace; alternative/custom authoring remains. |
| 11 | 11v11 Formation Library | in-progress | `formation-engine.ts`, `workspace-engine.ts`, `TacticalMatchboardWorkspace.tsx` | Required common 11v11 structures, count validation, deterministic starter placement, and formation selection exist in the registered workspace; custom authoring remains. |
| 12 | Phase-of-Play Formation Morphing | planned | — | — |
| 13 | Mirror, Flip & Direction-of-Play Transform | in-progress | `pitch-engine.ts` | Point-level horizontal/vertical transforms exist; whole-project/keyframe/vector transform remains. |
| 14 | Formation Count & Restart Legality Validator | in-progress | `formation-engine.ts` | Team-size/goalkeeper/notation invariants exist; roster assignment and sourced restart legality aids remain. |
| 15 | Set-Piece / Restart Template Builder | planned | — | — |
| 16 | Multi-Track Timeline & Deterministic Playhead | planned | — | — |
| 17 | Interactive Bézier Motion-Path Authoring | planned | — | — |
| 18 | Interpolation & Easing Studio | planned | — | — |
| 19 | Multi-Scene Sequencing | planned | — | — |
| 20 | Temporal Visibility Spans | planned | — | — |
| 21 | Stagger, Offset & Group Timing Controls | planned | — | — |
| 22 | Timeline Markers & Coaching Triggers | planned | — | — |
| 23 | Coordinated Tactical Action Templates | planned | — | — |
| 24 | Linked Defensive / Midfield / Attacking Units | planned | — | — |
| 25 | Ball Attachment, Possession & Handoff | planned | — | — |
| 26 | Potential Path-Conflict Indicator | planned | — | — |
| 27 | Geometric Voronoi Territory View | planned | — | — |
| 28 | Team Convex Hull & Compactness Geometry | planned | — | — |
| 29 | Geometric Passing-Lane Clearance | planned | — | — |
| 30 | Player Orientation & Authored Vision Sectors | planned | — | — |
| 31 | Positional Play Grid | planned | — | — |
| 32 | Distance Rings & Dynamic Tethers | planned | — | — |
| 33 | Trajectory Heat Map / Occupancy Map | planned | — | — |
| 34 | Authored-Trajectory Speed & Distance Metrics | planned | — | — |
| 35 | Synchronized Real-Time Three.js Pitch Projection | planned | — | — |
| 36 | Multi-Angle Camera Presets | planned | — | — |
| 37 | Camera Keyframing | planned | — | — |
| 38 | 2D/3D Synchronized Editing | planned | — | — |
| 39 | Presentation / Spotlight Telestration | planned | — | — |
| 40 | Onion-Skin / Ghost Positions | planned | — | — |
| 41 | Scenario Comparison View | planned | — | — |
| 42 | Coaching Session / Drill Plan | planned | — | — |
| 43 | Local Match-Video Import & Precision Review | planned | — | — |
| 44 | Video-Synchronized Telestration | planned | — | — |
| 45 | Manual / Interpolated Overlay Tracking | planned | — | — |
| 46 | Match Event Tagging | planned | — | — |
| 47 | Local Clip / Playlist Builder | planned | — | — |
| 48 | Multi-Angle Local Video Sync | planned | — | — |
| 49 | Open Tactical Trajectory Import | planned | — | — |
| 50 | Tactical Analytics CSV/JSON Export | planned | — | — |
| 51 | Device-Agnostic Responsive Workspace | in-progress | `TacticalBoard.tsx`, `TacticalMatchboardWorkspace.tsx`, `tactical-matchboard.css` | Pitch-first responsive grid, narrow single-column collapse, 44px+ command/player targets, and reduced-motion handling are authored; executable phone/tablet/laptop/reflow validation has not run. |
| 52 | Context Menu + Explicit Touch Equivalent | in-progress | `TacticalBoard.tsx`, `TacticalMatchboardWorkspace.tsx`, `workspace-engine.ts` | Pointer/touch click-to-place plus visible player buttons, D-pad movement, and numeric coordinates provide non-drag alternatives for the current movement workflow; future context-menu actions and their touch equivalents remain. |
| 53 | Collision-Protected Tooltips & Help Reference | planned | — | — |
| 54 | Keyboard Shortcut & Transport Engine | planned | — | — |
| 55 | Layers, Selection, Grouping, Locking & Visibility | in-progress | `tactics-types.ts`, `editor-engine.ts`, `TacticalBoard.tsx`, `TacticalMatchboardWorkspace.tsx` | Scene/layer ownership plus lock/visibility primitives exist and the beginner workspace has explicit player selection; grouping, layer reorder, solo/focus and full layer UI remain. |
| 56 | Undo/Redo, Snapshots & Crash-Safe Autosave | in-progress | `editor-engine.ts`, `TacticalMatchboardWorkspace.tsx` | Immutable undo/redo history is bounded at 100 snapshots and exposed in the registered workspace; autosave, named/recovery snapshots, persistence and crash recovery remain. |
| 57 | Capability-Negotiated Local Video Export | planned | — | — |
| 58 | Vector-First Coaching PDF / Contact-Sheet Publisher | planned | — | — |
| 59 | Still, Social-Card & Standalone Playback Export | in-progress | `board-engine.ts`, `TacticalMatchboardWorkspace.tsx` | Deterministic accessible SVG serialization plus a real local SVG download action exist with escaped text, physical pitch aspect ratio, scene/layer filtering, players, equipment and annotations; raster/social/standalone HTML paths remain. |
| 60 | Deterministic Project Vault / ZIP / Schema Migration | planned | — | — |

## Evidence policy

A pure engine feature may be verified by exhaustive deterministic unit/invariant coverage plus a green production build when no browser interaction is part of its accepted behavior. Any feature with user interaction, responsive, accessibility, persistence, import/export, local media, or presentation behavior additionally requires the corresponding browser/runtime evidence.

The numerator in human-facing reports is the count of rows in state `verified`, never the number of files, controls, partial subparts, or tests.

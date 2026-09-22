# Tactical Matchboard Studio Feature Matrix

**Deterministic denominator:** 60 accepted functional features
**Allowed states:** `planned` | `in-progress` | `implemented` | `verified` | `blocked` | `rejected`
**Verification rule:** UI presence alone is never verification. A row reaches `verified` only when its complete accepted behavior exists and the relevant unit/build/browser/accessibility/persistence/export evidence is recorded.
**Current verified count:** 5/60
**Current executable evidence:** Task 4 source commit `a8ee9f46` passes **29/29** focused tactical engine tests, **3/3** focused selector tests, a TypeScript-checked production/PWA build, and **16 browser scenarios** with **2 intentional duplicate-project skips** across desktop/mobile Chromium. The browser gate covers the pre-existing beginner workflow plus rules/profile application, specialty overlays, custom formation and restart authoring, phase capture/morphing, full-board mirroring, Axe, five CSS-width viewport classes, document overflow, and essential 44px target checks.

| ID | Feature | Status | Implementation surface | Validation evidence / limitation |
| ---: | --- | --- | --- | --- |
| 1 | Versioned Multi-Tier Pitch & Ruleset Matrix | in-progress | `tactics-types.ts`, `pitch-engine.ts`, `rules-engine.ts`, `TacticalMatchboardWorkspace.tsx` | Generic editable 1v1/2v2/3v3/4v4/5v5/7v7/9v9/11v11 profiles, a current IFAB 2026/27 international profile, an explicitly dated FIFA futsal reference, custom profile authoring, provenance presentation, and profile application exist. Editable forking of sourced profiles and current primary-source coverage for every claimed specialty tier remain. |
| 2 | Grassroots Special-Line / Restart Overlay Engine | in-progress | `rules-engine.ts`, `TacticalBoard.tsx`, `TacticalMatchboardWorkspace.tsx` | Profile-driven IFAB penalty/halfway overlays and editable custom build-out lines render deterministically with provenance. A complete source-backed grassroots line/restart matrix and corresponding legality checks remain. |
| 3 | Dynamic Squad & Neutral-Player Scaler | in-progress | `tactics-types.ts`, `editor-engine.ts` | Team/roster/token primitives support arbitrary roster growth; neutral/substitute/coach workflow and UI remain. |
| 4 | Normalized `[0,1]` Tactical Coordinate System | in-progress | `tactics-types.ts`, `pitch-engine.ts`, `tactics-engine.ts` | Normalization, metre conversion, transforms, and validation exist for current spatial entities; focused tactical units and production build are green, while the broader accepted coordinate/editing surface remains incomplete. |
| 5 | Roster, Jersey, Role & Developmental Token Editor | in-progress | `tactics-types.ts`, `editor-engine.ts` | Team/roster/player-token creation and scene/layer ownership exist; interactive editor, kit/status/avatar/development controls remain. |
| 6 | Authored Ball Elevation & Trajectory Layer | planned | — | — |
| 7 | Training Equipment & Prop Library | in-progress | `tactics-types.ts`, `editor-engine.ts` | Validated scene/layer equipment placement primitive exists; full sourced prop catalog and transform UI remain. |
| 8 | Precision Snapping & Tactical Guides | in-progress | `pitch-engine.ts` | Pure grid/guide snapping exists; board guides, teammate/equal-spacing assistance, and UI integration remain. |
| 9 | Small-Sided Formation Library | verified | `formation-engine.ts`, `workspace-engine.ts`, `TacticalMatchboardWorkspace.tsx` | 3v3/4v4/5v5 starters, arbitrary-size custom formation authoring, deterministic normalized placement, count invariants, responsive UI, unit tests, build, and desktop/mobile workflow evidence are green at `a8ee9f46`. |
| 10 | 7v7 & 9v9 Developmental Formation Library | verified | `formation-engine.ts`, `workspace-engine.ts`, `TacticalMatchboardWorkspace.tsx` | Provenance-bearing U.S. Soccer examples, deterministic placement, custom alternatives, invariant tests, build, and desktop/mobile workflow evidence are green at `a8ee9f46`. |
| 11 | 11v11 Formation Library | verified | `formation-engine.ts`, `workspace-engine.ts`, `TacticalMatchboardWorkspace.tsx` | Common 11v11 structures, source-honest labels, deterministic placement, custom alternatives, count tests, build, and browser evidence are green at `a8ee9f46`. |
| 12 | Phase-of-Play Formation Morphing | verified | `formation-engine.ts`, `TacticalMatchboardWorkspace.tsx` | Immutable phase capture and deterministic normalized interpolation are covered by boundary/invariant units and an end-to-end two-phase authoring/morph workflow at `a8ee9f46`. |
| 13 | Mirror, Flip & Direction-of-Play Transform | implemented | `pitch-engine.ts`, `TacticalMatchboardWorkspace.tsx` | Whole-project transforms now cover pitch overlays, players, officials, equipment, scenes, formation states, ball, annotations, timeline keyframes, rotations, and horizontal direction. Horizontal unit/browser proof is green; a focused whole-project vertical assertion remains before verification. |
| 14 | Formation Count & Restart Legality Validator | in-progress | `formation-engine.ts`, `restart-engine.ts`, `TacticalMatchboardWorkspace.tsx` | Formation totals, goalkeeper count, placed-player count, unique roster assignment, and rules-profile agreement are surfaced as explicitly non-officiating authoring aids. Source-backed restart-specific checks remain. |
| 15 | Set-Piece / Restart Template Builder | verified | `restart-engine.ts`, `TacticalMatchboardWorkspace.tsx` | Provenance-bearing non-authoritative starters plus validated custom ball/guide authoring apply immutably to editable layers; units and desktop/mobile end-to-end author/apply evidence are green at `a8ee9f46`. |
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
| 51 | Device-Agnostic Responsive Workspace | in-progress | `TacticalBoard.tsx`, `TacticalMatchboardWorkspace.tsx`, `tactical-matchboard.css`, `tests/e2e/tactical-matchboard-studio.spec.ts` | The beginner slice passes phone portrait/landscape, tablet, laptop and desktop reflow plus 44px target checks; later timeline, analysis, media, 3D and export surfaces must join the same responsive contract before the whole feature is verified. |
| 52 | Context Menu + Explicit Touch Equivalent | in-progress | `TacticalBoard.tsx`, `TacticalMatchboardWorkspace.tsx`, `workspace-engine.ts`, `tests/e2e/tactical-matchboard-studio.spec.ts` | Pointer/touch click-to-place plus keyboard-reachable player buttons, D-pad movement, and numeric coordinates have desktop/mobile evidence for the current workflow; future context-menu actions and their touch equivalents remain. |
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

# Tactical Matchboard Studio Feature Matrix

**Deterministic denominator:** 60 accepted functional features
**Allowed states:** `planned` | `in-progress` | `implemented` | `verified` | `blocked` | `rejected`
**Verification rule:** UI presence alone is never verification. A row reaches `verified` only when its complete accepted behavior exists and the relevant unit/build/browser/accessibility/persistence/export evidence is recorded.
**Current verified count:** 15/60
**Current executable evidence:** Gauntlet corrected the prior blanket Task 5 promotion. Validated source through `feeafee9895f5c04bea650d8df7e402cef62e742`: production/PWA build and TypeScript are green; the Task 5 transport/easing/timing/conflict browser gate at `bdb28e4` is 26 passed / 2 intentional mobile duplicate-project skips; visible ball possession/handoff/release adds 2/2 desktop/mobile passes at `f4f4cde`; focused ball/possession units are 35/35; interactive trajectory handles add 2/2 desktop/mobile passes at `feeafee`. Rows 19, 20, 22, 23 and 24 remain open because their complete accepted semantics are not yet implemented.

| ID | Feature | Status | Implementation surface | Validation evidence / limitation |
| ---: | --- | --- | --- | --- |
| 1 | Versioned Multi-Tier Pitch & Ruleset Matrix | verified | `tactics-types.ts`, `pitch-engine.ts`, `rules-engine.ts`, `TacticalMatchboardWorkspace.tsx` | Generic editable training tiers plus current sourced IFAB 2026/27, FIFA Futsal 2025-26, and U.S. Soccer PDI 7v7 profiles support provenance display, immutable application, editable sourced-profile forks, custom local profiles, physical dimension ranges, deterministic specialty overlays, unit invariants, build, and desktop/mobile workflow evidence at `b2ec46e`. |
| 2 | Grassroots Special-Line / Restart Overlay Engine | verified | `rules-engine.ts`, `restart-engine.ts`, `TacticalBoard.tsx`, `TacticalMatchboardWorkspace.tsx` | Source-backed overlays now cover IFAB goal/penalty/corner geometry, FIFA futsal six-metre penalty areas, 6m/10m marks and substitution-zone markers, U.S. Soccer 7v7 build-out lines, plus editable custom build-out overlays and sourced restart-placement/distance review. Physical-coordinate units, build, and desktop/mobile rendering/workflow evidence are green at `b2ec46e`. |
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
| 13 | Mirror, Flip & Direction-of-Play Transform | verified | `pitch-engine.ts`, `TacticalMatchboardWorkspace.tsx` | Whole-project horizontal and vertical transforms cover pitch overlays, players, officials, equipment, scenes, formation states, ball, annotations, timeline keyframes and rotations; horizontal direction is swapped only when appropriate. Focused horizontal/vertical invariants and desktop/mobile authoring evidence are green through `b2ec46e`. |
| 14 | Formation Count & Restart Legality Validator | verified | `formation-engine.ts`, `restart-engine.ts`, `TacticalMatchboardWorkspace.tsx` | Formation totals, goalkeeper/placed-player counts, unique roster assignment and profile agreement combine with sourced IFAB/U.S. Soccer restart placement and opponent-distance review. Results remain explicitly non-officiating authoring aids; unit invariants plus desktop/mobile UI evidence are green through `b2ec46e`. |
| 15 | Set-Piece / Restart Template Builder | verified | `restart-engine.ts`, `TacticalMatchboardWorkspace.tsx` | Provenance-bearing non-authoritative starters plus validated custom ball/guide authoring apply immutably to editable layers; units and desktop/mobile end-to-end author/apply evidence are green at `a8ee9f46`. |
| 16 | Multi-Track Timeline & Deterministic Playhead | verified | `timeline-engine.ts`, `TacticalTimelinePanel.tsx`, `TacticalMatchboardWorkspace.tsx`, timeline/e2e tests | Immutable multi-track/keyframe ownership, sampled project presentation, integer scrubber/playhead, previous/next keyframe, frame stepping, frame-rate selection, playback speed, loop, play/pause/stop, deterministic unit tests, build, and desktop/mobile browser preview are green through `bdb28e4`. |
| 17 | Interactive Bézier Motion-Path Authoring | verified | `motion-engine.ts`, `timeline-engine.ts`, `TacticalBezierPathEditor.tsx`, `TacticalTimelinePanel.tsx`, motion/e2e tests | Curved path math, numeric alternatives, focusable keyboard-adjustable trajectory nodes/tangent handles and pointer dragging are integrated. TypeScript, production/PWA build and 2/2 desktop/mobile browser checks are green through `feeafee`. |
| 18 | Interpolation & Easing Studio | verified | `timeline-engine.ts`, `TacticalTimelinePanel.tsx`, timeline/e2e tests | Linear, smooth, ease-in, ease-out, ease-in-out, hold, and custom cubic-bezier timing are validated deterministically; custom timing controls and desktop/mobile browser authoring are green through `bdb28e4`. |
| 19 | Multi-Scene Sequencing | in-progress | `scene-engine.ts`, `timeline-engine.ts`, `TacticalTimingControls.tsx`, scene/e2e tests | Scene creation/duplication and deterministic timing exist, but rename, reorder, split and join remain required by the accepted feature. |
| 20 | Temporal Visibility Spans | in-progress | `timeline-engine.ts`, `TacticalTimingControls.tsx`, timeline/e2e tests | Track visibility spans and target visibility authoring exist; complete object/layer visibility authoring remains open. |
| 21 | Stagger, Offset & Group Timing Controls | verified | `timeline-engine.ts`, `TacticalTimingControls.tsx`, timing/e2e tests | Whole-track offsets plus arbitrary selected-target grouped timing and ordered stagger are immutable, bounds-validated, unit-covered, and browser-verified across desktop/mobile through `bdb28e4`. |
| 22 | Timeline Markers & Coaching Triggers | in-progress | `timeline-engine.ts`, `TacticalTimelinePanel.tsx`, timeline/e2e tests | Timestamped markers are authored and sorted, but marker/trigger kinds are still hard-coded instead of exposing pass/press/line-break/switch/shot/transition/coaching-cue semantics. |
| 23 | Coordinated Tactical Action Templates | in-progress | `action-engine.ts`, `TacticalCoordinationControls.tsx`, action/e2e tests | Generic multi-role coordinated motion is implemented, but the accepted editable overlap/underlap/third-player/wall-pass/switch/give-and-go/decoy/press/recovery template library remains open. |
| 24 | Linked Defensive / Midfield / Attacking Units | in-progress | `unit-engine.ts`, `TacticalCoordinationControls.tsx`, unit/e2e tests | Linked membership and shared translation are implemented; explicit line-shift, step/drop and width/depth adjustment semantics remain open. |
| 25 | Ball Attachment, Possession & Handoff | verified | `possession-engine.ts`, `timeline-engine.ts`, `board-engine.ts`, `TacticalCoordinationControls.tsx`, possession/e2e tests | Authored possession/release/handoff events attach the sampled ball to moving holders without rewriting authored ball motion; the canonical ball is rendered/exported, 35/35 focused units and 2/2 desktop/mobile visible handoff checks pass through `f4f4cde`. |
| 26 | Potential Path-Conflict Indicator | verified | `conflict-engine.ts`, `TacticalCoordinationControls.tsx`, conflict/e2e tests | Sampled pairwise proximity uses physical pitch metres with configurable sample step/threshold and explicit non-predictive labeling; units plus desktop/mobile review presentation are green through `bdb28e4`. |
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

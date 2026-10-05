---
tool: tactical-matchboard-studio
folder: src/tools/tactics
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-tactical-matchboard-studio-design.md
tracker: src/tools/tactics/TRACKER.md
updated: 2026-10-05
---

# Tactical Matchboard Studio — tracker

## Resume here

85 requirements: 75 verified, 1 implemented, 3 partial, 6 missing. Next action: build TMS-R82 (site theme in dark), then TMS-R07, R31, R44, R52, R78. Blocker: TMS-R73 needs an owner decision on a font-embedder dependency.

## Documents

- Spec: [2026-10-05-tactical-matchboard-studio-design.md](../../../docs/superpowers/specs/2026-10-05-tactical-matchboard-studio-design.md)
- Older design: [2026-09-21-tactical-matchboard-studio-design.md](../../../docs/superpowers/specs/2026-09-21-tactical-matchboard-studio-design.md), [2026-09-02-tactical-ethical-support-addendum.md](../../../docs/superpowers/specs/2026-09-02-tactical-ethical-support-addendum.md)
- Plan: [2026-09-21-tactical-matchboard-studio.md](../../../docs/superpowers/plans/2026-09-21-tactical-matchboard-studio.md)
- Older tracking: [FEATURE_MATRIX.md](FEATURE_MATRIX.md), [HANDOFF.md](HANDOFF.md), [TODO_SEQUENCE.md](TODO_SEQUENCE.md)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/tactics-*.test.ts`; browser tests: `tests/e2e/tactical-matchboard-studio.spec.ts`

## Requirement status

`unit` = `tests/unit/tactics-*.test.ts`; `e2e` = `tests/e2e/tactical-matchboard-studio.spec.ts`.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| TMS-R01 | verified | unit "keeps governing pitch profiles provenance-bearing and custom profiles editable", "keeps generic training format profiles editable and non-authoritative"; e2e "authors rules, formations, transforms, legality aids, and restart starters" | |
| TMS-R02 | verified | unit "applies pitch profiles with deterministic normalized specialty overlays", "reviews sourced restart placement and opponent-distance constraints as authoring aids" | |
| TMS-R03 | verified | unit "grows and shrinks the active squad without deleting roster players or imposing a format cap", "allows growth past the formation size and stops at the Pages-safe roster ceiling", "authors neutral and coach participants and keeps them out of active scaling" | |
| TMS-R04 | verified | unit "authors canonical positions from normalized units or pitch metres and rejects pixels", "writes ball, equipment, and official positions through the same normalized surface" | |
| TMS-R05 | verified | unit "edits jersey, role, kit, developmental tag, and avatar without changing the session plan" | |
| TMS-R06 | verified | unit "stores elevation keyframes on the ball track and samples them independently of the resting ball elevation" | |
| TMS-R07 | missing | — | Elevation keyframes are entered by hand (TMS-R06); no loft preset or computed arc |
| TMS-R08 | verified | unit "places a sourced non-authoritative prop and transforms it inside normalized bounds" | |
| TMS-R09 | verified | unit "snaps to pitch guides, teammates, and equal spacing without moving a point outside range" | |
| TMS-R10 | verified | unit "fits full-size training markings on a 105 by 68 pitch and shrinks them on a small pitch", "draws fitted markings on a bare pitch and leaves sourced penalty diagrams unchanged" | |
| TMS-R11 | verified | unit "validates every built-in formation total and goalkeeper notation", "authors custom formations and reports assignment legality without claiming a governing decision" | |
| TMS-R12 | verified | unit "encodes the current U.S. Soccer development examples as recommendations, not mandates" | |
| TMS-R13 | verified | unit "validates every built-in formation total and goalkeeper notation"; e2e "builds a formation and supports click, D-pad, and exact player movement" | |
| TMS-R14 | verified | unit "captures and deterministically morphs editable formation phases" | |
| TMS-R15 | verified | unit "mirrors the complete authored board while preserving the prior project", "transforms spatial path control points with the whole tactical project" | |
| TMS-R16 | verified | unit "authors custom formations and reports assignment legality without claiming a governing decision" | |
| TMS-R17 | verified | unit "applies provenance-bearing restart templates without mutating the prior project" | |
| TMS-R18 | verified | unit "places a separately chosen opposition formation in the opposite half", "places one mirrored opposition in the opposite half and refits without duplicating it", "keeps opposition colors distinct and shifts authored motion with the squad" | |
| TMS-R19 | verified | e2e "asks before build board replaces the board" | |
| TMS-R20 | verified | e2e "builds a formation and supports click, D-pad, and exact player movement", "keyboard activation covers selection and precision movement without dragging", "touch pointer selection and movement use the same non-drag workflow" | |
| TMS-R21 | verified | unit "adds deterministic non-zero tactical arrows without id collisions", "adds validated equipment and annotations, and honors layer locking"; e2e "authors an arrow and supports undo and redo" | |
| TMS-R22 | verified | unit "marks only the selected player, ball, or drawing", "removes a selected drawing from the pitch or page background and ignores Backspace in a field"; e2e "places an opposition, moves the ball, and removes a selected drawing" | |
| TMS-R23 | verified | e2e "zooms and pans the tactical pitch" | |
| TMS-R24 | verified | unit "stores a freehand stroke and keeps zoom centered on the same pitch point"; e2e "places a different opposition formation and draws a freehand stroke" | |
| TMS-R25 | verified | unit "groups players onto a named layer and supports reorder, solo, focus, and lock"; e2e "groups, reorders, solos, and focuses scene layers" | |
| TMS-R26 | verified | unit "commits, undoes and redoes project edits with bounded history", "keeps undo and redo stacks inside the history limit"; e2e "preserves crash recovery across reload before starter autosave can overwrite it" | |
| TMS-R27 | verified | unit "samples a project presentation without mutating canonical state and steps transport deterministically", "clamps or wraps the integer playhead according to loop mode"; e2e "previews authored motion with deterministic timeline transport controls" | |
| TMS-R28 | verified | e2e "edits curved trajectory handles with keyboard and pointer input"; unit "samples quadratic and cubic Bézier geometry independently of timing easing" | |
| TMS-R29 | verified | unit "supports cubic-bezier interpolation with bounded deterministic output"; e2e "authors custom cubic-bezier timing easing for a motion segment" | |
| TMS-R30 | verified | e2e "splits, renames, and reorders non-overlapping tactical scenes"; unit "joins contiguous scenes without losing scene-owned players or authored motion" | |
| TMS-R31 | missing | — | Scenes play back to back; no transition between them |
| TMS-R32 | verified | unit "samples temporal visibility for layers and annotations without deleting canonical content"; e2e "temporally hides a scene layer without deleting its players" | |
| TMS-R33 | partial | unit "authors visibility for objects and scene layers without making them hidden before the authored time" | Players can be shown and hidden at a time and given substitute status; no substitution event that swaps an outgoing and incoming player |
| TMS-R34 | verified | unit "offsets a selected group with deterministic ordered stagger"; e2e "authors scene sequencing, visibility, offsets, and grouped stagger timing" | |
| TMS-R35 | verified | unit "supports the accepted marker and coaching-trigger vocabulary and rejects unknown kinds"; e2e "authors timeline markers and a curved player motion segment" | |
| TMS-R36 | verified | unit "virtualizes timeline rows inside the Pages-safe track cap"; e2e "shows a virtualized timeline track window and the session limit" | |
| TMS-R37 | verified | unit "offers the complete named coordinated-action preset library while keeping authored geometry editable", "materializes coordinated roles into one deterministic track per assigned target" | |
| TMS-R38 | verified | unit "applies explicit line-shift, step/drop, width, and depth linked-unit semantics", "moves every member by the same delta while preserving relative spacing" | |
| TMS-R39 | verified | unit "samples the ball at the current holder position and switches at a handoff"; e2e "renders authored ball possession, handoff, and release on the timeline preview" | |
| TMS-R40 | verified | unit "flags authored crossing paths using physical pitch distance", "does not flag paths that remain outside the authored proximity threshold" | |
| TMS-R41 | verified | unit "builds physical-Euclidean Voronoi territory clipped to the pitch" | |
| TMS-R42 | verified | unit "derives convex hull, centroid, width, depth, area and perimeter in physical units", "keeps the selected goalkeeper active when goalkeepers are excluded from team geometry" | |
| TMS-R43 | verified | unit "reports geometric passing-lane clearance without converting it into a probability" | |
| TMS-R44 | missing | — | Lane clearance uses a fixed defender radius (TMS-R43); no per-defender cone is drawn |
| TMS-R45 | verified | unit "builds authored orientation sectors using physical range and pitch dimensions" | |
| TMS-R46 | verified | unit "creates configurable positional-play grids without implying an official formation" | |
| TMS-R47 | verified | unit "creates physical distance rings and dynamic tethers" | |
| TMS-R48 | verified | unit "samples authored motion into an occupancy heat map" | |
| TMS-R49 | verified | unit "measures distance and speed from authored or imported trajectory samples", "measures selected authored trajectory only across its authored keyframe span"; e2e "derives occupancy and speed metrics only from authored trajectory samples" | |
| TMS-R50 | verified | unit "round-trips normalized pitch positions through metre-based Three.js world coordinates"; e2e "synchronizes the lazy 3D pitch, canonical player editing, and authored camera keyframes" | |
| TMS-R51 | verified | unit "falls back to a pitch-aware tactical camera when no authored camera exists"; e2e "synchronizes the lazy 3D pitch, canonical player editing, and authored camera keyframes" | |
| TMS-R52 | missing | — | Presets are tactical, broadcast, touchline and goal-line only |
| TMS-R53 | verified | unit "samples authored camera keyframes deterministically and replaces same-time keyframes", "reports invalid or ambiguous camera keyframes during project validation" | |
| TMS-R54 | verified | e2e "synchronizes the lazy 3D pitch, canonical player editing, and authored camera keyframes" | |
| TMS-R55 | verified | unit "authors time-ranged board marks that stay out of the video telestration document" | |
| TMS-R56 | verified | unit "returns previous and next authored positions for the playhead without changing the canonical token" | |
| TMS-R57 | verified | unit "captures two board scenarios, diffs them in pitch metres, and reuses an unchanged comparison" | |
| TMS-R58 | verified | unit "updates structured drill/session data immutably and normalizes list input"; e2e "edits a coaching session and restores a named local snapshot" | |
| TMS-R59 | verified | unit "seeks and steps in integer milliseconds without exceeding the known duration", "accepts browser-playable local video metadata and rejects unusable files"; e2e "reports local video files that cannot be reviewed" | |
| TMS-R60 | verified | unit "stores non-destructive telestration and samples an immutable presentation copy", "does not record review scrubbing in undo history" | |
| TMS-R61 | verified | unit "interpolates manual overlay anchors and holds authored positions" | |
| TMS-R62 | verified | unit "tags match events in time order and builds an ordered clip playlist" | |
| TMS-R63 | verified | unit "tags match events in time order and builds an ordered clip playlist"; e2e "reviews local video with telestration, tracking, events, clips, and manual angle sync" | |
| TMS-R64 | verified | unit "synchronizes comparison angles from a manual anchor only" | |
| TMS-R65 | verified | unit "round-trips authored trajectories through the documented rich CSV and JSON format"; e2e "round-trips authored trajectory CSV through the browser interchange controls" | |
| TMS-R66 | verified | unit "migrates the actual historical schema-v1 ownership and marker model before validation", "round-trips deterministic ZIP bundles with Blob assets and rejects unsafe archive paths"; e2e "round-trips a project ZIP and preserves the open project after corrupt JSON import", "lists, loads, and removes browser-local saved projects" | |
| TMS-R67 | verified | unit "rejects a ZIP whose declared entry count or uncompressed size is hostile before expanding it", "rejects imported projects whose track, keyframe, or marker counts exceed the session bound" | |
| TMS-R68 | verified | unit "neutralizes spreadsheet formulas in trajectory CSV text without changing the imported event" | |
| TMS-R69 | verified | unit "stores the coaching fields and preserves the original creation date"; e2e "exports metadata, analytics, playback, and a capability-checked video fallback" | |
| TMS-R70 | verified | unit "exports source-honest trajectory and team-geometry metrics" | |
| TMS-R71 | verified | unit "exposes a video combination only when the container and encoder both accept it", "does not call the encoder for an unconfirmed format and writes a vector frame ZIP"; e2e "exports metadata, analytics, playback, and a capability-checked video fallback" | |
| TMS-R72 | verified | unit "writes a vector PDF package with info-dictionary fields and a metadata sidecar" | |
| TMS-R73 | missing | — | Page text uses pdf-lib standard WinAnsi fonts; non-ASCII becomes `?`; the sidecar keeps the original text |
| TMS-R74 | verified | unit "composes even social-card sizes and escapes active text", "builds a local playback document that cannot execute notes as HTML", "offers a raster format only after the browser write probe succeeds and checks the file signature"; e2e "downloads the current board as SVG" | |
| TMS-R75 | partial | unit "composes even social-card sizes and escapes active text" | Social cards are square, portrait, story and landscape 1920×1080; no 1200×630 card |
| TMS-R76 | verified | e2e "reflows and preserves 44px essential targets across phone, tablet, laptop, and desktop widths", "narrow sheets keep the pitch first and return focus" | |
| TMS-R77 | verified | e2e "player actions from right-click and the touch button lock the same player" | |
| TMS-R78 | missing | — | Touch uses the Player actions button (TMS-R77); no long-press or radial menu |
| TMS-R79 | verified | unit "keeps a tooltip inside the viewport and flips it above a low anchor"; e2e "help, shortcuts, and tooltips stay available without taking over text fields" | |
| TMS-R80 | verified | unit "keeps shortcut chords unique and described", "ignores authoring shortcuts while typing, on controls, or under an open overlay"; e2e "reduced motion steps playback instead of animating it" | |
| TMS-R81 | verified | e2e "has no serious or critical accessibility violations in the tactical workspace" | |
| TMS-R82 | partial | — | Surfaces use the site tokens (`--surface`, `--border-color`); dialogs, tooltips, export notes and video errors switch on `prefers-color-scheme`, not the site choice; no dark contrast test |
| TMS-R83 | implemented | — | Site PWA precache (`vite.config.ts`) covers the tool's chunks; no offline test for this route |
| TMS-R84 | verified | unit "pauses standalone playback and local video review while the document is hidden", "deduplicates pending frames, pauses while hidden, resumes once, and cancels on disposal" | |
| TMS-R85 | verified | unit "keeps a realistic 11v11 session responsive to sample, draw, and analyze" | |

## Open work

1. TMS-R82: key the dark rules in `tactical-matchboard.css` on the site theme and add a dark contrast test.
2. TMS-R33: substitution event on the timeline.
3. TMS-R07, R31, R44, R52, R78: build.
4. TMS-R75: 1200×630 card.
5. TMS-R83: offline test.
6. TMS-R73: after the owner decides on a font embedder.

## Known limitations

- PDF page text is WinAnsi only (TMS-R73).
- Video export depends on the browser's WebCodecs encoders; seek precision is limited by the media element.
- Analysis and tracking use authored or imported samples only.

## Verification evidence

- 2026-10-05, `expand/tactical-matchboard-studio` from `main` @ `6c991e75`: `pnpm tool:check tactical-matchboard-studio --base origin/main` 75/85, no errors.

## Change log

- 2026-10-05 — Created per `docs/DOCUMENTATION_STANDARD.md`.

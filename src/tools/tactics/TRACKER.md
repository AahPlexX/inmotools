---
tool: tactical-matchboard-studio
folder: src/tools/tactics
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-tactical-matchboard-studio-design.md
tracker: src/tools/tactics/TRACKER.md
updated: 2026-10-25
timestamp: 2026-10-26T01:45:19Z
agent: Arena.ai Agent Mode (model name not exposed)
validator: automated unit/type/build/lint/focused-browser/selected regression gates; same-agent review
documentation: R78 accepted; test-only panel readiness GREEN; R75/R83 complete acceptance still pending
---

# Tactical Matchboard Studio — tracker

## Resume here

85 requirements: **83 verified, 2 implemented, 0 partial, 0 missing**. Latest locally accepted runtime `94d842891264e1ee762694205c625eb3c1a7aca9` adds R78 on top of verified R44/R52. Full units **4,250 passed / 18 existing skips**; type/production/PWA build **17.30 s / 408 entries**; full lint **4,103 warnings / 0 errors**. Fourth canonical four-spec gate on test-only head `94fb7261975fa3131c24e59ebd3ea8e6cb35bdf9`: **128 passed / 2 existing duplicate mobile skips / 0 failures / 0 retries**, one worker, 17.7 min, all 130 cases; all 16 R78 cases pass. All 103 frozen inputs matched after exit; selected documentation/validation regressions 61 passed. [Task 7d78](../../../.tasks/items/T-tactical-matchboard-studio-20261025-7d78.md) retains exact identities, failed-gate history and limits; [task 7d52](../../../.tasks/items/T-tactical-matchboard-studio-20261025-7d52.md) / [task 4d44](../../../.tasks/items/T-tactical-matchboard-studio-20261025-4d44.md) retain R52/R44 history. These three tasks remain active **only for owner-managed integration**, not local implementation/acceptance. R78 acceptance is finished; the current R75/R83 gate is described below. **R75 implemented / acceptance pending:** [task 7d75](../../../.tasks/items/T-tactical-matchboard-studio-20261025-7d75.md), genuine RED `b80d6de` then one preset entry; 27 export units, type/build (16.08 s / 408), four focused new/legacy export browser cases pass, no retries. Runtime candidate `7419a52` now passes full 4,255 units / 18 skips and full lint 4,103 / 0; canonical browser gate pending. [R83 task 7d83](../../../.tasks/items/T-tactical-matchboard-studio-20261025-7d83.md) now passes 2 native offline/reload/new-tab cases without runtime changes; full lint 4,103 / 0 and selected regressions 61 pass. First combined canonical checkpoint **failed 131 passed / 2 existing skips / 1 old desktop ball-flight panel-visibility failure / 0 retries**. R75/R83 and R78 cases pass; all 671 inputs verified after exit. No browser process active; trace protected in task 7d83. Test-only native panel readiness now passes 6 critical cases + 3 intentional repetitions; helper body unchanged, no production R07 reopening. Full lint 4,103 / 0 and selected regressions 61 pass; publish/freeze a fresh complete gate next on the owner-authorized fixed chat branch without waiting for main. No PR, hosted CI, integration, deployment or physical-device claim; connector remains untouched. `HANDOFF.md` is archival.

## Documents

- Current handoff: [CURRENT_HANDOFF.md](CURRENT_HANDOFF.md)
- Spec: [2026-10-05-tactical-matchboard-studio-design.md](../../../docs/superpowers/specs/2026-10-05-tactical-matchboard-studio-design.md)
- Older design: [2026-09-21-tactical-matchboard-studio-design.md](../../../docs/superpowers/specs/2026-09-21-tactical-matchboard-studio-design.md), [2026-09-02-tactical-ethical-support-addendum.md](../../../docs/superpowers/specs/2026-09-02-tactical-ethical-support-addendum.md)
- Plan: [2026-09-21-tactical-matchboard-studio.md](../../../docs/superpowers/plans/2026-09-21-tactical-matchboard-studio.md)
- Older tracking/archive: [FEATURE_MATRIX.md](FEATURE_MATRIX.md), [HANDOFF.md](HANDOFF.md), [TODO_SEQUENCE.md](TODO_SEQUENCE.md)
- Font license: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/tactics-*.test.ts`; browser tests: `tests/e2e/tactical-matchboard-ball-flight.spec.ts`, `tests/e2e/tactical-matchboard-studio.spec.ts`, `tests/e2e/tactical-matchboard-substitution.spec.ts`, `tests/e2e/tactical-matchboard-theme.spec.ts`

## Requirement status

`unit` = `tests/unit/tactics-*.test.ts`; `e2e` = Tactical Matchboard Playwright specs.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| TMS-R01 | verified | unit "keeps governing pitch profiles provenance-bearing and custom profiles editable", "keeps generic training format profiles editable and non-authoritative"; e2e "authors rules, formations, transforms, legality aids, and restart starters" | |
| TMS-R02 | verified | unit "applies pitch profiles with deterministic normalized specialty overlays", "reviews sourced restart placement and opponent-distance constraints as authoring aids" | |
| TMS-R03 | verified | unit "grows and shrinks the active squad without deleting roster players or imposing a format cap", "allows growth past the formation size and stops at the Pages-safe roster ceiling", "authors neutral and coach participants and keeps them out of active scaling" | |
| TMS-R04 | verified | unit "authors canonical positions from normalized units or pitch metres and rejects pixels", "writes ball, equipment, and official positions through the same normalized surface" | |
| TMS-R05 | verified | unit "edits jersey, role, kit, developmental tag, and avatar without changing the session plan" | |
| TMS-R06 | verified | unit "stores elevation keyframes on the ball track and samples them independently of the resting ball elevation" | |
| TMS-R07 | verified | unit "authors a metre-based parabolic arc on the canonical ball track without mutating the project", "round-trips generated flights through project JSON and keeps sampled playback unchanged"; e2e "authors ball flight presets with metre-based elevation, undo, manual editing and responsive controls" | GREEN workflow 38934899167: all four Tactical browser specs pass. Presets reuse the ball track; manual elevation remains editable. |
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
| TMS-R31 | verified | unit "samples a 500 ms fade identically for chapter preview and exported frames", "renders chapter fade opacity in vector PDF contact sheets"; e2e "authors chapter fades and morphs with matching preview and standalone export" | GREEN workflow `39195675178`, merge `15e3133a`. Exit transitions share deterministic preview/export sampling; existing projects with no settings keep selected-scene behavior. |
| TMS-R32 | verified | unit "samples temporal visibility for layers and annotations without deleting canonical content"; e2e "temporally hides a scene layer without deleting its players" | |
| TMS-R33 | verified | unit "authors one timed substitution event that swaps outgoing and incoming player visibility"; e2e "authors a timed substitution and swaps the two player tokens at the authored millisecond" | One atomic edit writes paired timeline visibility keyframes with additive substitution tags; authoring validates player tokens, same team/scene and immediate-before visibility |
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
| TMS-R44 | verified | unit "computes exact finite-lane reach in physical metres without mutating input", "includes a substituted-on defender according to sampled visibility rather than roster status"; e2e "TMS-R44 displays configured defender reach and exact finite-lane coverage" | Runtime `117c119`; 20 new units, 8 new browser cases, full local owned gate 98 passed / 2 existing skips / 0 failures / 0 retries. Metre-space configured reach; no prediction, schema or dependency change. Not integrated to main; task 4d44 |
| TMS-R45 | verified | unit "builds authored orientation sectors using physical range and pitch dimensions" | |
| TMS-R46 | verified | unit "creates configurable positional-play grids without implying an official formation" | |
| TMS-R47 | verified | unit "creates physical distance rings and dynamic tethers" | |
| TMS-R48 | verified | unit "samples authored motion into an occupancy heat map" | |
| TMS-R49 | verified | unit "measures distance and speed from authored or imported trajectory samples", "measures selected authored trajectory only across its authored keyframe span"; e2e "derives occupancy and speed metrics only from authored trajectory samples" | |
| TMS-R50 | verified | unit "round-trips normalized pitch positions through metre-based Three.js world coordinates"; e2e "synchronizes the lazy 3D pitch, canonical player editing, and authored camera keyframes" | |
| TMS-R51 | verified | unit "falls back to a pitch-aware tactical camera when no authored camera exists"; e2e "synchronizes the lazy 3D pitch, canonical player editing, and authored camera keyframes" | |
| TMS-R52 | verified | unit "places the eye at the selected player in physical pitch coordinates without mutation", "applies a level real Three.js camera without OrbitControls moving the eye"; e2e "TMS-R52 renders the sampled player eye and heading with locked orbit and preset exit", "TMS-R52 restores a captured level player camera without an orbit-clamp tilt" | Runtime `bedf5ec`; 16 new unit cases (150 seeded geometry samples), 14 new browser cases; complete local owned gate 112 passed / 2 existing skips / 0 failures / 0 retries. Ephemeral view/config, explicit existing camera snapshots; no schema/dependency change. Owner integrates; task 7d52 |
| TMS-R53 | verified | unit "samples authored camera keyframes deterministically and replaces same-time keyframes", "reports invalid or ambiguous camera keyframes during project validation"; e2e "TMS-R52 restores a captured level player camera without an orbit-clamp tilt" | Captured level views retain the eye/heading when live player view is turned off |
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
| TMS-R71 | verified | unit "exposes a video combination only when the container and encoder both accept it", "does not call the encoder for an unconfirmed format and writes a vector frame ZIP"; e2e "exports metadata, analytics, playback, and a capability-checked video fallback" | Encoded timestamps and durations follow authored samples, including capped sequences |
| TMS-R72 | verified | unit "writes a vector PDF package with info-dictionary fields and a metadata sidecar" | |
| TMS-R73 | verified | unit "embeds accented Latin, Greek, and Cyrillic player and team names with the Unicode font"; unit "draws an uncovered glyph as a question mark and still builds the PDF"; unit "keeps an unsupported roster name in metadata.json while the page shows ?"; unit "keeps two basic-Latin teams on Helvetica with no Teams line and no Unicode font load"; unit "loads the Unicode font only for drawn text, not for tags or another scene"; unit "ends a roster longer than six lines with a visible +N more marker"; unit "prints a team with no name without a leading colon"; unit "composes a decomposed accent before drawing it"; unit "reports a Unicode font load failure and still builds the PDF with ?" | Page text outside basic Latin uses the bundled Noto Sans subset. A letter that subset does not include is shown as ?. metadata.json keeps the original letter and every team and player name |
| TMS-R74 | verified | unit "composes even social-card sizes and escapes active text", "builds a local playback document that cannot execute notes as HTML", "offers a raster format only after the browser write probe succeeds and checks the file signature"; e2e "downloads the current board as SVG"; e2e "authors chapter fades and morphs with matching preview and standalone export" | Standalone playback uses authored millisecond spacing between retained frames |
| TMS-R75 | implemented | unit "composes a passive exact 1200 by 630 OpenGraph card without mutating the project"; e2e "TMS-R75 downloads exact 1200 by 630 OpenGraph SVG and PNG cards" | One new preset, 27 export units/type/build and 4 focused new/legacy export browser cases pass; actual SVG/PNG dimensions/content, legacy defaults/sizes and narrow controls covered. Final full affected acceptance pending; task 7d75 |
| TMS-R76 | verified | e2e "reflows and preserves 44px essential targets across phone, tablet, laptop, and desktop widths", "narrow sheets keep the pitch first and return focus" | |
| TMS-R77 | verified | e2e "player actions from right-click and the touch button lock the same player" | |
| TMS-R78 | verified | unit "opens once at 500 ms with the original CSS-pixel anchor and no input mutation", "keeps 150 seeded offscreen anchors and oversized panels within their viewport"; e2e "TMS-R78 real touch holds a nonselected player through SVG updates without release edits", "TMS-R78 retains native page scrolling and mobile pinch without arming actions", "TMS-R78 radial controls reflow at edges zoom large text and dark theme with focus return" | Runtime `94d8428`, test head `94fb726`; 19 new units / 150 seeded geometry samples and all 16 R78 browser cases. Complete canonical gate 128 passed / 2 existing skips / 0 failures / 0 retries; full units 4,250 / 18 skips, type/build/lint pass. Shared seven R77 callbacks, native pan/pinch and deliberate activation, bounded accessible radial/compact UI; no schema/dependency change. Owner integrates; task 7d78 |
| TMS-R79 | verified | unit "keeps a tooltip inside the viewport and flips it above a low anchor"; e2e "help, shortcuts, and tooltips stay available without taking over text fields" | |
| TMS-R80 | verified | unit "keeps shortcut chords unique and described", "ignores authoring shortcuts while typing, on controls, or under an open overlay"; e2e "reduced motion steps playback instead of animating it" | |
| TMS-R81 | verified | e2e "has no serious or critical accessibility violations in the tactical workspace" | |
| TMS-R82 | verified | e2e "TMS-R82 stored dark theme wins over a light operating-system preference and passes contrast", "TMS-R82 stored light theme wins over a dark operating-system preference" | Resolved site theme wins over OS preference for the affected Matchboard surfaces; Dark has focused axe color-contrast evidence |
| TMS-R83 | implemented | e2e "TMS-R83 reopens the precached tactical workspace on offline reload and a new tab" | Existing site PWA works without runtime/config edits; 2 focused cases prove native first-visit activation, real offline SW reload/new client, usable edit/undo/SVG and tool-script provenance. Complete combined acceptance pending; task 7d83 |
| TMS-R84 | verified | unit "pauses standalone playback and local video review while the document is hidden", "deduplicates pending frames, pauses while hidden, resumes once, and cancels on disposal" | |
| TMS-R85 | verified | unit "keeps a realistic 11v11 session responsive to sample, draw, and analyze" | |

## Open work

1. TMS-R75 / TMS-R83 — first complete gate failed 131/2/1, protected. Native panel test-readiness correction now passes 6 critical cases + 3 intentional repetitions, no production R07 change; publish/freeze the second complete gate.
2. Fresh inputs must include the new helper (104 repository / 547 compiled / 21 environment). Run all 134 with one worker / zero retries and reverify after exit. Full units/build remain reusable; no browser run active.
3. Owner-managed integration of locally verified R44/R52/R78; tasks 4d44/7d52/7d78 stay active until actual integration evidence exists. This is nonblocking operational work, not missing implementation or acceptance.

## Known limitations

- Coaching PDF page text outside the bundled Noto Sans subset (Latin, Latin Extended, Greek, Cyrillic, and the punctuation listed in THIRD_PARTY_NOTICES.md) is shown as ? (TMS-R73). Basic Latin page text still uses the standard Helvetica font. A team or player name outside basic Latin adds a Teams line of up to six lines, and the pitch drawing uses the space that remains. When the line needs more than six lines, it ends with (+N more in metadata.json). N is the number of players left off, plus 1 for each left-off team that has no players. A letter and combining accent with no single composed character print as the letter followed by an accent that may not sit exactly over it.
- Video export depends on the browser's WebCodecs encoders; seek precision is limited by the media element.
- Analysis and tracking use authored or imported samples only.

## Verification evidence

- timestamp: 2026-10-26T00:44:56Z | agent: Arena.ai Agent Mode (model name not exposed) | validator: automated local gates; same-agent evidence review | documentation: R78 runtime `94d842891264e1ee762694205c625eb3c1a7aca9`, test head `94fb7261975fa3131c24e59ebd3ea8e6cb35bdf9`: full units 4,250 passed / 18 existing skips, type/production/PWA build 17.30 s / 408 entries, full lint 4,103 warnings / 0 errors. Complete canonical four-spec browser gate 128 passed / 2 existing duplicate mobile skips / 0 failures / 0 retries, one worker, 1,061,809.562 ms; all 16 R78 cases pass, all 103 frozen inputs verified after exit. Fresh selected regressions 61 passed. Task 7d78 preserves genuine RED/corrective/failure history, plan/input/result digests and local-environment limits. Owner integrates; no hosted/deployment/physical-device or all-four-nudge UI claim. R75 then R83 proceed without waiting.

- timestamp: 2026-10-25T19:39:08Z | agent: Arena.ai Agent Mode (model name not exposed) | validator: automated local gates and same-agent evidence review | documentation: R52 runtime `bedf5ece25cab5a541e8f09605b0dd52e7323f06`, records-only browser head `bd5d5b306de510f2203e90a6355740dae730db9c`. Units 4,231 passed / 18 existing skips; type/production/PWA build passed (14.48 s, 408 precache entries); full lint 4,104 warnings / 0 errors. Canonical four owned browser specs 112 passed / 2 existing duplicate mobile skips / 0 failures / 0 retries, one worker, 13.9 min. All 16 new units, 150 seeded geometry cases and 14 new browser cases pass, including exact captured level-camera canvas restoration; R44's 8 cases also pass. Local Chromium 153.0.8010.0, not hosted CI. Task 7d52 preserves initial RED and corrective regressions, exact digests, environment and archived receipts; owner handles integration, connector untouched.

- timestamp: 2026-10-25T17:27:41Z | agent: Arena.ai Agent Mode (model name not exposed) | validator: automated local gates; same-agent review | documentation: TMS-R44 runtime `117c119741e389b5b169a0f154aa544937bc0365`, records-only browser head `0eaddedae45f748e7e07524c3152350945452506`. Units 4,215 passed / 18 existing skips; type/production/PWA build passed; lint 4,110 existing warnings / 0 errors; all four owned browser specs 98 passed / 2 existing duplicate mobile skips / 0 failures / 0 retries, one worker, 12.3 min. Includes 20 new unit contracts, 150 seeded property cases and 8 R44 browser cases. The earlier parallel video timeout is retained in task 4d44; that unchanged test passes in the final complete batch. Hosted CI HTTP 403; no main integration/deployment claimed.

- 2026-10-19, TMS-R31: runtime `a528848db0c030c9010aa6fbb76061627077a084`, GREEN workflow `39195675178` / job `117877804494`, integration merge `15e3133a228a67e0913d8c01ea6b8e727896dc8a`. 4,195 units passed / 18 skipped; TypeScript and production/PWA build passed (5.68 s); four owned Tactical browser specs: 90 passed / 2 existing duplicate mobile skips / 0 failures / no reported retries (3.5 min). Local encoded-video receipt: 5.033333 s for 5 authored seconds. Standalone HTML and encoded video retain authored timestamps under frame caps.

- 2026-10-16, TMS-R07: runtime `4e05ed2d`, selector expectation correction `3b7b53d4`; GREEN workflow `38934899167`, job `117087815510`, integration merge `336643b4`. Repository units: 4,186 passed / 18 skipped; build including TypeScript passed (8.28 s); four selected Tactical Playwright specs: 88 passed / 2 existing duplicate mobile skips / 0 failures / no reported retries (3.7 min). Local lint exited 0 with existing warning debt; scoped Axe, reflow, 44px controls, undo/redo, manual edits and JSON round-trip are covered.

- 2026-10-15, TMS-R33: GREEN workflow `38672289731`, job `116217961540`, completed successfully for runtime `0e60a3aecca4eef01327d31d950cbcffcabe8ecc` plus test-only locator correction `7313bf00bbb4ca3642da859d42935fb0c2495ced`; branch integrated to `main` as `ef68da5206c1fe6b9ef627caf4ed141bf7babcb4`, then generated docs/index sync advanced `main` to `af4fed70446dccc2ff4b1ab25188f5f845af6570`.
- 2026-10-15, TMS-R82: workflow `38664068636`, job `116191941882`, completed successfully for runtime `901eaf0ea6a7852ba821067de871b035cc3015fe`; branch integrated to `main` as `f5b22c8f6f78b589a458e28d25be96c1dfe119c1`, then generated task/index sync advanced `main` to `539bf012171ecc9caeaddbffe0fd1579d5854c00`.
- 2026-10-05, `expand/tactical-matchboard-studio` from `main` @ `6c991e75`: `pnpm tool:check tactical-matchboard-studio --base origin/main` 75/85, no errors.

## Change log

- timestamp: 2026-10-26T00:44:56Z | agent: Arena.ai Agent Mode (model name not exposed) | validator: local unit/type/build/lint/canonical-browser gates | documentation: R78 verified locally after the complete frozen 130-case gate, not from aggregated focused runs. Touch-only 500 ms / 10 px hold shares canonical R77 actions, prevents initiating-release activation, cancels invalid/interrupted targets and preserves native pan/pinch and legacy equivalents. Radial/compact layout retains native controls, focus and viewport bounds; no dependency/schema/config change. R75 and R83 remain.

- timestamp: 2026-10-25T19:39:08Z | agent: Arena.ai Agent Mode (model name not exposed) | validator: local unit/type/build/lint/owned-browser/docs gates | documentation: R52 verified locally. Selected visible player views follow the shared sampled pose with configured eye height/FOV, orbit lock, self-actor omission, native fractional-input validation, accessible fallback and explicit canonical snapshots. Captured level cameras are no longer tilted by the orbit polar boundary. No dependency/schema/config change or prior verified-row reduction. R78 is next; owner integrates R44/R52.

- timestamp: 2026-10-25T17:27:41Z | agent: Arena.ai Agent Mode (model name not exposed) | validator: local unit/type/build/lint/owned-browser/docs gates | documentation: TMS-R44 verified locally. Opt-in pitch-clipped per-defender reach sectors, exact finite-lane coverage, metre labels and accessible summaries use sampled scene/layer/token visibility, including timed incoming substitutes; display settings remain outside canonical history/JSON. No prior verified row is reduced. Main integration and hosted-CI permissions remain explicit blockers.

- 2026-10-19 — TMS-R31 verified. Optional cut/fade-through/morph exits share preview/export sampling, preserve legacy projects, validate imports and scene edits, and retain authored playback duration. Timed exports reserve chapter boundaries and report an insufficient frame cap rather than silently omitting chapters.

- 2026-10-16 — TMS-R07 verified. Ground/driven/lofted/chipped local authoring presets generate position and metre-based elevation keyframes on the existing ball track, preserve unrelated fields and manual editing, reject invalid intervals and overlapping possession, and round-trip through project JSON.

- 2026-10-15 — TMS-R33 verified. Timed substitution authoring atomically swaps outgoing/incoming player visibility at an exact timeline millisecond, preserves existing keyframe event text, validates same-team/scene and pre-event visibility, and has focused desktop/mobile browser acceptance.
- 2026-10-15 — TMS-R82 verified. Matchboard's affected dark/light surfaces follow the resolved site `data-theme` rather than independently following the OS media preference; focused browser evidence covers both preference inversions and Dark color contrast.
- 2026-10-12 — TMS-R73 review fixes: metadata.json keeps team and player names; basic-Latin rosters load no Unicode font; long Teams lines end with (+N more in metadata.json); a font load failure is reported; page text is composed to NFC; notices carry the MIT, BSD-3-Clause, Apache-2.0, and zlib texts for code in the PDF chunks.
- 2026-10-11 — TMS-R73 verified. Coaching PDF page text embeds Noto Sans through `@pdf-lib/fontkit` 1.1.1 when the text leaves basic Latin. The production chunk is `pdf-unicode-font-*.js`, 1,023.46 kB, gzip 493.18 kB.
- 2026-10-05 — Created per `docs/DOCUMENTATION_STANDARD.md`.

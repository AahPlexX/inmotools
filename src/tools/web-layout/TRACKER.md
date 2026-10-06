---
tool: web-layout-studio
folder: src/tools/web-layout
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-web-layout-studio-design.md
tracker: src/tools/web-layout/TRACKER.md
updated: 2026-10-05
---

# Web Layout Studio — tracker

## Resume here

128 requirements: 57 verified, 27 implemented, 4 partial, 40 missing, 0 prohibited. Next action: build the diagnostics WLS-R85 to WLS-R93 (contrast, APCA, color-vision, computed-style, cascade, unused-selector, HTML conformance, overflow, content stress), which need no new storage. No blocker.

## Documents

- Spec: [2026-10-05-web-layout-studio-design.md](../../../docs/superpowers/specs/2026-10-05-web-layout-studio-design.md)
- Ledger and build record (history): [2026-09-12-web-layout-studio.md](../../../docs/superpowers/plans/2026-09-12-web-layout-studio.md)
- Dark-theme contrast task: [T-repository-dark-contrast-20261004-b7d2](../../../.tasks/items/T-repository-dark-contrast-20261004-b7d2.md)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/web-layout.test.ts`; browser tests: `tests/e2e/web-layout.spec.ts`, `tests/e2e/accessibility.spec.ts`, `tests/e2e/app.spec.ts`

## Requirement status

Evidence names the test file in parentheses before each quoted title. Statuses come from the code and tests, not from the wording of the old ledger.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| WLS-R01 | verified | unit (`tests/unit/web-layout.test.ts`) "binds layout and breakpoint output to the same project as the preview"; e2e (`tests/e2e/web-layout.spec.ts`) "edits a layout and exports the same content, theme and metadata"; e2e (`tests/e2e/web-layout.spec.ts`) "keeps preview cards readable with extreme spacing and column settings" |  |
| WLS-R02 | verified | unit (`tests/unit/web-layout.test.ts`) "validates rectangular named grid areas and emits responsive placements"; unit (`tests/unit/web-layout.test.ts`) "migrates legacy projects without altering flow and rejects unsafe area maps"; e2e (`tests/e2e/web-layout.spec.ts`) "applies area drafts, rejects invalid shapes and reflows named layouts"; e2e (`tests/e2e/web-layout.spec.ts`) "preserves area drafts, accepts fractional spacing and keeps backups available with invalid metadata" |  |
| WLS-R03 | verified | unit (`tests/unit/web-layout.test.ts`) "migrates legacy projects without altering flow and rejects unsafe area maps" | Rejection of a map whose row width differs from the columns is tested; the clearing in the UI is not |
| WLS-R04 | verified | unit (`tests/unit/web-layout.test.ts`) "round-trips authoring options and escapes custom metadata while rejecting CSS injection"; e2e (`tests/e2e/web-layout.spec.ts`) "authors tracks and metadata and restores a saved starter snapshot" |  |
| WLS-R05 | missing | — | Tracks are typed as text only |
| WLS-R06 | partial | unit (`tests/unit/web-layout.test.ts`) "binds layout and breakpoint output to the same project as the preview" | display:flex is asserted; Direction, Alignment and Distribution selects are not exercised |
| WLS-R07 | implemented | `LayoutOptionsPanel.tsx`; `buildCss` in `layout-engine.ts` | No test changes wrapping |
| WLS-R08 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "preserves area drafts, accepts fractional spacing and keeps backups available with invalid metadata"; e2e (`tests/e2e/web-layout.spec.ts`) "keeps preview cards readable with extreme spacing and column settings" | The error and Escape path are not asserted |
| WLS-R09 | verified | unit (`tests/unit/web-layout.test.ts`) "binds layout and breakpoint output to the same project as the preview"; e2e (`tests/e2e/web-layout.spec.ts`) "keeps preview cards readable with extreme spacing and column settings" |  |
| WLS-R10 | missing | — | One breakpoint (Stack below) exists |
| WLS-R11 | missing | — | Named grid areas emit an internal @container rule but no authoring is offered |
| WLS-R12 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "edits a layout and exports the same content, theme and metadata"; e2e (`tests/e2e/web-layout.spec.ts`) "undoes a typing session and supports project shortcuts outside text fields" |  |
| WLS-R13 | implemented | `buildHtml` in `layout-engine.ts` | No test asserts the order after a move |
| WLS-R14 | implemented | Add block in `WebLayoutWorkspace.tsx` | No test presses Add block |
| WLS-R15 | verified | unit (`tests/unit/web-layout.test.ts`) "rejects oversized projects and excessive blocks before they reach rendering"; unit (`tests/unit/web-layout.test.ts`) "rejects CSS injection, unsafe links, duplicate IDs, reserved IDs, and malformed versions" |  |
| WLS-R16 | implemented | `BlockTreeEditor.tsx` `edit` | No test edits block fields |
| WLS-R17 | implemented | `moveBlock` in `block-tree.ts`; `BlockTreeEditor.tsx` | No test moves or drags blocks |
| WLS-R18 | verified | unit (`tests/unit/web-layout.test.ts`) "validates nested blocks and preserves descendants through duplicate, remove and export" | Unit test covers the model; the button is not pressed |
| WLS-R19 | verified | unit (`tests/unit/web-layout.test.ts`) "validates nested blocks and preserves descendants through duplicate, remove and export"; e2e (`tests/e2e/web-layout.spec.ts`) "nests blocks through keyboard-accessible parent controls and preserves children on removal" |  |
| WLS-R20 | verified | unit (`tests/unit/web-layout.test.ts`) "validates nested blocks and preserves descendants through duplicate, remove and export"; e2e (`tests/e2e/web-layout.spec.ts`) "nests blocks through keyboard-accessible parent controls and preserves children on removal" |  |
| WLS-R21 | partial | e2e (`tests/e2e/web-layout.spec.ts`) "authors tracks and metadata and restores a saved starter snapshot" | Only the Portfolio starter is loaded by a test |
| WLS-R22 | verified | unit (`tests/unit/web-layout.test.ts`) "round-trips the actual starter with all five component patterns"; unit (`tests/unit/web-layout.test.ts`) "exports every navigation target, multiline content and a consistent print palette" |  |
| WLS-R23 | missing | — | Only five patterns exist |
| WLS-R24 | missing | — | The form pattern has one email field |
| WLS-R25 | implemented | `StyleEditor` in `BlockTreeEditor.tsx`; `parseBlockStyle` in `block-tree.ts` | No test applies a block style |
| WLS-R26 | missing | — |  |
| WLS-R27 | missing | — |  |
| WLS-R28 | missing | — |  |
| WLS-R29 | missing | — |  |
| WLS-R30 | missing | — |  |
| WLS-R31 | missing | — | Whole-page snapshots exist (see Project backups) |
| WLS-R32 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "edits a layout and exports the same content, theme and metadata"; unit (`tests/unit/web-layout.test.ts`) "exports every navigation target, multiline content and a consistent print palette" | High contrast is not selected by a test |
| WLS-R33 | verified | unit (`tests/unit/web-layout.test.ts`) "rejects CSS injection, unsafe links, duplicate IDs, reserved IDs, and malformed versions"; unit (`tests/unit/web-layout.test.ts`) "round-trips authoring options and escapes custom metadata while rejecting CSS injection" |  |
| WLS-R34 | implemented | `buildCss` in `layout-engine.ts`; Theme panel | No test asserts the clamp; the tokens export carries both values (unit "exports every navigation target, multiline content and a consistent print palette") |
| WLS-R35 | missing | — |  |
| WLS-R36 | implemented | `reset` option in `buildCss` | No test toggles it |
| WLS-R37 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "applies appearance drafts to previews and exports, with print and reduced-motion recovery"; unit (`tests/unit/web-layout.test.ts`) "validates appearance and exports motion, layers and a final print palette" |  |
| WLS-R38 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "applies appearance drafts to previews and exports, with print and reduced-motion recovery"; unit (`tests/unit/web-layout.test.ts`) "exports every navigation target, multiline content and a consistent print palette"; unit (`tests/unit/web-layout.test.ts`) "validates appearance and exports motion, layers and a final print palette" |  |
| WLS-R39 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "applies appearance drafts to previews and exports, with print and reduced-motion recovery"; unit (`tests/unit/web-layout.test.ts`) "validates appearance and exports motion, layers and a final print palette" |  |
| WLS-R40 | missing | — | Browser-support feedback and base fallback exist; gamut diagnostics do not |
| WLS-R41 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "applies appearance drafts to previews and exports, with print and reduced-motion recovery"; unit (`tests/unit/web-layout.test.ts`) "validates appearance and exports motion, layers and a final print palette" |  |
| WLS-R42 | missing | — |  |
| WLS-R43 | verified | unit (`tests/unit/web-layout.test.ts`) "validates appearance and exports motion, layers and a final print palette" |  |
| WLS-R44 | implemented | Text shadow section in `AppearancePanel.tsx`; `appearance.ts` | No test adds a text shadow |
| WLS-R45 | implemented | Backdrop filters section in `AppearancePanel.tsx`; `appearance.ts` | No test sets them |
| WLS-R46 | missing | — |  |
| WLS-R47 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "applies appearance drafts to previews and exports, with print and reduced-motion recovery"; unit (`tests/unit/web-layout.test.ts`) "validates appearance and exports motion, layers and a final print palette" |  |
| WLS-R48 | missing | — | Keyframe animation exists; transitions do not |
| WLS-R49 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "applies appearance drafts to previews and exports, with print and reduced-motion recovery" | Discard is not pressed |
| WLS-R50 | verified | unit (`tests/unit/web-layout.test.ts`) "validates appearance and exports motion, layers and a final print palette" |  |
| WLS-R51 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "authors a token alias, rejects broken references and exports applied variables" |  |
| WLS-R52 | implemented | `TokenPanel.tsx` | No test uses the search |
| WLS-R53 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "authors a token alias, rejects broken references and exports applied variables"; unit (`tests/unit/web-layout.test.ts`) "resolves typed token aliases and JSON pointers without losing source references" |  |
| WLS-R54 | verified | unit (`tests/unit/web-layout.test.ts`) "exports correct token color units and escapes font names"; unit (`tests/unit/web-layout.test.ts`) "validates composite tokens, typed subvalue references and complete typography exports" |  |
| WLS-R55 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "authors a token alias, rejects broken references and exports applied variables"; unit (`tests/unit/web-layout.test.ts`) "resolves typed token aliases and JSON pointers without losing source references" | Discard is not pressed |
| WLS-R56 | implemented | `TokenPanel.tsx` Import token JSON | No test imports |
| WLS-R57 | implemented | `TokenPanel.tsx` | Sass has its own row; JSON and CSS downloads are not tested |
| WLS-R58 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "authors a token alias, rejects broken references and exports applied variables"; unit (`tests/unit/web-layout.test.ts`) "exports Sass maps with distinct paths, numeric aliases and inert interpolation" |  |
| WLS-R59 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "authors a token alias, rejects broken references and exports applied variables"; unit (`tests/unit/web-layout.test.ts`) "exports typed DTCG color and dimension values, not untyped strings"; unit (`tests/unit/web-layout.test.ts`) "resolves typed token aliases and JSON pointers without losing source references" |  |
| WLS-R60 | missing | — |  |
| WLS-R61 | missing | — | Structured values are edited as JSON |
| WLS-R62 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "gives tablet cards room for readable text without overflowing the viewport"; e2e (`tests/e2e/web-layout.spec.ts`) "applies area drafts, rejects invalid shapes and reflows named layouts" |  |
| WLS-R63 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "retains preview interaction until manual refresh and offers actual-size custom viewports" |  |
| WLS-R64 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "switches the preview presentation orientation without changing CSS width" |  |
| WLS-R65 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "retains preview interaction until manual refresh and offers actual-size custom viewports" |  |
| WLS-R66 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "retains preview interaction until manual refresh and offers actual-size custom viewports" |  |
| WLS-R67 | verified | unit (`tests/unit/web-layout.test.ts`) "uses a restrictive preview policy without imposing it on portable exports" |  |
| WLS-R68 | missing | — |  |
| WLS-R69 | missing | — |  |
| WLS-R70 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "authors tracks and metadata and restores a saved starter snapshot"; unit (`tests/unit/web-layout.test.ts`) "round-trips authoring options and escapes custom metadata while rejecting CSS injection" | Writing mode is validated by the model but not selected in a test |
| WLS-R71 | missing | — |  |
| WLS-R72 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "formats and applies code, compiles CSS and runs scripts only with opt-in"; unit (`tests/unit/web-layout.test.ts`) "keeps enabled source in project backups and exports matching CSS without script breakout" |  |
| WLS-R73 | implemented | `MonacoEditor.tsx`; lazy import in `CodePanel.tsx` | No test enables it |
| WLS-R74 | missing | — |  |
| WLS-R75 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "formats and applies code, compiles CSS and runs scripts only with opt-in" | The error path is not tested |
| WLS-R76 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "formats and applies code, compiles CSS and runs scripts only with opt-in" |  |
| WLS-R77 | implemented | `compiler.worker.ts`; `CodePanel.tsx` | No test compiles JS or cancels |
| WLS-R78 | missing | — |  |
| WLS-R79 | implemented | `CodePanel.tsx` | No test |
| WLS-R80 | implemented | `zip` in `CodePanel.tsx` | No test downloads the ZIP; asset entries are not included |
| WLS-R81 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "formats and applies code, compiles CSS and runs scripts only with opt-in" |  |
| WLS-R82 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "formats and applies code, compiles CSS and runs scripts only with opt-in" | The 100-message bound is not asserted |
| WLS-R83 | implemented | `run(true)` in `CodePanel.tsx` | No test runs the scan |
| WLS-R84 | implemented | `CodePanel.tsx` | A static paragraph; no checklist |
| WLS-R85 | missing | — |  |
| WLS-R86 | missing | — |  |
| WLS-R87 | missing | — |  |
| WLS-R88 | missing | — |  |
| WLS-R89 | missing | — |  |
| WLS-R90 | missing | — |  |
| WLS-R91 | missing | — | Duplicate block ids are refused by the project schema only |
| WLS-R92 | missing | — |  |
| WLS-R93 | missing | — |  |
| WLS-R94 | implemented | `projectWarnings` in `layout-engine.ts` | No test |
| WLS-R95 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "edits a layout and exports the same content, theme and metadata"; e2e (`tests/e2e/web-layout.spec.ts`) "applies appearance drafts to previews and exports, with print and reduced-motion recovery"; unit (`tests/unit/web-layout.test.ts`) "escapes hostile text in metadata and content without executing it"; unit (`tests/unit/web-layout.test.ts`) "includes editable language, canonical, author and social metadata" |  |
| WLS-R96 | missing | — | No asset library exists; the visual page uses no external files |
| WLS-R97 | verified | unit (`tests/unit/web-layout.test.ts`) "binds layout and breakpoint output to the same project as the preview" | The CSS and HTML builders are compared; the button is not pressed |
| WLS-R98 | implemented | `WebLayoutWorkspace.tsx` | No test |
| WLS-R99 | verified | unit (`tests/unit/web-layout.test.ts`) "includes editable language, canonical, author and social metadata"; e2e (`tests/e2e/web-layout.spec.ts`) "edits a layout and exports the same content, theme and metadata" |  |
| WLS-R100 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "preserves area drafts, accepts fractional spacing and keeps backups available with invalid metadata" | The HTML block itself is not asserted |
| WLS-R101 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "authors tracks and metadata and restores a saved starter snapshot"; unit (`tests/unit/web-layout.test.ts`) "round-trips authoring options and escapes custom metadata while rejecting CSS injection" |  |
| WLS-R102 | verified | unit (`tests/unit/web-layout.test.ts`) "round-trips authoring options and escapes custom metadata while rejecting CSS injection" |  |
| WLS-R103 | partial | unit (`tests/unit/web-layout.test.ts`) "includes editable language, canonical, author and social metadata" | Only og:title is asserted |
| WLS-R104 | implemented | `LayoutOptionsPanel.tsx` | No test |
| WLS-R105 | missing | — |  |
| WLS-R106 | missing | — | The ZIP manifest lists file names only (see Download code ZIP) |
| WLS-R107 | missing | — | HTML, CSS and JS source files are exported whole |
| WLS-R108 | missing | — | The print palette exists (see Theme) |
| WLS-R109 | verified | unit (`tests/unit/web-layout.test.ts`) "escapes hostile text in metadata and content without executing it"; unit (`tests/unit/web-layout.test.ts`) "round-trips authoring options and escapes custom metadata while rejecting CSS injection" |  |
| WLS-R110 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "restores a local draft and rejects invalid import without replacing work"; e2e (`tests/e2e/web-layout.spec.ts`) "preserves area drafts, accepts fractional spacing and keeps backups available with invalid metadata"; unit (`tests/unit/web-layout.test.ts`) "rejects CSS injection, unsafe links, duplicate IDs, reserved IDs, and malformed versions"; unit (`tests/unit/web-layout.test.ts`) "rejects oversized projects and excessive blocks before they reach rendering" |  |
| WLS-R111 | verified | unit (`tests/unit/web-layout.test.ts`) "round-trips the actual starter with all five component patterns"; unit (`tests/unit/web-layout.test.ts`) "round-trips authoring options and escapes custom metadata while rejecting CSS injection"; unit (`tests/unit/web-layout.test.ts`) "keeps enabled source in project backups and exports matching CSS without script breakout"; unit (`tests/unit/web-layout.test.ts`) "validates nested blocks and preserves descendants through duplicate, remove and export"; unit (`tests/unit/web-layout.test.ts`) "validates appearance and exports motion, layers and a final print palette"; unit (`tests/unit/web-layout.test.ts`) "resolves typed token aliases and JSON pointers without losing source references" |  |
| WLS-R112 | verified | unit (`tests/unit/web-layout.test.ts`) "migrates legacy projects without altering flow and rejects unsafe area maps" |  |
| WLS-R113 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "restores a local draft and rejects invalid import without replacing work" |  |
| WLS-R114 | implemented | `WebLayoutWorkspace.tsx` | No test |
| WLS-R115 | missing | — | Local storage is used; no IndexedDB |
| WLS-R116 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "authors tracks and metadata and restores a saved starter snapshot" |  |
| WLS-R117 | implemented | `ProjectLibrary.tsx` | No test presses either button |
| WLS-R118 | missing | — | Comparison lists project fields as JSON |
| WLS-R119 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "undoes a typing session and supports project shortcuts outside text fields"; unit (`tests/unit/web-layout.test.ts`) "groups consecutive text edits without losing undo boundaries or redo branches" | Undo of format and visual operations beyond block removal is not asserted |
| WLS-R120 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "undoes a typing session and supports project shortcuts outside text fields" |  |
| WLS-R121 | missing | — | Parent, Move and Remove are reachable by keyboard; focus is not managed after them |
| WLS-R122 | verified | e2e (`tests/e2e/app.spec.ts`) "every registered suite opens with guidance, privacy status, and a usable workspace" |  |
| WLS-R123 | implemented | No `fetch`, `XMLHttpRequest` or `WebSocket` under `src/tools/web-layout/`; privacy text in `web-layout-studio.meta.ts` | No test blocks the network |
| WLS-R124 | implemented | `.tasks/items/T-repository-dark-contrast-20261004-b7d2.md` does not list this route among the dark-theme failures | No default test stores a theme and loads this route; the previews show the page’s own Theme, independent of the site theme |
| WLS-R125 | partial | e2e (`tests/e2e/web-layout.spec.ts`) "reflows editing controls in portrait and landscape without page overflow" | Tested at 320, 844 and 1920 px |
| WLS-R126 | verified | e2e (`tests/e2e/accessibility.spec.ts`) "has no serious or critical axe violations at <route>" |  |
| WLS-R127 | verified | e2e (`tests/e2e/web-layout.spec.ts`) "reflows editing controls in portrait and landscape without page overflow" |  |
| WLS-R128 | implemented | `WebLayoutWorkspace.tsx` | No test asserts the roles |

## Open work

1. WLS-R85 to WLS-R93 diagnostics; WLS-R71 direction and writing-mode diagnostics.
2. WLS-R74 abbreviation expansion; WLS-R78 HTML minification; WLS-R105 social image and favicon; WLS-R96 portable single-file export; WLS-R106 export manifest; WLS-R107 component exports; WLS-R108 print workflow; WLS-R60 Tailwind mapping.
3. WLS-R10 breakpoint cascade; WLS-R11 container-query lab; WLS-R05 track resizing; WLS-R26 outlines and logical properties; WLS-R23 and WLS-R24 scaffolds and form controls; WLS-R27 to WLS-R31 asset library, SVG workshop, Web Component sandbox, interaction states and reusable library; WLS-R35, WLS-R40, WLS-R42, WLS-R46, WLS-R48, WLS-R61 typography and appearance gaps; WLS-R68 and WLS-R69 preview synchronization and media conditions; WLS-R115 IndexedDB persistence; WLS-R118 version comparison; WLS-R121 focus restoration.
4. Tests for the `implemented` and `partial` rows: WLS-R06 and WLS-R07 Flexbox controls, WLS-R21 starters, WLS-R103 social tags, WLS-R125 widths 390 to 2560 px, WLS-R124 dark theme with a project open, and the other `implemented` rows.

## Known limitations

- Same-engine iframe previews are CSS viewport comparisons, not Safari or Chrome device emulation.
- Parent scripts cannot force native CSS media features on arbitrary iframes; media-condition previews would be approximations.
- Scripts run in the code frame can hang that frame; stop and restart without scripts.
- Local storage holds the project and the snapshot library; large drafts are bounded by its quota.

## Verification evidence

- 2026-10-05, `expand/web-layout-studio` from `main` @ `e83420d6`: `pnpm tool:check web-layout-studio --base origin/main` 57/128, no errors; `pnpm docs:sync` and `pnpm docs:check` passed; `pnpm exec vitest run tests/unit/cad-progress.test.ts tests/unit/sheets-wave-b.test.ts tests/unit/deployment-config.test.ts` 23 passed.

## Change log

- 2026-10-05 — Created: 128 requirements as built at `e83420d6`.

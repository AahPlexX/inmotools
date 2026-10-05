---
tool: fiber-craft-workstation
folder: src/tools/fiber-craft
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-09-15-fiber-craft-workstation-design.md
tracker: src/tools/fiber-craft/TRACKER.md
updated: 2026-10-04
---

# Fiber Craft Workstation — tracker

## Resume here

On `origin/main`. 33 of 65 requirements verified (FC-R01 … FC-R65; `pnpm tool:check fiber-craft-workstation`); crochet complete, counted-thread complete except FC-R37 (blocked on manufacturer color-data provenance), knitting Slice 4 and publishing Slice 7 in progress. Next action: FC-R47 (written knitting instructions) on `expand/fiber-craft-workstation` via `pnpm task:start`. Blocker: FC-R37 only.

## Documents

- Spec (design, FC-R01 … FC-R65): [2026-09-15-fiber-craft-workstation-design.md](../../../docs/superpowers/specs/2026-09-15-fiber-craft-workstation-design.md)
- Plan with the verified function ledger and handoff state: [2026-09-15-fiber-craft-workstation.md](../../../docs/superpowers/plans/2026-09-15-fiber-craft-workstation.md) — the single source for which FC functions are done
- Crochet completion ledger (CR- functions): [fiber-craft-crochet-completion.md](../../../docs/fiber-craft-crochet-completion.md)
- FC-37 provenance research: [fiber-craft-fc37-catalog-provenance-2026-09-19.md](../../../docs/fiber-craft-fc37-catalog-provenance-2026-09-19.md)
- Task state: `.tasks/IN_PROGRESS.md` "Fiber Craft Workstation"
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/fiber-craft-*.test.ts` (8 files); browser tests: `tests/e2e/fiber-craft.spec.ts`

## Requirement status

IDs are `FC-R01` … `FC-R65` (formerly `FC-01` … `FC-65`, same numbers; the plan, ledgers, `.tasks/` history, code comments and test titles keep the former IDs). FC-R37 is blocked (see Documents).

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| FC-R01 | partial | "edits, keys, saves, and restores a counted-thread chart" | One shell switches crochet round/grid, counted-thread and knitting chart modes; embroidery and quilting canvases are not built. |
| FC-R02 | verified | "round-trips commits and progress markers through bounded undo and redo history"; "edits crochet charts, exports patterns, moves a portable project, and restores the local session" | |
| FC-R03 | verified | "edits crochet charts, exports patterns, moves a portable project, and restores the local session" | |
| FC-R04 | verified | "round-trips the complete local crochet document without losing embedded project data"; "round-trips counted-thread stitches, knots, and backstitch lines without losing chart data" | |
| FC-R05 | partial | "edits individual crochet stitches by pointer and keyboard and charts an amigurumi increase round"; "resizes, mirrors, and clears the crochet grid and stamps title and credit on exports" | Stepped zoom on crochet charts; pan and physical-unit rulers are not built. |
| FC-R06 | partial | "mirror and flip move painted cells to the opposite side without changing the count"; "rotating swaps a rectangular grid and drops row progress that no longer describes the same rows" | Whole-grid mirror and rotate on crochet grids; selection-scoped transforms and radial repeat are not built. |
| FC-R07 | verified | "edits crochet charts, exports patterns, moves a portable project, and restores the local session"; "crochet views pass axe in every theme (including hovered buttons), fit the viewport, and set a useful page title" | |
| FC-R08 | partial | "edits individual crochet stitches by pointer and keyboard and charts an amigurumi increase round" | Keyboard and pointer stitch editing on crochet and knitting charts; complete keyboard/touch authoring across all disciplines is open (plan, Slice 1). |
| FC-R09 | verified | "creates a polar chart with the requested stitch count per round"; "new rounds use the canonical polar node schema required by rendering and persistence" | |
| FC-R10 | verified | "maps every US single/double-crochet-family stitch to its correct UK term"; "provides finite vector primitives for every supported crochet symbol" | |
| FC-R11 | verified | "C2C diagonals cover every <rows> x <cols> grid cell exactly once" | |
| FC-R12 | verified | "filet runs reconstruct every row width without losing open or filled cells" | |
| FC-R13 | verified | "amigurumi analysis classifies growth and target drift across an entire shaping curve" | |
| FC-R14 | verified | "written round compiler stays synchronized with the visual chart in both dialects" | |
| FC-R15 | verified | "validator explains incomplete, target, and structural consumption mismatches"; "flags rows whose stitch count does not match the expected count" | |
| FC-R16 | verified | "CYC yarn table is complete, ordered, unique, and internally valid without one test per category" | |
| FC-R17 | missing | — | Embroidery digitizing (plan, Slice 6). |
| FC-R18 | missing | — | Embroidery digitizing (plan, Slice 6). |
| FC-R19 | missing | — | Embroidery digitizing (plan, Slice 6). |
| FC-R20 | missing | — | Embroidery digitizing (plan, Slice 6). |
| FC-R21 | missing | — | Embroidery digitizing (plan, Slice 6). |
| FC-R22 | missing | — | Embroidery digitizing (plan, Slice 6). |
| FC-R23 | missing | — | Embroidery digitizing (plan, Slice 6). |
| FC-R24 | missing | — | Embroidery digitizing (plan, Slice 6). |
| FC-R25 | missing | — | Embroidery digitizing (plan, Slice 6). |
| FC-R26 | missing | — | Quilting and patchwork (plan, Slice 5). |
| FC-R27 | missing | — | Quilting and patchwork (plan, Slice 5). |
| FC-R28 | missing | — | Quilting and patchwork (plan, Slice 5). |
| FC-R29 | missing | — | Quilting and patchwork (plan, Slice 5). |
| FC-R30 | missing | — | Quilting and patchwork (plan, Slice 5). |
| FC-R31 | missing | — | Quilting and patchwork (plan, Slice 5). |
| FC-R32 | missing | — | Quilting and patchwork (plan, Slice 5). |
| FC-R33 | missing | — | Quilting and patchwork (plan, Slice 5). |
| FC-R34 | missing | — | Quilting and patchwork (plan, Slice 5). |
| FC-R35 | verified | "stores every supported cross, half, quarter, and three-quarter stitch at an addressable cell"; "keeps French knots and backstitch lines on the same grid and generates one unique legend symbol per used color" | |
| FC-R36 | verified | "quantizes image pixels into a bounded counted-thread palette and full-cross grid"; "honors the color-count limit with and without dithering"; "edits, keys, saves, and restores a counted-thread chart" | |
| FC-R37 | partial | "matches a target to the nearest supplied floss using CIEDE2000" | Generic CIEDE2000 matcher only; manufacturer palettes blocked on data provenance ([research](../../../docs/fiber-craft-fc37-catalog-provenance-2026-09-19.md)). |
| FC-R38 | verified | "edits, keys, saves, and restores a counted-thread chart" | |
| FC-R39 | verified | "persists fabric-count settings and finds isolated same-color confetti stitches"; "edits, keys, saves, and restores a counted-thread chart" | |
| FC-R40 | verified | "estimates floss yardage and whole-skein counts per color from fabric count, stitches, and strand count (FC-40)" | |
| FC-R41 | verified | "tags backstitch lines with a technique layer and rejects an unsupported one (FC-41)" | |
| FC-R42 | verified | "keeps French knots and backstitch lines on the same grid and generates one unique legend symbol per used color"; "keeps generated legend symbols unique beyond twelve imported colors" | |
| FC-R43 | verified | "locks grid cell proportions to the measured stitch/row gauge and updates when gauge changes"; "edits, keys, saves, and restores a counted-thread chart" | |
| FC-R44 | verified | "switches flat versus in-the-round row direction semantics"; "edits, keys, saves, and restores a counted-thread chart" | |
| FC-R45 | verified | "paints and clears standard single-stitch symbols without mutating the source"; "stamps a bounded cable across its full stitch width and clears the whole cross from any segment" | |
| FC-R46 | verified | "flags only complete color gaps longer than the project threshold" | |
| FC-R47 | missing | — | Next knitting function (plan, Slice 4). |
| FC-R48 | missing | — | Knitting (plan, Slice 4). |
| FC-R49 | missing | — | Knitting (plan, Slice 4). |
| FC-R50 | verified | "edits crochet charts, exports patterns, moves a portable project, and restores the local session" | |
| FC-R51 | verified | "edits crochet charts, exports patterns, moves a portable project, and restores the local session" | |
| FC-R52 | verified | "bidirectionally maps grid and round chart counts to finished dimensions" | |
| FC-R53 | partial | "converts the measured span and keeps the physical gauge identical in both directions" | Crochet gauge span converts between in and cm; switching across all measurement-bearing disciplines is open (plan, Slice 1). |
| FC-R54 | verified | "persists measured gauge and normalizes CYC project classification without duplicate technique tags" | |
| FC-R55 | verified | "accessible round description contains layout, progress, stitch names, colors, and dialect changes"; "accessible grid description reports every row structurally without depending on color alone" | |
| FC-R56 | verified | "builds a multi-page vector pattern book with project metadata, legend, and instructions" | |
| FC-R57 | missing | — | SVG/DXF cutter export (plan, Slice 7). |
| FC-R58 | missing | — | Embroidery bundle export (plan, Slice 7). |
| FC-R59 | verified | "bounds PNG export scales and produces stable export filenames"; "edits crochet charts, exports patterns, moves a portable project, and restores the local session" | |
| FC-R60 | verified | "lists project, yarn, hook, gauge, every used color with its stitch count, and every used stitch"; "prints the same project materials as a PDF and includes it in the release bundle" | |
| FC-R61 | partial | "saves trimmed values and leaves every other field alone"; "the pattern book carries the license and notes so a shared PDF keeps its credit" | Crochet title, author, license and notes are editable and carried into the PDF; embedding in every export format is open (plan, Slice 7). |
| FC-R62 | missing | — | Export-time tag review (plan, Slice 7). |
| FC-R63 | verified | "edits crochet charts, exports patterns, moves a portable project, and restores the local session" | |
| FC-R64 | verified | "reopens the Fiber workspace while offline after the PWA is installed" | |
| FC-R65 | partial | "builds the PDF, written pattern, materials list, and project file under the title-based names"; "zips every file so it can be unpacked byte for byte, and names the archive after the title" | Crochet "Export everything (.zip)" packs a fixed file set; a selectable queue of export targets is open (plan, Slice 7). |

## Open work

1. Remaining `partial` and `missing` requirements, in the plan's slice order (next: FC-R47, FC-R48, FC-R49).
2. FC-R37 after a defensible manufacturer-data source exists.
3. Site-wide theme (the site-wide theme selector): Fiber Craft keeps its own light / dark-room / high-contrast modes (FC-R07) and should default to the site theme.

## Known limitations

- Listed per function in the plan's handoff state.

## Verification evidence

- 2026-10-04, `fix/fiber-craft-workstation` on `6cbcb83e` (documentation-only change): `pnpm tool:check fiber-craft-workstation --base origin/main` incomplete 33/65 (verified 33, partial 8, missing 24), no errors; Fiber units 111/111; `pnpm test:unit` 3719 passed, 1 timeout in `tests/unit/markdown-citation.test.ts` under load, that file alone 32/32; `tsc` and `pnpm build` (403 precache entries) pass; `tests/e2e/fiber-craft.spec.ts` + `tests/e2e/app.spec.ts` 28/30 with 2 load timeouts (load average 31 on 8 cores), the timed-out cases rerun with `--workers=1` 4/4; `tests/e2e/accessibility.spec.ts` for the route and keyboard focus 4/4.
- 2026-10-01, `main` @ `27366f62`: Fiber units 111/111; `tests/e2e/fiber-craft.spec.ts` 12 passed (desktop and mobile); accessibility spec for the route 2 passed. Code on `main` is identical to `origin/feature/fiber-craft-workstation` @ `b6d3ec4e`.

## Change log

- 2026-10-04 — Requirement status table added with one row per spec requirement; IDs converted from `FC-nn` to `FC-Rnn` (T-fiber-craft-workstation-20261003-124b). The 33 `verified` rows are the plan ledger's done functions, each citing existing test titles; other rows are `partial` or `missing` per the plan's Delivery slices.
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`. Restored the design spec, plan, crochet ledger and FC-37 research from `origin/feature/fiber-craft-workstation` @ `b6d3ec4e`; the repository cleanup had brought the code to `main` without them.

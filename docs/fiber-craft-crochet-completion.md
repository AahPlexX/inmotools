# Fiber Craft — crochet completion ledger

**As of:** 2026-09-30

This is the single handoff record for the **crochet** part of the Fiber Craft Workstation
(`src/tools/fiber-craft/`, route `#/fiber-craft-workstation`). Counted-thread and knitting work is tracked
separately in `.tasks/IN_PROGRESS.md` and the Fiber Craft design/plan under `docs/superpowers/`. Nothing
in this file changes those scopes.

The crochet workstream is complete when every `CR-` function below is **Done** with fresh evidence, its
work is on `origin/main`, and the Fiber entry in `.tasks/IN_PROGRESS.md` reflects it.

## Already accepted before this ledger

Design functions FC-09 (round canvas), FC-10 (US/UK symbol library), FC-11 (C2C compiler), FC-12
(filet), FC-13 (amigurumi shaping), FC-14 (written-pattern compiler), FC-15 (count validator), and FC-16
(CYC yarn/hook reference) are implemented, together with the shared functions crochet relies on: FC-02,
FC-03, FC-04, FC-07, FC-50–FC-52, FC-54–FC-56, FC-59, FC-63, FC-64. Their design text is in
`docs/superpowers/specs/2026-09-15-fiber-craft-workstation-design.md`.

## Ledger

| ID | Function | Design ref | Status |
|----|----------|------------|--------|
| CR-01 | Edit any stitch position in a round chart: click or keyboard select, place, replace, clear, fill a round, clear a round, remove the last round | FC-08, FC-09 | **Done** |
| CR-02 | Increases, decreases and loop work: same-base increase legs, sc3tog/dc2tog/dc3tog symbols, front/back loop only; validation, written text, description, PNG and PDF all understand them | FC-10, FC-13–FC-15 | **Done** |
| CR-03 | Grid tools: resize the C2C/filet grid (1–80 per side), apply the gauge-recommended size, clear, mirror, flip and rotate | FC-06, FC-52 | **Done** |
| CR-04 | Title & credit: edit title, author, license and notes; exports are disabled while edits are unsaved; the PDF cover and PDF subject carry the license and notes | FC-61, FC-62 | **Done** |
| CR-05 | Copy or download the written pattern (rounds, C2C rows, filet rows) as plain text, built from the same model as the PDF | FC-14 | **Done** |
| CR-06 | Materials list as spreadsheet CSV and matching paginated printable PDF: project, yarn, weight class, hook, gauge, finished size, every used color and stitch with counts. Yarn amount is intentionally not estimated; both outputs say so | FC-60 | **Done** |
| CR-07 | Chart zoom (60–300%, buttons or `+` `-` `0` on the chart) and pan (scroll, drag, keyboard) for round and grid charts | FC-05 | **Done** |
| CR-08 | Metric/imperial: switching the gauge unit converts the swatch span and size fields instead of relabelling them; sizes, recommendations and the materials list follow. Hooks already show mm and US together | FC-53 | **Done** |
| CR-09 | "Export everything (.zip)": pattern PDF, materials PDF, chart PNG, share card, written pattern, materials CSV and project file in one download | FC-65 | **Done** |
| CR-10 | Final UX, copy, SEO, accessibility and responsive audit, including the catalog entry wording | — | **Done**, see "CR-10 audit notes" |
| CR-11 | Integration onto `origin/main` and closing the crochet items in `.tasks/` | Governance §4 | In progress, see Integration |

**Progress: 10 of 11 complete.** Update this count, the table, and the Fiber entry in `.tasks/IN_PROGRESS.md`
in the same commit as any change to a row.

## CR-10 audit notes

Audited on desktop (1440 px) and phone (iPhone 13 profile) in Chromium, round and grid modes, in the
light, dark-room and high-contrast themes.

Found and fixed:

- Dark-room secondary buttons turned light on hover while their text stayed light (contrast 1.07:1),
  because `--surface-strong` was not defined for the Fiber themes. Defined for dark-room and
  high-contrast.
- The "same base stitch" checkbox was 22 px; now 24 px inside a 44 px label.
- The C2C/filet grid hard-coded 12 columns, so resized grids wrapped; it now follows the chart size and
  zoom.
- Switching the gauge unit relabelled the numbers instead of converting them.
- Catalog copy was generic and did not describe what crochet users can do; rewritten in plain language,
  keeping the "Counted-Thread Pattern Workbench" phrase another test asserts.

Checked and clean: no horizontal page overflow at either width; axe reports no violations in all three
themes for round and grid modes, including with a secondary button hovered (kept as a permanent browser
test).

Known limits, deliberately not changed here:

- The site is one hash-routed page with a single static `<title>` and description, so search engines
  cannot index individual tools. The workspace sets a descriptive title and description while it is open
  (tab, bookmarks, history) and restores the originals on leave. Per-tool indexable pages are a
  site-wide change already tracked in `.tasks/BACKLOG.md` ("Tool-route search indexing").
- The desktop inspector column is long (stitch editing, title & credit, export, project file). Grouping
  it into collapsible sections is tracked in `.tasks/BACKLOG.md`.

## How crochet is modelled

- **Round chart** (`PolarChart`): every position is a `PolarStitchNode`. A round's capacity is the number
  of stitches the round *produces*. `symbolId` is one of the ids in `engines/symbol-library.ts`.
- **Increases are not a symbol.** They follow the Craft Yarn Council convention that parentheses group
  stitches worked into one stitch: the second and later legs carry `sharedBase: true` and consume no new
  base stitch. A 6 → 12 round is therefore six pairs (`sc`, then `sc` with `sharedBase`), and it
  validates. Position 1 of a round can never share a base.
- **Loop work** is `loop: 'front' | 'back'`, written FLO/BLO (Craft Yarn Council abbreviations).
- Both modifiers are optional, so drafts and `.craftproj` files saved earlier still open. Malformed values
  are rejected by `persistence-engine.ts`.
- **Written text is derived, never authored.** `engines/crochet-pattern-engine.ts` groups nodes into
  base-stitch units, then compresses identical neighbours: `6 sc [Primary]`, `(2 sc in next st) 6 times
  [Primary]`, `2 sc BLO [Primary]`.
- **Grid chart** (`GridChart`) is one model for both C2C and filet; a cell is filled when it has a color or
  symbol.

## Where things live

| Concern | File |
|---------|------|
| Document edits (pure, tested) | `crochet-document-engine.ts` |
| Symbols, US/UK names | `engines/symbol-library.ts` |
| Glyph geometry and modifier marks | `engines/crochet-glyph-engine.ts` |
| Canvas and PNG drawing, pointer hit-testing | `engines/crochet-chart-renderer.ts` |
| Written pattern, validator, growth | `engines/crochet-pattern-engine.ts` |
| Accessible description | `engines/chart-description-engine.ts` |
| Project file validation | `persistence-engine.ts`, `project-bundle-engine.ts` |
| Pattern-book PDF | `pattern-export-engine.ts` |
| Workspace shell and handlers | `FiberCraftWorkspace.tsx` |
| Stitch editing panel | `CrochetStitchEditor.tsx` |
| Zoom, grid tools, insights, yarn, gauge, details, title & credit panels | `CrochetPatternPanels.tsx` |
| Tests | `tests/unit/fiber-craft-crochet-editing.test.ts`, `fiber-craft-crochet-pattern.test.ts`, `fiber-craft-state.test.ts`, `fiber-craft-geometry.test.ts`, `fiber-craft-project.test.ts`; browser: `tests/e2e/fiber-craft.spec.ts` |

## Working rules for the next agent

- Fetch first: `git fetch origin feature/fiber-craft-workstation:refs/remotes/origin/feature/fiber-craft-workstation`
  (a bare `git fetch origin <branch>` does not update the tracking ref). Another session edits
  `FiberCraftWorkspace.tsx` for knitting and counted-thread work, so keep crochet changes in crochet
  files or in small, additive edits to the shared shell.
- Write the failing test first, but only for uncovered contracts. Reuse existing engines; do not add a
  dependency for anything the repository already provides.
- Validation commands: `pnpm exec vitest run tests/unit/fiber-craft-*.test.ts`, `pnpm build`, and
  `pnpm exec playwright test tests/e2e/fiber-craft.spec.ts --workers=1`. In the cloud sandbox the
  pre-installed Chromium is at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`; pass it through a
  local, uncommitted Playwright config as `launchOptions.executablePath`.
- Glyph marks for modifiers are original geometric marks that follow the Council's functional
  conventions; do not import the Council's downloadable artwork.

## Integration

Crochet commits are fast-forwarded (never forced) onto `feature/fiber-craft-workstation`, the one Fiber
Craft branch, which is what open pull request `feat: continue Fiber Craft Workstation crochet shell`
(`feature/fiber-craft-workstation` → `main`) carries. Do not open a second pull request for crochet work.
Fetch with an explicit refspec first and confirm the push is a fast-forward. CR-11 closes when that
pull request has merged into `main` and the Fiber entry in `.tasks/` has been reconciled.

## Evidence log

| Date | What | Result |
|------|------|--------|
| 2026-09-29 | Baseline on merged `feature/fiber-craft-workstation` + `origin/main` | Fiber unit files 4/4, 67/67 tests |
| 2026-09-29 | CR-01, CR-02 | Fiber unit files 5/5, 85/85 tests; `tsc --noEmit` clean; production build passes (383-entry precache); Fiber browser spec 8/8 across desktop and mobile Chromium, including offline reopen |
| 2026-09-29 | CR-03, CR-04, CR-05 | Fiber unit files 6/6, 97/97 tests; `tsc --noEmit` clean; production build passes; Fiber browser spec 10/10 across desktop and mobile Chromium |
| 2026-09-29 | CR-06, CR-07, CR-08; also fixed a hard-coded 12-column grid layout that broke resized grids | Fiber unit files 6/6, 102/102 tests; `tsc --noEmit` clean; production build passes; Fiber browser spec 10/10 across desktop and mobile Chromium |
| 2026-09-29 | CR-09 | Fiber unit files 6/6, 104/104 tests; `tsc --noEmit` clean; production build passes; Fiber browser spec 10/10 across desktop and mobile Chromium |
| 2026-09-29 | CR-10 | Full unit suite 216 files, 2218/2218 tests; `tsc --noEmit` clean; production build passes; Fiber browser spec 12/12 across desktop and mobile Chromium (adds axe in every theme, overflow, and page-title checks) |
| 2026-09-30 | FC-60 printable materials completion | Same project rows now feed formula-safe CSV and a paginated PDF, both downloadable and included in the release ZIP. Focused Fiber units 105/105, production TypeScript/Vite/PWA build, and full Fiber browser spec 12/12 across desktop/mobile Chromium pass locally; [dedicated CI run 36722583886](https://github.com/AahPlexX/inmotools/actions/runs/36722583886) passes on exact source `a161df70`. No dependency added. |
| 2026-09-30 | Reconciled `origin/main` `61a9ed56` into the Fiber branch | Preserved both sides of shared task records and E2E selection; Fiber units 105/105, E2E selection 4/4, production TypeScript/Vite/PWA build (387 precache entries), and Fiber browser 12/12 desktop/mobile passed locally. The six-scan axe case needed a test-local 90-second limit after the merged app exceeded Playwright's default 30 seconds; all assertions then passed. This is branch synchronization, **not** CR-11 closure: the Fiber master plan was 30/65 at reconciliation and main integration is gated on all 65 functions and release validation. |

Repository-wide unit gate is **not yet green for this reconciliation**: the default Vitest 5-second timeout failed in the unrelated Markdown citation suite, which passed 32/32 when isolated with `--testTimeout=30000`. The all-unit rerun with that override produced no final result before it was stopped. Re-run the repository gate and obtain a conclusive result before any mainline merge; do not infer zero regressions from the focused gates above.

# Fiber Craft Workstation

**Status:** In progress (Slice 1 shared shell; Slice 2 crochet engine complete; Slice 3 counted-thread in progress; Slice 7 publishing in progress)
**Branch:** `feature/fiber-craft-workstation` (dedicated; no premature merge to `main`)
**Owner:** Autonomous, tool-scoped only (no repo-wide authority)
**Function progress:** **24/65 complete**

## Goal

Add a fully local-first, non-destructive textile-craft pattern designer and multi-format export
workstation covering crochet, machine embroidery digitizing, quilting/patchwork, counted
cross-stitch, and knitting colorwork/cables, following the InmoTools architecture exactly: one
registry-driven catalog entry, a lazy workspace loader, pure/testable engines separated from
React, Web Workers for expensive computation, and zero server dependency. No cloud services,
accounts, or remote storage are introduced. No proprietary hardware/USB spooler integration is
introduced; export targets are universal open or industry-standard files a crafter can hand to
any compatible application or machine.

## Architecture

- **Canonical document model:** a framework-independent `FiberCraftDocument` (see
  `src/tools/fiber-craft/fiber-craft-types.ts`) is the single source of truth per project, mirroring
  the `FloorplanProject` / `VectorDocument` / `CrystalDocument` pattern already used by this catalog.
- **Per-discipline engines:** pure, framework-independent modules under
  `src/tools/fiber-craft/engines/` (grid/polar geometry, symbol compilation, written-instruction
  compilers, gauge math, yardage/floss math, embroidery stitch-path compilers). No engine imports
  React.
- **Workers:** raster-to-chart quantization, embroidery underlay/path generation, and large-grid
  redraw/export all run in module Web Workers, following the existing request-correlation and
  terminate-on-completion pattern used by `diagram-engine.ts` / `log-runner.ts` / `floorplan-worker.ts`.
- **Rendering:** native Canvas 2D for grids/mandala/cable diagrams; no WebGL/3D dependency is
  required for this tool.
- **Registration:** one `catalog.ts` entry, one lazy loader in `workspaces.tsx`, one hash-route
  alias in `App.tsx` — added only once the workspace shell exists, so no partially wired route ships.
- **Persistence:** browser-local structured storage (IndexedDB) for in-progress projects, plus a
  single-file `.craftproj` (JSON) bundle for portable import/export. Nothing is uploaded.

## Tech Stack (exact pinned versions already in this repository)

React `19.2.8`, TypeScript `7.0.2`, Vite `8.2.2`, Vitest `4.1.11`, Playwright `1.63.0`, pnpm
`12.3.4`, Tailwind/project CSS, Canvas 2D, Web Workers, existing `pdf-lib` `1.17.1` (multi-page
pattern-book PDF and vector PDF chart export), existing `svgo` (browser build, SVG chart/vector
export), existing `papaparse` `5.7.0` (materials/floss/yardage CSV export), existing `culori`
`4.0.2` (CIEDE2000/OKLab color-distance for floss/thread palette matching).

**No new npm dependencies are added yet.** Property-based testing is a deliberate future option
for combinatorial engines: current official fast-check guidance recommends `fast-check` plus
`@fast-check/vitest` for Vitest, with deterministic replay and shrinking. The current crochet
state space remains compact enough that Vitest parameterization plus invariant-focused tests
provides high signal without lockfile churn. Re-evaluate property-based testing when transforms,
quantization, binary embroidery encoders, or similarly high-dimensional logic lands.

## Verified function ledger

The following design-spec functions are complete and accepted on the dedicated branch:

- **FC-02** layered undo/redo history.
- **FC-03** browser-local autosave and explicit recovery.
- **FC-04** portable `.craftproj` save/load with validated local import and lossless project-state round trip.
- **FC-07** light, dark-room, high-contrast screen modes plus dedicated high-contrast print styling; Canvas pixels use matching display palettes.
- **FC-09** concentric crochet round canvas.
- **FC-10** US/UK crochet symbol library rendered as reusable vector glyph geometry on the chart.
- **FC-11** C2C compiler with diagonal row-by-row block counts.
- **FC-12** filet crochet grid mode and filled/open mesh written output.
- **FC-13** amigurumi round-shaping assistant.
- **FC-14** synchronized written crochet compiler with US/UK terminology.
- **FC-15** stitch-count/growth validation.
- **FC-16** yarn-weight / hook / gauge reference guidance with editable project values.
- **FC-35** precision counted-thread grid with full, half, quarter, and three-quarter stitches plus visible French-knot and backstitch overlays on the same addressable grid.
- **FC-36** worker-backed raster-to-counted-thread quantization with adjustable chart rows/columns, bounded color count, optional Floyd–Steinberg dithering, PNG/JPEG-compatible browser image decode, and lossless shared-project metadata preservation when the generated chart is applied.
- **FC-42** automatically regenerated printable symbol key mapping every used project color to a unique symbol plus editable floss brand/palette and code identity.
- **FC-50** persistent tap-to-track row/round progress.
- **FC-51** active row/round highlighting plus one-action active-row recentering.
- **FC-52** bidirectional physical-dimension and gauge scaling for grid and round crochet charts.
- **FC-54** editable CYC project-level difficulty plus persisted technique tags.
- **FC-55** structured accessible chart description generated from the same canonical round/grid data as the visual chart.
- **FC-56** vector multi-page crochet pattern-book PDF with cover, project/material reference, legend, vector diagram, and paginated written instructions.
- **FC-59** high-resolution crochet PNG export at selectable 1×–4× bitmap resolution for both round and grid charts.
- **FC-63** generated 1200×630 social preview PNG with project title/details, crochet badge, and canonical chart thumbnail.
- **FC-64** offline PWA project use verified through the generated service worker plus the same portable `.craftproj` workflow; Fiber reloads and remains usable offline without an account.

Latest acceptance milestone: dedicated Fiber run `35342821108` at code head
`a4ddb403a88fbc3275f7801d31a0f108c082337d` passed **64/64** focused unit/selector checks,
the production TypeScript/Vite build, a 151-entry production PWA precache, and **6/6** Playwright
cases using one worker across desktop and mobile Chromium. FC-36 is covered by pure quantizer
contracts plus the counted-thread browser journey, which imports an actual PNG through the module
worker and verifies a generated 3×4 full-cross chart with a bounded palette. The same run retains
crochet editing/export/recovery, counted-thread editing/key/save/restore, and offline PWA reload.
The head commit after FC-36 is Vector-only; it is unrelated but must remain in branch history.

## Delivery slices

- [x] **Slice 0 — Foundation.** This plan, the design spec, and the canonical
      `FiberCraftDocument` / per-craft type model.
- [ ] **Slice 1 — Shared workspace shell.** Canvas host, tool/mode switcher, palette/inspector
      panels, undo/redo history, autosave, catalog/route registration behind a working landing view.
      **In progress:** crochet Canvas/grid hosts, palette/inspector, reversible history, IndexedDB
      draft restore, catalog entry, lazy loader, canonical alias, portable `.craftproj`, progress
      tracking, one-action active-row recenter, screen/print themes, gauge scaling, project
      classification, accessible chart descriptions, and verified offline PWA behavior are accepted.
      Cross-discipline mode switching is now wired for crochet and counted-thread, while shared
      zoom/pan/rulers, selection transforms, metric/imperial switching across all measurement-bearing
      disciplines, and complete keyboard/touch authoring remain open.
- [x] **Slice 2 — Crochet engine.** Polar/round canvas, row-and-grid canvas, universal US/UK
      vector symbol set, C2C/filet compiler, written-pattern compiler, stitch-count validator,
      amigurumi shaping, and yarn/hook reference guidance are implemented and accepted through the
      focused unit/build/desktop-mobile browser gate.
- [ ] **Slice 3 — Cross-stitch & counted-thread engine.** **In progress:** FC-35 precision counted
grid, FC-36 worker-backed raster quantization, and FC-42 auto-generated floss symbol key are accepted.
FC-37 has a tested generic CIEDE2000 matcher but remains open and provenance-blocked: current
first-party research does not support redistributing scraped/transcribed manufacturer color cards,
and Madeira explicitly warns its digital colors are not authoritative enough for precise matching.
See `docs/fiber-craft-fc37-catalog-provenance-2026-09-19.md`. Preserve the original DMC/Anchor/
Madeira/Sullivans requirement; do not substitute a hand-picked/community table. FC-38 black-and-white
symbol-over-color mode is the next independent executable slice; FC-39 fabric-count/confetti controls,
FC-40 floss length/skein math, and FC-41 expanded blackwork/hardanger specialty layer remain open.
Basic backstitch required by FC-35 does not by itself close the broader FC-41 specialty scope.
- [ ] **Slice 4 — Knitting colorwork/cable engine.** Gauge-corrected non-square grid, knit/cable
      symbol matrix, stranded-float analyzer.
- [ ] **Slice 5 — Quilting & patchwork engine.** Parametric block designer, foundation
      paper-piecing generator, rotary-cutting calculator, layout/sashing arranger, fabric-swatch
      draping, yardage/backing estimator.
- [ ] **Slice 6 — Embroidery digitizing engine.** Vector path authoring, satin/tatami/underlay
      generation, color-stop/trim sequencing, DST/EXP/JEF/PES encoders, appliqué placement export.
- [ ] **Slice 7 — Export, metadata & publishing.** **In progress:** FC-56 vector multi-page
      pattern-book PDF, FC-59 high-resolution PNG, FC-63 1200×630 social preview, and FC-64 offline
      PWA project use are accepted. SVG/DXF cutter export, embroidery bundle export,
      materials/shopping export, metadata/copyright and export-time tag review, and batch export
      remain open.
- [ ] **Slice 8 — Verification & merge readiness.** Full unit + Playwright + axe-core sweep,
      catalog/homepage link assertion, production build, deployment check. No merge to `main`
      until this slice is green.

## Testing strategy

- **TDD scope:** add tests for new contracts, demonstrated regressions, and high-value invariants; do not create one test per helper or duplicate coverage already enforced by a dependency-backed integration path.
- **Pure engine work:** favor Vitest tables/invariants. The current focused Fiber contract is **64 checks across 5 files**; FC-36 added quantization, dithering, generated-legend scale, metadata-preservation, matcher, and validation contracts without adding a test-only dependency.
- **Browser cadence:** `.github/workflows/fiber-craft.yml` runs one sequential Playwright worker across **6 cases**: crochet/edit/export/recovery, counted-thread edit/key/save/restore, and offline PWA reload on desktop and mobile Chromium. Keep this coherent matrix instead of multiplying browser loops.
- **Build gate:** production TypeScript/Vite build is required for user-facing or engine/state changes that can affect bundling. Documentation-only changes do not invalidate accepted code evidence.
- **Workflow hygiene:** counted-thread coverage is consolidated into existing focused suites; do not recreate a standalone `fiber-craft-cross-stitch.test.ts`. The current workflow contains no stale reference to that deleted file.
- **Local concurrency:** the canonical local preview port is 4173, but other worktrees may legitimately own it. Never terminate an unrelated listener; use an isolated temporary port/config for targeted Fiber validation when needed. CI owns its own clean runner.

## Handoff state

- Fetch `origin/feature/fiber-craft-workstation` before every implementation round; concurrent Fiber and unrelated branch commits have landed on this branch. Reconcile non-destructively and never force-push over newer work.
- `src/tools/fiber-craft/CountedThreadPanel.tsx`, `engines/counted-thread-engine.ts`, `engines/counted-image-engine.ts`, `counted-image-worker-client.ts`, and `counted-image.worker.ts` are authoritative for current counted-thread/image-import behavior. The superseded `CountedThreadWorkspace.tsx` and `counted-thread-workspace.css` were deliberately removed; do not resurrect them.
- FC-35, FC-36, and FC-42 are accepted. FC-37 is **not** accepted: only its generic CIEDE2000 nearest-match engine exists. Read `docs/fiber-craft-fc37-catalog-provenance-2026-09-19.md` before touching FC-37. Current first-party evidence shows DMC expressly restricts color-card/conversion-card reproduction, Anchor restricts reproduction of site content, Madeira warns digital colors are not authoritative, and no explicit Sullivans redistribution license was found in the official materials reviewed.
- Preserve the original four-manufacturer FC-37 requirement. Do not replace it with a convenience subset, scraped/transcribed protected material, or third-party/community conversion table. Reuse existing `culori@4.0.2`; no new color-distance dependency is needed. FC-37 may close only after a defensible manufacturer-permission/licensed-data route (or another user-approved provenance route) is evidenced.
- FC-38 is now the next independent executable counted-thread slice while FC-37's provenance path remains blocked; its symbol-over-color print mode can reuse FC-42 symbol assignment without waiting for manufacturer identities.
- Current branch history includes unrelated Vector-only commit `a4ddb40` after FC-36. Preserve it; do not rewrite history to make Fiber commits contiguous.

## Verification gate (every slice)

- Focused pure-engine/state coverage must pass for touched Fiber modules.
- `pnpm build` must pass, including TypeScript no-emit validation and production Vite bundling.
- The consolidated Fiber Playwright workflow must pass on desktop and mobile Chromium for changed
  user-facing flows.
- No regression to any existing catalog entry, route alias, or shared component.
- Whole-repository and Pages validation is required before final integration to `main`.

## Spec

`docs/superpowers/specs/2026-09-15-fiber-craft-workstation-design.md`

# Fiber Craft Workstation

**Status:** In progress (Slice 1 shared shell; Slice 2 crochet engine near-complete)
**Branch:** `feature/fiber-craft-workstation` (dedicated; no premature merge to `main`)
**Owner:** Autonomous, tool-scoped only (no repo-wide authority)
**Function progress:** **11/65 complete**

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
state space remains compact enough that Vitest `test.for` plus invariant-focused tests provides
high signal without lockfile churn. Re-evaluate property-based testing when transforms,
quantization, binary embroidery encoders, or similarly high-dimensional logic lands.

## Verified function ledger

The following design-spec functions are complete and accepted on the dedicated branch:

- **FC-02** layered undo/redo history.
- **FC-03** browser-local autosave and explicit recovery.
- **FC-09** concentric crochet round canvas.
- **FC-11** C2C compiler with diagonal row-by-row block counts.
- **FC-12** filet crochet grid mode and filled/open mesh written output.
- **FC-13** amigurumi round-shaping assistant.
- **FC-14** synchronized written crochet compiler with US/UK terminology.
- **FC-15** stitch-count/growth validation.
- **FC-16** yarn-weight / hook / gauge reference guidance with editable project values.
- **FC-50** persistent tap-to-track row/round progress.
- **FC-51** active row/round highlighting plus one-action active-row recentering.

**FC-10 remains intentionally uncounted.** The symbol definitions and US/UK naming switch are
present, but the chart still renders textual abbreviations rather than the required actual vector
crochet chart glyphs. It becomes complete only when the visual chart itself uses the symbol set.

## Delivery slices

- [x] **Slice 0 — Foundation.** This plan, the design spec, and the canonical
      `FiberCraftDocument` / per-craft type model.
- [ ] **Slice 1 — Shared workspace shell.** Canvas host, tool/mode switcher, palette/inspector
      panels, undo/redo history, autosave, catalog/route registration behind a working landing view.
      **In progress:** crochet Canvas/grid hosts, palette/inspector, reversible history, IndexedDB
      draft restore for round and grid documents, catalog entry, lazy loader, canonical alias,
      progress tracking, and one-action active-row recenter are implemented. Dedicated Fiber
      validation run `35046436107` at code head `7f213326` passed all 41 focused checks, the
      production TypeScript/Vite build, and the consolidated desktop/mobile Chromium workflow.
      Cross-discipline mode switching, portable `.craftproj`, shared zoom/pan/rulers, transforms,
      screen/print themes, and complete keyboard/touch authoring remain open.
- [ ] **Slice 2 — Crochet engine.** Polar/round canvas, row-and-grid canvas, universal US/UK
      symbol set, C2C/filet compiler, written-pattern compiler, stitch-count validator.
      **Near-complete:** round and grid editing, C2C/filet compilers, written instructions,
      stitch/growth validation, amigurumi targets, CYC yarn/hook guidance, persistent progress, and
      responsive browser workflows are accepted. **FC-10 vector chart-symbol rendering is the
      remaining Slice 2 blocker.**
- [ ] **Slice 3 — Cross-stitch & counted-thread engine.** Precision grid, raster quantization
      worker, DMC/Anchor/Madeira/Sullivan floss matcher (CIEDE2000 via `culori`), symbol/legend
      generator, skein/yardage calculator.
- [ ] **Slice 4 — Knitting colorwork/cable engine.** Gauge-corrected non-square grid, knit/cable
      symbol matrix, stranded-float analyzer.
- [ ] **Slice 5 — Quilting & patchwork engine.** Parametric block designer, foundation
      paper-piecing generator, rotary-cutting calculator, layout/sashing arranger, fabric-swatch
      draping, yardage/backing estimator.
- [ ] **Slice 6 — Embroidery digitizing engine.** Vector path authoring, satin/tatami/underlay
      generation, color-stop/trim sequencing, DST/EXP/JEF/PES encoders, appliqué placement export.
- [ ] **Slice 7 — Export, metadata & publishing.** Multi-page pattern-book PDF, SVG/DXF cutter
      export, materials CSV, metadata/copyright studio, OpenGraph preview card, offline PWA bundle
      and `.craftproj` packaging.
- [ ] **Slice 8 — Verification & merge readiness.** Full unit + Playwright + axe-core sweep,
      catalog/homepage link assertion, production build, deployment check. No merge to `main`
      until this slice is green.

## Testing strategy

- **Pure engine work:** favor invariant-focused Vitest checks and `test.for` data tables over one
  hand-written test per input example. Keep small deterministic regression fixtures for previously
  demonstrated defects and standards-bound values.
- **Spot-check cadence:** implement coherent coupled changes sequentially, then validate after the
  milestone rather than after every helper/function. A second spot-check is warranted when a change
  crosses engine/state/UI/persistence boundaries or when the previous check exposed a defect.
- **Dedicated Fiber gate:** `.github/workflows/fiber-craft.yml` runs on Fiber-relevant paths only:
  frozen install → 41 focused unit/selector checks → production TypeScript/Vite build → one
  consolidated Playwright workflow on desktop and mobile Chromium.
- **Avoid no-value reruns:** documentation-only commits and unrelated Crystal-only upstream changes
  do not invalidate accepted Fiber evidence. Whole-repository/Pages gates remain required at
  integration and merge-readiness boundaries.
- **Property-based escalation:** add exactly pinned `fast-check` and `@fast-check/vitest` only when
  generated cases and shrinking materially reduce maintenance for high-dimensional logic. Do not
  add a dependency merely to replace a small, readable invariant table.

## Verification gate (every slice)

- Focused pure-engine/state coverage must pass for touched Fiber modules.
- `pnpm build` must pass, including TypeScript no-emit validation and production Vite bundling.
- The consolidated Fiber Playwright workflow must pass on desktop and mobile Chromium for changed
  user-facing flows.
- No regression to any existing catalog entry, route alias, or shared component.
- Whole-repository and Pages validation is required before final integration to `main`.

## Spec

`docs/superpowers/specs/2026-09-15-fiber-craft-workstation-design.md`

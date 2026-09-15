# Fiber Craft Workstation

**Status:** In progress (Slice 1 — shared shell; Slice 2 foundations started)
**Branch:** `feature/fiber-craft-workstation` (dedicated; no premature merge to `main`)
**Owner:** Autonomous, tool-scoped only (no repo-wide authority)

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

**No new npm dependencies are added.** Reputable, actively maintained JavaScript/TypeScript
libraries for writing machine-embroidery binary formats (DST/EXP/JEF/PES) do not exist on npm at a
verifiable-stable pin (the closest prior art, `pyembroidery`, is Python-only; `PEmbroider` targets
Processing/Java). Consistent with this repository's existing precedent of hand-writing the DXF
R12/AC1009 and R2000/AC1015 entity encoders for Floorplan Studio instead of taking on an
unverified dependency, this workstation implements its own small, pure, unit-tested binary
encoders for DST, EXP, JEF, and PES against their publicly documented, openly described binary
layouts. This keeps every dependency in the lockfile exactly pinned and independently verifiable.

## Delivery slices

- [x] **Slice 0 — Foundation.** This plan, the design spec, and the canonical
      `FiberCraftDocument` / per-craft type model.
- [ ] **Slice 1 — Shared workspace shell.** Canvas host, tool/mode switcher, palette/inspector
      panels, undo/redo history, autosave, catalog/route registration behind a working landing view.
      **In progress:** the crochet-first Canvas2D shell, palette/inspector, reversible history,
      IndexedDB draft restore, catalog entry, lazy loader, canonical alias, and focused browser
      acceptance spec are implemented. Cross-discipline mode switching and fresh browser/build
      verification remain open; the shared CI currently stops first on unrelated Vector path-motion
      unit failures.
- [ ] **Slice 2 — Crochet engine.** Polar/round canvas, row-and-grid canvas, universal US/UK
      symbol set, C2C/filet compiler, written-pattern compiler, stitch-count validator.
      **Started:** shared grid/polar geometry, gauge math, the crochet symbol library, and focused
      unit coverage are present. C2C/filet compilation, written instructions, and interactive
      row/grid editing remain open.
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

## Verification gate (every slice)

- `pnpm exec vitest run` for the touched engines (pure-function unit coverage before UI).
- `pnpm exec playwright test` for the touched workspace routes across the desktop/mobile viewport
  sweep already standard in this repository.
- `pnpm exec tsc` production type-check and `pnpm build` must stay green.
- No regression to any existing catalog entry, route alias, or shared component.

## Spec

`docs/superpowers/specs/2026-09-15-fiber-craft-workstation-design.md`

# Crystal Lattice Studio — Phase 3 Plan (Reciprocal Space & Diffraction)

**Status:** Planned — not started
**Date:** 2026-09-22
**Upstream design:** `docs/superpowers/specs/2026-09-11-crystal-lattice-studio-design.md` (Phase 3, lines 434–436)
**Tracker entry:** `.tasks/NEXT.md` → TASK-023
**Predecessor evidence:** Phase 2 completion `docs/superpowers/plans/2026-09-13-crystal-lattice-studio-phase-2-completion.md`

## Scope
Phase 3 delivers reciprocal-space and diffraction capability on top of the completed Phase 1–2 workstation: reciprocal lattice, planes/directions, stereographic projection, Ewald sphere, Wigner–Seitz/Brillouin geometry, reflection enumeration, X-ray/neutron/electron/single-crystal/Laue simulation, observed overlays, and reflection tables.

## Hard constraints (do not violate)
- **Reuse, don't rebuild.** `cell-engine.ts` exports tested `reciprocalMatrix` + `reciprocalMetricTensor`; use them as the reciprocal-lattice foundation.
- **Privacy model:** engines stay pure and backend-free; no network upload path.
- **Bounded output:** follow the established `MAX_*`-cap guard pattern (e.g. `expandSupercell`, `generatePeriodicImages`) for reflection enumeration and simulation grids.
- **TDD:** write the failing unit test first for each new engine function.

## Workstreams
1. `reciprocal-engine.ts` — reciprocal basis, d-spacing, plane/direction indexing. Tests: `tests/unit/crystal-reciprocal.test.ts`.
2. `diffraction-engine.ts` — reflection enumeration with systematic absences; wavelength-parameterised X-ray/neutron/electron simulation. Tests: `tests/unit/crystal-diffraction.test.ts`.
3. UI wiring — read-only diffraction panel in `CrystalWorkspace.tsx` after both engines are green.
4. E2E — `tests/e2e/crystal-lattice-studio-phase3.spec.ts` + spec-selection map update.

## Acceptance
`tsc` clean, production build clean, all new unit + browser specs green from fresh evidence, and the Phase-3 capability set in the master design accounted for. On completion: move the Crystal entry's milestone in `IN_PROGRESS.md` forward, record evidence, and author a Phase-3 completion doc.

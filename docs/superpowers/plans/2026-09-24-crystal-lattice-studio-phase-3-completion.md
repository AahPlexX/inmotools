# Crystal Lattice Studio — Phase 3 Completion (Reciprocal Space & Diffraction)

**Status:** Complete
**Date:** 2026-09-24
**Upstream design:** `docs/superpowers/specs/2026-09-11-crystal-lattice-studio-design.md` (Phase 3, lines 434–436)
**Tracker:** TASK-023 in `.tasks/NEXT.md`; plan `docs/superpowers/plans/2026-09-22-crystal-lattice-studio-phase-3.md`

## What was delivered

All work landed directly on `main` (no feature branches, no open PRs), each commit TDD'd (failing test written first, verified red, then green) and verified with `tsc --noEmit` plus the full unit suite.

| Capability | Files | Evidence |
|---|---|---|
| Reciprocal lattice | `reciprocal-engine.ts` (reciprocalBasis, reciprocalLatticeParameters, millerToCartesian, planeNormal, dSpacing) | `crystal-reciprocal.test.ts` 4 tests; commit `403fe062` |
| Diffraction / reflection enumeration | `diffraction-engine.ts` (centeringAllows P/A/B/C/I/F/R, twoThetaFor, enumerateReflections Friedel-collapsed and bounded, simulatePowderPattern) | `crystal-diffraction.test.ts` 5 tests; commit `4904b31d` |
| Structure-factor-weighted intensities | `structure-factor-engine.ts` (structureFactor, structureFactorIntensity) + `document` option on simulatePowderPattern | `crystal-structure-factor.test.ts` 4 tests + 2 diffraction tests; commits `20452fc3`, `af7322d8` |
| Stereographic projection | `stereographic-engine.ts` (stereographicPole, stereographicProjection) | `crystal-stereographic.test.ts` 3 tests; commit `60571071` |
| Ewald sphere | `ewald-engine.ts` (ewaldIntersection, reflectionsInBraggRange) | `crystal-ewald.test.ts` 4 tests; commit `2daef857` |
| First Brillouin zone | `brillouin-engine.ts` (firstBrillouinZone: 26 bisector half-spaces, triple-plane vertices, ordered face rings, divergence-theorem volume) | `crystal-brillouin.test.ts` 3 tests; commit `fb2d960a` |
| Single-crystal & Laue | `single-crystal-engine.ts` (simulateSingleCrystal, simulateLaueBackReflection) | `crystal-single-crystal.test.ts` 3 tests; commit `7eb3dc6a` |
| Observed-pattern import & overlay | `observed-pattern-engine.ts` (parseObservedPattern, overlayResiduals); diffraction-panel overlay control | `crystal-observed-pattern.test.ts` 4 tests + e2e; commits `7eb3dc6a`, `8ff11784` |
| Reflection-table export | `structure-export-engine.ts` targets `reflections-csv`, `reflections-hkl` | `crystal-reflection-export.test.ts` 4 tests; commit `4f800253` |
| Powder-profile broadening | `diffraction-engine.ts` `broadenPowderPattern` (Gaussian/Lorentzian/pseudo-Voigt, 20k-point cap) | `crystal-powder-profile.test.ts` 3 tests; commit `4f800253` |
| UI surfaces | `CrystalDiffractionPanel.tsx`, `CrystalReciprocalPanel.tsx` wired into `CrystalWorkspace.tsx` | `crystal-lattice-studio-phase3.spec.ts` 5 browser tests; commits `f1b16db4`, `fcf4904a`, `0ba5a500`, `3dc2c070` |

**Verification at completion:** full unit suite 153 files / 1505 tests pass; `tsc --noEmit` clean on tip `4f800253`. The production-build gate runs in GitHub Actions (the local sandbox OOMs on the repo-wide Vite build; this is an environment limit, and prior builds were green at `ce878ada`).

## Design coverage notes

- Phase-3 scope items from the master design — reciprocal lattice, planes/directions, stereographic projection, Ewald sphere, Wigner–Seitz/Brillouin geometry, reflection enumeration, X-ray/neutron/electron/single-crystal/Laue simulation, observed overlays, reflection tables — are all implemented as tested engines; user-facing ones are wired into panels with e2e coverage routed through the spec-selection gate.
- **Known model limits (documented in code, by design):** atomic scattering factors use the atomic-number model (exact at sinθ/λ → 0); Cromer–Mann form factors are a follow-up. Intensities degrade uniformly to the kinematic model when any site lacks a verified factor — never mixed per reflection.
- **Documented follow-up:** orientation-resolved single-crystal rotation sweeps (the current single-crystal function returns the orientation-agnostic feasible superset).

## Browser-lane history (kept for the next agent)

The first phase-3 e2e run failed because the spec used a button locator on the landing tile; fixed to the repo's hash-route convention (`./#/tools/crystal-lattice-studio`) in `87b0b8e4`. Any future phase-3 e2e additions must follow that convention.

## Gate to Phase 4

Phase 4 (refinement, fields, voids, morphology — design lines 438–442) may now begin as a new tracked task. Prerequisites already satisfied: all engines Phase 4 builds on (structure factors, observed-pattern parsing, reflection tables) exist and are tested.

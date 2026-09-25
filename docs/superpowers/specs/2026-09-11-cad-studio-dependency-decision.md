# CAD Studio Dependency Decision

**Date:** 2026-09-11

## Purpose

This document is the implementation-time dependency gate for CAD Studio. It supplements `docs/superpowers/specs/2026-09-11-cad-studio-design.md` and overrides any earlier dependency choice where current release evidence conflicts with the earlier draft.

## Non-negotiable dependency policy

1. Every new direct dependency must use the latest stable release available at implementation time.
2. Every direct dependency version must be pinned exactly in `package.json`; `^`, `~`, `*`, tag-only, git-branch, and floating URL ranges are prohibited.
3. A version is eligible only after the current stable release is verified against both:
   - the dependency's official release/repository/package metadata; and
   - npmjs.com package/version information.
4. If those sources conflict materially, the dependency is not installed until the conflict is resolved. We do not guess which version npm will serve.
5. Existing transitive dependency ranges are controlled by their upstream packages and are not rewritten merely to satisfy this policy. Direct CAD dependencies remain exact pins.
6. License and browser/runtime requirements are rechecked before each new dependency is added.

## Verified direct dependencies for the first implementation pass

| Package | Exact version | Role | Official verification | npm verification | Decision |
| --- | ---: | --- | --- | --- | --- |
| `occt-wasm` | `5.0.0` | Exact Open CASCADE B-Rep kernel, STEP/STL/glTF I/O, tessellation, measurements, shape evolution | Official repository release `v5.0.0` published 2026-09-10; package metadata reports version 5.0.0 | npmjs.com reports `5.0.0` as `latest` | Approved |
| `manifold-3d` | `3.5.3` | Secondary watertight mesh path and additive-manufacturing mesh analysis | Official repository release `v3.5.3` published 2026-09-07; tagged package metadata reports 3.5.3 | npmjs.com versions view reports `3.5.3` as `latest` | Approved |
| `ml-matrix` | `6.15.0` | Numerical linear algebra for CAD Studio's own sketch constraint solver | Official repository package metadata reports 6.15.0 | npmjs.com reports `6.15.0` as the current release | Approved |

The repository already pins `three` exactly at its current project version, so CAD Studio reuses that existing dependency instead of adding another rendering package.

## Deferred dependency: `brepjs`

The earlier CAD design selected `brepjs` as a high-level B-Rep facade. Current official repository evidence shows a stable `brepjs-v19.0.3` release and matching tagged source metadata. However, the currently retrievable npmjs.com package page still reports `19.0.1` as its latest visible package version.

Because the required official+npm corroboration is not presently consistent, `brepjs` is **not** installed in the first implementation pass. This is a deliberate safety decision, not a rejection of the library.

The kernel boundary therefore begins directly against `occt-wasm@5.0.0`, behind CAD Studio's own narrow adapter interface. If npmjs.com later corroborates the same latest stable `brepjs` release, a later migration may adopt it only after compatibility tests prove no project-schema or behavior regression.

## Kernel licensing and delivery

`occt-wasm`'s TypeScript/build tooling is MIT OR Apache-2.0 while the compiled OCCT WebAssembly artifact inherits LGPL-2.1-only. The web application must keep the WASM replaceable rather than embedding it irreversibly into a proprietary binary. CAD Studio therefore loads the kernel as a separate route-lazy WASM asset/URL and retains third-party notices and source/replaceability obligations.

`manifold-3d` is Apache-2.0. `ml-matrix` is MIT.

## Browser boundary

`occt-wasm@5.0.0` requires modern WebAssembly capabilities including SIMD, tail calls, and WASM exception handling. CAD Studio must perform a runtime capability probe and present an explicit unsupported-browser state rather than failing silently.

The exact kernel remains single-threaded per WASM instance. Geometry execution therefore lives in a dedicated module worker. Parallel modeling, if later justified, uses separate worker/kernel instances rather than unsafe shared mutable kernel state.

## Package installation rule

When the dependency installation commit is made, the intended direct entries are exactly:

```json
{
  "occt-wasm": "5.0.0",
  "manifold-3d": "3.5.3",
  "ml-matrix": "6.15.0"
}
```

Do not add `brepjs` until its latest stable version is simultaneously confirmed by its official release metadata and npmjs.com.

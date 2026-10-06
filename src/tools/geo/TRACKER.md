---
tool: geojson-simplifier
folder: src/tools/geo
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-geojson-simplifier-design.md
tracker: src/tools/geo/TRACKER.md
updated: 2026-10-05
---

# GeoJSON Simplifier — tracker

## Resume here

55 requirements: 37 verified, 12 implemented, 4 partial, 2 missing, 0 prohibited. Next action: build the missing rows in the Open work order, starting with GJS-R52 (reprojection of legacy coordinate systems). No blocker.

## Documents

- Spec: [2026-10-05-geojson-simplifier-design.md](../../../docs/superpowers/specs/2026-10-05-geojson-simplifier-design.md)
- Older design and plan (history): [2026-08-29-next-ten-local-tools-design.md](../../../docs/superpowers/specs/2026-08-29-next-ten-local-tools-design.md) (Tool 14), [2026-08-29-next-ten-local-tools.md](../../../docs/superpowers/plans/2026-08-29-next-ten-local-tools.md)
- Tool notes: [README.md](README.md)
- Dark-theme contrast task: [T-repository-dark-contrast-20261004-b7d2](../../../.tasks/items/T-repository-dark-contrast-20261004-b7d2.md)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/geo.test.ts`; browser tests: `tests/e2e/geo.spec.ts`, `tests/e2e/audit-hardening.spec.ts`, `tests/e2e/accessibility.spec.ts`, `tests/e2e/app.spec.ts`

## Requirement status

`unit` = `tests/unit/geo.test.ts`; `e2e` = `tests/e2e/geo.spec.ts` unless another file is named.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| GJS-R01 | verified | e2e "a slower previous file read cannot overwrite a newer GeoJSON selection" |  |
| GJS-R02 | verified | unit "warns about positions beyond three elements and out-of-range WGS84 latitude"; e2e "point collections preview as separate points and linked view works without dragging"; e2e "binds simplification output to its settings, format, inspection, and statistics" |  |
| GJS-R03 | verified | e2e "a slower previous file read cannot overwrite a newer GeoJSON selection" |  |
| GJS-R04 | verified | e2e "a slower previous file read cannot overwrite a newer GeoJSON selection" |  |
| GJS-R05 | implemented | `loadFile` in `GeoWorkspace.tsx` | No test loads an invalid file |
| GJS-R06 | verified | e2e "binds simplification output to its settings, format, inspection, and statistics"; unit "reports feature count, coordinate count, and finite bounds without spread operations" |  |
| GJS-R07 | verified | unit "rejects unknown types and non-finite positions" |  |
| GJS-R08 | verified | unit "requires FeatureCollection members to be Features and Feature properties to be object or null" |  |
| GJS-R09 | verified | unit "rejects short or unclosed polygon rings instead of letting topology silently repair them" |  |
| GJS-R10 | verified | unit "requires LineStrings to contain at least two positions" |  |
| GJS-R11 | verified | unit "rejects null children inside a GeometryCollection" |  |
| GJS-R12 | verified | unit "checks Feature IDs and bounding-box member shapes" |  |
| GJS-R13 | verified | unit "warns about positions beyond three elements and out-of-range WGS84 latitude" |  |
| GJS-R14 | verified | unit "flags projected-looking longitudes and legacy CRS metadata before export" |  |
| GJS-R15 | verified | e2e "all interoperability warnings remain reachable instead of silently truncating after twenty" |  |
| GJS-R16 | verified | e2e "binds simplification output to its settings, format, inspection, and statistics" |  |
| GJS-R17 | implemented | `setDecimalsSafe` in `GeoWorkspace.tsx` | No test changes the decimals |
| GJS-R18 | implemented | `setRetainSafe` in `GeoWorkspace.tsx` | No test changes the detail target |
| GJS-R19 | verified | e2e "binds simplification output to its settings, format, inspection, and statistics" |  |
| GJS-R20 | verified | unit "rounds coordinate components without touching feature properties" |  |
| GJS-R21 | verified | unit "removes bbox members that would become stale when coordinates are rounded" |  |
| GJS-R22 | verified | unit "preserves shared topology while reducing removable intermediate vertices" |  |
| GJS-R23 | verified | unit "returns the same GeoJSON preview with the requested TopoJSON export in one pass" |  |
| GJS-R24 | verified | unit "preserves altitude on every retained arc position and in TopoJSON export", "preserves altitude in TopoJSON when all detail is retained" |  |
| GJS-R25 | verified | unit "refuses lossy 3D simplification when one horizontal position has conflicting extra dimensions" |  |
| GJS-R26 | verified | unit "preserves altitude on every retained arc position and in TopoJSON export" |  |
| GJS-R27 | verified | e2e "binds simplification output to its settings, format, inspection, and statistics" | The refusal of invalid output has no test |
| GJS-R28 | implemented | `collapsedFeatureCount` and `rootShape` in `simplifyTopology` and `GeoWorkspace.tsx` | No test asserts the collapsed count |
| GJS-R29 | verified | e2e (`tests/e2e/audit-hardening.spec.ts`) "GeoJSON Simplifier runs simplification off the main thread" |  |
| GJS-R30 | implemented | `typeof Worker === 'undefined'` branch in `runSimplify` | No test |
| GJS-R31 | implemented | `running` state in `GeoWorkspace.tsx` | No test |
| GJS-R32 | verified | e2e "Stop terminates an in-flight worker and leaves no downloadable partial result" |  |
| GJS-R33 | implemented | `worker.onmessage` and `worker.onerror` in `runSimplify` | No browser test triggers a failure |
| GJS-R34 | partial | e2e (`tests/e2e/audit-hardening.spec.ts`) "GeoJSON Simplifier runs simplification off the main thread" | Output positions are asserted; the byte metrics are checked only through the statistics file |
| GJS-R35 | verified | e2e "binds simplification output to its settings, format, inspection, and statistics" |  |
| GJS-R36 | verified | e2e "point collections preview as separate points and linked view works without dragging" |  |
| GJS-R37 | implemented | `GeoPreview` for `result.preview` in `GeoWorkspace.tsx` | No test inspects the Simplified preview |
| GJS-R38 | verified | e2e "point collections preview as separate points and linked view works without dragging" |  |
| GJS-R39 | verified | e2e "a large first geometry does not hide later features in the preview" |  |
| GJS-R40 | partial | e2e "point collections preview as separate points and linked view works without dragging" | Pan right and Reset are tested; Zoom in, Zoom out, Pan left, Pan up and Pan down are not |
| GJS-R41 | implemented | `onWheel` and pointer handlers in `GeoPreview.tsx` | No test drags or scrolls |
| GJS-R42 | implemented | `GeoPreview.tsx` | No test |
| GJS-R43 | verified | e2e "binds simplification output to its settings, format, inspection, and statistics"; e2e (`tests/e2e/audit-hardening.spec.ts`) "GeoJSON Simplifier runs simplification off the main thread" |  |
| GJS-R44 | verified | e2e "binds simplification output to its settings, format, inspection, and statistics" |  |
| GJS-R45 | verified | e2e "binds simplification output to its settings, format, inspection, and statistics" |  |
| GJS-R46 | verified | e2e "binds simplification output to its settings, format, inspection, and statistics"; e2e "Stop terminates an in-flight worker and leaves no downloadable partial result" |  |
| GJS-R47 | implemented | `save` checks `sourceToken` in `GeoWorkspace.tsx` | The result is cleared on file change (GJS-R03), so no test reaches this guard |
| GJS-R48 | verified | e2e (`tests/e2e/app.spec.ts`) "every registered suite opens with guidance, privacy status, and a usable workspace" |  |
| GJS-R49 | implemented | `geo-engine.ts`, `geo.worker.ts`, `GeoWorkspace.tsx` make no network call; privacy text in `geojson-simplifier.meta.ts` | No test blocks the network |
| GJS-R50 | verified | e2e "binds simplification output to its settings, format, inspection, and statistics" |  |
| GJS-R51 | missing | — | Only GeoJSON input is accepted today |
| GJS-R52 | missing | — | Today only the warning exists (GJS-R14) and coordinates are not reprojected |
| GJS-R53 | partial | `.tasks/items/T-repository-dark-contrast-20261004-b7d2.md` | The route is not among the dark-theme failures listed in that task; the preview background is the fixed colour `#fbfcfd` in `GeoPreview.tsx`; no test stores a theme and loads a file |
| GJS-R54 | partial | e2e "point collections preview as separate points and linked view works without dragging" | Tested at 320 px only |
| GJS-R55 | verified | e2e "point collections preview as separate points and linked view works without dragging"; e2e (`tests/e2e/accessibility.spec.ts`) "has no serious or critical axe violations at <route>" |  |

## Open work

1. GJS-R52 reprojection of legacy coordinate systems; GJS-R51 TopoJSON input.
2. GJS-R53 dark-theme check with a file loaded (fixed preview background); GJS-R54 widths 390 to 2560 px.
3. Tests for the `partial` and `implemented` rows: decimals and detail settings, invalid file load, Simplified preview, zoom and pan controls, drag and wheel, no-Worker fallback, failure status, metrics.

## Known limitations

- Simplification can remove important shape detail; the hint tells users to check the preview and coordinate counts.
- Legacy coordinate systems are warned about, not reprojected (GJS-R14).
- Conflicting altitudes at one horizontal position block topology-based output.
- Large inputs are bounded by browser memory; previews draw at most 5,000 positions.

## Verification evidence

- 2026-10-05, `expand/geojson-simplifier` from `main` @ `c371f847`: `pnpm tool:check geojson-simplifier --base origin/main` 37/55, no errors; `pnpm docs:sync` and `pnpm docs:check` passed; `pnpm exec vitest run tests/unit/cad-progress.test.ts tests/unit/sheets-wave-b.test.ts tests/unit/deployment-config.test.ts` passed.

## Change log

- 2026-10-05 — Created: 55 requirements as built at `c371f847`.

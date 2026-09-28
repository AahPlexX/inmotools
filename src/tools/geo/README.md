# GeoJSON Simplifier

Route: `#/tools/geojson-simplifier`. The catalog entry in `src/catalog.ts` supplies the title, summary, and usage guide. `GeoWorkspace.tsx` owns file and result state; `geo-engine.ts` validates and transforms data; `geo.worker.ts` runs simplification off the UI thread; `GeoPreview.tsx` draws the linked previews. Processing and downloads remain in the browser.

## User functions

| Function | Behavior and verification |
| --- | --- |
| Load | Accept a `.geojson` or JSON file; a new selection immediately clears the old result. A generation token prevents a slower earlier read from replacing the new file. Browser race test in `tests/e2e/geo.spec.ts`. |
| Validate | Check GeoJSON structure, positions, feature IDs, and bounding-box shape. Report longitude/latitude, extra-dimension, and legacy CRS interoperability warnings. Unit cases in `tests/unit/geo.test.ts`. |
| Inspect | Show the selected Feature's identifier, properties, and geometry type; paginate warnings. Browser tests cover both. |
| Configure | Choose coordinate decimals, detail retention, and GeoJSON or TopoJSON output. Any change invalidates the previous result. Browser settings test. |
| Simplify | Round coordinates, form shared TopoJSON arcs when needed, simplify arcs by weight, restore retained extra dimensions, and validate the output. The Stop control terminates the worker. Unit tests cover shape and dimensions; `tests/e2e/audit-hardening.spec.ts` covers worker use. |
| Compare | Show original/result position and byte counts and linked vector previews. Preview pan, zoom, and reset have visible button controls; drag and wheel also work. Browser preview and narrow-viewport test. |
| Export | Download the generated GeoJSON or TopoJSON and a JSON statistics file bound to the same source/settings snapshot. Byte counts describe the actual input and output files. Browser test reads the downloads. |
| Cancel | Stop a running simplification without publishing a partial result. The next run starts a new worker. |

## Data contract and limits

- GeoJSON coordinates are treated as WGS 84 longitude, latitude, and optional altitude under [RFC 7946](https://www.rfc-editor.org/rfc/rfc7946.html). The tool does not reproject legacy CRS data. Out-of-range coordinates and `crs` members produce warnings, so users can correct the source before export.
- Rounding removes existing `bbox` members because their values may become stale. Feature properties and root shape are preserved. Empty geometries can remain empty; output validation runs before download.
- Shared edges use the pinned [TopoJSON implementation and format](https://github.com/topojson/topojson-specification). Topology simplification compares horizontal coordinates. Conflicting extra dimensions at the same horizontal position are rejected for topology-based output to avoid silent loss.
- The preview is a local vector sketch, not a projection or geographic basemap. At most 5,000 positions are drawn per preview; exports retain all resulting positions. Point collections are drawn as separate points. Compare the downloaded data in a GIS before replacing a source file.
- The application uses hash routes and static GitHub Pages hosting. Google Search Central says fragment-based views are not reliably indexed as separate pages. Resolving that would require a shared routing and deployment change outside this tool.

## Verification and handoff

From the repository root run `pnpm exec vitest run tests/unit/geo.test.ts`, `pnpm build`, and `pnpm exec playwright test tests/e2e/geo.spec.ts` after building. The default Playwright config uses port 4173 and may attach to another worktree's preview server; use a dedicated port/config when parallel worktrees are active. Run `tests/e2e/audit-hardening.spec.ts` with a title filter for the GeoJSON worker case and `tests/e2e/accessibility.spec.ts` with a title filter for this route when validating a release.

Before integrating, read `GOVERNANCE.md`, reconcile the geo entry in `.tasks/`, and verify the exact `origin/main` tip and CI state. Keep changes to this tool and its catalog entry, focused tests, and geo-specific task records.

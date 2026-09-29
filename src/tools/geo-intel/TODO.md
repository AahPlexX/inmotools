# Geo Intelligence Hub — TODO (live tracker)

Slug: `geo-intelligence-hub` · Directory: `src/tools/geo-intel/` · Branch: `feature/geo-intelligence-hub` (cut from `origin/main` @ `1aa0a88`).

This file is the single live progress record for this tool while it is developed on its branch. Any agent picking this up continues from the first unchecked gate and the latest **Delivery Record** "Next batch (planned)" list.

## Scope boundary

- Only `src/tools/geo-intel/**` and `src/catalog.ts` are edited, plus the minimum registration/test surfaces listed under **Boundary exceptions**.
- `src/tools/geo/` (GeoJSON Simplifier) is never touched.
- No new npm dependencies: adding one would modify `package.json`/`pnpm-lock.yaml` (outside the boundary). Everything uses dependencies already pinned in `package.json` or in-house code with official test vectors.

### Boundary exceptions (required, minimal)

| Path | Change | Why it cannot be avoided |
| --- | --- | --- |
| `src/tools/workspaces.tsx` | One loader line for `geo-intelligence-hub` | `workspaceLoaders` is typed `Record<ToolSlug, …>`; adding the slug to `ToolSlug` in `catalog.ts` fails `tsc` without it. |
| `tests/unit/geo-intel-*.test.ts`, `tests/e2e/geo-intel.spec.ts` | New files only | `pnpm test:unit` runs `vitest run tests/unit`; tests elsewhere would never run in CI. No existing test file is modified. |
| `.tasks/*.md` | Reconcile at integration only | Governance requires `.tasks` to reflect integrated work; editing them on this branch would conflict with parallel branches. Done as gate G12. |

## Completion gates (deterministic finish line)

Each gate is checked only with fresh evidence (command + result recorded in the Delivery Record).

- [x] **G0 Plan** — TODO, source registry, feature list, decisions recorded.
- [x] **G1 Static data** — reproducible build script; bundled country table, country geometry, populated places, admin-1 names, IANA timezone polygons; manifest with sources, licenses, versions, sizes, timezone accuracy.
- [x] **G2 Core math** — provenance types, geodesy (distance, bearing, area, midpoint, destination), Plus Codes, DD/DMS/DDM/UTM/MGRS, query parser, projection, timezone math, offline solar model. Unit tests incl. official OLC and MGRS vectors.
- [x] **G3 Resilience + cache** — timeout, exponential backoff, circuit breaker, dedupe, per-host throttle gate, Dexie TTL cache, offline fallback. Unit tests with fake timers / fake-indexeddb.
- [x] **G4 Adapters** — one module per keyless source, normalized to provenance fields; fixture-driven unit tests.
- [x] **G5 Offline engines** — country point-in-polygon, timezone lookup, nearby places, admin-1 resolution; unit tests.
- [x] **G6 Synthesis** — query routing, adapter chains, unified provenance-tracked profile, batch postal pipeline; unit tests.
- [x] **G7 Exports** — JSON, CSV, PDF, iCal, SVG, PNG, ZIP, social card, metadata editor model; unit tests validate output structure.
- [x] **G8 UI** — workspace, map canvas, panels, tooltips, context menu, bottom-sheet drawers, responsive CSS.
- [x] **G9 Registration** — `catalog.ts` entry + `workspaces.tsx` loader; `tsc` clean.
- [x] **G10 Browser verification** — Playwright e2e (desktop + mobile projects) with network mocked; axe (existing catalog-driven spec) passes; manual viewport pass 375 px → 2560 px.
- [x] **G11 Full validation** — `pnpm test:unit`, `pnpm build`, relevant e2e green; baseline comparison recorded.
- [ ] **G12 Integration** — PR into `main`, CI green, `.tasks` reconciled, merged only after G0–G11. *(PR #89 open; CI green; remaining: `.tasks` reconciliation + merge on owner go-ahead.)*

Baseline before any change (2026-09-29, `1aa0a88`): `tsc --noEmit -p tsconfig.app.json` exit 0; `pnpm test:unit` 211 files / 2,119 tests passed.

## Verified source registry (browser-tested from the GitHub Pages origin on 2026-09-29)

| Adapter | Endpoint | Keyless | CORS | Policy / limits honoured | License / attribution |
| --- | --- | --- | --- | --- | --- |
| Zippopotam.us | `api.zippopotam.us/{cc}/{code}` | yes | yes | user-triggered, cached, 1 req/s | ODbL 1.0 / DbCL 1.0 (per its coverage page) |
| Postcodes.io | `api.postcodes.io/postcodes/{pc}`, `/outcodes/{oc}`, reverse `?lon&lat` | yes | yes | user-triggered, cached | OS OpenData (GB); ONSPD non-commercial only for NI `BT` codes (warning shown); service MIT |
| World Bank v2 | `api.worldbank.org/v2/country/{iso}/indicator/{ids}?source=2` | yes | yes | cached 7 days | CC BY 4.0 |
| Eurostat dissemination | `ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{dataset}` | yes | yes | cached 7 days | Eurostat reuse, attribution |
| Eurostat GISCO ID | `gisco-services.ec.europa.eu/id/nuts?x&y&geometry=N` | yes | yes | code only, no geometry | "© EuroGeographics for the administrative boundaries"; GISCO geodata is non-commercial |
| geoBoundaries | `www.geoboundaries.org/api/current/gbOpen/{ISO3}/{ADMn}/` → `media.githubusercontent.com` | yes | yes (github.com raw redirect is **not** CORS-safe; rewritten to media host) | user-triggered, cached 30 days | per-boundary `boundaryLicense` field (varies: CC BY 4.0, ODbL, …) + geoBoundaries citation |
| BigDataCloud client | `api.bigdatacloud.net/data/reverse-geocode-client` | yes | yes | **device's current location only** (fair-use policy) | attribution link |
| Photon (komoot demo) | `photon.komoot.io/api`, `/reverse` | yes | yes | reasonable volume, explicit submit only, no autocomplete | © OpenStreetMap contributors, ODbL |
| Nominatim (OSMF) | `nominatim.openstreetmap.org/search`, `/reverse` | yes | yes | **opt-in, off by default**; ≤1 req/s gate; no autocomplete, no batch, no grid; cached | © OpenStreetMap contributors, ODbL |
| Nager.Date v3 | `date.nager.at/api/v3/PublicHolidays/{year}/{cc}` | yes | yes | cached 7 days | attribution link |
| Sunrise-Sunset.org v2 | `api.sunrise-sunset.org/v2` | yes | yes | visible link required | visible link |
| SunriseSunset.io | `api.sunrisesunset.io/json` | yes | yes | fallback; visible link required | visible link |
| AWS Terrain Tiles | `s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png` | yes | yes | one tile per lookup, cached | Tilezen/joerd attribution (SRTM, 3DEP, ETOPO1, …) |
| Open-Elevation | `api.open-elevation.com/api/v1/lookup` | yes (≤500 coords/month/IP without key) | yes | fallback only, cached | SRTM (NASA/USGS) |
| Natural Earth 5.1.2 (bundled) | build-time | n/a | n/a | offline | public domain |
| GeoNames dumps (bundled) | `countryInfo.txt`, `admin1CodesASCII.txt` | n/a | n/a | offline | CC BY 4.0 |
| Wikidata P1622 (bundled) | SPARQL at build time | n/a | n/a | offline | CC0 |
| timezone-boundary-builder 2026d (bundled) | `timezones-with-oceans.geojson.zip` | n/a | n/a | offline | **ODbL** (not CC BY) |
| Open Location Code | in-house implementation of the published spec | n/a | n/a | offline | Apache-2.0 spec/test vectors |

### Excluded after verification

- **Open Topo Data public API** — returns no `Access-Control-Allow-Origin` on GET; browsers block it (confirmed `Failed to fetch` from the Pages origin). Its own site lists CORS as a paid-hosting feature. Replaced by AWS Terrain Tiles + Open-Elevation.
- **BigDataCloud for arbitrary coordinates** (map clicks, typed coordinates) — its fair-use policy restricts the free client endpoint to the device's current location. Arbitrary reverse geocoding uses Photon → Nominatim (opt-in) → offline country/timezone.
- **GISCO NUTS geometry bundling** — GISCO geodata terms are non-commercial; only the code-returning ID service is used.
- Everything listed as excluded in the brief (REST Countries live, Open-Meteo, credentialed providers, IP geolocation, unlimited autocomplete, File System Access as a requirement).

## Feature list (F-numbers are stable; gate in brackets)

1. F01 Universal search bar: place, lat/lon, postal+country, Plus Code, DMS/DDM, UTM, MGRS [G2,G6,G8]
2. F02 Consented device location (Geolocation API → BigDataCloud) [G4,G6,G8]
3. F03 Map click lookup (offline country/timezone instantly; Photon reverse on confirm) [G5,G6,G8]
4. F04 Postal code → profile (Zippopotam; Postcodes.io depth for GB) [G4,G6]
5. F05 Forward geocode (Photon; Nominatim opt-in last resort) [G4,G6]
6. F06 Reverse geocode (BigDataCloud for device only; Photon; Nominatim opt-in; offline) [G4,G6]
7. F07 Administrative hierarchy panel (ADM0→ADMn, ISO 3166-2, GeoNames admin-1 IDs, NUTS 1/2/3) [G4,G5,G8]
8. F08 Country intelligence profile (bundled table) [G1,G5,G8]
9. F09 World Bank indicators panel [G4,G8]
10. F10 EU/NUTS regional statistics panel [G4,G8]
11. F11 Timezone resolver (offline polygons + Intl) [G1,G2,G5]
12. F12 Solar & twilight times (Sunrise-Sunset.org → SunriseSunset.io → offline NOAA model) [G2,G4]
13. F13 Elevation (Terrain Tiles → Open-Elevation) in m and ft [G4]
14. F14 Public holidays calendar with month filter [G4,G8]
15. F15 Admin boundary viewer (geoBoundaries ADM0–ADM2, zoom/pan) [G4,G8]
16. F16 Plus Code encoder/decoder incl. short-code recovery [G2,G8]
17. F17 Coordinate format converter (DD, DMS, DDM, UTM, MGRS, Plus Code) [G2,G8]
18. F18 Distance & bearing (great-circle, initial/final bearing, midpoint) [G2,G8]
19. F19 Bounding box & area (spherical) [G2,G8]
20. F20 Multi-location comparison (≤6) [G6,G8]
21. F21 History (last 50) & saved profiles (star, rename, tag) [G3,G8]
22. F22 Provenance inspector per field [G2,G8]
23. F23 Spatial canvas (Equal Earth projection, pins, arcs, boxes, boundaries) [G2,G8]
24. F24 Country choropleth (World Bank indicator, legend) [G4,G8]
25. F25 Nearby places radius finder (1–500 km, offline) [G1,G5,G8]
26. F26 Live local clock with offset/DST [G2,G8]
27. F27 Daylight duration, golden & blue hour [G2,G4,G8]
28. F28 Batch postal lookup CSV (throttled, cancelable, progress) [G6,G8]
29. F29 Export JSON with full provenance [G7]
30. F30 Export CSV flat with field-group selection [G7]
31. F31 Export PDF location brief [G7]
32. F32 Export iCal holidays [G7]
33. F33 Export PNG map snapshot (≤2× DPR) [G7]
34. F34 Export SVG map [G7]
35. F35 Export ZIP bundle [G7]
36. F36 Metadata/tag editor at every export, persisted per profile [G3,G7,G8]
37. F37 OpenGraph social card 1200×630 [G7]
38. F38 Offline PWA reuse + IndexedDB vault [G1,G3]
39. F39 Responsive layout, bottom-sheet drawers ≤ 760 px [G8]
40. F40 Viewport-aware tooltips (hover / tap, suppressed during drag) [G8]
41. F41 Right-click / long-press context menu [G8]
42. F42 Source controls: per-source health (circuit state), Nominatim opt-in, clear cache [G3,G8]
43. F43 Attribution footer that lists exactly the sources used in the current view [G2,G8]
44. F44 Keyboard access: search shortcut, arrow-key map pan, +/- zoom, Escape closes overlays [G8]

## Decisions

- Map renderer: SVG in the DOM using in-house Equal Earth projection (forward + Newton inverse). One renderer serves screen, SVG export, and PNG export.
- Static data is generated by `scripts/build-data.mjs` and committed under `data/`; the site build needs no network. Data is loaded with dynamic `import()` so it is code-split and precached by the existing PWA glob.
- "Population of a ZIP code" is never fabricated. Postal lookups report the geography actually returned; population is shown at the geography that has it (country via World Bank, NUTS-3 via Eurostat, populated place via Natural Earth `pop_max`) with that geography type and reference year.

## Delivery Records

## Delivery 1 — 2026-09-29
### Committed this batch
- `src/tools/geo-intel/TODO.md` — live tracker: gates G0–G12, verified source registry, exclusions, feature list F01–F44, decisions.
### Gate evidence
- G0 checked: plan, registry, and feature list recorded; every endpoint was fetched from `https://aahplexx.github.io` in Chromium on 2026-09-29.
### Next batch (planned)
- `src/tools/geo-intel/scripts/build-data.mjs` — reproducible static-data builder; needs G0's source decisions (datasets, licenses) first.
- `src/tools/geo-intel/data/*.json` — generated country table, geometry, places, admin-1 names, timezones, manifest; can only exist once the builder exists.

## Delivery 2 — 2026-09-29
### Committed this batch
- `src/tools/geo-intel/scripts/build-data.mjs` — downloads (if missing) and reduces all bundled sources; run `node --max-old-space-size=8192 src/tools/geo-intel/scripts/build-data.mjs <cache-dir>`.
- `src/tools/geo-intel/data/countries.topo.json` — Natural Earth 5.1.2 1:50m countries, 242 features (492 KB, 162 KB gzip).
- `src/tools/geo-intel/data/country-table.json` — 252 GeoNames countries + NE region/subregion/label point + Wikidata driving side (247 with side).
- `src/tools/geo-intel/data/admin1.json` — 3,865 GeoNames admin-1 names + geonameIds.
- `src/tools/geo-intel/data/places.json` — 7,342 Natural Earth populated places (columnar).
- `src/tools/geo-intel/data/timezones.topo.json` — 444 IANA zones incl. oceans, tbb 2026d (1.09 MB, 310 KB gzip).
- `src/tools/geo-intel/data/manifest.json` — sources, versions, licenses, sizes, timezone accuracy.
### Gate evidence
- G1 checked: two consecutive builds produce identical SHA-256 for every data file; timezone agreement vs full resolution 0.9998 (4,000 points), land 0.9993 (1,388 points).
- Loading rule for later batches: import data with `import('./data/<file>.json?raw')` + `JSON.parse` so `tsc` does not infer types for megabyte literals.
### Next batch (planned)
- `src/tools/geo-intel/core/types.ts` — provenance + profile types; everything else imports it.
- `src/tools/geo-intel/core/sources.ts` — source registry (license, attribution, policy) referenced by provenance.
- `src/tools/geo-intel/core/geodesy.ts`, `core/olc.ts`, `core/coords.ts`, `core/projection.ts`, `core/timezone.ts`, `core/solar.ts`, `core/query-parser.ts` — pure math; the parser depends on olc/coords so they ship together.
- `tests/unit/geo-intel-core.test.ts` — official OLC + MGRS vectors, geodesy, parser, solar, timezone.

## Delivery 3 — 2026-09-29
### Committed this batch
- `src/tools/geo-intel/core/types.ts` — provenance, field, profile, solar, holiday, metadata types.
- `src/tools/geo-intel/core/sources.ts` — source registry (license, attribution, enforced policy) + `field()`/`upsertFields()`.
- `src/tools/geo-intel/core/geodesy.ts` — haversine, bearings, midpoint, destination, great-circle points, spherical bbox/ring area.
- `src/tools/geo-intel/core/olc.ts` — Open Location Code encode/decode/validate/shorten/recover.
- `src/tools/geo-intel/core/coords.ts` — DD/DMS/DDM parse + format, UTM (Krüger), MGRS forward/inverse.
- `src/tools/geo-intel/core/projection.ts` — Equal Earth forward/inverse + SVG path builders.
- `src/tools/geo-intel/core/timezone.ts` — Intl offsets, DST, next transition, nautical zones.
- `src/tools/geo-intel/core/solar.ts` — offline NOAA solar model, golden/blue hour, rule-of-thumb fallback.
- `src/tools/geo-intel/core/postal.ts` — Zippopotam coverage (70 countries), UK/CA patterns, per-country normalisation.
- `src/tools/geo-intel/core/query-parser.ts` — universal search classification incl. geo: URIs and map links.
- `tests/unit/geo-intel-core.test.ts`, `tests/fixtures/geo-intel/olc-*.csv` — 46 tests; official OLC test_data, proj4js/mgrs vectors, sunrise-sunset.org reference times.
### Gate evidence
- G2 checked: `vitest run tests/unit/geo-intel-core.test.ts` 46/46 pass; `tsc --noEmit -p tsconfig.app.json` exit 0.
- OLC float encoding differs from the CSV on 13/302 rows, each exactly one integer unit from floating-point flooring (same as the reference JS); integer encoding is exact on all rows.
### Next batch (planned)
- `src/tools/geo-intel/net/http.ts` — timeout, backoff, circuit breaker, dedupe, throttle gate; adapters depend on it.
- `src/tools/geo-intel/net/store.ts` — Dexie database (response cache with TTL, history, saved profiles, metadata, settings); adapters and UI depend on it.
- `tests/unit/geo-intel-net.test.ts` — fake timers + fake-indexeddb.

## Delivery 4 — 2026-09-29
### Committed this batch
- `src/tools/geo-intel/net/http.ts` — HttpClient: TTL cache lookup, in-flight dedupe, per-source throttle gate (Nominatim 1.1 s, Photon/BigDataCloud/Zippopotam 1 s), timeout, exponential backoff + Retry-After, circuit breaker, stale fallback, health snapshots.
- `src/tools/geo-intel/net/store.ts` — Dexie DB `inmotools-geo-intelligence-hub`: response cache (pruned at 2,000), profiles (50 unstarred history, starred kept), settings (Nominatim opt-in default off).
- `tests/unit/geo-intel-net.test.ts` — 12 tests (injected clock/sleep, fake-indexeddb).
### Gate evidence
- G3 checked: `vitest run tests/unit/geo-intel-net.test.ts` 12/12; `tsc` exit 0.
### Next batch (planned)
- `src/tools/geo-intel/adapters/*.ts` — one module per source, each returning ProfileFields; needs `net/http.ts` and `core/sources.ts`.
- `tests/unit/geo-intel-adapters.test.ts` + `tests/fixtures/geo-intel/responses/*.json` — recorded live responses from 2026-09-29.

## Delivery 5 — 2026-09-29
### Committed this batch
- `src/tools/geo-intel/adapters/common.ts` — AdapterResult shape + coercion helpers.
- `src/tools/geo-intel/adapters/postal.ts` — Zippopotam, Postcodes.io full/outward/reverse (ONS positional quality → confidence).
- `src/tools/geo-intel/adapters/statistics.ts` — World Bank country + all-country indicators, JSON-stat parser, GISCO NUTS lookup, Eurostat NUTS 1–3 population, density, GDP/inhabitant, employment rate.
- `src/tools/geo-intel/adapters/boundaries.ts` — geoBoundaries metadata + simplified GeoJSON via CORS-safe media host, point-in-polygon.
- `src/tools/geo-intel/adapters/geocoders.ts` — BigDataCloud (device only), Photon search/reverse, Nominatim search/reverse (rank → confidence).
- `src/tools/geo-intel/adapters/environment.ts` — Nager.Date, Sunrise-Sunset.org v2 → SunriseSunset.io → offline model, Terrain Tiles (in-tool PNG decoder) → Open-Elevation.
- `src/tools/geo-intel/net/http.ts` — 204 No Content now returns `null` (Nager unsupported countries) instead of retrying.
- `tests/unit/geo-intel-adapters.test.ts`, `tests/fixtures/geo-intel/responses/*` — 15 tests on responses recorded 2026-09-29.
### Gate evidence
- G4 checked: `vitest run tests/unit/geo-intel-adapters.test.ts` 15/15; `tsc` exit 0.
### Next batch (planned)
- `src/tools/geo-intel/offline/static-data.ts` — lazy `?raw` loaders + country/timezone point-in-polygon, nearest-country fallback, nearby places, admin-1 matching; needs G1 data and G2 types.
- `tests/unit/geo-intel-offline.test.ts`.

## Delivery 6 — 2026-09-29
### Committed this batch
- `src/tools/geo-intel/offline/static-data.ts` — in-tool TopoJSON decoder (no dependency on another tool's type shim), memoised `?raw` loaders, country point-in-polygon with ≤40 km coastal snap, timezone polygons with nautical fallback, radius place finder (antimeridian-safe), GeoNames admin-1 matching, flag/currency/language helpers.
- `tests/unit/geo-intel-offline.test.ts` — 23 tests.
### Gate evidence
- G5 checked: `vitest run tests/unit/geo-intel-offline.test.ts` 23/23; `tsc` exit 0.
### Next batch (planned)
- `src/tools/geo-intel/engine/synthesize.ts` — query routing + adapter chains → one LocationProfile; needs adapters (G4) and offline lookups (G5).
- `src/tools/geo-intel/engine/batch.ts` — CSV postal batch (throttled, cancelable, progress) built on synthesize's postal chain.
- `tests/unit/geo-intel-engine.test.ts`.

## Delivery 7 — 2026-09-29
### Committed this batch
- `src/tools/geo-intel/engine/synthesize.ts` — `resolveLocation()`: parses input, anchors (device → BigDataCloud; postal → Postcodes.io/Zippopotam; place → Photon → Nominatim opt-in; coordinates/Plus/UTM/MGRS/map), then in parallel: offline country/timezone/nearest place, reverse geocode (Photon → Nominatim opt-in), UK depth, elevation chain, sun chain, World Bank, Nager.Date, GISCO → Eurostat; merges into one profile, with precision-derived confidence for typed coordinates and a warning (no fabricated figure) for postal-code population.
- `src/tools/geo-intel/engine/batch.ts` — CSV column detection, ≤1,000 rows, per-code dedupe, postal chain only, offline country/timezone enrichment, progress + cancel, CSV writer.
- `tests/unit/geo-intel-engine.test.ts` — 8 tests (full synthesis provenance audit, postal, coordinates, total offline, Nominatim opt-in, short Plus Code, batch, cancel).
### Gate evidence
- G6 checked: `vitest run tests/unit/geo-intel-engine.test.ts` 8/8; `tsc` exit 0.
### Next batch (planned)
- `src/tools/geo-intel/export/*.ts` — JSON, CSV, iCal, PDF brief, SVG/PNG map, social card, ZIP bundle, metadata helpers; needs the profile model (G2) and synthesis output (G6).
- `tests/unit/geo-intel-export.test.ts`.

## Delivery 8 — 2026-09-29
### Committed this batch
- `src/tools/geo-intel/render/scene.ts` — MapScene model, base/overlay SVG layers (constant on-screen pin size), standalone export SVG with Dublin Core RDF metadata, legend and attribution; quantile choropleth (ColorBrewer GnBu 7).
- `src/tools/geo-intel/export/formats.ts` — metadata resolution, JSON (full provenance + source list), flat CSV (group selection, optional provenance columns, formula-injection neutralising), RFC 5545 iCal (all-day events, escaping, 75-octet UTF-8-safe folding), holiday CSV.
- `src/tools/geo-intel/export/binary.ts` — PNG tEXt metadata (CRC-32), SVG→PNG rasteriser (≤2× DPR), 1200×630 social card, jsPDF brief with document properties and WinAnsi-safe text, JSZip bundle + README with attribution.
- `tests/unit/geo-intel-export.test.ts` — 10 tests.
### Gate evidence
- G7 checked: `vitest run tests/unit/geo-intel-export.test.ts` 10/10; `tsc` exit 0.
### Next batch (planned)
- `src/tools/geo-intel/ui/*.tsx` + `ui/geo-intel.css` — hooks (settings/history/client), Tooltip, ContextMenu, MapCanvas, panels (profile, provenance, admin, tools, compare, history, batch, sources, export modal) and `GeoIntelWorkspace.tsx`; needs every engine above.
- `src/catalog.ts` + `src/tools/workspaces.tsx` registration immediately after, because the loader must point at an existing workspace file.

## Delivery 9 — 2026-09-29
### Committed this batch
- `src/tools/geo-intel/GeoIntelWorkspace.tsx` — orchestrator: search, consented device location, map picks, tabs/bottom sheets, comparison, history, boundaries, choropleth, context menus, dialogs.
- `src/tools/geo-intel/geo-intel.css` — scoped `.gi` styles, clamp-based sizing, ≥2200 px, ≤1100 px stacked, ≤760 px bottom tab bar + sheets, reduced-motion.
- `src/tools/geo-intel/ui/format.ts`, `ui/hooks.ts` — display formatting, shared client, settings, media query, clipboard, long-press, save-picker progressive enhancement.
- `src/tools/geo-intel/ui/Tooltip.tsx` — single tooltip layer (hover delay, focus-visible, touch press-and-hold, drag/scroll cancel, viewport clamping, aria-describedby).
- `src/tools/geo-intel/ui/ContextMenu.tsx` — right-click/long-press menu with edge-aware placement and arrow-key navigation.
- `src/tools/geo-intel/ui/MapCanvas.tsx` — SVG map: drag/wheel/pinch/keyboard pan-zoom, select/measure/box modes, hover names, pin + map menus.
- `src/tools/geo-intel/ui/ProfilePanel.tsx` — summary + live clock, field rows with provenance buttons, admin chain, daylight chart, holidays with month filter, nearby radius, boundaries, attribution, provenance inspector.
- `src/tools/geo-intel/ui/ToolsPanel.tsx` — converter, Plus Codes, distance/bearing, bounding box/area, choropleth.
- `src/tools/geo-intel/ui/CollectionPanels.tsx` — comparison grid (≤6), history (star, rename, tag, filter, clear).
- `src/tools/geo-intel/ui/OpsPanels.tsx` — batch CSV, sources/health/settings/cache/bundled-data manifest.
- `src/tools/geo-intel/ui/ExportDialog.tsx` — metadata/tag editor (persisted per profile), per-format options, downloads, ZIP.
### Gate evidence
- `tsc --noEmit -p tsconfig.app.json` exit 0. G8 stays open until browser verification (G10) confirms behaviour at all viewports.
### Next batch (planned)
- `src/catalog.ts` — add `geo-intelligence-hub` to `ToolSlug` and one `TOOLS` entry.
- `src/tools/workspaces.tsx` — one loader line (required by the `Record<ToolSlug, …>` type; see Boundary exceptions).
- `tests/unit/geo-intel-wiring.test.ts` — registration contract, like the sheets/sightline wiring tests.

## Delivery 10 — 2026-09-29
### Committed this batch
- `src/catalog.ts` — `geo-intelligence-hub` added to `ToolSlug` and one `TOOLS` entry (shortTitle, title, audience, summary, privacy, accepts, outputs, steps, hint).
- `src/tools/workspaces.tsx` — one lazy loader line (boundary exception, see top).
- `tests/unit/geo-intel-wiring.test.ts` — registration shape, loader, e2e selection, no-credential/excluded-host scan.
### Gate evidence
- G9 checked: `tsc` exit 0; `pnpm test:unit` 218 files / 2,237 tests passed before the wiring file, and the wiring file passes 4/4.
### Next batch (planned)
- `pnpm build` and a browser pass against `vite preview` at 375, 768, 1280, 1440 and 2560 px; fix defects found (G8 → G10).
- `tests/e2e/geo-intel.spec.ts` — Playwright with every network source mocked by `page.route` from the recorded fixtures.

## Delivery 11 — 2026-09-29
### Committed this batch
- `src/tools/geo-intel/ui/Icon.tsx` — inline SVG icons; replaced text glyphs (ⓘ ⧉ ⌂ ★ ×) that rendered as missing-glyph boxes in the test browser's fonts.
- `src/tools/geo-intel/ui/Tooltip.tsx` — a scroll during the hover delay no longer cancels a pending tooltip; `:hover` is re-checked before showing.
- `src/tools/geo-intel/ui/ExportDialog.tsx` — the anchor download is the default path; the File System Access save dialog is an opt-in checkbox shown only where supported.
- `src/tools/geo-intel/engine/synthesize.ts`, `export/binary.ts` — country name stored without a flag emoji; the social card draws an ISO-code badge (Windows fonts do not render flag emoji).
- `src/tools/geo-intel/geo-intel.css` — icon alignment, ISO badge, ≤400 px tab bar.
- `tests/e2e/geo-intel.spec.ts` — 15 tests × 2 projects, with every external request fulfilled from recorded fixtures: place profile + provenance dialog, postal caveat, tooltip + context menu, JSON/iCal/SVG/PNG/ZIP downloads with edited metadata, map click + measure, mobile bottom bar + sheets, fully offline lookup, axe on profile/export/provenance states, a 320–2560 px viewport matrix.
### Gate evidence
- G8 checked: screenshots reviewed at 320, 375, 768, 1024, 1440, 1920 and 2560 px; no horizontal overflow; controls inside the viewport.
- G10 checked: `playwright test tests/e2e/geo-intel.spec.ts` 21 passed / 9 skipped (project-specific), and 36/36 over `--repeat-each=3 --retries=0`; the catalog-driven `accessibility.spec.ts` + `app.spec.ts` passed 94/94.
- G11 checked: `pnpm test:unit` 218 files / 2,237 tests; `pnpm build` exit 0; full `CI=1 playwright test` 1,011 passed / 31 skipped / 0 failed / 0 flaky (17.6 min).
### Next batch (planned)
- G12: open a PR into `main` and let `.github/workflows/pages.yml` validate it. The PR runs the full browser suite because `src/catalog.ts` is a global path.
- At merge time only: reconcile `.tasks/` (DONE.md, WORK_LOG.md) in the merge commit or a follow-up on `main`, so parallel branches do not conflict on those files.

## Feature status (all 44 implemented)
F01–F44 are implemented. Coverage: unit tests cover the logic of F01, F04–F14, F16–F19, F21, F22, F24, F25, F28–F37; e2e tests cover F01, F03, F05, F14, F18, F22, F29, F32–F36, F38–F41; the remaining UI-only features are exercised through the browser tests of the panels that host them.

## Known limitations (documented, not defects)
- Timezone polygons are simplified (99.93% agreement on land); points within a few hundred metres of a zone border can resolve to the neighbour.
- Country polygons are 1:50m; coastal points ≤40 km offshore snap to the nearest country and say so in the note.
- PDF uses the standard Helvetica font (WinAnsi), so non-Latin names are transliterated or dropped in the PDF only; JSON/CSV/SVG keep full Unicode.
- Nominatim cannot be remotely switched off without a new deploy (static hosting); it is therefore off by default and opt-in.

## Delivery 12 — 2026-09-29
### Committed this batch
- `src/tools/geo-intel/TODO.md` — integration status.
### Gate evidence
- PR https://github.com/AahPlexX/inmotools/pull/89 opened from `feature/geo-intelligence-hub` into `main`.
- "Validate and deploy Pages" (full unit suite, build, full browser suite) — success; "Sightline Velocity validation" — success.
### Next batch (planned)
- On the owner's go-ahead: add the Geo Intelligence Hub entry to `.tasks/DONE.md` and `.tasks/WORK_LOG.md` (with this evidence), re-sync the branch with `origin/main`, re-run CI, merge PR #89, then confirm the Pages deployment and tick G12.

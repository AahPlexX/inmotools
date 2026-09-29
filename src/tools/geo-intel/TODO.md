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
- [ ] **G1 Static data** — reproducible build script; bundled country table, country geometry, populated places, admin-1 names, IANA timezone polygons; manifest with sources, licenses, versions, sizes, timezone accuracy.
- [ ] **G2 Core math** — provenance types, geodesy (distance, bearing, area, midpoint, destination), Plus Codes, DD/DMS/DDM/UTM/MGRS, query parser, projection, timezone math, offline solar model. Unit tests incl. official OLC and MGRS vectors.
- [ ] **G3 Resilience + cache** — timeout, exponential backoff, circuit breaker, dedupe, per-host throttle gate, Dexie TTL cache, offline fallback. Unit tests with fake timers / fake-indexeddb.
- [ ] **G4 Adapters** — one module per keyless source, normalized to provenance fields; fixture-driven unit tests.
- [ ] **G5 Offline engines** — country point-in-polygon, timezone lookup, nearby places, admin-1 resolution; unit tests.
- [ ] **G6 Synthesis** — query routing, adapter chains, unified provenance-tracked profile, batch postal pipeline; unit tests.
- [ ] **G7 Exports** — JSON, CSV, PDF, iCal, SVG, PNG, ZIP, social card, metadata editor model; unit tests validate output structure.
- [ ] **G8 UI** — workspace, map canvas, panels, tooltips, context menu, bottom-sheet drawers, responsive CSS.
- [ ] **G9 Registration** — `catalog.ts` entry + `workspaces.tsx` loader; `tsc` clean.
- [ ] **G10 Browser verification** — Playwright e2e (desktop + mobile projects) with network mocked; axe (existing catalog-driven spec) passes; manual viewport pass 375 px → 2560 px.
- [ ] **G11 Full validation** — `pnpm test:unit`, `pnpm build`, relevant e2e green; baseline comparison recorded.
- [ ] **G12 Integration** — PR into `main`, CI green, `.tasks` reconciled, merged only after G0–G11.

Baseline before any change (2026-09-29, `1aa0a88`): `tsc --noEmit -p tsconfig.app.json` exit 0; `pnpm test:unit` 211 files / 2,119 tests passed.

## Verified source registry (browser-tested from the GitHub Pages origin on 2026-09-29)

| Adapter | Endpoint | Keyless | CORS | Policy / limits honoured | License / attribution |
| --- | --- | --- | --- | --- | --- |
| Zippopotam.us | `api.zippopotam.us/{cc}/{code}` | yes | yes | user-triggered, cached, 1 req/s in batch | attribution link |
| Postcodes.io | `api.postcodes.io/postcodes/{pc}` | yes | yes | user-triggered, cached | OGL v3 (ONS/OS/Royal Mail data), MIT service |
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

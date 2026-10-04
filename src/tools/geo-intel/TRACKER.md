---
tool: geo-intelligence-hub
folder: src/tools/geo-intel
doc: tracker
basis: as-built
status: done
spec: docs/superpowers/specs/2026-10-01-geo-intelligence-hub-design.md
tracker: src/tools/geo-intel/TRACKER.md
updated: 2026-10-04
---

# Geo Intelligence Hub — tracker

## Resume here

82 requirements: 74 verified, 0 implemented, 4 missing, 4 not planned. Next action: build GIH-R81 and GIH-R82, then GIH-R80; GIH-R79 follows TASK-028. No blocker. Name confirmed by the owner (2026-10-01): Geo Intelligence Hub.

## Documents

- Spec: [2026-10-01-geo-intelligence-hub-design.md](../../../docs/superpowers/specs/2026-10-01-geo-intelligence-hub-design.md)
- Build history, source registry, delivery records and audits: [TODO.md](TODO.md)
- Task state: `.tasks/DONE.md` and `.tasks/WORK_LOG.md` (TASK-025)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/geo-intel-*.test.ts` (adapters, audit, audit2, core, engine, export, net, offline, review, wiring)
- Browser tests: `tests/e2e/geo-intel.spec.ts`

## Requirement status

Test names are quoted from the files under Documents. `e2e` = `tests/e2e/geo-intel.spec.ts`; `unit:<name>` = `tests/unit/geo-intel-<name>.test.ts`.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| GIH-R01 | verified | unit:core "extracts countries and flags swapped coordinates"; unit:engine; e2e "resolves a place into a provenance-tracked profile" | |
| GIH-R02 | verified | unit:adapters "maps BigDataCloud device results and device accuracy to confidence"; e2e "GIH-R02 asks for consent before requesting device location and resolves it through BigDataCloud" | |
| GIH-R03 | verified | e2e "map click resolves a point and measure mode reports a distance" | |
| GIH-R04 | verified | unit:adapters "reads Zippopotam places…", "reads Postcodes.io full codes…"; e2e "postal lookups show the geography used…" | |
| GIH-R05 | verified | unit:adapters "maps Photon search and reverse results", "maps Nominatim results…"; unit:engine "keeps Nominatim off unless enabled" | |
| GIH-R06 | verified | unit:engine "reverse-geocodes typed coordinates and still works fully offline" | |
| GIH-R07 | verified | unit:offline "matches admin-1 names to GeoNames codes"; unit:adapters "parses JSON-stat and composes NUTS 1–3 statistics", "returns no NUTS code over the ocean" | |
| GIH-R08 | verified | unit:offline "loads every dataset with the expected record counts"; e2e "resolves a place…" | |
| GIH-R09 | verified | unit:adapters "reads World Bank indicators with reference years" | |
| GIH-R10 | verified | unit:adapters "parses JSON-stat and composes NUTS 1–3 statistics" | |
| GIH-R11 | verified | unit:core "reads offsets and DST from Intl", "finds the next transition to the minute"; unit:offline "uses ocean polygons…" | |
| GIH-R12 | verified | unit:adapters "reads Sunrise-Sunset.org v2…", "falls back to the offline model…"; unit:core "agrees with the reference within two minutes" | |
| GIH-R13 | verified | unit:adapters "decodes a recorded Terrarium tile…", "falls back to Open-Elevation when the tile fails" | |
| GIH-R14 | verified | unit:adapters "reads Nager.Date holidays and treats 204 as unsupported"; e2e "GIH-R14 filters public holidays by month" | |
| GIH-R15 | verified | unit:adapters "rewrites GitHub raw links to the CORS-enabled media host and finds the containing unit" | |
| GIH-R16 | verified | unit:core Open Location Code (official test_data), "shortens and recovers codes" | |
| GIH-R17 | verified | unit:core "matches the proj4js/mgrs reference vectors", "formats DMS and DDM with carry" | |
| GIH-R18 | verified | unit:core "computes haversine distance, bearings and midpoint"; e2e "map click … measure mode reports a distance" | |
| GIH-R19 | verified | unit:core "computes spherical rectangle and ring areas" | |
| GIH-R20 | verified | e2e "GIH-R20 compares up to six locations and refuses a seventh" | |
| GIH-R21 | verified | unit:net "keeps the newest 50 unstarred profiles and never trims starred ones", "normalises tags" | |
| GIH-R22 | verified | e2e "resolves a place into a provenance-tracked profile" | |
| GIH-R23 | verified | unit:core "inverts its forward projection"; unit:export "renders a standalone SVG…" | |
| GIH-R24 | verified | unit:adapters "builds a choropleth map keyed by ISO3…"; unit:export "computes quantile classes" | |
| GIH-R25 | verified | unit:offline "finds populated places within a radius, nearest first" | |
| GIH-R26 | verified | unit:core "reads offsets and DST from Intl"; e2e "GIH-R26 shows the live local clock with UTC offset and DST state" | |
| GIH-R27 | verified | unit:core "agrees with the reference within two minutes"; e2e "GIH-R27 shows daylight duration, golden hour and blue hour for the location and date" | |
| GIH-R28 | verified | unit:engine "detects columns, de-duplicates requests…", "stops when cancelled" | |
| GIH-R29 | verified | unit:export "exports JSON with every field's provenance and a source list"; e2e "exports JSON with edited metadata…" | |
| GIH-R30 | verified | unit:export "exports selected groups as one flat row…" | |
| GIH-R31 | verified | unit:export "builds a PDF with document properties" | |
| GIH-R32 | verified | unit:export "writes an RFC 5545 calendar…"; e2e "exports JSON … and an RFC 5545 calendar" | |
| GIH-R33 | verified | unit:export "computes CRC-32 and round-trips PNG tEXt metadata" | |
| GIH-R34 | verified | unit:export "renders a standalone SVG with Dublin Core metadata, legend and attribution" | |
| GIH-R35 | verified | unit:export "bundles files into a ZIP with a README listing attribution" | |
| GIH-R36 | verified | e2e "exports JSON with edited metadata and an RFC 5545 calendar"; unit:export "fills defaults and honours overrides" | |
| GIH-R37 | verified | unit:export "builds the social card model" | |
| GIH-R38 | verified | e2e "keeps working offline from bundled data" | |
| GIH-R39 | verified | e2e "mobile uses a bottom tab bar and bottom sheets without horizontal scrolling" | |
| GIH-R40 | verified | e2e "shows tooltips on hover and a viewport-safe context menu on right-click" | |
| GIH-R41 | verified | e2e "shows tooltips on hover and a viewport-safe context menu on right-click" | |
| GIH-R42 | verified | unit:net "opens the circuit after repeated failures…"; e2e "GIH-R42 sources tab shows each source state, and the Nominatim toggle and cache clearing take effect" | |
| GIH-R43 | verified | e2e "GIH-R43 attribution footer lists exactly the sources the profile cites" | |
| GIH-R44 | verified | e2e "profile filter, row copy menu, sun chart and keyboard shortcuts"; e2e "GIH-R44 keyboard: / focuses search, arrow keys pan the map, +/- zoom, Escape closes overlays" | |
| GIH-R45 | verified | unit:audit "falls back to the geocoder when a bare number is not a postal code…" | |
| GIH-R46 | verified | e2e "opens a shared link, offers other matches, and switches sun date and holiday year" | |
| GIH-R47 | verified | e2e "opens a shared link, offers other matches, and switches sun date and holiday year" | |
| GIH-R48 | verified | unit:audit "agrees with the provider moon phase", "reads moon data from both providers and adds moon fields" | |
| GIH-R49 | verified | e2e "opens a shared link, offers other matches…" | |
| GIH-R50 | verified | e2e "opens a shared link, offers other matches…" | |
| GIH-R51 | verified | unit:audit "matches the published geohash example…", "encodes IARU locators…", "computes antipodes", "parses prefixed codes…" | |
| GIH-R52 | verified | unit:audit "writes RFC 7946 GeoJSON…", "writes escaped KML 2.2"; e2e "exports GeoJSON and KML…" | |
| GIH-R53 | verified | unit:audit "imports its own export and rejects invalid entries"; unit:review "rejects imported profiles that cite unknown sources" | |
| GIH-R54 | verified | e2e "GIH-R54 copies the summary and the share link from the buttons and the context menu" | |
| GIH-R55 | verified | e2e "GIH-R55 offers recent queries as search suggestions" | |
| GIH-R56 | verified | e2e "GIH-R56 dismisses an error message" | |
| GIH-R57 | verified | e2e "tabs follow the ARIA arrow-key pattern" | |
| GIH-R58 | verified | e2e "profile filter, row copy menu, sun chart and keyboard shortcuts" | |
| GIH-R59 | verified | e2e "profile filter, row copy menu, sun chart and keyboard shortcuts" | |
| GIH-R60 | verified | unit:audit2 "peaks at solar noon and dips below the horizon at night"; e2e same as R58 | |
| GIH-R61 | verified | unit:audit2 "picks a round 1/2/5 distance no longer than the target width" | |
| GIH-R62 | verified | e2e "GIH-R62 shows the live cursor latitude and longitude on the map" | |
| GIH-R63 | verified | e2e "meeting planner shifts compared local times"; unit:audit2 "marks weekday 09:00–17:00 local time only" | |
| GIH-R64 | verified | e2e "profile filter, row copy menu, sun chart and keyboard shortcuts" | |
| GIH-R65 | verified | unit:wiring "never requests credentials: no API keys, tokens or signup-gated hosts in source" | |
| GIH-R66 | verified | e2e "lays out without horizontal overflow at <width> px" (7 widths) | |
| GIH-R67 | verified | e2e "has no serious or critical axe violations…"; `tests/e2e/accessibility.spec.ts` | |
| GIH-R68 | verified | unit:wiring "registers exactly one catalog entry with the ToolMeta shape" | |
| GIH-R69 | verified | unit:engine "resolves postal codes without inventing a postal-code population"; e2e "postal lookups show the geography used…" | |
| GIH-R70 | verified | unit:net "spaces Nominatim requests at least 1.1 s apart"; unit:engine "keeps Nominatim off unless enabled" | |
| GIH-R71 | verified | unit:engine "synthesises a place-name profile where every field carries full provenance" | |
| GIH-R72 | verified | unit:review "neutralises formulas but keeps plain signed numbers"; unit:export "exports selected groups … formula neutralising" | |
| GIH-R73 | verified | unit:net HttpClient tests (cache, dedupe, throttle, backoff, breaker, stale, timeout); unit:review "cancelling one caller does not cancel another caller…" | |
| GIH-R74 | verified | unit:audit2 "finds points inside a boundary that crosses ±180°…", "starts a new subpath…" | |
| GIH-R75 | not planned | spec | |
| GIH-R76 | not planned | spec | |
| GIH-R77 | not planned | spec | |
| GIH-R78 | not planned | spec | |
| GIH-R79 | missing | — | Delivered through the site-wide theme selector (TASK-028), not a tool-only toggle |
| GIH-R80 | missing | — | Required by the default integration rule; ⓘ button and provenance dialog cover the data meanwhile |
| GIH-R81 | missing | — | Added 2026-10-02 |
| GIH-R82 | missing | — | Added 2026-10-02 |

## Open work

0. Build the requirements added 2026-10-02: GIH-R81, GIH-R82.
1. Build GIH-R80 (iOS long-press row menu); GIH-R79 follows TASK-028.

## Known limitations

- Timezone polygons are simplified (99.93% agreement on land); points within a few hundred metres of a border can resolve to the neighbour.
- Country polygons are 1:50m; points up to 40 km offshore snap to the nearest country and say so.
- PDF text is WinAnsi only; JSON, CSV and SVG keep full Unicode.
- Nominatim cannot be switched off remotely without a redeploy, so it is off by default.

## Verification evidence

- 2026-10-04, `expand/geo-intelligence-hub` @ `6b9f0649` + working tree: `pnpm build` exit 0; `PW_PORT=4201 pnpm exec playwright test tests/e2e/geo-intel.spec.ts --repeat-each=3` 146 passed / 45 skipped / 1 failed (pre-existing axe test; rerun `-g "axe violations" --repeat-each=3` 6 passed); every new `GIH-R…` test passed 3/3 on each project it runs on; `tsc --noEmit -p tsconfig.app.json` exit 0; `pnpm test:unit` 343 files / 3,703 tests passed, 0 failed; `pnpm tool:check geo-intelligence-hub --base origin/main` 78/82, no errors.
- 2026-10-01, `origin/main` @ `0f8f42ed`: `tsc --noEmit -p tsconfig.app.json` exit 0; `pnpm test:unit` 344 files / 3,702 tests passed, 0 failed; `pnpm build` exit 0.
- 2026-10-01, `origin/main` @ `80f74932`: geo-intel + accessibility + app browser specs 125 passed / 11 skipped / 0 failed (recorded in [TODO.md](TODO.md) completion record).

## Change log

- 2026-10-04 — Browser tests added for GIH-R02, R14, R20, R26, R27, R42, R43, R44, R54, R55, R56, R62; the eleven `implemented` rows moved to `verified`.
- 2026-10-02 — Added GIH-R81, GIH-R82 (default integration rule).
- 2026-10-01 — Default integration rule applied: GIH-R79 and GIH-R80 moved from `not planned` to `missing`. Owner kept the name.
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`; statuses taken from the tests listed above.

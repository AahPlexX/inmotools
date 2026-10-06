---
tool: aethercast
folder: src/tools/aethercast
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-01-aethercast-design.md
tracker: src/tools/aethercast/TRACKER.md
updated: 2026-10-04
---

# AetherCast — spec

As built at `91b33d23` (last code change under `src/tools/aethercast/`). Requirement prefix: `AEC`. Status of each requirement: [TRACKER.md](../../../src/tools/aethercast/TRACKER.md).

This spec records **what the tool does**. It does not state why each index, threshold or exposure model was chosen: that rationale is still owed by its author under `.tasks/NEXT.md` TASK-012 and is listed under "Intent not recorded".

## Purpose

Show hourly air quality and UV for a location, computed against US EPA AQI, the European Air Quality Index and WHO 2021 guidelines, with sun-exposure estimates, anomaly screening and outdoor activity windows, for outdoor coaches, athletes, households with respiratory or cardiac risk, and environmental researchers. Results are screening aids, not medical or regulatory guidance (catalog hint).

## Scope

In scope:
- Live hourly data from Open-Meteo (forecast, air quality, geocoding) for the browser's location or a searched place; import of Open-Meteo JSON, mapped CSV or AetherCast JSON as a fallback.
- Index computation from raw concentrations, UV estimates, anomaly screening, activity windows, chart, and exports.

Out of scope:
- Medical or regulatory advice (catalog hint).
- Local monitor or sensor data feeds that need a key or account (platform rules).

## Constraints

- Platform rules: no accounts, no server or database, everything runs in the browser ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- Open-Meteo's free API is keyless and for non-commercial use only, under 600 calls a minute, 5,000 an hour and 10,000 a day, and its data is CC BY 4.0 ([Open-Meteo terms](https://open-meteo.com/en/terms)). The site is non-commercial (owner decision 2026-10-01; owner confirmed this use of Open-Meteo 2026-10-04). The tool shows the attribution.
- Index values are recalculated from raw concentrations; provider-supplied index fields are not trusted.
- Network requests happen only on the person's own action (platform rule): opening the tool requests nothing and asks for no location (AEC-R24).

## Architecture and engine

- Engines and libraries: `papaparse@5.7.0` parses imported CSV and writes the CSV export; `pdf-lib@1.17.1` builds the PDF brief; the AQI, EAQI, WHO, UV and anomaly engines are first-party TypeScript in `aethercast-engine.ts` and `aethercast-anomaly.ts`.
- Storage: localStorage key `inmotools.aethercast.v1` holds the settings; key `inmotools.aethercast.live-location.v1` holds the remembered live location.
- Browser APIs: Canvas 2D draws the forecast chart and the PNG export (`canvas.toBlob`); Geolocation supplies "Use my location" and, where it is missing, shows a message to search by city or postal code; `fetch` with `AbortSignal` loads live data; `window.setInterval` runs the 15-minute refresh after live data is started.
- Network: `https://air-quality-api.open-meteo.com`, `https://api.open-meteo.com` and `https://geocoding-api.open-meteo.com` (keyless), contacted only when the user chooses a location or loads live data.

## Requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| AEC-R01 | After the person chooses Use my location and grants the browser's location permission, live Open-Meteo conditions load without an upload | Live data loads from mocked geolocation after the click |
| AEC-R02 | Without location access, a city or postal-code search loads live conditions | Search loads a location |
| AEC-R03 | The chosen location is remembered in this browser; on reopen it is shown with a Load live data control, and its data is fetched only when the person uses that control | On reopen the remembered location is shown with no request; Load live data fetches it |
| AEC-R04 | Live data refreshes on Refresh now, and every 15 minutes only after the person has started live data in this visit; Stop auto refresh ends the automatic refresh and Resume auto refresh restarts it | Refresh reloads data; the 15-minute refresh runs after a user start, stops on Stop auto refresh and resumes |
| AEC-R05 | A late answer to a requested geolocation never replaces a location or file the person chose meanwhile | Manual location and imported file survive a late geolocation |
| AEC-R06 | Import an Open-Meteo JSON export, a mapped CSV (columns and source units mapped by the person), or an AetherCast JSON export | Each format imports |
| AEC-R07 | Imported timestamps: wall-clock times use the given IANA timezone; impossible dates, nonexistent and ambiguous DST times are rejected; accepted and rejected counts are reported | Reconciliation counts shown; bad times rejected |
| AEC-R08 | US EPA AQI is computed from raw concentrations, with PM NowCast, truncation before interpolation, the one-hour ozone and fixed SO2 rules, and category from the rounded value | EPA tests pass |
| AEC-R09 | The revised hourly European index is computed from raw concentrations and marked partial when required pollutants are missing | EAQI tests pass |
| AEC-R10 | WHO 2021 guideline comparisons use the correct rolling window, and none is produced without it | WHO window test passes |
| AEC-R11 | EPA averaging-window availability and pollutant coverage are shown, with provider and calculated indices side by side | Coverage and both indices shown |
| AEC-R12 | UV index display and a sun-exposure timing estimate by Fitzpatrick skin type; no estimate when UV is missing | UV helper tests pass |
| AEC-R13 | A vulnerability lens changes the display only, never the scientific thresholds | Lens does not alter thresholds |
| AEC-R14 | Screening anomalies (wildfire, inversion) are listed in a log | Anomalies listed |
| AEC-R15 | Outdoor activity windows use the selected standard, keep missing AQI or UV as unknown, and do not merge across gaps | Activity-window tests pass |
| AEC-R16 | A chart of AQI and UV over time can be scrubbed by mouse or touch drag while vertical swipes still scroll the page; the selected hour is shown | Touch drag scrubs; vertical swipe scrolls |
| AEC-R17 | An hourly readout table is paged with first, previous, next and last | Paging moves through hours |
| AEC-R18 | Export a PDF brief, CSV, chart PNG and AetherCast JSON | Each export downloads |
| AEC-R19 | Open-Meteo and CAMS attribution is shown with live data, which is labelled as forecast-model data, not a local monitor | Attribution and label visible |
| AEC-R20 | No serious or critical axe violations | Catalog-wide accessibility spec for this route |
| AEC-R21 | Loaded content reflows without horizontal overflow at the tested viewports | Reflow test at each viewport |
| AEC-R22 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) | Workspace switches with the site theme; axe passes in both themes |
| AEC-R23 | The thermal-inversion screen judges night hours (20:00–06:00) at the dataset's location, never in the viewer's timezone: wall-clock timestamps and timestamps with a numeric UTC offset use the hour as written; `Z` timestamps use the dataset's IANA timezone, or UTC without one | A daytime window written with `+09:00` is not screened in any viewer timezone; `Z` timestamps follow the dataset timezone |
| AEC-R24 | Opening the tool, with or without a remembered location, makes no network request and no geolocation call; requests start only from Use my location, Search locations, a search result, Load live data or Refresh now | Opening the tool and waiting past 15 minutes records no request to another origin and no geolocation call |

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Intent not recorded

- The source of every threshold constant, the choice of indices and the Fitzpatrick exposure model (TASK-012). Owed by the original author; not reconstructed here because these are health-adjacent.

## Change log

- 2026-10-04 — Owner confirmed that the site's use of Open-Meteo is non-commercial and that Geo Intelligence Hub may use it; both items removed from Intent not recorded; Constraints list the current rate limits.
- 2026-10-04 — Live loading waits for the person's action (T-aethercast-20261003-2e02): AEC-R01, R03, R04 and R05 reworded, AEC-R24 added (no request or geolocation on open), platform rule added under Constraints; the "live loading on open" item under Intent not recorded is settled by the platform rule and removed.
- 2026-10-04 — Added AEC-R23: inversion night hours use the dataset's own offset or timezone (T-aethercast-20261004-3116).
- 2026-10-01 — Created as an as-built spec from `src/tools/aethercast/`, the catalog entry, `.tasks/DONE.md` TASK-008, `.tasks/NEXT.md` TASK-012 and the tool's tests. Same day: catalog summary, privacy, accepts and first step corrected to describe the live Open-Meteo flow (they still said the tool never contacts a network service).

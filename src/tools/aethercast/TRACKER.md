---
tool: aethercast
folder: src/tools/aethercast
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-01-aethercast-design.md
tracker: src/tools/aethercast/TRACKER.md
updated: 2026-10-04
---

# AetherCast — tracker

## Resume here

23 requirements: 22 verified, 1 missing (AEC-R22, site theme, TASK-028). Next: T-aethercast-20261003-2e02 (live loading on the user's action) on `fix/aethercast`, then AEC-R22. Blocked on owner decisions: when live loading may start (on open or on a click), Open-Meteo non-commercial confirmation, and the TASK-012 design rationale for thresholds.

## Documents

- Spec: [2026-10-01-aethercast-design.md](../../../docs/superpowers/specs/2026-10-01-aethercast-design.md)
- Code: `aethercast-engine.ts` (EPA, EAQI, WHO, UV), `aethercast-live.ts` (Open-Meteo), `aethercast-import.ts`, `aethercast-anomaly.ts`, `aethercast-activity.ts`, `aethercast-export.ts`, `AetherCastForecastCanvas.tsx`, `AetherCastWorkspace.tsx`
- Task history: `.tasks/DONE.md` TASK-008 (retrospective); `.tasks/NEXT.md` TASK-012 (design rationale owed)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/aethercast-engine.test.ts`, `tests/unit/aethercast-audit-regressions.test.ts`; browser tests: `tests/e2e/aethercast.spec.ts`

## Requirement status

`engine` = `tests/unit/aethercast-engine.test.ts`; `audit` = `tests/unit/aethercast-audit-regressions.test.ts`; `e2e` = `tests/e2e/aethercast.spec.ts`.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| AEC-R01 | verified | e2e "AetherCast loads live Open-Meteo data from browser geolocation without requiring an upload" | |
| AEC-R02 | verified | e2e "AetherCast … search is a no-upload fallback when geolocation is unavailable" | |
| AEC-R03 | verified | e2e "AEC-R03 reloads the remembered location from this browser on reopen" | |
| AEC-R04 | verified | e2e "AEC-R04 refreshes live data on Refresh now and every 15 minutes" | |
| AEC-R05 | verified | e2e "keeps a manually selected location when initial geolocation resolves late", "keeps an imported fallback dataset when initial geolocation resolves late" | |
| AEC-R06 | verified | engine "maps CSV columns and converts declared source units into internal units"; e2e (imported fallback dataset); e2e "AEC-R18 exports a PDF brief, CSV, chart PNG and AetherCast JSON that re-imports" | |
| AEC-R07 | verified | engine "interprets timezone-less wall-clock timestamps…"; audit date, DST and reconciliation-count tests | |
| AEC-R08 | verified | engine "US EPA time-series assessment" group; audit "uses the EPA fixed AQI 200 SO2 rule…", "uses one-hour ozone breakpoints…" | |
| AEC-R09 | verified | engine "European index assessment" group | |
| AEC-R10 | verified | engine "requires the correct WHO rolling window…" | |
| AEC-R11 | verified | e2e "AetherCast exposes timestamp reconciliation, pollutant coverage, averaging windows, and provider-vs-calculated indices" | |
| AEC-R12 | verified | engine "unit conversion and UV helper" group | |
| AEC-R13 | verified | engine "does not alter scientific thresholds when a vulnerability display lens is selected" | |
| AEC-R14 | verified | engine "AEC-R14 lists wildfire and thermal-inversion screens and ignores steady air"; e2e "AEC-R14 lists a screening anomaly from the loaded data in the anomaly log" | |
| AEC-R15 | verified | engine "activity windows" group | |
| AEC-R16 | verified | e2e "AetherCast chart scrubs with a touch drag while vertical swipes still scroll the page" | |
| AEC-R17 | verified | e2e "AEC-R17 pages the hourly readout with first, previous, next and last" | |
| AEC-R18 | verified | e2e "AEC-R18 exports a PDF brief, CSV, chart PNG and AetherCast JSON that re-imports" | |
| AEC-R19 | verified | e2e "AEC-R19 shows Open-Meteo and CAMS attribution and labels live data as forecast-model data" | |
| AEC-R20 | verified | `tests/e2e/accessibility.spec.ts` route `aethercast` | |
| AEC-R21 | verified | e2e "AetherCast reflows loaded content at <viewport>" | |
| AEC-R22 | missing | — | Delivered through TASK-028 |
| AEC-R23 | verified | engine "AEC-R23 judges explicit-offset timestamps by their own offset in a <zone> browser", "AEC-R23 judges UTC (Z) timestamps in the dataset's IANA timezone in a <zone> browser", "AEC-R23 reads the local hour of wall-clock, offset and Z timestamps without the viewer timezone" | |

## Open work

1. Owner decisions in the spec's "Intent not recorded" (live loading on open, Open-Meteo non-commercial use, TASK-012).
2. AEC-R22 with TASK-028.

## Known limitations

- Live data is forecast-model data (CAMS via Open-Meteo), not a local regulatory monitor.

## Verification evidence

- 2026-10-04, `expand/aethercast` from `main` @ `c0299596`: `pnpm exec vitest run tests/unit/aethercast-engine.test.ts` 20 passed; `pnpm build` passed; `PW_PORT=4203 pnpm exec playwright test tests/e2e/aethercast.spec.ts --repeat-each=3` 96 passed (new AEC-R03, R04, R14, R17, R18, R19 tests 3/3 on desktop and mobile Chromium). `pnpm tool:check aethercast --base origin/main` 21/22, no errors; `tsc` clean; `pnpm test:unit` 3,700 passed, 4 timed out at 5 s in other tools' files under sandbox CPU load (those 3 files 56 passed with `--testTimeout=120000`); `docs:sync` and `docs:check` passed.
- 2026-10-01, `main` @ `d6b8254d` plus the catalog copy fix: `tsc` clean; `pnpm test:unit` 344 files / 3,703 passed; build passed; `aethercast.spec.ts` + `app.spec.ts` 38 passed; accessibility spec for the route 2 passed.

## Change log

- 2026-10-04 — AEC-R23 added and verified: `detectAnomalies` takes the dataset timezone and reads night hours from the timestamp's own offset (T-aethercast-20261004-3116).
- 2026-10-04 — Tests added for AEC-R03, R04, R14, R17, R18, R19 (now `verified`); AEC-R06 AetherCast JSON re-import covered by the AEC-R18 test. Inversion timezone defect recorded as T-aethercast-20261004-3116.
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`. Catalog copy corrected to describe the live Open-Meteo flow.

---
tool: aethercast
folder: src/tools/aethercast
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-01-aethercast-design.md
tracker: src/tools/aethercast/TRACKER.md
updated: 2026-10-01
---

# AetherCast — tracker

## Resume here

On `origin/main`. 22 requirements: 15 verified, 6 implemented without a covering test, 1 missing (site theme, TASK-028). Blocked on owner decisions: when live loading may start (on open or on a click), Open-Meteo non-commercial confirmation, and the TASK-012 design rationale for thresholds.

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
| AEC-R03 | implemented | — | |
| AEC-R04 | implemented | — | |
| AEC-R05 | verified | e2e "keeps a manually selected location when initial geolocation resolves late", "keeps an imported fallback dataset when initial geolocation resolves late" | |
| AEC-R06 | verified | engine "maps CSV columns and converts declared source units into internal units"; e2e (imported fallback dataset) | AetherCast JSON re-import has no test |
| AEC-R07 | verified | engine "interprets timezone-less wall-clock timestamps…"; audit date, DST and reconciliation-count tests | |
| AEC-R08 | verified | engine "US EPA time-series assessment" group; audit "uses the EPA fixed AQI 200 SO2 rule…", "uses one-hour ozone breakpoints…" | |
| AEC-R09 | verified | engine "European index assessment" group | |
| AEC-R10 | verified | engine "requires the correct WHO rolling window…" | |
| AEC-R11 | verified | e2e "AetherCast exposes timestamp reconciliation, pollutant coverage, averaging windows, and provider-vs-calculated indices" | |
| AEC-R12 | verified | engine "unit conversion and UV helper" group | |
| AEC-R13 | verified | engine "does not alter scientific thresholds when a vulnerability display lens is selected" | |
| AEC-R14 | implemented | — | `detectAnomalies` has no unit test |
| AEC-R15 | verified | engine "activity windows" group | |
| AEC-R16 | verified | e2e "AetherCast chart scrubs with a touch drag while vertical swipes still scroll the page" | |
| AEC-R17 | implemented | — | |
| AEC-R18 | implemented | — | |
| AEC-R19 | implemented | — | |
| AEC-R20 | verified | `tests/e2e/accessibility.spec.ts` route `aethercast` | |
| AEC-R21 | verified | e2e "AetherCast reflows loaded content at <viewport>" | |
| AEC-R22 | missing | — | Delivered through TASK-028 |

## Open work

1. Owner decisions in the spec's "Intent not recorded" (live loading on open, Open-Meteo non-commercial use, TASK-012).
2. Add tests for AEC-R03, R04, R14, R17, R18, R19.
3. AEC-R22 with TASK-028.

## Known limitations

- Live data is forecast-model data (CAMS via Open-Meteo), not a local regulatory monitor.

## Verification evidence

- 2026-10-01, `main` @ `d6b8254d` plus the catalog copy fix: `tsc` clean; `pnpm test:unit` 344 files / 3,703 passed; build passed; `aethercast.spec.ts` + `app.spec.ts` 38 passed; accessibility spec for the route 2 passed.

## Change log

- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`. Catalog copy corrected to describe the live Open-Meteo flow.

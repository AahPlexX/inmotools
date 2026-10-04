---
task: T-aethercast-20261003-2e02
tool: aethercast
doc: task
kind: fix
state: done
branch: fix/aethercast
created: 2026-10-03
updated: 2026-10-04
---

# Fetch live data only on the user's action

## Request
Known exception (docs/DECISIONS.md): on open, AetherCast fetches data for the saved location or asks for geolocation, and refreshes every 15 minutes, without a user action.

Owner, 2026-10-04: "For 2e02: the platform rule is that network requests happen only on the user's own action. Opening the tool must not fetch or ask for geolocation; show the remembered location with an explicit "Load live data" (or similar) control; the 15-minute auto refresh may run only after the user has started live data in this visit and must be stoppable. Update AEC requirements (AEC-R03/AEC-R04 wording and tests) accordingly and keep the spec consistent; the existing tests that expect fetch-on-open must be changed to the new behaviour."

## Resume here
Done. AEC-R24 `verified` (no request or geolocation on open); AEC-R01, R03, R04, R05 reworded and their tests rewritten; DECISIONS "Known exceptions" AetherCast row removed.

## Log
- 2026-10-03: recorded.
- 2026-10-04: claimed `fix/aethercast`.
- 2026-10-04: root cause: a mount effect in `AetherCastWorkspace.tsx` fetched the saved location or called `getBrowserLiveLocation()`, and the 15-minute interval ran whenever live data was shown. Fix: no mount fetch; the remembered location is read from `localStorage` and shown with Load live data; `autoRefresh` is set only by Use my location, a search result or Load live data, cleared on file import, and toggled by Stop/Resume auto refresh; catalog privacy and first step updated. `tests/e2e/aethercast.spec.ts` "AEC-R24 …" (with and without a remembered location; clock advanced 16 min; no request to another origin, no geolocation call) and rewritten AEC-R01, R03, R04, R05 tests: 36/36 passed on desktop and mobile Chromium; AEC-R24, R03, R04 fail against the previous workspace (4 failed, desktop). `pnpm tool:check aethercast --base origin/main` 23/24, no errors.

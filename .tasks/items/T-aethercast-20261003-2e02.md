---
task: T-aethercast-20261003-2e02
tool: aethercast
doc: task
kind: fix
state: active
branch: fix/aethercast
created: 2026-10-03
updated: 2026-10-04
---

# Fetch live data only on the user's action

## Request
Known exception (docs/DECISIONS.md): on open, AetherCast fetches data for the saved location or asks for geolocation, and refreshes every 15 minutes, without a user action.

## Resume here
Not started. Add a requirement to the spec, then gate the first fetch and the refresh behind an explicit control.

## Log
- 2026-10-03: recorded.
- 2026-10-04: claimed `fix/aethercast`.

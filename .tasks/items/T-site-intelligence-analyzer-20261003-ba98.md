---
task: T-site-intelligence-analyzer-20261003-ba98
tool: site-intelligence-analyzer
doc: task
kind: fix
state: done
branch: fix/site-intelligence-analyzer
created: 2026-10-03
updated: 2026-10-04
---

# Remove or replace the CrUX API key field

## Request
Known exception (docs/DECISIONS.md): `SiteIntelWorkspace.tsx` offers an optional CrUX API key field; the platform rules allow keyless sources only.

Owner, 2026-10-04: "Remove the field, its storage and any code path that sends a key; if a keyless source for the same data exists and its terms allow browser use, you may use it, otherwise remove the feature and leave a clear note in the UI that field data is not available without a key. Clear any previously stored key from localStorage on load. The tool has no standard spec; record the change in src/tools/site-intel/TRACKING.md."

## Resume here
Done. Feature 28 (CrUX) is prohibited (needs an API key) in `src/tools/site-intel/TRACKING.md`; the field, its storage and `crux-engine.ts` are removed; DECISIONS "Known exceptions" row removed.

## Log
- 2026-10-03: recorded.
- 2026-10-04: claimed `fix/site-intelligence-analyzer`.
- 2026-10-04: root cause: `SiteIntelWorkspace.tsx` stored a user's Google CrUX API key in the tool's IndexedDB `settings` table (`crux-api-key`, via `setSetting`; never in `localStorage`) and `crux-engine.ts` sent it as `?key=` to `chromeuxreport.googleapis.com`. Fix: field, state, request and `crux-engine.ts` removed; Performance & Tech states that field data is not available without a key; on load `purgeRetiredCredentials()` deletes the stored `crux-api-key` row; catalog hint updated. Keyless alternative not used: the PageSpeed Insights API documentation states its real-world data is soon to be discontinued. Tests: `tests/unit/site-intel-no-api-key.test.ts` 2 passed (fail against the previous source); `tests/e2e/site-intel.spec.ts` 10 passed (desktop and mobile), new test seeds the old key and checks it is deleted and no CrUX/key request is made; accessibility route 2 passed; `app.spec.ts` 18 passed; `tsc` clean; build passed; `pnpm test:unit` 3,707 passed, 2 timed out at 5 s in `tests/unit/mastering-loudness.test.ts` under load (13 passed alone with `--testTimeout=120000`). No `tool:check` (tool has no tracker).

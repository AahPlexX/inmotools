---
task: T-geo-intelligence-hub-20261004-9b3e
tool: geo-intelligence-hub
doc: task
kind: fix
state: done
branch: fix/geo-intelligence-hub
created: 2026-10-04
updated: 2026-10-04
---

# Find the cause of a one-off axe failure

## Request
Found 2026-10-04: "has no serious or critical axe violations…" in `tests/e2e/geo-intel.spec.ts` failed once in a three-repeat run (146 passed); the log was lost, and 6/6 reruns passed. Repeat the test until it fails and record the violation.

## Resume here
Done. No axe violation reproduced in 264 complete scan runs; the only failure seen was the 30 s test timeout. `GIH-R67 has no serious or critical axe violations…` now waits for a settled lookup and focused dialogs, has a 120 s budget and prints rule ID, impact and element on failure.

## Log
- 2026-10-04: recorded during the untested-requirement coverage pass.
- 2026-10-04: claimed `fix/geo-intelligence-hub`.
- 2026-10-04: reproduction at `ee3b09a4`, desktop + mobile `--repeat-each=40` each: with the default 30 s timeout 34 passed / 46 failed, every failure `Test timeout of 30000ms exceeded` (inside `AxeBuilder.analyze` or before it), no axe assertion failed; with `--timeout=180000` 80/80 passed, durations median 23.1 s desktop / 33.1 s mobile, max 48.2 s, 50 of 80 over 30 s (load average 28–33 on 8 cores). Earlier interrupted run: 9 of 80 and 80 of 80 failed, all timeouts. A probe scanning during the lookup, four times on the profile, three times each with the export dialog and the provenance inspector open, under CPU throttling 1×–7× and 0–400 ms random response delay: 24/24 runs, 0 serious or critical violations.
- 2026-10-04: test fix: waits for `.gi-busy` gone and Look up enabled (lookup, history write and refresh finished), Project title focused in the export dialog, export dialog removed, Close focused and a table row visible in the provenance inspector; `test.setTimeout(120_000)`; title prefixed `GIH-R67`; failure message lists rule ID, impact, target, HTML and failure summary. After the fix `-g "GIH-R67" --repeat-each=40` twice: 160/160 passed (median 18.0 s desktop / 16.1 s mobile, max 19.9 s). Total complete axe runs without a serious or critical violation: 264.
- 2026-10-04: checks on the fix commit: `tsc --noEmit -p tsconfig.app.json` exit 0; `pnpm test:unit` 343 files / 3,707 tests passed (2 files / 14 tests skipped); `pnpm build` exit 0; `tests/e2e/geo-intel.spec.ts` 49 passed / 15 skipped; `tests/e2e/app.spec.ts` 18 passed; `tests/e2e/accessibility.spec.ts -g geo-intelligence-hub` 2 passed.

---
task: T-audio-mastering-20261004-d7fa
tool: audio-mastering
doc: task
kind: fix
state: next
branch: fix/audio-mastering
created: 2026-10-04
updated: 2026-10-04
---

# Make the mastering realtime-chain e2e test pass under load

## Request
Found 2026-10-04 on `fix/audio-mastering` (T-audio-mastering-20261004-5d02): `tests/e2e/mastering.spec.ts:424` "masters the mix with the realtime chain, meters, monitoring, and an offline render" failed on desktop-chromium and mobile-chromium (test timeout 30000 ms) when run with `tests/e2e/app.spec.ts` on a machine at load average 20-25 on 8 cores; `locator.click` on the "Pause" button (line 479) waited while the button was disabled. Run alone with `--workers=1` it passed 2/2.

## Resume here
Not started. Reproduce under load, find why Pause is disabled at line 479, fix, run with `--repeat-each=20`.

## Log
- 2026-10-04: recorded.

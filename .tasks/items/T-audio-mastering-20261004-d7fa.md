---
task: T-audio-mastering-20261004-d7fa
tool: audio-mastering
doc: task
kind: fix
state: done
branch: fix/audio-mastering
created: 2026-10-04
updated: 2026-10-04
---

# Make the mastering realtime-chain e2e test pass under load

## Request
Found 2026-10-04 on `fix/audio-mastering` (T-audio-mastering-20261004-5d02): `tests/e2e/mastering.spec.ts:424` "masters the mix with the realtime chain, meters, monitoring, and an offline render" failed on desktop-chromium and mobile-chromium (test timeout 30000 ms) when run with `tests/e2e/app.spec.ts` on a machine at load average 20-25 on 8 cores; `locator.click` on the "Pause" button (line 479) waited while the button was disabled. Run alone with `--workers=1` it passed 2/2.

## Resume here
Done. The test loops playback, waits for the playing state before monitoring and before Pause, and has a 90 s timeout (comment in the test). Recorded under "Post-integration fixes" in `docs/superpowers/plans/2026-09-27-audio-mastering-production-parity-audit.md`.

## Log
- 2026-10-04: recorded.
- 2026-10-04: claimed `fix/audio-mastering`.
- 2026-10-04: reproduced with `tests/e2e/app.spec.ts` at load average 20-35 on 8 cores: 8/10 failed (5 repeats, both projects). At the timeout the page showed Play enabled, Pause disabled, playhead 0:06.000: the 6 s mix had finished playing (state `idle`) before the final Pause click, so Pause was correctly disabled; playback had started and been confirmed (Pause enabled at line 466). Not a product bug. Fix 1: Loop on before Play, wait for "Playing with loop on", and wait for an enabled Pause before clicking it. With that alone 15/40 passed under load; traces of the failures showed every step completing and the test ending in "Paused at", over 30 s in total (about 45 UI steps plus an offline render and measurement). Fix 2: `test.setTimeout(90_000)` with the reason in a comment.
- 2026-10-04: verification at load average 20-30: `--repeat-each=20` 40/40 (desktop-chromium and mobile-chromium, slowest 32.0 s); `--repeat-each=10` 20/20 while `pnpm test:unit` ran in a loop for the whole run (slowest 39.9 s). Unit runs in that loop: 3720 passed twice; once `tests/unit/markdown-citation.test.ts` hit a 5 s timeout and passes alone (32/32). `tests/e2e/mastering.spec.ts` + `tests/e2e/app.spec.ts` 44/44, `tests/e2e/accessibility.spec.ts` for the route and keyboard focus 4/4, `tsc` clean, `pnpm build` clean, `pnpm tool:check audio-mastering --base origin/main`: pending (no standard spec and tracker).

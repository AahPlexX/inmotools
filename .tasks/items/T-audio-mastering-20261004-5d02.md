---
task: T-audio-mastering-20261004-5d02
tool: audio-mastering
doc: task
kind: fix
state: done
branch: fix/audio-mastering
created: 2026-10-04
updated: 2026-10-04
---

# Stop mastering loudness unit tests timing out under load

## Request
Found 2026-10-04: two tests in `tests/unit/mastering-loudness.test.ts` exceeded the 5 s Vitest timeout in several `pnpm test:unit` runs while the machine was heavily loaded; the file passes alone. Either speed up the fixtures or give these tests an explicit timeout.

## Resume here
Done. The two reference-signal tests carry an explicit 60 s timeout (`REFERENCE_SIGNAL_TIMEOUT_MS` in `tests/unit/mastering-loudness.test.ts`); the signals keep their EBU-defined lengths.

## Log
- 2026-10-04: recorded during the untested-requirement coverage pass.
- 2026-10-04: claimed `fix/audio-mastering`.
- 2026-10-04: slow tests: "cases 3, 4, and 5: relative and absolute gating" (EBU Tech 3341, 240 s of stereo audio) and "cases 1-4" (EBU Tech 3342, 220 s). Reproduced on a loaded machine (load average 25 on 8 cores): 10408 ms and 9078 ms with the file run alone, both over the 5 s default. Profile of an 80 s and a 100 s stereo fixture: tone generation 132 ms / 128 ms, `measureLoudness` 985 ms / 1088 ms, so the time is in metering (K-weighting, gating and the 4x true-peak interpolator per sample), not in the fixture; shortening the signals would change the EBU case definitions. Fix: those two tests get an explicit 60 s timeout with a comment stating why. 20/20 runs of the file (13/13 each) while `pnpm test:unit` ran in parallel; slowest gating run 19080 ms, slowest LRA run 7119 ms, every other test in the file at most 2380 ms. In that parallel `pnpm test:unit` the file passed; `tests/unit/logic-synthesis-engine.test.ts` and `tests/unit/markdown-citation.test.ts` hit 5 s timeouts and pass alone (43/43).

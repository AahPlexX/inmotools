---
task: T-convolution-room-profiler-20261004-28f5
tool: convolution-room-profiler
doc: task
kind: expand
state: done
branch: expand/convolution-room-profiler
created: 2026-10-04
updated: 2026-10-04
---

# Cover untested requirements

## Request
Owner, 2026-10-03: integrate and run missing tests for untested requirements; fix wrong statuses when fully resolvable.

## Resume here
Done. CRP-R08, R13 and R15 are covered by browser tests and `verified`; remaining open work is the `missing` rows CRP-R16 and CRP-R17 (see the tracker).

## Log
- 2026-10-04: claimed `expand/convolution-room-profiler`.
- 2026-10-04: added to `tests/e2e/audio.spec.ts`: `CRP-R08 live controls update the running graph without rebuilding it or stopping playback` (counts convolver/source creation and the AudioParam targets while playing), `CRP-R13 a stereo source with a stereo IR renders a stereo WAV that keeps each IR channel` (OfflineAudioContext render; the downloaded 24-bit WAV has 2 channels with the left and right IR peaks at their own offsets), `CRP-R15 lays out without horizontal overflow and keeps controls usable at <width> px` (7 widths). All passed 3/3. CRP-R08, R13, R15 `implemented` → `verified`; CRP-R09 evidence extended to the live spectrum. The existing CRP-R07 pre-delay test failed 1 of 6 runs (extension landed after a 0.5 s tail ended); it now uses a 2 s IR and a 2000 ms extension (8/8 passed). No code defects found; no row needs physical testing (all acceptance criteria are checked through Web Audio and the offline renderer). `pnpm tool:check convolution-room-profiler --base origin/main`: 15 verified, 2 missing, no errors.

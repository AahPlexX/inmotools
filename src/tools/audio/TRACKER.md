---
tool: convolution-room-profiler
folder: src/tools/audio
doc: tracker
basis: as-built
status: done
spec: docs/superpowers/specs/2026-10-01-convolution-room-profiler-design.md
tracker: src/tools/audio/TRACKER.md
updated: 2026-10-01
---

# Room Profiler — tracker

## Resume here

On `origin/main`. 17 requirements: 12 verified, 3 implemented without a covering test, 2 missing. Next action: add tests for the `implemented` rows. No blocker.

## Documents

- Spec: [2026-10-01-convolution-room-profiler-design.md](../../../docs/superpowers/specs/2026-10-01-convolution-room-profiler-design.md)
- Original design: "Tool 16" in [2026-08-29-next-ten-local-tools-design.md](../../../docs/superpowers/specs/2026-08-29-next-ten-local-tools-design.md)
- Code: `audio-engine.ts` (graph config, WAV encoder), `AudioWorkspace.tsx` (UI, Web Audio), `SpectrogramCanvas.tsx` (spectrum)
- Task history: `.tasks/NEXT.md` 2026-09-11 reconciliation (graph lifecycle findings resolved)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/audio.test.ts`; browser tests: `tests/e2e/audio.spec.ts`

## Requirement status

`unit` = `tests/unit/audio.test.ts`; `e2e` = `tests/e2e/audio.spec.ts`.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| CRP-R01 | verified | e2e "a cancelled render cannot finish…" (both files decoded) | |
| CRP-R02 | verified | unit "accepts only ConvolverNode-supported IR channel counts" | |
| CRP-R03 | verified | unit "computes a bounded equal-power wet/dry crossfade" | |
| CRP-R04 | verified | e2e "exposes live convolution controls, bypass, gain safety…" | |
| CRP-R05 | verified | unit "caps filter frequencies to the current Nyquist range" | |
| CRP-R06 | verified | e2e "exposes live convolution controls, bypass…" | |
| CRP-R07 | verified | unit "includes the active pre-delay when scheduling convolution tail cleanup"; e2e "extending pre-delay during the tail postpones graph cleanup" | |
| CRP-R08 | implemented | — | Reconciled in `.tasks/NEXT.md` 2026-09-11; no direct test |
| CRP-R09 | verified | e2e (idle spectrum image) | Live spectrum has no test |
| CRP-R10 | verified | unit "keeps offline rendering channel counts compatible with the convolution graph" | |
| CRP-R11 | verified | unit "clamps finite audio samples…", "writes a little-endian 24-bit PCM RIFF/WAVE file…", "rejects missing, mismatched, or invalid…" | |
| CRP-R12 | verified | e2e "a cancelled render cannot finish or reset a newer render" | |
| CRP-R13 | implemented | — | Stereo IRs are accepted; no test checks a stereo render |
| CRP-R14 | verified | `tests/e2e/accessibility.spec.ts` route `convolution-room-profiler` | |
| CRP-R15 | implemented | — | No viewport test for this route |
| CRP-R16 | missing | — | Delivered through TASK-028 |
| CRP-R17 | missing | — | Added 2026-10-02 |

## Open work

0. Build the requirements added 2026-10-02: CRP-R17.
1. Add tests for CRP-R08, R13, R15.
2. CRP-R16 with TASK-028.

## Known limitations

- `ConvolverNode` limits IRs to 1, 2 or 4 channels.

## Verification evidence

- 2026-10-01, `main` @ `bedde392`: `tests/unit/audio.test.ts` 8/8; `tests/e2e/audio.spec.ts` 6 passed (desktop and mobile); accessibility spec for the route 2 passed.

## Change log

- 2026-10-02 — Added CRP-R17 (default integration rule).
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.

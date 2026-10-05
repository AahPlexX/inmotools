---
tool: convolution-room-profiler
folder: src/tools/audio
doc: tracker
basis: as-built
status: done
spec: docs/superpowers/specs/2026-10-01-convolution-room-profiler-design.md
tracker: src/tools/audio/TRACKER.md
updated: 2026-10-04
---

# Room Profiler — tracker

## Resume here

17 requirements: 15 verified, 0 implemented, 2 missing. Next action: build CRP-R17; CRP-R16 follows the site-wide theme. No blocker.

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
| CRP-R08 | verified | e2e "CRP-R08 live controls update the running graph without rebuilding it or stopping playback" | |
| CRP-R09 | verified | e2e "exposes live convolution controls, bypass, gain safety, and idle spectrum without requiring audio fixtures" (idle); e2e "CRP-R08 live controls update the running graph without rebuilding it or stopping playback" (live) | |
| CRP-R10 | verified | unit "keeps offline rendering channel counts compatible with the convolution graph" | |
| CRP-R11 | verified | unit "clamps finite audio samples…", "writes a little-endian 24-bit PCM RIFF/WAVE file…", "rejects missing, mismatched, or invalid…" | |
| CRP-R12 | verified | e2e "a cancelled render cannot finish or reset a newer render" | |
| CRP-R13 | verified | e2e "CRP-R13 a stereo source with a stereo IR renders a stereo WAV that keeps each IR channel" (OfflineAudioContext render, decoded WAV) | |
| CRP-R14 | verified | `tests/e2e/accessibility.spec.ts` route `convolution-room-profiler` | |
| CRP-R15 | verified | e2e "CRP-R15 lays out without horizontal overflow and keeps controls usable at <width> px" (7 widths, 320–2560) | |
| CRP-R16 | missing | — | Delivered through the site-wide theme selector |
| CRP-R17 | missing | — | Added 2026-10-02 |

## Open work

0. Build the requirements added 2026-10-02: CRP-R17.
1. CRP-R16 with the site-wide theme selector.

## Known limitations

- `ConvolverNode` limits IRs to 1, 2 or 4 channels.

## Verification evidence

- 2026-10-04, `expand/convolution-room-profiler` @ `534ca2ff` + working tree: `pnpm build` exit 0; `PW_PORT=4201 pnpm exec playwright test tests/e2e/audio.spec.ts --repeat-each=3` 51 passed / 21 skipped / 0 failed; `-g "pre-delay|CRP-R08|CRP-R13" --repeat-each=8` 48 passed; `tsc --noEmit -p tsconfig.app.json` exit 0; `pnpm test:unit` 343 files / 3,706 tests passed, 0 failed; `pnpm tool:check convolution-room-profiler --base origin/main` no errors.
- 2026-10-01, `main` @ `bedde392`: `tests/unit/audio.test.ts` 8/8; `tests/e2e/audio.spec.ts` 6 passed (desktop and mobile); accessibility spec for the route 2 passed.

## Change log

- 2026-10-04 — Browser tests added for CRP-R08, CRP-R13 (offline render of a stereo source through a stereo IR) and CRP-R15 (all `implemented` → `verified`); CRP-R09 evidence extended to the live spectrum. The CRP-R07 pre-delay test now uses a 2 s IR and a 2000 ms extension, because with a 0.5 s IR it failed 1 of 6 runs when the extension landed after the tail had already ended.
- 2026-10-02 — Added CRP-R17 (default integration rule).
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.

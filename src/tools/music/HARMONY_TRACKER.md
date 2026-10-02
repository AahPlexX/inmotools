---
tool: midi-harmony-lab
folder: src/tools/music
doc: tracker
basis: as-built
status: done
spec: docs/superpowers/specs/2026-10-01-midi-harmony-lab-design.md
tracker: src/tools/music/HARMONY_TRACKER.md
updated: 2026-10-01
---

# MIDI Harmony Lab — tracker

## Resume here

On `origin/main`. 17 requirements: 11 verified, 2 implemented without a covering test, 4 missing Next action: add tests for MHL-R04 and R13. No blocker.

This file is named `HARMONY_TRACKER.md` because `src/tools/music/` also holds Audio Mastering, whose tracking stays in its own documents.

## Documents

- Spec: [2026-10-01-midi-harmony-lab-design.md](../../../docs/superpowers/specs/2026-10-01-midi-harmony-lab-design.md)
- Code: `music-engine.ts` (chords, validation, MIDI, JSON), `HarmonyWorkspace.tsx` (UI, Web Audio)
- Task history: `.tasks/WORK_LOG.md` 2026-09-04 TASK-015 (render crash fix); commit `0e8bf75d` gave Audio Mastering its own route and restored this tool
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/music.test.ts`; browser tests: `tests/e2e/music.spec.ts`

## Requirement status

`unit` = `tests/unit/music.test.ts`; `e2e` = `tests/e2e/music.spec.ts`.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| MHL-R01 | verified | unit "builds first inversion major voicing in ascending order", "builds a chord for a valid spec" | |
| MHL-R02 | verified | unit "rejects a note letter with no octave…", "rejects empty, nonsense, and out-of-range MIDI roots/voicings", "returns null instead of throwing for an incomplete root" | |
| MHL-R03 | verified | unit "reports simple voice-leading movement between neighboring voicings" | |
| MHL-R04 | implemented | e2e removes chords in the JSON test | Move earlier/later has no test |
| MHL-R05 | verified | unit "rejects invalid tempo and chord durations before playback/export math" | |
| MHL-R06 | verified | e2e "starts and explicitly stops the local Web Audio progression" | |
| MHL-R07 | verified | e2e "owns a pending AudioContext before resume resolves and cannot schedule after Stop" | |
| MHL-R08 | verified | e2e "surfaces resume and scheduling failures and releases failed contexts" | |
| MHL-R09 | verified | e2e "loops a snapshot, identifies the active chord, and applies edits on the next audition" | |
| MHL-R10 | verified | unit "encodes a standard MIDI header for exported progressions" | |
| MHL-R11 | verified | unit "round-trips a versioned progression document…", "rejects unsupported document versions", "rejects malformed or musically invalid imported progressions"; e2e "saves and loads a versioned progression JSON document" | |
| MHL-R12 | verified | `tests/e2e/accessibility.spec.ts` route `midi-harmony-lab` | |
| MHL-R13 | implemented | — | No viewport test for this route |
| MHL-R14 | missing | — | Delivered through TASK-028 |
| MHL-R15 | missing | — | Added 2026-10-02 |
| MHL-R16 | missing | — | Added 2026-10-02 |
| MHL-R17 | missing | — | Added 2026-10-02 |

## Open work

0. Build the requirements added 2026-10-02: MHL-R15, MHL-R16, MHL-R17.
1. Add tests for MHL-R04 (move), R13.
2. MHL-R14 with TASK-028.

## Known limitations

- Triads only; the audition synth is a plain triangle wave.

## Verification evidence

- 2026-10-01, `main` @ `052d6afb`: `tests/unit/music.test.ts` 12/12; `tests/e2e/music.spec.ts` 10 passed (desktop and mobile); accessibility spec for the route 2 passed.

## Change log

- 2026-10-02 — Added MHL-R15, MHL-R16, MHL-R17 (default integration rule).
- 2026-10-01 — Created per `docs/DOCUMENTATION_STANDARD.md`.

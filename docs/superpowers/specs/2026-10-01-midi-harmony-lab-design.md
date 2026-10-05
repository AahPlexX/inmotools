---
tool: midi-harmony-lab
folder: src/tools/music
doc: spec
basis: as-built
status: done
spec: docs/superpowers/specs/2026-10-01-midi-harmony-lab-design.md
tracker: src/tools/music/HARMONY_TRACKER.md
updated: 2026-10-01
---

# MIDI Harmony Lab — spec

As built at `0e8bf75d` (last change to `HarmonyWorkspace.tsx` / `music-engine.ts`). Requirement prefix: `MHL`. Status of each requirement: [HARMONY_TRACKER.md](../../../src/tools/music/HARMONY_TRACKER.md).

The folder `src/tools/music/` is shared with Audio Mastering; this spec covers only `HarmonyWorkspace.tsx` and `music-engine.ts`.

## Purpose

Let music producers, beatmakers and theory students build a chord progression, hear it in the browser, see how far each voice moves between chords, and export it as a standard MIDI file for a DAW.

## Scope

In scope:
- Triads (major, minor, diminished, sus2, sus4) with root, inversion and length in beats; tempo.
- Browser audition with a simple synth, optional looping.
- MIDI export and a versioned JSON save/load format.

Out of scope:
- Recording or importing MIDI performances; sound design beyond the audition synth.

## Constraints

- Platform rules: no accounts, no server or database, everything runs in the browser ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- Audition uses the Web Audio API; no samples are downloaded.

## Requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| MHL-R01 | Each chord has a root note with octave (for example `C4`), a quality, an inversion (root, first, second) and a length in beats (0.25–64) | First-inversion major voicing is built in ascending order |
| MHL-R02 | An incomplete or out-of-range root is flagged on the chord without crashing, and the chord's notes are not built | `C` without octave shows the hint; nonsense and out-of-range roots rejected |
| MHL-R03 | Each chord shows its MIDI notes and the voice-leading movement in semitones from the previous chord | Movement between neighboring voicings is reported |
| MHL-R04 | Chords can be added, removed (at least one stays), and moved earlier or later | Remove and move change the progression |
| MHL-R05 | Tempo is 30–300 BPM; invalid tempo or beats are refused before playback or export with a message | Invalid tempo refused |
| MHL-R06 | Play auditions the progression through Web Audio, and Stop ends it and releases the audio graph | Start then Stop releases the context |
| MHL-R07 | The audio context is owned before it finishes starting, so Stop during startup closes it and nothing is scheduled after Stop | Pending context closed on Stop |
| MHL-R08 | Startup and scheduling failures are reported and the failed context is released | Failure message shown; context closed |
| MHL-R09 | Optional loop; the audition plays a snapshot taken at Play, edits apply to the next audition, and the active chord is announced | Loop runs the snapshot; active chord shown; edit applies next time |
| MHL-R10 | Export a standard MIDI file `inmotools-progression.mid` | Exported bytes start with a valid MIDI header |
| MHL-R11 | Save and load a versioned progression JSON; unsupported versions and invalid chords are refused on load | JSON round-trips; bad versions refused |
| MHL-R12 | No serious or critical axe violations | Catalog-wide accessibility spec for this route |
| MHL-R13 | No horizontal overflow and controls usable from 320 px to 2560 px | Viewport check at the standard widths |
| MHL-R14 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) | Workspace switches with the site theme; axe passes in both themes |
| MHL-R15 | Seventh and extended chord qualities (maj7, m7, 7, m7b5, dim7, add9) | Each quality builds the correct notes and exports to MIDI |
| MHL-R16 | Suggest the inversion with the smallest voice-leading movement from the previous chord | Suggestion picks the minimum-movement inversion |
| MHL-R17 | Send the progression to a connected instrument through Web MIDI where the browser supports it | Notes reach a mocked MIDI output |

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Intent not recorded

- None.

## Change log

- 2026-10-02 — Added MHL-R15, MHL-R16, MHL-R17 under the default integration rule (ideas that fit the platform rules become requirements).
- 2026-10-01 — Created as an as-built spec from `HarmonyWorkspace.tsx`, `music-engine.ts`, the catalog entry and the tool's tests.

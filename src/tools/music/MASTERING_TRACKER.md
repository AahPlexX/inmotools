---
tool: audio-mastering
folder: src/tools/music
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-audio-mastering-design.md
tracker: src/tools/music/MASTERING_TRACKER.md
updated: 2026-10-05
---

# Audio Mastering — tracker

## Resume here

160 requirements: 100 verified, 24 implemented, 1 partial, 35 missing, 0 prohibited. Next action: add tests for the implemented rows (Open work 1), then build the missing rows in the order of Open work. No blocker.

This file is named `MASTERING_TRACKER.md` because `src/tools/music/` also holds MIDI Harmony Lab (`HARMONY_TRACKER.md`).

## Documents

- Spec: [2026-10-05-audio-mastering-design.md](../../../docs/superpowers/specs/2026-10-05-audio-mastering-design.md)
- Older design and ledgers (history): [2026-09-16-audio-mastering-workstation-design.md](../../../docs/superpowers/specs/2026-09-16-audio-mastering-workstation-design.md), [2026-09-27-audio-mastering-completion.md](../../../docs/superpowers/plans/2026-09-27-audio-mastering-completion.md) (81-function ledger), [2026-09-27-audio-mastering-production-parity-audit.md](../../../docs/superpowers/plans/2026-09-27-audio-mastering-production-parity-audit.md), plans [phase 1](../../../docs/superpowers/plans/2026-09-16-audio-mastering-phase-1.md), [phase 2](../../../docs/superpowers/plans/2026-09-17-audio-mastering-phase-2.md), [phase 3](../../../docs/superpowers/plans/2026-09-18-audio-mastering-phase-3.md)
- Research: `docs/research/audio-mastering-*.md`
- Owner notes: [owner-feature-notes-2026-10-05.md](../../../docs/research/owner-feature-notes-2026-10-05.md)
- Task files: `.tasks/items/T-audio-mastering-20261005-bfde.md` (this work), `T-audio-mastering-20261004-5d02.md`, `T-audio-mastering-20261004-d7fa.md`; dark contrast: `.tasks/items/T-repository-dark-contrast-20261004-b7d2.md`
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Code: `MusicWorkspace.tsx`, `MasteringWorkspace.tsx`, `Mastering*.tsx`, `mastering-*.ts`, `dsp/`

## Requirement status

`e2e` = `tests/e2e/mastering.spec.ts` unless another file is named; `unit` = `tests/unit/mastering-*.test.ts`.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| AMW-R01 | verified | e2e "imports, auditions, edits, marks, and undoes a local master" | |
| AMW-R02 | implemented | `mastering-media.ts` (MediaBunny `ALL_FORMATS`) | Tests import WAV only |
| AMW-R03 | verified | e2e "imports, auditions, edits, marks, and undoes a local master" | |
| AMW-R04 | implemented | `mastering-media.ts` `summarizeMetadata` | No test imports a tagged file |
| AMW-R05 | verified | e2e "arranges multiple tracks with split, nudge, fades, crossfade, and zoom"; unit "converts sources to the project rate on load and reports missing sources by clip name" | Drop is not exercised; the picker path is |
| AMW-R06 | verified | unit "bounds the project to eight mono or stereo tracks with a clear reason" | |
| AMW-R07 | verified | unit "renames, reorders, mixes, and removes tracks, pruning unused sources"; e2e "arranges multiple tracks with split, nudge, fades, crossfade, and zoom" | |
| AMW-R08 | verified | unit "converts 44.1 kHz to 48 kHz with a band-limited result that matches the analytic tone", "removes content above the new Nyquist frequency when downsampling" | |
| AMW-R09 | verified | unit "halves resolution per level down to a small coarsest level", "never loses an extreme sample at any zoom level"; e2e "arranges multiple tracks with split, nudge, fades, crossfade, and zoom" | Ctrl+wheel and pinch have no test |
| AMW-R10 | verified | e2e "shows a synced spectrogram and repairs a painted region"; unit "places a tone in the right log-frequency row and time columns" | |
| AMW-R11 | implemented | `MasteringTimeline.tsx` (Zoom to selection) | No test |
| AMW-R12 | implemented | `MasteringEditTab.tsx` (Select whole clip) | No test |
| AMW-R13 | verified | e2e "imports, auditions, edits, marks, and undoes a local master" | |
| AMW-R14 | implemented | e2e "imports, auditions, edits, marks, and undoes a local master", "autosaves, recovers after a reload, backs up and reopens, saves presets, and reports capabilities" | Tests cover Space, L, Left/Right, Escape and "?"; S, A, M, +/-, Home/End and the undo/redo keys have no test |
| AMW-R15 | missing | — | Key choice under "Intent not recorded" |
| AMW-R16 | verified | unit "clamps and orders a selection against duration"; e2e "imports, auditions, edits, marks, and undoes a local master" | |
| AMW-R17 | verified | e2e "imports, auditions, edits, marks, and undoes a local master" | |
| AMW-R18 | missing | — | |
| AMW-R19 | verified | unit "snaps to the nearest sign change around an edit point", "snaps a range deletion to the requested channel zero crossing when enabled", "snaps timeline times to zero crossings inside the clip" | |
| AMW-R20 | verified | unit "splits into two frame-exact halves, then duplicates, moves, nudges, and restores through history"; e2e "arranges multiple tracks with split, nudge, fades, crossfade, and zoom" | |
| AMW-R21 | verified | unit "crops edits, markers, regions, selection, and playhead together"; e2e "imports, auditions, edits, marks, and undoes a local master" | |
| AMW-R22 | verified | unit "splits and trims every channel at the same exact frame boundary" | |
| AMW-R23 | verified | unit "deletes a range and remaps markers, regions, selection, and playhead together", "maps timeline ranges into a clip that starts later and ripples following clips on that track only" | |
| AMW-R24 | verified | unit "splits into two frame-exact halves, then duplicates, moves, nudges, and restores through history", "updates clip gain/pan/mute/name within bounds and moves clips between tracks"; e2e "arranges multiple tracks with split, nudge, fades, crossfade, and zoom" | |
| AMW-R25 | implemented | `MasteringArrangePanel.tsx` (Delete clip) | No test |
| AMW-R26 | verified | unit "rises from 0 to 1 for every curve and mirrors for fade-outs", "clamps fades so fade-in and fade-out never overlap" | |
| AMW-R27 | verified | unit "creates a synchronized crossfade by overlapping two clips on one track", "applies fades at frame centres and keeps an equal-power crossfade at constant power" | |
| AMW-R28 | verified | unit "honours track gain, clip and track mute, and solo", "uses a unity-centre balance law", "renders a single centred clip bit-identically to its material" | |
| AMW-R29 | verified | unit "commits, undoes, and redoes one atomic revision", "bounds history to 100 revisions and clears redo after a divergent commit"; e2e "masters the mix with the realtime chain, meters, monitoring, and an offline render" | |
| AMW-R30 | verified | e2e "imports, auditions, edits, marks, and undoes a local master" | |
| AMW-R31 | missing | — | Numeric start, nudge and move-to-track exist (AMW-R24) |
| AMW-R32 | missing | — | Numeric trim and fade fields exist |
| AMW-R33 | missing | — | |
| AMW-R34 | missing | — | |
| AMW-R35 | missing | — | Split at playhead exists (AMW-R20) |
| AMW-R36 | missing | — | |
| AMW-R37 | missing | — | |
| AMW-R38 | missing | — | |
| AMW-R39 | verified | unit "applies gain without mutating the source"; e2e "imports, auditions, edits, marks, and undoes a local master" | |
| AMW-R40 | verified | unit "normalizes the absolute peak to the requested dBFS target" | |
| AMW-R41 | verified | unit "normalizes integrated loudness and RMS to the target"; e2e "processes a clip with loudness, bit depth, stretch, pitch, room tone, and the sample pen" | |
| AMW-R42 | verified | unit "measures and removes per-channel DC offset without mutating source PCM" | |
| AMW-R43 | verified | unit "inverts polarity and reverses only the requested sample range" | |
| AMW-R44 | verified | unit "inverts polarity and reverses only the requested sample range" | |
| AMW-R45 | verified | unit "swaps stereo channels and rejects sources that are not exactly stereo" | |
| AMW-R46 | verified | unit "folds every channel down to a single averaged mono channel" | |
| AMW-R47 | verified | unit "extracts an independent copy of a single channel and rejects an out-of-range index" | |
| AMW-R48 | verified | unit "duplicates one channel into an independent dual-mono pair" | |
| AMW-R49 | verified | unit "inserts exact zero-valued frames at the requested timeline position", "inserts silence and shifts every affected annotation atomically" | |
| AMW-R50 | verified | unit "quantizes onto the integer grid with deterministic TPDF dither" | |
| AMW-R51 | missing | — | |
| AMW-R52 | verified | unit "changes length by the ratio while keeping pitch and level", "predicts stretched length and scales annotations inside the clip" | |
| AMW-R53 | verified | unit "resolves one stretch ratio from percent, duration, or tempo" | |
| AMW-R54 | verified | unit "keeps a stereo image when stretching and preserves exact length when pitch shifting"; e2e "processes a clip with loudness, bit depth, stretch, pitch, room tone, and the sample pen" | The cents field has no test |
| AMW-R55 | verified | unit "keeps the spectral envelope in place when formant preservation is on" | |
| AMW-R56 | missing | — | Formant preservation exists (AMW-R55) |
| AMW-R57 | missing | — | |
| AMW-R58 | missing | — | |
| AMW-R59 | missing | — | BPM target for stretching exists (AMW-R53) |
| AMW-R60 | missing | — | |
| AMW-R61 | missing | — | Loop playback exists (AMW-R13) |
| AMW-R62 | verified | unit "patches samples in place on one channel only", "rebuilds a gap with a smooth cubic through the neighbouring samples"; e2e "processes a clip with loudness, bit depth, stretch, pitch, room tone, and the sample pen" | |
| AMW-R63 | verified | unit "fills a range with captured room tone at a matching level" | |
| AMW-R64 | verified | e2e "runs every restoration tool on a clip or a selection" | |
| AMW-R65 | verified | unit "reduces broadband noise from a fingerprint while keeping the tone" | |
| AMW-R66 | verified | unit "removes mains hum and harmonics while keeping programme" | |
| AMW-R67 | verified | unit "finds no clicks in clean music and repairs injected ones" | |
| AMW-R68 | verified | unit "ducks a low-frequency pop but not steady bass" | |
| AMW-R69 | verified | unit "attenuates crackle toward the local median" | |
| AMW-R70 | verified | unit "de-esses a loud sibilant band and leaves low content alone" | |
| AMW-R71 | verified | unit "gates quiet hiss per band while loud tones pass" | |
| AMW-R72 | verified | unit "reconstructs clipped peaks above the clip level" | |
| AMW-R73 | verified | unit "rebuilds a user-selected burst and refuses spans over 200 ms" | |
| AMW-R74 | verified | unit "attenuates only the painted time/frequency region"; e2e "shows a synced spectrogram and repairs a painted region" | |
| AMW-R75 | verified | unit "heals a noise burst toward its surroundings"; e2e "runs every restoration tool on a clip or a selection" | |
| AMW-R76 | verified | unit "splices a processed range back with short crossfades and maps ranges into the clip" | |
| AMW-R77 | verified | e2e "runs every restoration tool on a clip or a selection" | |
| AMW-R78 | implemented | `MasteringSpectrogram.tsx` (Heal painted regions) | No test |
| AMW-R79 | implemented | `MasteringSpectrogram.tsx` (Clear regions) | No test |
| AMW-R80 | missing | — | Painted spectral regions exist (AMW-R74) |
| AMW-R81 | missing | — | |
| AMW-R82 | verified | unit "boosts by the set gain in minimum- and linear-phase modes, and linear phase stays time-aligned"; e2e "masters the mix with the realtime chain, meters, monitoring, and an offline render" | |
| AMW-R83 | implemented | unit "have the documented gain at the design frequency" | The test checks peaking, low shelf, high-pass and notch; high shelf, low-pass and band-pass have no test |
| AMW-R84 | verified | unit "boosts by the set gain in minimum- and linear-phase modes, and linear phase stays time-aligned" | |
| AMW-R85 | verified | unit "cuts a dynamic band only when the band is loud" | |
| AMW-R86 | verified | unit "auditions only the soloed band" | |
| AMW-R87 | verified | unit "calibrates a full-scale bin-centred sine to 0 dB and finds a resonance in noise"; e2e "masters the mix with the realtime chain, meters, monitoring, and an offline render" | |
| AMW-R88 | verified | unit "routes bands to mid or side only" | |
| AMW-R89 | verified | unit "compresses above threshold with the configured ratio and makeup" | |
| AMW-R90 | verified | unit "compresses one band of the three-band compressor independently" | |
| AMW-R91 | verified | unit "expands quiet material downward" | |
| AMW-R92 | missing | — | |
| AMW-R93 | verified | unit "holds true peak at the limiter ceiling on hot, dense material" | |
| AMW-R94 | verified | unit "saturates with unity small-signal gain and adds harmonics when driven" | |
| AMW-R95 | verified | unit "soft-clips below the ceiling" | |
| AMW-R96 | verified | unit "controls width and folds bass to mono" | |
| AMW-R97 | verified | unit "controls width and folds bass to mono" | |
| AMW-R98 | verified | unit "is bit-transparent with default settings and aligned after rendering" | |
| AMW-R99 | implemented | `MasteringMasterTab.tsx` (Input gain, Output gain) | No test |
| AMW-R100 | verified | unit "saves, renames by name, lists, and deletes master presets"; e2e "autosaves, recovers after a reload, backs up and reopens, saves presets, and reports capabilities" | |
| AMW-R101 | missing | — | Tape/tube saturation exists (AMW-R94) |
| AMW-R102 | missing | — | |
| AMW-R103 | missing | — | |
| AMW-R104 | missing | — | |
| AMW-R105 | missing | — | |
| AMW-R106 | missing | — | |
| AMW-R107 | missing | — | |
| AMW-R108 | missing | — | |
| AMW-R109 | missing | — | |
| AMW-R110 | missing | — | Master presets exist (AMW-R100) |
| AMW-R111 | missing | — | |
| AMW-R112 | implemented | e2e "masters the mix with the realtime chain, meters, monitoring, and an offline render" | The test selects Side only without checking the output |
| AMW-R113 | implemented | e2e "masters the mix with the realtime chain, meters, monitoring, and an offline render" | The test turns on Mono check without checking the output |
| AMW-R114 | verified | unit "reads +1 for mono, -1 for inverted, and draws mono vertically"; e2e "masters the mix with the realtime chain, meters, monitoring, and an offline render" | |
| AMW-R115 | implemented | `MasteringMeters.tsx` (AnalyserNodes before and after the worklet) | No test |
| AMW-R116 | verified | unit "reads +1 for mono, -1 for inverted, and draws mono vertically" | |
| AMW-R117 | verified | unit "cases 1 and 2: steady tones read identically on M, S, and I", "cases 3, 4, and 5: relative and absolute gating", "case 9: short-term is constant after 3 s", "case 12: momentary is constant after 1 s", "follows the reference percentile rule" | |
| AMW-R118 | verified | unit "cases 15-19: sines at fs/4, fs/6, fs/8 with phase offsets", "cases 20-23: a single fs/4 period inside an fs/6 tone" | |
| AMW-R119 | implemented | `MasteringMeters.tsx` ("Log true peaks above (dBTP)") | No test |
| AMW-R120 | verified | unit "reports peak, RMS, and crest factor for a sine" | |
| AMW-R121 | implemented | `MasteringMeters.tsx` (`LOUDNESS_TARGETS`) | No test |
| AMW-R122 | implemented | `MasteringMeters.tsx` (Reset meters) | No test |
| AMW-R123 | implemented | e2e "masters the mix with the realtime chain, meters, monitoring, and an offline render" | The test switches listen modes; the 20 ms crossfade is not checked |
| AMW-R124 | verified | e2e "masters the mix with the realtime chain, meters, monitoring, and an offline render" | |
| AMW-R125 | implemented | e2e "masters the mix with the realtime chain, meters, monitoring, and an offline render" | The test selects Difference without checking the output |
| AMW-R126 | verified | e2e "masters the mix with the realtime chain, meters, monitoring, and an offline render" | |
| AMW-R127 | implemented | `MasteringMeters.tsx` (Remove reference) | No test |
| AMW-R128 | missing | — | |
| AMW-R129 | missing | — | |
| AMW-R130 | missing | — | |
| AMW-R131 | verified | unit "renders the master from the last mix with a loudness report and analyses its spectrum"; e2e "masters the mix with the realtime chain, meters, monitoring, and an offline render" | |
| AMW-R132 | verified | unit "writes exact 16-bit PCM samples, interleaved, with a PCM fmt chunk", "writes 24-bit little-endian three-byte samples", "writes 32-bit IEEE float with format tag 3, cbSize 0, and a fact chunk", "dithers deterministically for a given seed", "converts to the requested rate and measures what will be written"; e2e "exports bit-exact WAV, tagged compressed files, reports, and stems as a ZIP" | |
| AMW-R133 | verified | unit "fills bext v2 fields, loudness values as round(100x), and an EBU R 98 coding history", "writes RIFF INFO tags with even padding and keeps the typed date precision" | |
| AMW-R134 | verified | e2e "exports bit-exact WAV, tagged compressed files, reports, and stems as a ZIP" | |
| AMW-R135 | verified | e2e "exports bit-exact WAV, tagged compressed files, reports, and stems as a ZIP" | |
| AMW-R136 | verified | e2e "exports bit-exact WAV, tagged compressed files, reports, and stems as a ZIP" | |
| AMW-R137 | verified | e2e "exports bit-exact WAV, tagged compressed files, reports, and stems as a ZIP" | |
| AMW-R138 | verified | e2e "exports bit-exact WAV, tagged compressed files, reports, and stems as a ZIP" | The unsupported-configuration message has no test |
| AMW-R139 | verified | unit "keeps trimmed text, valid positive numbers, and artwork where the format stores them", "leaves out fields the format does not carry", "reports metadata it cannot store instead of writing mangled text"; e2e "exports bit-exact WAV, tagged compressed files, reports, and stems as a ZIP" | |
| AMW-R140 | verified | e2e "exports bit-exact WAV, tagged compressed files, reports, and stems as a ZIP" | |
| AMW-R141 | implemented | `MasteringExportTab.tsx` (Remove cover) | No test |
| AMW-R142 | verified | unit "exports the whole project or the selection", "names regions in timeline order, clamps them, and never repeats a file name", "makes one stem per track that holds audio"; e2e "exports bit-exact WAV, tagged compressed files, reports, and stems as a ZIP" | |
| AMW-R143 | verified | unit "writes CSV with quoted names, CRLF rows, and empty cells for silence", "writes JSON with nulls for silence and the measurement basis", "puts every entry under one folder, storing audio and deflating text"; e2e "exports bit-exact WAV, tagged compressed files, reports, and stems as a ZIP" | |
| AMW-R144 | verified | unit "saves and recovers a session with its source files, removing audio the project dropped", "keeps sessions from different tabs apart and prunes the oldest"; e2e "autosaves, recovers after a reload, backs up and reopens, saves presets, and reports capabilities" | |
| AMW-R145 | implemented | `MasteringWorkspace.tsx` (Discard it) | No test |
| AMW-R146 | implemented | `MasteringProjectTab.tsx` ("Saved sessions") | No test |
| AMW-R147 | verified | unit "round-trips the project and its original audio through one ZIP", "explains what is wrong with files that are not usable backups"; e2e "autosaves, recovers after a reload, backs up and reopens, saves presets, and reports capabilities" | |
| AMW-R148 | verified | e2e "stages backup audio transactionally before replacing the live project" | |
| AMW-R149 | verified | unit "rejects ids that become ambiguous after normalization", "clamps out-of-range values and drops unusable annotations", "refuses projects it cannot use, saying why" | |
| AMW-R150 | implemented | e2e "autosaves, recovers after a reload, backs up and reopens, saves presets, and reports capabilities" | The test checks the AudioWorklet row only; Copy report and the persistent-storage request have no test |
| AMW-R151 | verified | e2e "arranges multiple tracks with split, nudge, fades, crossfade, and zoom" | |
| AMW-R152 | verified | e2e "stops safely when the realtime master processor crashes" | |
| AMW-R153 | verified | e2e "locks destructive processing safely when the DSP worker crashes", "fails gracefully when the DSP worker cannot start" | |
| AMW-R154 | verified | e2e "runs every restoration tool on a clip or a selection", "imports, auditions, edits, marks, and undoes a local master" | |
| AMW-R155 | missing | — | Needs a Technique decision under the ML ruleset first |
| AMW-R156 | partial | `.tasks/items/T-repository-dark-contrast-20261004-b7d2.md` | The workspace follows the site theme through shared colour variables; the 2026-10-04 `E2E_THEME=dark` axe run found color-contrast violations in this workspace |
| AMW-R157 | implemented | `mastering.css` | No test measures overflow at 320–2560 px; the mastering spec runs on desktop and mobile Chromium |
| AMW-R158 | verified | e2e "every workbench tab passes an axe scan with its disclosures open"; e2e (`tests/e2e/accessibility.spec.ts`) "has no serious or critical axe violations at <route>" | |
| AMW-R159 | verified | e2e "every workbench tab passes an axe scan with its disclosures open" | |
| AMW-R160 | verified | e2e "shows a synced spectrogram and repairs a painted region" | |

## Open work

1. Tests for implemented rows: AMW-R02, AMW-R04, AMW-R11, AMW-R12, AMW-R14, AMW-R25, AMW-R78, AMW-R79, AMW-R83, AMW-R99, AMW-R112, AMW-R113, AMW-R115, AMW-R119, AMW-R121, AMW-R122, AMW-R123, AMW-R125, AMW-R127, AMW-R141, AMW-R145, AMW-R146, AMW-R150, AMW-R157.
2. Dark-theme contrast: AMW-R156 (`.tasks/items/T-repository-dark-contrast-20261004-b7d2.md`).
3. Editor ergonomics (audit Phase A): AMW-R31, AMW-R32, AMW-R33, AMW-R18, AMW-R81, AMW-R38.
4. Editing additions: AMW-R34, AMW-R35, AMW-R36, AMW-R37, AMW-R51, AMW-R15.
5. Capture, timing and looping (audit Phase B): AMW-R129, AMW-R130, AMW-R58, AMW-R59, AMW-R60, AMW-R61.
6. Effects: AMW-R92, AMW-R101, AMW-R102, AMW-R103, AMW-R104, AMW-R105, AMW-R106, AMW-R107, AMW-R108, AMW-R109.
7. Pitch and spectral: AMW-R56, AMW-R57, AMW-R80.
8. Power workflows (audit Phase C): AMW-R110, AMW-R111, AMW-R128.
9. Stem separation: AMW-R155 (Technique decision first).

## Known limitations

- At most eight tracks per project (AMW-R06); see "Intent not recorded" in the spec.
- Loudness and peak reports describe rendered PCM before lossy encoding (parity audit, finding 13).
- WebAssembly encoders run single-threaded (GitHub Pages sends no COOP/COEP headers).

## Verification evidence

- 2026-10-05, branch `expand/audio-mastering` from `6c991e75`: statuses taken from the test titles in `tests/unit/mastering-*.test.ts`, `tests/e2e/mastering.spec.ts` and `tests/e2e/accessibility.spec.ts`; `pnpm tool:check audio-mastering --base origin/main`: incomplete, 100/160, no errors; `pnpm docs:check` clean; `vitest run` cad-progress, sheets-wave-b, deployment-config 23/23.

## Change log

- **2026-10-05:** Created with the spec; 160 requirements.

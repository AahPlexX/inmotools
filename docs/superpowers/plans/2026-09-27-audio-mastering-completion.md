# Audio Mastering Workstation — Completion Plan and Function Status

**Created:** 2026-09-27
**Supersedes for execution:** the open Task 2–7 checklists in `2026-09-18-audio-mastering-phase-3.md` (that file stays as history).
**Spec:** `docs/superpowers/specs/2026-09-16-audio-mastering-workstation-design.md` (81-function ledger, unchanged).
**Active branch:** `claude/music-editing-tool-b9w0pq`. It contains all of `feature/audio-mastering-workstation` (merged at `95d9028`) on top of current `main`, so it can integrate into `main` without a second merge. Do not continue on `feature/audio-mastering-workstation`; its draft PR #45 is superseded by this branch's PR.

This file is the single status table for the 81 functions. Update the row and the count in the same commit as the evidence.

## Architecture decision (2026-09-27)

The Phase 3 note chose "one ordered project-operation stream" but left gap, overlap, mix, and effect ordering undefined, which blocked every multi-track function. It is replaced by a clip-owned edit model that answers those questions directly:

1. **Sources** are immutable decoded PCM held outside the document (worker registry), resampled once on import to the project sample rate (the first imported source's rate). The document stores only references (`id`, name, original rate, channels, size, last-modified) so projects stay small and relinkable.
2. **Clips** live on tracks. Each clip owns an ordered `AudioEdit[]` applied to its source. The clip's *material* is `applyEdits(source, clip.edits)`. Split, trim, crop, delete, reverse, silence, repair, restoration, stretch, pitch, and sample-pen edits are all entries in that list. No PCM is copied into the document; history stores edit lists.
3. **Timeline placement** is `clip.startSeconds` on a sample-frame grid. Gaps render as silence. Overlapping clips on one track are summed after each clip's gain and fades; a crossfade is an overlap whose left fade-out and right fade-in share one duration and curve (complementary curves; equal-power keeps constant power).
4. **Length-changing edits ripple** later clips on the same track and remap markers, regions, selection, and playhead in timeline time. Edits that do not change length leave the timeline alone.
5. **Mix order:** clip material → clip gain → clip fades → clip pan/balance → track gain → track pan/balance → mute/solo → sum. A project whose sources are all mono mixes to mono; otherwise stereo. Pan uses a balance law with unity at centre (full pan silences the opposite side), so a centred single source renders bit-identical to its material.
6. **Master chain** runs after the mix in one deterministic TypeScript kernel shared by the realtime `AudioWorklet` and the offline render, so audition, export, A/B, and delta use the same math.
7. **Heavy work** (material replay, mixing, peak pyramids, spectrograms, loudness scans, offline render) runs in one dedicated DSP Web Worker per the 2026-09-19 worker decision. Requests carry a revision id; only the newest pending request is processed, and stale results are dropped.
8. The single-source provenance helpers (`deriveSourceTimelineThroughEdits`, `mapSourceRangeThroughEdits`) are retired with this decision; nothing consumes them once clips own their edits.

Research for this plan (fetched 2026-09-27): ITU-R BS.1770-5 PDF (K-weighting Tables 1–2, gating, Annex 2 true-peak 48-tap interpolator); EBU Tech 3341 v4.0 (loudness conformance cases 1–23); EBU Tech 3342 (LRA definition and cases 1–6); EBU Tech 3285 v2 (BWF `bext` with loudness fields); W3C Audio EQ Cookbook Note (biquad formulas); Vite features guide (worker URL imports); MediaBunny 1.58.0 type declarations and first-party encoder-extension READMEs; npm registry for MediaBunny 1.58.0/1.59.0/1.60.0 and `@mediabunny/{mp3,flac,aac}-encoder`.

## Slices

| Slice | Functions | Notes |
|---|---|---|
| S1 Arrangement model | 4, 10, 11, 13, 14, 15, 16 | Document v2, clip edits, mix render, multi-file import, track/clip controls |
| S2 Waveform navigation | 5 | Peak pyramid, zoom/pan, track lanes |
| S3 DSP + metering kernels | 26, 65, 66, 67 (kernels) | Biquad, FFT/STFT, resampler, BS.1770-5, true peak, EBU conformance tests |
| S4 Edit processors | 19, 24, 26, 27, 28, 29, 30, 32 | Clip edits |
| S5 Restoration | 33–44 | Clip edits |
| S6 Master chain | 45–59, 72 | Worklet realtime + offline parity |
| S7 Monitoring | 60–64, 68–71 | |
| S8 Spectrogram | 6 (+ UI for 43, 44) | |
| S9 Export | 73–80 | Own WAV/BWF writer; MediaBunny for MP3/FLAC/Ogg/M4A |
| S10 Durable workflow | 18, 81 | IndexedDB autosave, backup, presets, diagnostics, commands |
| S11 Acceptance | all | Responsive, keyboard, axe, copy, browser workflow, integration |

## Function status

Status values: **done** (implemented, reachable in the UI, tested), **partial** (what is missing is stated), **open**.

| # | Function | Status | Evidence / gap |
|---|---|---|---|
| 1 | Multi-format import | done | MediaBunny decode boundary (Phase 1) |
| 2 | Source technical inspector | done | Phase 1 |
| 3 | Source metadata reader | done | Phase 1 |
| 4 | Bounded multi-track timeline (8) | done | S1: `addSourceTracksRevision` bound + lanes; unit + browser |
| 5 | Peak pyramid + zoom/pan | done | S2: `dsp/peaks.ts`, canvas timeline, buttons/slider/Ctrl-wheel/pinch; stale renders superseded in worker |
| 6 | Spectrogram | open | S8 |
| 7 | Transport + keyboard | done | Phase 2 |
| 8 | Numeric range selection | done | Phase 2 |
| 9 | Named markers/regions | done | Phase 2 |
| 10 | Multi-file drop, reorder, rename | done | S1: multi-file input/drop, rate conversion on import, rename/move up/down |
| 11 | Split, trim, delete, crop | done | S1: clip-local crop/trim/delete + split at playhead (`S`) |
| 12 | Zero-crossing snap | done | Phase 2 |
| 13 | Clip move/duplicate/nudge | done | S1: numeric start, move to track, duplicate, nudge with 1-sample to 1 s steps |
| 14 | Micro fades (5 curves) | done | S1: `fadeGain` curves, per-clip fade fields |
| 15 | Overlap crossfades | done | S1: `crossfadeClipsRevision` keeps both fades synchronized |
| 16 | Track/clip gain, pan, mute, solo | done | S1: track and clip gain/pan/mute/solo in mixer and UI |
| 17 | Undo/redo across operations | done | Must stay atomic as new operations land |
| 18 | Autosave/recovery | open | S10 |
| 19 | Sample-pen redraw | open | S4 |
| 20 | DC measure/remove | done | Phase 2 |
| 21 | Polarity | done | Phase 2 |
| 22 | Channel utilities | done | Phase 2 |
| 23 | Peak normalize | done | Phase 2 (target field added in S4) |
| 24 | RMS/loudness normalize | open | S4 |
| 25 | Reverse | done | Phase 2 |
| 26 | Sample-rate conversion | open | S3/S4 |
| 27 | Bit depth + TPDF dither | open | S4 |
| 28 | Pitch shift + formant | open | S4 |
| 29 | Time stretch 25–400% | open | S4 |
| 30 | Duration/BPM target | open | S4 |
| 31 | Exact silence insertion | done | Phase 2 |
| 32 | Room-tone fill | open | S4 |
| 33–44 | Restoration and spectral repair | open | S5 |
| 45–59 | EQ, dynamics, colour, stereo | open | S6 |
| 60–64 | Monitoring and meters | open | S7 |
| 65–67 | Loudness, true peak, peak/RMS/crest | open | S3 kernels, S7 UI |
| 68–71 | A/B, matched A/B, delta, reference | open | S7 |
| 72 | Offline master render | open | S6 |
| 73–80 | Export formats, metadata, artwork, batch | open | S9 |
| 81 | Backup, presets, diagnostics, commands | open | S10 |

**Count: 22/81 done** (2026-09-27, after S1/S2: units 53/53 mastering, browser mastering + music 14/14 desktop/mobile).

## Rules for whoever continues

- Keep the Harmony & MIDI tab working; `tests/e2e/music.spec.ts` must stay green.
- Unit tests go at pure seams (edit math, mix, DSP kernels, schema). Browser coverage extends `tests/e2e/mastering.spec.ts`; add a new spec only for a distinct failure mode.
- Exact dependency pins only. MediaBunny core and any `@mediabunny/*` extension must share one version.
- Every control needs a keyboard or numeric path; no hover-only information; 44 px targets on touch layouts.

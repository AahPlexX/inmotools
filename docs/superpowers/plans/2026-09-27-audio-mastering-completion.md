# Audio Mastering Workstation — Completion Plan and Function Status

> **Post-merge status update — 2026-09-27:** the 81/81 implementation described below was safely integrated into `origin/main` through PR #81 at merge commit `4685013b261f83408145bed98851d09b0bca752e`. References below to the old active branch, “remaining” PR-head validation, or pending PR #81 integration are retained as historical execution evidence, not current instructions. The active post-merge production audit and competitive-parity handoff is `docs/superpowers/plans/2026-09-27-audio-mastering-production-parity-audit.md` on reconciled PR #85 (superseding documentation-conflicted PR #82). Do not merge the historical feature branches wholesale.


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

UI layout: the workspace has a fixed header, import strip, sticky transport, and timeline, then a tab workbench (`MasteringTabs`): Edit, Arrange, Time & pitch, Repair. Master and Meters tabs landed with S6/S7, Export with S9, Project with S10. The realtime path is source → AnalyserNode (pre) → `mastering-master.worklet.ts` (chain + monitoring + meters) → AnalyserNode (post) → output, in an AudioContext at the project rate. Tabs share one `MasteringPanelContext` (`mastering-ui.tsx`); panels stay mounted when hidden so work in progress survives tab switches.

## Function status

Status values: **done** (implemented, reachable in the UI, tested), **partial** (what is missing is stated), **open**.

| # | Function | Status | Evidence / gap |
|---|---|---|---|
| 1 | Multi-format import | done | MediaBunny decode boundary (Phase 1) |
| 2 | Source technical inspector | done | Phase 1 |
| 3 | Source metadata reader | done | Phase 1 |
| 4 | Bounded multi-track timeline (8) | done | S1: `addSourceTracksRevision` bound + lanes; unit + browser |
| 5 | Peak pyramid + zoom/pan | done | S2: `dsp/peaks.ts`, canvas timeline, buttons/slider/Ctrl-wheel/pinch; stale renders superseded in worker |
| 6 | Spectrogram | done | S8: `dsp/spectrogram.ts` (log rows, 8-bit), synced viewport/playhead/selection, select or paint drag |
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
| 18 | Autosave/recovery | done | S10: per-tab sessions (document + original audio) in IndexedDB via `mastering-persistence.ts`, saved a second after each change and flushed on pagehide/hidden in one explicitly committed transaction; the newest other session is offered on the next visit and restored by re-decoding; newest five kept |
| 19 | Sample-pen redraw | done | S4: `MasteringSamplePen` draw + numeric set + cubic interpolate; `samplePatch` edit |
| 20 | DC measure/remove | done | Phase 2 |
| 21 | Polarity | done | Phase 2 |
| 22 | Channel utilities | done | Phase 2 |
| 23 | Peak normalize | done | Phase 2 (target field added in S4) |
| 24 | RMS/loudness normalize | done | S4: `normalizeLevel` edit (BS.1770-5 integrated or RMS) |
| 25 | Reverse | done | Phase 2 |
| 26 | Sample-rate conversion | done | Resampler on import (S1); export converts to any common rate after the master chain and measures the converted samples (S9, `renderExport` `targetRate`) |
| 27 | Bit depth + TPDF dither | done | S4: `quantize` edit with seeded TPDF; export depth reuses it in S9 |
| 28 | Pitch shift + formant | done | S4: phase vocoder + resample, cepstral formant preservation |
| 29 | Time stretch 25–400% | done | S4: identity-phase-locked vocoder, mid/side for stereo; ripple + annotation scaling |
| 30 | Duration/BPM target | done | S4: duration and tempo modes resolve to the same stretch ratio |
| 31 | Exact silence insertion | done | Phase 2 |
| 32 | Room-tone fill | done | S4: capture + sine-window grain fill, 10 ms equal-power edges |
| 33 | Noise fingerprint capture | done | S5: capture from a noise-only selection; profile computed at replay (`noiseProfile`) |
| 34 | STFT spectral denoise | done | S5: decision-directed Wiener gain, reduction floor, smoothing |
| 35 | 50/60 Hz de-hum | done | S5: notch cascade, 1–20 harmonics |
| 36 | De-click | done | S5: second-difference detection vs local median, bidirectional Burg AR repair |
| 37 | Plosive attenuation | done | S5: LR4 low band ducked on fast-vs-slow envelope rise |
| 38 | Micro-crackle | done | S5: low-threshold impulse detection, median blend |
| 39 | De-esser | done | S5: band-pass side chain, linked stereo, LR4 high band reduction |
| 40 | Multi-band hiss gate | done | S5: phase-compensated 3-band LR4 split, per-band threshold/release |
| 41 | De-clip | done | S5: AR reconstruction constrained to exceed the clip level |
| 42 | Burst repair | done | S5: AR interpolation of a selected span up to 200 ms |
| 43 | Spectral brush attenuate | done | S5 engine + S8 painting on the spectrogram (multiple regions, one undo step) |
| 44 | Spectral heal | done | S5: magnitude interpolation from neighbouring frames, phases kept; band-in-selection control |
| 45 | Ten-band parametric EQ | done | S6: `dsp/master-chain.ts` + EQ graph and band table |
| 46 | Seven filter shapes | done | S6: bell, shelves, HP, LP, notch, band-pass (0 dB-normalized) |
| 47 | Minimum/linear phase | done | S6: 4095-tap FIR per mid/side path in linear mode; dynamic bands stay minimum phase |
| 48 | Dynamic EQ per band | done | S6: band-pass side chain, threshold/ratio/attack/release/range |
| 49 | Band solo | done | S6: band-pass audition per routing |
| 50 | Resonance finder / spectrum grab | done | S6: `dsp/analysis.ts`, one-click cuts, click-to-add on the EQ graph |
| 51 | Stereo/Mid/Side band routing | done | S6: EQ runs in mid/side |
| 52 | Broadband compressor | done | S6 |
| 53 | Three-band compressor | done | S6: LR4 phase-compensated split |
| 54 | Expander/gate | done | S6 |
| 55 | True-peak lookahead limiter | done | S6: BS.1770-5 interpolator detection; output true peak ≤ ceiling + 0.2 dB in tests |
| 56 | Tape/tube saturation | done | S6: 2× oversampled, biased tanh for even harmonics, DC blocker |
| 57 | Oversampled soft clipper | done | S6: 1/2/4× polyphase |
| 58 | M/S width | done | S6 |
| 59 | Bass mono | done | S6: LR4 on side, matching all-pass on mid |
| 60 | M/S solo monitoring matrix | done | S7: worklet monitor matrix |
| 61 | Mono sum switch | done | S7 |
| 62 | Correlation meter | done | S7 |
| 63 | Pre/post FFT overlay | done | S7: two AnalyserNodes around the worklet |
| 64 | Goniometer | done | S7 |
| 65 | BS.1770-5 / R 128 loudness telemetry | done | S3 kernel + S7 live meters and offline render report |
| 66 | True-peak meter + excursion log | done | S7: timestamped, jumpable log |
| 67 | Peak/RMS/crest meters | done | S7 |
| 68 | Pop-safe A/B | done | S7: 20 ms equal-power crossfade, latency-aligned original |
| 69 | Loudness-matched A/B | done | S7: short-term matching of original and reference |
| 70 | Delta audition | done | S7 |
| 71 | Reference track | done | S7: synced start offset, loudness-matched |
| 72 | Offline master render | done | S6: worker `renderMaster`, latency-compensated, with loudness report |
| 73–80 | Export formats, metadata, artwork, batch | done | S9: Export tab (`MasteringExportTab.tsx`) over `mastering-export.ts` and worker `renderExport`. WAV 16/24-bit PCM with optional TPDF dither or 32-bit float, bext v2 loudness + RIFF INFO; FLAC, MP3, AAC in M4A, Ogg (Opus or Vorbis, labelled) via MediaBunny with WASM fallbacks, capability-probed on first view; per-format tag fields with "Not stored" notes; front cover in FLAC/MP3/M4A/Ogg; project, selection, regions, or stems, batches as one ZIP with loudness CSV/JSON and spectrum PNGs. Browser spec proves a bit-exact 16-bit WAV round trip, container signatures, tags, cover art, and the stems ZIP layout |
| 81 | Backup, presets, diagnostics, commands | done | S10: versioned backup ZIP (`project.json` + `sources/`) through one validator (`parseMasteringDocument`), openable from the empty workspace or the Project tab; master presets in the Master tab; capability report with copy and persistent-storage request; `?` opens the keyboard shortcut list |

**Count: 81/81 done** (2026-09-27, after S10: 147 mastering unit tests in 15 files; mastering browser spec 16/16, music spec 10/10, and the MIDI Harmony Lab cases in `audit-hardening.spec.ts` green across desktop/mobile Chromium). S11 acceptance evidence (2026-09-27): full `pnpm test:unit` 2103/2103 in 210 files; `pnpm build` clean; axe scan of the empty workspace and all eight tabs (disclosures open) clean on desktop and mobile; export, persistence, and backup round trips green; phone-width screenshots of every tab reviewed with no horizontal overflow. Remaining: green CI on the PR head, then integration into `origin/main` through PR #81.

## Rules for whoever continues

- The workstation has its own route and catalog entry, `#/tools/audio-mastering` (entry `src/tools/music/MusicWorkspace.tsx`). MIDI Harmony Lab stays at `#/tools/midi-harmony-lab` (`HarmonyWorkspace.tsx`), unchanged from `main`. Do not merge them back behind one route: the audited Harmony Lab specs (`tests/e2e/music.spec.ts`, the MIDI cases in `tests/e2e/audit-hardening.spec.ts`) expect the chord editor on first load, and each suite needs its own title and address.
- Unit tests go at pure seams (edit math, mix, DSP kernels, schema). Browser coverage extends `tests/e2e/mastering.spec.ts`; add a new spec only for a distinct failure mode.
- Exact dependency pins only. MediaBunny core and any `@mediabunny/*` extension must share one version.
- Every control needs a keyboard or numeric path; no hover-only information; 44 px targets on touch layouts.

## Post-merge production audit (2026-09-28)

After PR #81 merged to `main`, a file-by-file audit covered every component in
`src/tools/music/` against: bugs, missing features, typing, responsiveness,
accessibility, tooltip coverage, copy quality, and competitive parity. Fixes
were applied directly (typecheck, `tests/unit/mastering*` 147/147, and
`pnpm build` all clean before commit):

- **Saved Sessions browser** (new, in the Project tab): previously the
  autosave recovery system only ever offered the single newest other session,
  once, via a one-time banner. It now lists every autosaved session (any tab,
  any earlier visit) with Open/Delete actions and a manual refresh, reusing
  the existing `MasteringStore` API with no persistence-layer changes. This
  closes a real parity gap against DAW-style "recent projects" pickers.
- **Accessibility fix**: track-level Mute/Solo buttons in the Arrange tab had
  no distinguishing `aria-label` (every other row action — Move up/down,
  Remove — already did). Automated axe scans do not catch this class of
  issue because the buttons are still individually reachable; it only shows
  up when a screen-reader user hears repeated "Mute button" announcements
  with no way to tell rows apart.
- **Copy/behavior fixes**: the Repair tab's noise-fingerprint and room-tone
  capture instructions stated minimum durations ("half a second", "0.5
  seconds") that didn't match the actual enforced minimums in code
  (~53 ms and 20 ms respectively, from `SPECTRAL_FRAME` and `fillRoomTone`).
  Rewrote to state the true minimum while still recommending a longer
  capture for quality.
- **Tooltip pass**: added `title` attributes (shortcut/behavior hints) to
  transport controls, the Listen radiogroup, timeline zoom buttons, the
  spectrogram mode toggle and region actions, and the sample pen's numeric
  actions. These are supplements only — the tool's keyboard/numeric-path
  rule for essential information was already satisfied everywhere audited.
- **Minor fix**: "Insert silence at playhead" in the Edit tab now also
  requires a clip under the playhead, matching its sibling clip-dependent
  actions instead of only checking the duration field.
- Reviewed with no changes needed (already solid): `MasteringMeters.tsx`,
  `MasteringMasterTab.tsx`, `MasteringTimePitchTab.tsx`, `MasteringEqGraph.tsx`,
  `MasteringTabs.tsx`, `mastering-ui.tsx`, `MasteringExportTab.tsx`,
  `MasteringControls.tsx`, `mastering-persistence.ts`.
- Deferred, not attempted this pass (judged too invasive for an incremental
  audit): a labeled Undo History panel (would touch the project-history type
  used across ~15 files), and a Trim/Silence-strip DSP tool (needs new
  engine primitives, worker protocol, UI, and coverage). Both are reasonable
  future ledger entries if picked up as their own scoped pieces of work.

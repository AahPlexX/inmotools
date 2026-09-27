# Audio Mastering Workstation Design

**Date:** 2026-09-16  
**Branch:** `feature/audio-mastering-workstation`  
**Research:** `docs/research/audio-mastering-web-platform-2026-09-16.md`

## Product intent

Evolve the existing Music tool into a local-first real-time audio mastering, restoration, and sound-editing workstation. It must be approachable to a first-time editor while providing deterministic precision controls for sound designers, mastering engineers, and podcast producers. No source audio is uploaded; processing, analysis, project state, and exports remain on-device.

The existing MIDI Harmony Lab remains available as a secondary workspace so current functionality and deep workflows are not discarded while the mastering workstation becomes the primary surface.

## Deterministic definition of done

The workstream is complete only when all 81 ledger functions below are implemented or explicitly rejected with evidence, every exposed control is functional, focused unit/browser tests and the production build pass, responsive/keyboard/accessibility acceptance passes, export and project round-trips are verified, task tracking is current, the finished branch is integrated non-destructively into `origin/main`, and the applicable GitHub Pages deployment is green.

## Architecture

- `MusicWorkspace.tsx` becomes the lightweight workspace switcher and makes Mastering the primary view.
- Existing progression logic remains isolated in `music-engine.ts`; its current UI moves without behavioral changes into `HarmonyWorkspace.tsx`.
- Mastering code is split by stable responsibility: document/state model, media I/O, DSP graph, analysis/workers, visual surfaces, and export.
- Real-time processing uses native Web Audio nodes where they are sufficient. Custom sample DSP uses `AudioWorklet` only when required.
- Full-quality apply/export paths use deterministic buffer transforms and/or `OfflineAudioContext`; expensive STFT, peak-cache, and analysis work runs outside React rendering.
- MediaBunny is the container/codec integration boundary. We test our configuration and round trips rather than duplicating MediaBunny's own codec test suite.

## Experience model

The primary screen uses six zones: command/transport bar, track/timeline canvas, waveform/spectral editor, processing rack, telemetry panel, and status/export drawer. On narrow screens these become sequential regions with a sticky compact transport; no fixed side panel may squeeze the waveform into an unusable strip.

Precision controls pair sliders or spatial handles with labeled numeric inputs. Every drag-only action has a keyboard/button or numeric alternative unless the gesture is intrinsically spatial. Touch targets follow WCAG 2.2 AA sizing/spacing guidance, visible focus is preserved, status changes are announced, reduced motion is respected, and waveform canvases expose meaningful text status rather than becoming the only source of state.

## Performance and safety boundaries

- Maximum active project target: eight mono/stereo tracks; larger imports are rejected with an explicit explanation rather than risking tab termination.
- Source `File` objects and decoded buffers are immutable. Edits are represented as clip/range operations until an explicit destructive apply/render action.
- Peak pyramids and spectrogram tiles are cached by source revision and zoom level; stale worker results carry revision IDs and are discarded.
- Playback owns exactly one live audio graph and releases nodes, object URLs, worklets, timers, and contexts on stop/reload/unmount.
- Export renders sequentially by default to bound memory. Unsupported codec/container combinations are disabled after capability probing.
- History stores operation/state revisions, not duplicate full source buffers. Sample-pen edits store only changed ranges.

## Functional completion ledger — 81 functions

### Ingest, timeline, and navigation
1. Multi-format local audio import for WAV, MP3, FLAC, Ogg/Vorbis, AAC/M4A, AIFF, and other formats verified decodable by the active browser/toolkit.
2. Source technical inspector for codec/container, duration, channels, sample rate, and source size.
3. Source metadata reader for descriptive tags and embedded artwork where available.
4. Bounded multi-track timeline supporting up to eight mono/stereo tracks.
5. Multi-resolution waveform peak-pyramid rendering with zoom and horizontal pan.
6. High-resolution spectrogram view with synchronized playhead and selection.
7. Transport with play, pause, stop, seek, loop, and keyboard shortcuts.
8. Time/range selection with editable start/end/duration fields.
9. Named markers and named regions with jump navigation.
10. Multi-file drag/drop import plus track reorder and track rename.

### Core editing and precision transforms
11. Sample-accurate split, trim, range delete, and crop-to-selection.
12. Zero-crossing snap for edit and region boundaries.
13. Clip move, duplicate, and keyboard/numeric nudge.
14. Micro fades with linear, equal-power, exponential, logarithmic, and S-curve choices.
15. Overlap crossfades with synchronized editable duration/curve.
16. Per-track and per-clip gain, pan, mute, and solo.
17. Undo/redo across timeline, processing, markers, and metadata operations.
18. Crash-safe local autosave/recovery for serializable project state.
19. Sample-pen redraw for isolated damaged sample ranges at maximum zoom.
20. DC-offset measurement and removal.
21. Polarity inversion.
22. Channel swap, stereo-to-mono fold-down, channel extract, and dual-mono utilities.
23. Peak normalization to an explicit dBFS target.
24. RMS or measured-loudness normalization to an explicit target.
25. Reverse selected audio or whole clips.
26. Sample-rate conversion with explicit target rate.
27. Bit-depth conversion with optional TPDF dither when reducing integer depth.
28. Cent/semitone pitch shift with optional formant preservation where supported by the shipped processor.
29. Time stretch from 25%–400% while preserving pitch.
30. Duration/BPM target mode backed by the same verified time-stretch engine.
31. Silence insertion with exact duration.
32. Room-tone fill from a captured source region.

### Restoration and spectral repair
33. Capture a noise fingerprint from an explicit noise-only selection.
34. STFT spectral-profile denoising with reduction depth and smoothing controls.
35. 50/60 Hz de-hum with selectable harmonic count.
36. Transient de-click detection and interpolation.
37. Mouth-pop/plosive attenuation with low-frequency transient targeting.
38. Micro-crackle attenuation for dense short discontinuities.
39. Dynamic de-esser with selectable detection band and reduction range.
40. Multi-band hiss gate/downward expander with independent thresholds and release.
41. De-clip repair that reconstructs bounded flat-topped peak regions from neighboring intact samples.
42. Transient repair/interpolation tool for user-selected corrupt sample bursts.
43. Spectral brush attenuate tool for user-painted time/frequency regions.
44. Spectral heal tool that reconstructs a selected spectral region from neighboring bins/frames.

### Equalization, dynamics, and mastering color
45. Ten-band precision parametric equalizer.
46. Bell, high-pass, low-pass, high-shelf, low-shelf, notch, and band-pass filter shapes.
47. Switchable minimum-phase and linear-phase processing modes where the filter design supports both.
48. Per-band dynamic EQ threshold, ratio, attack, release, and range.
49. EQ band solo/audition.
50. Resonance finder and spectrum-grab workflow for creating an EQ band from a measured peak.
51. Per-band stereo, Mid, or Side EQ routing.
52. Broadband compressor with threshold, ratio, knee, attack, release, and makeup gain.
53. Three-band compressor with Linkwitz-Riley crossover controls and independent band dynamics.
54. Broadband expander/gate.
55. True-peak lookahead brickwall limiter with oversampled inter-sample peak detection.
56. Tape/tube harmonic saturation with drive, mix, and output trim.
57. Oversampled soft clipper with explicit ceiling and oversampling mode.
58. Stereo-width control in Mid/Side space.
59. Frequency-dependent bass-mono fold-down with editable cutoff.

### Monitoring, metering, and comparison
60. Stereo/Mid/Side solo monitoring matrix.
61. Mono compatibility sum switch.
62. Continuous stereo phase-correlation meter.
63. Real-time pre/post FFT spectrum overlay.
64. Goniometer/Lissajous stereo vectorscope.
65. ITU-R BS.1770-5 / EBU R 128 loudness telemetry: momentary, short-term, integrated, and loudness range.
66. True-peak meter with timestamped clipping/excursion event log.
67. Peak, RMS, and crest-factor meters.
68. Instant original-versus-processed A/B with pop-safe switching.
69. Loudness-matched A/B compensation.
70. Delta/null audition exposing only the processing difference.
71. Reference-track slot with synchronized seek and level-matched comparison.

### Render, export, metadata, and durable workflow
72. Deterministic full-quality offline master render from the active processing graph.
73. WAV export: 16-bit PCM, 24-bit PCM, or 32-bit float, with explicit sample rate and TPDF dither where applicable.
74. MP3 export with capability-probed bitrate/quality choices.
75. FLAC lossless export with capability-probed encoding.
76. Ogg audio export with a verified available codec and explicit codec labeling.
77. AAC/M4A export using a verified AAC encoder/container combination.
78. Export metadata studio covering format-appropriate ID3, Vorbis/FLAC comments, BWF/RIFF, and MP4-style descriptive fields without pretending unsupported tags were written.
79. Embedded front-cover artwork where the selected output format supports it.
80. Named region/stem batch export to a structured ZIP plus loudness CSV/JSON and spectrum-snapshot PNG telemetry exports.
81. Versioned project backup/restore, reusable mastering-chain presets, capability diagnostics, and a discoverable keyboard-command surface.

## Verification strategy

Use TDD at owned public seams: state/reducer behavior, DSP math, import/export integration, history, edit boundary math, worker messages, and browser workflows. Do not duplicate dependency internals with codec fixture matrices already owned by MediaBunny. A representative fixture per owned container integration is sufficient unless a defect proves broader coverage is needed.

Browser acceptance must cover desktop and mobile Chromium for the primary import/edit/audition/export flow, keyboard access, narrow reflow, stale async-result guards, audio lifecycle cleanup, and export round trips. Accessibility checks use axe where appropriate plus explicit keyboard/focus/drag-alternative assertions that automated scanning cannot prove.

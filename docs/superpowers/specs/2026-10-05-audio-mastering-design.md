---
tool: audio-mastering
folder: src/tools/music
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-audio-mastering-design.md
tracker: src/tools/music/MASTERING_TRACKER.md
updated: 2026-10-05
---

# Audio Mastering — spec

As built at `947272db` (last code change to the mastering files under `src/tools/music/`). Requirement prefix: `AMW`. Status of each requirement: [MASTERING_TRACKER.md](../../../src/tools/music/MASTERING_TRACKER.md).

"(formerly N)" gives the function number in the 81-function ledger of [2026-09-27-audio-mastering-completion.md](../plans/2026-09-27-audio-mastering-completion.md); "(audit N)" the finding or phase item in the [production-parity audit](../plans/2026-09-27-audio-mastering-production-parity-audit.md).

History (kept as written): [2026-09-16-audio-mastering-workstation-design.md](2026-09-16-audio-mastering-workstation-design.md), plans [phase 1](../plans/2026-09-16-audio-mastering-phase-1.md), [phase 2](../plans/2026-09-17-audio-mastering-phase-2.md), [phase 3](../plans/2026-09-18-audio-mastering-phase-3.md), [completion](../plans/2026-09-27-audio-mastering-completion.md), [production-parity audit](../plans/2026-09-27-audio-mastering-production-parity-audit.md).

## Purpose

Cut, arrange, repair and master recordings on a multitrack timeline in the browser, then check them against BS.1770 loudness, true peak and a reference track while listening, and export them in common formats with tags and reports; for musicians, podcasters, sound designers and mastering engineers. No audio leaves the device.

## Scope

In scope: local import of audio files; a bounded multitrack timeline with clip edits; time and pitch processing; restoration and spectral repair; a realtime and offline master chain; monitoring and metering; export to WAV, FLAC, MP3, AAC (M4A) and Ogg with tags, artwork and reports; autosave, saved sessions and project backups.

Out of scope: MIDI Harmony Lab, which shares the folder and has its own spec and `HARMONY_TRACKER.md`.

## Constraints

- Platform rules: no accounts or authentication; no server, backend or server-side database (static files on GitHub Pages); everything runs in the browser and data the tool keeps stays in this browser (IndexedDB); network use only for the site's own files and public keyless sources on the person's own action ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- No large language models; other ML only on the device under the ML ruleset ([standard](../../DOCUMENTATION_STANDARD.md#machine-learning-and-ai)).
- GitHub Pages cannot send COOP/COEP headers, so WebAssembly runs single-threaded only.
- Decoding and compressed encoding use MediaBunny (exact pins, core and `@mediabunny/*` encoders on one version, [DECISIONS.md](../../DECISIONS.md#version-pins-and-package-sources)); WAV/BWF is written by the tool's own writer.
- Heavy work runs in one DSP Web Worker; realtime and offline mastering share one master-chain kernel (`dsp/master-chain.ts`).
- Storage: IndexedDB database `inmotools.audio-mastering`; backup format `inmotools-audio-mastering` version 1. These names and formats do not change.
- A project holds at most eight mono or stereo tracks.

## Requirements

### Import and sources

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| AMW-R01 | Imports a WAV file from the file picker into a new track (formerly 1) | Choose a WAV file; status reads "Loaded <name>" and a clip appears on Track 1 |
| AMW-R02 | Imports MP3, FLAC, Ogg (Vorbis or Opus), AAC/M4A, AIFF and other files the browser and MediaBunny can decode; an unreadable file is refused with a reason (formerly 1) | Import one file of each format; each loads, and a non-audio file shows an error |
| AMW-R03 | A source inspector shows codec/container, duration, channels, sample rate and file size of the active source (formerly 2) | After import the Source inspector lists 48,000 Hz for a 48 kHz file |
| AMW-R04 | The source inspector shows the file's descriptive tags (title, artist, album, track, genre, date, comment) and the number of embedded pictures (formerly 3) | Import a tagged MP3 with a cover; its tags and "1" picture are shown |
| AMW-R05 | Several files can be imported at once by picker or drop; each becomes its own track, and sources at another rate are converted to the project rate (the first source's rate) on import (formerly 10, 26) | Import a 48 kHz and a 44.1 kHz file together; two tracks appear and the second notes the conversion to 48,000 Hz |
| AMW-R06 | A project holds at most eight mono or stereo tracks; the import control shows "n of 8 tracks in use" and extra or wider sources are refused with a reason (formerly 4) | Import nine files; the ninth is refused with a message |
| AMW-R07 | Tracks can be renamed, moved up or down and removed; sources no clip uses are released (formerly 10) | Rename Track 2, move it up; it becomes Track 1 |
| AMW-R08 | Sample-rate conversion uses a band-limited windowed-sinc resampler (formerly 26) | 44.1 kHz to 48 kHz matches the analytic tone; downsampling removes content above the new Nyquist |

### Timeline, views and navigation

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| AMW-R09 | The waveform is drawn from a multi-resolution peak pyramid with zoom in, zoom out, Show all, horizontal pan, Ctrl+wheel and pinch, and never hides an extreme sample (formerly 5) | Zoom in enables Show all; Show all disables Zoom out; peak extremes survive every level |
| AMW-R10 | A spectrogram view shares the timeline's viewport, playhead and selection; dragging in Select time mode sets the selection (formerly 6) | Show spectrogram; its label names the visible range; a time drag changes the selection start |
| AMW-R11 | Zoom to selection fits the visible range to the selection | Select 1–2 s, Zoom to selection; Visible range reads 0:01.000–0:02.000 |
| AMW-R12 | Select whole clip sets the selection to the active clip | Select whole clip; the selection fields equal the clip start and end |
| AMW-R13 | Transport plays, pauses, resumes, stops, seeks and loops the mix (formerly 7) | Play, Pause, Stop returns the playhead to 0:00.000; Loop is toggled |
| AMW-R14 | Keyboard shortcuts: Space play/pause, Left/Right seek 1 s, Home/End, Escape stop, L loop, S split, A original/processed, M marker, +/- zoom, Ctrl/Cmd+Z undo, Ctrl/Cmd+Shift+Z and Ctrl+Y redo; "?" opens the shortcut list (formerly 7, 81) | Each key changes the state named; "?" opens the shortcut list |
| AMW-R15 | Shuttle keys play backwards, pause and play forwards, with repeated presses changing speed; the existing L loop shortcut stays | Press forward twice, pause, backward; playback direction and speed follow |
| AMW-R16 | The selection has editable start and end fields, shows its duration, and is clamped and ordered against the project length (formerly 8) | Enter 0.25 and 0.75; the readout shows 0.5 s; reversed or out-of-range values are clamped |
| AMW-R17 | Named markers at the playhead and named regions from the selection can be renamed, jumped to and selected (formerly 9) | Add marker "Intro point" and region "Verse A"; both are listed with their names and Select restores the region |
| AMW-R18 | Previous and next marker navigation and "select between markers" (audit Phase A 4) | With three markers, Next marker moves the playhead to each in turn; select between markers sets the selection |
| AMW-R19 | Edit and region boundaries can snap to the nearest zero crossing (formerly 12) | Snap selection to zero crossings reports the snap; snapped deletes start on a sign change |

### Clip editing and arrangement

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| AMW-R20 | Split the clip under the playhead into two frame-exact clips (razor split) with the button or S (formerly 11) | Split at 1 s; the track shows two clips |
| AMW-R21 | Crop a clip to the selection, remapping markers, regions, selection and playhead (formerly 11) | Crop to selection; clip edits increase and annotations outside are dropped |
| AMW-R22 | Trim the clip before or after the selection, every channel on the same frame | Trim before selection at 0.5 s; the clip starts at the old 0.5 s material |
| AMW-R23 | Delete the selection from a clip; later clips on the same track and annotations ripple to close the gap (formerly 11) | Delete 0.25–0.75 s; status reads "deleted 0:00.250–0:00.750" and later material moves earlier |
| AMW-R24 | Move a clip by numeric start, duplicate it, move it to another track, and nudge it by 1 sample to 1 s steps (formerly 13) | Nudge later by 100 ms; Clip start reads 1.1 |
| AMW-R25 | Delete a whole clip from the timeline in one undoable step | Delete clip; the clip is gone and Undo brings it back |
| AMW-R26 | Fade-in and fade-out per clip with linear, equal-power, exponential, logarithmic and S-curve shapes; fades never overlap (formerly 14) | Set a 0.05 s S-curve fade-out; status names S-curve |
| AMW-R27 | Overlap crossfade between neighbouring clips with one synchronized duration and curve; equal-power keeps constant power (formerly 15) | Apply a 0.2 s crossfade; status reads "Crossfaded … over 0.200 s" |
| AMW-R28 | Per-track and per-clip gain, pan (balance law with unity at centre), mute and solo; the Arrange tab acts as the mixer (formerly 16) | Solo a track; the mix contains only that track; a centred single clip renders bit-identical |
| AMW-R29 | Undo and redo cover timeline, processing, marker, master-chain and metadata operations, one atomic step each, with 100 revisions kept (formerly 17) | Apply gain, crop, undo, redo; state returns exactly at each step |
| AMW-R30 | Reset clip edits removes every edit from the active clip in one undoable step | Reset clip edits; Clip edits reads 0 |
| AMW-R31 | Drag clips directly within and between tracks with frame-grid snapping (audit Phase A 1) | Drag a clip 1 s later and onto Track 2; its start and track change and one undo restores it |
| AMW-R32 | Drag clip-edge trim handles and fade handles, kept in step with the numeric fields (audit Phase A 2) | Drag the left edge 0.5 s; Clip start and trim fields update |
| AMW-R33 | Cut, copy and paste a selection or clip through a project clipboard, one undo step each (audit Phase A 3) | Copy a selection, paste at the playhead; a new clip with the same material appears |
| AMW-R34 | Slip edit: move the material inside a clip without moving the clip | Slip a clip by 0.2 s; its start stays and its content shifts |
| AMW-R35 | Slice a clip at every region boundary or marker in one step | With two markers inside a clip, Slice at markers produces three clips |
| AMW-R36 | Channel groups: tracks can be grouped so gain, mute and solo act on the group | Group two tracks; muting the group mutes both |
| AMW-R37 | Gain envelope automation per clip or track with editable breakpoints (audit Phase C 5) | Draw a dip to −12 dB at 1 s; the render follows the envelope |
| AMW-R38 | A labelled undo history panel lists past steps and jumps to any of them (completion plan, deferred 2026-09-28) | Make three edits; the panel lists them and choosing the first restores that state |

### Level, channel and utility edits

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| AMW-R39 | Apply a gain in dB to the clip or selection without changing the source | Apply −3.5 dB; status reads "Applied -3.5 dB gain" |
| AMW-R40 | Peak-normalize to an explicit dBFS target such as 0 or −1 dBFS (formerly 23) | Normalize peak to −1 dBFS; the measured peak is −1 dBFS |
| AMW-R41 | Normalize integrated loudness (BS.1770-5 LUFS) or RMS to an explicit target (formerly 24) | Normalize to −20 LUFS; status reads "Normalized to -20.0 LUFS" |
| AMW-R42 | Measure and remove DC offset per channel (formerly 20) | A signal with offset reads 0 mean after removal |
| AMW-R43 | Invert polarity (formerly 21) | Samples are negated |
| AMW-R44 | Reverse the selection or whole clip (formerly 25) | The requested range is reversed |
| AMW-R45 | Swap left and right channels of a stereo clip (formerly 22) | L/R are exchanged; mono sources are refused |
| AMW-R46 | Fold a clip down to mono (formerly 22) | Working channels reads 1 |
| AMW-R47 | Extract one channel as the clip's only channel (formerly 22) | Extract channel keeps an independent copy of the chosen channel |
| AMW-R48 | Make a mono clip dual mono (formerly 22) | Create dual mono; Working channels reads 2 |
| AMW-R49 | Insert silence of an exact duration at the playhead, shifting later annotations (formerly 31) | Insert 0.1 s; the playhead reads 0:00.100 and the clip is 0.1 s longer |
| AMW-R50 | Reduce bit depth with optional seeded TPDF dither (formerly 27) | Reduce to 8 bits; samples sit on the 8-bit grid and dither is repeatable |
| AMW-R51 | Detect silent passages below a threshold for a minimum length and strip or shorten them (completion plan, deferred 2026-09-28) | A clip with two 1 s gaps loses both gaps after Strip silence |

### Time and pitch

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| AMW-R52 | Time stretch from 25 % to 400 % keeping pitch (phase vocoder, mid/side for stereo), rippling later clips and scaling annotations (formerly 29) | Stretch a 2 s clip to 150 %; it reads 3 s and keeps its pitch |
| AMW-R53 | Target a duration or a BPM change through the same stretch engine (formerly 30) | Percent, duration and tempo modes give the same ratio for the same target |
| AMW-R54 | Pitch shift in semitones (−24 to 24) and cents (−100 to 100) keeping length (formerly 28) | Shift −7 semitones; length is unchanged |
| AMW-R55 | Optional formant preservation for pitch shifts (formerly 28) | With formant preservation on, the spectral envelope stays in place |
| AMW-R56 | Formant shift on its own, without changing pitch | Shift formants up 2 semitones; the pitch is unchanged and the envelope moves |
| AMW-R57 | Pitch correction toward a chosen scale or reference pitch | A tone 30 cents sharp is corrected to within 5 cents |
| AMW-R58 | Transient detection marks onsets in a clip | A click track yields one onset per click |
| AMW-R59 | Tempo (BPM) detection, a beat ruler, metronome audition and snap-to-beat (audit Phase B 3) | A 120 BPM click reads 120 BPM and edits snap to beats |
| AMW-R60 | Loop slicing at beats and beat quantize of slices | Slices of a loose loop move onto the beat grid |
| AMW-R61 | Seamless-loop assistant: trim edge silence, zero-cross snap, adjustable crossfade, repeated audition, apply or create a new clip (audit Phase B 4) | A loop prepared by the assistant plays without a click at the seam |

### Restoration and spectral repair

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| AMW-R62 | Sample pen: redraw samples at maximum zoom, set one sample numerically, and interpolate a selected gap with a cubic (formerly 19) | Set sample 100 to 0.25; a pen stroke reports "Redrew n samples"; interpolation rebuilds 48 samples |
| AMW-R63 | Capture room tone from a selection and fill another range with it at a matching level (formerly 32) | Capture 0.1–0.8 s and fill 1.5–2 s; status reads "Filled 0:01.500–0:02.000 with room tone" |
| AMW-R64 | Capture a noise fingerprint from a noise-only selection (formerly 33) | Capture shows the captured range |
| AMW-R65 | STFT spectral denoise from the fingerprint with reduction depth and smoothing (formerly 34) | Broadband noise drops while the tone stays |
| AMW-R66 | 50/60 Hz de-hum with 1–20 harmonics (formerly 35) | Hum and harmonics are removed; programme stays |
| AMW-R67 | De-click: detect and repair clicks (formerly 36) | Injected clicks are repaired; clean music has none detected |
| AMW-R68 | Plosive and mouth-pop attenuation (formerly 37) | A low-frequency pop is ducked; steady bass is not |
| AMW-R69 | Micro-crackle attenuation (formerly 38) | Crackle moves toward the local median |
| AMW-R70 | De-esser with detection band and reduction range (formerly 39) | A loud sibilant band is reduced; low content is untouched |
| AMW-R71 | Multi-band hiss gate with per-band threshold and release (formerly 40) | Quiet hiss is gated per band; loud tones pass |
| AMW-R72 | De-clip: reconstruct clipped peaks above the clip level (formerly 41) | Rebuilt peaks exceed the clip level |
| AMW-R73 | Burst repair: rebuild a selected span up to 200 ms from its surroundings (formerly 42) | A 50 ms burst is rebuilt; a 250 ms span is refused |
| AMW-R74 | Spectral brush: paint time/frequency regions on the spectrogram and attenuate them in one undo step (formerly 43) | Paint one region; "Lowered 1 painted region by 18 dB" |
| AMW-R75 | Spectral heal: rebuild a selected band from neighbouring frames (formerly 44) | "Healed 2000–4000 Hz"; a noise burst moves toward its surroundings |
| AMW-R76 | Repairs on a selection are spliced back with short crossfades | A repaired range joins its neighbours without a step |
| AMW-R77 | Repairs apply to the whole clip or, with Selection only, to the selection | With Selection only on, De-clip reports the selected range |
| AMW-R78 | Heal painted spectrogram regions from the frequencies around them | Paint a region, Heal painted regions; the region is rebuilt and one undo step is added |
| AMW-R79 | Clear painted regions without changing the audio | Paint a region, Clear regions; the list is empty and Clip edits is unchanged |
| AMW-R80 | Precise spectral selection with low/high and centre/width entry and frequency-peak navigation (audit Phase C 4) | Enter 1–2 kHz; the selection box matches and Next peak moves to the strongest bin |
| AMW-R81 | Preview a destructive Edit or Repair operation with A/B before committing it (audit Phase A 5) | Preview De-hum, switch A/B, cancel; clip edits are unchanged |

### Master chain

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| AMW-R82 | Ten-band parametric EQ with a node graph and band table; band changes are undoable (formerly 45) | Set Band 6 gain −2.5 dB; undo restores 0 and redo −2.5 |
| AMW-R83 | Bell, low and high shelf, high-pass, low-pass, notch and band-pass shapes (formerly 46) | Each shape has its documented gain at the design frequency |
| AMW-R84 | Minimum-phase and linear-phase EQ modes (formerly 47) | Both boost by the set gain; linear phase stays time-aligned |
| AMW-R85 | Dynamic EQ per band with threshold, ratio, attack, release and range (formerly 48) | A dynamic band cuts only when the band is loud |
| AMW-R86 | Solo one EQ band for audition (formerly 49) | Only the soloed band is heard |
| AMW-R87 | Resonance finder and spectrum grab: find peaks in the mix and add a cut with one click or by clicking the graph (formerly 50) | Find resonances lists 440 Hz; choosing it reports "cut at 440 Hz" |
| AMW-R88 | Per-band stereo, mid or side routing (formerly 51) | A side-only band leaves mid untouched |
| AMW-R89 | Broadband compressor with threshold, ratio, knee, attack, release and makeup (formerly 52) | Output above threshold follows the ratio plus makeup |
| AMW-R90 | Three-band compressor with Linkwitz-Riley crossovers and independent bands (formerly 53) | One band compresses while the others are unchanged |
| AMW-R91 | Broadband expander/gate (formerly 54) | Quiet material is expanded downward |
| AMW-R92 | Gate hysteresis: separate open and close thresholds | A signal hovering at the threshold does not chatter |
| AMW-R93 | True-peak lookahead limiter with ceiling, release and lookahead, detecting inter-sample peaks (formerly 55) | Output true peak stays at the ceiling on hot, dense material |
| AMW-R94 | Tape/tube saturation with drive, mix and output trim (formerly 56) | Unity small-signal gain; harmonics appear when driven |
| AMW-R95 | Oversampled soft clipper with ceiling and 1/2/4× oversampling (formerly 57) | Output stays below the ceiling |
| AMW-R96 | Stereo width in mid/side (formerly 58) | Width 0 gives mono; width 2 doubles side |
| AMW-R97 | Bass mono below an editable cutoff (formerly 59) | Side content below the cutoff is removed |
| AMW-R98 | The chain is bit-transparent with default settings, and realtime audition and offline render use the same kernel | Default chain output equals input after latency alignment |
| AMW-R99 | Master input gain and output gain from −24 to +24 dB | Output gain −6 dB lowers the render by 6 dB |
| AMW-R100 | Master presets: save, rename, list, apply as one undo step, and delete (formerly 81) | Save "Gentle", apply it; status reads "Applied the preset "Gentle"" |
| AMW-R101 | Overdrive and wave-shaping distortion with drive and curve choice | Driving a sine adds odd harmonics per the chosen curve |
| AMW-R102 | Haas stereo widening with a delay of up to 40 ms on one side | A mono source widens; mono sum keeps level within 3 dB |
| AMW-R103 | Algorithmic reverb with size, decay, damping and mix | An impulse produces a decaying tail of the set length |
| AMW-R104 | Convolution reverb with an impulse response file loaded by the person | Loading an IR and rendering an impulse returns the IR |
| AMW-R105 | Stereo, ping-pong and tempo-synced multi-tap delay | An impulse produces repeats at the set times, alternating sides in ping-pong |
| AMW-R106 | Chorus | A sine gains modulated detuned copies |
| AMW-R107 | Flanger | A comb-filter sweep appears in the spectrum |
| AMW-R108 | Phaser | Moving notches appear in the spectrum |
| AMW-R109 | Rotary vibrato | Pitch and amplitude modulate at the set rate |
| AMW-R110 | Reusable macro chain of edit and master operations applied to clips or files (audit Phase C 1) | Save a macro of three steps and apply it to another clip; the same edits are added |
| AMW-R111 | Batch queue for local files with bounded concurrency, and batch loudness match with target, tolerance and true-peak ceiling (audit Phase C 2, 3) | Three files matched to −16 LUFS all read −16 ± 0.5 LUFS |

### Monitoring and metering

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| AMW-R112 | Stereo, mid-only and side-only monitoring (formerly 60) | Choose Side only during playback |
| AMW-R113 | Mono-compatibility sum switch (formerly 61) | Mono check sums the output to mono |
| AMW-R114 | Phase-correlation meter (formerly 62) | Mono reads +1, inverted reads −1; the meter is shown during playback |
| AMW-R115 | Realtime pre/post FFT spectrum overlay (formerly 63) | During playback both curves draw; an EQ boost shows in the post curve only |
| AMW-R116 | Goniometer (formerly 64) | Mono draws a vertical line |
| AMW-R117 | BS.1770-5 / EBU R 128 momentary, short-term, integrated loudness and loudness range, live and in render reports (formerly 65) | EBU Tech 3341 and 3342 cases pass |
| AMW-R118 | True-peak meter (formerly 66) | EBU Tech 3341 true-peak cases 15–23 pass |
| AMW-R119 | Timestamped true-peak excursion log above a set threshold, with jump to each event (formerly 66) | A render with two overs lists two times; choosing one moves the playhead |
| AMW-R120 | Peak, RMS and crest-factor meters (formerly 67) | A sine reads its known peak, RMS and crest |
| AMW-R121 | Loudness target presets with an integrated-versus-target readout in LU | Choose a target; the readout shows integrated minus target |
| AMW-R122 | Reset meters clears the live loudness and peak readings | After playback, Reset meters shows "—" until new audio plays |
| AMW-R123 | Original/processed A/B switching with a 20 ms equal-power crossfade and latency-aligned original (formerly 68) | Switching during playback gives no discontinuity in the output |
| AMW-R124 | Loudness-matched A/B (formerly 69) | Choosing Original reports "original mix, loudness-matched" |
| AMW-R125 | Delta audition of only the processing difference (formerly 70) | With a default chain the Difference output is silent; with gain it is not |
| AMW-R126 | Reference-track slot with synchronized start offset and loudness-matched comparison (formerly 71) | Load a reference; choosing Reference reports "reference track, loudness-matched" |
| AMW-R127 | Remove the loaded reference track | Remove reference; Reference listening is disabled again |
| AMW-R128 | Audio node graph inspector showing the playback graph's nodes and connections | During playback the inspector lists source, analysers, worklet and output in order |
| AMW-R129 | Record from microphone or line input to a new or selected track, with permission and error states, an input level meter and clipping warning (audit Phase B 1, 2, 5) | With a fake media stream, Record adds a clip of the recorded length |
| AMW-R130 | Overdub: play the project while recording onto another track (audit Phase B 2) | Recording while playing aligns the new clip to the playhead start |

### Render and export

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| AMW-R131 | Deterministic offline master render with latency compensation and a loudness report (formerly 72) | Render and measure shows a table with Integrated loudness |
| AMW-R132 | WAV export as 16- or 24-bit PCM with optional TPDF dither or 32-bit float, at an explicit sample rate (formerly 73, 26) | An unprocessed undithered 16-bit export equals the source samples |
| AMW-R133 | BWF `bext` v2 with loudness fields and RIFF INFO tags in WAV (formerly 73, 78) | bext loudness values are round(100x); INFO tags hold the title |
| AMW-R134 | MP3 export with capability-probed bitrate choices (formerly 74) | The file starts with ID3 and carries the title |
| AMW-R135 | FLAC export (formerly 75) | The file starts with fLaC and carries the title |
| AMW-R136 | Ogg export with Opus or Vorbis, labelled by the codec used (formerly 76) | The file starts with OggS; the note names Opus or Vorbis |
| AMW-R137 | AAC export in M4A (formerly 77) | The file has an ftyp box and carries the title |
| AMW-R138 | Encoder support is probed for the exact channel count, sample rate and quality before export, and unsupported choices are reported (audit 6) | The format note reads "Writes FLAC" only when that configuration encodes |
| AMW-R139 | Per-format tag fields (ID3v2, Vorbis comments, MP4, RIFF INFO) with fields a format cannot store marked "Not stored" (formerly 78) | Lyrics is disabled for WAV and enabled for FLAC |
| AMW-R140 | Embedded front-cover art in FLAC, MP3, M4A and Ogg (formerly 79) | Each export contains the chosen cover image |
| AMW-R141 | Remove the chosen cover image before export | Remove cover; the next export contains no picture |
| AMW-R142 | Export the project, the selection, each named region, or each track as a stem; several files come as one ZIP (formerly 80) | Two tracks as stems give one ZIP with two audio files |
| AMW-R143 | Loudness CSV/JSON and spectrum PNG reports, alone and inside export ZIPs (formerly 80) | The CSV starts with the header row; the ZIP holds reports/loudness.csv, loudness.json and a PNG per file |

### Project, storage and recovery

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| AMW-R144 | Autosave each tab's session (document and original audio) to IndexedDB a second after each change and on page hide; a reload offers the newest other session; five sessions are kept (formerly 18) | Add a marker, reload, Restore session; the marker and audio return |
| AMW-R145 | Discard the offered recovery session | Discard it; the banner closes and the session is not offered again |
| AMW-R146 | Saved sessions list in the Project tab with Open, Delete and Refresh (audit 2026-09-28) | Two earlier sessions are listed; Delete removes one; Open restores the other |
| AMW-R147 | Versioned project backup ZIP (`project.json` and `sources/`) saved from the Project tab and opened from the empty workspace or the Project tab; invalid files are refused with a reason (formerly 81) | Save backup, New project, open the backup; the marker returns; a non-ZIP is refused |
| AMW-R148 | Opening a backup stages its audio under fresh ids and replaces the live project only when every source decodes (audit 3) | A backup with one broken source leaves the live project unchanged and releases the staged source |
| AMW-R149 | Project documents are validated on load: out-of-range values clamped, duplicate or ambiguous ids refused (audit 5) | A document with ids that collide after normalization is refused |
| AMW-R150 | Capability diagnostics list realtime processing, workers, encoders and storage, with Copy report and a persistent-storage request (formerly 81) | The diagnostics show "Realtime processing (AudioWorklet)" as Available; Copy report copies the table |
| AMW-R151 | New project asks for confirmation and returns to the empty workspace | New project, Confirm; "Add audio" is shown |
| AMW-R152 | If the realtime processor fails, playback stops, the playhead is kept and a recovery message is shown (audit 1) | An injected processorerror shows "Realtime audio processor stopped unexpectedly" and Resume |
| AMW-R153 | If the DSP worker fails or cannot start, processing and import are locked with an explanation while project backup stays available (audit 2) | An injected worker error disables Normalize peak and keeps Save project backup enabled |
| AMW-R154 | Numeric fields accept typed drafts, commit a bounded value on Enter or blur, and restore on Escape; signed fields request a text keyboard (audit 16) | Type −999 into a −60–0 field and press Enter; it reads −60 |

### Stem separation

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| AMW-R155 | Separate a mix into stems or isolate vocals in the browser; the technique (ML or non-ML) is chosen by the ML ruleset before it is built | A test mix of known vocal and backing returns a vocal stem above the agreed quality metric |

### Non-functional

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| AMW-R156 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) and passes the colour-contrast check in dark | `E2E_THEME=dark` axe scan of `#/tools/audio-mastering` has no color-contrast violation |
| AMW-R157 | Responsive layout: no horizontal page overflow from 320 to 2560 px; report tables scroll inside named regions (audit 10) | At 320, 375, 768, 1024, 1440, 1920 and 2560 px the page does not scroll sideways |
| AMW-R158 | Accessibility: no serious or critical axe violations on the empty workspace and every workbench tab with disclosures open | axe scans pass |
| AMW-R159 | Touch targets of authored controls are at least 44 px high and authored informational text at least 12 px (audit 8, 17) | Every visible control on every tab measures at least 44 px |
| AMW-R160 | The spectrogram keeps vertical page scrolling in Select time mode and captures touch in Paint mode (audit 9) | touch-action is pan-y in Select time and none in Paint |

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Technique decisions

None recorded. AMW-R155 needs a decision under the ML ruleset before it is built.

## Intent not recorded

- Track capacity: whether the eight-track limit should become a higher tested ceiling or a resource-aware soft limit (parity audit, "Capacity review"). Owner may override the current limit of eight.
- Shuttle keys (AMW-R15): J-K-L is the common layout, but L already toggles loop (`MasteringWorkspace.tsx`). Which keys carry the shuttle is not settled; the conservative default keeps L as loop. Owner may override.

## Change log

- **2026-10-05:** Created as-built at `947272db`; 160 requirements.

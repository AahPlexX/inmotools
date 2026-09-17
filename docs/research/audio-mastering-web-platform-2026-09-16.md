# Audio Mastering Web Platform Research — 2026-09-16

## Decision

Build the workstation as a local-first browser audio application. Use native Web Audio nodes for low-cost real-time processing, `AudioWorklet` only where custom sample processing is required, workers for non-real-time analysis, `OfflineAudioContext` for deterministic full-quality renders, and MediaBunny for media container/codec I/O instead of maintaining a bespoke demux/mux stack.

## Verified platform facts

- MDN documents `AudioWorklet` as the Web Audio API mechanism for custom low-latency audio processing on the audio rendering thread. It requires a secure context for `BaseAudioContext.audioWorklet`: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
- MDN explicitly recommends AudioWorklet instead of the main-thread `ScriptProcessorNode` pattern and notes that WebAssembly can be used inside audio worklets for compute-heavy DSP: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet
- MDN documents `OfflineAudioContext` as an audio graph that renders as fast as possible to an `AudioBuffer` instead of device hardware. This is the browser-native fit for export rendering: https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext
- The Web Audio API is broadly available and defines modular routing through `AudioNode` graphs: https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API

## Loudness and true-peak standards

- ITU-R BS.1770-5 (11/2023) is the current in-force recommendation for programme loudness and true-peak measurement: https://www.itu.int/rec/R-REC-BS.1770/en
- BS.1770-5 specifies K-weighting, channel-weighted energy summation, gated loudness integration, and true-peak measurement guidance. The current revision is explicitly marked in force by ITU.
- EBU R 128 version 5.0 (November 2023) remains the current EBU recommendation. It specifies -23 LUFS programme loudness and uses Loudness Range and Maximum True Peak descriptors: https://tech.ebu.ch/publications/r128
- EBU Tech 3343 version 4.0 provides the current practical implementation guidance for R 128 workflows: https://tech.ebu.ch/publications/tech3343

## Media container and codec layer

- The MediaBunny project describes itself as a pure TypeScript browser media toolkit for reading, writing, and converting media files. Its official package manifest is version 1.57.0 and exposes browser ESM/CJS builds: https://github.com/Vanilagy/mediabunny/blob/main/package.json
- The project's v1.57.0 release was published 2026-09-16. The npm registry also reports `mediabunny@1.57.0`; this resolves a stale npm web-page cache observed during research.
- MediaBunny's documented `Input`, `BlobSource`, and `AudioSampleSink` APIs decode supported audio tracks into `AudioSample` objects and can convert samples to Web Audio `AudioBuffer`s: https://mediabunny.dev/guide/quick-start
- MediaBunny documents output formats for WAV, MP3, Ogg, FLAC, MP4/MOV and others, plus metadata tag writing. Codec availability remains capability-dependent, so the UI must probe and reject unsupported combinations rather than promise them unconditionally: https://mediabunny.dev/guide/writing-media-files
- MP3, FLAC, and AAC browser encoder extensions exist in the same first-party project. They should be added only when their export paths are implemented, pinned exactly to the core MediaBunny version.

## Accessibility constraints

- WCAG 2.2 AA requires visible keyboard focus (2.4.7), focus not fully obscured by author content (2.4.11), drag alternatives where dragging is not essential (2.5.7), and minimum pointer target sizing/spacing (2.5.8): https://www.w3.org/TR/WCAG22/
- The workstation therefore pairs spatial waveform/EQ interactions with DOM controls and numeric inputs, preserves keyboard paths for transport/editing, and does not make precise dragging the only route to a function.

## Implementation consequence

The architecture should not attempt native VST/AU/AAX hosting, ASIO/kernel device access, server rendering, or unbounded surround-channel production. Those remain outside the static GitHub Pages security/runtime model. Stereo, mono, dual-mono, Mid/Side, and a bounded number of local tracks are the supported mastering domain.

## 2026-09-17 revalidation

- GitHub's first-party `Vanilagy/mediabunny` latest-release endpoint still reports `v1.57.0`; no newer stable release displaced the exact pin overnight.
- Context7's current first-party MediaBunny documentation confirms the chosen read path: `Input` + `BlobSource` + `ALL_FORMATS`, primary audio-track selection, `canDecode()`, metadata tags, and `AudioBufferSink` for Web Audio-ready PCM buffers.
- Current MDN documentation continues to define `AudioBuffer` channel PCM as `Float32Array` data and `copyToChannel()` as the supported copy boundary. TypeScript 7's stricter typed-array generics therefore remain handled by copying into owned `Float32Array<ArrayBuffer>` storage at Web Audio boundaries rather than weakening types.
- No architectural change is required from the 2026-09-16 research baseline.

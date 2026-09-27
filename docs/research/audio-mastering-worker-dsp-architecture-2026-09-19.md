# Audio Mastering long-file and DSP execution architecture

**Research date:** 2026-09-19  
**Scope:** Browser-local Audio Mastering Workstation.  
**Decision target:** Wayfinder ticket “Choose the long-file processing and worker architecture”.

## Decision

Use a **four-lane execution architecture** with an explicit fallback path:

1. **Main/UI thread — orchestration only**
   - React state, transport intent, project revision dispatch, progress/cancel UI, and lightweight drawing coordination.
   - Never run long FFT/STFT passes, denoise, peak-pyramid construction, true-peak scans, loudness scans, sample-rate conversion, or final render loops synchronously here.

2. **Dedicated Web Worker DSP lane — default heavy compute path**
   - Waveform peak-pyramid generation.
   - Spectrogram/STFT analysis and restoration passes.
   - Loudness/true-peak/offline metering scans.
   - Sample-domain transforms and custom offline DSP that are not naturally represented by native Web Audio nodes.
   - Use transferable `ArrayBuffer` ownership for large blocks instead of structured-clone copies.
   - Jobs carry `sourceId`, `revisionId`, `jobId`, and cancellation state so stale results are discarded deterministically.

3. **AudioWorklet lane — real-time preview only**
   - Custom low-latency playback processors, meters, and preview DSP that must run in the Web Audio rendering thread.
   - Keep processor work bounded per render quantum; do not use AudioWorklet as a general long-running analysis worker.
   - Control messages/settings flow through the worklet message port.

4. **OfflineAudioContext lane — native graph bounce where it fits**
   - Use `OfflineAudioContext` for deterministic, faster-than-realtime rendering when the processing chain can be expressed with Web Audio nodes/AudioWorklet-compatible processors.
   - Do not force STFT restoration, project serialization, file I/O, or large cache building through `OfflineAudioContext` merely because it is “offline”.

### Shared memory policy

`SharedArrayBuffer` is an **optional optimization, never a functional requirement**. It requires a secure, cross-origin-isolated environment. The production baseline must work with transferable `ArrayBuffer` messages when `crossOriginIsolated !== true`.

This keeps the workstation portable across static hosting environments and avoids coupling core correctness to deployment headers.

## Platform evidence

### AudioWorklet is the real-time custom processing primitive

The current Web Audio API exposes AudioWorklet specifically for custom audio processing on the Web Audio rendering thread. MDN describes AudioWorklet as executing custom processing in a separate Web Audio thread for very low-latency processing. The W3C Web Audio 1.1 editor’s draft dated 2026-09-09 continues to define AudioWorklet and distinct control/rendering threads.

Sources:
- https://webaudio.github.io/web-audio-api/
- https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_AudioWorklet
- https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletProcessor/process

### Web Workers are the general-purpose heavy-compute primitive

Workers execute outside the document’s main execution context. Data normally crosses the boundary through structured cloning; transferable objects allow ownership of large buffers to move rather than be copied. MDN explicitly notes that transferring an `ArrayBuffer` between threads is a high-performance, zero-copy operation, after which the sender’s buffer is detached.

Sources:
- https://html.spec.whatwg.org/multipage/workers.html
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers
- https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects

### OfflineAudioContext is for faster-than-realtime graph rendering

`OfflineAudioContext` builds an audio-processing graph like `AudioContext` but renders to an `AudioBuffer` without audio hardware, as fast as the implementation can render it. This makes it appropriate for graph-based bounce/export stages, but it is not a substitute for an arbitrary worker pipeline.

Sources:
- https://webaudio.github.io/web-audio-api/
- https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext

### SharedArrayBuffer has deployment requirements

Shared memory requires a secure context and cross-origin isolation. The runtime exposes `crossOriginIsolated` so code can choose a shared-memory path when available and a transferable-buffer path otherwise.

Source:
- https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer

## Concrete project architecture

### A. Job protocol

Every background job must include:

```ts
type DspJobEnvelope = {
  jobId: string
  kind: string
  sourceId: string
  revisionId: string
  priority: 'interactive' | 'background' | 'export'
}
```

Every result must echo `jobId/sourceId/revisionId`. The receiver accepts a result only if those identifiers still match the live project state.

This directly supports the Phase 3 requirement to guard stale async peak results by source/revision ID.

### B. Cancellation

Use cooperative cancellation:
- UI marks a job cancelled and immediately ignores later results.
- Worker checks cancellation between chunks/windows/analysis blocks.
- Source/project replacement increments the relevant revision/source generation and invalidates prior jobs.
- Do not terminate/recreate the entire worker for normal command cancellation unless a worker becomes unresponsive.

### C. Chunking and memory

Do not create an additional full-file PCM copy merely to send work to a worker.

Preferred order:
1. worker owns/reads a transferable chunk;
2. worker emits compact derived results such as min/max peaks, spectral tiles, meter aggregates, or processed output blocks;
3. UI stores only the derived representation needed for display;
4. long-running tasks process bounded windows sequentially.

Waveform pyramid levels should be compact min/max pairs keyed by `sourceId + revisionId + level`, not another decoded waveform per zoom level.

Spectrogram storage should use tiled, bounded-resolution derived data rather than retaining every FFT frame at every resolution.

### D. Worker concurrency

Heavy audio jobs are memory-bandwidth intensive. Start with a **single dedicated DSP worker queue** as the deterministic baseline. Add a second worker only for demonstrably independent background work after profiling proves benefit.

Do not size an unrestricted pool directly from `hardwareConcurrency`; a many-worker approach can multiply PCM/FFT working sets and degrade lower-memory devices.

Priority order:
1. interactive operations required for the current user action;
2. visible waveform/spectrogram tiles;
3. background cache refinement;
4. export/batch work once explicitly started.

### E. Real-time playback

Keep the existing Web Audio transport. Native nodes remain preferred for gain/pan/routing where they already model the operation.

Add AudioWorklet only when a function requires custom real-time sample processing. AudioWorklet processors must not:
- build whole-file spectrograms;
- scan whole projects for loudness;
- perform file I/O;
- allocate unbounded memory;
- wait on long asynchronous operations.

### F. Offline render/export

Build the export graph from the immutable project revision:
- use `OfflineAudioContext` for Web-Audio-native stages;
- use worker DSP pre/post stages where custom analysis/restoration requires block processing;
- stream/accumulate encoded output in bounded chunks where the encoder permits;
- cancellation is revision/job based and must leave the live project untouched.

The render result is derived output. It never mutates source PCM or the project document.

## Feature-to-lane map

| Capability | Primary lane |
| --- | --- |
| Peak pyramid / waveform zoom cache | Web Worker |
| Spectrogram / STFT tiles | Web Worker |
| Denoise / de-hum / de-click / spectral heal | Web Worker for analysis/offline processing; AudioWorklet only if an interactive preview genuinely needs it |
| BS.1770/R128 scan | Web Worker |
| True-peak scan/log | Web Worker |
| Realtime meters | Native AnalyserNode/AudioWorklet as appropriate |
| Custom realtime limiter/saturation/clipper preview | AudioWorklet |
| Native EQ/gain/pan/compressor preview | Native Web Audio nodes |
| Final native-node bounce | OfflineAudioContext |
| Custom offline transforms | Web Worker, optionally feeding OfflineAudioContext stages |
| OPFS cache/file I/O | Worker-capable file/storage path where useful; never AudioWorklet |
| React/project revision updates | Main thread |

## Acceptance requirements

- UI input remains responsive while a long waveform, spectrogram, restoration, loudness, or render job is active.
- Replacing source/project invalidates old results; stale worker responses cannot overwrite new state.
- Functional correctness does not require `SharedArrayBuffer`.
- Worker failure produces an actionable error and does not corrupt the project document.
- Background work is bounded and cancellable.
- Derived caches can be discarded and rebuilt from source + project revision.
- The same project revision yields the same offline DSP inputs irrespective of UI timing.

## Consequences for the existing Phase 3 plan

- Task 6 peak-pyramid generation belongs in the dedicated DSP worker and is keyed by source/revision IDs.
- Task 5 OPFS work may use worker-side synchronous access handles where beneficial, but storage remains independent of AudioWorklet.
- Later spectrogram/restoration/metering phases must use the worker job protocol rather than adding heavy loops to React components.
- AudioWorklet should be introduced only when the first custom real-time processing feature requires it; it is not required merely to complete non-realtime editing.
- Shared memory can be added as a measured optimization later without changing the job/result contract.

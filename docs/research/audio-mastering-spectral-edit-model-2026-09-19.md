# Audio Mastering non-destructive spectral edit representation

**Research date:** 2026-09-19  
**Scope:** Ledger 6 and spectral/restoration functions 33–44, plus the project-history and worker boundaries they depend on.  
**Decision target:** Wayfinder ticket “Define the non-destructive spectral edit representation”.

## Decision

The **spectrogram is derived data, never the project document**.

The durable project stores **semantic spectral operations in physical coordinates**. A dedicated DSP worker reconstructs the required complex STFT windows from source audio, rasterizes those operations onto the active STFT grid, processes the affected coefficients, inverse-transforms them with a validated reconstruction window, and returns derived PCM/render-cache blocks.

Undo/redo changes the operation list and invalidates derived caches. It never snapshots or mutates a giant spectrogram matrix.

## Why this model

A reconstructable STFT is a complex-valued time/frequency representation. SciPy's current first-party `ShortTimeFFT` documentation describes STFT slices as complex matrices and inverse reconstruction through IFFT, a dual window, shifting, and summation. It also exposes an explicit invertibility check; its signal-processing documentation notes that inverse reconstruction requires an appropriate overlap/window relationship.

Sources:
- https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.ShortTimeFFT.html
- https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.ShortTimeFFT.istft.html
- https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.ShortTimeFFT.invertible.html
- https://docs.scipy.org/doc/scipy/reference/generated/scipy.signal.check_COLA.html
- https://docs.scipy.org/doc/scipy/tutorial/signal.html

Web Audio's `AnalyserNode` is useful for visualization but is not the workstation's editable spectral representation: its frequency API exposes the current per-bin magnitude in dB, has configurable temporal smoothing, and does not provide the retained complex time/frequency state needed for deterministic inverse reconstruction.

Sources:
- https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getFloatFrequencyData
- https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/smoothingTimeConstant
- https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/fftSize

Therefore the editable spectral model must be independent of `AnalyserNode`.

## Project-document representation

Add a versioned spectral-operation family to the project model. Conceptually:

```ts
type SpectralTarget = {
  clipId: string
  startSeconds: number
  endSeconds: number
  minHz: number
  maxHz: number
}

type SpectralBrushStroke = {
  points: Array<{
    timeSeconds: number
    frequencyHz: number
    pressure?: number
  }>
  timeRadiusSeconds: number
  frequencyRadiusHz: number
  hardness: number
}

type SpectralOperation = {
  id: string
  version: number
  target: SpectralTarget
  kind:
    | 'attenuate'
    | 'gain'
    | 'heal'
    | 'denoise'
    | 'declick'
    | 'decrackle'
    | 'deplosive'
    | 'deesser'
    | 'repair'
  enabled: boolean
  mask?: {
    kind: 'rectangle' | 'brush'
    strokes?: SpectralBrushStroke[]
  }
  params: Record<string, number | string | boolean>
  algorithmVersion: string
  deterministicSeed?: number
}
```

The exact TypeScript shape may be refined during implementation, but these invariants are fixed:

- time is stored in **seconds**, not FFT-frame indexes;
- frequency is stored in **Hz**, not bin indexes;
- brush geometry is vector/sparse geometry, not a full-resolution bitmap;
- any randomized repair/heal path carries a deterministic seed;
- algorithm version is explicit so project migrations can preserve/recompute behavior;
- operation state is serializable and belongs to atomic project history.

## Coordinate ownership

Spectral edits are **clip-local**.

- Moving a clip does not move the operation relative to its audio content.
- Duplicating a clip duplicates the effective spectral-processing state so the duplicate initially sounds identical.
- Splitting a clip partitions/clones operations into the resulting clips where their target intersects the split.
- Trimming a clip clips or shifts affected local operation ranges in the same atomic project revision.
- Deleting a clip deletes its spectral-operation ownership.
- Reversing or time-stretching content must either transform operation coordinates in the same revision or appear at an explicit position in the clip processing chain so the coordinate mapping remains deterministic.

Do not store direct spectral edits in global timeline coordinates merely because they were painted on the timeline UI; otherwise a later clip move would detach the correction from the sound the user edited.

## Analysis profiles

Separate **display profiles** from **processing profiles**.

### Display profile

Purpose: high-resolution interactive spectrogram.

May vary with zoom:
- FFT size/window duration;
- hop;
- vertical scale;
- dynamic range;
- tile resolution.

Changing display resolution never changes the audible edit because semantic masks live in seconds/Hz and are rasterized onto whichever display grid is active.

### Processing profile

Purpose: reconstructable DSP.

A processing profile is versioned and defines:
- analysis window;
- synthesis/dual window;
- window length;
- hop size/overlap;
- FFT size;
- edge-padding rule;
- channel treatment;
- numeric precision.

The chosen window/hop pair must be demonstrably invertible. If overlap-add is used directly, validate the relevant reconstruction constraint rather than assuming every “Hann + overlap” combination reconstructs identically.

Do not make the UI's current spectrogram resolution the processing FFT by accident.

## Spectrogram tile cache

Display tiles are derived and disposable.

Key each tile by at least:
- source/clip identity;
- audible project/render revision;
- display-profile version;
- channel/view mode;
- time tile index;
- frequency range/resolution.

Store compact visualization data such as log-magnitude/power values, not complex processing coefficients.

A multiresolution tile pyramid may be generated so zooming does not require recomputing the entire file. The worker architecture already requires stale results to carry and validate `sourceId/revisionId/jobId`.

The project can discard every tile and remain fully reconstructable.

## Processing cache

Do not retain whole-file complex STFT matrices.

For an affected region:

1. request source/render PCM with an analysis **halo** before and after the selected range sufficient for the processing window and algorithm context;
2. compute complex STFT frames in the worker;
3. rasterize semantic edit geometry onto those frames;
4. transform complex coefficients;
5. inverse-transform using the validated synthesis/dual window;
6. trim the halo;
7. cache only the derived PCM block and compact diagnostics needed for playback/UI.

For a sequence of adjacent affected blocks, coordinate overlap/halo ownership so the rendered result is independent of which cache block happened to be computed first.

## Phase policy

Display tiles may store magnitude only.

Audible processing must reconstruct or retain the **complex** STFT for the affected working region so phase information is not silently discarded.

For gain/attenuation/noise masks, apply the gain mask to complex coefficients unless the algorithm explicitly defines another phase treatment.

For heal/repair operations that synthesize or borrow neighboring content:
- the algorithm must define both magnitude and phase behavior;
- any stochastic choice must use the operation's stored seed;
- the same source + project revision + algorithm version must produce the same result.

## Noise fingerprint representation

A noise fingerprint is primarily a **semantic source range + algorithm parameters**, not a permanent editable spectrogram.

The project stores:
- source/clip reference;
- fingerprint time range(s);
- channel mode;
- analysis-profile/algorithm version;
- denoise parameters.

A compact derived spectral profile may be cached or embedded in a versioned project backup when necessary for reproducibility/offline relink behavior, but the canonical edit must still explain where/how the fingerprint was obtained.

This prevents the project document from ballooning with per-frame spectra while keeping the fingerprint inspectable.

## Direct spectral brush

The brush stores sparse strokes in time/frequency space.

A stroke should preserve:
- ordered points;
- radius in seconds;
- radius in Hz;
- hardness/falloff;
- strength/effect parameters;
- optional pressure.

The renderer and DSP worker rasterize the same stroke definition onto their respective grids. This gives pointer, numeric, and keyboard editing a single semantic model and prevents resolution-dependent edits.

A rectangular spectral selection uses the same physical coordinate space and can be represented without bitmap masks.

## Spectral heal

“Heal” is a versioned restoration operation, not an opaque destructive paint action.

Minimum deterministic inputs:
- target mask;
- neighboring context rule;
- algorithm version;
- deterministic seed if the algorithm samples candidate content;
- strength/blend.

The result is a cache. Undo removes/restores the operation revision; it does not restore saved PCM snapshots.

## Order in the audio pipeline

Default clip processing order:

1. immutable source reference + source range;
2. clip-local time-domain structural transforms that define audible clip coordinates;
3. clip-local restoration/spectral operations;
4. clip gain/pan;
5. fades/crossfades;
6. track processing/routing;
7. mix/master processing;
8. metering/export render.

If a future processor needs a different order, encode that order explicitly rather than relying on React component order or array accident.

## Seam control

Spectral processing cannot operate on exactly the painted rectangle with no context.

Every render request must include sufficient window/algorithm halo. Reconstruction must overlap/add with the validated synthesis window, and the committed audible block boundary must land outside the modified analysis context.

Acceptance includes an identity test:
- STFT → no-op mask → ISTFT must reproduce the original within the numeric tolerance of the selected profile.

And boundary tests:
- an edit ending at a cache-tile boundary must sound the same as the same edit rendered in one larger block;
- moving the viewport or changing display spectrogram resolution must not change audio output.

## Multi-channel policy

Preserve channel phase relationships by default.

Spectral operations must declare one of:
- linked channels;
- specific channel;
- Mid;
- Side;
- explicit independent-channel processing.

A visual “stereo combined” spectrogram is not permission to apply two independent random repairs. Linked-channel operations share deterministic decisions where required to avoid stereo image instability.

## Worker/UI boundary

Follow the resolved worker architecture:

- worker: STFT/ISTFT, spectral tiles, fingerprints, restoration, heal, cache generation;
- main thread: project revisions, selection/brush geometry, progress/cancel state;
- AudioWorklet: only a later bounded realtime preview path if truly needed.

Job results must be ignored when source/revision/profile identifiers no longer match.

## Acceptance gates

Before ledger 6 or 33–44 is counted complete where applicable:

1. no-op STFT round-trip numeric test;
2. invertibility/profile validation for every processing profile;
3. deterministic repeat-render test;
4. tile-boundary equivalence test;
5. clip move/split/trim/duplicate operation-coordinate tests;
6. undo/redo restores spectral operations atomically with the project;
7. changing display resolution leaves audio unchanged;
8. stale worker result rejection;
9. long-file test proving bounded memory rather than whole-file complex-matrix retention;
10. mono and stereo phase/coherence checks;
11. browser workflow for brush/rectangle selection with keyboard/numeric alternatives;
12. project serialize/restore retains semantic edits without persisting display tiles.

## Consequences for the 81-function ledger

This resolves the representation and architecture for:
- 6 high-resolution spectrogram;
- 33 noise fingerprint;
- 34 STFT denoise;
- 35–42 restoration operations where spectral processing is used;
- 43 spectral brush;
- 44 spectral heal.

It also constrains ledger 17/18/81 so spectral operations participate in atomic history and durable project serialization while derived spectra remain disposable.

No ledger function is advanced by this research alone.

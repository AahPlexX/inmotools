# Audio Mastering portable Ogg encoder fallback

**Research date:** 2026-09-19  
**Scope:** Browser-local Ogg export when native WebCodecs Opus encoding is unavailable.  
**Decision target:** Wayfinder ticket “Select a portable Ogg encoder fallback”.

## Decision

Use **`@audio/encode-opus` as the portable Opus encoder fallback**, but integrate its **documented raw packet API** (`@audio/encode-opus/core`) through a thin local Mediabunny `CustomAudioEncoder` adapter.

Do **not** use the package's built-in Ogg muxer in the normal workstation export path. Mediabunny remains the single container, metadata, output-target, and round-trip layer.

At implementation time:

1. Check `canEncodeAudio('opus', exactConfig)`.
2. If native encoding is unavailable, lazy-load the exact-pinned `@audio/encode-opus` fallback and register the local Mediabunny custom encoder.
3. Re-run `canEncodeAudio('opus', exactConfig)`; only expose Ogg export as ready after this returns true.
4. Feed the encoded Opus packets to Mediabunny's normal `OggOutputFormat`.
5. Keep WAV as the deterministic user-visible alternative if fallback initialization itself fails.

As of 2026-09-19, npm reports **`@audio/encode-opus@1.3.0`** as the current stable release. Revalidate official source + npm immediately before adding it to `package.json`, then pin that current stable version exactly.

## Why this dependency

The current package is purpose-built for browsers/Node, MIT licensed, has no npm dependencies, uses a single-file libopus WASM module, and explicitly documents streaming operation. Its public README also documents the raw packet entry point:

```ts
import { createOpusEncoder, toOpusRate, FRAME } from '@audio/encode-opus/core'
```

That raw layer provides:
- Opus packet generation without forcing the package's own Ogg muxer;
- encoder lookahead, which is relevant to Opus delay/pre-skip handling;
- 48 kHz conversion support;
- mono/stereo operation;
- explicit resource cleanup.

Sources:
- https://www.npmjs.com/package/@audio/encode-opus
- https://github.com/audiojs/encode

The package's own top-level API can create complete Ogg Opus files, but using that path would duplicate Mediabunny's Ogg/container layer. The documented raw core is therefore the cleaner fit for this project.

## Why keep Mediabunny as the muxer

Mediabunny already owns the workstation's media I/O abstraction and supports Ogg output with Opus. Its Ogg writer is append-only and its codec/container compatibility table explicitly lists Opus in Ogg.

Mediabunny's custom coder API is designed for exactly this situation: a browser lacks a codec encoder but the project can provide one. A `CustomAudioEncoder` receives `AudioSample` values and emits codec-conformant `EncodedPacket` values through `onPacket`; once registered, custom encoders are included in Mediabunny's codec-encodability checks.

Sources:
- https://mediabunny.dev/guide/supported-formats-and-codecs
- https://mediabunny.dev/api/CustomAudioEncoder
- https://mediabunny.dev/api/canEncodeAudio
- https://mediabunny.dev/guide/output-formats

Keeping Mediabunny in charge means:
- one Ogg muxer instead of two;
- one metadata/artwork policy;
- one output target/cancellation path;
- one post-export round-trip validation path;
- capability detection remains consistent with the other formats.

## Adapter contract

The local adapter should extend Mediabunny's `CustomAudioEncoder` and support only codec `'opus'` plus configurations the fallback can genuinely satisfy.

It must:

- convert each incoming `AudioSample` into the Float32/interleaved form expected by the Opus core;
- resample to an Opus-supported 48 kHz encode rate through the package's documented conversion path when necessary;
- buffer only the incomplete Opus frame tail, not an entire file;
- produce one Mediabunny `EncodedPacket` per raw Opus packet with deterministic timestamp, duration, sequence ordering, and packet type;
- supply any first-packet decoder configuration / delay metadata required by the Mediabunny Opus codec registry and Ogg muxer;
- account correctly for encoder lookahead/pre-skip and final padding so decoded output duration matches the intended rendered duration;
- release WASM resources on `close()`, including cancellation/error paths;
- surface asynchronous failures through Mediabunny's `onError`;
- make `flush()` deterministic and idempotent under the export lifecycle.

Mediabunny's public packet constructor carries raw bytes, packet type, timestamp, duration, and sequence number, so the adapter can stay thin rather than creating a second media framework.

Sources:
- https://mediabunny.dev/api/EncodedPacket
- https://mediabunny.dev/api/AudioSample
- https://mediabunny.dev/codec-registry/overview

## Native-first behavior

The fallback should not replace native WebCodecs on browsers where native Opus encoding passes the exact capability check.

Use:

```ts
await canEncodeAudio('opus', {
  numberOfChannels,
  sampleRate,
  quality,
})
```

Only register/load the WASM fallback when that check fails.

Consequences:
- users with native Opus do not download fallback WASM;
- initial Music workspace bundle size is unchanged apart from the small lazy-loader seam;
- browsers without native Opus still get the same Ogg feature;
- the UI does not need browser-name sniffing.

## Alternatives considered

### `libopus-wasm`

A current raw libopus WASM binding is viable, but it is lower-level and would require this project to own more conversion, framing, delay, and resource-management logic. That is unnecessary while `@audio/encode-opus` exposes a maintained, documented packet-level API built for browser audio encoding.

Use `libopus-wasm` only if the selected package's public packet API later disappears, proves incompatible with the Mediabunny packet contract, or fails browser acceptance.

### Old recorder-oriented Opus packages

Recorder libraries such as `opus-recorder` / recorder polyfills are not selected. They are oriented toward microphone recording, often require worker/asset bootstrapping, and add abstractions unrelated to offline mastering export.

### `@audio/encode` umbrella package

Do not add the whole umbrella package merely to solve Ogg fallback. The workstation already standardizes media containers and I/O on Mediabunny. The narrow `@audio/encode-opus` dependency avoids duplicating MP3/FLAC/AAC/WAV logic that Mediabunny and its official extensions already cover.

### Compile libopus ourselves

Not selected initially. It would increase build/toolchain maintenance and create a custom WASM artifact that this project then owns. The Opus reference implementation is permissively licensed, so this remains a technically valid escape hatch if a maintained packet-level dependency becomes unsuitable.

Opus licensing reference:
- https://github.com/xiph/opus-website/blob/master/license.md

## Dependency and supply-chain acceptance gate

Before the implementation commit that adds the package:

1. re-check npm's current stable version and first-party repository release/source;
2. pin exactly — no caret or range;
3. inspect package exports to ensure `@audio/encode-opus/core` remains a documented public entry point;
4. record license/NOTICE obligations;
5. run the repo's lockfile/supply-chain policy;
6. confirm the lazy chunk does not pull the umbrella `@audio/encode` dependency or a duplicate Ogg muxing dependency unexpectedly.

If the documented `/core` export is removed between research and implementation, stop and re-evaluate rather than importing a private file path.

## Required functional verification

Ledger 76 can be counted complete only after all of the following pass:

- Chromium native-or-fallback Ogg Opus export;
- Firefox native-or-fallback Ogg Opus export;
- WebKit/Safari-compatible native-or-fallback Ogg Opus export in the repo's supported browser lane;
- mono fixture;
- stereo fixture;
- non-48-kHz source fixture;
- duration/preskip/end-padding round-trip within defined tolerance;
- bitrate/quality configuration sanity;
- metadata round-trip through Mediabunny;
- cancellation and subsequent fresh export;
- fallback-WASM initialization failure produces a clean unavailable state rather than a corrupt file;
- exported file reopens through Mediabunny and reports Opus in Ogg with expected duration/channels.

The acceptance test must force the custom fallback in at least one test path even on a browser that supports native Opus. Otherwise the fallback itself has not been proven.

## Consequence for the 81-function ledger

The architecture question blocking universal Ogg support is now resolved. Ledger function 76 remains **not complete** until the adapter and browser round-trip acceptance are implemented and green, but it no longer needs an unresolved dependency-selection decision.

The implementation should remain deferred until the current Phase 3 atomic-history/timeline sequence reaches the export phase; this research does not justify jumping ahead of ledger 17.

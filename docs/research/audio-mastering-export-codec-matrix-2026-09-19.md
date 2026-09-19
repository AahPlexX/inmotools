# Audio Mastering browser export codec and fallback matrix

**Research date:** 2026-09-19  
**Scope:** Browser-local Audio Mastering Workstation export functions 72–80.  
**Decision target:** Wayfinder ticket “Choose the browser export codec and fallback matrix”.

## Current dependency baseline

As of 2026-09-19, npm reports these current stable releases from the Mediabunny publisher:

- `mediabunny@1.58.0`
- `@mediabunny/mp3-encoder@1.58.0`
- `@mediabunny/aac-encoder@1.58.0`
- `@mediabunny/flac-encoder@1.58.0`

Mediabunny’s official supported-formats documentation states that it can write MP4/ISOBMFF (including .m4a-style files), Ogg, MP3, WAVE, ADTS/AAC, and FLAC containers. Codec availability supplied by WebCodecs is browser-dependent, so Mediabunny exposes runtime encoder-capability checks and official extension encoders for AAC, MP3, and FLAC.

Sources:
- https://www.npmjs.com/package/mediabunny
- https://www.npmjs.com/~vanilagy?activeTab=packages
- https://mediabunny.dev/guide/supported-formats-and-codecs

**Dependency rule:** do not add these extension packages until their export path is implemented. At that time, re-check official docs + npm and pin the then-current stable versions exactly with no caret/range.

## Decision

Export support is **capability-driven internally but deterministic in the UI**. The user chooses a format, not an encoder implementation. The export service resolves the requested format to a verified encoder path before render starts.

### Required matrix

| User format | Container / codec | Primary path | Deterministic fallback |
| --- | --- | --- | --- |
| WAV | WAVE + PCM | Mediabunny built-in PCM encoder | Always available in the supported Mediabunny runtime; fail only on project/render/storage error |
| MP3 | MP3 + MP3 | Native only if `canEncodeAudio('mp3')` reports support | Register official `@mediabunny/mp3-encoder` |
| FLAC | FLAC + FLAC | Native only if `canEncodeAudio('flac')` reports support | Register official `@mediabunny/flac-encoder` |
| AAC | ADTS + AAC-LC | Native if `canEncodeAudio('aac')` | Register official `@mediabunny/aac-encoder` |
| M4A | ISOBMFF/MP4-family audio-only + AAC-LC | Native AAC if available | Same official AAC encoder, muxed into the ISOBMFF audio-only output path |
| Ogg | Ogg + Opus preferred | `canEncodeAudio('opus')` | No official Mediabunny Opus/Vorbis encoder extension currently exists; see the Ogg portability gate below |

### WAV is the universal lossless fallback

Mediabunny ships built-in PCM encoders and supports PCM in WAVE output. WAV therefore remains the deterministic emergency/export fallback when a compressed codec cannot be initialized.

WAV export should expose the ledger-required bit-depth/dither choices independently of compressed formats:
- 16-bit PCM;
- 24-bit PCM;
- 32-bit float where the project’s export contract allows;
- RF64/large-file mode when expected output can exceed RIFF’s ordinary size bound.

Source:
- https://mediabunny.dev/guide/output-formats
- https://mediabunny.dev/guide/supported-formats-and-codecs

### MP3 uses the official Mediabunny WASM fallback

The official documentation states that most browsers do not support MP3 encoding through WebCodecs. Mediabunny’s official MP3 encoder extension uses a bundled WASM LAME encoder and integrates through its custom coder API.

Implementation policy:
1. call `canEncodeAudio('mp3')`;
2. if false, lazy-load/register the exact pinned official MP3 extension;
3. verify capability again or initialize a real encoder configuration before presenting export as ready.

Sources:
- https://www.npmjs.com/package/@mediabunny/mp3-encoder
- https://mediabunny.dev/guide/supported-formats-and-codecs

### FLAC uses the official Mediabunny WASM fallback

Mediabunny’s official FLAC extension exists specifically because browser WebCodecs implementations do not reliably provide FLAC encoding. It uses a WASM libFLAC build.

Implementation policy mirrors MP3:
1. `canEncodeAudio('flac')`;
2. lazy-load/register the exact pinned official extension when needed;
3. encode through `FlacOutputFormat`.

Source:
- https://www.npmjs.com/package/@mediabunny/flac-encoder

### AAC and M4A use native AAC when available, official AAC extension otherwise

WebCodecs AAC encoding has browser/platform gaps. Mediabunny supplies an official AAC-LC extension using a WASM FFmpeg AAC encoder.

- **AAC export**: ADTS container via `AdtsOutputFormat`.
- **M4A export**: audio-only ISO base media/MP4-family container with AAC-LC. Mediabunny documents ISOBMFF formats including .m4a and supports AAC in MP4-compatible output.

Do not equate an AAC elementary/ADTS file with M4A: the UI and export implementation must keep container choice distinct.

Sources:
- https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection
- https://www.npmjs.com/package/@mediabunny/aac-encoder
- https://mediabunny.dev/guide/supported-formats-and-codecs
- https://mediabunny.dev/guide/output-formats

### Ogg portability gate

Mediabunny can write Ogg containing Opus or Vorbis. Current WebCodecs guidance identifies Opus as the broadly supported/recommended WebCodecs audio encoder, while Vorbis encoding support is much narrower. However, `AudioEncoder` itself is still not Baseline across all widely used browsers, and Mediabunny does not currently publish an official Opus or Vorbis encoder extension comparable to its MP3/AAC/FLAC extensions.

Therefore:

1. Prefer **Ogg Opus**, not Ogg Vorbis, for the default Ogg export path.
2. Gate it with `canEncodeAudio('opus')`.
3. If Opus is unavailable, **do not silently change the requested format**.
4. Present a precise “Ogg encoding is unavailable in this browser” state and offer WAV, MP3, FLAC, and AAC/M4A alternatives.
5. **Ledger function 76 must not be marked universally complete** until a vetted browser-side Opus/Vorbis fallback encoder is selected and integrated, or the project explicitly defines its supported-browser contract such that the tested target set all exposes Opus encoding.

This is a follow-up dependency decision, not permission to hide Ogg or count it complete.

Sources:
- https://mediabunny.dev/guide/supported-formats-and-codecs
- https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API/Codec_selection
- https://developer.mozilla.org/en-US/docs/Web/API/AudioEncoder

## Metadata and artwork policy

Mediabunny exposes normalized metadata for title, description, artist, album, album artist, track/disc numbers, genre, date, lyrics, comments, embedded images, and raw format-specific tags. `Output.setMetadataTags()` must be called before output starts.

Sources:
- https://mediabunny.dev/api/MetadataTags
- https://mediabunny.dev/guide/writing-media-files
- https://mediabunny.dev/api/Output

### Format-specific behavior

- **MP3:** write ID3 metadata; artwork is supported through image tags.
- **FLAC:** Vorbis-style metadata plus image support through Mediabunny’s normalized metadata layer.
- **Ogg:** Vorbis-style comments; image behavior must be verified by export round-trip before ledger 79 is counted for Ogg.
- **M4A/MP4:** use ISOBMFF metadata; Mediabunny supports normalized tags and cover images.
- **AAC/ADTS:** metadata maps to ID3v2 where supported by the format.
- **WAV:** choose metadata mode deliberately. RIFF INFO is limited; use the ID3 metadata mode when the user requests rich tags/artwork and verify round-trip compatibility.

No export path may silently claim a tag was embedded if the round-trip parser cannot recover it.

## Capability probing contract

Do not infer support from browser name or user agent.

At runtime:
1. determine requested container and codec;
2. ask Mediabunny/`AudioEncoder.isConfigSupported` through the library’s encoder utilities;
3. lazy-register an official extension fallback when one exists;
4. validate the exact sample rate/channel count/bitrate configuration before rendering;
5. only then enable the final export action.

Capability state should distinguish:
- `native`;
- `extension`;
- `unavailable`;
- `checking`;
- `failed`.

## Render/export memory policy

The output layer must follow the separate worker/DSP architecture decision:
- render from an immutable project revision;
- keep heavy custom DSP off the React thread;
- avoid one additional whole-project PCM copy merely for encoding;
- use streaming/append-capable targets where the chosen output format permits;
- for MP4/M4A large outputs, avoid memory-heavy Fast Start modes unless needed; Mediabunny documents `fastStart: false`, reserve, in-memory, and fragmented trade-offs.

Source:
- https://mediabunny.dev/api/IsobmffOutputFormatOptions

## Acceptance matrix

Every implemented format needs fixture-based browser acceptance covering:

1. export completes;
2. exported file reopens through Mediabunny;
3. duration is within codec/container tolerance;
4. channel count/sample rate match requested settings;
5. expected metadata survives round-trip;
6. expected artwork survives round-trip where that format supports it;
7. cancellation produces no false-success file;
8. unsupported codec state is detected before expensive render work begins.

Compressed-output tests should not assert byte-for-byte identity.

## Consequences for ledger 73–79

- **73 WAV:** technically unblocked by existing Mediabunny core.
- **74 MP3:** use official exact-pinned extension fallback.
- **75 FLAC:** use official exact-pinned extension fallback.
- **76 Ogg:** implement Ogg Opus with runtime probing, but keep universal completion blocked pending a vetted no-WebCodecs fallback or an explicit supported-browser contract.
- **77 AAC/M4A:** use native AAC when available, official exact-pinned AAC extension otherwise.
- **78 metadata studio:** normalize UI fields, preserve raw-format escape hatch only where safe/understood, and surface format limitations.
- **79 artwork embed:** verify by format-specific round-trip; do not infer support solely from the shared metadata type.

This matrix keeps the user-facing format contract stable while allowing the implementation to use native encoders where available and official WASM fallbacks where they are not.

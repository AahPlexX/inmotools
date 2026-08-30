# Next Ten Local-First Tools Design

**Date:** 2026-08-29

## Goal

Add ten production-grade browser tools to InmoTools while preserving the existing local-first privacy model, registry-driven routing, responsive instrument-bench UI, lazy tool loading, and test-first development workflow.

## Non-negotiable product constraints

- User-selected file contents and derived data remain on the device. No tool may upload user data to an application server.
- Each tool is a self-contained workspace with a focused engine module; heavy tools may add a worker or canvas/view helper when that isolates computation or rendering.
- Every tool is lazy-loaded from `src/tools/workspaces.tsx` so heavyweight dependencies do not inflate the initial landing-page bundle.
- Controls must remain usable on narrow iPhone-class viewports and desktop layouts. Canvas/WebGL surfaces must resize with their container and account for device pixel ratio.
- Keyboard operation, focus visibility, semantic labels, status announcements, reduced-motion preferences, and readable error states are required.
- Binary exports use Blob/ObjectURL downloads generated locally.
- Browser capability gaps must produce an explicit capability message rather than a broken or misleading control.
- Existing ten tools and their tests remain supported.

## Shared architecture

The existing application pattern remains authoritative:

- `src/catalog.ts` owns the public tool metadata and `ToolSlug` union.
- `src/tools/workspaces.tsx` owns lazy workspace imports.
- Each new folder under `src/tools/` owns an engine and React workspace.
- `src/components/ToolLayout.tsx` continues to provide privacy messaging, favorites, recent history, usage steps, and tool facts.
- `src/styles.css` receives only reusable workspace primitives and tool-specific layout classes that are shared or necessary for responsive rendering.

Large computation is isolated when it materially protects UI responsiveness. HAR, GeoJSON, and fuzzy reconciliation are designed so their pure engines can run in workers without changing the public engine contracts. Canvas renderers for HAR waterfalls and OpenTelemetry flamegraphs consume normalized view models rather than raw files.

## Tool 11 — HAR Sanitizer

**Slug:** `har-sanitizer`

**Files:** `src/tools/har/har-engine.ts`, `src/tools/har/HarWorkspace.tsx`, optional `src/tools/har/har.worker.ts`.

The engine parses HAR JSON without destructive schema rewriting, inventories headers/cookies/query parameters/request bodies, classifies likely credential-bearing values, and emits redaction findings with stable JSON paths. Redaction modes are `[REDACTED]`, SHA-256, and a user-supplied mask. URL query values, request/response cookies, Authorization-like headers, and form/JSON request bodies are treated separately so the user can review categories before export.

Waterfall rows normalize HAR timing fields into blocked, DNS, connect, SSL, send, wait/TTFB, and receive durations. Rendering uses Canvas with CSS-pixel coordinates backed by device-pixel-ratio scaling. The sanitized download remains a valid HAR JSON object and preserves unrelated fields.

## Tool 12 — Lossless Video Keyframe Slicer

**Slug:** `video-keyframe-slicer`

**Files:** `src/tools/video/video-engine.ts`, `src/tools/video/VideoWorkspace.tsx`.

Mediabunny is used for container inspection and encoded packet passthrough. WebCodecs is not treated as a container muxer/demuxer. The workspace reads local MP4/MOV/WebM sources, enumerates video key packets, snaps requested trim boundaries to safe keyframe boundaries, and copies encoded audio/video packets into a compatible output container without decoding or re-encoding. This makes “lossless” mean no pixel/audio re-encode; the selected boundary may move to a nearby keyframe and that adjustment must be shown before export.

The timeline provides duration, current time, selected range, and keyframe markers. Thumbnail generation is optional enhancement behavior and must never block the core keyframe trim/export flow.

## Tool 13 — glTF/GLB Optimizer

**Slug:** `gltf-optimizer`

**Files:** `src/tools/gltf/gltf-engine.ts`, `src/tools/gltf/GltfWorkspace.tsx`, `src/tools/gltf/GltfViewport.tsx`.

`@gltf-transform/core` WebIO reads/writes local GLB data. `@gltf-transform/functions` plus `meshoptimizer` performs mesh simplification and geometry optimization. Browser-side texture resize/WebP conversion is used where the source texture and browser codec support permit it. Three.js provides the orbit viewport and before/after render statistics.

The user selects target polygon ratio and maximum texture dimension. The engine reports input/output bytes, vertices/triangles, textures, and meshes. Optimization never modifies the original file; export creates a new GLB.

## Tool 14 — GeoJSON/Topology Simplifier

**Slug:** `geojson-simplifier`

**Files:** `src/tools/geo/geo-engine.ts`, `src/tools/geo/GeoWorkspace.tsx`, optional `src/tools/geo/geo.worker.ts`.

Coordinate precision truncation recursively visits GeoJSON coordinates and rounds numeric coordinate components to a user-selected precision. Topology-aware simplification converts compatible feature collections to TopoJSON topology before presimplification/simplification, preventing independently simplified shared borders from drifting apart. Export may be GeoJSON or TopoJSON according to the user’s selected output.

Preview uses a lightweight Canvas/SVG fit-to-bounds renderer rather than adding a remote basemap dependency. Before/after metrics show bytes and coordinate/vertex counts.

## Tool 15 — Font Glyph Subsetter & Metrics Inspector

**Slug:** `font-subsetter`

**Files:** `src/tools/font/font-engine.ts`, `src/tools/font/FontWorkspace.tsx`.

OpenType.js parses TTF/OTF/WOFF and WOFF2 after local WASM decompression when necessary. The engine exposes family/style metadata, units per em, ascender, descender, cap-height when present/derivable, cmap coverage, glyph names, advance widths, and outline bounds. Glyphs are previewed from parsed paths.

Subsetting creates a new font containing `.notdef` plus glyphs needed by selected Unicode presets or the user’s custom character string, retaining source metrics needed for layout. `woff2-encoder` converts the generated SFNT font buffer to WOFF2 locally. Exported file and CSS `@font-face` snippet are generated on device.

## Tool 16 — Convolution Room Profiler

**Slug:** `convolution-room-profiler`

**Files:** `src/tools/audio/audio-engine.ts`, `src/tools/audio/AudioWorkspace.tsx`, `src/tools/audio/SpectrogramCanvas.tsx`.

The Web Audio graph uses decoded dry audio and impulse-response buffers, `ConvolverNode`, wet/dry gain paths, pre-delay, low/high filtering, and stereo routing. AnalyserNode drives the live spectrum display. OfflineAudioContext produces deterministic export audio using the same control values.

A custom 24-bit PCM WAV encoder receives Float32 channel buffers and writes RIFF/WAVE headers and clamped signed 24-bit samples. Playback, pause/stop, and export state are explicit and cleanup disconnects nodes and closes disposable contexts.

## Tool 17 — APCA/OKLCH Token Matrix

**Slug:** `apca-token-matrix`

**Files:** `src/tools/contrast/contrast-engine.ts`, `src/tools/contrast/ContrastWorkspace.tsx`.

`apca-w3` performs APCA contrast calculation and Culori normalizes CSS color input including OKLCH. Token input accepts `name: color` lines. The engine builds all requested foreground/background pairings and reports signed Lc magnitude plus threshold guidance for configured text/icon roles.

The UI must not claim that APCA is a current WCAG 2.x conformance test. It is presented as perceptual APCA guidance alongside an optional conventional WCAG contrast ratio for current conformance checks. Color-vision simulations are preview aids, not pass/fail substitutes. CSS custom-property export includes only valid parsed tokens.

## Tool 18 — GLSL Live Sandbox

**Slug:** `glsl-sandbox`

**Files:** `src/tools/shader/shader-engine.ts`, `src/tools/shader/ShaderWorkspace.tsx`, `src/tools/shader/ShaderEditor.tsx`.

WebGL2 compiles a fixed full-screen vertex shader with the editable fragment shader. CodeMirror 6 uses the maintained `shader` stream parser from `@codemirror/legacy-modes/mode/clike`. Compile/link diagnostics are normalized to line-addressable messages. Standard uniforms are `u_resolution`, `u_time`, and `u_mouse`; optional local image textures bind to `u_texture0` and `u_texture1`.

The exporter creates a single HTML document containing the shader source, canvas setup, uniforms, animation loop, resize handling, pointer tracking, and embedded uploaded textures as data URLs when present. Export never depends on InmoTools runtime code.

## Tool 19 — Fuzzy Deduplicator

**Slug:** `fuzzy-deduplicator`

**Files:** `src/tools/dedupe/dedupe-engine.ts`, `src/tools/dedupe/DedupeWorkspace.tsx`, `src/tools/dedupe/dedupe.worker.ts`.

CSV is parsed locally and XLSX input is read with a browser-capable TypeScript XLSX parser. Matching combines normalized exact values, Jaro-Winkler, Levenshtein similarity, and Double Metaphone-like phonetic keys. Candidate blocking prevents naive full O(n²) comparisons for large files by grouping records on configurable prefixes/phonetic keys before scoring.

The engine emits duplicate clusters with per-pair confidence and per-column evidence. The reconciliation UI lets users pick a canonical record/value, merge a cluster, or mark it as a false positive. Export emits a deterministic deduplicated CSV and does not mutate the source file.

## Tool 20 — OpenTelemetry Flamegraph

**Slug:** `otel-flamegraph`

**Files:** `src/tools/otel/otel-engine.ts`, `src/tools/otel/OtelWorkspace.tsx`, `src/tools/otel/FlamegraphCanvas.tsx`.

The parser accepts common OTLP JSON resource-spans/scope-spans shapes and a normalized Jaeger JSON trace shape, converts IDs/timestamps/durations to a common span model, attaches parent/child relationships, flags errors from status/HTTP attributes, and computes critical paths by accumulated descendant finish time.

The Canvas renderer supports DPR-aware layout, horizontal pan/zoom, timeline scaling, hit testing, and selected-span focus. Service identity is conveyed by stable labels and visual styling; error state is not communicated by color alone. Filters can limit service, errors, and minimum latency. The detail panel exposes attributes, events, status, and exception data without altering the trace.

## Dependency policy

Dependencies are pinned to verified stable versions at implementation time. Planned libraries are:

- Mediabunny for encoded-packet media demux/remux.
- Three.js, glTF Transform core/extensions/functions, and meshoptimizer for 3D.
- TopoJSON client/server/simplify for topology-aware geographic processing.
- OpenType.js plus a browser-compatible WOFF2 WASM encoder for fonts.
- `apca-w3` and Culori for contrast/color parsing.
- CodeMirror 6 plus the CodeMirror `shader` stream parser for GLSL editing.
- A current browser-capable XLSX reader for spreadsheet input.

Native browser APIs are preferred for Web Audio, Canvas, WebGL2, Web Workers, File/Blob handling, crypto hashing, and downloads.

## Testing strategy

Pure engine behavior is covered in Vitest before workspace code is written. Tests use synthetic fixtures small enough to audit directly. Browser-only capabilities receive Playwright smoke tests where stable automation is practical and capability-fallback tests where hardware/media codecs cannot be assumed in CI. Existing unit/E2E suites must stay green throughout.

The catalog E2E contract is updated from ten to twenty tools and validates that every new slug is routable. Accessibility tests cover the shared shell plus representative complex controls. Production build, Playwright, and GitHub Pages deployment remain final gates.

## Delivery sequence

1. Repair the existing SVG optimizer unit-test regression so main has a clean baseline.
2. Implement low-dependency data/security tools: HAR, GeoJSON, fuzzy dedupe, OpenTelemetry.
3. Implement APCA, GLSL, and Web Audio tools.
4. Implement video, glTF, and font binary-media tools after their dependencies are pinned and verified.
5. Run the complete unit/build/E2E suite and deploy/verify GitHub Pages.

# Next Ten Local-First Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ten fully functional local-first tools to InmoTools, bringing the catalog from 10 to 20 without regressing the existing tools.

**Architecture:** Preserve the existing `engine.ts` + lazy React workspace pattern. Pure transformations and parsers live in testable engines; workers isolate expensive record/geometry operations; canvas/WebGL rendering consumes normalized engine output instead of raw files. Heavy third-party libraries are reachable only through lazy-loaded tool routes.

**Tech Stack:** React 19, TypeScript 7, Vite 8, Vitest 4, Playwright, Canvas/WebGL2/Web Audio/Web Workers, Mediabunny, Three.js, glTF Transform, meshoptimizer, TopoJSON, OpenType.js, WOFF2 WASM, apca-w3, Culori, CodeMirror 6, browser XLSX parser.

**Spec:** `docs/superpowers/specs/2026-08-29-next-ten-local-tools-design.md`

## Global Constraints

- Work on `main` and keep it authoritative.
- User file bytes never leave the browser.
- Write/verify a failing unit test before each new engine behavior.
- Keep every heavyweight workspace lazy-loaded.
- Preserve narrow-screen usability, keyboard access, status announcements, and reduced-motion behavior.
- Do not claim APCA is WCAG 2.x conformance.
- “Lossless video” means encoded-packet passthrough with keyframe-snapped boundaries and no decode/re-encode.
- Run `pnpm test:unit`, `pnpm build`, and `pnpm test:e2e` before declaring completion.

---

### Task 0: Restore the green SVG baseline

**Files:**
- Modify: `src/tools/svg/svg-engine.ts`
- Existing test: `tests/unit/svg.test.ts`

**Interfaces:**
- Preserve: `compileSvgSprite(sources: SvgSource[], options?: SvgCompileOptions)` and existing return fields.

- [ ] **Step 1: Reproduce RED**

Run `pnpm vitest run tests/unit/svg.test.ts`. Expected failure: `optimizedBytes` for the currentColor fixture exceeds `originalBytes`.

- [ ] **Step 2: Implement the narrow fix**

Run SVGO on the original source first and record that optimized byte count. Apply `currentColor` semantic normalization to the optimized SVG before extracting the `<symbol>` body. This keeps the optimization metric honest while allowing a semantically longer `currentColor` token in the compiled sprite.

- [ ] **Step 3: Verify GREEN**

Run `pnpm vitest run tests/unit/svg.test.ts` and then `pnpm test:unit`. Expected: all existing unit tests pass.

- [ ] **Step 4: Commit**

Commit message: `fix: normalize SVG paint after optimization`.

---

### Task 1: HAR sanitizer engine and workspace

**Files:**
- Create: `src/tools/har/har-engine.ts`
- Create: `src/tools/har/HarWorkspace.tsx`
- Create: `tests/unit/har.test.ts`

**Interfaces:**
- `analyzeHar(input: unknown): HarAnalysis`
- `sanitizeHar(input: unknown, policy: HarRedactionPolicy): Promise<HarSanitizeResult>`
- `buildWaterfallRows(input: unknown): HarWaterfallRow[]`

- [ ] **Step 1: Write RED tests**

Use a synthetic HAR with `Authorization`, `Cookie`, `Set-Cookie`, `?token=`, JSON POST credentials, and timing fields. Assert findings expose categories/paths without exposing secret values in summaries; `[REDACTED]` mode preserves the HAR shape; SHA-256 mode replaces the secret deterministically; unrelated headers and response content are preserved; timing phases normalize negative HAR sentinel values to zero.

- [ ] **Step 2: Verify RED**

Run `pnpm vitest run tests/unit/har.test.ts`. Expected: module not found or exported engine functions missing.

- [ ] **Step 3: Implement engine**

Use explicit HAR-shape guards, case-insensitive sensitive-name dictionaries, URL parsing for query parameters, JSON/form request-body traversal, and `crypto.subtle.digest('SHA-256', ...)` for hash mode. Deep-clone only the JSON structure being exported.

- [ ] **Step 4: Verify GREEN**

Run the HAR unit test until all assertions pass.

- [ ] **Step 5: Build workspace**

Add file drop/input, analysis metrics, category toggles, mask-mode controls, findings table, canvas waterfall, selected-request inspector, and sanitized `.har` export.

- [ ] **Step 6: Commit**

Commit message: `feat: add local HAR sanitizer and waterfall`.

---

### Task 2: GeoJSON precision and topology simplifier

**Files:**
- Create: `src/tools/geo/geo-engine.ts`
- Create: `src/tools/geo/GeoWorkspace.tsx`
- Create: `tests/unit/geo.test.ts`

**Interfaces:**
- `roundGeoCoordinates(input: GeoJsonLike, decimals: number): GeoJsonLike`
- `countCoordinates(input: GeoJsonLike): number`
- `simplifyTopology(input: GeoJsonLike, options: GeoSimplifyOptions): GeoSimplifyResult`

- [ ] **Step 1: Write RED tests**

Assert nested Polygon/MultiPolygon coordinates round to the selected precision without changing non-coordinate properties, count metrics are stable, and a shared-border fixture remains topologically shared after simplification.

- [ ] **Step 2: Verify RED**

Run `pnpm vitest run tests/unit/geo.test.ts`.

- [ ] **Step 3: Implement engine**

Use recursive coordinate traversal for precision. For simplification, create topology with `topojson-server`, presimplify/simplify with `topojson-simplify`, and convert back through `topojson-client` when GeoJSON output is requested.

- [ ] **Step 4: Verify GREEN and build workspace**

Add JSON file input, precision/tolerance controls, before/after byte and vertex counts, fit-to-bounds vector preview, and GeoJSON/TopoJSON download.

- [ ] **Step 5: Commit**

Commit message: `feat: add topology-aware GeoJSON simplifier`.

---

### Task 3: Fuzzy deduplication engine and worker

**Files:**
- Create: `src/tools/dedupe/dedupe-engine.ts`
- Create: `src/tools/dedupe/dedupe.worker.ts`
- Create: `src/tools/dedupe/DedupeWorkspace.tsx`
- Create: `tests/unit/dedupe.test.ts`

**Interfaces:**
- `jaroWinkler(a: string, b: string): number`
- `levenshteinSimilarity(a: string, b: string): number`
- `phoneticKey(value: string): string`
- `findDuplicateClusters(rows: DataRow[], config: MatchConfig): DuplicateCluster[]`
- `mergeCluster(cluster: DuplicateCluster, selections: CanonicalSelections): DataRow`

- [ ] **Step 1: Write RED tests**

Cover exact normalization, transposition/typo matches, non-match thresholds, candidate blocking, stable cluster IDs, and deterministic canonical merge behavior.

- [ ] **Step 2: Verify RED**

Run `pnpm vitest run tests/unit/dedupe.test.ts`.

- [ ] **Step 3: Implement engine and worker**

Implement the distance algorithms without network services. Candidate blocking uses selected-column normalized prefixes plus phonetic keys; only candidates inside a block receive weighted pairwise scoring. Worker messages contain serializable rows/config/results.

- [ ] **Step 4: Verify GREEN and build workspace**

CSV parsing is local. XLSX parsing uses the selected browser XLSX dependency. Add sheet selection, matching-column weights, threshold control, cluster reconciliation, false-positive dismissal, and deterministic CSV export.

- [ ] **Step 5: Commit**

Commit message: `feat: add local fuzzy record reconciler`.

---

### Task 4: OpenTelemetry parser and flamegraph

**Files:**
- Create: `src/tools/otel/otel-engine.ts`
- Create: `src/tools/otel/FlamegraphCanvas.tsx`
- Create: `src/tools/otel/OtelWorkspace.tsx`
- Create: `tests/unit/otel.test.ts`

**Interfaces:**
- `parseTraceExport(input: unknown): TraceModel`
- `buildSpanTree(spans: NormalizedSpan[]): SpanNode[]`
- `computeCriticalPath(spans: NormalizedSpan[]): string[]`

- [ ] **Step 1: Write RED tests**

Use compact OTLP JSON and Jaeger fixtures. Assert timestamp normalization, parent-child linkage, service naming, error detection, duration math, orphan handling, and deterministic critical path IDs.

- [ ] **Step 2: Verify RED**

Run `pnpm vitest run tests/unit/otel.test.ts`.

- [ ] **Step 3: Implement engine**

Normalize nanosecond/string timestamps to numeric milliseconds relative to trace start while preserving original IDs and attribute values. Build an ID map once; do not repeatedly scan the span array.

- [ ] **Step 4: Verify GREEN and build canvas workspace**

Implement DPR-aware flame rectangles, pan/zoom, hit testing, latency/service/error filters, selected span details, and critical-path highlighting that includes a non-color indicator.

- [ ] **Step 5: Commit**

Commit message: `feat: add local OpenTelemetry flamegraph viewer`.

---

### Task 5: APCA/OKLCH token matrix

**Files:**
- Create: `src/tools/contrast/contrast-engine.ts`
- Create: `src/tools/contrast/ContrastWorkspace.tsx`
- Create: `tests/unit/contrast.test.ts`

**Interfaces:**
- `parseTokenLines(text: string): ColorTokenParseResult`
- `buildContrastMatrix(tokens: ColorToken[], role: ContrastRole): ContrastCell[]`
- `wcagContrast(foreground: string, background: string): number`

- [ ] **Step 1: Write RED tests**

Parse Hex/RGB/HSL/OKLCH examples, reject invalid colors with line errors, assert matrix size is N², verify same-color APCA magnitude is effectively zero, and verify conventional WCAG black/white contrast is 21:1.

- [ ] **Step 2: Verify RED**

Run `pnpm vitest run tests/unit/contrast.test.ts`.

- [ ] **Step 3: Implement engine**

Use Culori to normalize colors and `apca-w3` for APCA Lc. Keep role threshold labels in a clearly named guidance table and return both APCA and conventional WCAG values.

- [ ] **Step 4: Verify GREEN and build workspace**

Add token editor, role selector, accessible matrix/table view, compact heatmap view, component sandbox, CVD preview filters, and CSS custom-property export. Label APCA as guidance rather than WCAG 2 conformance.

- [ ] **Step 5: Commit**

Commit message: `feat: add APCA and OKLCH token matrix`.

---

### Task 6: Convolution room profiler

**Files:**
- Create: `src/tools/audio/audio-engine.ts`
- Create: `src/tools/audio/SpectrogramCanvas.tsx`
- Create: `src/tools/audio/AudioWorkspace.tsx`
- Create: `tests/unit/audio.test.ts`

**Interfaces:**
- `encodePcm24Wav(channels: Float32Array[], sampleRate: number): ArrayBuffer`
- `clampAudioSample(value: number): number`

- [ ] **Step 1: Write RED tests**

Assert RIFF/WAVE identifiers, PCM format code, 24-bit depth, channel count, sample rate, data size, little-endian signed 24-bit encoding, and input sample clamping.

- [ ] **Step 2: Verify RED**

Run `pnpm vitest run tests/unit/audio.test.ts`.

- [ ] **Step 3: Implement pure WAV engine**

Write RIFF chunks with DataView and encode samples as signed 24-bit integers.

- [ ] **Step 4: Verify GREEN and build Web Audio workspace**

Decode dry/IR files locally, construct wet/dry graph with ConvolverNode, DelayNode, BiquadFilterNode and GainNode, drive analyser visualization, and mirror parameters into OfflineAudioContext for downloadable WAV rendering.

- [ ] **Step 5: Commit**

Commit message: `feat: add convolution room profiler`.

---

### Task 7: WebGL GLSL sandbox

**Files:**
- Create: `src/tools/shader/shader-engine.ts`
- Create: `src/tools/shader/ShaderEditor.tsx`
- Create: `src/tools/shader/ShaderWorkspace.tsx`
- Create: `tests/unit/shader.test.ts`

**Interfaces:**
- `buildStandaloneShaderHtml(input: ShaderExportInput): string`
- `parseWebGlLog(log: string): ShaderDiagnostic[]`

- [ ] **Step 1: Write RED tests**

Assert WebGL error logs normalize line numbers/messages and standalone HTML safely embeds shader source containing closing-script text, standard uniforms, resize/pointer handling, and optional data-URL texture values.

- [ ] **Step 2: Verify RED**

Run `pnpm vitest run tests/unit/shader.test.ts`.

- [ ] **Step 3: Implement engine**

Escape embedded script-sensitive sequences and generate a zero-dependency HTML file with one canvas and requestAnimationFrame loop.

- [ ] **Step 4: Verify GREEN and build workspace**

Mount CodeMirror using `StreamLanguage.define(shader)`, compile fragment source into WebGL2, show line-addressable compile/link diagnostics, bind `u_resolution`, `u_time`, `u_mouse`, and up to two local textures, then export standalone HTML.

- [ ] **Step 5: Commit**

Commit message: `feat: add live GLSL sandbox and exporter`.

---

### Task 8: Lossless keyframe video slicer

**Files:**
- Create: `src/tools/video/video-engine.ts`
- Create: `src/tools/video/VideoWorkspace.tsx`
- Create: `tests/unit/video.test.ts`

**Interfaces:**
- `snapTrimRange(requestedStart: number, requestedEnd: number, keyframes: number[], duration: number): SnappedRange`
- `inspectLocalMedia(file: File): Promise<MediaInspection>`
- `exportPacketRange(file: File, range: SnappedRange): Promise<Blob>`

- [ ] **Step 1: Write RED tests for pure range behavior**

Assert start snaps to the preceding/nearest safe keyframe according to the documented rule, end snaps to a keyframe at/after the requested end when needed to preserve complete GOPs, bounds clamp to duration, and invalid inverted ranges reject.

- [ ] **Step 2: Verify RED**

Run `pnpm vitest run tests/unit/video.test.ts`.

- [ ] **Step 3: Implement range engine, then Mediabunny integration**

Use local Blob input, encoded packet/key-packet inspection, and encoded packet sources on output. Preserve timestamps relative to the exported segment start and copy compatible audio/video packets without a decoder/encoder path.

- [ ] **Step 4: Verify GREEN and build workspace**

Add local video preview, range sliders/time inputs, keyframe tick marks, requested-vs-snapped range disclosure, codec/container details, capability errors, and lossless export.

- [ ] **Step 5: Commit**

Commit message: `feat: add lossless keyframe video slicer`.

---

### Task 9: glTF/GLB optimizer

**Files:**
- Create: `src/tools/gltf/gltf-engine.ts`
- Create: `src/tools/gltf/GltfViewport.tsx`
- Create: `src/tools/gltf/GltfWorkspace.tsx`
- Create: `tests/unit/gltf.test.ts`

**Interfaces:**
- `clampGltfOptions(options: Partial<GltfOptimizeOptions>): GltfOptimizeOptions`
- `optimizeGlb(bytes: Uint8Array, options: GltfOptimizeOptions): Promise<GltfOptimizeResult>`

- [ ] **Step 1: Write RED tests**

Assert ratio/texture limits clamp safely and a generated minimal triangle GLB round-trips through WebIO with stable scene structure. Add a simplification fixture only when it has enough triangles to produce a meaningful reduction.

- [ ] **Step 2: Verify RED**

Run `pnpm vitest run tests/unit/gltf.test.ts`.

- [ ] **Step 3: Implement optimization engine**

Register required glTF extensions/dependencies, await MeshoptSimplifier readiness, apply weld/simplify/meshopt transforms, resize/convert supported textures, and write a new GLB. Return before/after metrics with output bytes.

- [ ] **Step 4: Verify GREEN and build viewport**

Use Three.js GLTFLoader/ObjectURL for local preview, OrbitControls for navigation, optional wireframe overlay, stats, sliders, before/after toggle, and optimized GLB download. Dispose geometries/materials/textures/ObjectURLs on replacement/unmount.

- [ ] **Step 5: Commit**

Commit message: `feat: add browser glTF optimizer`.

---

### Task 10: Font subsetter and WOFF2 exporter

**Files:**
- Create: `src/tools/font/font-engine.ts`
- Create: `src/tools/font/FontWorkspace.tsx`
- Create: `tests/unit/font.test.ts`

**Interfaces:**
- `collectRequiredCodePoints(input: FontSubsetSelection): number[]`
- `inspectFont(buffer: ArrayBuffer, fileName: string): Promise<FontInspection>`
- `subsetToWoff2(buffer: ArrayBuffer, selection: FontSubsetSelection): Promise<FontSubsetResult>`

- [ ] **Step 1: Write RED tests**

Assert Unicode presets/custom text deduplicate and sort code points, always retain required control/notdef behavior, and metric extraction returns ascender/descender/unitsPerEm from a small licensed/generated fixture.

- [ ] **Step 2: Verify RED**

Run `pnpm vitest run tests/unit/font.test.ts`.

- [ ] **Step 3: Implement parser/subsetter**

Parse supported source format to OpenType structures, map requested code points through cmap, construct a new Font with required glyphs and source global metrics/naming, serialize to SFNT, and encode that buffer to WOFF2 with local WASM.

- [ ] **Step 4: Verify GREEN and build workspace**

Add glyph grid with code points, search/filter, preset checkboxes, custom text input, baseline/ascender/descender metric preview, before/after byte estimates, WOFF2 download, and generated `@font-face` snippet.

- [ ] **Step 5: Commit**

Commit message: `feat: add local font subsetter and metrics inspector`.

---

### Task 11: Register all ten tools and shared responsive styling

**Files:**
- Modify: `src/catalog.ts`
- Modify: `src/tools/workspaces.tsx`
- Modify: `src/styles.css`
- Modify: `package.json`
- Test: `tests/e2e/app.spec.ts`

**Interfaces:**
- Extend `ToolSlug` with: `har-sanitizer`, `video-keyframe-slicer`, `gltf-optimizer`, `geojson-simplifier`, `font-subsetter`, `convolution-room-profiler`, `apca-token-matrix`, `glsl-sandbox`, `fuzzy-deduplicator`, `otel-flamegraph`.

- [ ] **Step 1: Update E2E expectation first**

Change catalog-route coverage so the test expects twenty tool entries and verifies every new slug can open a workspace with a local privacy status.

- [ ] **Step 2: Verify RED**

Run the relevant Playwright app spec; it must fail because the ten routes are not registered yet.

- [ ] **Step 3: Pin verified dependencies and register routes**

Add exact stable versions confirmed immediately before install. Extend the catalog metadata and lazy loader record. Add responsive/canvas/editor primitives without changing the established visual system.

- [ ] **Step 4: Verify route/build GREEN**

Run `pnpm test:unit` and `pnpm build`, then the app E2E spec.

- [ ] **Step 5: Commit**

Commit message: `feat: register twenty-tool local catalog`.

---

### Task 12: Full production verification and Pages deployment

**Files:**
- Modify only files required by failures discovered during verification.

- [ ] **Step 1: Unit suite**

Run `pnpm test:unit`. Expected: all old and new engine tests pass.

- [ ] **Step 2: Production build**

Run `pnpm build`. Expected: TypeScript and Vite complete with no unresolved imports or type errors.

- [ ] **Step 3: Browser install and E2E suite**

Install the configured Playwright Chromium browser when CI/local environment requires it, then run `pnpm test:e2e`. Resolve any responsive, accessibility, routing, file-input, or browser-capability regression and re-run until green.

- [ ] **Step 4: Inspect bundle behavior**

Confirm the landing route does not eagerly load media/3D/font/editor chunks and that each heavy dependency is pulled only by its tool route.

- [ ] **Step 5: Trigger/observe GitHub Pages workflow**

Let the push-triggered Pages workflow run without creating competing duplicate runs. Inspect logs through unit/build/E2E/artifact/deploy stages and correct any deterministic CI-only failure.

- [ ] **Step 6: Verify live site**

Open the deployed `/inmotools/` site, verify the 20-tool catalog, open representative old/new routes, and test desktop plus narrow mobile layout.

- [ ] **Step 7: Final commit if verification produced fixes**

Use a narrowly scoped message describing the actual fixes; do not create a no-op commit.

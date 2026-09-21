# Transcode Workstation — Design Specification

**Date:** 2026-09-15
**Status:** Active design record for the Transcode Workstation workstream.

## Purpose

The Transcode Workstation is a local-first, universal file-to-file conversion and data
transcoding suite: tabular/structured data, images and animation, documents and markup,
audio, fonts, archives and encodings, geospatial data, and metadata/tag editing at export.
Every conversion runs entirely in the browser (main thread or Web Workers, with
WebAssembly where noted). No file content leaves the device.

## Placement

- Catalog slug: `transcode-workstation`.
- Module root: `src/tools/transcode/`.
- Loaded lazily through `src/tools/workspaces.tsx` like every other suite.
- Heavy engines (DuckDB-WASM for Parquet output, mediabunny for audio, libarchive.js for
  7z/bz2/xz) are dynamically imported on first use so the workspace shell stays small.

## Privacy model

- Inputs are `File` handles read via `FileReader`/`arrayBuffer()` into in-memory buffers.
- No analytics, no remote conversion endpoints, no upload paths.
- Worker and WASM assets are served from the same static deployment.

## Functional feature ledger (36)

The ledger below is the deterministic scope for this workstream. Each item must be reachable
through the workspace UI and produce a validated export.

### Tabular & structured data (F01–F08)

- **F01 CSV & TSV bidirectional matrix.** Custom delimiter, quoting/escaping control,
  encoding auto-detect (UTF-8, UTF-16 LE/BE, Windows-1252, ISO-8859-1), CRLF/LF
  normalization, header row toggle.
- **F02 JSON & NDJSON data streamer.** Array ↔ records, pretty/compact output, NDJSON
  (newline-delimited) both directions, deep nested object flattening into 2D relational
  records with dot-path columns and restore (unflatten).
- **F03 Parquet ingest & export.** Decode Parquet (snappy/gzip/zstd/uncompressed) via
  hyparquet; write Parquet via DuckDB-WASM `COPY … TO` with selectable compression.
- **F04 Excel workbook transcoder.** Multi-sheet `.xlsx` read (values, per sheet) to
  independent CSV/JSON tables; consolidate multi-file or multi-table input into a multi-tab
  `.xlsx` workbook. (Legacy binary `.xlsb`/`.xls` read is tracked as an open gap; see Gaps.)
- **F05 XML & Property List serializer.** Bidirectional XML ↔ JSON with attribute handling
  and CDATA preservation; XML plist ↔ JSON.
- **F06 YAML & TOML configuration transcoder.** Parse/emit preserving key hierarchy, arrays,
  and multi-line strings.
- **F07 SQL DDL & INSERT generator.** Schema inference (integer, real, boolean, timestamp,
  text) with `CREATE TABLE` + batched `INSERT INTO` for PostgreSQL, MySQL, SQLite, and
  Snowflake dialects.
- **F08 Markdown & HTML table converter.** Markdown pipe tables ↔ HTML `<table>` ↔ CSV/JSON,
  including ASCII grid table output.

### Images, icons & animation (F09–F14)

- **F09 Modern image format transcoder.** PNG, JPEG, WebP, AVIF (encode where the browser
  supports it), BMP with quality control and color preservation; capability-detected.
- **F10 SVG → high-resolution raster.** Render SVG to PNG/JPEG/WebP at explicit pixel sizes
  or DPI equivalents (72–1200).
- **F11 Raster → SVG tracing.** Color-quantized contour tracing of bitmaps into SVG paths
  (imagetracerjs presets + tuning).
- **F12 ICO & ICNS icon compiler.** Multi-resolution `.ico` (16–256 px frames) and `.icns`
  packages from one source image.
- **F13 TIFF multi-frame extractor.** Multi-page TIFF decode (utif2) to per-page PNGs or a
  ZIP bundle; PNG/JPEG → single-page TIFF encode.
- **F14 Animated image & frame toolkit.** GIF/APNG/WebP-animation decode into frame
  sequences or sprite sheets; frame sequences → animated GIF/APNG with per-frame delay;
  animated WebP encode where supported.

### Documents, markup & e-books (F15–F19)

- **F15 Markdown compiler.** GFM Markdown → standalone styled HTML5, PDF (pdf-lib layout),
  RTF, TXT, DOCX, EPUB.
- **F16 EPUB synthesizer & decompiler.** Markdown/HTML chapters → valid EPUB 3 package with
  NCX/NAV navigation and cover metadata; EPUB → extracted Markdown/HTML/TXT.
- **F17 LaTeX math transcoder.** LaTeX equations → MathML, SVG vector math, PNG raster math
  (KaTeX engine).
- **F18 RTF → clean HTML/Markdown/TXT.** RTF control-word parser producing semantic output.
- **F19 Plain-text encoding transcoder.** Decode any WHATWG-supported label; encode UTF-8
  (±BOM), UTF-16LE/BE (±BOM), ASCII, Windows-1252.

### Audio (F20–F23)

- **F20 Lossless/lossy audio transcoder.** WAV, MP3, OGG, FLAC, AAC/M4A conversions via
  mediabunny (WebCodecs + official LAME/FLAC/AAC encoder extensions) with bitrate control.
- **F21 Channel & sample-rate resampler.** Mono/stereo/5.1 downmix and 8/44.1/48/96 kHz
  resampling.
- **F22 Audio trimmer.** Timestamp-based segment extraction with container-aware output.
- **F23 Waveform & spectrogram exporter.** SVG vector waveform and PNG spectrogram rendered
  from decoded PCM (built-in FFT).

### Fonts (F24–F27)

- **F24 Web font synthesizer.** TTF/OTF → WOFF (zlib table compression) and WOFF2
  (woff2-encoder Brotli).
- **F25 WOFF/WOFF2 decompiler.** WOFF/WOFF2 → native TTF/OTF binaries.
- **F26 Font subsetter.** Unicode-range glyph subsetting for web distribution
  (opentype.js rebuild).
- **F27 SVG font ↔ TTF compiler.** SVG glyph sets → TTF via opentype.js path assembly.

### Archives & encodings (F28–F30)

- **F28 Multi-format decompressor.** ZIP/TAR/TAR.GZ in-engine (fflate + tar reader);
  7z/bz2/xz/rar via libarchive.js WASM worker; file-tree preview before extraction.
- **F29 Archive builder.** Files/hierarchies → deterministic ZIP or TAR.GZ with selectable
  Deflate level.
- **F30 Base64 & data-URI transcoder.** File → Base64 text, Base64 → file, raw text/binary
  ↔ hex dump, `data:` URI encode/decode.

### Geospatial (F31–F33)

- **F31 GeoJSON ↔ KML/KMZ.** Feature collections to Google Earth formats and back, with
  name/description property mapping; KMZ is zipped KML.
- **F32 GPX transcoder.** GPX tracks/waypoints → GeoJSON LineStrings/Points and CSV
  coordinate logs; GeoJSON → GPX.
- **F33 WKT geometry transcoder.** WKT ↔ GeoJSON and WKT/GeoJSON → SVG map preview.

### Metadata & packaging (F34–F36)

- **F34 Image metadata editor.** Inspect/edit/strip EXIF (piexifjs for JPEG, chunk-level
  strip for PNG, re-encode for WebP), including GPS and timestamps, applied at export.
  JPEG exports additionally write Dublin Core XMP packets and IPTC-IIM APP13 blocks
  (title/artist/copyright/description) via deterministic segment surgery; the
  strip-existing option removes EXIF, XMP, and IPTC sidecars before re-writing.
- **F35 Audio tag studio.** ID3v2.3 tags (title, artist, album, year, genre, track, embedded
  album art) written to MP3 output at export (browser-id3-writer); descriptive tags are
  written natively into WAV/OGG/FLAC/AAC containers through mediabunny's tags option.
- **F36 Batch queue & ZIP imposition.** Multi-file queue with per-file target/options,
  concurrent processing, and one-click bundled ZIP download of all outputs.

## Conversion relationship matrix

Implemented as data (`FORMAT_MATRIX` in `src/tools/transcode/formats.ts`) mirroring the
approved source→target schema: tabular (CSV, TSV, JSON, NDJSON, Parquet, XLSX, XML, YAML,
TOML), graphics (PNG, JPEG, WebP, AVIF, BMP, TIFF, SVG, GIF, APNG), documents (Markdown,
HTML, RTF, TXT, LaTeX math, EPUB), audio (WAV, MP3, OGG, FLAC, AAC), fonts (TTF, OTF, WOFF,
WOFF2, SVG font), geospatial (GeoJSON, GPX, KML/KMZ, WKT), archives and encodings (ZIP,
TAR*, 7z, Base64, raw binary). Unknown inputs fall back to extension detection plus magic
bytes and report an explicit "unsupported source" state rather than guessing.

## Environment constraints & exclusions

- **Static hosting only** (GitHub Pages): zero backend compute; all engines are browser or
  WASM. Server-side headless office daemons are excluded by architecture.
- **Browser memory limits:** multi-gigabyte 4K hardware-accelerated video pipelines are out
  of scope; media work targets audio transcoding, animation frames, and lightweight streams.
- **No DRM-locked format decryption** (Kindle AZW4, FairPlay, Adobe Adept): excluded.
- **No cloud storage/webhook integrations:** excluded; processing is 100% local.
- **Ogg Vorbis encoding:** no maintained browser Vorbis encoder exists and no browser
  WebCodecs implementation encodes Vorbis. OGG output therefore uses the Opus codec in an
  Ogg container (with automatic fallback messaging); OGG Vorbis inputs decode normally.
  Recorded here as an environment constraint, not a silent omission.

## Dependency evidence (verified 2026-09-15)

All versions are exact-pinned in `package.json` (no `^`/`~`). Sources: npm registry records
and each project's official documentation, checked on 2026-09-15.

| Package | Pin | Role | Official source checked |
| --- | --- | --- | --- |
| mediabunny | 1.55.4 (existing repo pin) | Container/codec conversion core | mediabunny.dev (formats/codecs, conversion guides) |
| @mediabunny/mp3-encoder | 1.55.4 | LAME WASM MP3 encoder extension | mediabunny.dev extensions guide; npm version list |
| @mediabunny/flac-encoder | 1.55.4 | FLAC encoder extension | mediabunny.dev extensions guide; npm version list |
| @mediabunny/aac-encoder | 1.55.4 | AAC encoder extension | mediabunny.dev extensions guide; npm version list |
| exceljs | 4.4.0 | XLSX read/write workbook engine | npm registry (latest stable); exceljs README |
| fflate | 0.8.3 | ZIP/gzip/Deflate + tar plumbing | npm registry (latest) |
| gifenc | 1.0.3 | Animated GIF encoding | npm registry (latest) |
| gifuct-js | 2.1.2 | GIF frame decoding | npm registry (latest) |
| upng-js | 2.1.0 | PNG/APNG encode & decode | npm registry (latest); Photopea README |
| utif2 | 4.1.0 | TIFF decode/encode | npm registry (latest) |
| imagetracerjs | 1.2.6 | Raster→SVG tracing | npm registry (latest) |
| hyparquet | 1.30.1 | Parquet reading | npm registry (latest); hyparquet README |
| hyparquet-compressors | 1.1.1 | Parquet codec decompressors | npm registry (latest) |
| piexifjs | 1.0.6 | JPEG EXIF read/write/remove | npm registry (latest) |
| browser-id3-writer | 6.4.0 | ID3v2.3 writing for MP3 | npm registry (latest); README |
| turndown | 7.2.4 | HTML → Markdown | npm registry (latest) |
| libarchive.js | 2.0.2 | 7z/bz2/xz/rar extraction (WASM worker) | npm registry (latest); README |
| @types/turndown | 5.0.6 (dev) | Types | npm registry (latest) |

Existing exact pins reused without change: papaparse 5.7.0, yaml 2.9.0, smol-toml 1.8.0,
fast-xml-parser 5.11.1, jszip 3.10.1, exifreader 4.44.0, katex 0.18.5, opentype.js 2.0.0,
woff2-encoder 2.0.0, pdf-lib 1.17.1, @duckdb/duckdb-wasm 1.32.0, docx 9.7.1,
unified/remark/rehype stack.

## Gaps tracked for later milestones

- **Legacy `.xlsb`/`.xls` read.** The current official SheetJS distribution is published on
  the SheetJS CDN (version 0.20.3, docs.sheetjs.com, checked 2026-09-15); the npm registry
  copy is stale at 0.18.5. The CDN is not reachable from the current build sandbox, so XLSX
  coverage ships via exceljs and the legacy binary workbook ingest is queued for the
  milestone where vendoring can be verified end-to-end.
- **Shift-JIS/Windows-1252 *encoding* targets** beyond the bundled Windows-1252 table:
  queued behind F19 completion if a maintained in-browser encoder library verifies cleanly.
- **Animated WebP encoding** is capability-detected (Chromium only) and degrades to a clear
  unsupported message elsewhere.

## UI & accessibility commitments

- Single-workspace flow: add files → pick a format card → tune options → convert → download
  (or batch-download ZIP). Keyboard navigable end to end; all controls labeled.
- Responsive: panes stack below 860 px.
- Capability notices surface honestly (e.g., "AVIF encoding is not available in this
  browser") instead of failing silently.

## Validation plan

- Unit tests (Vitest) for every pure engine: tabular codecs, SQL generation, table codecs,
  text encoding round-trips, base64/hex, WKT/GeoJSON/KML/GPX transforms, RTF parser,
  ICO/ICNS/BMP binary writers, archive tar/zip builders.
- Production TypeScript build must pass.
- Playwright browser spec for the workspace: intake, detection, a tabular conversion,
  an image conversion, and batch ZIP export.

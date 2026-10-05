---
tool: transcode-workstation
folder: src/tools/transcode
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-transcode-workstation-design.md
tracker: src/tools/transcode/TRACKER.md
updated: 2026-10-05
---

# Transcode Workstation — tracker

## Resume here

94 requirements: 45 verified, 24 implemented, 3 partial, 22 missing, 0 prohibited. Next action: add tests for the implemented rows (Open work 1), then build the missing rows in the order of Open work. No blocker.

## Documents

- Spec: [2026-10-05-transcode-workstation-design.md](../../../docs/superpowers/specs/2026-10-05-transcode-workstation-design.md)
- Older design and plan (history): [2026-09-15-transcode-workstation-design.md](../../../docs/superpowers/specs/2026-09-15-transcode-workstation-design.md) (36-feature ledger), [2026-09-15-transcode-workstation.md](../../../docs/superpowers/plans/2026-09-15-transcode-workstation.md)
- Owner notes: [owner-feature-notes-2026-10-05.md](../../../docs/research/owner-feature-notes-2026-10-05.md)
- Task file: `.tasks/items/T-transcode-workstation-20261005-bbaa.md`; dark contrast: `.tasks/items/T-repository-dark-contrast-20261004-b7d2.md`
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Code: `TranscodeWorkspace.tsx`, `formats.ts` (`FORMAT_MATRIX`, detection), `transcode-engine.ts` (registry), `*-converters.ts`, `*-engine.ts`
- Unit tests: `tests/unit/transcode-*.test.ts`; browser tests: `tests/e2e/transcode.spec.ts`

`e2e` = `tests/e2e/transcode.spec.ts` unless another file is named; `unit` = `tests/unit/transcode-*.test.ts`.

## Requirement status

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| TCW-R01 | verified | e2e "batches multiple files and downloads a ZIP" | |
| TCW-R02 | implemented | `TranscodeWorkspace.tsx` (`onDrop`) | Tests use the file picker only |
| TCW-R03 | missing | — | Only dropped files are read |
| TCW-R04 | verified | unit "detects common magic numbers", "detects text formats by content" | |
| TCW-R05 | missing | — | The format label is shown; the MIME type is not |
| TCW-R06 | implemented | `TranscodeWorkspace.tsx` (`offeredTargets`) | No test |
| TCW-R07 | implemented | `TranscodeWorkspace.tsx` (Remove, Clear all) | No test |
| TCW-R08 | missing | — | A Remove button exists |
| TCW-R09 | verified | unit "offers the full tabular target matrix for CSV sources", "registers a converter for every edge in the format matrix", "declares a deterministic matrix entry for every source format" | |
| TCW-R10 | verified | e2e "batches multiple files and downloads a ZIP" | |
| TCW-R11 | missing | — | The status line shows "Converting…" for the whole batch |
| TCW-R12 | missing | — | One target and option set applies to all selected files |
| TCW-R13 | partial | `parquet-writer.ts` (DuckDB worker), libarchive worker | 7z/RAR/bz2 extraction and Parquet writing use workers; other conversions run on the main thread |
| TCW-R14 | missing | — | Every file is read fully with `arrayBuffer()` |
| TCW-R15 | verified | e2e "converts CSV to JSON entirely in the browser" | |
| TCW-R16 | verified | e2e "batches multiple files and downloads a ZIP" | |
| TCW-R17 | missing | — | Outputs keep the source name with the new extension |
| TCW-R18 | missing | — | |
| TCW-R19 | verified | e2e (`tests/e2e/app.spec.ts`) "every registered suite opens with guidance, privacy status, and a usable workspace" | |
| TCW-R20 | missing | — | |
| TCW-R21 | verified | unit "parses CSV with quotes, embedded commas and newlines", "round-trips quoting and escaping", "supports headerless parsing and TSV output", "honors CRLF and quote-all options"; e2e "converts CSV to JSON entirely in the browser" | |
| TCW-R22 | verified | unit "detects BOMs and UTF-16 without BOM", "strips a UTF-8 BOM before parsing" | |
| TCW-R23 | verified | unit "parses and emits NDJSON", "emits records and values shapes", "parses top-level objects as single-record tables" | |
| TCW-R24 | verified | unit "flattens nested records into dot-path columns", "unflattens dot-path columns back into nesting" | |
| TCW-R25 | implemented | `tabular-converters.ts`, `parquet-writer.ts` | No test |
| TCW-R26 | implemented | `tabular-converters.ts` (`parseXlsx`) | No test |
| TCW-R27 | partial | `tabular.ts` (`emitXlsx`) | Each input becomes its own single-sheet workbook; consolidation and per-sheet export of every sheet are missing |
| TCW-R28 | verified | unit "converts tables to XML and back" | |
| TCW-R29 | implemented | `tabular.ts` (`attributeNamePrefix`, `cdataPropName`) | No test |
| TCW-R30 | verified | unit "emits valid plist and parses it back" | |
| TCW-R31 | verified | unit "round-trips YAML documents through tables", "round-trips TOML documents" | |
| TCW-R32 | verified | unit "infers column types", "quotes identifiers per dialect and escapes literals", "batches INSERT statements"; e2e "converts JSON to SQL with dialect options" | |
| TCW-R33 | verified | unit "emits pipe tables", "emits grid tables", "parses pipe tables with escaped pipes" | |
| TCW-R34 | verified | e2e "transcodes PNG to BMP and writes metadata-free deterministic output"; unit "writes a valid 24-bit BMP with row padding", "flattens transparency onto the background color" | |
| TCW-R35 | verified | e2e "transcodes PNG to JPEG with quality control" | |
| TCW-R36 | missing | — | SVG sources have width, height and scale (separate row) |
| TCW-R37 | missing | — | |
| TCW-R38 | missing | — | |
| TCW-R39 | missing | — | |
| TCW-R40 | implemented | `images-converters.ts` (SVG targets) | No test |
| TCW-R41 | implemented | `images-converters.ts` (png → svg) | No test |
| TCW-R42 | verified | unit "packs PNG frames with a correct directory", "packs PNG payloads behind icns magic and big-endian lengths" | |
| TCW-R43 | verified | unit "round-trips RGBA through utif2 encode/decode" | |
| TCW-R44 | implemented | `images-converters.ts` (tiff sources) | No test |
| TCW-R45 | verified | unit "emits VP8X + ANIM + one ANMF per frame", "rejects non-WebP frame payloads" | |
| TCW-R46 | implemented | `images-converters.ts` (gif, apng) | No test |
| TCW-R47 | implemented | `images-converters.ts` (sprite-png, frames-zip) | No test |
| TCW-R48 | implemented | `images-converters.ts` (webp → gif) | No test |
| TCW-R49 | missing | — | |
| TCW-R50 | implemented | `images-converters.ts` (→ pdf) | No test |
| TCW-R51 | verified | e2e "encodes an image to Base64 text" | |
| TCW-R52 | verified | unit "compiles standalone HTML5 with MathML math", "flattens markdown to plain text preserving structure", "renders RTF with bold/italic/code and unicode escapes", "produces a valid PDF header", "produces a valid DOCX (ZIP) container"; e2e "compiles Markdown to standalone HTML5", "compiles Markdown to a downloadable PDF" | |
| TCW-R53 | verified | unit "converts HTML to Markdown", "strips HTML to readable plain text" | |
| TCW-R54 | implemented | `documents-converters.ts` (txt sources) | No test |
| TCW-R55 | verified | unit "builds a valid EPUB with deterministic structure and decomplies it", "is deterministic: same input produces identical package identifiers" | |
| TCW-R56 | verified | unit "converts LaTeX to MathML", "renders SVG equations with foreignObject", "wraps rendered math in HTML", "extracts equation environments and dollar math from .tex sources" | |
| TCW-R57 | verified | unit "extracts paragraphs with inline formatting and skips tables", "emits markdown and html outputs", "decodes \\u unicode escapes with fallback skipping", "rejects non-RTF input"; unit "runs an RTF -> Markdown conversion end to end in memory" | |
| TCW-R58 | verified | unit "round-trips UTF-16 LE/BE with and without BOM", "encodes Windows-1252 including the 0x80-0x9F specials", "falls back to the replacement character for unmappable code points", "writes and skips UTF-8 BOMs", "decodes Shift-JIS byte sequences" | |
| TCW-R59 | implemented | `audio-converters.ts` | No test converts audio |
| TCW-R60 | implemented | `TranscodeWorkspace.tsx` (Bitrate) | No test |
| TCW-R61 | implemented | `TranscodeWorkspace.tsx` (Sample rate, Channels) | No test |
| TCW-R62 | implemented | `TranscodeWorkspace.tsx` (Trim start, Trim end) | No test |
| TCW-R63 | verified | unit "renders an SVG envelope from synthetic PCM", "downmixes multichannel audio to mono" | |
| TCW-R64 | implemented | `audio-converters.ts` (spectrogram-png) | No test |
| TCW-R65 | verified | unit "writes an ID3v2 header onto an MP3 stream", "embeds album art as an APIC frame", "detects tag option presence" | |
| TCW-R66 | implemented | `audio-converters.ts` (MediaBunny tags) | No test |
| TCW-R67 | missing | — | |
| TCW-R68 | missing | — | |
| TCW-R69 | missing | — | |
| TCW-R70 | missing | — | |
| TCW-R71 | verified | unit "round-trips sfnt -> woff -> sfnt table-for-table", "converts TTF -> WOFF through the registry", "re-wraps TTF as OTF with identical outline tables" | |
| TCW-R72 | verified | unit "round-trips sfnt -> woff -> sfnt table-for-table", "rejects non-WOFF input" | |
| TCW-R73 | implemented | `fonts-converters.ts` (`subsetText`) | No test |
| TCW-R74 | verified | unit "compiles SVG font XML into a parseable TrueType font", "runs svg-font -> ttf through the registry", "rejects SVG documents without a font element" | |
| TCW-R75 | verified | e2e "unpacks a single-entry ZIP to its contained file"; unit "unpacks single-entry archives to the contained file", "refuses multi-entry unpack without repack guidance" | |
| TCW-R76 | missing | — | |
| TCW-R77 | verified | unit "extracts and repacks ZIP entries", "extracts gzip-compressed tar via extractArchive", "writes ustar headers that parse back with correct sizes", "handles empty files and exact 512-byte multiples", "converts ZIP -> TAR.GZ end to end" | |
| TCW-R78 | missing | — | Download all as ZIP bundles conversion outputs at level 6 |
| TCW-R79 | missing | — | Only TAR.GZ is handled |
| TCW-R80 | missing | — | 7z extraction exists |
| TCW-R81 | verified | unit "round-trips binary through Base64", "line-wraps Base64 output when requested", "builds and parses data URIs", "runs binary -> data-uri through the registry" | |
| TCW-R82 | verified | unit "produces a canonical hex dump with offsets and ASCII", "produces canonical hex dumps and parses hex back" | |
| TCW-R83 | verified | unit "emits placemarks with names and coordinates", "round-trips KML back to GeoJSON", "packages and unpacks KMZ", "runs kmz -> gpx and kmz -> csv through the registry", "runs geojson -> kml through the converter registry" | |
| TCW-R84 | verified | unit "converts points and lines to waypoints and tracks", "parses GPX tracks with elevation and waypoints", "parses multi-segment tracks as MultiLineString" | |
| TCW-R85 | verified | unit "parses all geometry types", "parses 3D coordinates and EMPTY geometries", "round-trips WKT through GeoJSON", "rejects malformed input with position hints"; e2e "parses WKT geometry text into GeoJSON" | |
| TCW-R86 | verified | unit "renders an SVG map with projected geometry", "flattens features to CSV with point columns and WKT fallback"; e2e "renders GeoJSON features to an SVG map" | |
| TCW-R87 | verified | unit "inserts EXIF fields readable by piexifjs", "inserts a readable XMP packet without disturbing scan data", "writes and reads IPTC datasets through an APP13 IRB", "writes EXIF and XMP together deterministically", "coexists with XMP in the same file" | |
| TCW-R88 | verified | unit "strips XMP and IPTC segments on demand", "strips text chunks while preserving image data", "replaces existing metadata when stripExisting is set" | |
| TCW-R89 | verified | unit "writes and reads tEXt chunks deterministically" | |
| TCW-R90 | partial | `.tasks/items/T-repository-dark-contrast-20261004-b7d2.md` | The workspace follows the site theme through shared colour variables; the 2026-10-04 `E2E_THEME=dark` axe run found color-contrast violations in this workspace |
| TCW-R91 | implemented | `transcode-workspace.css` | No test measures overflow for this route; the transcode spec runs on desktop and mobile Chromium |
| TCW-R92 | verified | e2e (`tests/e2e/accessibility.spec.ts`) "has no serious or critical axe violations at <route>" | |
| TCW-R93 | implemented | `vite.config.ts` (VitePWA precache) | No offline test for this tool |
| TCW-R94 | implemented | `images-engine.ts` | No test |

## Open work

1. Tests for implemented rows: TCW-R02, TCW-R06, TCW-R07, TCW-R25, TCW-R26, TCW-R29, TCW-R40, TCW-R41, TCW-R44, TCW-R46, TCW-R47, TCW-R48, TCW-R50, TCW-R54, TCW-R59, TCW-R60, TCW-R61, TCW-R62, TCW-R64, TCW-R66, TCW-R73, TCW-R91, TCW-R93, TCW-R94.
2. Intake and queue: TCW-R03, TCW-R05, TCW-R08, TCW-R11, TCW-R12, TCW-R13, TCW-R14, TCW-R17, TCW-R18, TCW-R20.
3. Tabular and structured data: TCW-R27.
4. Images and animation: TCW-R36, TCW-R37, TCW-R38, TCW-R39, TCW-R49.
5. Audio and video: TCW-R67, TCW-R68, TCW-R69, TCW-R70.
6. Archives and encodings: TCW-R76, TCW-R78, TCW-R79, TCW-R80.
7. Non-functional: TCW-R90.

## Known limitations

- Every file is read fully into memory (TCW-R14).
- Ogg output is Opus only.
- ICO, ICNS, DOCX and PDF are output-only formats (`FORMAT_MATRIX`).

## Verification evidence

- 2026-10-05, branch `expand/transcode-workstation`: `pnpm tool:check transcode-workstation --base origin/main`: incomplete, 45/94, no errors; `pnpm docs:check` clean; `vitest run` cad-progress, sheets-wave-b, deployment-config 23/23.

## Change log

- **2026-10-05:** Created with the spec; 94 requirements.

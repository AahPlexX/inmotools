---
tool: transcode-workstation
folder: src/tools/transcode
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-transcode-workstation-design.md
tracker: src/tools/transcode/TRACKER.md
updated: 2026-10-05
---

# Transcode Workstation — spec

As built at `947272db` (last code change under `src/tools/transcode/`). Requirement prefix: `TCW`. Status of each requirement: [TRACKER.md](../../../src/tools/transcode/TRACKER.md).

"(formerly Fnn)" gives the feature number in the 36-feature ledger of [2026-09-15-transcode-workstation-design.md](2026-09-15-transcode-workstation-design.md).

History (kept as written): [2026-09-15-transcode-workstation-design.md](2026-09-15-transcode-workstation-design.md), plan [2026-09-15-transcode-workstation.md](../plans/2026-09-15-transcode-workstation.md).

## Purpose

Convert files between formats on the device: tabular and structured data, images and animation, documents and markup, audio, fonts, archives and encodings, geospatial data, with metadata and tags written at export; for anyone who needs a file in another format without uploading it.

## Scope

In scope: the source-to-target conversions in `FORMAT_MATRIX` (`src/tools/transcode/formats.ts`), their options, batch conversion and download, metadata and tag writing, and the conversions listed below as `missing`.

Out of scope: decryption of DRM-locked formats (Kindle, FairPlay, Adobe Adept), which breaks the formats' terms; conversions that need a server or a cloud service (platform rules).

## Constraints

- Platform rules: no accounts or authentication; no server, backend or server-side database (static files on GitHub Pages); everything runs in the browser and data the tool keeps stays in this browser; network use only for the site's own files and public keyless sources on the person's own action ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- No large language models; other ML only on the device under the ML ruleset ([standard](../../DOCUMENTATION_STANDARD.md#machine-learning-and-ai)).
- GitHub Pages cannot send COOP/COEP headers, so WebAssembly runs single-threaded only.
- Conversions use the libraries already in `package.json` (exact pins), among them MediaBunny and its encoder extensions, ExcelJS, hyparquet and DuckDB-WASM, fflate, libarchive.js, utif2, upng-js, gifenc, gifuct-js, imagetracerjs, piexifjs, browser-id3-writer, opentype.js, woff2-encoder, KaTeX, pdf-lib and docx ([DECISIONS.md](../../DECISIONS.md#version-pins-and-package-sources)).
- Ogg output uses Opus: no browser encodes Vorbis. Ogg Vorbis input decodes.
- Animated WebP and AVIF encoding depend on the browser and are capability-detected.

## Architecture and engine

- Engines and libraries: `mediabunny@1.60.0` decodes and encodes audio, with `@mediabunny/mp3-encoder@1.60.0`, `@mediabunny/flac-encoder@1.60.0` and `@mediabunny/aac-encoder@1.60.0` registered when the browser lacks that encoder; `@duckdb/duckdb-wasm@1.32.0` writes Parquet; `hyparquet@1.30.1` with `hyparquet-compressors@1.1.1` reads Parquet; `libarchive.js@2.0.2` extracts bz2 and 7z; `fflate@0.8.3` and `jszip@3.10.2` handle ZIP, gzip and zlib; `pdf-lib@1.17.1`, `docx@9.7.1`, `exceljs@4.4.0`, `papaparse@5.7.0`, `fast-xml-parser@5.11.1`, `yaml@2.9.0`, `smol-toml@1.9.0` and `turndown@7.2.4` convert documents and tabular formats; `unified@11.0.5`, `remark-parse@11.0.0`, `remark-gfm@4.0.1`, `remark-math@6.0.0`, `remark-rehype@11.1.2`, `rehype-katex@7.0.1`, `hast-util-to-html@9.0.5` and `katex@0.18.9` render Markdown and math to HTML; `utif2@4.1.0`, `upng-js@2.1.0`, `piexifjs@1.0.6`, `gifenc@1.0.3`, `gifuct-js@2.1.2` and `imagetracerjs@1.2.6` cover TIFF, PNG, EXIF, GIF and vector tracing; `opentype.js@2.0.0` and `woff2-encoder@2.0.0` convert fonts; `browser-id3-writer@6.4.0` writes ID3 tags.
- Workers: the DuckDB worker bundles (`duckdb-browser-eh.worker.js`, `duckdb-browser-mvp.worker.js`) started in `parquet-writer.ts`; the libarchive.js worker `worker-bundle.js` started in `archives-engine.ts`.
- Browser APIs: WebAssembly runs DuckDB and libarchive.js; WebCodecs (through Mediabunny) decodes audio and reports encoder support, with bundled WASM encoders filling in for MP3, FLAC and AAC; Canvas 2D and `createImageBitmap` decode, resize and encode images; File and Blob handle input and download.
- Network: none.

## Requirements

### Intake and queue

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TCW-R01 | Adds one or many files from the file picker; each is listed with its name, size and detected format | Choose two files; both are listed with sizes and format badges |
| TCW-R02 | Adds files dropped onto the intake box | Drop two files; both are listed |
| TCW-R03 | Dropping a folder adds every file inside it, recursively | Drop a folder with a subfolder; every file is listed |
| TCW-R04 | Detects the source format from magic bytes, then content and extension; an unrecognised file shows "?" and fails with "Unrecognized source format." (formerly F36) | A PNG renamed .txt is detected as PNG; random bytes show "?" |
| TCW-R05 | Shows the detected MIME type of each file | A PNG row shows image/png |
| TCW-R06 | Each file has a select checkbox; only selected files convert, and only targets every selected file supports are offered | Select a CSV and a PNG; no common target is offered |
| TCW-R07 | Remove one file, or Clear all files and results | Remove a file; it leaves the list; Clear all empties it |
| TCW-R08 | On touch screens, swiping a queued file removes it | Swipe a row left on a phone layout; the file is removed |
| TCW-R09 | Targets are grouped by category and each explains itself; only implemented conversions are offered | A CSV offers the tabular group; each chip has a description |
| TCW-R10 | Converts every selected file to the chosen target in one run and reports failures per file (formerly F36) | Convert three files; one card per file; a failing file shows its error |
| TCW-R11 | Each item in a batch shows its own progress while converting | A batch of five shows per-file progress |
| TCW-R12 | Per-file target and options inside one batch (formerly F36) | Two files in one batch convert to different targets |
| TCW-R13 | Conversions run in Web Workers so the page stays responsive | During a large conversion the page still responds to input |
| TCW-R14 | Large files are processed without loading the whole file into memory, and files above the device's limit are refused with a reason | A 2 GB file is refused with a message instead of crashing the tab |
| TCW-R15 | Text outputs have a Preview; every output has its own Download | Convert CSV to JSON; Preview shows the JSON; Download saves people.json |
| TCW-R16 | Download all outputs as one ZIP, renaming duplicate names (formerly F36) | Two outputs; Download all as ZIP saves transcode-results.zip with both |
| TCW-R17 | Output naming templates (for example `{name}-{target}.{ext}`) | A template renames every output accordingly |
| TCW-R18 | Before/after comparison of source and output (size, and side by side for images and text) | Convert PNG to JPEG; both images and sizes are shown together |
| TCW-R19 | The workspace states that files never leave the browser | The intake text and the privacy status say processing is local |
| TCW-R20 | Hashes MD5, SHA-1 and SHA-256 of a file | The SHA-256 of a known file matches its published digest |

### Tabular and structured data

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TCW-R21 | CSV and TSV in both directions with delimiter choice or auto-detect, header row toggle, quote-all and LF/CRLF line endings (formerly F01) | CSV with quoted commas and newlines round-trips; CRLF and quote-all are honoured |
| TCW-R22 | Source character set for delimited and text sources: auto-detect (BOM, UTF-16 without BOM) or a chosen set (formerly F01) | A UTF-16 LE CSV without BOM parses correctly |
| TCW-R23 | JSON and NDJSON in both directions, records or header+values shape, pretty or compact (formerly F02) | NDJSON parses and emits one record per line |
| TCW-R24 | Nested JSON is flattened to dot-path columns and can be restored (formerly F02) | {a:{b:1}} becomes column a.b and back |
| TCW-R25 | Parquet input (snappy, gzip, zstd, uncompressed) and Parquet output with selectable compression (formerly F03) | CSV to Parquet with zstd re-reads to the same rows |
| TCW-R26 | XLSX input reads a chosen sheet (first by default) to any tabular target (formerly F04) | Sheet name "Sheet2" converts that sheet; a missing name is reported |
| TCW-R27 | XLSX output; several input tables consolidated into one multi-sheet workbook (formerly F04) | Two CSVs produce one XLSX with two sheets |
| TCW-R28 | Tabular data to XML and back (formerly F05) | A table converts to XML and parses back to the same rows |
| TCW-R29 | XML attributes and CDATA are kept when converting XML to JSON (formerly F05) | An element with an attribute and CDATA keeps both in JSON |
| TCW-R30 | XML property list to and from JSON, XML and YAML (formerly F05) | A plist round-trips |
| TCW-R31 | YAML and TOML in both directions keeping hierarchy, arrays and multi-line strings (formerly F06) | A nested YAML document round-trips |
| TCW-R32 | SQL output: inferred column types, CREATE TABLE and batched INSERT for PostgreSQL, MySQL, SQLite and Snowflake, with table name and rows per INSERT (formerly F07) | JSON to SQL with MySQL quotes identifiers with backticks |
| TCW-R33 | Markdown pipe or ASCII grid tables from tabular data; Markdown and HTML tables to CSV, JSON or the other table form (formerly F08) | A Markdown table with an escaped pipe converts to CSV |

### Images and animation

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TCW-R34 | Raster conversion between PNG, JPEG, WebP, AVIF and BMP, with AVIF and WebP encoding where the browser supports it (formerly F09) | PNG to BMP writes a valid 24-bit BMP |
| TCW-R35 | Quality 1–100 for JPEG, WebP and AVIF output (formerly F09) | A lower quality gives a smaller JPEG |
| TCW-R36 | Resize raster images to a width and height with aspect-ratio lock | Resize 400×200 to width 100 with lock on; output is 100×50 |
| TCW-R37 | Set the output DPI written into the image file | Export at 300 DPI; the file's density field reads 300 |
| TCW-R38 | Convert to grayscale | A colour image exports with equal R, G and B per pixel |
| TCW-R39 | Convert RGB to CMYK and CMYK to RGB | A CMYK JPEG converts to RGB PNG with matching colours; RGB to CMYK JPEG reads as CMYK |
| TCW-R40 | Render SVG to PNG, JPEG, WebP, AVIF, ICO or PDF at an explicit width, height or scale factor (formerly F10) | SVG at scale 4 gives a raster four times the SVG size |
| TCW-R41 | Trace a PNG into SVG paths with palette colours, detail and path-omit options (formerly F11) | A two-colour PNG traces to an SVG with two fills |
| TCW-R42 | Multi-resolution ICO (16–256 px) and ICNS icons from one image (formerly F12) | The ICO directory lists every frame size |
| TCW-R43 | PNG to single-page TIFF (formerly F13) | A PNG converts to a TIFF that decodes to the same pixels |
| TCW-R44 | Multi-page TIFF: first page to PNG, JPEG or WebP, and every page as PNG in a ZIP (formerly F13) | A two-page TIFF gives a ZIP with two PNGs |
| TCW-R45 | Animated GIF or APNG to animated WebP (formerly F14) | A three-frame GIF gives a WebP with one ANMF chunk per frame |
| TCW-R46 | Animated GIF to APNG and APNG to GIF, keeping frames and delays (formerly F14) | A three-frame GIF to APNG keeps three frames |
| TCW-R47 | GIF or APNG frames to a sprite sheet PNG or a frame ZIP (formerly F14) | A three-frame GIF gives a ZIP with three PNGs |
| TCW-R48 | WebP to a palette GIF (formerly F14) | A WebP converts to a GIF that decodes |
| TCW-R49 | Frame sequences (several images) to an animated GIF or APNG with a per-frame delay (formerly F14) | Three PNGs become a three-frame GIF at 100 ms |
| TCW-R50 | Image to a PDF page (formerly F09) | A JPEG to PDF gives a one-page PDF |
| TCW-R51 | Image to Base64 text or a data: URI (formerly F30) | Base64 of a PNG decodes back to the same bytes |

### Documents and markup

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TCW-R52 | Markdown (GFM) to standalone HTML5 with math as MathML, plain text, RTF, PDF and DOCX, with a document title (formerly F15) | Markdown to HTML5 gives a full document with the heading |
| TCW-R53 | HTML to Markdown, plain text, PDF, RTF and EPUB | An HTML page converts to Markdown with its headings |
| TCW-R54 | Plain text to Markdown, HTML and PDF | Two paragraphs become two <p> elements |
| TCW-R55 | EPUB 3 from Markdown or HTML with navigation, title, author and language; EPUB to Markdown, HTML or text (formerly F16) | Markdown to EPUB and back keeps the chapter text; identical input gives identical identifiers |
| TCW-R56 | LaTeX math to MathML, SVG, PNG or HTML; equations are taken from .tex sources (formerly F17) | \frac{a}{b} converts to MathML with mfrac |
| TCW-R57 | RTF to clean HTML, Markdown and text (formerly F18) | An RTF with bold converts to Markdown with **bold** |
| TCW-R58 | Text re-encoding: decode any WHATWG label (including Shift-JIS) and encode UTF-8, UTF-16 LE/BE (each with or without BOM), ASCII or Windows-1252 (formerly F19) | Windows-1252 0x80–0x9F map correctly; unmappable characters become the replacement character |

### Audio and video

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TCW-R59 | Audio conversion between WAV, MP3, Ogg (Opus), FLAC and AAC (M4A) (formerly F20) | WAV to MP3 gives a playable MP3 |
| TCW-R60 | Audio bitrate 32–320 kbps for lossy targets (formerly F20) | MP3 at 64 kbps is about a quarter the size of 256 kbps |
| TCW-R61 | Audio sample rate (for example 44.1 or 48 kHz) and channel count (mono, stereo, up to 8) (formerly F21) | 48 kHz stereo to 44.1 kHz mono reads 44,100 Hz and 1 channel |
| TCW-R62 | Trim audio to a start and end time before converting (formerly F22) | Trim 1–2 s of a 5 s file; the output lasts 1 s |
| TCW-R63 | Waveform SVG from WAV or MP3, downmixing multichannel audio (formerly F23) | A sine's waveform SVG has a path; multichannel input is downmixed |
| TCW-R64 | Spectrogram PNG from WAV or MP3 (formerly F23) | A 1 kHz sine shows one bright row |
| TCW-R65 | ID3v2 tags (title, artist, album, year, genre) and embedded album art in MP3 output (formerly F35) | An MP3 export carries an ID3v2 header and an APIC picture |
| TCW-R66 | Descriptive tags written into WAV, Ogg, FLAC and M4A output (formerly F35) | A FLAC export with a title carries it in its Vorbis comment |
| TCW-R67 | Extract the audio track of a video file to an audio format | An MP4 with AAC audio gives an M4A of the same length |
| TCW-R68 | Convert video (MP4, WebM, MKV, AVI) to MP4 or WebM | A WebM converts to a playable MP4 |
| TCW-R69 | Convert video to animated GIF, animated WebP or APNG | A 2 s clip converts to a GIF with frames at the chosen rate |
| TCW-R70 | Video options: quality, resolution, frame rate, trim range and strip audio | Strip audio gives a file with no audio track |

### Fonts

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TCW-R71 | TTF/OTF to WOFF (zlib) and WOFF2 (Brotli); TTF and OTF re-wrapped as each other (formerly F24) | TTF to WOFF and back is table-for-table identical |
| TCW-R72 | WOFF and WOFF2 back to TTF or OTF, and to each other (formerly F25) | A WOFF converts to a TTF that parses |
| TCW-R73 | Subset a font to given characters when writing WOFF2 (formerly F26) | Subset to "ABC" keeps only those glyphs |
| TCW-R74 | SVG font to TTF, WOFF or WOFF2 (formerly F27) | An SVG font compiles to a parseable TTF; an SVG without a font element is refused |

### Archives and encodings

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TCW-R75 | Extract a single-entry ZIP, TAR, TAR.GZ, TAR.BZ2, 7z or RAR to its contained file; a multi-entry archive is refused with repack guidance (formerly F28) | A ZIP holding notes/hello.txt unpacks to hello.txt |
| TCW-R76 | Extract every entry of a multi-entry archive as separate outputs, with a file-tree preview first (formerly F28) | A ZIP with three files shows a tree and gives three outputs |
| TCW-R77 | Repack ZIP, TAR, TAR.GZ, TAR.BZ2 and 7z as ZIP; ZIP as TAR or TAR.GZ; TAR to TAR.GZ and back (formerly F29) | ZIP to TAR.GZ end to end keeps every entry |
| TCW-R78 | Build a ZIP or TAR.GZ from the loaded files, with a chosen Deflate level (formerly F29) | Three loaded files packed at level 9 give one archive with three entries |
| TCW-R79 | Compress a single file with gzip (.gz) and decompress a .gz file | A .txt to .gz and back is byte-identical |
| TCW-R80 | Create 7z archives | Three files pack into a 7z that extracts back |
| TCW-R81 | Base64 encode with optional line wrap, Base64 decode to a file or text, and data: URIs in both directions (formerly F30) | Binary to Base64 and back is byte-identical; wrapped output has the set line length |
| TCW-R82 | Hex dump with offsets and ASCII, and hex back to bytes (formerly F30) | The dump of 16 bytes has an offset, hex columns and ASCII |

### Geospatial

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TCW-R83 | GeoJSON to KML and KMZ with names and descriptions; KML and KMZ back to GeoJSON, GPX and CSV (formerly F31) | GeoJSON to KML and back keeps names and coordinates |
| TCW-R84 | GPX waypoints, tracks and routes to GeoJSON, KML and CSV; GeoJSON to GPX (formerly F32) | A multi-segment track becomes a MultiLineString |
| TCW-R85 | WKT to and from GeoJSON, including 3D and EMPTY geometries, with position hints for errors (formerly F33) | POINT (30 10) parses to a GeoJSON Point |
| TCW-R86 | GeoJSON, KML and WKT rendered to an SVG map; GeoJSON flattened to CSV with point columns and a WKT column (formerly F33) | Two features render as two SVG shapes |

### Metadata

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TCW-R87 | JPEG metadata at export: EXIF title, artist and copyright, optional XMP packet and IPTC-IIM fields (formerly F34) | A JPEG export with a title has it in EXIF, XMP and IPTC |
| TCW-R88 | Strip existing EXIF, XMP and IPTC from JPEG, and text chunks from PNG, before writing (formerly F34) | A JPEG with GPS exports without it |
| TCW-R89 | PNG text metadata (title, author, copyright) at export (formerly F34) | PNG export with a title has a tEXt chunk |

### Non-functional

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TCW-R90 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) and passes the colour-contrast check in dark | `E2E_THEME=dark` axe scan of `#/tools/transcode-workstation` has no color-contrast violation |
| TCW-R91 | Responsive layout: no horizontal page overflow from 320 to 2560 px; panes stack below 860 px | At 320, 375, 768, 1024, 1440, 1920 and 2560 px the page does not scroll sideways |
| TCW-R92 | Accessibility: no serious or critical axe violations; every control is labelled and keyboard operable | axe scan of the route passes |
| TCW-R93 | Works offline after the first visit (site service worker) | Load the tool, go offline, reload; the workspace opens and converts CSV to JSON |
| TCW-R94 | Capability notices name what this browser cannot encode instead of failing silently (for example AVIF or animated WebP) | In a browser without AVIF encoding, choosing AVIF shows a message |

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Technique decisions

None recorded.

## Intent not recorded

- Video conversion (TCW-R67–TCW-R70): which engine (MediaBunny with WebCodecs, or a single-threaded WebAssembly encoder for AVI and other inputs WebCodecs cannot read) is not settled. Owner may override.

## Change log

- **2026-10-05:** Created as-built at `947272db`; 94 requirements.

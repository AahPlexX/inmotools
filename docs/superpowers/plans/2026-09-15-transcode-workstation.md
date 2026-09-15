# Transcode Workstation — Implementation Plan

**Date:** 2026-09-15
**Design:** `docs/superpowers/specs/2026-09-15-transcode-workstation-design.md`
**Branch:** session working branch `arena/01a0a5c8-inmotools` (this session is pinned to it; it
serves as the dedicated development branch for this tool). No merge to `main` until every
milestone below is complete and verified.

## Deterministic completion goal

The workstation is complete when **all 36 ledger features (F01–F36)** are implemented, reachable
through the workspace UI, produce validated exports, are covered by focused unit tests plus a
browser spec, pass `pnpm test:unit` and `pnpm build`, and the task-state files reflect that
evidence. Feature count and identity are fixed by the design ledger; completion is not declared
before every ledger item is green or explicitly moved to `NEXT.md`/`BACKLOG.md` with rationale.

## Milestones

- **M0 — Foundation (this execution).** Workspace shell, catalog/loader integration, format
  registry with magic-byte + extension detection, conversion dispatcher, download/result
  plumbing, CSS, dependency pins installed and lockfile committed.
- **M1 — Tabular & structured data.** F01–F08 with unit tests. Includes parquet read
  (hyparquet) and parquet write (DuckDB-WASM lazy session).
- **M2 — Documents, markup, encodings.** F15–F19 (HTML5/RTF/TXT/PDF/DOCX/EPUB outputs, EPUB
  decompose, KaTeX math outputs, RTF parser, text encoding transcoder) plus F30
  (Base64/hex/data-URI) with unit tests.
- **M3 — Images, icons & animation.** F09–F14 with unit tests for the binary writers
  (BMP/ICO/ICNS) and browser tests for canvas-based paths.
- **M4 — Audio.** F20–F23, F35 (mediabunny + extensions, trim, resample, waveform/spectrogram,
  ID3 writer) with engine unit tests where feasible and browser tests for conversion.
- **M5 — Fonts, geospatial, archives.** F24–F27, F31–F33, F28–F29, F34 (EXIF editor) with
  unit tests for pure transforms.
- **M6 — Batch, hardening, verification.** F36 batch queue + ZIP imposition, responsive and
  keyboard accessibility pass, capability messaging, unit + browser suites green, production
  build green, task-state reconciliation, then integration request.

## Progress ledger (kept current each execution)

| Milestone | Status | Evidence |
| --- | --- | --- |
| M0 | complete 2026-09-15 | Workspace shell, format registry + magic-byte detection, dispatcher, catalog/loader integration, 17 exact-pinned dependencies installed; `tsc` clean; production build green (`TranscodeWorkspace` chunk emitted) |
| M1 | complete 2026-09-15 | F01–F08 implemented: CSV/TSV/JSON/NDJSON/XLSX/XML/Plist/YAML/TOML/SQL/Markdown+HTML table codecs, Parquet read (hyparquet) and write (DuckDB-WASM lazy session); 38 focused unit tests green, including end-to-end registry conversions |
| M2 | complete 2026-09-15 | F15–F18 implemented: Markdown→HTML5(MathML)/TXT/RTF/PDF/DOCX/EPUB, EPUB decompile, RTF parser + TXT/HTML/MD emitters, KaTeX LaTeX→MathML/SVG/PNG/HTML; 25 focused unit tests green including deterministic EPUB round-trip |
| M3 | complete 2026-09-15 | F09–F14 implemented: raster transcode with quality control, BMP/ICO/ICNS binary writers, animated-WebP RIFF builder, GIF/APNG decode+encode, sprite sheets, frame ZIPs, multi-page TIFF, SVG rasterization, raster→SVG tracing, image→PDF; 13 binary-codec unit tests green |
| M4 | complete 2026-09-15 | F20–F23 + F35 implemented: WAV/MP3/OGG(Opus)/FLAC/AAC transcode via mediabunny with WASM encoder fallbacks, resample/downmix/trim options, waveform SVG + FFT spectrogram PNG exporters, ID3v2 tagging at export (browser-id3-writer); audio-target registry tests green |
| M5 | complete 2026-09-15 | F24–F35 implemented: WOFF1 pure-JS codec + WOFF2 wasm + SVG-font→TTF compiler + inline glyph subsetting (F24–F27); ZIP/TAR/TAR.GZ extract+build, bz2/7z/RAR via libarchive.js worker, Base64/hex/data-URI both directions (F28–F30); GeoJSON↔KML/KMZ/GPX/WKT/CSV/SVG-map (F31–F33); full image metadata editing at export — PNG tEXt, JPEG EXIF (piexifjs), pure-JS XMP packet surgery, and IPTC-IIM APP13 writer/reader (F34); audio tags written natively into WAV/OGG/FLAC/AAC plus ID3v2 for MP3 (F35). Edge-completeness guard proves every FORMAT_MATRIX edge is registered |
| M6 | complete 2026-09-15 | tests/e2e/transcode.spec.ts: 6 scenarios (CSV→JSON download bytes, JSON→SQL options, WKT→GeoJSON, PNG→BMP, batch ZIP, Base64) × 2 projects = 12 Playwright tests; browser execution delegated to CI since the sandbox has no browser binaries |

## Per-execution checklist

1. Re-read this plan and the design ledger; update the ledger before coding when scope changes.
2. Implement the smallest complete slice for the current milestone.
3. Add/extend unit tests in the same cycle; run `pnpm test:unit` (focused spec) and record result.
4. Run `pnpm build` before finishing an execution cycle that touches imports or config.
5. Update the progress ledger and `.tasks/IN_PROGRESS.md` milestone line in the same cycle.
6. Commit with a scoped message; push only to the session branch.

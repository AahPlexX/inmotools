# Transcode Workstation — Implementation Plan

**Date:** 2026-09-15
**Design:** `docs/superpowers/specs/2026-09-15-transcode-workstation-design.md`
**Integration:** F01–F36 shipped to `origin/main` through PR #33 (merge commit
`c923512a753b15c2086e3e22f7c189c42fd4ca59`). The original working branch
`arena/01a0a5c8-inmotools` is retired and no Transcode-only branch remains.

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
- **M5 — Fonts, geospatial, archives.** F24–F27, F31–F33, F28–F29, F34 (EXIF/XMP/IPTC
  editor), F35 (audio tags) with unit tests for pure transforms.
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
| M6 | complete 2026-09-15 | tests/e2e/transcode.spec.ts: 11 scenarios (CSV→JSON download bytes, JSON→SQL options, WKT→GeoJSON, PNG→BMP, batch ZIP, Base64, Markdown→HTML5, Markdown→PDF, GeoJSON→SVG map, ZIP→Binary unpacking with fflate fixture, PNG→JPEG quality) × 2 projects = 22 Playwright tests; browser execution delegated to CI since the sandbox has no browser binaries |

## Completion evidence and maintenance handoff

- **Product integration:** PR #33 merged the complete F01–F36 implementation to `origin/main`
  as `c923512a753b15c2086e3e22f7c189c42fd4ca59`; the former Transcode working branch is
  retired.
- **Focused verification:** the integrated Transcode revision was re-verified on 2026-09-21
  with 124 focused unit tests, a clean production build, and all 22 Transcode browser cases
  passing across desktop and mobile Chromium.
- **Fresh main verification:** on 2026-09-23, current product revision
  `4f800253b29493d69fac21cbd1b665080ee3ca64` passed the repository unit-test and production
  build steps in Pages run `35914410493`. That run executed all 22
  `tests/e2e/transcode.spec.ts` cases (11 desktop + 11 mobile) with zero Transcode failures;
  its 13 browser failures were in unrelated workspaces. The Pages artifact build and deployment
  both succeeded from the same revision.
- **Static closure audit:** no Transcode `FIXME` markers or remote `fetch`,
  `XMLHttpRequest`, or `WebSocket` paths were found. Apparent `TODO` hits are the
  `markdownToDocx` identifier; apparent “placeholder” hits are normal form placeholder text
  and the TAR checksum field before its checksum is written.

For future maintenance, start from current `origin/main`, preserve the F01–F36 contract and
documented exclusions, reuse the existing focused tests, and add new tests only for behavior
that changes. New Transcode scope must enter the repository task-state system before
implementation; do not revive the retired branch or reopen this completed workstream merely for
speculative enhancements.

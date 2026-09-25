# Sightline Velocity Studio — Design

**As of:** 2026-09-15
**Plan:** `docs/superpowers/plans/2026-09-15-sightline-velocity.md`
**Catalog slug:** `sightline-velocity`

## Purpose

One local workstation that takes a document in almost any everyday format and turns it into an accelerated reading session: extract the text, build a structured token stream, present it through several paced reading engines, measure what happened, and publish the result in formats other people can open.

The audience is deliberately wide: children and general readers who need large type and short spans, professionals who skim reports under time pressure, researchers who must scan many papers, and legal or academic readers who need position-exact resumption, annotations, and defensible exports.

## Scope boundary

Everything runs in the browser. No backend, no upload, no remote conversion service, no account. Documents, progress, annotations, vocabulary, session analytics, and exports stay on the device. Speech uses only the platform's own speech synthesiser.

The application is deployed as a static GitHub Pages site and is installable/offline-capable through the repository's existing PWA configuration.

## Honest capability limits

Each of these is a place where a reading tool could plausibly claim more than it can deliver, so each is surfaced in the interface rather than hidden:

- **Reading acceleration is a trade, not a free lunch.** Speed and comprehension trade off against each other once you move beyond your own comfortable pace. The published evidence is unambiguous on this: RSVP at a reader's normal rate produces comprehension comparable to ordinary reading, while accelerating well past that rate reduces comprehension and recall, and RSVP removes the preview and regression repair that skilled readers normally use on roughly one word in ten. Sightline therefore presents itself as an instrumented reading instrument — it removes mechanical overhead (saccades, return sweeps, line-skip), makes resumption and rewind trivial, and measures the result — not as a way to double reading speed while understanding everything.
- **The session's own numbers describe the session, not the reader.** Gross WPM is words divided by elapsed time, so it includes the pauses a reader makes. Comprehension is whatever the reader scored on the drills they chose to take.
- **Syllable and readability estimates are heuristics.** They are deterministic and unit-tested but approximate English orthography conventions; they are labelled as estimates.
- **PDF text depends on the file, not only the reader.** A PDF that stores scanned page images or glyphs without a text layer yields little or no extractable text. Sightline reports the extracted-character count per page so an image-only document is obvious immediately rather than silently producing an empty stream. There is no OCR in this release.
- **PDF layout fidelity is not preserved.** Sightline reconstructs paragraphs, headings, and reading order heuristically (glyph geometry, line gaps, font sizes). It is a text-stream extractor, not a layout clone.
- **EPUB output is structural.** Container, package document, spine, navigation, and metadata are standards-shaped, but the archive is not certified by EPUBCheck, and no reliable client-side EPUBCheck exists. It is labelled "EPUB (structural)".
- **DOM-backed parsing.** HTML and EPUB XHTML are parsed with the same HTML parsing algorithm browsers use; malformed markup is handled exactly as a browser would handle it rather than by a bespoke tolerant parser.
- **Native Word equations, embedded objects, and revision history are not converted.** DOCX equations arrive as plain text runs, and tracked-change markup is read as its accepted text.
- **Speech quality and timing are the platform's.** Voices, availability, and word-boundary event support vary by browser and operating system. Where boundary events are unavailable the pacing falls back to an estimate derived from the utterance's rate; the interface states which path is active.

## Naming and marks

Several commercial reading products are registered or otherwise protected marks with patents, registered trademarks, and licensing terms attached, including the fixation-weighting typographic method sold under one such mark, the gradient-line-reading method sold under another, and the single-word reader sold under a third. This suite implements the underlying reading techniques in its own code with its own algorithms and parameterisation, and it names each capability descriptively instead of borrowing those marks:

- initial-letter fixation weighting is presented as **Anchor-Weight Typography**;
- line-to-line spectral tracking gradients are presented as **Trail-Gradient Text**;
- single-word optimal-recognition-point streaming is presented as **ORP RSVP**.

The suite claims no affiliation, endorsement, or compatibility with any of those products.

### Trademarks referenced only to explain the exclusion

- `BIONIC READING` — registered marks held by BRCG Casutt GmbH (USPTO 5557651, EUIPO 015969488, and other jurisdictions) with a stated patent in France.
- `Spritz` — commercial reader technology (patent-pending per its operator).
- `BeeLine Reader` — commercial gradient reading product.

## Architecture

Framework-free engines under `src/tools/sightline/`, each independently unit-testable without React, a DOM, or IndexedDB, plus one React workspace composed of focused panels. Every engine is a pure function or an object built on injectable interfaces, so the Node-based unit runner can exercise the full ingestion, pacing, typography, drill, analytics, and export logic without a browser. Browser-only capabilities (PDF decoding, speech, audio, IndexedDB, drag-and-drop) are injected through narrow interfaces defined next to their consumers.

### Ingestion

| Module | Responsibility |
| --- | --- |
| `ingest-router` | Format detection from extension, media type, and magic bytes; dispatch; uniform result envelope |
| `encoding-engine` | BOM detection, UTF-8 validation, UTF-16 pattern detection, ASCII fast path, Windows-1252 fallback |
| `text-ingest` | Paragraph and line reconstruction for plain text |
| `markdown-ingest` | GFM/CommonMark to a block tree; code blocks excluded from prose by default |
| `html-ingest` | Browser-standard HTML parse, boilerplate scoring, article extraction, byline and title recovery |
| `rtf-ingest` | Group/control-word reader with destination skipping, `\uN`/`\ucN`, `\'hh` code-page bytes, tables, and `\info` metadata |
| `docx-ingest` | WordprocessingML reader: styles and heading hierarchy, runs and direct formatting, tables, footnotes/endnotes, hyperlinks, core properties |
| `epub-ingest` | OCF container, package document metadata, manifest/spine order, EPUB 3 nav document and EPUB 2 NCX, cover image, per-chapter XHTML |
| `pdf-ingest` | Page text extraction with geometry-based paragraph/heading reconstruction, embedded outline, document metadata, per-page character diagnostics |
| `segmentation-engine` | Canonical document model: chapters, paragraphs, sentences, tokens, character offsets, speaking/reading estimates |

### Reading

| Module | Responsibility |
| --- | --- |
| `orp-engine` | Optimal recognition point index for a token, focal anchor geometry, chunk anchoring |
| `rsvp-engine` | Frame construction for 1–5 word chunks, per-frame durations, navigation (word/sentence/paragraph/percent), progress |
| `pacing-engine` | Punctuation multipliers, word-length and syllable compensators, ramp-up schedules, target-ceiling handling |
| `typography-engine` | Anchor-Weight Typography: fixation ratios, per-word anchor segmentation, never-bold-everything rules |
| `gradient-engine` | Trail-Gradient Text: hue interpolation across lines/words with contrast-safe lightness |
| `palette-engine` | 15+ reading themes with computed contrast ratios and per-theme typography defaults |
| `syllable-engine` | Syllable estimation, Flesch reading ease, Flesch–Kincaid grade, Gunning fog, complex-word ratio |
| `speech-engine` | Platform speech synthesis with word-boundary synchronisation and estimated-timing fallback |
| `metronome-engine` | Web Audio tick generator for subvocalisation suppression drills |
| `drill-engine` | Tachistoscopic flash drills, peripheral span drills, and deterministic cloze/vocabulary retention drills |
| `session-engine` | Live session accounting: words, elapsed, gross WPM, remaining time, pace samples |
| `analytics-engine` | Session history aggregation, streaks, velocity series, comprehension correlation |
| `vocabulary-engine` | Difficulty scoring, weak-word bank, flashcard scheduling, distractor generation |

### Persistence and export

| Module | Responsibility |
| --- | --- |
| `sightline-store` | IndexedDB schema for documents, progress, sessions, vocabulary, annotations, settings; in-memory fallback; quota reporting |
| `metadata-studio` | Export metadata model and validation: title, author, description, tags, category, language, rights, publication date, reading level, identifiers, and OpenGraph/social card tags |
| `export-html` | Standalone reading HTML with embedded theme CSS and social/meta tags |
| `export-pdf` | Vector PDF through `pdf-lib` with anchor-weight runs and per-line gradient colouring |
| `export-epub` | EPUB 3.3-shaped archive through `jszip` including nav document, NCX fallback, and metadata |
| `export-docx` | WordprocessingML through `docx` with headings, bold anchors, tables, and core/custom properties |
| `export-plan` | Reading-plan and session/vocabulary JSON; CSV analytics through `papaparse` |

## Functional feature ledger

F1–F35 below are the accepted scope. A feature is complete only when it is reachable through the interface, does real work, and is covered by focused validation.

### Document ingestion and multi-format parsing

1. **F1 Universal PDF stream extractor** — page text with geometry-derived paragraph and heading reconstruction, embedded outline, document metadata, and per-page extraction diagnostics.
2. **F2 EPUB decompiler and reader** — OCF container, package metadata, spine order, EPUB 3 nav or EPUB 2 NCX, cover art, per-chapter text.
3. **F3 DOCX normaliser** — headings from style hierarchy, body paragraphs, tables, footnotes/endnotes, hyperlinks, core metadata.
4. **F4 Markdown and semantic HTML ingest** — GFM/CommonMark blocks and browser-standard HTML with boilerplate stripping, title, and byline recovery.
5. **F5 Raw text and RTF transcoder** — encoding detection plus an RTF reader with destination skipping, Unicode escapes, code-page bytes, tables, and document info.
6. **F6 Clipboard and drag-and-drop ingestion** — full-surface drop zone, multi-file selection, paste capture, and a sample library.
7. **F7 Document table of contents and chapter navigator** — interactive tree with per-chapter word counts and jump-to-chapter.

### Core speed-reading presentation engines

8. **F8 ORP RSVP engine** — optimal recognition point alignment inside a fixed focal box with guide reticle.
9. **F9 Multi-word lexical chunking** — 1–5 words per frame with chunk anchoring and phrase-aware boundaries.
10. **F10 Anchor-Weight Typography** — fixation-weight weighting of word onsets across full-page layouts with configurable ratio and morphology rules.
11. **F11 Trail-Gradient Text** — line-to-line spectral gradient with contrast-safe sampling.
12. **F12 Fluid pacer bar (page mode)** — moving highlight and line cursor at a selectable WPM velocity with regressions allowed.
13. **F13 Tachistoscopic flash drills** — word, digit, and phrase flashes with configurable exposure and answer capture.
14. **F14 Peripheral span drills** — multi-column, expanding-span presentation with scoring.

### Pacing, rhythm, and cognitive controls

15. **F15 Punctuation and boundary pauser** — multipliers for commas, clause marks, sentence ends, and paragraph breaks, with editable values.
16. **F16 Word-length and complexity compensator** — display time scaled by character count and estimated syllables.
17. **F17 Velocity ramp-up trainer** — scheduled acceleration to a target ceiling with step size and interval controls.
18. **F18 Instant rewind and sentence scrubber** — rewind by word, sentence, paragraph, chapter, and percent, from keyboard or interface.
19. **F19 Subvocalisation metronome** — Web Audio tick from 40 to 400 BPM with accent and subdivision control.
20. **F20 Synchronised speech pacing** — platform speech synthesis driving the visual position, with boundary-event sync and an estimated-timing fallback.

### Visual ergonomics, themes, and accessibility

21. **F21 Legibility-first typography** — OpenDyslexic, Atkinson Hyperlegible, Lexend Deca, Inter, JetBrains Mono, and a serif stack, with letter-spacing, weight, and line-height controls.
22. **F22 Focal anchor customiser** — crosshair, reticle, vertical guide, and accent colour controls.
23. **F23 15+ reading themes** — high-contrast black/white, OLED true black, sepia parchment, Solarized light/dark, Nord, and others, each with computed contrast.
24. **F24 Layout and viewport calibrator** — reading width, focal box scale, font size, margins, and mobile-safe defaults.

### Comprehension, retention, and analytics

25. **F25 Live WPM and time-remaining counter** — gross WPM, elapsed time, words read, and projected completion.
26. **F26 Cloze and retention drills** — deterministic fill-in-the-blank and recall drills generated from the document's own sentences.
27. **F27 Local reading data warehouse** — IndexedDB session history, streaks, velocity progression, and per-document records.
28. **F28 Weak-word bank and flashcard vault** — one-click word capture during reading with a study deck and spaced-repetition state.

### Annotation, bookmarking, and state persistence

29. **F29 Bookmark and auto-resume** — exact word and character index saved per document and restored across reloads.
30. **F30 Non-destructive annotations** — highlights and notes anchored to token ranges, exportable alongside the text.

### Export, metadata, and publishing

31. **F31 Fixation-weighted document export** — anchor-weight formatting in HTML, PDF, EPUB, DOCX, and Markdown exports.
32. **F32 Gradient-styled export** — Trail-Gradient styling in HTML and PDF, print-safe.
33. **F33 Analytics and vocabulary export** — CSV and JSON for sessions, vocabulary, and comprehension results.
34. **F34 Metadata and OpenGraph studio** — editable document title, author, description, tags, category, reading level, rights, and social card tags applied to every export.
35. **F35 Offline PWA operation** — installable, offline-capable, no remote network dependency in any engine.

## Evidence basis for reader-facing claims

Reader-facing wording is limited to statements supported by published reading research and by the platform specifications the implementation targets:

- Silent reading rate for adult English non-fiction averages roughly 240 words per minute, with a wide spread; comprehension declines as presentation rate is pushed well beyond a reader's own pace, and RSVP removes preview and regression repair. Sources: Rayner, Schotter, Masson, Potter & Treiman, *So Much to Read, So Little Time*, Psychological Science in the Public Interest 17(1), 2016; Brysbaert, *How many words do we read per minute?*, Journal of Memory and Language, 2019.
- Speech synthesis events and availability follow the Web Speech API definition used by the browser vendors; word-boundary events are not uniformly implemented, so the fallback path exists.
- Format handling follows the published specifications: ISO 32000 for PDF, EPUB 3.3 (W3C Recommendation) for EPUB with backwards compatibility for the EPUB 2 NCX, ECMA-376 / ISO-IEC 29500 WordprocessingML for DOCX, and the Microsoft RTF specification for RTF.

The tool never claims clinical, diagnostic, or educational-outcome results, and it does not present itself as treatment for any reading or attention condition.

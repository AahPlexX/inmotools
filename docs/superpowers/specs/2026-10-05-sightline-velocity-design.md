---
tool: sightline-velocity
folder: src/tools/sightline
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-sightline-velocity-design.md
tracker: src/tools/sightline/TRACKER.md
updated: 2026-10-05
---

# Sightline Velocity Studio — spec

As built at `origin/main` `6c991e75`. Requirement prefix: `SLV`. Status of each requirement: [TRACKER.md](../../../src/tools/sightline/TRACKER.md). History: [2026-09-15-sightline-velocity-design.md](2026-09-15-sightline-velocity-design.md) (ledger F1–F35, capability limits, naming and marks), plan [2026-09-15-sightline-velocity.md](../plans/2026-09-15-sightline-velocity.md), [README.md](../../../src/tools/sightline/README.md), [changelog.md](../../../src/tools/sightline/changelog.md). Former IDs F1–F35 are given as "(formerly F…)".

## Purpose

Turn a document in an everyday format into a paced reading session in the browser — one word or phrase at a time, a paced full page, peripheral columns or flash drills — measure the session, and export the text with reading treatments, for general readers, students, professionals and researchers.

## Scope

In scope:
- Ingestion of PDF, EPUB, DOCX, Markdown, HTML, RTF and plain text from files, drops, paste and the clipboard.
- Reading engines (ORP RSVP, chunked stream, full page with pacer, peripheral columns, flash drills), pacing, speech and metronome.
- Typography, themes, annotations, word bank, cloze drills, local analytics, exports and metadata.

Out of scope:
- OCR of image-only PDFs, conversion of Word equations and revision history (capability limits in the 2026-09-15 design).

## Constraints

- Platform rules: no accounts or authentication; no server or server-side database (static files on GitHub Pages); everything runs in the browser and reading data stays in this browser (IndexedDB, localStorage); network use only for the site's own files ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- No large language models; other ML only on the device under the ML ruleset.
- Speech uses only the platform speech synthesiser; voices that send text to a server do not keep data on the device.
- Browsers coarsen timers: timing is stated to millisecond precision.
- Capabilities are named descriptively (Anchor-Weight Typography, Trail-Gradient Text, ORP RSVP); commercial reading marks are not used (2026-09-15 design, "Naming and marks").
- Libraries as in `package.json` (pdf.js, `pdf-lib`, `jszip`, `docx`, `papaparse`). Storage keys, state version and export formats are not changed.

## Requirements

### Ingestion

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SLV-R01 | PDF text is extracted page by page with geometry-based line, column, paragraph and heading reconstruction, the embedded outline as chapters, document metadata and per-page character counts that expose image-only pages (formerly F1) | A two-column PDF reads column by column; a thin page is reported |
| SLV-R02 | EPUB is read from its container, package metadata and spine order with EPUB 3 navigation or the EPUB 2 NCX, cover image and per-chapter text (formerly F2) | Chapters follow the spine with navigation titles |
| SLV-R03 | DOCX is read with headings from styles, paragraphs, tables, footnotes and endnotes, hyperlinks, accepted tracked changes and core properties (formerly F3) | Styled headings become chapters; tables become pipe rows |
| SLV-R04 | Markdown (GFM/CommonMark with front matter) and HTML are read; HTML is reduced to its article in a reader view, stripping navigation, header, footer and sidebar and recovering title, author and description (formerly F4) | Pasted HTML reads without its navigation; Markdown headings become sections |
| SLV-R05 | Plain text and RTF are read with encoding detection (BOM, UTF-8, UTF-16, ASCII, Windows-1252) and an RTF reader handling destinations, Unicode and code-page escapes, tables and document info (formerly F5) | Windows-1252 bytes decode to smart quotes; RTF font tables do not leak into the text |
| SLV-R06 | Documents enter by multi-file picker, a drop anywhere on the workspace, pasted text in a chosen format, the clipboard, or a built-in sample library (formerly F6) | Two files open with the second active; a dropped file opens |
| SLV-R07 | The file format is detected from extension and leading bytes; unsupported or binary files are refused with a clear message | A random binary file reports why it cannot be read |
| SLV-R08 | A prose-only option excludes code and table blocks; an include-footnotes option adds note bodies to the stream | Prose only drops a code block from the reading stream |
| SLV-R09 | Very large documents are bounded: processing stops at a token guard and the excluded content is reported | A document beyond the guard reports the truncation and the processing time stays bounded |
| SLV-R10 | A table of contents lists chapters with word counts and jumps to the chosen chapter (formerly F7) | Go on the second section moves the position |
| SLV-R11 | The document shows words, sentences, reading and speaking time, Flesch reading ease, Flesch–Kincaid grade and Gunning fog, labelled as estimates | Formula values match the published formulas |
| SLV-R12 | A multi-document library keeps opened documents in this browser so any of them can be reopened later with its position | After a reload the library lists earlier documents and opens one at its saved word |

### Reading engines

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SLV-R13 | ORP RSVP shows one word at a time with its optimal recognition point held on a fixed anchor in a focal box (formerly F8) | The anchor letter stays at the same screen position across words |
| SLV-R14 | The chunked stream shows 1–5 words per frame, anchored on the widest word and never spanning two sentences (formerly F9) | Width 3 gives three-word frames that stop at a sentence end |
| SLV-R15 | Anchor-Weight Typography weights word onsets by a configurable fraction and level without bolding punctuation (formerly F10) | Level 5 marks page tokens as strong; punctuation stays unstressed |
| SLV-R16 | Trail-Gradient Text colours each line as a complete perceptual gradient sweep with contrast reported per stop (formerly F11) | Each line starts and ends on the palette stops |
| SLV-R17 | The full-page engine moves a pacer (bar, underline or window) at the selected rate, gliding within a line and jumping at a line break, and can mark the current word (formerly F12) | Pacer is visible and follows the paced word |
| SLV-R18 | Flash drills flash words, digits or phrases for a configurable exposure with a seeded deterministic plan, repeats and recall scoring (formerly F13) | Five flashes run and the result reports recognised words and rate |
| SLV-R19 | Peripheral columns present several symmetric columns at once with measured eccentricity and advice when the spread is past useful range (formerly F14) | Four columns lay out inside the viewport with an eccentricity note |
| SLV-R20 | Playback controls read, pause, step one word, jump 25 words and pause on Escape, from buttons and keys | Space starts and pauses; ArrowRight steps one word |

### Pacing and audio

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SLV-R21 | The reading rate is set from 40 to 1,600 words per minute by slider, preset steps and the `[` `]` keys | Preset 450 sets the slider to 450; 5,000 is clamped |
| SLV-R22 | Pauses at commas, clause marks, sentence ends, paragraph and chapter breaks use editable multipliers (formerly F15) | Raising the sentence multiplier lengthens sentence-end frames |
| SLV-R23 | Display time is scaled by word length, optionally by estimated syllables (formerly F16) | A long word stays on screen longer than a short one |
| SLV-R24 | A warm-up ramp raises the rate in steps at an interval up to a target ceiling (formerly F17) | The rate rises by the step and stops at the ceiling |
| SLV-R25 | Rewind and scrub by word, sentence, paragraph, chapter and percent from keys and the scrubber (formerly F18) | Scrubbing to the middle shows the middle word; `r` rewinds a sentence |
| SLV-R26 | A Web Audio metronome ticks from 40 to 400 BPM with accents, or as a visual beat only (formerly F19) | Accent falls every N beats; visual-only mode creates no audio context |
| SLV-R27 | Speech synthesis reads the text aloud and drives the visual position by word-boundary events, with an estimated-timing fallback that the interface names (formerly F20) | Speaking highlights the spoken word |
| SLV-R28 | Speech offers only on-device voices (`localService`), so the text is never sent to a speech server | A voice with `localService` false is not offered or used |
| SLV-R29 | Each rate band shows an evidence note on comprehension, the limits are stated instead of a speed multiplier, and a finished session suggests the next rate only when the target was met | Rate note is shown; a session below target does not suggest a higher rate |

### Appearance

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SLV-R30 | Legibility typefaces (OpenDyslexic, Atkinson Hyperlegible, Lexend Deca, Inter, JetBrains Mono, serif and system stacks) with letter spacing, word spacing, line height and a dyslexia-spacing option (formerly F21) | Choosing Lexend changes the reading font; dyslexia spacing widens spacing |
| SLV-R31 | The focal anchor marker (none, crosshair, reticle, brackets, dot, focus box) and anchor accent colour can be chosen; the crosshair gives a guide line through the anchor (formerly F22) | Crosshair draws lines through the anchor position |
| SLV-R32 | More than 15 reading themes, including sepia, OLED black and a high-contrast pair, each with its measured body-text contrast (formerly F23) | Every theme meets 4.5:1; OLED changes the surface background |
| SLV-R33 | Layout calibration sets text size, reading width, focal box size and margins with mobile-safe defaults (formerly F24) | Changing focal box size resizes the box |
| SLV-R34 | A reduced-motion setting turns off pacer glides and smooth scrolling | With reduced motion the pacer jumps instead of gliding |
| SLV-R35 | Vocabulary difficulty highlighting marks hard or rare words in the text | Rare words are visibly marked in page mode |
| SLV-R36 | A full-screen focus mode shows only the reading stage | Focus mode fills the screen; Escape leaves it |
| SLV-R37 | Touch gestures on the stage: tap to read or pause, swipe to step or rewind | A left swipe steps back one word |

### Comprehension and analytics

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SLV-R38 | A live counter shows measured words per minute (excluding paused time), elapsed time, words read and time remaining (formerly F25) | Rate is above zero after reading; paused time is excluded |
| SLV-R39 | Cloze and retention drills are built deterministically from the document's own sentences with plausible distractors (formerly F26) | Build a cloze drill shows items with a blank |
| SLV-R40 | Session history, streaks, velocity by day and per-document records are kept in IndexedDB (formerly F27) | A read session appears in Sessions |
| SLV-R41 | A weak-word bank collects slow or marked words and studies them with spaced repetition (formerly F28) | Marking a word adds it; Knew it lengthens its interval |
| SLV-R42 | Clearing local history and the word bank needs an explicit confirmation that names what is removed | Clear shows a confirmation listing sessions, document history and word bank |
| SLV-R43 | Redundant-word pruning drops filler words from the reading stream on request | With pruning on, listed filler words are skipped |

### Bookmarks and annotations

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SLV-R44 | Bookmarks keep the exact word per document and the position is restored across reloads (formerly F29) | `b` adds a bookmark; reopening resumes at the saved word |
| SLV-R45 | Highlights and margin notes are anchored to token ranges and never stack colours (formerly F30) | Highlight this sentence and Save note appear in the marks list |
| SLV-R46 | Reader state (settings, bookmarks, highlights, notes, progress) exports and re-imports as a versioned JSON file; an unusable file leaves the state unchanged | Exported state re-imports with version 1 |

### Export

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SLV-R47 | Anchor-weighted exports in HTML, PDF, EPUB, DOCX and Markdown (formerly F31) | Downloads carry `<b>`, `<w:b/>` and valid PDF/EPUB bytes |
| SLV-R48 | Trail-gradient exports in HTML, PDF and EPUB, print-safe (formerly F32) | Gradient HTML carries inline colours |
| SLV-R49 | Markdown with front matter and plain-text exports | Markdown has the title in front matter; text has the prose |
| SLV-R50 | Sessions, vocabulary and comprehension results export as CSV and JSON (formerly F33) | Analytics CSV has the documented header |
| SLV-R51 | A metadata studio edits title, author, description, tags, category, reading level, rights and social card tags applied to every export (formerly F34) | Title sets the export file name; og:title is listed |
| SLV-R52 | The tool is installable and works offline; no engine needs the network (formerly F35) | With the network off after install, a document opens and reads |

### Prohibited

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SLV-R53 | "Bionic Reading" mode: bolding the first half of each word under that method | — |
| SLV-R54 | Quiz questions generated from the text by a language model | — |
| SLV-R55 | Opening web pages by URL through a CORS proxy | — |

## Non-functional requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| SLV-R56 | Every control is reachable and operable from the keyboard with a visible focus ring | Tabbing reaches the stage and controls; focus outline is visible |
| SLV-R57 | No horizontal overflow and controls usable from 320 px to 2560 px wide; type scales with the viewport | Page scroll width equals client width at 320, 375, 768, 1024, 1440, 1920 and 2560 px |
| SLV-R58 | No serious or critical axe violations in the workspace | Axe sweep across every panel and engine |
| SLV-R59 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) and passes the colour-contrast check in dark | `E2E_THEME=dark` accessibility run passes for this route |

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Technique decisions

None: no function was compared between an ML and a non-ML method.

## Intent not recorded

- SLV-R15 and SLV-R53: the owner notes prohibit bolding the first half of each word (BRCG Casutt GmbH mark, USPTO 5557651, stated patent); SLV-R15 Anchor-Weight Typography, built 2026-09-15 under its own name and parameters, weights word onsets in a similar way. Whether SLV-R15 stays or becomes `prohibited` is for the owner.
- SLV-R12: whether the library stores the full text of opened documents (storage quota) or only their identity and position is not recorded; the requirement assumes full text.
- SLV-R32 and SLV-R59: the workspace has its own reading themes beside the site-wide theme; how the two combine is not recorded.

## Change log

- 2026-10-05 — Created as an as-built spec from `src/tools/sightline/`, its tests, the 2026-09-15 design ledger and [owner-feature-notes-2026-10-05.md](../../research/owner-feature-notes-2026-10-05.md).

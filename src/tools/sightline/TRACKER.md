---
tool: sightline-velocity
folder: src/tools/sightline
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-sightline-velocity-design.md
tracker: src/tools/sightline/TRACKER.md
updated: 2026-10-05
---

# Sightline Velocity Studio — tracker

## Resume here

59 requirements: 42 verified, 2 implemented, 7 partial, 5 missing, 3 prohibited; SLV-R26 and SLV-R27 await physical testing by human. Next action: SLV-R28 (on-device voices only), then SLV-R12 (document library) and the other missing rows in Open work. Owner question open on SLV-R15 (spec, Intent not recorded).

## Documents

- Spec: [2026-10-05-sightline-velocity-design.md](../../../docs/superpowers/specs/2026-10-05-sightline-velocity-design.md)
- Older design and plan (history): [2026-09-15-sightline-velocity-design.md](../../../docs/superpowers/specs/2026-09-15-sightline-velocity-design.md), [2026-09-15-sightline-velocity.md](../../../docs/superpowers/plans/2026-09-15-sightline-velocity.md)
- Maintenance notes: [README.md](README.md), [changelog.md](changelog.md)
- Owner notes: [owner-feature-notes-2026-10-05.md](../../../docs/research/owner-feature-notes-2026-10-05.md)
- Dark-theme contrast task: [T-repository-dark-contrast-20261004-b7d2](../../../.tasks/items/T-repository-dark-contrast-20261004-b7d2.md)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/sightline-*.test.ts(x)`; browser tests: `tests/e2e/sightline.spec.ts`

## Requirement status

`unit` = `tests/unit/sightline-*.test.ts(x)`; `e2e` = `tests/e2e/sightline.spec.ts`.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| SLV-R01 | verified | unit "splits a two-column page into left and right flows", "uses the outline for chapters and keeps them out of the reading stream", "records a per-page character count so thin pages can be reported", "copies information-dictionary metadata into the model metadata" | |
| SLV-R02 | verified | unit "reads chapters in spine order and uses the navigation titles", "falls back to the NCX when no navigation document is usable", "extracts the cover image declared by the manifest" | |
| SLV-R03 | verified | unit "resolves headings from the paragraph style reference", "excludes tracked deletions from the accepted text", "includes footnote bodies as note blocks", "reads core properties into export metadata" | |
| SLV-R04 | verified | unit "strips navigation, header, footer, and sidebar boilerplate", "recovers the title, author, and description from meta tags", "reads front matter into metadata fields"; e2e "pasted text is read through the chosen markup dialect" | |
| SLV-R05 | verified | unit "falls back to Windows-1252 for bytes that are not valid UTF-8", "recognises UTF-16 little-endian from its byte-order mark", "skips ignorable destinations entirely", "does not emit font and colour table contents into the text" | |
| SLV-R06 | verified | e2e "source ingestion supports multiple files and full-workspace drops", "the clipboard is offered as an ingestion path", "the sample library offers more than one built-in reading" | |
| SLV-R07 | verified | unit "detects formats from their leading bytes", "refuses binary or unrelated file types with a clear message" | |
| SLV-R08 | verified | unit "filters code and table blocks in prose-only mode", "excludes footnote bodies unless notes are requested" | |
| SLV-R09 | partial | unit "truncates at the token guard and says so" | The guard bounds token creation only, not ingestion work or retained text (README "Acceptance and remaining work") |
| SLV-R10 | verified | e2e "the sample passage is ingested, measured, and offered as sections"; unit "remaps chapter starts after filtering code, notes, and empty paragraphs" | |
| SLV-R11 | verified | unit "computes the Flesch reading ease formula exactly", "computes the Flesch-Kincaid grade and Gunning fog formulas exactly", "derives minutes from the published reading and speaking rates" | |
| SLV-R12 | partial | e2e "source ingestion supports multiple files and full-workspace drops" | Opened documents are switchable (`sightline-document-switcher`) only until reload; per-document progress is kept, document text is not stored |
| SLV-R13 | verified | unit "walks the published break table outwards with word length", "holds the anchor left of the box centre and scales with the box"; e2e "each presentation engine draws its own surface" | |
| SLV-R14 | verified | unit "groups words into chunks of the requested width", "never spans two sentences", "anchors the widest word of the chunk" | |
| SLV-R15 | verified | unit "takes the configured fraction of a word as the heavy segment", "never puts punctuation in the heavy segment"; e2e "themes, type, and trail settings reach the reading surface" | Owner question: see spec, Intent not recorded |
| SLV-R16 | verified | unit "interpolates in a perceptual space rather than blending raw channels", "keeps every line a complete sweep whatever its length", "reports contrast for every stop against the background" | |
| SLV-R17 | verified | unit "glides between words on the same line and jumps at a line break", "holds the paced line at the anchor fraction of the viewport"; e2e "each presentation engine draws its own surface" | |
| SLV-R18 | verified | unit "produces a deterministic plan for a seed", "scores recall separately for repeated and first-seen items"; e2e "each presentation engine draws its own surface" | |
| SLV-R19 | verified | unit "lays columns out symmetrically about the centre", "advises when the spread is past useful peripheral range" | |
| SLV-R20 | verified | e2e "keyboard control plays, steps, and bookmarks without a mouse", "the clock advances the words and reports a measured rate" | |
| SLV-R21 | verified | unit "clamps nonsense rates into a usable band"; e2e "pacing controls change the plan and the rate note" | |
| SLV-R22 | verified | unit "applies the configured multipliers at each boundary kind", "turns boundary multipliers into pause milliseconds" | |
| SLV-R23 | verified | unit "stretches long words and shortens very short ones", "compensates by syllable count when asked" | |
| SLV-R24 | verified | unit "ramps the rate in steps and stops at the ceiling" | |
| SLV-R25 | verified | e2e "the clock advances the words and reports a measured rate"; unit "finds the frame at a point in time and the time left after it" | |
| SLV-R26 | partial | unit "converts beats per minute to an interval", "places accents every bar and nowhere else", "builds an audio click schedule with quieter non-accented beats", "avoids audio allocation for a visual-only metronome and releases browser resources" | [awaiting physical testing by human] Enable the metronome at 120 BPM with accent 4 on a desktop browser with speakers; expected: audible clicks, every fourth louder |
| SLV-R27 | partial | unit "splits the stream into sentence-sized utterances", "maps a boundary offset onto the token to highlight", "chooses a voice by language, then by preferred name" | [awaiting physical testing by human] Turn on synchronised speech in Chrome and Safari with a local voice; expected: the spoken word is highlighted, and the fallback note shows where boundary events are missing |
| SLV-R28 | missing | — | `chooseVoice` selects from every platform voice; `localService` is not checked |
| SLV-R29 | verified | unit "offers rate steps with an evidence note for each band", "suggests a higher rate only when the target was met", "states the limits instead of promising a multiplier" | |
| SLV-R30 | verified | unit "offers the accessibility typefaces and the named display fonts", "widens letter and word spacing when dyslexia spacing is on"; e2e "themes, type, and trail settings reach the reading surface" | |
| SLV-R31 | verified | unit "offers crosshair and reticle focal markers" | |
| SLV-R32 | verified | unit "provides more than fifteen themes with distinct identifiers", "includes an OLED true black theme and a high-contrast pair", "meets AA contrast for every theme body text" | |
| SLV-R33 | partial | unit "scales the font size within a sane band" | Text size, spacing and peripheral column measure exist; no reading-width, focal-box-size or margin control for the RSVP stage |
| SLV-R34 | implemented | `appearance.reduceMotion` in `SightlineWorkspace.tsx` and `SightlinePanels.tsx` | |
| SLV-R35 | missing | — | |
| SLV-R36 | missing | — | |
| SLV-R37 | missing | — | |
| SLV-R38 | verified | unit "excludes paused time from the measured rate", "reports progress, the rate, and the time left"; e2e "the clock advances the words and reports a measured rate" | |
| SLV-R39 | verified | unit "builds a cloze item from the sentence that contains the word", "picks plausible distractors and never the answer itself"; e2e "the word bank collects a marked word and builds a cloze drill" | |
| SLV-R40 | verified | unit "counts consecutive reading days", "summarises the whole warehouse including the median"; e2e "a reading session is recorded and exported as analytics" | |
| SLV-R41 | verified | unit "always collects words the reader marked", "lengthens the interval after a correct answer and resets after a miss"; e2e "the word bank collects a marked word and builds a cloze drill" | |
| SLV-R42 | verified | e2e "clearing local data requires explicit confirmation and names everything it removes" | |
| SLV-R43 | missing | — | |
| SLV-R44 | verified | unit "keeps one bookmark per position and sorts them", "scopes state to a document fingerprint", "keeps one progress record per document, newest first" | |
| SLV-R45 | verified | e2e "highlights and margin notes are kept against the word"; unit "replaces overlapping highlights so colours never stack" | |
| SLV-R46 | verified | e2e "reader state survives an export and import round trip"; unit "keeps the current state when an import file is unusable" | |
| SLV-R47 | verified | e2e "every document export downloads, and the bytes carry the treatment" | |
| SLV-R48 | verified | e2e "every document export downloads, and the bytes carry the treatment"; unit "colours words from the palette when the gradient is on" | |
| SLV-R49 | verified | unit "exports Markdown with front matter and plain text" | |
| SLV-R50 | verified | e2e "a reading session is recorded and exported as analytics"; unit "writes vocabulary rows and a JSON payload" | |
| SLV-R51 | verified | e2e "metadata, tags, and social fields are edited at export time"; unit "builds social tags, JSON-LD, and Dublin Core entries" | |
| SLV-R52 | implemented | Site PWA (`vite.config.ts`); PDF worker and reading fonts precached (plan, Risks) | No offline test for this route |
| SLV-R53 | prohibited | — | Registered trademark of BRCG Casutt GmbH (USPTO 5557651) with a stated patent (third-party terms) |
| SLV-R54 | prohibited | — | Needs a large language model |
| SLV-R55 | prohibited | — | A CORS proxy is a server (platform rule: no server); direct requests to sites that allow CORS are not affected |
| SLV-R56 | verified | e2e "every control is reachable and operable from the keyboard alone" | |
| SLV-R57 | partial | e2e "stays usable without overflow at <name>" | Tested at 390, 900 and 1440 px; 320, 375, 768, 1024, 1920 and 2560 px not tested |
| SLV-R58 | verified | e2e "the workspace passes an automated accessibility sweep" | |
| SLV-R59 | partial | — | Site theme selector exists; the workspace fails `color-contrast` in dark (T-repository-dark-contrast-20261004-b7d2) |

## Open work

1. SLV-R28 on-device voices only.
2. SLV-R12 document library; SLV-R09 bounded ingestion of large documents.
3. SLV-R33 reading width, focal box size and margins; SLV-R36 full-screen focus mode; SLV-R37 touch gestures.
4. SLV-R35 difficulty highlighting; SLV-R43 redundant-word pruning.
5. SLV-R59 dark-theme contrast; SLV-R57 remaining widths.
6. Tests for SLV-R34 and SLV-R52; physical checks for SLV-R26 and SLV-R27.

## Known limitations

- No OCR: image-only PDFs yield little text and are reported per page.
- EPUB export is structural, not EPUBCheck-certified.
- Syllable and readability values are English-orthography estimates.

## Verification evidence

- 2026-10-05, `expand/sightline-velocity` from `main` @ `6c991e75`: `pnpm tool:check sightline-velocity --base origin/main` 45/59, no errors; `pnpm docs:sync` and `pnpm docs:check` passed; `pnpm exec vitest run tests/unit/cad-progress.test.ts tests/unit/sheets-wave-b.test.ts tests/unit/deployment-config.test.ts` 23 passed.

## Change log

- 2026-10-05 — Created per `docs/DOCUMENTATION_STANDARD.md`.

---
tool: typing-workstation
folder: src/tools/typing
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-typing-workstation-design.md
tracker: src/tools/typing/TRACKER.md
updated: 2026-10-05
---

# Typing Workstation — spec

As built at `origin/main` `6c991e75`. Requirement prefix: `TYP`. Status of each requirement: [TRACKER.md](../../../src/tools/typing/TRACKER.md). History: plan [2026-09-15-typing-workstation.md](../plans/2026-09-15-typing-workstation.md) (47-function ledger F1–F47), [2026-09-25-typing-session-profiles-design.md](2026-09-25-typing-session-profiles-design.md) and its [plan](../plans/2026-09-25-typing-session-profiles.md) (F39–F47), [2026-09-30-typing-ux-elevation.md](../plans/2026-09-30-typing-ux-elevation.md) and [typing-ux-audit-2026-09-30.md](../../typing-ux-audit-2026-09-30.md) (UX-01–UX-15). Former IDs F1–F47 are given as "(formerly F…)".

## Purpose

Measure typing speed and accuracy and train touch typing in the browser, with analytics, specialised practice texts, local typist profiles and exports, for children, the general public, transcriptionists and software engineers.

## Scope

In scope:
- Timed, word-count, quote, Zen and certification tests; correction modes; specialised corpora; custom text.
- Keyboard heatmap, finger guide, per-key and n-gram analytics, weak-key drills, ghost and pacer.
- Local history, profiles, charts, exports (CSV, JSON, keystrokes, Markdown, PDF certificate) and imports.

Out of scope:
- Online multiplayer races and shared leaderboards: they need a server and accounts (platform rules); not recorded as requirements.

## Constraints

- Platform rules: no accounts or authentication; no server or server-side database (static files on GitHub Pages); everything runs in the browser and data stays in this browser (IndexedDB via Dexie, localStorage); network use only for the site's own files ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- No large language models; other ML only on the device under the ML ruleset.
- Browsers coarsen timers: timing is stated to millisecond precision (`performance.now()`).
- Libraries as pinned in `package.json` (`chart.js` 4.5.1, `dexie` 4.4.6, `canvas-confetti` 1.9.4, `papaparse` 5.7.0, `jspdf` 4.2.1, self-hosted `@fontsource` fonts). The ranked English corpus is bundled from FrequencyWords ([THIRD_PARTY_NOTICES.md](../../../src/tools/typing/THIRD_PARTY_NOTICES.md)); no corpus is fetched at runtime.
- Storage schema, export formats, shortcuts (Esc, F2, Tab) and accessible names are not changed.

## Architecture and engine

- Engines and libraries: `dexie@4.4.6` stores results and settings; `chart.js@4.5.1` draws the WPM and history charts; `jspdf@4.2.1` writes the PDF report; `papaparse@5.7.0` writes CSV; `canvas-confetti@1.9.4` plays the celebration effect; `@fontsource/jetbrains-mono@5.3.0`, `@fontsource/fira-code@5.3.0`, `@fontsource/roboto-mono@5.3.0`, `@fontsource/atkinson-hyperlegible@5.3.0` and `@fontsource/opendyslexic@5.3.0` bundle the typing fonts.
- Workers: none.
- Storage: IndexedDB database `inmotools-typing-workstation` (Dexie) with `tests` (finished test results), `typists` (profiles), `dictionaries` (custom word lists), `preferences` (key/value) and `drills` (saved drills) stores (`typing-storage.ts`).
- Browser APIs: Web Audio `AudioContext` synthesizes key-click sounds and stays silent where it is missing; `matchMedia` reads `prefers-reduced-motion`; Canvas renders charts; Blob downloads deliver exports.
- Network: none.

## Requirements

### Engine and metrics

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TYP-R01 | Keystrokes are timed with `performance.now()` to millisecond precision (formerly F1) | Event timestamps are monotonic milliseconds |
| TYP-R02 | Gross WPM, net WPM, raw CPM and accuracy are computed from the 5-character word unit (formerly F2) | A clean run gives equal gross and net WPM and 100% accuracy |
| TYP-R03 | Test modes: time 15/30/60/120 s, word count 10/25/50/100/200, quote short/medium/long/thicc, infinite Zen and a 5-minute certification (formerly F3) | Word count 10 builds exactly ten words; Zen replenishes text |
| TYP-R04 | Six caret styles: line, block, underline, box, pulse, ghost (formerly F4) | Choosing Block changes the caret shape |
| TYP-R05 | Word lists: English Top 200, 1,000 and 5,000 plus Spanish, French, German, Italian, Portuguese and Dutch (formerly F5) | English tiers are unique and match their size; Spanish draws Spanish words |
| TYP-R06 | Correction modes: Strict, Master (sudden death on first error), Forgiving and Confidence (no Backspace) (formerly F6) | Master fails on the first error; Confidence ignores Backspace |
| TYP-R07 | Typed characters are marked correct, incorrect or pending as the typist goes | A wrong key marks the character incorrect |
| TYP-R08 | Consistency score: 100 − coefficient of variation of per-second WPM, clamped to 0–100 (formerly F11) | Even pacing scores higher than uneven pacing |
| TYP-R09 | Burst speed: the highest WPM over a short window (for example 5 s) is shown with the result | A fast stretch shows a burst above the average WPM |
| TYP-R10 | Custom time and word-count durations can be entered beside the presets | A 45 s custom test ends at 45 s |

### Analytics and keyboard

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TYP-R11 | On-screen keyboard with a press-density heatmap, per-key error markers and layouts QWERTY, Dvorak, Colemak, Workman, AZERTY, QWERTZ and BAPO (formerly F7) | Switching to Dvorak relabels keys; missed keys are marked |
| TYP-R12 | Finger guide (l5–r5 and thumb) under each key, with home-row anchors for the selected physical layout (formerly F8) | Colemak keeps the index anchors on the physical home-row keys |
| TYP-R13 | Bigram, trigram and n-gram latency tables with mean and median ms, count and accuracy (formerly F9) | Two-observation medians are the mean of the two |
| TYP-R14 | A weak-key drill builds a practice string weighted toward the lowest-accuracy keys (formerly F10) | The drill for a seed is deterministic and favours weak keys |
| TYP-R15 | Dwell time (key held) and flight time (release to next press) are measured per key and shown | Analytics list dwell and flight ms per key |
| TYP-R16 | A live chart shows net and raw WPM during the test and errors over time | Errors appear on the live chart where they occurred |

### Practice texts

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TYP-R17 | Programmer mode with snippets in JavaScript, TypeScript, Python, C++, Rust, SQL, HTML and CSS (formerly F12) | Every listed language has snippets |
| TYP-R18 | Medical transcription texts with terminology, drug names and dosage abbreviations (formerly F13) | Medical mode draws from the medical pool |
| TYP-R19 | Legal transcription texts with Latin maxims, citations and contract prose (formerly F14) | Legal mode draws from the legal pool |
| TYP-R20 | Number and symbol drills for 10-key and shifted symbols (formerly F15) | Numbers mode yields digits and symbols |
| TYP-R21 | Kids mode with short phrases, large-print controls and audio cues (formerly F16) | Kids mode draws from the kids pool |
| TYP-R22 | Custom text by paste or a CSV word list (formerly F17) | Pasted multiline text is typed to completion |
| TYP-R23 | English Top 10,000 word list | A 10,000-word tier is offered and unique |
| TYP-R24 | Punctuation and numbers can be switched on for any word list | With punctuation on, the Top 200 list contains punctuation |

### Audio

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TYP-R25 | Synthesised switch sounds: MX Blue, MX Red, MX Brown, Holy Panda, Topre, Vintage Typewriter, or off (formerly F18) | Each profile plays a distinct click |
| TYP-R26 | Distinct completion, milestone and failure cues (formerly F19) | A wrong key plays the error cue, a finish the completion cue |
| TYP-R27 | Metronome from 40 to 300 BPM for rhythm training (formerly F20) | 120 BPM ticks twice a second while running |

### Appearance and accessibility

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TYP-R28 | Fonts JetBrains Mono, Fira Code, Roboto Mono, Atkinson Hyperlegible, OpenDyslexic and System UI, self-hosted, with a font-size slider (formerly F21) | OpenDyslexic is loaded from the site's files |
| TYP-R29 | Ten themes: Light, Paper, Nord, Dracula, Gruvbox, Monokai, Matrix, Cyberpunk, OLED Black, High-Contrast, each with AA text contrast (formerly F22) | Axe colour contrast passes in every theme |
| TYP-R30 | Blur-until-focus Zen workspace and hide-stats-while-typing options (formerly F23) | With hide stats on, the stats are hidden while running |
| TYP-R31 | ARIA live announcements for start, finish, abort, save, import and export (formerly F24) | The status region announces Finished |
| TYP-R32 | Blind mode hides correctness marking while typing and reveals it in the result | In blind mode wrong characters look like correct ones until the end |
| TYP-R33 | Reduced-motion preference stops caret animation and completion confetti | With reduced motion the caret has no animation |
| TYP-R34 | Break reminders suggest a rest after a configurable period of typing | After the set minutes a rest reminder appears |

### Pacing and benchmarks

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TYP-R35 | A personal-best ghost replays the stored keystroke log on the live chart (formerly F25) | The ghost series follows the best run; Backspace removes erased progress |
| TYP-R36 | A target-WPM pacer line, adjustable from 20 to 220 WPM (formerly F26) | Pacer 80 draws a flat 80 WPM line; −20 is clamped |
| TYP-R37 | A 5-minute certification exam with fixed duration; failed, aborted or stopped attempts get no certificate (formerly F27) | A failed test offers no certificate |

### History and storage

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TYP-R38 | Saved tests, optionally with raw keystrokes, are kept in IndexedDB; malformed rows are rejected (formerly F28) | A stored test round-trips |
| TYP-R39 | History chart with rolling 10, 50 and all-time averages and an accuracy overlay; daily activity (formerly F29) | Rolling averages match the saved tests |
| TYP-R40 | Tags, tag filtering and notes at save and at export; the filter drives the table, statistics, chart and export (formerly F30) | Filtering by a tag narrows table and export alike |
| TYP-R41 | History is paged and rows can be deleted; empty history and analytics explain what will appear | 27 tests show "Rows 1–24 of 27"; an empty history shows its message |
| TYP-R42 | Settings are kept in this browser; corrupt or out-of-range settings fall back to defaults | A stored pacer of −20 loads as 20 |

### Export and import

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TYP-R43 | CSV export per test and for history, with spreadsheet formulas escaped (formerly F31) | CSV has the documented columns; `=cmd` is escaped |
| TYP-R44 | JSON export per test and for history with a schema envelope and metadata (formerly F32) | JSON envelope carries the editable meta |
| TYP-R45 | Raw keystroke CSV export (formerly F33) | Keystroke rows carry key, code and time |
| TYP-R46 | Markdown session summary export (formerly F34) | Markdown lists the result |
| TYP-R47 | PDF certificate with editable typist name, organisation, certifier, tags and notes (formerly F35) | The certificate PDF downloads |
| TYP-R48 | CSV dictionary import as a custom-text source (formerly F36) | A CSV word list becomes the target |
| TYP-R49 | JSON bundle import that merges into local history with fresh ids (formerly F37) | Re-importing an exported bundle adds rows without id collisions |
| TYP-R50 | Tags and notes are editable at export for one test and for bulk history (formerly F38) | Bulk CSV keeps the edited metadata |
| TYP-R51 | Certificate export as a PNG image | The certificate downloads as a PNG |

### Session lifecycle and profiles

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TYP-R52 | An explicit Start control, while the first typed character still starts a test (formerly F39) | Start begins timing without a keystroke |
| TYP-R53 | Pause freezes scored time and blocks typing without discarding the attempt (formerly F40) | Effective time does not move while paused |
| TYP-R54 | Resume continues from the paused cursor; paused time is excluded (formerly F41) | Result time excludes the pause |
| TYP-R55 | Stop scores a partial result (`finishReason: "stopped"`) that can be saved but is never a personal best or certificate (formerly F42) | A stopped attempt saves without a certificate |
| TYP-R56 | Reset attempt clears score, events, timer and pause state and keeps target, settings and typist (formerly F43) | After reset the state is Ready with the same text |
| TYP-R57 | Local typist profiles with a stable default and a remembered active profile (formerly F44) | Adding Alex and reloading keeps Alex active |
| TYP-R58 | Scores, history, averages, charts, personal best, imports and exports are scoped to the active typist (formerly F45) | Alex's history does not show the default typist's tests |
| TYP-R59 | Resetting one typist's scores leaves other typists, preferences, dictionaries and drills intact (formerly F46) | Reset Alex keeps the default typist's tests |
| TYP-R60 | Ready, Running, Paused and Finished states are shown; target, settings, profile and history cannot change during an attempt (formerly F47) | During a run, import, delete and profile reset are unavailable |

### Input and layout

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TYP-R61 | Typing uses native text input and composition, so software keyboards and IMEs work, and physical `KeyboardEvent.code` is kept in the log | Composition text is scored; raw log keeps `KeyA` |
| TYP-R62 | Shortcuts: F2 new text, Esc abort, Tab leaves the typing canvas | F2 replaces the passage; Tab moves focus on |
| TYP-R63 | The passage shows three lines and keeps the active line on the middle row | The caret stays inside the window for a whole test |
| TYP-R64 | The test comes first: Start and the first line are in the first viewport; one primary action; an idle "click here and start typing" cue | At 390×844 Start and the first line are visible without scrolling |
| TYP-R65 | The result dialog leads with the result, takes focus on its panel so trailing keystrokes are not typed into fields, keeps exports apart from Save and Discard, and saves only on Save | Typing after the last character puts no text in Typist name |

## Non-functional requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| TYP-R66 | No horizontal overflow and controls usable from 320 px to 2560 px wide, with no element outside the workspace | Geometry check at 320, 375, 768, 1024, 1440, 1920 and 2560 px |
| TYP-R67 | No serious or critical axe violations in the workspace | Axe at rest and in the result dialog |
| TYP-R68 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) and passes the colour-contrast check in dark | `E2E_THEME=dark` accessibility run passes for this route |
| TYP-R69 | Works offline once loaded; no network request is made by the tool | With the network off after install, a test runs and saves |

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Technique decisions

None: no function was compared between an ML and a non-ML method.

## Intent not recorded

- TYP-R29 and TYP-R68: the workspace has its own ten themes beside the site-wide theme; how the two combine is not recorded.
- TYP-R34: the default break interval is not recorded; the conservative default is a reminder after 30 minutes of typing, owner may override.
- TYP-R09: the burst window length is not recorded; 5 s is the default, owner may override.

## Change log

- 2026-10-05 — Created as an as-built spec from `src/tools/typing/`, its tests, the F1–F47 ledger, the UX audit and [owner-feature-notes-2026-10-05.md](../../research/owner-feature-notes-2026-10-05.md).

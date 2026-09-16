# Typing Workstation Implementation Plan

**Date:** 2026-09-15
**Branch:** `feature/typing-workstation`
**Design record:** this file is authoritative until a dedicated design doc is written.

## Goal

Add a local-first typing speed calculator, ergonomic touch-typing testing surface, and adaptive motor-skill training workstation to the InMo Tools catalog. The tool must be usable by children, general public, professional court reporters, medical transcriptionists, and software engineers, and must ship the entire feature ledger below without silently dropping items.

## Architecture

- New workspace under `src/tools/typing/` with an isolated engine (`typing-engine.ts`), corpora (`typing-corpora.ts` plus the generated offline `typing-english-frequency.ts` ranked corpus), duration-aware target builder (`typing-target.ts`), persistence (`typing-storage.ts` — Dexie/IndexedDB), audio synthesis (`typing-audio.ts` — Web Audio API), export module (`typing-export.ts`), scoped styles (`typing-styles.css`), and a React workspace component (`TypingWorkspace.tsx`).
- Registered via the central catalog (`src/catalog.ts`) and workspace loader (`src/tools/workspaces.tsx`), with no changes to other tools.
- All computations and persistence run in the browser. No backend, no telemetry, no network call. Optional Web Serial / Web Bluetooth is not required — the tool measures keystrokes purely via `KeyboardEvent` timings.
- The English Top 200 / Top 1,000 / Top 5,000 tiers are nested slices of a bundled 5,000-entry frequency-ranked corpus derived from the pinned FrequencyWords source documented in `src/tools/typing/THIRD_PARTY_NOTICES.md`; no corpus fetch occurs at runtime.

## Tech stack

- React 19 + TypeScript 7 + Vite 8 (existing).
- Pinned exact-version additions to `package.json`:
  - `chart.js@4.5.1` — WPM curve + rolling averages chart.
  - `dexie@4.4.6` — IndexedDB wrapper for tests, dictionaries, drills, preferences.
  - `diff@9.0.0` (with `@types/diff@8.0.0`) — character-level diff engine, retained for transcription scoring extensions.
  - `canvas-confetti@1.9.4` (with `@types/canvas-confetti@1.9.0`) — completion celebration.
  - `howler@2.2.4` (with `@types/howler@2.2.13`) — reserved for future sample-based mechanical profiles (Web Audio path used for the current synth).
  - `papaparse@5.7.0` — CSV parse/serialize for imports and history exports (already present, verified suitable).
  - `jspdf@4.2.1` — client-side vector PDF certificate generation.
  - `@fontsource/jetbrains-mono@5.3.0`, `@fontsource/fira-code@5.3.0`, `@fontsource/roboto-mono@5.3.0`, `@fontsource/atkinson-hyperlegible@5.3.0`, and `@fontsource/opendyslexic@5.3.0` — self-hosted selectable typing fonts with no CDN dependency.
- No `^` / `~` prefixes used, in line with the repo's pinned-dependency policy.

## Feature ledger

Every item below is a shipping requirement. Removal or deferral must land in `.tasks/NEXT.md` with rationale before the workstream can close.

### Core typing engine & real-time metrics
1. Sub-millisecond keystroke capture using `performance.now()` per press.
2. Gross WPM, Net WPM, and Raw CPM computed from the standard 5-character word unit.
3. Multi-mode durations: time (15/30/60/120s), word count (10/25/50/100/200), quote length (short/medium/long/thicc), infinite Zen mode, and 5-minute certification exam.
4. Six caret styles (Line, Block, Underline, Box, Pulse, Ghost).
5. Multi-lingual dictionaries (Top 200 / Top 1,000 / Top 5,000 English, plus Spanish, French, German, Italian, Portuguese, Dutch pools).
6. Four error correction modes: Strict, Master (instant fail), Forgiving (free forward movement), Confidence (backspace disabled).

### Motor-skill analytics & biometric heatmaps
7. Interactive on-screen virtual keyboard with press-density heatmap, per-key error markers, and layout switching (QWERTY, Dvorak, Colemak, Workman, AZERTY, QWERTZ, BAPO).
8. Finger allocation guide (l5..r5 + thumb) rendered under each key with an ergonomics reminder anchoring the home row.
9. Bigram, trigram, and n-gram latency tables with mean/median in ms, occurrence count, and per-gram accuracy.
10. Weak-key drill generator that mines the current session's per-key stats and builds a practice string weighted toward the lowest-accuracy keys.
11. Consistency (variance) score — 100 − coefficient of variation of per-second WPM, clamped 0..100.

### Specialized modes (Code, Legal, Medical & Kids)
12. Programmer syntax mode with curated snippets across JavaScript, TypeScript, Python, C++, Rust, SQL, HTML, CSS.
13. Medical transcription mode with heavy terminology, drug names, dosage abbreviations, and clinical prose.
14. Legal transcription mode with Latin maxims, statute citations, contract prose, and formal punctuation.
15. Number/symbol gymnastics for 10-key and shift-symbol drills.
16. Kids academy mode with short cheerful phrases, large-print typography controls, and audio cue support.
17. Custom-text ingestion (paste any prose or load a CSV word list).

### Audio synthesis & sensory feedback
18. Mechanical switch acoustic synthesizer with six profiles (MX Blue, MX Red, MX Brown, Holy Panda, Topre, Vintage Typewriter) plus Off.
19. Distinct completion, milestone, and failure audio cues.
20. Metronome (40–300 BPM) for rhythm training.

### Accessibility, visual customization & screen ergonomics
21. Dyslexia-friendly and legibility fonts: JetBrains Mono, Fira Code, Roboto Mono, Atkinson Hyperlegible, OpenDyslexic, System UI. Font-size slider.
22. Ten themes including Light, Paper, Nord, Dracula, Gruvbox, Monokai, Matrix, Cyberpunk, OLED Black, High-Contrast.
23. Blur-until-focus Zen workspace toggle and hide-stats-during-test toggle.
24. ARIA-live status announcements for start, finish, aborts, save, import, and export.

### Ghost racing, pace setting & benchmark testing
25. Personal-best deterministic ghost pacer replayed from stored keystroke logs.
26. Target-WPM pacer line (adjustable 20–220 WPM).
27. 5-minute certification exam mode with fixed duration and standardized reporting.

### Local storage, history & longitudinal analytics
28. IndexedDB (Dexie) historical data warehouse for every saved test including optional raw keystrokes.
29. Longitudinal chart with rolling 10/50/all-time averages and accuracy overlay.
30. Tagging, filtering, and per-test note editing at save and at export time.

### Exports (mandatory for every mode)
31. CSV export per-test and per-history (Papa Parse).
32. JSON export per-test and per-history with schema envelope and export metadata.
33. Raw keystroke CSV export.
34. Markdown session summary export.
35. PDF certificate export (jsPDF) with editable typist name, organization, certifier, tags, notes.
36. CSV dictionary import as a custom-text source.
37. JSON test-bundle import that merges into local history.
38. Editable tags/notes at export (both single-test and bulk history).

## Milestones

- **A. Foundation & engine — complete.** `typing-engine.ts`, exact ranked corpora, target generation, storage, audio, exports, styles, workspace UI, catalog and loader are implemented on `feature/typing-workstation`.
- **B. Focused unit tests — complete.** 50 focused tests cover engine behavior and metrics, strict/forgiving/confidence/master correction semantics, conventional n-gram median calculation, Enter-to-newline transcription, duration-family normalization and target sizing, exact unique 200/1,000/5,000 ranked English tiers, all eight promised programmer snippet languages, IndexedDB storage/import identity handling, and export envelopes/metadata.
- **C. Focused browser spec — complete.** Seven logical acceptance scenarios run on both desktop and mobile Chromium (14 checks total): multiline finite completion and JSON persistence; forgiving-mode auto-finish with retained scoring errors; history CSV/Markdown/JSON metadata plus collision-free JSON re-import; CSV dictionary ingestion plus raw-keystroke CSV and PDF certificate downloads; duration-family normalization/exact word targets/self-hosted OpenDyslexic/modal keyboard semantics; serious/critical automated accessibility scanning; and 320 CSS-pixel reflow.
- **D. Integration & Pages verification — pending.** Merge to `main` only after the user authorizes integration from this dedicated branch; then validate the exact integrated `origin/main` revision and require the Pages deployment to be green.

## Latest focused acceptance evidence

- Accepted branch revision: `1df03ebe1d0b924a3047f61075f6712fc9c09d7d` (`test(typing): verify forgiving completion in browser`).
- Core completion/analytics source revision: `63d75e0f160c6d76e1dcead13091a4949ef3603f` (`fix(typing): complete forgiving targets and correct medians [skip ci]`).
- Exact ranked English corpus source is bundled on the branch and derived from FrequencyWords commit `525f9b560de45753a5ea01069454e72e9aa541c6`; attribution and transformation details are recorded in `src/tools/typing/THIRD_PARTY_NOTICES.md`.
- Dedicated workflow run: `35122896793`, job `104884791471` (`Typing Workstation validation`).
- Frozen `pnpm install --frozen-lockfile`: passed, including repository supply-chain policy verification.
- Focused unit tests: **50/50 passed** across six Typing test files.
- Production `pnpm build`: passed.
- Playwright: **14/14 passed** across desktop Chromium and mobile Chromium.
- Browser coverage proves real Enter/newline completion, forgiving-mode traversal auto-finish with errors retained in scoring, CSV/Markdown/JSON history metadata, collision-free same-database JSON bundle merge, CSV dictionary ingestion, raw keystroke CSV download, PDF certificate download, IndexedDB persistence, duration normalization, exact word targets, bundled OpenDyslexic loading, modal keyboard semantics, no serious/critical Axe violations at rest, and no page-level horizontal overflow at 320 CSS pixels.
- The earlier repository-wide Pages baseline had unrelated workstream failures; those historical failures are not treated as Typing Workstation regression evidence. Exact-main and Pages evidence remain Milestone D.

## Non-goals / explicit exclusions

- No cloud multiplayer, no account system, no telemetry — the entire workflow is local.
- No proprietary hardware driver integration — keystroke timing uses browser `KeyboardEvent` timestamps only.
- No AI-generated copy or features anywhere in the tool.

## Validation

- `.github/workflows/typing-workstation.yml` is the focused branch gate.
- Focused Vitest coverage is convention-discovered via `tests/unit/typing-*.test.ts`, preventing new Typing unit files from being silently omitted; it verifies engine semantics/analytics, duration/target generation, exact corpus contracts, storage/import behavior, and exports without rerunning unrelated tool suites.
- `pnpm build` verifies TypeScript and the Vite production bundle.
- `tests/e2e/typing.spec.ts` runs the seven critical acceptance scenarios on both desktop and mobile Chromium, including completion/error semantics, all mandatory export families that can be deterministically inspected in-browser, import round-trips, bundled-font availability, modal keyboard semantics, accessibility, and 320 CSS-pixel reflow.
- Exact-main integration and Pages verification remain Milestone D and are intentionally not claimed from the dedicated feature branch.

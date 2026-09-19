# Typing Workstation Implementation Plan

**Date:** 2026-09-15
**Branch:** `feature/typing-workstation`
**Last audit refresh:** 2026-09-19
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
  - `canvas-confetti@1.9.4` (with `@types/canvas-confetti@1.9.0`) — completion celebration.
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
- **B. Focused unit tests — complete.** 67 focused tests across seven convention-discovered `tests/unit/typing-*.test.ts` files cover engine behavior/metrics, correction modes, Enter/newline and Backspace replay, conventional n-gram medians, duration/target sizing, exact ranked corpora, programmer languages, layout-specific finger anchors, key-sound classification, stored/imported-record validation including coherent quote/Zen families, legacy-read sanitization, personal-best identity, case-insensitive tag filtering, CSV formula escaping, certificate eligibility, exports, and custom-text normalization.
- **C. Focused browser spec — complete.** Seven logical scenarios run on desktop and mobile Chromium (14 checks total). They cover multiline completion; explicit side-effect-free result exports versus explicit Save; forgiving/master error behavior and certificate gating; filtered and paginated history; CSV/Markdown/JSON export; invalid-record import skipping plus immediate imported-PB refresh; CSV dictionary/raw-keystroke/PDF paths; corrupt-preference recovery and quote/Zen family coupling; bundled OpenDyslexic/modal semantics; Axe serious/critical accessibility; reduced-motion behavior; and 320 CSS-pixel reflow.
- **D. Integration & Pages verification — baseline integrated; current hardening pending integration.** The original Typing Workstation baseline was merged to `main` through PR #40 on 2026-09-18 (PR head `08c3916456c8a47498efe143afac84dfbde743e1`, merge commit `d5a2359084c39899ccf78324b2b55d5d0155b579`). The post-integration audit hardening accepted below remains branch-only. Integrate it scope-safely, then run the Typing gate and applicable Pages deployment on the exact resulting `main` revision before calling this follow-up deployed.

## Latest focused acceptance evidence

- **Accepted branch revision:** `468b9d5ec15bf2b595d9120b7e3820ba2f90597d` (`test(typing): require explicit save after certificate export`), whose tree includes all 2026-09-19 source hardening through `76de508e4f231cc15d25323c9ac8e8b79b144cc9`.
- **Dedicated workflow:** run `35464187569`, job `105953299929`, completed successfully on 2026-09-19. Frozen install/supply-chain policy passed (954 entries), 67/67 focused units across seven files passed, production build passed, Chromium setup passed, and 14/14 desktop/mobile browser checks passed in 55.5s; failure-artifact upload was correctly skipped.
- The earlier `72296c61127ed305852c417e0ca4ed239e6fe83e` audit baseline fixed engine/export/storage defects: Backspace/ghost replay, Enter/newline analytics, record validation, CSV formula escaping, incomplete-certificate rejection, quote PB identity, physical-layout finger mapping, and custom-tab normalization.
- The follow-up audit at `03849ed…` closed the remaining integration/QoL gaps: the workspace now actually uses the tested key-sound classifier and JSON-import sanitizer; tag filtering drives the visible history table, statistics, chart, and exported set consistently; home-row guidance follows the selected physical layout; failed attempts do not offer a certificate action; the live Chart.js instance is updated in place rather than destroyed/recreated on every timer tick; reduced-motion preference suppresses completion confetti and caret/transition animation; and unused future-only `diff`/`howler` packages plus their type packages were removed from the exact-pinned manifest/lockfile.
- The 2026-09-18 audit at `86b1982…` closed lifecycle and boundary defects that were not covered by the prior happy-path acceptance: deleting or clearing history now invalidates the in-memory PB ghost immediately; persisted config is structurally normalized and range-clamped before use and cannot be overwritten by the default-state hydration race; PB lookups cancel stale async results; Zen/quote/certification duration families use canonical non-numeric values; tag filters trim and compare case-insensitively; audio volume changes no longer create an AudioContext while audio is off and delayed cue timers are cancelled on dispose; tag-removal controls have explicit accessible names; whitespace-only custom text cannot create an empty target; pacer/metronome numeric controls clamp to supported ranges; unused workspace state was removed; and the engine timing comment now accurately describes high-resolution millisecond timestamps.
- The 2026-09-19 post-integration audit resolved the next boundary/QoL layer: result exports are now side-effect-free until **Save** is explicitly chosen and the result modal remains open for multiple formats; stored/imported and hydrated quote/Zen families are coherent; blank restored custom mode self-heals; legacy malformed IndexedDB rows are sanitized on read as well as on write/import; imported better results refresh the current personal-best/pacer immediately; saved-history display uses the shared pager instead of silently truncating after 24 rows; result-modal action rows wrap on narrow screens; and per-key plus n-gram analytics use bounded pagination instead of hidden truncation/unbounded DOM growth. Regression expectations were updated to encode explicit-save semantics rather than the old implicit-save behavior.
- Static audit also found no Typing-scoped TODO/FIXME/HACK markers, `@ts-ignore`/suppression debris, truncated source, placeholder/coming-soon implementation, or unresolved source-level lint command; the repo does not expose a standalone ESLint/oxlint script for this tool.
- The first local browser attempt for this follow-up accidentally reused a stale Vite preview on port 4173 from a different checkout because Playwright permits `reuseExistingServer` outside CI. Every scenario therefore landed on the home catalog. The stale process was identified by command line, only that process was stopped, and an isolated `CI=1` rerun against the current checkout passed all 14 checks. Permanent CI then independently passed the same 14 checks in 43.6s.
- Exact ranked English corpus data remains bundled/offline and derived from FrequencyWords commit `525f9b560de45753a5ea01069454e72e9aa541c6`; attribution/transformation details remain in `src/tools/typing/THIRD_PARTY_NOTICES.md`.
- **Branch containment note:** immediately before this docs-only handoff commit, `feature/typing-workstation` was 0 commits behind current `main` `eb70aaaaaae764ce895e462e0a5834c1c701ad32` and 17 commits ahead. The branch-only file diff is now Typing source/tests/docs only; the former parallel Vector commit is already represented on `main` and is no longer an integration hazard. This atomic documentation commit adds one branch-only commit; re-fetch both refs immediately before integration.
- **Functional ledger status:** 38/38 implemented. The original baseline is integrated on `main`; the current post-integration hardening is focused-gate accepted on the dedicated branch and still requires exact-main integration plus applicable Pages verification.

## Non-goals / explicit exclusions

- No cloud multiplayer, no account system, no telemetry — the entire workflow is local.
- No proprietary hardware driver integration — keystroke timing uses browser `KeyboardEvent` timestamps only.
- No AI-generated copy or features anywhere in the tool.

## Validation

- `.github/workflows/typing-workstation.yml` is the focused branch gate.
- Focused Vitest coverage is convention-discovered via `tests/unit/typing-*.test.ts`, preventing new Typing unit files from being silently omitted; it verifies engine semantics/analytics, duration/target generation, exact corpus contracts, storage/import behavior, and exports without rerunning unrelated tool suites.
- `pnpm build` verifies TypeScript and the Vite production bundle.
- `tests/e2e/typing.spec.ts` runs the seven critical acceptance scenarios on both desktop and mobile Chromium, including completion/error semantics, all mandatory export families that can be deterministically inspected in-browser, import round-trips, bundled-font availability, modal keyboard semantics, accessibility, and 320 CSS-pixel reflow.
- Milestone D now means integration of the **post-integration hardening delta** plus exact-main Typing/Pages verification; the original Typing baseline is already on `main` via PR #40.

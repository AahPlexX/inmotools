# Typing Workstation Implementation Plan

**Date:** 2026-09-15
**Authority:** `origin/main` (the completed feature branch was deleted after integration)
**Last audit refresh:** 2026-09-24
**Design record:** this file is authoritative until a dedicated design doc is written.

## Goal

Add a local-first typing speed calculator, ergonomic touch-typing testing surface, and adaptive motor-skill training workstation to the InMo Tools catalog. The tool must be usable by children, general public, professional court reporters, medical transcriptionists, and software engineers, and must ship the entire feature ledger below without silently dropping items.

## Architecture

- New workspace under `src/tools/typing/` with an isolated engine (`typing-engine.ts`), corpora (`typing-corpora.ts` plus the generated offline `typing-english-frequency.ts` ranked corpus), duration-aware target builder (`typing-target.ts`), persistence (`typing-storage.ts` — Dexie/IndexedDB), audio synthesis (`typing-audio.ts` — Web Audio API), export module (`typing-export.ts`), scoped styles (`typing-styles.css`), and a React workspace component (`TypingWorkspace.tsx`).
- Registered via the central catalog (`src/catalog.ts`) and workspace loader (`src/tools/workspaces.tsx`), with no changes to other tools.
- All computations and persistence run in the browser. No backend, no telemetry, no network call. The typing surface uses native text-input/composition events so software keyboards and IMEs reach the same engine; physical control keys use `KeyboardEvent`, and timing samples use `performance.now()`.
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
1. High-resolution input timing using `performance.now()` (sub-millisecond where the browser exposes it; user agents may coarsen timer precision for privacy/security).
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

- **A. Foundation & engine — complete.** `typing-engine.ts`, exact ranked corpora, target generation, storage, audio, exports, styles, workspace UI, catalog and loader are integrated on `origin/main`.
- **B. Focused unit tests — complete.** 67 focused tests across seven convention-discovered `tests/unit/typing-*.test.ts` files cover engine behavior/metrics, correction modes, Enter/newline and Backspace replay, conventional n-gram medians, duration/target sizing, exact ranked corpora, programmer languages, layout-specific finger anchors, key-sound classification, stored/imported-record validation including coherent quote/Zen families, legacy-read sanitization, personal-best identity, case-insensitive tag filtering, CSV formula escaping, certificate eligibility, exports, and custom-text normalization.
- **C. Focused browser spec — complete.** Seven logical scenarios run on desktop and mobile Chromium (14 checks total). They cover multiline completion; explicit side-effect-free result exports versus explicit Save; forgiving/master error behavior and certificate gating; filtered and paginated history; CSV/Markdown/JSON export; invalid-record import skipping plus immediate imported-PB refresh; CSV dictionary/raw-keystroke/PDF paths; corrupt-preference recovery and quote/Zen family coupling; bundled OpenDyslexic/modal semantics; Axe serious/critical accessibility; reduced-motion behavior; and 320 CSS-pixel reflow.
- **D. Integration & Pages verification — Typing complete.** The post-integration hardening delta merged to `main` through PR #69 as `463ef3c0b3e002e833b8b86dff9889ee9671f3a8`. The dedicated exact-main Typing workflow passed 67/67 focused units, production build, Chromium setup, and 14/14 desktop/mobile browser checks. Pages artifact build and deployment also succeeded on that SHA. The repository-wide Pages validation job remains red only because an unrelated Crystal spec-selection unit expects one Crystal browser spec while the selector now returns two; all seven Typing unit files passed inside that broad job.
- **E. 2026-09-24 completion audit — active.** Fresh source/standards review found two product-level gaps despite the earlier 38/38 ledger closure: the visual `div[role=textbox]` depended on raw `keydown` events (unreliable for touch software keyboards and alternate/IME text entry), and it intercepted `Tab` for “new text,” preventing standard focus traversal. The remediation keeps the 38-feature denominator unchanged: native textarea capture + input/composition handling, F2 as the fresh-sample shortcut, mobile Backspace input support, visible keyboard guidance, 24px tag-removal targets, compact keyboard reflow, focused browser regressions, and stale branch/CI wording cleanup. SEO was reviewed separately: the repository’s hash-fragment router is a shared architecture limitation, so this tool workstream does not claim independent search indexing or alter shared routing.

## Latest focused acceptance evidence

- **Integrated main revision:** `463ef3c0b3e002e833b8b86dff9889ee9671f3a8` via PR #69 (`Integrate Typing Workstation post-integration audit hardening`).
- **Exact-main Typing workflow:** run `35464501127`, job `105954236504`, completed successfully on 2026-09-19. Supply-chain policy passed for 954 lockfile entries, 67/67 focused units across seven files passed, production build passed, Chromium setup passed, and 14/14 desktop/mobile browser checks passed in 53.6s; failure-artifact upload was correctly skipped.
- **Pages evidence:** run `35464501124` built the production Pages artifact successfully (job `105954236296`) and deployed it successfully (job `105954313887`) from the same integrated SHA. Its broad validate job `105954236443` failed only `tests/unit/e2e-spec-selection.test.mjs` for an unrelated Crystal selector expectation; all seven Typing unit files passed in that broad unit run.
- **Current-main continuity check:** current `main` `d41481fbfdc442b161d7fa7df98bdbfe0befad36` does not change Typing source/tests relative to the accepted merge, but it does include later repo dependency/catalog work. Dedicated Typing run `35480931482` / job `105998484306` passed supply-chain policy for 1,224 lockfile entries, **67/67 Typing units**, production build, and **14/14 desktop/mobile Chromium checks in 46.7s**. Pages run `35480931478` passed **1258/1258 repository unit tests**, production artifact build, and Pages deployment. Its browser job is red on 12 non-Typing failures across other tools/infrastructure; all desktop/mobile Typing cases ran and none appears in the failure list. This confirms the integrated Typing workstation remains green on the latest main-line dependency state.
- **Docs-only closure deployment:** after the handoff records were closed on `main`, Pages run `35464727475` again built the production artifact successfully (job `105954879478`) and deployed successfully (job `105954941256`). Its broad validate job repeated the same unrelated Crystal selector failure; no Typing regression was present.
- **Accepted branch revision:** `468b9d5ec15bf2b595d9120b7e3820ba2f90597d` (`test(typing): require explicit save after certificate export`), whose tree includes all 2026-09-19 source hardening through `76de508e4f231cc15d25323c9ac8e8b79b144cc9`.
- **Dedicated workflow:** run `35464187569`, job `105953299929`, completed successfully on 2026-09-19. Frozen install/supply-chain policy passed (954 entries), 67/67 focused units across seven files passed, production build passed, Chromium setup passed, and 14/14 desktop/mobile browser checks passed in 55.5s; failure-artifact upload was correctly skipped.
- The earlier `72296c61127ed305852c417e0ca4ed239e6fe83e` audit baseline fixed engine/export/storage defects: Backspace/ghost replay, Enter/newline analytics, record validation, CSV formula escaping, incomplete-certificate rejection, quote PB identity, physical-layout finger mapping, and custom-tab normalization.
- The follow-up audit at `03849ed…` closed the remaining integration/QoL gaps: the workspace now actually uses the tested key-sound classifier and JSON-import sanitizer; tag filtering drives the visible history table, statistics, chart, and exported set consistently; home-row guidance follows the selected physical layout; failed attempts do not offer a certificate action; the live Chart.js instance is updated in place rather than destroyed/recreated on every timer tick; reduced-motion preference suppresses completion confetti and caret/transition animation; and unused future-only `diff`/`howler` packages plus their type packages were removed from the exact-pinned manifest/lockfile.
- The 2026-09-18 audit at `86b1982…` closed lifecycle and boundary defects that were not covered by the prior happy-path acceptance: deleting or clearing history now invalidates the in-memory PB ghost immediately; persisted config is structurally normalized and range-clamped before use and cannot be overwritten by the default-state hydration race; PB lookups cancel stale async results; Zen/quote/certification duration families use canonical non-numeric values; tag filters trim and compare case-insensitively; audio volume changes no longer create an AudioContext while audio is off and delayed cue timers are cancelled on dispose; tag-removal controls have explicit accessible names; whitespace-only custom text cannot create an empty target; pacer/metronome numeric controls clamp to supported ranges; unused workspace state was removed; and the engine timing comment now accurately describes high-resolution millisecond timestamps.
- The 2026-09-19 post-integration audit resolved the next boundary/QoL layer: result exports are now side-effect-free until **Save** is explicitly chosen and the result modal remains open for multiple formats; stored/imported and hydrated quote/Zen families are coherent; blank restored custom mode self-heals; legacy malformed IndexedDB rows are sanitized on read as well as on write/import; imported better results refresh the current personal-best/pacer immediately; saved-history display uses the shared pager instead of silently truncating after 24 rows; result-modal action rows wrap on narrow screens; and per-key plus n-gram analytics use bounded pagination instead of hidden truncation/unbounded DOM growth. Regression expectations were updated to encode explicit-save semantics rather than the old implicit-save behavior.
- Static audit also found no Typing-scoped TODO/FIXME/HACK markers, `@ts-ignore`/suppression debris, truncated source, placeholder/coming-soon implementation, or unresolved source-level lint command; the repo does not expose a standalone ESLint/oxlint script for this tool.
- The first local browser attempt for this follow-up accidentally reused a stale Vite preview on port 4173 from a different checkout because Playwright permits `reuseExistingServer` outside CI. Every scenario therefore landed on the home catalog. The stale process was identified by command line, only that process was stopped, and an isolated `CI=1` rerun against the current checkout passed all 14 checks. Permanent CI then independently passed the same 14 checks in 43.6s.
- Exact ranked English corpus data remains bundled/offline and derived from FrequencyWords commit `525f9b560de45753a5ea01069454e72e9aa541c6`; attribution/transformation details remain in `src/tools/typing/THIRD_PARTY_NOTICES.md`.
- **Containment closure:** PR #69 integrated the complete post-integration Typing delta into `main`. No unrelated tool source was part of the branch-only diff at merge time. GitHub automatically deleted `feature/typing-workstation` after the merge, verified by branch search, so there is no stale Typing feature branch left to reconcile.
- **Functional ledger status:** 38/38 implemented, focused-gate accepted, integrated on `main`, and deployed through Pages. The only red evidence on the integration SHA is the unrelated Crystal selector assertion in the repository-wide validation job.

## Non-goals / explicit exclusions

- No cloud multiplayer, no account system, no telemetry — the entire workflow is local.
- No proprietary hardware driver integration — text entry uses browser input/composition events, physical control keys use `KeyboardEvent`, and elapsed timing uses `performance.now()`.
- No AI-generated copy or features anywhere in the tool.

## Validation

- `.github/workflows/typing-workstation.yml` is the focused `main` validation gate for Typing-scoped changes.
- Focused Vitest coverage is convention-discovered via `tests/unit/typing-*.test.ts`, preventing new Typing unit files from being silently omitted; it verifies engine semantics/analytics, duration/target generation, exact corpus contracts, storage/import behavior, and exports without rerunning unrelated tool suites.
- `pnpm build` verifies TypeScript and the Vite production bundle.
- `tests/e2e/typing.spec.ts` runs the seven critical acceptance scenarios on both desktop and mobile Chromium, including completion/error semantics, all mandatory export families that can be deterministically inspected in-browser, import round-trips, bundled-font availability, modal keyboard semantics, accessibility, and 320 CSS-pixel reflow.
- Milestone D is closed for Typing: PR #69 integrated the hardening delta; the exact-main Typing workflow and Pages deployment succeeded. The broad Pages validation failure is explicitly unrelated Crystal test debt, not a Typing failure.

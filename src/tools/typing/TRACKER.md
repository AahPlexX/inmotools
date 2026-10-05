---
tool: typing-workstation
folder: src/tools/typing
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-typing-workstation-design.md
tracker: src/tools/typing/TRACKER.md
updated: 2026-10-05
---

# Typing Workstation — tracker

## Resume here

69 requirements: 47 verified, 9 implemented, 6 partial, 7 missing, 0 prohibited; TYP-R25, R26 and R27 await physical testing by human. Next action: build the missing rows in the Open work order, starting with TYP-R10 (custom durations) and TYP-R09 (burst speed). No blocker.

## Documents

- Spec: [2026-10-05-typing-workstation-design.md](../../../docs/superpowers/specs/2026-10-05-typing-workstation-design.md)
- Older ledgers and designs (history): [2026-09-15-typing-workstation.md](../../../docs/superpowers/plans/2026-09-15-typing-workstation.md) (F1–F47), [2026-09-25-typing-session-profiles-design.md](../../../docs/superpowers/specs/2026-09-25-typing-session-profiles-design.md), [2026-09-25-typing-session-profiles.md](../../../docs/superpowers/plans/2026-09-25-typing-session-profiles.md), [2026-09-30-typing-ux-elevation.md](../../../docs/superpowers/plans/2026-09-30-typing-ux-elevation.md), [typing-ux-audit-2026-09-30.md](../../../docs/typing-ux-audit-2026-09-30.md)
- Corpus attribution: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
- Owner notes: [owner-feature-notes-2026-10-05.md](../../../docs/research/owner-feature-notes-2026-10-05.md)
- Dark-theme contrast task: [T-repository-dark-contrast-20261004-b7d2](../../../.tasks/items/T-repository-dark-contrast-20261004-b7d2.md)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/typing-*.test.ts`; browser tests: `tests/e2e/typing.spec.ts`, `tests/e2e/accessibility.spec.ts`

## Requirement status

`unit` = `tests/unit/typing-*.test.ts`; `e2e` = `tests/e2e/typing.spec.ts`.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| TYP-R01 | implemented | `performance.now()` timestamps in `TypingWorkspace.tsx` | No test checks the timing source |
| TYP-R02 | verified | unit "computes WPM and accuracy for a clean run", "drops accuracy when there are typing errors" | |
| TYP-R03 | verified | unit "normalizes values when switching between time and word-count duration families", "builds exactly the selected number of words for word-count tests", "uses the selected quote length when quote duration is chosen", "creates deterministic replenishment chunks for Zen mode", "allocates enough target text for timed and five-minute certification sessions" | |
| TYP-R04 | implemented | `CaretStyle` in `TypingWorkspace.tsx` | No test changes the caret style |
| TYP-R05 | verified | unit "provides exact unique English frequency tiers matching their labels", "uses the selected non-English pool in top-word modes" | |
| TYP-R06 | verified | unit "keeps strict mode on the incorrect character until it is corrected", "fails the test immediately in master mode", "disables backspace in confidence mode", "completes a fully traversed forgiving target while retaining the error for scoring" | |
| TYP-R07 | implemented | `tw-char` correct / incorrect / pending classes | e2e checks correct and pending only |
| TYP-R08 | implemented | `keystrokeConsistency` in `typing-engine.ts` | No test checks the consistency value |
| TYP-R09 | missing | — | |
| TYP-R10 | missing | — | Durations are fixed presets (`typing-target.ts`) |
| TYP-R11 | verified | unit "serves keyboard layouts including QWERTY, Dvorak, Colemak, Workman, AZERTY, QWERTZ, BAPO", "lists per-key error rates and picks the weakest" | |
| TYP-R12 | verified | unit "assigns finger guidance by physical key position for alternate layouts", "derives home-row index anchors from the selected physical layout" | |
| TYP-R13 | verified | unit "groups bigrams and trigrams with mean latency", "computes the conventional median for an even number of n-gram observations" | |
| TYP-R14 | verified | unit "produces a deterministic drill for a given seed", "lists per-key error rates and picks the weakest" | |
| TYP-R15 | missing | — | Latency is measured press to press for n-grams; key release is not recorded |
| TYP-R16 | partial | unit "produces a wpm series with per-second samples" | Live chart shows net and raw WPM, ghost and pacer; no error series |
| TYP-R17 | verified | unit "ships programmer snippets for every promised language" | |
| TYP-R18 | verified | unit "bundles medical, legal, kids sentences and quotes", "maps corpus modes to the right pool" | |
| TYP-R19 | verified | unit "bundles medical, legal, kids sentences and quotes", "maps corpus modes to the right pool" | |
| TYP-R20 | verified | unit "maps corpus modes to the right pool" | |
| TYP-R21 | verified | unit "bundles medical, legal, kids sentences and quotes" | |
| TYP-R22 | verified | e2e "completes a multiline word-count custom target, persists it, and exports the JSON envelope"; unit "normalizes pasted tab characters into typeable spaces" | |
| TYP-R23 | missing | — | The bundled corpus has 5,000 entries |
| TYP-R24 | partial | unit "maps corpus modes to the right pool" | Punctuation and Numbers are separate modes, not switches on a word list |
| TYP-R25 | partial | unit "classifies wrong keys as incorrect audio cues without misclassifying valid special keys" | [awaiting physical testing by human] Play each switch profile on a desktop browser with speakers; expected: six distinct sounds and silence for Off |
| TYP-R26 | partial | unit "classifies wrong keys as incorrect audio cues without misclassifying valid special keys" | [awaiting physical testing by human] Finish, reach a milestone and fail a test with audio on; expected: three distinct cues |
| TYP-R27 | implemented | `startMetronome` in `typing-audio.ts`; BPM clamped 40–300 | [awaiting physical testing by human] Run a test with the metronome at 120 BPM; expected: two ticks per second, silent when paused |
| TYP-R28 | verified | e2e "normalizes duration families, honors exact word count, bundles fonts, and exposes modal semantics" | |
| TYP-R29 | verified | e2e "every theme keeps text at WCAG AA contrast" | |
| TYP-R30 | implemented | `blurUntilFocus`, `hideStatsDuringTest` in `TypingWorkspace.tsx` | |
| TYP-R31 | implemented | `aria-live="polite"` status region in `TypingWorkspace.tsx` | |
| TYP-R32 | missing | — | |
| TYP-R33 | verified | e2e "supports native text input, composition-safe entry, keyboard escape, and accessibility at rest" | |
| TYP-R34 | missing | — | |
| TYP-R35 | verified | unit "keeps Backspace in the raw event log and removes erased progress from the ghost", "counts committed Enter/newline events in live and ghost WPM progress" | |
| TYP-R36 | implemented | Pacer dataset in `TypingWorkspace.tsx`, clamped 20–220 | e2e "normalizes duration families, honors exact word count, bundles fonts, and exposes modal semantics" covers the clamp only |
| TYP-R37 | verified | unit "does not issue a proficiency certificate for a failed or aborted test", "allocates enough target text for timed and five-minute certification sessions" | |
| TYP-R38 | verified | unit "round-trips a stored test", "rejects malformed runtime records instead of persisting crash-prone history data" | |
| TYP-R39 | verified | unit "computes rolling averages and daily activity" | |
| TYP-R40 | verified | unit "updates tags and notes for a stored test", "filters tests by tag intersection", "uses one shared tag-filter contract for visible history and exports" | |
| TYP-R41 | verified | e2e "exports history metadata across formats and re-imports a bundle without id collisions", "history and analytics explain themselves before any test is saved" | |
| TYP-R42 | verified | unit "persists preferences"; e2e "normalizes duration families, honors exact word count, bundles fonts, and exposes modal semantics" | |
| TYP-R43 | verified | unit "emits CSV with the expected columns", "escapes spreadsheet formula-like values in CSV exports" | |
| TYP-R44 | verified | unit "emits JSON envelope with editable meta"; e2e "completes a multiline word-count custom target, persists it, and exports the JSON envelope" | |
| TYP-R45 | verified | unit "emits keystroke CSV rows"; e2e "loads a CSV dictionary and exports raw keystrokes and a PDF certificate" | |
| TYP-R46 | verified | unit "emits Markdown session summary" | |
| TYP-R47 | verified | unit "builds a certificate PDF blob"; e2e "loads a CSV dictionary and exports raw keystrokes and a PDF certificate" | |
| TYP-R48 | verified | e2e "loads a CSV dictionary and exports raw keystrokes and a PDF certificate" | |
| TYP-R49 | verified | e2e "exports history metadata across formats and re-imports a bundle without id collisions"; unit "assigns fresh local ids when imported records carry an existing id" | |
| TYP-R50 | verified | unit "preserves editable bulk export metadata in CSV" | |
| TYP-R51 | missing | — | |
| TYP-R52 | verified | unit "explicitly starts the timer without creating a keystroke and is idempotent"; e2e "offers explicit lifecycle controls with pause-safe timing and active-session guardrails" | |
| TYP-R53 | verified | unit "freezes effective time while paused and excludes pause duration after resume", "accumulates multiple pauses without making effective time move backward" | |
| TYP-R54 | verified | unit "freezes effective time while paused and excludes pause duration after resume", "finishes from a paused state without counting the paused span" | |
| TYP-R55 | verified | unit "records an intentional stopped finish separately from aborts and failures", "accepts stopped attempts for saved partial scores" | |
| TYP-R56 | verified | unit "reset clears pause accounting and restores ready state" | |
| TYP-R57 | verified | unit "initializes the default local typist idempotently and adopts legacy tests once"; e2e "keeps saved scores, personal history, and resets isolated by local typist" | |
| TYP-R58 | verified | unit "isolates history, personal bests, and destructive resets by typist id" | |
| TYP-R59 | verified | e2e "keeps saved scores, personal history, and resets isolated by local typist" | |
| TYP-R60 | verified | e2e "offers explicit lifecycle controls with pause-safe timing and active-session guardrails" | |
| TYP-R61 | verified | e2e "supports native text input, composition-safe entry, keyboard escape, and accessibility at rest", "loads a CSV dictionary and exports raw keystrokes and a PDF certificate" | |
| TYP-R62 | verified | e2e "supports native text input, composition-safe entry, keyboard escape, and accessibility at rest" | |
| TYP-R63 | verified | unit "from the third line on, the active line stays on the middle row"; e2e "shows a bounded 3-line passage window that follows the typist" | |
| TYP-R64 | verified | e2e "puts Start and the first line of the passage in the first viewport", "cues where to type, has one primary action, and lays settings out as rows" | |
| TYP-R65 | verified | e2e "result dialog keeps stray keystrokes out of its fields and lays out stats, exports and actions" | |
| TYP-R66 | partial | e2e "keeps every workspace element inside its own bounds and wraps the passage at every width", "reflows without page-level horizontal overflow across compact viewports" | Tested at 320, 360, 390, 430, 768 and 1440 px; 1920 and 2560 px not tested |
| TYP-R67 | verified | e2e "supports native text input, composition-safe entry, keyboard escape, and accessibility at rest"; `tests/e2e/accessibility.spec.ts` "has no serious or critical axe violations at <route>" | |
| TYP-R68 | partial | — | Site theme selector exists; the workspace fails `color-contrast` in dark (T-repository-dark-contrast-20261004-b7d2) |
| TYP-R69 | implemented | Site PWA (`vite.config.ts`); corpus and fonts bundled | No offline test for this route |

## Open work

1. TYP-R10 custom durations; TYP-R09 burst speed; TYP-R23 Top 10,000 list; TYP-R24 punctuation and numbers switches.
2. TYP-R15 dwell and flight times; TYP-R16 errors on the live chart.
3. TYP-R32 blind mode; TYP-R34 break reminders; TYP-R51 PNG certificate.
4. TYP-R68 dark-theme contrast; TYP-R66 widths 1920 and 2560.
5. Tests for the implemented rows: TYP-R01, R04, R07, R08, R30, R31, R36, R69; physical checks for TYP-R25–R27.

## Known limitations

- Browsers coarsen `performance.now()`; timing is millisecond precision.
- The hash-fragment router is shared; the tool does not claim its own search indexing (plan, milestone E).

## Verification evidence

- 2026-10-05, `expand/typing-workstation` from `main` @ `6c991e75`: `pnpm tool:check typing-workstation --base origin/main` 47/69, no errors; `pnpm docs:sync` and `pnpm docs:check` passed; `pnpm exec vitest run tests/unit/cad-progress.test.ts tests/unit/sheets-wave-b.test.ts tests/unit/deployment-config.test.ts` 23 passed.

## Change log

- 2026-10-05 — Created per `docs/DOCUMENTATION_STANDARD.md`.

---
tool: regex-matrix
folder: src/tools/regex
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-regex-matrix-design.md
tracker: src/tools/regex/TRACKER.md
updated: 2026-10-05
---

# RegexMatrix Studio & Academy — tracker

## Resume here

64 requirements: 45 verified, 3 implemented, 6 partial, 10 missing. Next action: RXM-R03 (live evaluation), RXM-R18 (syntax highlighting), RXM-R22 (match highlighting). No blocker.

## Documents

- Spec: [2026-10-05-regex-matrix-design.md](../../../docs/superpowers/specs/2026-10-05-regex-matrix-design.md)
- Older design: [2026-08-31-regex-matrix-design.md](../../../docs/superpowers/specs/2026-08-31-regex-matrix-design.md)
- Plans: [2026-08-31-regex-matrix.md](../../../docs/superpowers/plans/2026-08-31-regex-matrix.md), [2026-09-01-regex-matrix-parity-expansion.md](../../../docs/superpowers/plans/2026-09-01-regex-matrix-parity-expansion.md)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/regex-*.test.ts`; browser tests: `tests/e2e/regex-matrix.spec.ts`, `tests/e2e/regex-matrix-audit.spec.ts`

## Requirement status

`unit` = `tests/unit/regex-*.test.ts`; `e2e` = `tests/e2e/regex-matrix*.spec.ts`.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| RXM-R01 | verified | e2e "RegexMatrix catalog, alias, and generic routes open the lazy local workspace" |  |
| RXM-R02 | verified | e2e "Studio executes matches, exposes diagnostics, and identifies a ReDoS hazard" |  |
| RXM-R03 | partial | e2e "Studio executes matches, exposes diagnostics, and identifies a ReDoS hazard" | Explanation, railroad and compatibility update live; matches update only on Run pattern |
| RXM-R04 | verified | unit "covers the ten Regex101 parser flavors plus Oniguruma without conflating execution" |  |
| RXM-R05 | verified | unit "returns ECMAScript matches with named groups and exact offsets" |  |
| RXM-R06 | verified | unit "executes PCRE2-only atomic grouping through the WASM adapter"; unit "returns only the first PCRE2 match when the application-level global flag is absent" |  |
| RXM-R07 | verified | e2e "Python re executes locally with Python-only named groups" |  |
| RXM-R08 | verified | e2e "Oniguruma executes locally and the pattern editor offers flavor-aware completions" |  |
| RXM-R09 | implemented | — | Flags are passed to each engine; no test toggles individual flags |
| RXM-R10 | verified | unit "implements AdvanceStringIndex in UTF-16 and Unicode-aware modes", "does not repeat index 0 for a zero-length global Unicode pattern against an astral code point"; e2e "RegexMatrix advances zero-length Unicode matches by code point and exposes capped-result continuation" |  |
| RXM-R11 | verified | unit "reports PCRE2 match offsets in the JavaScript UI UTF-16 code-unit coordinate system"; e2e "Python exposes JavaScript-compatible UTF-16 offsets and separates runtime startup from execution timing" |  |
| RXM-R12 | verified | unit "returns compile errors instead of throwing from the ECMAScript adapter" |  |
| RXM-R13 | partial | unit "returns compile errors instead of throwing from the ECMAScript adapter" | The error is shown as a message below the editor; no position mark in the editor |
| RXM-R14 | verified | e2e "Python exposes JavaScript-compatible UTF-16 offsets and separates runtime startup from execution timing" |  |
| RXM-R15 | verified | unit "stops a pattern that runs past the watchdog once execution has started", "does not charge engine startup against the execution watchdog", "bounds an engine that never finishes starting" |  |
| RXM-R16 | verified | unit "reports an exact omitted count instead of silently truncating 5,001 ordinary matches", "supports bounded continuation from the cursor after the returned subset"; e2e "Python and Oniguruma report the shared 5,000-record limit instead of silently implying completeness" |  |
| RXM-R17 | verified | e2e "Oniguruma executes locally and the pattern editor offers flavor-aware completions" |  |
| RXM-R18 | missing | — | The CodeMirror editor has no regex language mode or bracket matching |
| RXM-R19 | verified | e2e "Studio executes matches, exposes diagnostics, and identifies a ReDoS hazard" |  |
| RXM-R20 | missing | — |  |
| RXM-R21 | verified | unit "returns ECMAScript matches with named groups and exact offsets" |  |
| RXM-R22 | missing | — |  |
| RXM-R23 | missing | — |  |
| RXM-R24 | verified | unit "builds source-ranged ECMAScript explanation nodes"; e2e "RegexMatrix explanation pagination makes tokens after the initial slice reachable" |  |
| RXM-R25 | verified | unit "projects source-ranged explanation nodes into a deterministic railroad SVG", "escapes railroad labels and sources in exported SVG" |  |
| RXM-R26 | verified | unit "formats and debugs structurally without claiming native engine steps"; e2e "RegexMatrix parity workbench exposes benchmark, reference, list export, debugger, and synthesis" |  |
| RXM-R27 | verified | e2e "RegexMatrix Automaton visualizes and steps a truthful Thompson NFA simulation" |  |
| RXM-R28 | missing | — |  |
| RXM-R29 | partial | unit "marks lookbehind and backreferences unsupported for RE2-style targets without pretending to execute them" | Lookarounds execute and are explained; no dedicated tester view |
| RXM-R30 | verified | unit "formats and debugs structurally without claiming native engine steps" |  |
| RXM-R31 | missing | — |  |
| RXM-R32 | verified | unit "reports ReDoS ambiguity without calling the score an engine step count"; e2e "Studio executes matches, exposes diagnostics, and identifies a ReDoS hazard" |  |
| RXM-R33 | verified | e2e "RegexMatrix ReDoS Lab measures a bounded empirical runtime trajectory without claiming engine steps" |  |
| RXM-R34 | implemented | — | `pcre-engine.ts` sets the limits; no test hits them |
| RXM-R35 | verified | unit "summarizes benchmark samples with deterministic percentile semantics" |  |
| RXM-R36 | verified | unit "marks lookbehind and backreferences unsupported for RE2-style targets without pretending to execute them" |  |
| RXM-R37 | verified | unit "safely rewrites ECMAScript named captures and named backreferences for Python", "never invents a Go/RE2 polyfill for lookbehind"; e2e "RegexMatrix Portability applies only exact rewrites and blocks unsafe target migrations" |  |
| RXM-R38 | verified | unit "uses native ECMAScript named-replacement semantics", "uses the bundled PCRE2 runtime for named substitutions and honors global mode", "describes truthful replacement syntax and execution support per flavor" |  |
| RXM-R39 | verified | e2e "replacement preview is isolated behind a worker watchdog and exposes cancellation without losing normal preview output" |  |
| RXM-R40 | verified | unit "ships a useful searchable quick reference with flavor-aware entries"; e2e "RegexMatrix parity workbench exposes benchmark, reference, list export, debugger, and synthesis" |  |
| RXM-R41 | implemented | — | Reference entries and engine support exist; no test runs a property escape |
| RXM-R42 | missing | — |  |
| RXM-R43 | verified | unit "ships five coherent tracks with at least thirty deterministic lessons", "validates lesson positive and negative fixtures with the submitted pattern"; e2e "Academy lesson can be completed and opened in Studio" |  |
| RXM-R44 | verified | e2e "Academy lesson can be completed and opened in Studio" |  |
| RXM-R45 | partial | e2e "Academy lesson can be completed and opened in Studio" | Progress is stored in IndexedDB; no test covers reload or Export progress |
| RXM-R46 | verified | unit "builds deterministic practice challenges from curriculum lessons"; e2e "RegexMatrix Academy includes SEO course and deterministic practice lab" |  |
| RXM-R47 | verified | unit "builds deterministic regex crosswords and validates both axes"; e2e "Regex crossword validates row and column constraints" |  |
| RXM-R48 | verified | unit "round-trips a bounded custom Academy package through JSON and local hash state", "rejects malformed or unsafe custom track packages"; e2e "Custom Academy tracks import locally, persist, export, and open in Studio" |  |
| RXM-R49 | verified | e2e "Studio executes matches, exposes diagnostics, and identifies a ReDoS hazard" |  |
| RXM-R50 | verified | unit "serializes the same assertion bundle as JSON and YAML"; e2e "Studio exports YAML and generated code downloads" |  |
| RXM-R51 | verified | unit "generates escaped production snippets for multiple targets", "maps generated code targets to useful download extensions"; e2e "Studio exports YAML and generated code downloads" |  |
| RXM-R52 | verified | unit "serializes match list exports deterministically"; e2e "match JSON export declares the UTF-16 coordinate system used by the UI" |  |
| RXM-R53 | verified | unit "synthesizes ranked candidates without silently replacing the user pattern" |  |
| RXM-R54 | verified | unit "generates deterministic edge cases locally" |  |
| RXM-R55 | missing | — |  |
| RXM-R56 | verified | unit "keeps newest session snapshots first and caps local history at 200"; e2e "Studio session snapshots can be saved and restored locally", "RegexMatrix saved-session pagination and deletion expose every locally retained snapshot" |  |
| RXM-R57 | missing | — |  |
| RXM-R58 | verified | unit "round-trips compressed local state without a server", "returns null for malformed shared state" |  |
| RXM-R59 | missing | — | JSON is exported (assertions, matches, tracks); only custom tracks import |
| RXM-R60 | verified | e2e "RegexMatrix keyboard accelerators switch modes and submit Academy work" |  |
| RXM-R61 | verified | e2e "Mobile Studio uses segmented work views without document overflow" |  |
| RXM-R62 | partial | e2e "RegexMatrix audit surface reflows without document overflow or blocking accessibility defects at <name>" | 320, 844 and 768 px are tested; 1440–2560 px are not |
| RXM-R63 | verified | e2e "RegexMatrix remains accessible and avoids document overflow on the active viewport" |  |
| RXM-R64 | partial | — | The workspace uses its own dark palette (`.regex-matrix` in `src/styles.css`) in every site theme; it does not switch to light |

## Open work

1. RXM-R03, RXM-R13, RXM-R18, RXM-R20, RXM-R22: live evaluation, inline diagnostics, syntax highlighting, hidden characters, match highlighting.
2. RXM-R23, RXM-R28, RXM-R29, RXM-R31: split/inverse view, quantifier visualizer, lookaround tester, minifier.
3. RXM-R42, RXM-R55, RXM-R57, RXM-R59: pattern library, escape/unescape, bookmarks, JSON import.
4. RXM-R62, RXM-R64: wide-width overflow tests and the site theme.
5. RXM-R09, RXM-R34, RXM-R41, RXM-R45: tests for flags, PCRE2 limits, Unicode properties and progress export.

## Known limitations

- Go/RE2, Java, .NET, Rust, PCRE legacy and POSIX flavors are compatibility analysis only.
- Browser RegExp step counts are not available; the debugger and automaton are structural.
- Results are capped at 5,000 records per run (continuation is ECMAScript only).

## Verification evidence

- 2026-10-05, `expand/regex-matrix` from `main` @ `8ff62503`: `pnpm tool:check regex-matrix --base origin/main` 45/64, no errors.

## Change log

- 2026-10-05 — Created per `docs/DOCUMENTATION_STANDARD.md`.

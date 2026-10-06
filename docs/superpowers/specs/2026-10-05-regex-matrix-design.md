---
tool: regex-matrix
folder: src/tools/regex
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-regex-matrix-design.md
tracker: src/tools/regex/TRACKER.md
updated: 2026-10-05
---

# RegexMatrix Studio & Academy — spec

As built at `947272db` (last code change under `src/tools/regex/`). Requirement prefix: `RXM`. Status of each requirement: [TRACKER.md](../../../src/tools/regex/TRACKER.md). History: [2026-08-31 design](2026-08-31-regex-matrix-design.md), [2026-08-31 plan](../plans/2026-08-31-regex-matrix.md), [2026-09-01 parity expansion plan](../plans/2026-09-01-regex-matrix-parity-expansion.md). Owner input: [owner feature notes 2026-10-05](../../research/owner-feature-notes-2026-10-05.md#regex-matrix-regex-studio--visual-rail-analyzer).

## Purpose

Give developers and learners one local workspace to write, run, explain, test and port regular expressions across real browser-executed engines (ECMAScript, PCRE2, Python, Oniguruma) and compatibility-checked flavors, and to learn regex through structured lessons and practice.

## Scope

In scope:
- Execution in ECMAScript, PCRE2, Python `re` and Oniguruma; compatibility analysis and code generation for PCRE, Go/RE2, Java, .NET, Rust and POSIX ERE/BRE.
- Explanation, railroad diagram, structural debugger, Thompson NFA view, ReDoS analysis, benchmark, replacement, assertions, synthesis, export, sessions and sharing.
- Academy tracks, practice lab, crossword and custom tracks.

Out of scope:
- Native backtracking step counts for the browser RegExp engine: the engine does not expose them, so steps are structural and labelled as such (2026-08-31 design, "ReDoS semantics").

## Constraints

- Platform rules: no accounts or authentication; no server, backend or server-side database (static GitHub Pages); everything runs in the browser and patterns, subjects, progress and sessions stay in this browser (IndexedDB, localStorage fallback); network use is limited to the site's own files ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- No large language models; other ML only under the ML ruleset (none is used; synthesis is deterministic).
- Libraries stay as in `package.json`: `pcre2-wasm`, Pyodide, `vscode-oniguruma`, `@eslint-community/regexpp`, `redos-detector`, `lz-string`, CodeMirror.
- WebAssembly runs single-threaded: GitHub Pages cannot send the COOP/COEP headers that threads need.
- Browsers coarsen timers, so timings are stated in milliseconds.
- Compatibility-only flavors are labelled as not executing; no engine is simulated.

## Architecture and engine

- Engines and libraries: `pcre2-wasm@10.47.5` runs PCRE2 patterns; `vscode-oniguruma@2.0.1` runs Oniguruma patterns (its `onig.wasm` is bundled); `pyodide@314.0.6` runs Python `re` (runtime files copied to the site's `pyodide/` folder); ECMAScript patterns run on the browser's own `RegExp`; `@eslint-community/regexpp@4.12.2` parses patterns to an AST; `redos-detector@6.1.4` checks patterns for catastrophic backtracking; `lz-string@1.5.0` compresses share-link state; `yaml@2.9.0` writes YAML assertion exports; `@codemirror/state@6.7.1`, `@codemirror/view@6.43.9`, `@codemirror/commands@6.11.1`, `@codemirror/autocomplete@6.20.3` and `@codemirror/search@6.7.1` provide the pattern editor.
- Workers: `regex-worker.ts` executes ECMAScript, PCRE2 and Oniguruma matching (client `regex-worker-client.ts`); `python-worker.ts` loads Pyodide and executes Python matching (client `python-worker-client.ts`); `regex-substitution-worker.ts` runs ECMAScript replacement previews (client `regex-substitution-worker-client.ts`).
- Storage: IndexedDB database `inmotools-regex-matrix` (version 1), object store `state`, holds the keys `saved-sessions`, `custom-tracks` and `academy-progress`; when IndexedDB is missing or fails, the same values go to localStorage under the prefix `inmotools_regex_matrix_`.
- Browser APIs: Web Workers and WebAssembly run the engines; the Clipboard API copies share links (a failed write puts the state in the address bar hash instead); Blob downloads save match, assertion and custom-track exports.
- Network: none beyond the site's own static files (the Oniguruma `.wasm` and the Pyodide runtime).

## Requirements

### Engines and execution

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| RXM-R01 | Studio and Academy modes in one route, reachable at `#/regex-matrix`, `#/tools/regex-matrix` and the catalog link | Open each route; the workspace loads |
| RXM-R02 | Run pattern executes the pattern against the test subject with the selected execution flavor; compatibility-only flavors say they cannot run | Run a date pattern; the match count is 2 |
| RXM-R03 | Live evaluation: matches update as the pattern or subject changes | Edit the pattern; the match list updates without pressing Run |
| RXM-R04 | Eleven engine flavors (ECMAScript, PCRE2, PCRE, Python, Go/RE2, Java, .NET, Rust, POSIX ERE, POSIX BRE, Oniguruma), each labelled as execution or compatibility-only | Open the flavor list; every compatibility flavor says it does not execute |
| RXM-R05 | ECMAScript execution in a worker with named groups and exact offsets | Run `(?<y>\d{4})`; the group and offsets are listed |
| RXM-R06 | PCRE2 10.47 execution through bundled WebAssembly, including atomic groups | Run `(?>a+)b` with PCRE2; it executes |
| RXM-R07 | Python `re` execution through bundled Pyodide, with Python-only named groups | Run `(?P<n>a)` with Python; the group is listed |
| RXM-R08 | Oniguruma execution through bundled WebAssembly | Choose Oniguruma; matches are returned |
| RXM-R09 | Flags field (g, i, m, s, u, y, d, v as the engine accepts) applied to execution | Set `i`; a case-different subject matches |
| RXM-R10 | Matches advance by code point in Unicode mode and by UTF-16 code unit otherwise; zero-length matches never repeat an index | Run an empty global Unicode pattern on an astral character; one match per code point |
| RXM-R11 | All engines report offsets in UTF-16 code units, as the editor does | Run the same pattern in PCRE2 and Python; offsets equal ECMAScript |
| RXM-R12 | Compile errors are shown as a message instead of breaking the workspace | Type `(`; an error message appears |
| RXM-R13 | Inline error diagnostics mark the error position in the pattern editor | Type `a(b`; the editor underlines the unclosed group |
| RXM-R14 | Execution timing shown in milliseconds, with engine startup excluded | Run with Python; startup and execution times are listed separately |
| RXM-R15 | A 500 ms watchdog stops a run that does not finish, without charging engine startup | Run `(a+)+$` on a long subject; the run stops and reports a timeout |
| RXM-R16 | Results are capped at 5,000 records with an exact omitted count and continuation from the cursor | Run on 5,001 matches; the count of omitted matches shows and Continue returns the rest |

### Editor and test text

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| RXM-R17 | Pattern editor with flavor-aware completions from the reference | Type `\d` prefix; completions for the selected flavor appear |
| RXM-R18 | Syntax-highlighted pattern with bracket matching | Place the cursor on `(`; the matching `)` is highlighted; tokens are coloured by kind |
| RXM-R19 | Multi-line test subject editor with line numbers | Paste three lines; each is numbered and matched |
| RXM-R20 | Hidden characters (tabs, spaces, line endings, zero-width) can be shown in the test subject | Turn on hidden characters; a tab shows as a marker |
| RXM-R21 | Match list with offsets and numbered and named capture groups | Run a two-group pattern; each match lists both groups with offsets |
| RXM-R22 | Matches and overlapping capture groups are highlighted in the test subject in distinct colours with a text equivalent | Run `((a)b)`; nested groups show distinct highlights |
| RXM-R23 | Inverse match view (the text not matched) and split preview | Choose split; the subject is listed as the pieces between matches |

### Explanation and visualization

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| RXM-R24 | Source-ranged plain-language explanation of each token, paginated | Run a long pattern; tokens after the first page are reachable |
| RXM-R25 | Railroad diagram from the explanation nodes, exported as SVG with escaped labels | Export the diagram; the SVG opens and labels are escaped |
| RXM-R26 | Structural step debugger with forward and back navigation, labelled as non-native | Step forward and back; the active token moves |
| RXM-R27 | Thompson NFA automaton graph with step-through simulation | Step the automaton; active states change per character |
| RXM-R28 | Greedy, lazy and possessive quantifier visualizer comparing how far each consumes | Compare `a+`, `a+?`, `a++` on "aaa"; each consumption is shown |
| RXM-R29 | Lookahead and lookbehind tester showing where each assertion holds | Run `(?<=\$)\d+`; positions where the lookbehind holds are marked |
| RXM-R30 | Review formatter shows a readable layout of the pattern without changing it | Format a long pattern; the original pattern is unchanged |
| RXM-R31 | Minifier removes redundant groups and whitespace where semantics are unchanged | Minify `(?:a)` to `a`; matches are identical |

### Safety and performance

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| RXM-R32 | ECMAScript ReDoS static ambiguity analysis with a score that is not called a step count | Analyse `(a+)+$`; it is flagged unsafe with a path score |
| RXM-R33 | Empirical ReDoS lab measuring runtime over growing adversarial probes with a chart | Run the lab on `(a+)+$`; runtimes per probe length are charted |
| RXM-R34 | PCRE2 runs with match and depth limits | A catastrophic PCRE2 pattern stops at the limit with a message |
| RXM-R35 | Benchmark with median, p95, min/max, throughput and timeout count | Run the benchmark; the summary lists each value |

### Compatibility and portability

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| RXM-R36 | Cross-flavor compatibility matrix listing unsupported features per flavor | Use a lookbehind; Go/RE2 is marked unsupported |
| RXM-R37 | Portability planner that applies only exact rewrites (named groups between ECMAScript and Python) and blocks unsafe migrations | Port `(?<n>a)\k<n>` to Python; the rewrite is `(?P<n>a)(?P=n)`; lookbehind to Go is blocked |

### Replacement

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| RXM-R38 | Replacement preview with per-flavor template syntax ($1, ${name}, \g<name>) and global mode | Replace with `${y}`; the preview shows the substitution |
| RXM-R39 | Replacement preview runs in a worker behind the watchdog and can be cancelled | Start a slow preview and cancel; normal preview still works |

### Reference and learning

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| RXM-R40 | Searchable quick reference and cheat sheet with flavor availability and Insert | Search "lookahead"; Insert adds the token to the pattern |
| RXM-R41 | Character classes and Unicode property escapes are covered in the reference and executed with the `u`/`v` flags | Run `\p{L}+` with `u`; letters match |
| RXM-R42 | Pattern library with ready patterns (email, URL, SemVer, UUID, IPv4, IPv6, ISO date) that load into Studio | Choose UUID; the pattern loads and matches a sample UUID |
| RXM-R43 | Academy with five tracks (Fundamentals, Intermediate, Advanced, Production, SEO) and at least thirty lessons validated against positive and negative fixtures | Complete a lesson; it is marked done |
| RXM-R44 | A lesson opens in Studio with its pattern, flags and cases | Choose Open in Studio; Studio shows the lesson pattern |
| RXM-R45 | Lesson progress stored in this browser and exportable | Complete a lesson, reload; it stays complete; Export progress downloads it |
| RXM-R46 | Deterministic practice lab built from the curriculum (quizzes) | Open Practice Lab; Check practice validates an answer |
| RXM-R47 | Regex crossword validating row and column constraints | Solve a crossword; both axes validate |
| RXM-R48 | Custom Academy tracks imported from JSON, stored locally, exported, shared by link and opened in Studio; unsafe packages are refused | Import a track JSON; it persists after reload and its lesson opens in Studio |

### Testing, synthesis and export

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| RXM-R49 | Assertion suite of must-match and must-not-match lines with pass/fail per line (unit test sets) | Add a must-not-match line that matches; it fails |
| RXM-R50 | Assertion suite export as JSON and YAML | Export YAML; it lists the cases |
| RXM-R51 | Code generation and download for JavaScript, TypeScript, Python, Go, Rust, PHP, Java, C# and Ruby with escaped patterns | Choose Go; the snippet compiles the escaped pattern and downloads as `.go` |
| RXM-R52 | Match list export as JSON, CSV and text, declaring UTF-16 offsets | Export JSON; it states `offsetUnit` UTF-16 |
| RXM-R53 | Sample-driven candidate synthesis that never replaces the pattern without Use pattern | Enter positive and negative samples; ranked candidates appear and the pattern changes only on Use pattern |
| RXM-R54 | Deterministic local edge-case generation from positive samples | Generate edge cases; the same samples give the same cases |
| RXM-R55 | Escape and unescape a literal string for the selected flavor | Escape `a.b*`; the result is `a\.b\*` |

### Sessions and sharing

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| RXM-R56 | Saved sessions (pattern history) stored in this browser, newest first, capped at 200, with load, delete and pagination | Save two sessions; both are listed newest first; delete one |
| RXM-R57 | Bookmarks: name and pin a saved pattern so it stays at the top of the history | Pin a session; it stays first after new saves |
| RXM-R58 | Compressed share URL carrying mode, flavor, pattern, flags and subject in the hash, without a server | Copy the share URL and open it; the state is restored |
| RXM-R59 | Import a session or assertion suite from a JSON file | Import an exported test JSON; the pattern and cases are restored |

### Interaction, layout and accessibility

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| RXM-R60 | Keyboard shortcuts: Ctrl/Cmd+Enter runs assertions or checks the lesson, Ctrl/Cmd+M switches mode, Ctrl/Cmd+Shift+F/E/R focus flavor, explanation and safety | Press Ctrl+M; the mode switches |
| RXM-R61 | Responsive layout: segmented views (Editor, Matches, Explain, Safety, Academy) on phones, split workbench on wide screens | At 375 px the view switcher shows and there is no document overflow |
| RXM-R62 | No horizontal page overflow from 320 to 2560 px | At 320, 768, 1440 and 2560 px document scroll width equals the viewport |
| RXM-R63 | No serious or critical axe violations in the workspace | axe on the route reports none |
| RXM-R64 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) and passes the colour-contrast check in dark | With Light chosen the workspace is light; with Dark chosen axe colour-contrast passes |

## Non-functional requirements

Rows RXM-R60 to RXM-R64 (keyboard, responsive layout, no horizontal overflow 320–2560 px, accessibility, site theme) and RXM-R15, RXM-R16, RXM-R39 (watchdog and result bounds) in the table above.

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Technique decisions

None: no function was compared between an ML and a non-ML method.

## Intent not recorded

- RXM-R64: the workspace has its own dark palette; whether it should switch to light with the site theme or stay dark is not recorded; owner may override.

## Change log

- 2026-10-05 — Created per `docs/DOCUMENTATION_STANDARD.md`. 64 requirements.

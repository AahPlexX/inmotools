# RegexMatrix Studio & Academy Design

## Purpose
RegexMatrix becomes InmoTools Tool 23 at `#/regex-matrix` and `#/tools/regex-matrix`. It combines a production regex debugger with a structured learning workspace while preserving the suite's local-first, no-auth model.

## Truthful capability model
The interface must distinguish three capability classes instead of presenting every dialect as an identical runtime:

1. **Execution engine** — the selected flavor is genuinely compiled/executed in-browser.
2. **Compatibility analysis** — syntax/features are checked against a target flavor, but that target runtime is not executing the pattern.
3. **Structural explanation** — tokens/AST-style structure are explained without claiming to be the target engine's native AST.

Initial real execution engines are ECMAScript through the browser RegExp implementation and PCRE2 through `pcre2-wasm` 10.47.5. Python, Go/RE2, Rust regex, and Oniguruma begin as explicit compatibility/code-generation targets until matching offline runtime assets are shipped and verified. No CDN or runtime network dependency is permitted.

## Runtime architecture
- `RegexWorkspace.tsx` owns mode, pattern, flags, subject, selected engine, Studio/Academy selection, and UI composition.
- `regex-worker.ts` executes ECMAScript work off the main thread. The host terminates a worker when the 500 ms watchdog target is exceeded and creates a fresh worker for later runs.
- `pcre-engine.ts` lazy-loads `pcre2-wasm`, uses its inline WASM bundle, and applies PCRE2 match/depth limits. The UI labels the actual engine version.
- `regex-ast.ts` uses `@eslint-community/regexpp` for ECMAScript parsing and produces source-ranged explanation nodes. Other flavors use a clearly labeled structural tokenizer.
- `regex-redos.ts` uses `redos-detector` only for ECMAScript static ambiguity analysis. Its score is called an ambiguity/path score, never an engine step count.
- `regex-compat.ts` detects dialect features and reports supported/unsupported/rewrite-advice states. Automatic rewrites are restricted to transformations whose semantics are explicit and test-covered; warnings are preferred over speculative polyfills.
- `regex-codegen.ts` generates escaped snippets for JavaScript, TypeScript, Python, Go, Rust, PHP, Java, C#, and Ruby.
- `regex-academy.ts` contains four built-in tracks with deterministic validation fixtures. Lessons can open their pattern/subject directly in Studio.
- `regex-persistence.ts` stores progress and saved sessions in IndexedDB, with localStorage fallback only when IndexedDB is unavailable.
- `regex-share.ts` uses `lz-string` for compressed, zero-backend state carried inside the hash route query.

## Studio UX
Desktop uses a restrained three-region workbench rather than a card grid: a compact control rail, central pattern/test editor, and diagnostic inspector. Mobile uses a single-column workspace with a small view switcher for Editor, Matches, Explain, Safety, and Academy. Required controls remain reachable without horizontal page overflow.

Studio surfaces:
- pattern and flags editor
- engine selector with Execution/Compatibility badges
- local test subject editor
- match/group inspector with offsets and measured duration
- AST/structural explanation with source ranges
- SVG railroad-style projection driven by the same explanation nodes
- substitution preview
- positive/negative assertion table
- ECMAScript ReDoS ambiguity analysis with a 500 ms runtime watchdog
- cross-flavor compatibility matrix
- polyglot code generation
- JSON/YAML assertion export and compressed share state

## Academy UX
Four tracks: Fundamentals, Intermediate, Advanced, Production. The initial bundled curriculum contains at least 24 deterministic lessons. Each lesson has an objective, concise explanation, starter pattern, positive/negative validation cases, hints, and an `Open in Studio` action. Progress is local only. No account, leaderboard, streak pressure, fake community count, or locked premium lesson exists.

## ReDoS semantics
- Static analysis is ECMAScript-specific and reports safe/unsafe, ambiguity score, timeout/max-step conditions, and source trails where available.
- Runtime execution is isolated from the UI thread and can be terminated by the host watchdog.
- PCRE2 calls additionally use the package's match and depth limits.
- No panel claims exact backtracking steps for native browser RegExp because that counter is not exposed by the engine.

## Responsive and accessibility contract
- 375–767 px: one-column, tabbed/segmented work areas; no fixed sidebars.
- 768–1023 px: editor over diagnostics with Academy as a full-width view.
- 1024 px+: multi-region workbench with sticky local controls where useful.
- Use semantic buttons/labels/tables/details, visible focus, reduced-motion support, and zero serious/critical axe violations.
- Color cannot be the only carrier of match-group or hazard meaning.
- APCA-oriented color choices may guide design, but the product must not claim standards conformance from an unmeasured palette.

## Performance and bundle policy
RegexMatrix stays route-lazy. Heavy PCRE2 and analysis dependencies must not enter the landing-page startup chunk. The PRD's bundle target is interpreted as a RegexMatrix route budget rather than a whole-suite budget because InmoTools already ships many independent lazy tools. The 500 ms watchdog is a deadline target, not a claim of sub-millisecond scheduling precision.

## Import/export and privacy
All regexes, subjects, lesson progress, assertions, generated snippets, diagrams, and session state stay on-device. No application network request is required for execution. Exports include assertion JSON/YAML, generated snippets, SVG diagram, and compressed share state.

## Deferred engine adapters
Authentic offline Python `re`, Go stdlib `regexp`, Rust `regex`, and general Oniguruma execution require separately verified vendored WASM/runtime artifacts. They are deferred rather than simulated. Their compatibility/codegen entries must remain visibly labeled until real adapters are shipped and tested.

# RegexMatrix Functional Superset Expansion Plan

**Goal:** Make RegexMatrix a defensible functional replacement for the core Regex101 + RegexLearn workflows while preserving truthful runtime labels and adding local-first safety/learning differentiators.

**Authoritative parity evidence (2026-09-01):** Regex101 currently exposes match, substitution, list, unit tests, code generation, debugger, export matches, benchmarking, formatting, quick reference, Intellisense, and ten parser flavors (PCRE, PCRE2, JavaScript, Python, Go, Java, .NET, Rust, POSIX ERE, POSIX BRE). RegexLearn currently exposes step-by-step courses, cheatsheet, playground, keyboard-first lessons, Regex 101 and Regex for SEO tracks.

## Guardrails
- Keep execution and compatibility-only flavors visually distinct.
- Do not claim native-engine steps when only structural source traversal is available.
- Do not mutate a regex with whitespace formatting unless semantics are guaranteed; expose a review formatter instead.
- Keep all work local-first and route-lazy.
- Preserve existing 500 ms execution watchdog and accessibility/mobile release gates.

## Milestone A — Studio parity
- [ ] Expand flavor catalog to at least the ten Regex101 parser flavors, retaining Oniguruma as an additional compatibility target.
- [ ] Add searchable quick-reference catalog with flavor availability and insertion-ready tokens.
- [ ] Add readable structural formatter/projection with no false semantic-equivalence claim.
- [ ] Add source-ranged structural debugger with forward/back navigation and explicit non-native label.
- [ ] Add repeatable benchmark summary: median, p95, min/max, throughput, timeout count.
- [ ] Add List & Export mode with deterministic JSON/CSV/text match exports.

## Milestone B — Learning parity and expansion
- [ ] Add Regex for SEO Academy track in addition to the existing four tracks.
- [ ] Add deterministic practice lab generated from the bundled curriculum.
- [ ] Add searchable cheatsheet/reference shared between Studio and Academy.

## Milestone C — Differentiators
- [ ] Add sample-driven regex candidate synthesis for common structural cases.
- [ ] Add deterministic local fuzz/edge-case generation from positive samples.
- [ ] Keep candidate scoring transparent and require explicit user selection before replacing the pattern.

## Milestone D — Release gate
- [ ] Unit tests green.
- [ ] Production TypeScript/Vite build green.
- [ ] Full desktop/mobile Playwright + axe/overflow green.
- [ ] Pages artifact and deploy green on the exact final SHA.

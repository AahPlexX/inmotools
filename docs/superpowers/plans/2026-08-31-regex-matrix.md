# RegexMatrix Studio & Academy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add Tool 23, a local-first RegexMatrix workspace combining real ECMAScript/PCRE2 debugging with truthful cross-flavor analysis and a built-in learning academy.

**Architecture:** Keep the existing InmoTools hash router and lazy workspace registry. Put regex execution/analysis into focused pure modules and workers; keep persistence/share state local and heavy dependencies route-lazy.

**Tech Stack:** React 19, TypeScript 7 strict, Vite 8, CodeMirror 6, Web Workers, `pcre2-wasm` 10.47.5, `@eslint-community/regexpp` 4.12.2, `redos-detector` 6.1.4, `lz-string` 1.5.0, Vitest, Playwright, axe-core.

**Spec:** `docs/superpowers/specs/2026-08-31-regex-matrix-design.md`

## Global Constraints
- Route aliases: `#/regex-matrix` and `#/tools/regex-matrix`.
- No authentication, backend, CDN runtime asset, or application upload path.
- New RegexMatrix TypeScript functions use arrow-function syntax.
- Real execution and compatibility-only targets must never be visually conflated.
- Worker watchdog target: 500 ms; PCRE2 additionally uses match/depth limits.
- Keep existing suite routing/design conventions; no suite-wide router rewrite.
- Desktop and iPhone Chromium E2E plus axe/overflow remain release gates.

---

### Task 1: Define core contracts with failing tests
**Files:** Create `tests/unit/regex-engine.test.ts`, `tests/unit/regex-analysis.test.ts`, `tests/unit/regex-academy.test.ts`, `tests/unit/regex-share.test.ts`, `tests/e2e/regex-matrix.spec.ts`.

- [x] Write tests for ECMAScript/PCRE2 execution, compatibility, ReDoS analysis, curriculum validation, share-state roundtrip, routes, mode switching, exports, accessibility, and overflow.
- [x] Run `pnpm test:unit` and verify the new contracts fail because RegexMatrix production modules do not yet exist.
- [x] Commit the RED evidence.

### Task 2: Implement execution and analysis core
**Files:** Create `src/tools/regex/regex-types.ts`, `regex-engine.ts`, `pcre-engine.ts`, `regex-ast.ts`, `regex-redos.ts`, `regex-compat.ts`, `regex-codegen.ts`, `regex-worker.ts`; modify `package.json`.

- [x] Add the four pinned dependencies from the spec.
- [x] Implement ECMAScript match/group/index extraction with deterministic errors.
- [x] Implement lazy PCRE2 execution with inline WASM, match limits, depth limits, and named groups.
- [x] Implement regexpp source-range explanations and structural fallback tokenization.
- [x] Implement ECMAScript-only ReDoS ambiguity analysis and dialect feature compatibility.
- [x] Implement code generators with target-language escaping.
- [x] Run unit tests and TypeScript build until these contracts are green.

### Task 3: Implement Academy, persistence, and sharing
**Files:** Create `src/tools/regex/regex-academy.ts`, `regex-persistence.ts`, `regex-share.ts`.

- [x] Add four tracks and at least 24 deterministic lessons with validation fixtures.
- [x] Implement solution validation without hidden network work.
- [x] Persist progress/sessions in IndexedDB and provide deterministic fallback behavior.
- [x] Encode/decode compressed state with `lz-string`.
- [x] Run Academy/share tests to green.

### Task 4: Build the responsive workspace
**Files:** Create `src/tools/regex/RegexEditor.tsx`, `RegexWorkspace.tsx`; modify `src/styles.css`.

- [x] Build Studio/Academy mode switching and responsive view navigation.
- [x] Wire pattern, flags, engine, subject, matches/groups, AST explanation, SVG railroad projection, safety panel, compatibility matrix, codegen, assertion runner, and exports.
- [x] Add Academy lesson navigation/progress and Open in Studio.
- [x] Implement keyboard accelerators without intercepting text-entry shortcuts incorrectly.
- [x] Ensure no horizontal document overflow at mobile widths and preserve visible focus/reduced motion.

### Task 5: Register Tool 23 and route aliases
**Files:** Modify `src/catalog.ts`, `src/tools/workspaces.tsx`, `src/App.tsx`.

- [x] Add `regex-matrix` to `ToolSlug` and catalog metadata.
- [x] Lazy-load `./regex/RegexWorkspace`.
- [x] Add exact `#/regex-matrix` alias while preserving generic route handling.

### Task 6: Full browser and release verification
**Files:** `tests/e2e/regex-matrix.spec.ts` plus targeted fixes only if evidence requires them.

- [x] Run full unit suite.
- [x] Run production build.
- [x] Run desktop/mobile Playwright and axe/overflow checks.
- [x] Verify Pages artifact creation and GitHub Pages deploy for the exact final SHA.
- [x] Do not rerun an unchanged passing candidate; reuse accepted evidence.
---

## Completion evidence
- Final feature SHA: `e0b668b4a6763b4788107057dec24f8eebc48aff`.
- GitHub Actions run: `33459417859` (`Validate and deploy Pages`, run 96).
- Validation job: unit tests, production build, Playwright Chromium install, full desktop/mobile browser tests, Pages configuration, and Pages artifact upload all succeeded.
- Deploy job: GitHub Pages deployment succeeded for the exact final feature SHA.
- The shipped baseline includes JSON/YAML assertion export, generated-snippet export, SVG railroad projection/export with source-range selection, IndexedDB-backed saved Studio sessions with fallback behavior, keyboard accelerators, mobile segmented Studio views, Academy progress/open-in-Studio flow, compatibility analysis, ECMAScript/PCRE2 execution, and local compressed share state.


---
task: T-static-analysis-20261011-8b2c
doc: task
kind: fix
state: done
branch: fix/static-analysis
created: 2026-10-11
updated: 2026-10-11
---

# Adopt useful static analysis without replacing behavioral evidence

## Request

Use existing dependencies to avoid unnecessary custom tests. Evaluate the recommended Oxlint/oxlint-tsgolint addition and optional Knip; preserve existing tests and Prettier's runtime use. Prefer efficient forward progress with uncompromised quality.

## Resume here

2026-10-11 14:40 UTC: done. Implemented main70bf90aa9553eed435182475562aa4de795663c7 via GitHub MCP, fetched complete tree equals tested candidate8c1a76d. [Static analysis38148037900](https://github.com/AahPlexX/inmotools/actions/runs/38148037900)/job114495418793 SUCCESS:1276files/196rules/4085warnings/0errors; complete artifact11705374036 (14-day retention; exact pinned command/config/source reproduce after expiry). [Pages38148038076](https://github.com/AahPlexX/inmotools/actions/runs/38148038076)/validatejob114495419074 SUCCESS:4160unitpasses/18skips,374filespassed/2skipped45.11s; build5.75s. Actual a904643→70bf90a comparison proves additive isolated lint dependencies, specs=[]; browser installation/execution skipped. Build-pages114495419270 and deploy114495545990 SUCCESS. [Docs38148038001](https://github.com/AahPlexX/inmotools/actions/runs/38148038001) SUCCESS. No full-browser dispatch, test deletion, automatic code repair, formatter or alpha JS plugin.

Requested TypeScript/Oxc/React/JSX-a11y/import/promise rules enabled; Vitest limited to unit-test ts/tsx/mjs/js, Unicorn restricted to six requested rules and ESLint core retained. Node/JSDoc/react-perf/Next/Vue/Jest skipped per table. Experimental React Compiler correctness rules start warn, including refs/immutability; no build transform enabled. Type-aware tsconfig.lint.json covers src/tests/scripts and preserves ES2022. tsc remains required because the historical compatibility trial differed; no replacement claim. Existing warnings are review candidates, not confirmed defects; focused unit tests fail the lint gate. Follow original frozen tool order when triaging warnings; do not bulk add void/suppressions or change unrelated tools.

Local current-source lint4085warnings/0errors1276files/196rules49.63s; TypeScript/build pass (build39.20s on concurrent host). Smoke catches missing keys, invalid Hooks, accumulating spread, floating promises, import cycle/self-import, assertion-free test and fails focused test; temporary files removed. Scoped existing-policy regressions37/37, final runner/deployment25/25 pass in recorded scopes. Six meaningful policy cases added to existing test file; no new test file. Metadata/unknown/runtime/fixture/existing dependency mutations retain full fallback; explicit full always runs. Frozen dependency install passes pnpm12.3.4. Exact files and receipts: /workspace/inmotools-implementation-evidence/oxlint-evaluation, final-rollout-results.json/stderr, smoke-results.json/stderr, policy-units.log, final-policy-units.log, final-types.log, build.log, actual-candidate-plan.json. CI outcome reproduced in this portable record. pnpm lint and the Static analysis workflow run the configured rules, preserve full diagnostics and report concise counts.

Current scope is complete; optional Knip and compiler-check replacement were not adopted. Original PDF-R05 work remains separately active/partial with six protected-navigation zero-worker failures preserved; new lint findings do not change its acceptance status. Resume that tool task in its own worktree after merging current main and checking changed validation inputs. Final publication changes records only and needs docs checks; runtime/browser evidence remains reusable within this verified scope.

## Historical compatibility experiment — 14:29 UTC

2026-10-11 14:29 UTC: compatibility evaluation complete; adoption remains queued. Official Oxlint type-aware documentation retrieved HTTP200 today supports type-aware/type-check mode, TypeScript7+ and no-floating-promises; its CLI labels type checking experimental. Registry versions actually evaluated: oxlint1.87.0 and oxlint-tsgolint7.0.2004, installed only in the external evidence directory. Repo installed TypeScript7.0.2 and Node24.19.0 verified; tsconfig.app.json has no baseUrl and includes only src. scripts/tool-check.mjs checks requirement records/evidence and does not lint code. No dependency/config/build/workflow changes or test deletions have been made.

Actual experiment on local candidate bd2520f (subsequent e51d2b5 changes records only): 786files, two enabled rules, exit1, 12floating-promise diagnostics and one TS2300 duplicate src declaration in src/types/vite-assets.d.ts. Reference `tsc --noEmit -p tsconfig.app.json` exits0 on the same source. This demonstrates a compatibility difference, not an established compiler bug or twelve established application bugs. Review each before repair; do not mechanically add void or suppress diagnostics. Runtime PDF-R05 is separately partial and must not be published as accepted.

## Historical rollout planning (superseded by current checkpoint)

1. Prefer Oxlint as the single lint tool. Use a small meaningful rule set and baseline reviewed existing debt without hiding newly introduced findings. Resolve/disclose the TS2300 difference before considering replacement of tsc; preserve tsc meanwhile.
2. Type-aware mode must explicitly use tsconfig.app.json (no root tsconfig.json exists). The isolated tool launcher resolves tsgolint from its working directory; the first repo-cwd experiment failed executable lookup and ran no lint. The corrected command below ran real analysis.
3. Assess `vitest/expect-expect` against custom assertion helpers and actual tests; do not presume a helper call is an absent assertion. Source type-check scope does not establish test type-check coverage.
4. Keep meaningful behavioral, worker lifecycle, parser/math, output-byte, responsive, keyboard and download tests. A static rule replaces a custom code-pattern assertion only after demonstrating equivalent coverage. Axe does not prove every accessibility requirement.
5. Optional Knip6.41.0 registry metadata checked; no Knip execution or unused-dependency claim yet. Account for dynamic imports, workers, public assets and tool-owned formatter dependencies before configuration; never auto-delete.
6. Dev-only lint adoption should run lint/compiler/config/install/workflow checks and reuse matching browser evidence if runtime bundle, fixtures, browser evaluator and relevant dependency inputs are unchanged. Verify those inputs explicitly; broad/unknown runtime impact still needs full validation under the current policy. Document any exception before execution.

## Portable evidence

External evidence directory `/workspace/inmotools-implementation-evidence/oxlint-evaluation`: install.log, config.json, source-results.json, source-stderr.log, tsc-reference.log. Source-results.json SHA256: 41ee8c5f0314ba9a305aeff08aec22103da440ca73b26507be2668804ec1e42c. Primary bodies in pdf-r05/type-aware.txt and oxlint-registry.txt/tsgolint-registry.txt/knip-registry.txt. Official sources: [Oxlint type-aware](https://oxc.rs/docs/guide/usage/linter/type-aware), [Oxlint npm metadata](https://registry.npmjs.org/oxlint/latest), [tsgolint npm metadata](https://registry.npmjs.org/oxlint-tsgolint/latest), [Knip metadata](https://registry.npmjs.org/knip/latest). Retrieved 2026-10-11 14:28 UTC. Vendor speed/rule-count figures were not independently benchmarked and are not acceptance evidence.

Reproduce from the external directory after installing exact evaluated versions (not latest):

```sh
./node_modules/.bin/oxlint --type-aware --type-check --tsconfig /workspace/inmotools-pdf-sanitizer/tsconfig.app.json -c config.json /workspace/inmotools-pdf-sanitizer/src --format json
```

Configuration disables correctness defaults to isolate the two requested rules: plugins typescript/react/vitest/jsx-a11y/import; categories.correctness=off; rules typescript/no-floating-promises=error and vitest/expect-expect=error. Only source files were passed, so this run establishes no expect-expect test acceptance.

| Diagnostic | Location |
| --- | --- |
| `typescript(TS2300)` | `src/types/vite-assets.d.ts:5` |
| `typescript(no-floating-promises)` | `src/tools/regex/regex-worker.ts:28` |
| `typescript(no-floating-promises)` | `src/tools/geo-intel/GeoIntelWorkspace.tsx:121` |
| `typescript(no-floating-promises)` | `src/tools/geo-intel/GeoIntelWorkspace.tsx:191` |
| `typescript(no-floating-promises)` | `src/tools/geo-intel/GeoIntelWorkspace.tsx:238` |
| `typescript(no-floating-promises)` | `src/tools/geo-intel/GeoIntelWorkspace.tsx:426` |
| `typescript(no-floating-promises)` | `src/tools/geo-intel/ui/OpsPanels.tsx:103` |
| `typescript(no-floating-promises)` | `src/tools/markdown/MarkdownWorkspace.tsx:283` |
| `typescript(no-floating-promises)` | `src/tools/typing/typing-audio.ts:227` |
| `typescript(no-floating-promises)` | `src/tools/music/MasteringProjectTab.tsx:87` |
| `typescript(no-floating-promises)` | `src/tools/music/MasteringProjectTab.tsx:96` |
| `typescript(no-floating-promises)` | `src/tools/music/MasteringProjectTab.tsx:115` |
| `typescript(no-floating-promises)` | `src/tools/typing/TypingWorkspace.tsx:539` |

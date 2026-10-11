---
doc: standard
updated: 2026-10-11
---

# Validation scope and evidence reuse

## Current checkpoint

2026-10-11 14:40 UTC: static-analysis rollout main70bf90a accepted. [Task8b2c](../.tasks/items/T-static-analysis-20261011-8b2c.md) records exact source, native smoke, dependency proof and all receipts. Static analysis38148037900 passes1276files/196rules/4085warnings/0errors. Pages38148038076 passes4160units/18skips and build5.75s; actual browser plan=[] because the initial additive lint-only proof passes, so no browser install/run. Docs38148038001/build-pages/deploy succeed. tsc remains required; existing lint debt is warning-only except focused unit tests, and warning review does not replace behavioral acceptance.

Previous validation-policy acceptance:

Accepted implementation mainc7658de; [Pages38120639969](https://github.com/AahPlexX/inmotools/actions/runs/38120639969) and [Docs38120639925](https://github.com/AahPlexX/inmotools/actions/runs/38120639925) succeeded2026-10-11. Actual affected browser plan is empty for the policy-only change, so browser installation/execution were skipped;4142units passed/18skipped and build8.11s. Native module-record regression coverage68/68passed, original client assertions/timeouts unchanged. [Validation task](../.tasks/items/T-validation-policy-20261011-4d6b.md) is done and preserves the earlier selector timeout failures.

Existing [full38095819719](https://github.com/AahPlexX/inmotools/actions/runs/38095819719) succeeded on sourceb914:1833browserpasses/171skips54.7m, no retry markers. Application/browser/dependency/build inputs still match except records; matching evidence is reused within that scope. Future changes must select their own applicable gates.

## Required scope

| Change | Browser gate |
| --- | --- |
| Tool source, worker, styles or owned tests | Owned specs plus affected dependency consumers; targeted custom/responsive/accessibility/interaction-cycle coverage where applicable. |
| Shared helper with identifiable consumers | All transitive affected tools/specs; unresolved ownership or shell-wide use falls back to full. |
| Catalog metadata | Owned coverage and catalog/accessibility/responsive matrix. |
| Shared shell/global styles, dependencies, build/test configuration, unknown runtime impact | Full suite. |
| Documentation, unit-only tests, non-runtime CI/policy scripts | Relevant unit/docs/workflow regression checks; no browser run without an affected runtime scope. |
| Stable audit batch or final product/release checkpoint | Explicit full suite on frozen inputs; final release/project standards remain unchanged. |

The shared-file location alone does not require a full browser run. Use scripts/select-e2e-specs.mjs as the scope resolver; preserve full fallback for uncertain impact. Tool requirements can be accepted after their applicable scoped gates. A separate unrelated checkpoint failure stays in its task, while a failure affecting the current tool or dependency blocks that scope. Preserve frozen requirement order and record any outstanding full checkpoint; never represent pending or failed evidence as passing.

## Isolated static-analysis dependency rollout

The initial pinned Oxlint addition may reuse matching browser evidence only after scripts/run-browser-validation.mjs proves all existing package fields, runtime/build/test dependencies and every existing lock record unchanged. Only the two named dev-only tools, their own binding packages, lint command/config/workflow, policy implementation/tests and canonical records qualify. Any runtime/fixture/build setting, unknown package, existing dependency mutation, malformed metadata or unsupported comparison falls back to full. Explicit full still always runs. This narrowly reviewed initial-rollout exception does not generalize to later lint upgrades or other development dependencies. Required build, unit, docs and lint checks remain.

## Execution and reuse

Batch related, ordered requirements within one tool into a working change. Keep its tracker/task/evidence current in that commit. Run required unit/build/docs checks and selected browser specs; write custom tests for material gaps. Keep original assertions/timeouts and client-cycle coverage. Publish completed working steps without redundant documentation-only integrations when records can accompany the work.

Automatic tool branch integrations own their selected validation. Their main deployment dispatch uses validate=false and does not duplicate those checks. Direct main pushes/PRs have one browser-validation owner (Pages). Custom tool workflows remain manually available. Manual affected validation needs an explicit base revision; missing/invalid bases use full scope. Manual scope=full is the stable-checkpoint command; validate=false remains deployment-only.

Reuse passing evidence only when the relevant source, tests/fixtures, dependency lock, evaluator/configuration and environment assumptions match. Record exact revisions/digests, scope, results/skips/retries, limits and the next action. Documentation-only differences do not invalidate matching application/browser evidence. A selector/workflow change needs meaningful selector/workflow regression checks; unchanged browser runtime/tests do not justify a duplicate full run. A running unchanged full is retained and read once when complete.

## Automated checks before custom coverage

Use the installed TypeScript compiler, axe/Playwright and fast-check where their capabilities fit the changed behavior. Axe covers automatically detectable accessibility violations; retain focused keyboard, focus, responsive geometry and interaction-cycle checks. Property-based checks suit parsers, ranges and invariants; real browser checks remain necessary for downloads, rendering, cancellation and resource disposal. Preserve existing tests; add new custom coverage for material gaps.

Oxlint is the preferred lint addition, subject to the [static-analysis compatibility task](../.tasks/items/T-static-analysis-20261011-8b2c.md). Current isolated trial reports a type-check difference from the passing tsc gate, so tsc remains required. Oxlint1.87.0/oxlint-tsgolint7.0.2004 are pinned dev-only additions. Run pnpm lint; the separate Static analysis workflow preserves complete diagnostics and reports counts. Existing findings start as warnings; focused unit tests fail the gate. Avoid overlapping lint/format tools or repository-wide formatting churn; Prettier remains a tool runtime dependency. Optional Knip requires reviewed dynamic-import/worker configuration before any unused-code conclusion. Static rules replace code-pattern assertions only where equivalent coverage is demonstrated; behavior still needs behavioral evidence.

## Primary references — checked 2026-10-11

- [Playwright CLI](https://playwright.dev/docs/test-cli): explicit file filters select suites while retaining project/retry settings.
- [GitHub Actions workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) and [syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax): push/PR/dispatch contexts and typed inputs.
- [Git diff](https://git-scm.com/docs/git-diff): compare actual push endpoints, PR merge base, and include deleted/renamed paths without rename detection.
- [Pinned Rolldown parser source](https://github.com/rolldown/rolldown/blob/v1.2.7/packages/rolldown/src/utils/parse.ts): Vite already provides the native TypeScript parser; module records avoid unnecessary AST deserialization. No new dependency.

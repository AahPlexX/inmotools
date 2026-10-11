---
doc: standard
updated: 2026-10-11
---

# Validation scope and evidence reuse

## Current checkpoint

Implementation and exact-main workflow qualification are tracked in [validation task](../.tasks/items/T-validation-policy-20261011-4d6b.md). Existing [full38095819719](https://github.com/AahPlexX/inmotools/actions/runs/38095819719) succeeded on sourceb914:1833browserpasses/171skips54.7m, no retry markers. Application/browser/dependency/build inputs match through baseline main68cd844 except records; the policy work changes tooling/workflows and has its own focused regression gate. Full acceptance is limited to that recorded scope, not future changes.

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

## Execution and reuse

Batch related, ordered requirements within one tool into a working change. Keep its tracker/task/evidence current in that commit. Run required unit/build/docs checks and selected browser specs; write custom tests for material gaps. Keep original assertions/timeouts and client-cycle coverage. Publish completed working steps without redundant documentation-only integrations when records can accompany the work.

Automatic tool branch integrations own their selected validation. Their main deployment dispatch uses validate=false and does not duplicate those checks. Direct main pushes/PRs have one browser-validation owner (Pages). Custom tool workflows remain manually available. Manual affected validation needs an explicit base revision; missing/invalid bases use full scope. Manual scope=full is the stable-checkpoint command; validate=false remains deployment-only.

Reuse passing evidence only when the relevant source, tests/fixtures, dependency lock, evaluator/configuration and environment assumptions match. Record exact revisions/digests, scope, results/skips/retries, limits and the next action. Documentation-only differences do not invalidate matching application/browser evidence. A selector/workflow change needs meaningful selector/workflow regression checks; unchanged browser runtime/tests do not justify a duplicate full run. A running unchanged full is retained and read once when complete.

## Primary references — checked 2026-10-11

- [Playwright CLI](https://playwright.dev/docs/test-cli): explicit file filters select suites while retaining project/retry settings.
- [GitHub Actions workflow events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows) and [syntax](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax): push/PR/dispatch contexts and typed inputs.
- [Git diff](https://git-scm.com/docs/git-diff): compare actual push endpoints, PR merge base, and include deleted/renamed paths without rename detection.
- [Prettier plugin parser contract](https://prettier.io/docs/plugins): existing pinned parser returns the actual TypeScript AST; no new parser dependency.

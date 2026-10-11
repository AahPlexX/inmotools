---
task: T-validation-policy-20261011-4d6b
doc: task
kind: fix
state: active
branch: repository-validation-policy
created: 2026-10-11
updated: 2026-10-11
---

# Reduce repeated validation while retaining product acceptance

## Request

Use dependency-aware and custom tests to reduce repetitive overhead; repository-wide browser tests are not required at every integration. Preserve final product quality, frozen tool order, current portable documentation and origin/main integration without pull requests.

## Resume here

2026-10-11 00:43 UTC: scoped dependency selection, conservative fallback, shared event runner and single automatic browser owner are implemented. Final focused41/41passed in6.34s after tightening the merge-race reuse shortcut: runtime Markdown must select browser checks rather than count as records. No application/browser assertions, timeouts, dependency versions, auth or database changes.

Own worktree /workspace/inmotools-validation-policy based on main68cd844; local repository-validation-policy branch is not pushed. External receipts: /workspace/inmotools-implementation-evidence/validation-policy-20261011. Earlier broad unit pass4140/17skipped (373files/2skipped,178.38s) predates the final runner/workflow safeguards; final focused checks cover those changes. Actual existing full38095819719/job114341370995 SUCCESS:1833browserpasses/171skips54.7m, no retry markers;4119unitpasses/18skips. Runtime/browser/dependency/build input comparison to b914 is records-only. That full is reused, not repeated. PDF/Crystal formal records are a separate follow-up in their own worktrees.

YAML/Bash/docs and diff checks pass. Next: commit implementation and publish directly to main by GitHub MCP after fresh SHA guard. Verify the new exact-main CI scope and result before marking this task done. Primary official sources checked2026-10-11 are in docs/VALIDATION_POLICY.md and the external primary-sources receipt.

## Acceptance requirements

| ID | Acceptance |
| --- | --- |
| VAL-01 | Tool/test changes select owned browser specs; direct and transitive cross-tool/shared-helper consumers are included. Workers, CSS imports and literal dynamic imports are covered. |
| VAL-02 | Shared shell, dependencies/build configuration, unknown runtime changes, missing base, deleted unmapped browser tests/fixtures and uncertain dependency analysis fall back to full validation. |
| VAL-03 | Main pushes and PRs use actual changed revisions; rename/deletion paths cannot disappear. Explicit full checkpoints and deployment-only dispatch remain available. |
| VAL-04 | One automatic browser-validation owner per event; custom tool checks remain callable manually and their tests remain in selected regular coverage. |
| VAL-05 | Docs/unit-only changes do not trigger browser tests; docs skip browser installation. Required unit/build/docs and existing browser assertions/retries stay intact. |
| VAL-06 | Current policy, progress, exact evidence and handoff support continuation; no tool completion is invented and no runtime/auth/database/dependency change is made. |

## Log

- 2026-10-11: task and observable acceptance specified before implementation; main68cd844 and existing running checkpoint identified.

- 2026-10-11 00:34 UTC: implementation and documented scope policy present; meaningful fixtures cover transitive consumers, deleted modules/helpers/unknown runtime, cache invalidation and workflow ownership/event modes. Checks pending; old failures preserved.

- 2026-10-11 00:43 UTC: existing full completed successfully and scope identity recorded; merge-race Markdown optimization now consults the dependency selector. Final checks/publication pending.

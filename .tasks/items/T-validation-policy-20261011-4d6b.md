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

2026-10-11 07:12 UTC: implementation3bd5aa7 is on main; its exact-main Pages38099439330/job114352125001 failed four existing selector unit timeouts5000ms (sheets, Sightline, Crystal mapping and geo-intel wiring). Browser/build validation steps were skipped, not accepted. Documentation run38099439331 passed. Root issue is dependency-analysis cost under CI load; original assertions/timeouts are retained.

Own repository-validation-policy worktree now replaces full Prettier AST walks with the already pinned Vite/Rolldown1.2.7 native parser module records, decoding dynamic requests with the same parser and retaining AST walks for workers/globs/CommonJS/escaped identifiers. No package/lock/runtime/browser change. Official pinned parse source retrieved2026-10-11, receipt rolldown-primary.json. Final focused68/68passed8files10.57s including Unicode-prefix request decoding and all four previously timed-out mappings; log policy-final-0711.log. Current actual cold graph1522.67ms,1006files, no uncertain runtime imports; computed browser-only loader retains helper-change fallback.

Existing full38095819719/job114341370995 SUCCESS:1833browserpasses/171skips54.7m, no retry markers;4119unitpasses/18skips, unchanged runtime/browser/dependency/build inputs. Earlier4140unitpass/17skip predates final safeguards and is not final candidate evidence. Completed PDF/Crystal own-worktree records are merged into this local candidate (PDF80b8ef5, Crystal2f26a41): R02/R03 verified,7f9e/d7a8 done, orderedR04c061 explicitly active with no implementation; not yet on main.

Final focused exit0, YAML/Bash and182-document checks pass. Next publish through GitHub MCP directly to main after fresh SHA guard, then verify actual exact-main CI selects no browser scope and passes before marking this policy task done. External receipts /workspace/inmotools-implementation-evidence/validation-policy-20261011; no PR or new full dispatch.

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

- 2026-10-11 07:11 UTC: actual first-main CI timeout failures retained; native module-record optimization implemented and prepared per-tool completion records await publication.

- 2026-10-11 07:12 UTC: final68focused checks passed10.57s, docs/syntax passed; own-tool completion records merged into the guarded main publication candidate.

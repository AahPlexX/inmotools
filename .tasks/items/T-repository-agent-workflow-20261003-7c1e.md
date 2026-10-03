---
task: T-repository-agent-workflow-20261003-7c1e
doc: task
kind: fix
state: done
branch: main
created: 2026-10-03
updated: 2026-10-03
---

# Agent workflow: per-tool catalog, computed completion, integration without pull requests

## Request
Owner, 2026-10-03: implement the agent workflow on origin/main so agents from any provider can turn a vague request into requirements, build, test, track and finish a tool, expand it later, and work in parallel without losing progress; no stray branches, no open pull requests, catalog entry and link added automatically. Spec sheets follow in the next session.

## Resume here
Done. Follow-ups: the next-session spec workstream ([T-repository-standard-specs-20261003-3a9d](T-repository-standard-specs-20261003-3a9d.md)) and the owner actions and questions in docs/DECISIONS.md.

## Log
- 2026-10-03: Dependabot version-update pull requests disabled (`7c597a11`); #108–#117 closed and their branches deleted.
- 2026-10-03: per-tool meta files and glob registry (`947272db`); e2e spec selection derived from routes (`99c05dad`).
- 2026-10-03: task:start, branch:check, tool:check, docs:sync (`99930b67`); integrate.yml, janitor.yml, Pages dispatch (`ee451ed4`).
- 2026-10-03: GOVERNANCE.md rewritten as universal rules; AGENTS.md, CLAUDE.md, GEMINI.md, docs/DECISIONS.md, standard and completion contract updated.
- 2026-10-03: CI on main failed at `99c05dad` and `ee451ed4` (two unit tests asserting the old docs step and the CAD ledger commit); fixed in `21ccc99a`. GEMINI.md switched to an `@./AGENTS.md` import (`8c641345`).
- 2026-10-03: verification at `8c641345`: tsc clean; 343 unit files / 3,703 tests passed (2 files skipped as before); build clean; docs:check 48 documents; Validate and deploy Pages run 37127144523 success (full unit and browser suite, deploy); live site lists 39 tools in category order and `#/regex-matrix` opens RegexMatrix. integrate.yml and janitor.yml were exercised locally against a scratch remote (merge, retry when main moves, regression refused, new tool without spec refused, conflict refused, index row added); their first GitHub run is the next branch push.

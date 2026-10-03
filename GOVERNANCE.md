# Repository Governance

**As of:** 2026-10-03

Binding rules for every person and automated agent that creates, reads, updates or deletes anything in this repository. A current request from the owner and this file must both be satisfied; if they conflict, stop the affected work and report the conflict.

These rules apply to every tool equally, so this file names no tool, version, commit or task (`scripts/check-doc-links.mjs` enforces that). Facts about one tool live in its spec and tracker; owner decisions, exceptions and version pins live in [docs/DECISIONS.md](docs/DECISIONS.md).

## 1. Where things are

| Concern | Source of truth |
| --- | --- |
| These rules | `GOVERNANCE.md` |
| Quick start for agents | [AGENTS.md](AGENTS.md) |
| Document formats (spec, tracker, task file, index) | [docs/DOCUMENTATION_STANDARD.md](docs/DOCUMENTATION_STANDARD.md) |
| Owner decisions, exceptions, pins, open questions | [docs/DECISIONS.md](docs/DECISIONS.md) |
| One tool's catalog record (name, copy, category, route aliases, loader) | `src/tools/<folder>/<slug>.meta.ts` |
| One tool's requirements and what "complete" means | its spec, `docs/superpowers/specs/<date>-<slug>-design.md` |
| One tool's live state | its tracker, `src/tools/<folder>/TRACKER.md` |
| One piece of work | its task file, `.tasks/items/<task id>.md` |
| Generated views (never edit by hand) | `docs/TOOL_INDEX.md` tool table, `.tasks/ITEMS.md` (`pnpm docs:sync`) |
| Scripts, dependencies | `package.json` |
| CI, integration, deployment | `.github/workflows/` |
| Completion gates | [.tasks/PROJECT_COMPLETION.md](.tasks/PROJECT_COMPLETION.md) |

Do not invent a path, file, section, command, branch or policy. Check that every reference resolves before relying on it.

## 2. Platform rules (never change)

- No user accounts or authentication.
- No server, backend or server-side database; the site is static files on GitHub Pages.
- Everything runs in the user's browser; data a tool keeps stays in that browser.
- Network use is limited to the site's own files and public keyless sources requested by the user's own action.

Anything that can be built within these rules is in scope (the default integration rule in the documentation standard).

## 3. Work cycle

1. **Start:** `pnpm task:start <slug> <new|expand|fix> "<title>"`. It creates `feature/<slug>` (new tool), `expand/<slug>` or `fix/<slug>` from `origin/main` in its own worktree, writes the task file and pushes it. If the branch already exists, it is resumed, not restarted. Other branch names are refused (`pnpm branch:check`).
2. **Specify:** record the request verbatim in the task file, then turn it into ID'd requirements in the tool's spec before writing code. A request that leaves a choice open gets the conservative default, recorded under "Intent not recorded" with "owner may override".
3. **Build and record:** keep the tracker's **Resume here**, requirement statuses and the task file current in the same commit as the work. Commit and push after every working step, so stopping at any point loses nothing.
4. **Check:** `pnpm tool:check <slug>` computes completion from the spec, tracker and tests. A status is never typed as a summary; a `verified` row cites a test that exists.
5. **Integrate:** pushing the branch is the integration request. `.github/workflows/integrate.yml` merges it onto the latest `main`, runs the checks, pushes `main`, starts the deployment and deletes the branch. There are no pull requests. A tool may merge while incomplete when its records say so; no merge may turn a `verified` requirement into anything else.
6. **Continue:** after a merge, continue on `expand/<slug>` or `fix/<slug>` with `pnpm task:start`. Finished work: set the task file's `state: done` with evidence.

A change to `.github/workflows/` cannot be pushed by a workflow token; such a branch is checked locally and merged into `main` by the person or agent that made it, with the same checks.

## 4. Parallel work

- One branch per tool at a time: the branch is the claim. Never commit to another tool's branch or edit another tool's folder, spec or tracker.
- Shared files (anything outside `src/tools/<folder>/`, that tool's spec, and `.tasks/items/`) change only on `fix/<slug>` with the reason in the task file, and run the full browser suite.
- Sync with `git fetch origin && git merge origin/main` on the branch; resolve conflicts there, never on `main`.

## 5. Evidence

- Repository facts come from the repository or its host, not from memory. Re-read state before writing when others may be working.
- External facts (standards, APIs, tool behaviour) come from authoritative or primary sources, with enough corroboration for at least 95% evidence-based confidence; resolve conflicting sources before acting. If that cannot be reached, stop that work and report the missing evidence.
- Record sources and dates in the report to the owner, not in code or incidental comments.
- Never claim a test, build, route or deployment passes without fresh evidence from that check. Record the baseline before attributing a failure to a change.

## 6. Changes

- Smallest correct change; keep valid existing content; no unrelated cleanup, restyling or dependency changes.
- One purpose per commit, with a message that says what changed and why.
- Never force-push, rewrite or delete `main`. Never discard work you did not create.
- Never retrieve, print or commit secrets, tokens or keys; report only where one was found.
- No placeholders that imply completion, no reasoning narrative, confidence statements or model/provider-specific instructions in repository files.
- Running the same task again on a correct repository changes nothing.

## 7. Records

- Every piece of work has a task file in `.tasks/items/` whose `state` is current (`active`, `next`, `backlog`, `done`, `rejected`). Newly found work gets its own task file before the session ends. Rejected work keeps its file with the reason.
- The older files in `.tasks/` (`IN_PROGRESS.md`, `NEXT.md`, `BACKLOG.md`, `DONE.md`, `REJECTED.md`, `WORK_LOG.md`) are history: their open entries stay valid until moved to task files; new work is not added to them.
- If the code, a tracker and a task file disagree, the records are stale and the work is not complete.

## 8. Report to the owner

Outside the repository, at the end of each session: what changed, verification evidence with the commit it ran on, open items and blockers, external sources with dates, and questions for the owner.

## Change history

- **2026-10-03:** Rewritten as universal rules only. Added the work cycle (task:start, computed completion, integration without pull requests), parallel-work rules and per-task files; tool-specific facts moved to docs/DECISIONS.md and the per-tool documents.
- **2026-10-01:** Added the documentation standard, tool index and agent entry point to the SSOT directory.
- **2026-09-11:** Added the deterministic project-completion contract and made task-state freshness a binding invariant.
- **2026-08-31:** Created the repository-wide governance file.

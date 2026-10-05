# AGENTS.md

Quick start for any coding agent or person. Binding rules: [GOVERNANCE.md](GOVERNANCE.md). Document formats: [docs/DOCUMENTATION_STANDARD.md](docs/DOCUMENTATION_STANDARD.md). Owner decisions and exceptions: [docs/DECISIONS.md](docs/DECISIONS.md).

## Platform rules (never change)

- No user accounts or authentication.
- No server, backend or server-side database; the site is static files on GitHub Pages.
- Everything runs in the user's browser; tool data stays in that browser (IndexedDB, localStorage).

If a feature fits these rules, build it and record it as a requirement. Exclude a feature only when it breaks these rules, a source's terms or licence, needs a key, or cannot run in a browser.

## Do this

```sh
pnpm install --frozen-lockfile
pnpm task:start <slug> <new|expand|fix> "<title>"   # claim + own worktree + task file; resumes if claimed
cd ../inmotools-<slug>
# 1. paste the request into the task file; 2. spec requirements first; 3. build; 4. tracker + task file current
pnpm tool:check <slug>                                # computed completion; fix every error
git push                                               # after every working step; integrate.yml merges into main
```

- **Which document wins:** `AGENTS.md`, `GOVERNANCE.md`, `docs/DOCUMENTATION_STANDARD.md`, `docs/DECISIONS.md`, a tool's spec and tracker, and task files in `.tasks/items/` are current. Any other document (plans, handoff notes, older specs, audits) is a historical record: where it conflicts with the current ones, the current ones win, and its branch, pull-request and registration instructions do not apply.
- **Find a tool:** `grep "<slug>" docs/TOOL_INDEX.md`, then its tracker's **Resume here**, then its spec. `grep -rl "^tool: <slug>$" docs src .tasks` lists every document.
- **New tool:** add `src/tools/<folder>/<slug>.meta.ts` (copy an existing one), a spec and a tracker. The catalog entry, home-page link, route and index row follow from those files; no shared file is edited.
- **No pull requests.** Pushing `feature/`, `expand/` or `fix/<slug>` is the integration request; the branch is deleted once merged. If a run fails, read its log, fix on the branch, push again.
- **Stay in your lane:** only your tool's folder, spec, tracker and task file. Shared files need a `fix/<slug>` branch and a reason in the task file.
- **Before you stop:** tracker **Resume here** and the task file's **Resume here** updated, everything committed and pushed.

## Checks

| What | Command |
| --- | --- |
| Type check | `pnpm exec tsc --noEmit -p tsconfig.app.json` |
| Unit tests | `pnpm test:unit` |
| Build | `pnpm build` |
| Browser tests | `pnpm exec playwright test tests/e2e/<spec>.spec.ts` (all: `pnpm test:e2e`) |
| Completion | `pnpm tool:check <slug>` |
| Records and links | `pnpm docs:sync` then `pnpm docs:check` |
| Branch name | `pnpm branch:check` |

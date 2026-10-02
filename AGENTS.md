# AGENTS.md

Instructions for any coding agent or person working in this repository. Binding rules are in [GOVERNANCE.md](GOVERNANCE.md); this file only tells you where things are.

## Platform rules (never change)

- No user accounts or authentication.
- No server, backend or server-side database; the site is static files on GitHub Pages.
- Everything runs in the user's browser; tool data stays in that browser (IndexedDB, localStorage).

Default integration rule: if a feature can be built into a tool within these rules, integrate it and document it (spec, tracker, `.tasks/`). Exclude a feature only when it breaks these rules, a source's terms or licence, needs a key, or cannot run in a browser. Useful ideas that fit these rules become requirements automatically. Tool names follow the [naming convention](docs/DOCUMENTATION_STANDARD.md#naming-convention-approved-2026-10-02).

Details: [docs/DOCUMENTATION_STANDARD.md](docs/DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec).

## Find a tool's documents

1. Look the tool up in [docs/TOOL_INDEX.md](docs/TOOL_INDEX.md) by its catalog slug (`slug` in `src/catalog.ts`): `grep "<slug>" docs/TOOL_INDEX.md`.
2. Open its tracker (`src/tools/<folder>/TRACKER.md`) and read **Resume here** first.
3. Open its spec (`docs/superpowers/specs/<date>-<slug>-design.md`). The spec defines what "complete" means for the tool.
4. Check its task state in [.tasks/](.tasks/).

Every standard document starts with a header block, so `grep -rl "^tool: <slug>$" docs src .tasks` lists everything for one tool. The format, statuses and writing rules are in [docs/DOCUMENTATION_STANDARD.md](docs/DOCUMENTATION_STANDARD.md).

## Adding a tool or a feature

Turn the request into ID'd requirements in a spec before writing code, work on a `feature/<slug>` branch in its own worktree, and merge back into `origin/main` once verified. Steps: [docs/DOCUMENTATION_STANDARD.md](docs/DOCUMENTATION_STANDARD.md#adding-a-new-tool).

## Before you stop

Update the tool's tracker (**Resume here**, requirement status, verification evidence) and its `.tasks/` entry in the same commit as your work, so the next agent can continue without asking.

## Commands

- Install: `pnpm install --frozen-lockfile`
- Type check: `pnpm exec tsc --noEmit -p tsconfig.app.json`
- Unit tests: `pnpm test:unit`
- Build: `pnpm build`
- Browser tests: `pnpm test:e2e` (focused: `pnpm exec playwright test tests/e2e/<spec>.spec.ts`)

CI and deployment are defined in [.github/workflows/pages.yml](.github/workflows/pages.yml). A push that changes only Markdown skips the full suite and runs [.github/workflows/docs.yml](.github/workflows/docs.yml) instead (link check plus the unit tests that read Markdown); run `node scripts/check-doc-links.mjs` before pushing documents.

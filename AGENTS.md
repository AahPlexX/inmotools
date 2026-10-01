# AGENTS.md

Instructions for any coding agent or person working in this repository. Binding rules are in [GOVERNANCE.md](GOVERNANCE.md); this file only tells you where things are.

## Find a tool's documents

1. Look the tool up in [docs/TOOL_INDEX.md](docs/TOOL_INDEX.md) by its catalog slug (`slug` in `src/catalog.ts`): `grep "<slug>" docs/TOOL_INDEX.md`.
2. Open its tracker (`src/tools/<folder>/TRACKER.md`) and read **Resume here** first.
3. Open its spec (`docs/superpowers/specs/<date>-<slug>-design.md`). The spec defines what "complete" means for the tool.
4. Check its task state in [.tasks/](.tasks/).

Every standard document starts with a header block, so `grep -rl "^tool: <slug>$" docs src .tasks` lists everything for one tool. The format, statuses and writing rules are in [docs/DOCUMENTATION_STANDARD.md](docs/DOCUMENTATION_STANDARD.md).

## Before you stop

Update the tool's tracker (**Resume here**, requirement status, verification evidence) and its `.tasks/` entry in the same commit as your work, so the next agent can continue without asking.

## Commands

- Install: `pnpm install --frozen-lockfile`
- Type check: `pnpm exec tsc --noEmit -p tsconfig.app.json`
- Unit tests: `pnpm test:unit`
- Build: `pnpm build`
- Browser tests: `pnpm test:e2e` (focused: `pnpm exec playwright test tests/e2e/<spec>.spec.ts`)

CI and deployment are defined in [.github/workflows/pages.yml](.github/workflows/pages.yml).

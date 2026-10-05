---
doc: decisions
updated: 2026-10-04
---

# Decisions, exceptions and open questions

Owner decisions and repository-wide facts that are not universal rules. Universal rules are in [GOVERNANCE.md](../GOVERNANCE.md); everything about one tool is in its spec and tracker. Newest first in each section; one fact per line.

## Owner decisions

| Date | Decision |
| --- | --- |
| 2026-10-04 | One site-wide theme selector (TASK-028) in the site header: Light, Dark, System. The default is Light until every tool passes the dark-theme contrast check, then System (follows the device setting); visitors can choose Dark or System now; the choice is stored in this browser under localStorage key `inmotools.theme.v1`; the browser `theme-color` follows the page background of the resolved theme. Per-tool theme behaviour is each tool's own requirement. |
| 2026-10-04 | Open-Meteo's free keyless API may be used: the site is non-commercial. Any tool may use it where it fits the platform rules, including Geo Intelligence Hub. |
| 2026-10-03 | Requirements that need real hardware or a person carry the flag `[awaiting physical testing by human]` and are never `verified` until a person records the check ([standard](DOCUMENTATION_STANDARD.md#flag-awaiting-physical-testing-by-human)). |
| 2026-10-03 | When a new test shows a requirement's status is wrong, the agent corrects it, and fixes the code in the same branch when the fix is fully within that tool. |
| 2026-10-03 | Home page order: by category (`TOOL_CATEGORIES` in `src/tool-meta.ts`), then by short title. Each tool's category is set in its meta file. |
| 2026-10-03 | Integration without pull requests: a push to `feature/`, `expand/` or `fix/<slug>` is merged into `main` by `.github/workflows/integrate.yml`, and the branch is deleted. |
| 2026-10-03 | Incomplete tools and expansions may merge when their spec, tracker and task file show the state; a merge may not turn a `verified` requirement into another status. |
| 2026-10-03 | Branches with unmerged commits are kept indefinitely; the janitor deletes only fully merged branches. The owner monitors the repository. |
| 2026-10-03 | Dependabot version-update pull requests are disabled (`open-pull-requests-limit: 0`); open ones #108–#117 were closed. |
| 2026-10-02 | Naming convention approved ([standard](DOCUMENTATION_STANDARD.md#naming-convention-approved-2026-10-02)). Names kept as they are: Geo Intelligence Hub, RegexMatrix Studio & Academy. PlanCraft Studio is to be renamed. |
| 2026-10-02 | Fluid Type Matrix removed entirely (index, "Removed tools"). |
| 2026-10-02 | Useful ideas that fit the platform rules become requirements without approval. |
| 2026-10-01 | The site is non-commercial. |

## Agent instruction files

`AGENTS.md` is the only instruction file with content; it links to `GOVERNANCE.md`. `CLAUDE.md` (`@AGENTS.md`) and `GEMINI.md` (`@./AGENTS.md`) contain only an import, which both agents expand when they load the file (a plain link is followed only if the agent decides to open it). Claude Code reads `AGENTS.md` directly from v2.1.277 when no `CLAUDE.md` exists, and does not load it twice through the import; the import covers older versions and sessions without that support. Agents that read `AGENTS.md` natively need no pointer file. Add instructions to `AGENTS.md` only, never to a pointer file.

## Known exceptions (baseline 2026-10-03)

Current departures from the rules, recorded so they are not mistaken for accepted behaviour. Each is fixed through the tool's own task.

| Area | Fact | Rule |
| --- | --- | --- |
| 21 tools | No standard spec and tracker yet (`pnpm tool:check --all`). Specs are the next workstream. | Documentation standard |
| 17 standardized tools | 54 requirements are `missing` (`pnpm tool:check --all`). | Default integration rule |

## Version pins and package sources

| Item | Fact |
| --- | --- |
| MediaBunny release age | `minimumReleaseAgeExclude` in `pnpm-workspace.yaml` lists `mediabunny@1.60.0`; that release is now older than the release-age window, so the entry has no effect. |
| OpenCV | `@techstark/opencv-js` 5.0.0-release.1 is a pre-release. |
| SheetJS | `xlsx` is installed from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`, not the npm registry. |
| JSZip | `web-layout-zip` is an alias for `npm:jszip@3.10.2`. |
| Build scripts | `allowBuilds`: `exifreader@4.45.2` allowed; `core-js` and `protobufjs` not allowed. |
| Overrides | `@colorhythm/libraw-wasm>typed-cstruct` 0.11.0, `lodash-es` 4.18.1. |

## Owner actions

- Import the two rulesets in `.github/rulesets/` (Settings → Rules → Rulesets → New ruleset → Import a ruleset): `branch-names.json` refuses creation of any branch other than `main`, `feature/*`, `expand/*`, `fix/*` and `dependabot/*`; `protect-main.json` blocks deleting or force-pushing `main`. The agent token in use cannot manage rulesets (HTTP 403).

## Open questions

| Since | Question |
| --- | --- |
| 2026-10-03 | Spec approval: does a new tool's spec need the owner's confirmation before its first merge (one touchpoint), or is it reviewed after merge (none)? Until decided, the current rule stands: a new tool's spec has `basis: approved` before its first merge. |
| 2026-10-03 | Dependabot security-update pull requests are still enabled. Keep them (the janitor lists them), or disable them and handle advisories through `fix/` branches? |
| 2026-10-03 | Category assignment of each tool was set during the catalog migration; review the categories on the home page. |
| 2026-10-02 | PlanCraft rename: shortlist Passway Studio, Doorline Studio; a USPTO search is still needed. |
| 2026-10-02 | Support link `https://buymeacoffee.com/aahplexx` (`src/lib/support.ts`): keep on a non-commercial site? |
| 2026-10-02 | MediaBunny: bump to 1.61.0, and align `MEDIABUNNY_PIN`? |
| 2026-10-02 | pnpm release-age: enforce it strictly? |

---
task: T-repository-search-indexing-20261005-aecd
doc: task
kind: expand
state: backlog
branch: main (repository-wide)
created: 2026-10-05
updated: 2026-10-05
---

# Crawlable per-tool URLs for search engines

## Request
Raised 2026-09-27 (PlanCraft) and 2026-09-28 (GeoJSON): tools use fragment routes (`#/tools/<slug>`), which Google Search Central says are not reliable separate content URLs, so no tool page can be indexed on its own. GitHub Pages serves static files only, so a fix means a static entry page per tool (generated at build time from the meta files) that loads the app.

## Resume here
Not started. Repository-wide; needs a plan before building (build-time page generation, canonical URLs, keeping hash routes working).

## Log
- 2026-10-05: moved from the retired `.tasks` lists (`IN_PROGRESS.md`, `NEXT.md`, `BACKLOG.md`); their last text is in git history at the commit before this one.

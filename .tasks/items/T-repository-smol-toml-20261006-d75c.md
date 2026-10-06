---
task: T-repository-smol-toml-20261006-d75c
doc: task
kind: fix
state: done
branch: main (repository-wide)
created: 2026-10-06
updated: 2026-10-06
---

# Update smol-toml to 1.9.0 (security)

## Request
Dependabot security update, pull request #118: smol-toml 1.8.0 to 1.9.0 fixes a denial-of-service flaw in parsing (GHSA-r4xh-jqrq-34v2). Owner: no open pull requests.

## Resume here
Done. Pull request #118 closed; the version is applied on main.

## Log
- 2026-10-06: package.json and the lockfile taken from the Dependabot branch; the specs that name the version updated.
- 2026-10-06: tsc clean; 345 unit files / 3,731 tests passed; build clean; browser specs for the three tools that import it (JSON Lattice, Markdown Workbench, Transcode): 194 passed on desktop and mobile.

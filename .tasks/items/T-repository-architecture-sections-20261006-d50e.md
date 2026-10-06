---
task: T-repository-architecture-sections-20261006-d50e
doc: task
kind: expand
state: done
branch: main (repository-wide)
created: 2026-10-06
updated: 2026-10-06
---

# Architecture and engine section in every tool spec

## Request
Owner, 2026-10-06: update all specs in a single pass with the new "Architecture and engine" section (libraries at exact versions, workers, storage, browser APIs, network).

## Resume here
Done. The docs check now fails a spec without the section, or one naming a library that is not a dependency at that exact version.

## Log
- 2026-10-06: section added to all 39 specs; every library version matches package.json (197 names); the 22 hosts named appear in the tools' code; worker claims checked against `new Worker` / `GlobalWorkerOptions` usage.
- 2026-10-06: scripts/check-doc-links.mjs and scripts/docs-sync.mjs changes no longer start the full browser suite (paths-ignore in pages.yml and focused-tool.yml); docs.yml runs for them.

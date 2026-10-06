---
task: T-geojson-simplifier-20261006-f6fe
tool: geojson-simplifier
doc: task
kind: expand
state: done
branch: expand/geojson-simplifier
created: 2026-10-06
updated: 2026-10-06
---

# Standard spec and tracker

## Request
Owner, 2026-10-05: enumerate every function per tool in its spec, including the owner's notes; repo wins where they differ.

## Resume here
Done. Spec [2026-10-05-geojson-simplifier-design.md](../../docs/superpowers/specs/2026-10-05-geojson-simplifier-design.md) and tracker [TRACKER.md](../../src/tools/geo/TRACKER.md) list 55 requirements (GJS-R01–R55). Next work is the tracker's Open work.

## Log
- 2026-10-06: claimed `expand/geojson-simplifier`.
- 2026-10-06: spec and tracker written: 55 requirements, verified 37, implemented 12, partial 4, missing 2, prohibited 0. `pnpm tool:check geojson-simplifier --base origin/main` 37/55, no errors; `pnpm docs:sync`, `pnpm docs:check` passed; the three Markdown-reading unit files passed.

---
task: T-site-intelligence-analyzer-20261005-6a8f
tool: site-intelligence-analyzer
doc: task
kind: expand
state: next
branch: expand/site-intelligence-analyzer
created: 2026-10-05
updated: 2026-10-05
---

# Close the remaining Site Intelligence ledger gaps

## Request
From the former PR #44 workstream (closed; the tool is on `main`): Feature 13 lacks its GeoIP minimap UI; Feature 6 needs a decision on client-safe redirect resolution; Features 11, 17 and 19 carry documented browser substitutions.

## Resume here
Not started. The ledger gaps are SIA requirements in [TRACKER.md](../../src/tools/site-intel/TRACKER.md): SIA-R16 (DNSSEC), SIA-R27 (Wayback), SIA-R29 (Certificate Transparency); the GeoIP minimap (SIA-R18) and explicit short-link resolution (SIA-R07) are `verified`.

## Log
- 2026-10-05: moved from the retired `.tasks` lists (`IN_PROGRESS.md`, `NEXT.md`, `BACKLOG.md`); their last text is in git history at the commit before this one.
- 2026-10-05: claimed `expand/site-intelligence-analyzer`.
- 2026-10-05: returned to `next`; the branch was used for task T-site-intelligence-analyzer-20261005-1db7 (standard spec and tracker).

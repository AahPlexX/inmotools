---
task: T-site-intelligence-analyzer-20261005-5f7e
tool: site-intelligence-analyzer
doc: task
kind: fix
state: next
branch: fix/site-intelligence-analyzer
created: 2026-10-05
updated: 2026-10-05
---

# Port the archived Site Intelligence audit fixes (TASK-029)

## Request
**Priority:** P1 | **Tags:** site-intel, correctness, lost-work

Tag `archive/site-intel-local-20260918` (commits `f8e79f8c`…`73a6f080`, 2026-09-17/18) holds a separate line of Site Intel work that never reached `main`; `main` got the other line from `feature/site-analysis-workstation`. None of the archived audit's fixes are on `main` (checked 2026-10-02):

- DNS lookup failures are reported as "record absent" in seven checks (IPv6 readiness, CAA, DNSSEC, MX, SPF, DMARC, BIMI) and the DNSBL summary, so a network blip shows as a security finding. The archive adds `queryFailed()` in `doh-client.ts` and gates each finding on it.
- `validateSpf` builds a RegExp from an unescaped hostname (`email-auth-engine.ts` line 54 on `main`).
- SAN list silently truncated at 50; archive adds "…and N more".
- Click-to-copy on URL tokens and DNS answers, Wayback per-year counts, raw per-engine telemetry in the JSON export, and a keyboard-accessible list beside the node graph.
- The archived `TRACKING.md` holds 121 lines of verification evidence (main's has 19).

The two lines diverge (for example `GeoMinimap.tsx` and `shortener-resolver.ts` on the archive, `GeoIpMap.tsx` on main), so this is a feature-by-feature port onto main's code with tests, not a merge. Keep the tag until this task is done.

## Resume here
Not started. Port each listed fix from tag `archive/site-intel-local-20260918` onto current `main` with a test per fix; record each in [TRACKER.md](../../src/tools/site-intel/TRACKER.md): SIA-R12, SIA-R37, SIA-R31, SIA-R09, SIA-R28, SIA-R84, SIA-R22.

## Log
- 2026-10-05: moved from the retired `.tasks` lists (`IN_PROGRESS.md`, `NEXT.md`, `BACKLOG.md`); their last text is in git history at the commit before this one.
- 2026-10-05: the listed fixes are SIA requirements in the standard tracker (task T-site-intelligence-analyzer-20261005-1db7).

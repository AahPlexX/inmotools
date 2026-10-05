---
tool: cron-team-matrix
folder: src/tools/cron
doc: spec
basis: as-built
status: done
spec: docs/superpowers/specs/2026-10-01-cron-team-matrix-design.md
tracker: src/tools/cron/TRACKER.md
updated: 2026-10-01
---

# Cron Team Matrix — spec

As built at `31b21f2c` (last change under `src/tools/cron/`). Requirement prefix: `CRN`. Status of each requirement: [TRACKER.md](../../../src/tools/cron/TRACKER.md).

## Purpose

Show when a cron schedule will actually run, in the timezone it is defined in and in every timezone a distributed team works in, so DevOps engineers and administrators can check maintenance and deploy windows before scheduling them.

## Scope

In scope:
- Upcoming runs of one cron expression from a fixed reference instant.
- Projection of each run into a list of IANA timezones, with working-hours labels and upcoming UTC-offset changes.
- CSV and finite iCalendar export.

Out of scope:
- Running or scheduling jobs: the tool only calculates; nothing is executed.
- Open-ended calendar recurrence (`RRULE`): exports list the calculated occurrences only, so a calendar never extends a schedule beyond what was checked.

## Constraints

- Platform rules: no accounts, no server or database, everything runs in the browser ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- Cron parsing uses the pinned `cron-parser` 5.10.1; timezone conversion uses the browser's `Intl` APIs, so the timezone list and rules are the browser's.
- No network requests.

## Requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| CRN-R01 | Five- and six-field cron expressions produce ordered upcoming runs, calculated in the source timezone | Runs are in order and match the expression in the source zone |
| CRN-R02 | Six-field expressions keep seconds in every displayed and exported time | A `17 * * * * *` schedule shows `:17` seconds |
| CRN-R03 | An invalid cron expression shows a plain error message and the workspace stays usable | Typing an invalid expression shows the error without a page error |
| CRN-R04 | The number of runs is configurable from 1 to 200 and clamped | Values outside 1–200 are refused or clamped |
| CRN-R05 | Runs are calculated from a fixed reference instant that needs `Z` or an explicit offset, rejects impossible dates, and changes only when edited or refreshed with "Refresh from now" | Reference stays fixed across re-renders and exports; `2026-02-30T…` is rejected |
| CRN-R06 | An unrecognized source timezone shows a message naming the problem, without crashing | `Mars/Olympus` as source shows the message; no page error |
| CRN-R07 | Comparison timezones accept one per line or comma-separated; duplicates are collapsed, unrecognized names are listed and left out, and at most 24 are compared | Mixed list is split into valid, duplicate, invalid and over-limit |
| CRN-R08 | Timezone search over the browser's supported zones, starts-with matches first, up to 12 results; choosing one adds it to the comparison list | Searching "Tokyo" offers `Asia/Tokyo`; choosing it adds a column |
| CRN-R09 | The source timezone is always one of the matrix columns | Source zone column present with any comparison list |
| CRN-R10 | Each run is shown in every selected timezone with date, time to the second and UTC offset | One instant projected into several zones shows each offset |
| CRN-R11 | The next run is summarized with its source-zone time, UTC instant and the reference instant | Next-run panel shows the first run and the reference |
| CRN-R12 | A working-hours window (start and end hour, overnight allowed) labels every cell in text as inside or outside working hours | Cells read "working hours" or "outside working hours"; overnight window handled |
| CRN-R13 | Upcoming UTC-offset changes of the source timezone within 370 days are listed, or a note says none were found | New York lists its two changes; UTC shows the none-found note |
| CRN-R14 | A 24-hour distribution counts runs per source-zone hour | Counts per hour match the calculated runs |
| CRN-R15 | The run table is paged at 50 rows per page | More than 50 runs produce a second page |
| CRN-R16 | Export the matrix as CSV (run, UTC instant, one column per timezone) | Downloaded CSV contains the runs |
| CRN-R17 | Export the calculated runs as an RFC 5545 calendar with one event per run, no recurrence rule, and 75-octet line folding | `.ics` contains only the calculated events; long lines folded |
| CRN-R18 | No serious or critical axe violations | Catalog-wide accessibility spec for this route |
| CRN-R19 | No horizontal overflow and controls usable from 320 px to 2560 px | Viewport check at the standard widths |
| CRN-R20 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) | Workspace switches with the site theme; axe passes in both themes |
| CRN-R21 | Calendar event duration is editable (1 minute to 24 hours) | Exported events use the chosen duration |
| CRN-R22 | Inputs are saved in this browser and restored on the next visit | Reload restores expression, zones and window |
| CRN-R23 | A plain-language reading of the expression (for example "At 09:00, Monday to Friday") | Reading matches the expression |
| CRN-R24 | A shareable link holds the inputs and restores them when opened | Opening the link restores the inputs |
| CRN-R25 | Export the matrix as JSON | JSON contains runs and per-zone times |

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Intent not recorded

- None.

## Change log

- 2026-10-02 — Added CRN-R21, CRN-R22, CRN-R23, CRN-R24, CRN-R25 under the default integration rule (ideas that fit the platform rules become requirements).
- 2026-10-01 — Created as an as-built spec from `src/tools/cron/`, the catalog entry and the tool's tests.

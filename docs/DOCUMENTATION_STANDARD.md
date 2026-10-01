---
doc: standard
updated: 2026-10-01
---

# Documentation standard

This file defines where every tool's documentation lives and what it must contain, so that any agent or person can stop at any point and another can resume without guessing. It is binding through `GOVERNANCE.md` (SSOT directory). It governs documentation only; it does not change how code is written.

## The four documents per tool

| # | Document | Path | Purpose |
| --- | --- | --- | --- |
| 1 | Spec (the tool PRD) | `docs/superpowers/specs/<YYYY-MM-DD>-<slug>-design.md` | Defines the tool and what "complete" means: every requirement has an ID and an acceptance test. |
| 2 | Tracker | `src/tools/<folder>/TRACKER.md` | Live state against the spec: status and evidence per requirement, where to resume, open work, limits. |
| 3 | Task state | `.tasks/` (`IN_PROGRESS.md`, `NEXT.md`, `BACKLOG.md`, `DONE.md`, `WORK_LOG.md`, `REJECTED.md`) | Repository-wide status, governed by `GOVERNANCE.md` §7 and `.tasks/PROJECT_COMPLETION.md`. |
| 4 | Index row | `docs/TOOL_INDEX.md` | One line per tool joining all of the above. Start here. |

Plans in `docs/superpowers/plans/` are historical build records. They are optional and are linked from the tracker, never created after the fact.

## Join key

The catalog slug (`slug` in `src/catalog.ts`, e.g. `geo-intelligence-hub`) is the one key used everywhere. Folder names and display names differ from slugs (`svg`, `music`, `audio`) and change over time; slugs do not, because URLs and saved data depend on them.

## Header block (every spec, tracker and standard document)

Each file starts with this block. Field names and values are fixed so that one search finds everything.

```yaml
---
tool: <slug>
folder: src/tools/<folder>
doc: spec            # spec | tracker | standard | index
basis: as-built      # as-built | approved
status: active       # active | done | paused
spec: docs/superpowers/specs/<file>.md
tracker: src/tools/<folder>/TRACKER.md
updated: YYYY-MM-DD
---
```

- `basis: as-built` — the spec records what the code, tests and catalog show at a stated commit. It is the working baseline.
- `basis: approved` — the owner has confirmed the intent. A spec moves from `as-built` to `approved` only on the owner's confirmation, recorded in its change log.

## Finding things

```sh
grep -rl "^tool: <slug>$" docs src .tasks      # every document for one tool
grep "<slug>" docs/TOOL_INDEX.md               # the tool's whole record, one line
grep -rn "<PREFIX>-R07" docs src .tasks        # one requirement everywhere it is cited
grep -rln "^status: active$" src/tools         # trackers with work in progress
```

## Requirement IDs and statuses

- Each tool has a short upper-case prefix recorded in its index row (e.g. `GIH`). The prefix, like the slug, never changes when the tool is renamed. Requirements are `<PREFIX>-R01`, `<PREFIX>-R02`, …; IDs are never reused or renumbered. A dropped requirement keeps its ID with status `not planned` and a reason.
- One requirement per table row, on one line.
- Status values (no others):
  - `verified` — implemented and covered by a named test or recorded check; the evidence column cites it.
  - `implemented` — present in the code; no covering test found.
  - `partial` — some of the acceptance criteria are met; the tracker says which.
  - `missing` — required but not present.
  - `not planned` — deliberately excluded; the reason is stated.

## Spec (PRD) contents

```markdown
<header block, doc: spec>

# <Display name> — spec

## Purpose
One paragraph: the problem it solves and for whom.

## Scope
In scope / out of scope (each out-of-scope item with its reason).

## Constraints
Repository constraints that apply (static GitHub Pages hosting, local-first privacy, dependency policy, …) and tool-specific ones.

## Requirements
| ID | Requirement | Acceptance test |
| --- | --- | --- |

## Non-functional requirements
Responsive layout, accessibility, performance, offline behaviour, export validity — each as an ID'd row in the table above.

## Definition of done
The tool is complete when every requirement is `verified` or `not planned`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Intent not recorded
Requirements whose intended behaviour could not be established from the code, tests or existing records. Each item names what is unknown; the owner resolves it.

## Change log
Dated entries, newest first.
```

## Tracker contents

```markdown
<header block, doc: tracker>

# <Display name> — tracker

## Resume here
Current state in one sentence, the next action, and any blocker. Updated at every stop.

## Documents
Links to the spec, plans, research notes, older tracking files and task-state entries.

## Requirement status
| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |

## Open work
Ordered list; each item cites requirement IDs.

## Known limitations

## Verification evidence
Commands run, results and the commit they ran on, newest first.

## Change log
Dated entries, newest first.
```

## Writing rules

- **Keep each fact on one line.** Do not hard-wrap prose, table rows or field values in new or edited text. Existing files are not reflowed.
- **No commentary.** State facts and their source (file, test, commit). No confidence statements, speculation or reasoning narrative (`GOVERNANCE.md` §6).
- **Link, don't copy.** Point to the spec, tracker, test or commit rather than restating them.
- **Keep existing documents.** Older tracking files (`HANDOFF.md`, `TRACKING.md`, `STATUS.md`, `FEATURE_MATRIX.md`, `README.md`, `TODO.md`, `.tasks/PHOTO_STUDIO.md`) keep their names and content; `TRACKER.md` links to them.
- **Keep history as written.** Completed records in `.tasks/` and older plans keep the names used at the time; the index records former names as aliases.

## Keeping it current

- Update the tracker's "Resume here" and requirement status in the same commit as the work they describe.
- Update the index row whenever a tool's spec, tracker, name or status changes.
- A tool whose tracker, spec and task state disagree is not complete (`.tasks/PROJECT_COMPLETION.md`).

## Change log

- **2026-10-01:** Created. Defines the spec (PRD), tracker, task-state and index documents per tool, the header block, requirement IDs and statuses, and the writing rules.

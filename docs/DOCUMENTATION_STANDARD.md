---
doc: standard
updated: 2026-10-03
---

# Documentation standard

This file defines where every tool's documentation lives and what it must contain, so that any agent or person can stop at any point and another can resume without guessing. It is binding through `GOVERNANCE.md`, which holds the universal rules and the work cycle; owner decisions and exceptions are in [DECISIONS.md](DECISIONS.md). It governs documentation only; it does not change how code is written.

## Platform rules (apply to every tool and every spec)

- **No user accounts or authentication.** No sign-in, sign-up, sessions, tokens or user identity, ever.
- **No server and no server-side database.** The site is static files on GitHub Pages: no backend, API proxy, serverless function or hosted database.
- **Everything runs in the browser.** Processing happens on the user's device; data the tool keeps is stored only in that browser (IndexedDB, localStorage, the Cache API) and is never uploaded to a service the repository operates.
- **Network use is limited** to fetching the site's own static files and, where a tool needs it, public keyless sources requested by the user's own action (no API keys or credentials).

Every spec restates these rules under Constraints, and a requirement that conflicts with them is `prohibited` with the rule cited.

### Default integration rule

If a function or feature can be built into a tool and it stays within the platform rules above (browser only, no auth, no database, works on GitHub Pages), it is integrated, and the integration is documented in the tool's spec, tracker and `.tasks/` entry.

- `prohibited` is allowed only when the feature breaks a platform rule, breaks a third-party source's terms or licence, needs an API key or account, uses a large language model (see below), or cannot run in a browser. The reason names which one.
- A feature that is not wanted for any other reason is not recorded at all: no row, no "not planned" note. Records list only what is built, what is to be built, and what is prohibited.
- Records written before 2026-10-04 may say `not planned`; it means `prohibited`.
- Design preference, effort or "the rest of the site does not do this" is not a reason; such a feature is `missing` and goes on the tracker's Open work list.
- This covers ideas as well as requests: a useful addition found while documenting or building a tool that fits the platform rules becomes an ID'd requirement (`missing`) straight away, without waiting for approval. "Intent not recorded" is only for questions the rules cannot settle (a choice between two valid behaviours, a cost, a licence or terms question).
- A tool's title, summary and catalog copy must not promise anything the tool does not do. A promised feature that is not built is a `missing` requirement until it is built.

### What counts as a spec

A tool's README or notes file is never its spec. "Complete" is defined only by a spec with ID'd requirements and a tracker that gives each one a status. A tool without both is `pending` in the index, however much prose it has.

### Before deleting a branch or tag

Compare every file the ref changed against `main`, and check that each commit's new functions and tests exist on `main`. Port anything missing first. Tags named `archive/*` are kept until an open task that cites them is done.

## Naming convention (approved 2026-10-02)

Tool names follow `<distinctive name> <role word>`, at most 30 characters in total.

- **Distinctive name:** a built-up word made from plain words that hint at the job (in the style of "AutoMix"), not a common phrase. Its parts are not reused by another tool on the site.
- **Role word**, one of: Studio (create or edit), Workbench (load, analyse or query), Inspector (look inside without changing), Cleaner (remove sensitive data), Converter, Planner, Trainer.
- **Page title:** `<name> — <what it does in plain words> | InMo Tools`. The plain-words part is what search results show; keywords are not repeated.
- **Before adoption:** search the USPTO trademark database and a web search for software in the same field; a name already used for related software is rejected. The checks and their date go in the tool's spec change log.
- **When renaming:** change the catalog `shortTitle`/`title`, visible text, export "creator" metadata and the tests that assert them. Never change the slug, folder, storage keys or format IDs. Record the old name in the index's "Former names" column.
- Names the owner has kept are exempt: Geo Intelligence Hub, RegexMatrix Studio & Academy.

## The four documents per tool

| # | Document | Path | Purpose |
| --- | --- | --- | --- |
| 1 | Spec (the tool PRD) | `docs/superpowers/specs/<YYYY-MM-DD>-<slug>-design.md` | Defines the tool and what "complete" means: every requirement has an ID and an acceptance test. |
| 2 | Tracker | `src/tools/<folder>/TRACKER.md` | Live state against the spec: status and evidence per requirement, where to resume, open work, limits. |
| 3 | Task file | `.tasks/items/<task id>.md` (one per piece of work; created by `pnpm task:start`) | The request, where to resume, and a dated log; `state` is the work's status. `.tasks/ITEMS.md` lists them (generated). The older `.tasks/*.md` files are history. |
| 4 | Index row | `docs/TOOL_INDEX.md` | One line per tool joining all of the above; Name, Folder, Tracker and Standard are regenerated by `pnpm docs:sync`. Start here. |

The catalog record itself is `src/tools/<folder>/<slug>.meta.ts`: name, title, catalog copy, category, legacy route aliases and the workspace loader. `src/catalog.ts` collects every meta file, so the home-page link and the `#/tools/<slug>` route exist as soon as the file does.

Plans in `docs/superpowers/plans/` are historical build records. They are optional and are linked from the tracker, never created after the fact.

## Join key

The catalog slug (the meta file name and its `slug` field, e.g. `geo-intelligence-hub`) is the one key used everywhere. Folder names and display names differ from slugs (`svg`, `music`, `audio`) and change over time; slugs do not, because URLs and saved data depend on them.

## Adding a new tool

1. `pnpm task:start <slug> new "<title>"` (branch `feature/<slug>`, own worktree, task file).
2. A spec (PRD) at `docs/superpowers/specs/<YYYY-MM-DD>-<slug>-design.md` written before implementation (see "From a request to a spec"), with a requirement prefix that is unique across `docs/TOOL_INDEX.md` (stated in the spec as "Requirement prefix: `ABC`."). The spec has `basis: approved` (owner confirmation) before the first merge; see the open question in [DECISIONS.md](DECISIONS.md#open-questions).
3. `src/tools/<folder>/<slug>.meta.ts` (copy an existing one) and the workspace it loads. The display name follows the naming convention.
4. A `src/tools/<folder>/TRACKER.md` listing every spec requirement, with **Resume here** filled in.
5. `pnpm docs:sync` adds the index row; fill in the hand-kept columns (Plans, Other docs, Former names) if they apply.

`integrate.yml` runs `pnpm tool:check <slug> --strict` for a `feature/` branch, so a new tool without a standard spec and tracker is not merged. It may merge before it is complete; the tracker shows what is left. After the first merge, continue on `expand/<slug>`.

Optional per-tool documents (plans, research notes, audits) are linked from the tracker.

## Task file

```yaml
---
task: T-<slug>-<yyyymmdd>-<hash>   # same as the file name; never reused
tool: <slug>                       # omitted for repository-wide work
doc: task
kind: new                          # new | expand | fix
state: active                      # active | next | backlog | done | rejected
branch: feature/<slug>
created: YYYY-MM-DD
updated: YYYY-MM-DD
---
```

Sections: **Request** (verbatim), **Resume here**, **Log** (dated, newest last). At `done`, the log cites the integrating commit and `tool:check` result; at `rejected`, the reason.

## From a request to a spec

A request (a prompt, message or plan) becomes requirements before any code is written:

1. Split the request into single, testable functions; one requirement per function, each with its own ID.
2. Write each requirement as observable behaviour ("Exports the location as GeoJSON with longitude before latitude"), not as an implementation step.
3. Give each requirement an acceptance test that a reviewer could run or check.
4. Put anything the request did not settle under **Intent not recorded** and ask the owner; do not decide it silently.
5. Record exclusions as `prohibited` only under the [default integration rule](#default-integration-rule), with the reason.
6. The owner confirms the list; the spec header changes to `basis: approved` and the change log records the date.

Later requests add new IDs; existing IDs are never renumbered.

## Branch workflow

`origin/main` is the only long-lived branch. Work happens on `feature/<slug>`, `expand/<slug>` or `fix/<slug>` in its own worktree, created by `pnpm task:start`; other names are refused. The steps are in `GOVERNANCE.md` §3; in short:

```sh
pnpm task:start <slug> expand "<title>"
cd ../inmotools-<slug>
# work; commit with the tracker and task file updated; push after every working step
git fetch origin && git merge origin/main      # sync often; resolve conflicts here, never on main
pnpm tool:check <slug>
git push                                       # integrate.yml merges into main and deletes the branch
```

- There are no pull requests; the daily janitor closes any that are opened for these branches and deletes fully merged branches.
- Never force-push or rewrite `main`.
- A branch that changes `.github/workflows/` is merged into `main` by hand after the same checks (a workflow token cannot push workflow files).

### Shared folders

When two tools share one folder (for example `src/tools/music/` holds MIDI Harmony Lab and Audio Mastering), each tracker is named `<TOOL>_TRACKER.md` (for example `HARMONY_TRACKER.md`) and its header `tracker:` field gives that path.

## Header block (every spec, tracker and standard document)

Each file starts with this block. Field names and values are fixed so that one search finds everything.

```yaml
---
tool: <slug>
folder: src/tools/<folder>
doc: spec            # spec | tracker | task | standard | index | decisions
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

- Each tool has a short upper-case prefix recorded in its index row (e.g. `GIH`). The prefix, like the slug, never changes when the tool is renamed. Requirements are `<PREFIX>-R01`, `<PREFIX>-R02`, …; IDs are never reused or renumbered. A dropped requirement keeps its ID with status `prohibited` and a reason.
- One requirement per table row, on one line.
- Status values (no others):
  - `verified` — implemented and covered by a named test or recorded check; the evidence column cites it.
  - `implemented` — present in the code; no covering test found.
  - `partial` — some of the acceptance criteria are met; the tracker says which.
  - `missing` — required but not present.
  - `prohibited` — must not be built; the reason names the platform rule, term, licence, key, LLM or browser limit. Agents do not build, propose or partially build a prohibited feature.

### Machine learning and AI

- **Large language models (LLMs) are prohibited** in every tool, whether hosted or run in the browser: hosted LLMs need API keys or accounts, and LLM output is not reliable enough for a tool's results. "AI" in this repository means LLMs.
- **Other machine learning (ML) is permitted** when it runs entirely in the browser (for example a model in WebAssembly, WebGPU or ONNX Runtime Web), needs no key or account, and its model and weights may be redistributed under their licence.
- There are no user accounts, so ML that learns from one user over a long time is not built; a model may adapt within a session or from data the user explicitly loads.
- ML is not required anywhere. The comparison below is made only when a function could reasonably be built either with or without ML; it is not applied to every function.

When a function could use ML or a non-ML method, decide with this ruleset and record it in the spec:

1. **Gates (pass or fail, both candidates):** runs fully in the browser on the site's own files; no key, account or server; licence of code, model and weights allows redistribution on this site; data stays on the device; not an LLM. A candidate that fails a gate is out.
2. **Same test set:** evaluate every remaining candidate on the same inputs, chosen before the evaluation and representative of the function's real use (record them in `tests/fixtures/`).
3. **Score each criterion 0–5 from measurements, not opinion,** then weight:

   | Criterion | Weight | Measured as |
   | --- | --- | --- |
   | Result quality | 40 | The function's own metric on the test set (accuracy, error, perceptual score) |
   | Reliability | 20 | Same input gives the same result; failure rate; behaviour on bad input |
   | Speed and memory | 15 | Time and peak memory on a mid-range phone and a desktop |
   | Download size | 10 | Bytes added to load the function (model and runtime included) |
   | Maintainability | 15 | Code and dependencies to keep current; how results can be checked |

4. **Choose the higher total.** A tie, or a difference under 5 points, goes to the non-ML method (simpler to verify). Do not favour either kind for novelty or familiarity.
5. **Record** in the spec under "Technique decisions": the function's requirement ID, date, candidates, gate results, test set, measurements, scores, choice, and sources with dates. The decision holds for that date; it is revisited only when a requirement changes or a candidate's facts change (new model, licence, browser support).

### Flag: awaiting physical testing by human

Some acceptance criteria cannot be checked by an automated browser test: real hardware (Web Serial, Web Bluetooth, MIDI devices, cameras, microphones), real audio output, printing, or a physical device's sensors. For these:

- Automate everything that can be automated (simulator modes, offline renderers, fakes of the browser API), and cite those tests in the evidence column.
- Put the flag `[awaiting physical testing by human]` at the start of the Notes column, followed by what still needs a person: device or setup, steps, expected result.
- The status is `partial` when automated tests cover part of the criteria, `implemented` when none can. A flagged row is never `verified`; `pnpm tool:check` reports an error if it is, and lists flagged rows separately.
- When a person has done the check, they remove the flag, set `verified`, and cite it in the evidence column as `manual: <YYYY-MM-DD>, <device / browser / OS>, <result>`. A failed check sets `partial` or `missing` with what failed.
- The flag is used only when automation is impossible, never because a test is hard to write.

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
The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Technique decisions
Only for functions where ML and a non-ML method were compared (see "Machine learning and AI"): one entry per decision.

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

- **2026-10-04:** `not planned` replaced by `prohibited`; unwanted features are not recorded; LLMs prohibited; ML permitted under the ML ruleset.
- **2026-10-03:** Added the `[awaiting physical testing by human]` flag for criteria that need real hardware or a person.
- **2026-10-03:** Catalog records moved to per-tool meta files; task state moved to per-task files (`.tasks/items/`); index columns regenerated by `pnpm docs:sync`; branch workflow replaced by `task:start` and integration on push.
- **2026-10-02:** Ideas that fit the platform rules become requirements automatically; catalog copy may not promise unbuilt features; naming convention approved by the owner.
- **2026-10-02:** Markdown-only pushes skip the full CI suite; `.github/workflows/docs.yml` checks links in the standard documents (`scripts/check-doc-links.mjs`) and runs the unit tests that read Markdown.
- **2026-10-01:** Added the default integration rule: anything buildable within the platform rules is integrated and documented; `not planned` narrowed to platform, terms, licence, key or browser limits.
- **2026-10-01:** Added the platform rules, the requirements for adding a new tool, the request-to-spec procedure and the feature-branch/worktree workflow.
- **2026-10-01:** Created. Defines the spec (PRD), tracker, task-state and index documents per tool, the header block, requirement IDs and statuses, and the writing rules.

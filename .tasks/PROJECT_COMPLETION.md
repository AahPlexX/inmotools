# Project Completion Contract

This file defines the finish line for the `inmotools` repository. It is a completion contract, not a progress tracker.

Live progress is in the task files in `items/` (one per piece of work, `state: active | next | backlog | done | rejected`; listed in the generated `ITEMS.md`) and, per tool, in the tracker. Completion of a tool's requirements is computed by `pnpm tool:check <slug>`. `DONE.md`, `WORK_LOG.md` and `REJECTED.md` are the record from before task files; `IN_PROGRESS.md`, `NEXT.md` and `BACKLOG.md` are retired and only list where their entries went.

## Completion states

### Workstream complete

A tool, feature, audit, or other workstream is complete only when all of the following are true:

1. Its approved requirements and acceptance criteria are implemented; no exposed control is decorative or knowingly inert.
2. Any required focused tests pass, the production TypeScript build passes, and applicable browser coverage passes from fresh evidence.
3. Required responsive and accessibility behavior is verified for the workstream's supported interaction surfaces.
4. Exported or persisted output is validated where the workstream produces files, serialized data, or saved state.
5. Any material defect found during validation is fixed or recorded in its own task file (`state: next` or `backlog`); it may not disappear from tracking.
6. Intended work is integrated into `origin/main`; no completed portion exists only on a temporary branch.
7. `pnpm tool:check <slug>` reports every requirement `verified` or `prohibited` with no errors, and the task file is `state: done` with the integrating commit and validation evidence in its log.

### Current release complete

The current release is complete only when:

1. Every `active` task file is workstream-complete, or set to `next`, `backlog` or `rejected` with the reason.
2. The repository's required validation workflows are green on the exact integrated `origin/main` revision.
3. GitHub Pages deployment for that integrated revision is successful when the changed scope affects the deployed application.
4. `origin/main` is not behind any branch containing intended completed work, and no completed work is stranded on another branch.
5. A task audit finds no known blocker inside the release scope without a task file.

### Project complete

The project is complete only when all of the following are simultaneously true:

1. The current release is complete.
2. No task file is `active`, `next` or `backlog`. Anything intentionally excluded is `rejected` with its reason, or recorded as a `prohibited` requirement.
3. Every registered tool and shared application surface satisfies its approved requirements, critical workflow, responsive behavior, accessibility obligations, and export/persistence contract where applicable.
4. Repository documentation describes the shipped system rather than an earlier implementation state.
5. Fresh validation and deployment evidence exists for the final `origin/main` revision.

Future user-approved scope may reopen a project previously considered complete; the new work gets a task file before implementation begins.

## Progress freshness invariant

Progress tracking must change whenever project state changes. A substantive implementation may not silently outrun the task files.

- Starting accepted work: `pnpm task:start` creates or activates the task file (`state: active`) before the first substantive change.
- Milestone change: update the task file's **Resume here** and the tracker in the same commit.
- Newly discovered material work: create a task file (`state: next` or `backlog`) before ending the execution cycle.
- Completion: set `state: done` only after fresh evidence satisfies the applicable gates above.
- Rejection/deferment: set `state: rejected` or `backlog` with the reason; never delete a task file to make the count reach zero.
- Parallel branches: temporary branches do not create separate completion truth; their task files reconcile into `main` when integrated.

If repository state and the task files disagree, the repository is **not complete** until they are reconciled. A stale tracker is itself an open completion blocker.

## Scope discipline

Completion is determined from explicit accepted scope, not from an arbitrary feature count. New ideas do not prevent completion unless they have a task file or are requirements in a spec. An accepted item cannot be omitted from the finish line without being rejected or deferred with its reason.

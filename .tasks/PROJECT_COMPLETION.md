# Project Completion Contract

This file defines the deterministic finish line for the `inmotools` repository. It is a completion contract, not a second progress tracker.

Live progress remains authoritative in:

- `IN_PROGRESS.md` — work that is actively being executed, including the current milestone for each active workstream.
- `NEXT.md` — accepted work that is not yet active.
- `BACKLOG.md` — deferred or uncommitted scope.
- `DONE.md` — completed task records.
- `REJECTED.md` — explicitly rejected work.
- `WORK_LOG.md` — concise historical completion evidence.

## Completion states

### Workstream complete

A tool, feature, audit, or other workstream is complete only when all of the following are true:

1. Its approved requirements and acceptance criteria are implemented; no exposed control is decorative or knowingly inert.
2. Any required focused tests pass, the production TypeScript build passes, and applicable browser coverage passes from fresh evidence.
3. Required responsive and accessibility behavior is verified for the workstream's supported interaction surfaces.
4. Exported or persisted output is validated where the workstream produces files, serialized data, or saved state.
5. Any material defect found during validation is fixed or explicitly moved to `NEXT.md`/`BACKLOG.md` with rationale; it may not disappear from tracking.
6. Intended work is integrated into `origin/main`; no completed portion exists only on a temporary branch.
7. The corresponding entry is removed from `IN_PROGRESS.md`, recorded in `DONE.md`, and summarized in `WORK_LOG.md` with the actual validation/deployment evidence.

### Current release complete

The current release is complete only when:

1. Every item in `IN_PROGRESS.md` is workstream-complete or explicitly rejected/deferred into the appropriate task-state file.
2. Every item explicitly designated as release-blocking in `NEXT.md` is complete, rejected, or deliberately moved out of the release scope with recorded rationale.
3. The repository's required validation workflows are green on the exact integrated `origin/main` revision.
4. GitHub Pages deployment for that integrated revision is successful when the changed scope affects the deployed application.
5. `origin/main` is not behind any branch containing intended completed work, and no completed work is stranded on another branch.
6. A TODO/task-state audit finds no untracked known blocker inside the release scope.

### Project complete

The project is complete only when all of the following are simultaneously true:

1. The current release is complete.
2. `IN_PROGRESS.md`, `NEXT.md`, and `BACKLOG.md` contain no remaining accepted project work. Anything intentionally excluded must be in `REJECTED.md`, not silently ignored.
3. Every registered tool and shared application surface satisfies its approved requirements, critical workflow, responsive behavior, accessibility obligations, and export/persistence contract where applicable.
4. Repository documentation describes the shipped system rather than an earlier implementation state.
5. Fresh validation and deployment evidence exists for the final `origin/main` revision.

Future user-approved scope may reopen a project previously considered complete; the new work must enter the task-state system before implementation begins.

## Progress freshness invariant

Progress tracking must change whenever project state changes. A substantive implementation may not silently outrun `.tasks`.

- Starting accepted work: add or move it into `IN_PROGRESS.md` before or with the first substantive implementation change.
- Milestone change: update the workstream's current milestone in `IN_PROGRESS.md` in the same execution cycle.
- Newly discovered material work: record it in `NEXT.md` or `BACKLOG.md` before ending the execution cycle.
- Completion: move the work out of `IN_PROGRESS.md` and record it in `DONE.md` plus `WORK_LOG.md` only after fresh evidence satisfies the applicable gates above.
- Rejection/deferment: move it to the matching state file with rationale; never delete known work merely to make the completion count reach zero.
- Parallel branches: temporary branches do not create separate completion truth. Their intended state must reconcile into the main `.tasks` records when work is integrated.

If repository state and `.tasks` disagree, the repository is **not complete** until they are reconciled. A stale tracker is itself an open completion blocker.

## Scope discipline

Completion is determined from explicit accepted scope, not from an arbitrary feature count. New ideas do not prevent completion unless they are accepted into `NEXT.md`, `BACKLOG.md`, or `IN_PROGRESS.md`. Conversely, an accepted item cannot be omitted from the finish line without being explicitly rejected or deferred.

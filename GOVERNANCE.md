# Repository Governance

**As of:** 2026-08-31

This file is the north-star single source of truth (SSOT) for repository governance. It applies to every human or automated actor performing Create, Read, Update, or Delete operations in this repository.

A current human request and this governance file must both be satisfied. If they conflict, stop the affected work and report the conflict rather than silently choosing one or rewriting governing intent.

## SSOT directory

Use these verified repository locations as the authoritative directory for their respective concerns:

- `GOVERNANCE.md` — binding repository-mutation rules and governance history.
- `README.md` — project architecture, privacy model, and local-development overview.
- `package.json` — executable project scripts and dependency declarations.
- `.github/workflows/pages.yml` — CI validation and GitHub Pages deployment pipeline.
- `.tasks/` — repository task-tracking state when task planning is in use.
- `docs/superpowers/specs/` — project design/specification records.
- `docs/superpowers/plans/` — project implementation-plan records.

Do not invent a referenced path, file, section, command, branch, or policy. Verify that every reference resolves before relying on it and re-check references after governance changes.

## Binding CRUD lifecycle

### 1. Forensically verify before every write

Before changing repository state:

1. Read the current target files and nearby governing context.
2. Verify the current repository, branch, branch tip, branch inventory, CI configuration, and relevant task state from direct evidence.
3. If a local checkout exists, inspect its working tree and preserve any uncommitted changes not created by the current operation. Never discard or overwrite unknown work.
4. If execution is remote-only and no local working tree exists, state that fact in the human-facing report; do not invent a working-tree status.
5. Re-read branch state immediately before a write when concurrent changes are possible.

Repository facts must come from the repository or its hosting service, not from memory.

### 2. Require evidence before acting

Do not guess, assume, fabricate, or present inference as fact.

For externally verifiable decisions, standards, APIs, conventions, or tooling behavior:

- research current authoritative or primary sources;
- use enough corroborating evidence to reach at least 95% evidence-based confidence before acting;
- resolve conflicting authoritative information before proceeding; and
- record the sources and as-of dates in the human-facing completion report, not in client-facing code or incidental repository commentary.

If the required confidence cannot be reached, stop the dependent work and report the missing evidence as a blocker.

### 3. Plan in both directions before execution

For every substantive task group, reconcile two passes before writing:

- **Forward:** start from the verified current state and enumerate candidate steps, dependencies, operations, and downstream effects.
- **Backward:** start from the definition of done and enumerate every condition that must be true at completion.

Every execution step must satisfy a required end condition, and every required end condition must have a covering step. Drop steps with no goal justification and fill uncovered goal conditions before execution.

Before the plan is final, actively test it for syntax errors, semantic errors, dependency/order failures, branch-integrity violations, conflicts with existing content, regressions, edge cases, secret exposure, and unverifiable assumptions. Iterate until no remaining identifiable issue blocks the converged plan. Unresolvable issues become named blockers; do not improvise past them.

### 4. Preserve the `origin/main` invariant

`origin/main` is the authoritative branch.

Before writing, verify current branch topology and repository integration mechanics. Temporary working branches are allowed, but at integrated completion:

- all intended changes must have reached `origin/main`;
- `origin/main` must not be behind any other branch;
- no completed work may remain stranded only on another branch.

Use only the integration mechanism evidenced by the repository configuration. Do not force-push, rewrite shared history, rebase shared history destructively, or delete shared branches unless the operation is proven safe, necessary, and authorized. Otherwise, stop and report the need as a blocker.

Prefer fast-forward or otherwise non-destructive integration when available. Re-check branch topology after integration.

### 5. Protect secrets and sensitive material

Never intentionally retrieve, copy, echo, expose, or commit secrets, credentials, tokens, keys, or other sensitive values.

If secret-scanning or repository evidence indicates sensitive material exists, record only its presence and location in the human-facing report and stop any operation that would require exposing the value. Do not reproduce the value in code, documentation, logs, commits, or reports.

### 6. Keep changes minimal, atomic, and reversible

- Make the smallest correct change that satisfies the verified requirement.
- Preserve still-valid existing content and intent.
- Do not perform unrelated cleanup, restyling, refactoring, or dependency changes.
- Keep commits self-describing and scoped to one coherent purpose.
- Do not hardcode project facts that were not verified.
- Do not leave placeholders that imply completion when work remains.
- A second execution against an already-correct repository must be a clean no-op.

Never place private chain-of-thought, hidden reasoning, scratchpad material, confidence percentages, uncertainty meta-commentary, or model/provider-specific instructions in repository artifacts. Repository rationale must be concise, factual, and maintainability-relevant.

### 7. Validate against the verified project baseline

Use the current validation entrypoints declared by `package.json` and the CI behavior defined by `.github/workflows/pages.yml`; do not rely on remembered commands.

Capture the pre-write baseline before attributing failures to a change. If the baseline is already failing, identify the existing failure signature from evidence. After the change, verify that no new failure was introduced and never describe a pre-existing red baseline as green.

Do not claim a test, build, deployment, route, or feature passes without fresh evidence from the corresponding validation surface.

### 8. Close with a post-execution verification pass

Before declaring completion, re-read final repository state and verify:

- this governance file is present, current, model/provider-agnostic, and non-conflicting;
- every SSOT reference resolves;
- intended changes are on `origin/main`;
- `origin/main` is not behind any other branch;
- no completed work is stranded on another branch;
- no destructive history operation occurred unless explicitly justified and authorized;
- the final change set is atomic and scoped;
- the working tree is clean when a local checkout exists, or remote-only execution is accurately reported;
- validation evidence is fresh and accurately characterized; and
- no secrets, confidence disclosures, private reasoning, or model/provider-specific instructions leaked into repository artifacts.

Any failed condition remains an open item or blocker and must be reported as such.

## Human-facing completion report

Keep the execution report outside the repository. It must include, as applicable:

- remaining open items;
- a separate TODO audit;
- the reconciled execution sequence;
- anticipated failures and how they were prevented or resolved;
- blockers and the specific missing evidence;
- post-execution verification evidence, including final `origin/main` branch state;
- authoritative external sources and their as-of dates;
- whether this governance file was read-only, created, or edited, and why; and
- confidence level for the report.

## Change history

- **2026-08-31:** Created the repository-wide governance SSOT, consolidated governing CRUD rules into one neutral root document, and retired redundant instruction surfaces.
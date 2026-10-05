---
task: T-aethercast-20261005-9dbc
tool: aethercast
doc: task
kind: fix
state: next
branch: fix/aethercast
created: 2026-10-05
updated: 2026-10-05
---

# Record the sources for AetherCast's thresholds and models (TASK-012)

## Request
**Priority:** P3 | **Tags:** documentation

Every other shipped suite has a plan and a design document under `docs/superpowers`. AetherCast has neither, so the reasoning behind its index selection, its anomaly-screening thresholds, and its Fitzpatrick exposure model exists only in the implementation.

This is deliberately left as a task rather than written retrospectively: the design rationale belongs to whoever made those modelling choices, and inventing a justification after the fact would produce a document that reads as authoritative while being a guess. Health-adjacent thresholds are the last place that is acceptable.

**2026-10-01:** an as-built spec now records what the tool does (`docs/superpowers/specs/2026-10-01-aethercast-design.md`); it deliberately leaves the threshold sources and model choices to this task.

### Plan

- Have the original author record the intended scope, the standards each index implements, and the source of every threshold constant.
- Confirm the in-app wording still matches what the engine actually computes.

---

## Resume here
For each index breakpoint, anomaly-screening threshold and the Fitzpatrick exposure model in the code, find the primary source (agency standard or peer-reviewed paper) and cite it in the spec. A value with no source is listed in docs/DECISIONS.md "Open questions" for the owner; do not invent a rationale.

## Log
- 2026-10-05: moved from the retired `.tasks` lists (`IN_PROGRESS.md`, `NEXT.md`, `BACKLOG.md`); their last text is in git history at the commit before this one.

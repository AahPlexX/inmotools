# Tactical Matchboard Studio Handoff

## Workstream identity

- Branch: `feature/tactical-matchboard-studio`
- Base `origin/main` SHA: `4dcc856bc97027862342513cdea7eb769c0ffbc1`
- Tracked branch tip immediately before this handoff write: `893a9e9be6b897fb3015ae26eac867b309616167`
- Milestone: Foundation — RED schema/geometry/formation contract
- Verified functional features: **0/60**
- Merge status: dedicated branch only; not branch-complete; do not merge.

A committed file cannot literally contain its own final Git commit SHA because the file contents participate in that SHA. The branch ref is authoritative for the handoff commit itself; the tracked SHA above is the exact parent/material state this handoff describes.

## Exact next sequential task

Observe the intentionally failing tactical foundation unit test in the draft PR, then implement the minimum canonical schema, pitch/coordinate/snap engine, source-honest rules/profile model, formation library/count validator, and starter-project validator needed to make `tests/unit/tactics-engine.test.ts` green. Do not register the client route yet.

## Active feature state

Features 1, 4, 8, 9, 10, 11, 13, and 14 are `in-progress`. All other accepted features are `planned`. No feature is verified.

## Files actively worked

- `docs/superpowers/specs/2026-09-21-tactical-matchboard-studio-design.md`
- `docs/superpowers/plans/2026-09-21-tactical-matchboard-studio.md`
- `src/tools/tactics/FEATURE_MATRIX.md`
- `tests/unit/tactics-engine.test.ts`
- `.tasks/IN_PROGRESS.md`
- Next: `src/tools/tactics/tactics-types.ts`, `tactics-engine.ts`, `pitch-engine.ts`, `formation-engine.ts`

## Validation commands

Repository-defined gates:
- `pnpm test:unit`
- `pnpm build`
- focused Playwright selection through `scripts/select-e2e-specs.mjs` once tactical browser coverage exists
- full `pnpm test:e2e` where global registration changes trigger it

The current test is intentionally RED until the missing foundation modules are implemented. Do not report a green build/test state before GitHub Actions or an equivalent fresh execution proves it.

## Baseline / known unrelated failures

The verified `origin/main` base is `4dcc856bc97027862342513cdea7eb769c0ffbc1`. Its commit/task history records existing out-of-suite Pages reds from other workstreams, including web-layout/SVG accessibility and several unrelated tool/browser cases. Those signatures must not be attributed to Tactical Matchboard unless fresh evidence shows a new tactical-caused failure.

No local checkout was used for this round, so there is no local working-tree state to report. Repository writes are remote through the GitHub connector.

## Research/architecture facts already resolved

- IFAB youth/grassroots rules permit local association modifications such as field size/player count; youth presets therefore require provenance instead of universal labels.
- Current U.S. Soccer development formations are encoded only as recommendations/examples.
- Pointer Events + WCAG 2.2 non-drag alternatives govern direct manipulation.
- WebCodecs output is capability-negotiated; unsupported video options are never presented as guaranteed.
- Existing exact pins are reused. No new runtime dependency is justified by this foundation slice.
- Dexie/IndexedDB supports schema-versioned local persistence and Blob storage for later vault work.
- Three.js later uses render-on-demand when static and explicit resource disposal.

## Open defects / blockers

No tactical implementation defect is yet tracked because implementation has not begun. The RED import failure is intentional TDD evidence, not a product defect. Current authoritative futsal/specialty geometry still requires exact primary-source verification before any such preset may be labeled sourced/official.

## Intentionally deferred

Client registration, full pitch UI, timeline, analytics, 3D, local video, persistence, exporters, responsive browser work, and accessibility browser validation remain dependency-ordered future tasks in the approved implementation plan. They are deferred by sequence, not removed from the 60-feature denominator.

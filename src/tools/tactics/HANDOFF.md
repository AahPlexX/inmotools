# Tactical Matchboard Studio Handoff

## Workstream identity

- Branch: `feature/tactical-matchboard-studio`
- Base `origin/main` SHA: `4dcc856bc97027862342513cdea7eb769c0ffbc1`
- Tracked branch tip immediately before this handoff write: `12618365cc2e1b58ba0429cf110c95684c78a2e2`
- Milestone: Task 3 — editor/history + deterministic SVG board/formation placement foundation
- Verified functional features: **0/60**
- Merge status: dedicated branch only; draft PR #76; not branch-complete; do not merge.

A committed file cannot literally contain its own final Git commit SHA because the file contents participate in that SHA. The branch ref is authoritative for the handoff commit itself; the tracked SHA above is the exact parent/material state this handoff describes.

## Exact next sequential task

Continue Task 3 by building the unregistered interactive surface on top of the completed pure primitives: `TacticalBoard.tsx` + `TacticalMatchboardWorkspace.tsx`, with pointer/touch selection, a single-pointer click-to-move path, explicit D-pad/numeric non-drag movement, formation placement using `materializeFormationPositions`, tactical arrow authoring, and SVG download using the shared renderer. Do **not** register the catalog route until the beginner workflow can choose a pitch/team/formation, move a player, add an arrow, and export a real diagram without inert controls.

## Active feature state

In progress: 1, 3, 4, 5, 7, 8, 9, 10, 11, 13, 14, 55, 56, 59.
All other accepted features remain planned. No feature is verified.

The current editor foundation now provides:
- immutable `{ past, present, future }` history capped at 100 committed snapshots;
- team, roster-player, player-token, equipment, annotation, and scene-layer operations;
- normalized-position guards at mutation boundaries;
- explicit `sceneId + layerId` ownership for top-level spatial entities;
- locked-layer write protection;
- project validation that rejects missing scene/layer references;
- deterministic formation-to-normalized-position materialization with direction mirroring;
- deterministic accessible SVG serialization preserving physical pitch aspect ratio, escaping user text, and respecting layer visibility.

## Files actively worked

- `src/tools/tactics/tactics-types.ts`
- `src/tools/tactics/tactics-engine.ts`
- `src/tools/tactics/pitch-engine.ts`
- `src/tools/tactics/formation-engine.ts`
- `src/tools/tactics/editor-engine.ts`
- `tests/unit/tactics-engine.test.ts`
- `src/tools/tactics/FEATURE_MATRIX.md`
- `src/tools/tactics/HANDOFF.md`
- `.tasks/IN_PROGRESS.md`
- `src/tools/tactics/board-engine.ts`
- Next: `TacticalBoard.tsx`, `TacticalMatchboardWorkspace.tsx`, and tool-scoped CSS/tests for the minimal unregistered workspace vertical slice.

## Validation evidence

Repository-defined eventual gates remain:
- `pnpm test:unit`
- `pnpm build`
- focused Playwright selection through `scripts/select-e2e-specs.mjs` once tactical browser coverage exists
- full `pnpm test:e2e` where global registration changes trigger it

Fresh evidence this milestone:
- An isolated strict TypeScript check of the editor engine against interface-compatible tactical stubs passed under `tsc --strict`. This is a syntax/type sanity check only; it is **not** the repository build gate.
- The latest draft-PR heads have no GitHub Actions workflow run exposed through the connector. The branch is currently diverged from newer `main`, so no tactical feature has been promoted to `verified`.

Do not report unit/build/browser green until a repository-defined execution proves it.

## Repository / branch state

- Current authoritative `main` observed this session: `ce878ada3bdcb73f0b05eb2c0ae31b218c948403`.
- The tactical branch is intentionally isolated and currently diverged from `main`; the requested lifecycle defers non-destructive reconciliation with then-current `main` until branch-complete.
- No local repository checkout was used. Writes are remote through the GitHub connector; the isolated TypeScript sanity check used reconstructed tactical interfaces only.

## Research / architecture facts already resolved

- IFAB youth/grassroots organization permits local association modifications such as field size/player count; youth presets therefore require provenance instead of universal labels.
- U.S. Soccer development examples are encoded as recommendations/examples rather than mandates.
- WCAG 2.2 SC 2.5.7 requires a single-pointer non-drag alternative for drag functionality; SC 2.5.8 establishes AA target-size/spacing requirements.
- Pointer Events are the device-agnostic input baseline; pointer capture and explicit `touch-action` handling are available for authored drag surfaces.
- WebCodecs/Mediabunny output is capability-negotiated; unsupported video combinations are never promised.
- Existing exact-pinned dependencies are reused. No new runtime dependency is justified by the current slice.
- Dexie supports versioned IndexedDB schemas and non-indexed Blob values for later local vault work.
- Three.js later uses render-on-demand when static and explicit resource disposal.

## Open defects / blockers

- Full repository test/build evidence is not available for the current tactical head through the connected execution surfaces, so the verified numerator remains 0.
- Current authoritative futsal/specialty geometry still requires exact primary-source verification before any such preset may be labeled sourced/official.
- No client route exists yet by design; Task 3 must reach a genuinely usable beginner vertical slice before registration.

## Intentionally deferred

Timeline, analytics, 3D, local video, persistence, project import/export, professional exporters, responsive browser hardening, and full accessibility browser validation remain dependency-ordered future tasks in the approved implementation plan. They are deferred by sequence, not removed from the 60-feature denominator.

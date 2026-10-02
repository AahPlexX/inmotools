# CAD Studio / `main` Reconciliation Plan

**Goal:** Land `feat/cad-studio` on `origin/main` without regressing any existing tool, without a last-minute conflict crisis, and without exposing an unfinished tool to real users before it's ready.

**Status:** Investigated and drafted 2026-09-15. Supersedes the informal "defer to G15" note in `.tasks/CAD_STUDIO.md`'s freshness section with a concrete, evidence-based plan. That note stays accurate in spirit (don't expose CAD to users early) but was ambiguous about *source* reconciliation vs. *activation* — this plan separates the two.

## Evidence gathered before writing this plan

Rather than assume risk, the actual divergence was measured directly:

- Merge base: `437de88` (both branches' common ancestor).
- `origin/main` is 116 commits ahead of the merge base; `origin/feat/cad-studio` is 275 commits ahead.
- `git diff --name-status` from the merge base: **every file `feat/cad-studio` touches is either brand new (83 added files, all under `src/tools/cad/`, `tests/unit/cad-*`, `docs/superpowers/*cad*`) or one of exactly two files: `package.json` and `pnpm-lock.yaml`.** No existing application source file is modified.
- A dry-run three-way merge (`git merge-tree --write-tree origin/feat/cad-studio origin/main`, no working-tree changes) confirms this precisely: the only two conflicting paths are `package.json` and `pnpm-lock.yaml`.
- Both sides independently bumped `packageManager` (`pnpm@12.1.0` → `pnpm@12.3.4`) and `@playwright/test` (`1.62.1` → `1.63.0`) to the **identical** target versions. The rest of each side's `package.json` diff is pure dependency *additions* at different alphabetical positions (CAD added `manifold-3d`, `ml-matrix`, `occt-wasm`, `wasm-feature-detect`, `fast-check`; `main` added `@spglib/moyo-wasm`, `axe-core`, `lightningcss-wasm`, `monaco-editor`, `prettier`, `terser`, `web-layout-zip`). There is no genuine semantic conflict — the "conflict" is diff3 being unable to place nearby insertions unambiguously, not incompatible edits.
- PR #28 is currently a **draft**, `mergeStateStatus: DIRTY`, `mergeable: CONFLICTING`, 83 changed files, +16,126/−65 lines, no CI checks have run against it yet.
- `.github/workflows/pages.yml` is the pre-merge gate for PRs into `main`: `pnpm install --frozen-lockfile` → `pnpm test:unit` → `pnpm build` → Playwright Chromium install → path-selected or full E2E.
- `scripts/select-e2e-specs.mjs` treats `package.json`, `pnpm-lock.yaml`, `src/catalog.ts`, and `src/tools/workspaces.tsx` as cross-cutting: touching any of them forces the **full** Playwright suite across every tool, not just CAD's. CAD has no entry in that script's `TOOL_SPECS` map yet and no `tests/e2e/cad*.spec.ts`.
- The registration mechanics themselves are trivial and already have a proven template (e.g. `gltf-optimizer`): one `ToolSlug` union member + one `ToolDefinition` object in `src/catalog.ts`, and one lazy-import line in `src/tools/workspaces.tsx`'s `workspaceLoaders` map (`'cad-studio': () => import('./cad/CadWorkspace')`). `Workspaces` renders `<Workspace />` with no props, which already matches `CadWorkspace`'s existing `(props: CadWorkspaceProps = {})` signature — no adapter code needed.
- The worker/WASM route-lazy loading pattern (`new Worker(new URL('./cad.worker.ts', import.meta.url), ...)`) is Vite's own base-path-safe idiom, and the design doc's own deployment concern ("prove the worker and WASM assets resolve from the deployed base path") was already independently verified in two prior CI proof runs cited in the ledger (dedicated bundle-split run and a real-Chromium OCCT-init run). That risk is not new or unaddressed; it just hasn't been re-verified against the *catalog-integrated* build yet.
- The original plan's own "Global Constraints" already say: *"Work in `feat/cad-studio` while other agents modify other tools; merge only after rebasing/merging the then-current `main` and validating conflicts."* It does not say "only after the full capability floor is met" — that stricter reading was this session's own caution, not a hard requirement from the design.

## The actual risk surface, ranked

1. **Lowest risk, real today:** `package.json`/`pnpm-lock.yaml` conflict. Mechanical, well-understood, resolved by taking the union of both sides' dependency additions and regenerating the lockfile — never hand-editing YAML.
2. **Low risk, deferred until activation:** touching `src/catalog.ts` / `src/tools/workspaces.tsx`. Additive, two small edits, proven template, but classified cross-cutting by the repo's own CI — it forces a full-suite run, which is the correct and sufficient gate, not a reason to avoid it.
3. **Real but pre-existing and separately owned:** CAD has zero E2E coverage and isn't in `TOOL_SPECS`. This must be created *before* activation, not discovered by a failing full-suite run on the activation PR.
4. **Growing, not shrinking, if left alone:** the longer source-level reconciliation is postponed, the larger the `package.json`/lockfile conflict gets as both branches keep adding dependencies. This is the one part of "wait until G15" that actively works against safety.

## Two-track plan

Splitting "get CAD's source code onto `main`" from "make CAD reachable by users" turns one large, high-stakes merge into two small, low-stakes ones — and lets source-level sync happen continuously instead of once at the very end.

### Track 1 — Source sync (recurring, starts now, safe to do repeatedly)

Merge `origin/main` *into* `feat/cad-studio` (not the other direction) on a regular cadence — after every few work sessions, or whenever `main`'s `package.json` changes. This keeps the CAD branch always buildable against current `main` and keeps the conflict small and current instead of letting it compound.

Steps, each run from the `feat/cad-studio` worktree:

1. `git fetch origin main feat/cad-studio` — never trust a stale local view.
2. `git status` — confirm a clean working tree (stash/commit anything in progress first; never merge over uncommitted work).
3. `git merge-tree --write-tree feat/cad-studio origin/main` (dry run, no checkout) to preview conflicts before touching the working tree — this is exactly how this plan's own risk assessment was produced, so it's already a proven, safe first step.
4. If the only conflicts are `package.json`/`pnpm-lock.yaml` (expected, per the evidence above): `git merge origin/main`, resolve `package.json` by keeping **both** sides' additions (union of dependency entries, not a pick-one), then run `pnpm install` (not `--frozen-lockfile`) to regenerate `pnpm-lock.yaml` correctly rather than hand-merging it.
5. If any *other* file conflicts (would mean `main` started touching `src/tools/cad/` or a CAD test — currently zero evidence of this, but re-check every time rather than assuming it stays true): stop and treat it as a real integration task, not a routine sync — investigate why a shared file is now shared before resolving.
6. Full verification before committing the merge: `tsc --noEmit -p tsconfig.app.json`, `pnpm test:unit` (must stay at "only the known pre-existing unrelated flakes fail" — any *new* failure blocks the sync), `pnpm build`.
7. Commit the merge (a real merge commit, not a squash — preserves both histories) and push to `feat/cad-studio`. Concurrency-check (`git fetch` + compare) immediately before this push, same as every other push this session.
8. Update `.tasks/CAD_STUDIO.md` with a one-line note recording the sync (source SHA of `main` absorbed, date) so the freshness guard and future sessions can see when this last happened.

This track can start **today** — it doesn't wait on G6 completion, doesn't touch `catalog.ts`, and doesn't change what users see. It only reduces future-merge risk.

### Track 2 — Activation (later, gated on readiness, not on 195/195)

This is the PR that actually makes CAD Studio reachable: adds the `catalog.ts`/`workspaces.tsx` registration, a dedicated `tests/e2e/cad-studio.spec.ts` (the design doc's ten "critical flows" are the right source for that spec's scenarios), and the `TOOL_SPECS` entry in `select-e2e-specs.mjs`.

Gating condition (proposed, not yet the user's decision — see the question below): activation should happen when there's a genuinely *usable* end-to-end flow (the design doc's flow 1: "create sketch → constrain → extrude → hole → fillet → parameter edit → undo/redo → save/export"), not when the full 195-capability floor is met. The deterministic completion equation in the ledger (all gates, full capability floor, export matrix, branch reconciled, Pages green) is the bar for calling the *tool* complete — it doesn't have to be the bar for *reachable-in-main*. Shipping an honestly-scoped, disclosed-limitations CAD tool early (matching this project's own Invariant #14 philosophy) is arguably more consistent with how every other tool in this repo works than holding 16,000+ lines of reviewed, tested, working code off `main` indefinitely.

Steps when the gate is judged met:

1. Complete Track 1 one final time immediately before starting, so activation only ever has to deal with the catalog/workspaces edits themselves — never a stale dependency conflict at the same time.
2. Add the catalog entry, the workspace loader line, and the E2E spec + `TOOL_SPECS` map entry, in that order, each independently verified (`tsc`, unit suite, a manual local `pnpm dev` smoke check that the tool actually loads through the real route).
3. Run the **full** Playwright suite locally before pushing (not just the CAD spec) — since these files are cross-cutting, CI will run the full suite anyway; catching a regression locally first is cheaper than discovering it in a PR check.
4. Open this as its own PR against `main` (or convert PR #28's scope down to just this, with the source-sync commits already merged via Track 1 sitting underneath) — small, reviewable, and independently revertible from all the CAD feature work that landed via Track 1.
5. Let the repo's own `pages.yml` gate run for real this time (it hasn't yet, since PR #28 has been draft/conflicting) and require it green before merge — no manual override.
6. After merge, verify the *deployed* Pages build specifically: open the live site, navigate to CAD Studio through the real catalog UI (not local dev), confirm the worker/WASM assets load under the `/inmotools/` base path in production, and run one real create→extrude→export smoke pass by hand. This is the one check nothing in CI can substitute for.

### Rollback posture

Because Track 1's commits are pure additions plus a mechanical dependency merge, reverting them (if something unexpected broke) is a clean `git revert` of the merge commit with no entanglement in other tools' code. Track 2's activation PR is deliberately small and isolated for the same reason — if the deployed smoke check in step 6 fails, reverting just that PR immediately makes CAD invisible again without touching any of the underlying feature code, which stays safely on `main` for the next attempt.

## Decisions (confirmed 2026-09-15)

- **Track 1:** proceed now. Executed in this same session; see the ledger for the resulting sync commit.
- **Track 2 gate:** the ledger's existing deterministic completion equation stands unchanged — activation (catalog/router registration, making CAD Studio reachable) waits for the full 195/195 capability floor and all G0–G15 gates, not an earlier "usable flow" milestone. This was the user's explicit call, not assumed.

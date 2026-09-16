# In Progress

- **Typing Workstation** — local speed-typing calculator, ergonomic touch-typing testing and adaptive motor-skill training tool with a 38-feature ledger.
  - Contract and full feature ledger: `docs/superpowers/plans/2026-09-15-typing-workstation.md`.
  - Current milestone: Milestones A-C are complete on `feature/typing-workstation`. Accepted branch revision `1df03ebe1d0b924a3047f61075f6712fc9c09d7d` passed dedicated workflow run `35122896793` / job `104884791471`: frozen install and supply-chain policy verification, 50/50 focused unit tests, production build, and 14/14 desktop/mobile Chromium checks covering exact ranked English tiers, conventional n-gram medians, real Enter/newline completion, forgiving-mode auto-finish with scoring errors retained, CSV/Markdown/JSON history metadata and collision-free bundle re-import, CSV dictionary ingestion, raw-keystroke CSV, PDF certificate, IndexedDB persistence, bundled OpenDyslexic loading, modal keyboard semantics, automated accessibility scanning, and 320 CSS-pixel reflow. Milestone D (exact-main integration + Pages deployment) remains pending and must not be claimed from the dedicated feature branch.
  - Completion: every ledger item implemented and verified through reachable UI, validated exports (CSV/JSON/PDF/keystrokes/Markdown) with editable tags at export, IndexedDB persistence proven, responsive keyboard access, exact-main integration, and Pages deployment. Deferred items must land in `NEXT.md` with rationale rather than being silently dropped.
  - Scope: `src/tools/typing/`, tool-specific tests, additive catalog/loader integration. Other workstreams and branches are preserved; this workstream must not merge to `main` before its own completion gates pass and explicit integration is appropriate.

- **Web Layout Studio** — local responsive layout, design-token and frontend component workstation.
  - Contract and full 60-feature ledger: `docs/superpowers/plans/2026-09-12-web-layout-studio.md`.
  - Current milestone: Sass token map export integrated at 3ec9e435; dedicated Web Layout run 34853354606 passed frozen install, 20 units, build and desktop/mobile browser tests. Pages deployed and the live export control was inspected. Shared Web Layout accessibility timeouts remain unresolved; current repository-wide gates fail in Crystal/Vector unit tests. Full 60-feature ledger remains active with no scope reduction.
  - Completion: every ledger item implemented and verified through reachable UI, validated exports/persistence, script isolation, responsive keyboard access, exact-main checks and Pages deployment. Partial features remain open.
  - Scope: `src/tools/web-layout/`, tool-specific tests, additive catalog/loader integration. Other workstreams and branches are preserved.

- **Catalog-wide audit remediation (TASK-014)** — resolve every accepted finding from the verified catalog audit without silently dropping, weakening, or reclassifying known work.
  - Queue/source: `.tasks/NEXT.md` → `TASK-014: Work through the verified catalog-wide audit backlog`.
  - Current milestone: reconcile the live audit queue against merged fixes, then continue only with still-outstanding verified findings using tool-scoped regression evidence.
  - Latest integrated evidence: Tool 17 / GLSL Sandbox lifecycle and paused-redraw remediation merged through PR #25 at `68accf37f1cc744644e6639f9ff8c102952a7426`; Tool 16 / Convolution Room Profiler findings were verified already resolved on `main` and removed from the outstanding queue rather than reimplemented.
  - Completion gate: every accepted audit finding is either fixed with fresh focused evidence, explicitly rejected with evidence, or deliberately deferred with rationale; no accepted finding is untracked; required validation is green on the exact integrated `origin/main` revision; applicable Pages deployment is green; and the audit entry is moved to `DONE.md`/`WORK_LOG.md` only after those conditions are simultaneously true.

- **Vector Studio** — standards-native local vector illustration workspace with 30+ functional creation/editing capabilities, professional export/metadata workflows, responsive accessibility, focused validation, and Pages verification.
  - Design: `docs/superpowers/specs/2026-09-11-vector-studio-design.md`
  - Plan: `docs/superpowers/plans/2026-09-11-vector-studio.md`
  - Current milestone: F — browser validation, adversarial review, integration, and Pages verification
  - Current gate: the pan interaction defect is fixed by capturing the custom pan gesture on the stationary scroll viewport instead of the moving SVG document. Isolated focused validation run `34705678053` passed unit tests, production build, and the full SVG browser spec on desktop and mobile Chromium at `30e1fd78fcb94c1ec3130b639ca9c9f7d5034fae`; the identical Vector source blob is integrated on `main` at `a83e5f96cdf5511ab8397ebc12d5e29b13b4522a` and now requires green focused validation plus the repository Pages workflow on the exact integrated main revision before the milestone can close.
  - Integration gate: exact dependency-policy pins `@playwright/test@1.63.0` and `pnpm@12.3.4` are already integrated on `main` through `fbfade09aec3f73eb70a4d202949329036883947`. The disposable `fix/vector-pan-validation` branch exists only to preserve the isolated browser proof and must not be merged; it can be removed once the exact-main validation evidence is green and branch containment is verified.

- **Photo Studio** — local-first non-destructive photo editor with 30+ functional editing capabilities, professional export/metadata workflow, responsive accessibility, focused validation, and Pages verification.
  - Design: `docs/superpowers/specs/2026-09-11-photo-studio-design.md`
  - Plan: `docs/superpowers/plans/2026-09-11-photo-studio.md`
  - Current milestone: A — foundation and global editor

- **Sightline Velocity Studio** — local-first universal document reader, paced speed-reading workstation, comprehension/retention toolkit, and export studio governed by the F1–F35 feature ledger.
  - Design: `docs/superpowers/specs/2026-09-15-sightline-velocity-design.md`.
  - Plan: `docs/superpowers/plans/2026-09-15-sightline-velocity.md`.
  - Branch: `feat/sightline-velocity` is the single active development branch for this workstream; no further Sightline writes belong on the prior arena branch.
  - Current milestone: M5 — focused verification, task-state reconciliation, responsive/accessibility acceptance, and integration hand-off. M1–M4 implementation is present but is not accepted as complete until every deterministic completion gate in the plan has fresh evidence.
  - Latest evidence: dedicated run `35118094022` at `3e4bee27607baf9eae4a77e162a341966a49ae72` passed 407/407 Sightline unit assertions across 16 files, production build, and 40/40 desktop/mobile Chromium cases. F6 multi-file, full-workspace drop, and three-item sample-library acceptance is now included in green dedicated run `35122984076` at `1d28b12b911f5a60b3f8ffe543466b4b1aa02c63`, which passed the focused unit/build lane and all 44 desktop/mobile Chromium cases. The repository-wide Pages gate remains mandatory before integration.
  - Completion gate: all F1–F35 items reachable and functional; focused units, production build, Sightline browser spec, accessibility/keyboard, narrow/medium/wide reflow, export round trips, synchronized `.tasks`, integration to `origin/main`, and applicable Pages deployment all verified from fresh evidence.
  - Scope: `src/tools/sightline/`, Sightline-specific unit/e2e tests, its design/plan, dedicated validation workflow, and additive catalog/loader/PWA integration. Unrelated workstreams remain untouched.

- **Crystal Lattice Studio** — local-first crystallography and crystal-lattice workstation governed by the 163-capability master design.
  - Design: `docs/superpowers/specs/2026-09-11-crystal-lattice-studio-design.md`.
  - Phase 1 plan: `docs/superpowers/plans/2026-09-11-crystal-lattice-studio-phase-1.md`.
  - Phase 1 completion: `docs/superpowers/plans/2026-09-11-crystal-lattice-studio-phase-1-completion.md`.
  - Current milestone: Phase 2 — symmetry, local environments, validation, and model building. Phase 1 document/import/export core, interactive structure editing, periodic geometry, project history, publication graphics, and acceptance baseline are integrated.
  - Latest Phase 1 acceptance evidence: all Crystal functional and Task 12 reflow/Axe/keyboard/dialog checks passed in Pages run `34729051007`, job `103648349176`, at `495ee945d60965b7e7e46bd6ed296e9b0fa8bb8d`. That repository-wide job remained red only because three later Web Layout tests failed; no Crystal failure was present.
  - Completion gate: all five master-design phases must be implemented and verified, with every numbered capability accounted for as implemented or explicitly approved under the master scope policy; Phase 1 completion alone is not project completion.
  - Browser note (2026-09-15): one focused Crystal run failed a single mobile supercell case, but the next focused run `35036412161` passed the full Crystal spec, so it was transient and needs no action.
  - Scope: `src/tools/crystal/`, Crystal-specific tests and Crystal design/plan/completion records; unrelated workstreams remain untouched.
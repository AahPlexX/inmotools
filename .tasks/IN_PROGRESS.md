# In Progress

- **Web Layout Studio** — local responsive layout, design-token and frontend component workstation.
  - Contract and full 60-feature ledger: `docs/superpowers/plans/2026-09-12-web-layout-studio.md`.
  - Current milestone: named-area editing and real viewport orientation repaired. Baseline run `34729050953` failed orientation in both browser projects; recovery run `34741482374` at `a51fec0` passes installation, 10 unit tests, production build and all 12 desktop/mobile browser cases. Integration uses the identical implementation; main checks and Pages are tracked by commit workflows. Next open work: WL-01 track authoring and WL-10 custom viewport sizes/actual-size mode. The full 60-feature scope remains active.
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

- **Crystal Lattice Studio** — local-first crystallography and crystal-lattice workstation governed by the 163-capability master design.
  - Design: `docs/superpowers/specs/2026-09-11-crystal-lattice-studio-design.md`.
  - Phase 1 plan: `docs/superpowers/plans/2026-09-11-crystal-lattice-studio-phase-1.md`.
  - Phase 1 completion: `docs/superpowers/plans/2026-09-11-crystal-lattice-studio-phase-1-completion.md`.
  - Current milestone: Phase 2 — symmetry, local environments, validation, and model building. Phase 1 document/import/export core, interactive structure editing, periodic geometry, project history, publication graphics, and acceptance baseline are integrated.
  - Latest Phase 1 acceptance evidence: all Crystal functional and Task 12 reflow/Axe/keyboard/dialog checks passed in Pages run `34729051007`, job `103648349176`, at `495ee945d60965b7e7e46bd6ed296e9b0fa8bb8d`. That repository-wide job remained red only because three later Web Layout tests failed; no Crystal failure was present.
  - Completion gate: all five master-design phases must be implemented and verified, with every numbered capability accounted for as implemented or explicitly approved under the master scope policy; Phase 1 completion alone is not project completion.
  - Scope: `src/tools/crystal/`, Crystal-specific tests and Crystal design/plan/completion records; unrelated workstreams remain untouched.
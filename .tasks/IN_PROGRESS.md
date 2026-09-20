# In Progress

- **Tabular Sheet Workstation (TASK-022)** — PRODUCT CUT APPROVED. Sole writer on `feature/tabular-sheet-parity` P1–P16 (draft PR only; do not merge; do not open a second PR; do not invent extra product scope). Do not shrink Insert Function to XLOOKUP-only.
  - Stage 1–3 and FEATURE_MATRIX 1–36 stay `done` historical. Approved milestone is CoS P1–P16 only. Protect sheet (PX) is leftover chrome, not in the approved 16.
  - Resume: `src/tools/sheets/HANDOFF.md`. Ledger: `src/tools/sheets/FEATURE_MATRIX.md` (1–36 `done` plus approved P1–P16). Exclusions: realtime collab, VBA/Apps Script, cloud Power Query, Univer Pro pivots/drawing, HyperFormula, auth/db, FILTER/SORT/UNIQUE formulas.
  - Tip SHA: d6063c3e806ad46fdca2eb0f15a622ba77eeafa4 (update this line in the same cycle as any later push). Last focused-gate code: `c4f55d32159e4ba751ece9f940ac90fb2560ebe7`.
  - Sheets gates at that SHA: focused units 39/39; `pnpm build` pass; desktop-chromium 21 passed; P16 matrix 12/12 (6 portrait + 6 landscape CSS widths); mobile-chromium 8 passed / 13 skipped by design (iPhone 13 is not the P16 gate).
  - P16 proof rule: device-agnostic CSS-width matrix in both orientations (320/360/390/412/430/768 portrait + 740/800/844/915/932/1024 landscape). iPhone 13 / `mobile-chromium` is not the sole mobile gate.
  - Client constraint: no hover-only; no overlap at those widths; long-press + click; formula help tap/focus only; anti-slop catalog/sheets copy only.
  - Stack pins unchanged: `@univerjs/presets@0.25.1`, `@univerjs/preset-sheets-core@0.25.1`, `exceljs@4.4.0`, SheetJS CE `0.20.3`, reuse `chart.js@4.5.1`. No Univer Pro, HyperFormula, AI, or auth/db.
  - Scope: `src/tools/sheets/`, sheets catalog blurb, sheets unit/e2e, this TASK line, `HANDOFF.md`. Do not overwrite other tools' task entries. Do not touch PR #33 / transcode.

- **Markdown audit (2026-09-16)** — source highlighting, discoverable syntax guide, touch formatting/search, and draft/file race guards implemented. All 191 Markdown units pass after edits; UX/Mermaid checks passed in run 35144034742 and all 50 workflow checks passed in run 35144496126 at 007be946. Build and Pages deployment passed. Preview code-language coloring and dedicated delayed-I/O regression coverage remain open. Scope and remaining checks: `docs/markdown-audit-2026-09-16.md`.

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

- **Crystal Lattice Studio** — local-first crystallography and crystal-lattice workstation governed by the 163-capability master design.
  - Design: `docs/superpowers/specs/2026-09-11-crystal-lattice-studio-design.md`.
  - Phase 1 plan: `docs/superpowers/plans/2026-09-11-crystal-lattice-studio-phase-1.md`.
  - Phase 1 completion: `docs/superpowers/plans/2026-09-11-crystal-lattice-studio-phase-1-completion.md`.
  - Phase 2 completion: `docs/superpowers/plans/2026-09-13-crystal-lattice-studio-phase-2-completion.md`.
  - Current milestone: Phase 2 complete; next milestone Phase 3 — reciprocal space, diffraction, and reflection/powder import. Local-environment/health analysis, constrained cell and advanced site editing, reversible model building, symmetry detection with stability and standardization diagnostics, advanced structure visualization, and reachable Phase 2 task areas are integrated.
  - Phase 2 evidence: 12 Crystal unit files / 91 tests pass, `tsc` and production build clean, and focused Crystal validation run `35045893285` passed the full Crystal browser spec on desktop and mobile. The focused Crystal lane now selects both `crystal-lattice-studio.spec.ts` and `crystal-lattice-studio-phase2.spec.ts`.
  - Latest Phase 1 acceptance evidence: all Crystal functional and Task 12 reflow/Axe/keyboard/dialog checks passed in Pages run `34729051007`, job `103648349176`, at `495ee945d60965b7e7e46bd6ed296e9b0fa8bb8d`. That repository-wide job remained red only because three later Web Layout tests failed; no Crystal failure was present.
  - Completion gate: all five master-design phases must be implemented and verified, with every numbered capability accounted for as implemented or explicitly approved under the master scope policy; Phase 1 completion alone is not project completion.
  - Browser note (2026-09-15): one focused Crystal run failed a single mobile supercell case, but the next focused run `35036412161` passed the full Crystal spec, so it was transient and needs no action.
  - Scope: `src/tools/crystal/`, Crystal-specific tests and Crystal design/plan/completion records; unrelated workstreams remain untouched.
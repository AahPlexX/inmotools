# In Progress

- **Tactical Matchboard Studio** — 60-feature local-first tactical authoring, animation, spatial-analysis, local-video, presentation, persistence, and export workstream on `feature/tactical-matchboard-studio`.
  - Design: `docs/superpowers/specs/2026-09-21-tactical-matchboard-studio-design.md`
  - Plan: `docs/superpowers/plans/2026-09-21-tactical-matchboard-studio.md`
  - Feature ledger: `src/tools/tactics/FEATURE_MATRIX.md`; handoff: `src/tools/tactics/HANDOFF.md`; deterministic execution/concurrency queue: `src/tools/tactics/TODO_SEQUENCE.md`.
  - Branch base: `4dcc856bc97027862342513cdea7eb769c0ffbc1`; existing draft PR #76 only — do not create a parallel Tactical Matchboard PR.
  - Current milestone: **Task 4 — pitch, rules, formation, and restart authoring.** Task 3 is closed; T04-01 is the sole ACTIVE forward item and owns its listed tactical engine/workspace/test files.
  - Current verified feature count: **0/60**. Features 1, 3, 4, 5, 7, 8, 9, 10, 11, 13, 14, 51, 52, 55, 56, and 59 are in progress; all others remain planned.
  - Current implementation includes canonical normalized/project primitives, provenance-bearing formation templates, deterministic formation placement, bounded undo/redo, editor/layer operations, accessible SVG serialization, beginner project materialization, pointer/touch click-to-move, visible player selection, D-pad + numeric precision movement, two-point tactical arrows, responsive tool-scoped layout, real local SVG download, and registered catalog/lazy-loader routing.
  - Current evidence: source commit `f885ed383b0bac6e85a10115a765d85baaad34b0` passes **26/26** focused tactical/selector units and a production/PWA build; browser-contract commit `ff82ade9e8290d382ec868bcb1dc4c58eca6c2b8` passes **14 scenarios** with **2 intentional duplicate-project skips**, including desktop/mobile workflows, keyboard activation, Axe, phone/tablet/laptop/desktop reflow, overflow, and 44px targets. Partial feature rows remain in progress, so the verified numerator stays 0.
  - Scope boundary: browser-local only; no auth, backend database, telemetry, remote processing, cloud project storage, client secret/API key, or AI product surface.
  - Completion gate: satisfy the branch-complete and integrated-complete contracts in the tactical design/plan and repository `.tasks/PROJECT_COMPLETION.md`; do not merge partial work.


- **Tabular Sheet Workstation (TASK-022)** — Wave A in progress on `feature/tabular-sheet-wave-a` (Formula.js `@formulajs/formulajs@4.6.1` + FILTER/SORT/UNIQUE spill + export-surviving comments). Branched from `origin/main` after PR #71 P1–P16 (`b582c34dea4ba97ab7080743dc290eeb45946b54`) and docs PR #72. Do not reuse `feature/tabular-sheet-parity`. Do not invent Wave B/C/D. Do not shrink Insert Function to XLOOKUP-only.
  - Stage 1–3 and FEATURE_MATRIX 1–36 stay `done` historical. P1–P16 stay `done`. Wave A ledger WA1–WA3. Protect sheet (PX) is leftover chrome, not in the approved 16.
  - Resume: `src/tools/sheets/HANDOFF.md`. Ledger: `src/tools/sheets/FEATURE_MATRIX.md`. Exclusions: realtime collab, VBA/Apps Script, cloud Power Query, Univer Pro pivots/drawing, HyperFormula, auth/db, SEQUENCE/SORTBY/RANDARRAY/array constants (X5). FILTER/SORT/UNIQUE spill is Wave A.
  - Draft PR: https://github.com/AahPlexX/inmotools/pull/73. Tip SHA: `8821106208510d12263773725cc51286f8459250`. Last focused-gate code: `ff9f3f0fc2fbd6bbc0fa9e12e7461e07d5d35bf1` (units 47/47; `pnpm build` pass; desktop-chromium 25 passed; P16 matrix 12/12).
  - Do not claim the full Pages suite green.
  - Known out-of-suite CI reds (do not chase): web-layout-studio axe; svg-sprite-compiler axe; stale lazy chunk; Hardware Packet Inspector; GeoJSON Simplifier; Python re named groups; crystal-lattice-studio mobile.
  - P16 proof rule: device-agnostic CSS-width matrix in both orientations (320/360/390/412/430/768 portrait + 740/800/844/915/932/1024 landscape). iPhone 13 / `mobile-chromium` is not the sole mobile gate.
  - Client constraint: no hover-only; no overlap at those widths; long-press + click; formula help tap/focus only; anti-slop catalog/sheets copy only.
  - Stack pins: `@univerjs/presets@0.25.1`, `@univerjs/preset-sheets-core@0.25.1`, `exceljs@4.4.0`, SheetJS CE `0.20.3`, reuse `chart.js@4.5.1`, `@formulajs/formulajs@4.6.1` exact. No Univer Pro, HyperFormula, AI, or auth/db.
  - Scope: `src/tools/sheets/`, sheets catalog blurb, sheets unit/e2e, this TASK line, `HANDOFF.md`, `package.json` pin + lockfile. Do not overwrite other tools' task entries. Do not touch PR #33 / transcode.

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

# Typing Workstation Session Controls & Local Typist Profiles Implementation Plan

> **For agentic workers:** Use the host's available task-by-task implementation workflow. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit Start/Pause/Resume/Stop/Reset controls and persistent browser-local typist-scoped scoring to the existing Typing Workstation without regressing its 38 shipped capabilities.

**Architecture:** Extend the existing pure typing engine with explicit start/stopped semantics, add a small session-clock helper that excludes paused intervals, and extend the existing Dexie store with local typist records plus `typistId` ownership on tests. The React workspace remains the orchestration layer but moves session lifecycle out of the current loosely coupled `running` boolean into explicit state and blocks target/config/profile mutations while active.

**Tech Stack:** React 19, TypeScript 7, Dexie 4, Vitest 4, Playwright 1.63, Axe Playwright, existing exact-pinned dependencies only.

## Global Constraints

- Work from current `origin/main`; do not overwrite or reset unrelated concurrent work.
- Keep all data local to the browser; no auth, backend, network API, telemetry, or cloud persistence.
- Preserve native `input`/composition text entry and physical keyboard metadata behavior.
- Preserve the original F1–F38 contract; this approved expansion adds F39–F47 for a 47-function ledger.
- Use red-first focused tests for changed behavior where the environment permits; do not weaken existing assertions to obtain green.
- No new dependency unless an implementation blocker proves one is necessary.
- Keep documentation/task state synchronized with implementation.

---

### Task 1: Explicit engine finish/start semantics and pause-safe session clock

**Files:**
- Modify: `src/tools/typing/typing-engine.ts`
- Create: `src/tools/typing/typing-session.ts`
- Modify: `tests/unit/typing-engine.test.ts`
- Create: `tests/unit/typing-session.test.ts`

**Interfaces:**
- Consumes: existing `EngineState`, `finish`, `computeMetrics`, `performance.now()` timestamps.
- Produces: `start(state, t): EngineState`; `finishReason` accepts `stopped`; pure session-clock helpers for Ready/Running/Paused/Finished timing and effective timestamps.

- [ ] **Step 1: Add the focused failing tests**
  - Explicit start sets `startedAt` without creating a keystroke.
  - `finish(..., 'stopped', t)` records a stopped finish.
  - Pause/resume clock freezes effective time during pause, accumulates multiple pauses, and reset returns to zero pause accounting.

- [ ] **Step 2: Verify the relevant failure**
  - Run: `pnpm exec vitest run tests/unit/typing-engine.test.ts tests/unit/typing-session.test.ts`
  - Expected: missing `start`, missing `stopped` type/behavior, and missing session helper fail for the intended reason.

- [ ] **Step 3: Implement the minimum behavior**
  - Add explicit engine start that is idempotent after the engine has started or finished.
  - Extend finish reason union with `stopped`.
  - Implement a pure session-clock helper that converts real monotonic timestamps to paused-time-excluded effective timestamps and exposes transition guards.

- [ ] **Step 4: Verify the focused pass**
  - Run the identical focused Vitest command.
  - Expected: all Task 1 tests pass.

- [ ] **Step 5: Run the affected integration check**
  - Run: `pnpm exec vitest run tests/unit/typing-*.test.ts`
  - Expected: all Typing units pass.

- [ ] **Step 6: Commit the passing deliverable**
  - Commit message: `feat(typing): add explicit session lifecycle clock`

### Task 2: Local typist profiles and profile-owned score persistence

**Files:**
- Modify: `src/tools/typing/typing-storage.ts`
- Modify: `src/tools/typing/typing-export.ts`
- Modify: `tests/unit/typing-storage.test.ts`
- Modify: `tests/unit/typing-export.test.ts`

**Interfaces:**
- Consumes: existing Dexie database, `StoredTest`, personal-best query, import/export normalization.
- Produces: `StoredTypist`, default-profile initialization/migration, typist CRUD needed by UI, `clearTestsForTypist`, typist-aware filtering and PB lookup.

- [ ] **Step 1: Add the focused failing tests**
  - Default profile initialization is idempotent.
  - Legacy tests without `typistId` migrate to the default profile without duplication.
  - Two profile IDs isolate history filtering and personal bests.
  - Clearing one profile's tests leaves the other profile intact.
  - Imported records are assignable to the active profile and `stopped` records normalize/export successfully but remain certificate-ineligible.

- [ ] **Step 2: Verify the relevant failure**
  - Run: `pnpm exec vitest run tests/unit/typing-storage.test.ts tests/unit/typing-export.test.ts`
  - Expected: missing profile APIs/profile ownership and stopped normalization fail.

- [ ] **Step 3: Implement the minimum behavior**
  - Add Dexie v2 `typists` table and `typistId` test index.
  - Add stable default local typist and one-time legacy assignment.
  - Add create/list/get profile functions; no delete flow in this scope.
  - Add `typistId` to filter/PB queries and profile-specific clear.
  - Preserve import compatibility; workspace assigns imported tests to the active profile.

- [ ] **Step 4: Verify the focused pass**
  - Run the identical focused Vitest command.
  - Expected: all Task 2 tests pass.

- [ ] **Step 5: Run the affected integration check**
  - Run: `pnpm exec vitest run tests/unit/typing-*.test.ts`
  - Expected: all Typing units pass.

- [ ] **Step 6: Commit the passing deliverable**
  - Commit message: `feat(typing): scope scores to local typists`

### Task 3: Wire traditional session controls and close active-session UX bugs

**Files:**
- Modify: `src/tools/typing/TypingWorkspace.tsx`
- Modify: `src/tools/typing/typing-styles.css`
- Modify: `tests/e2e/typing.spec.ts`

**Interfaces:**
- Consumes: Task 1 session clock/engine start, Task 2 typist/profile APIs, existing save/export/history/PB flows.
- Produces: visible Ready/Running/Paused/Finished session UI, Start/Pause/Resume/Stop/Reset attempt, active-typist selector/add flow, profile-scoped analytics and score reset.

- [ ] **Step 1: Add the focused failing browser scenario**
  - Start explicitly, type, Pause, verify timer is stable, verify typed input is ignored while paused, Resume, type, Stop, and assert stopped result is shown without certificate.
  - Reset attempt preserves target and returns score/timer to zero.
  - Create/select two typists, save distinct results, verify each profile sees only its own history/PB/averages.
  - Reset one typist's scores and verify the other profile remains intact.
  - While Running/Paused, verify config/profile/New text controls cannot silently reset the session and F2 reports the guardrail.

- [ ] **Step 2: Verify the relevant failure**
  - Run: `pnpm exec playwright test tests/e2e/typing.spec.ts --project=desktop-chromium`
  - Expected: new controls/profile behavior are absent and the scenario fails for those missing behaviors.

- [ ] **Step 3: Implement the minimum behavior**
  - Replace the loose `running` boolean with explicit session status plus pause clock state.
  - Route every engine event/timer/finish through the effective clock.
  - Keep first-character implicit start.
  - Add session bar and state badge.
  - Add active typist selector and Add typist dialog; persist active profile ID.
  - Scope history/PB/chart/activity/export/import/save to active profile.
  - Convert ambiguous Clear history flow to selected-profile score reset.
  - Disable and action-guard profile/config/target-changing actions while Running/Paused.
  - Preserve Escape as abort/discard and F2 as idle-only fresh text.

- [ ] **Step 4: Verify the focused pass**
  - Run the identical desktop Typing Playwright command.
  - Expected: all Typing desktop scenarios pass.

- [ ] **Step 5: Run the affected integration check**
  - Run: `pnpm exec playwright test tests/e2e/typing.spec.ts`
  - Expected: all Typing scenarios pass on desktop and mobile Chromium.
  - Run: `pnpm build`
  - Expected: TypeScript and production build pass.

- [ ] **Step 6: Commit the passing deliverable**
  - Commit message: `feat(typing): add traditional session controls and profiles`

### Task 4: Gauntlet adversarial UX/accessibility pass and closure evidence

**Files:**
- Modify as findings justify: `src/tools/typing/TypingWorkspace.tsx`, `src/tools/typing/typing-styles.css`, Typing unit/e2e tests
- Modify: `docs/superpowers/plans/2026-09-15-typing-workstation.md`
- Modify: `docs/superpowers/specs/2026-09-25-typing-session-profiles-design.md`
- Modify: `docs/superpowers/plans/2026-09-25-typing-session-profiles.md`
- Modify: `.tasks/IN_PROGRESS.md`
- Modify on completion: `.tasks/DONE.md`, `.tasks/WORK_LOG.md`

**Interfaces:**
- Consumes: integrated F39–F47 implementation and focused validation evidence.
- Produces: updated 47-function SSOT, adversarially reviewed UX, exact-main focused evidence, and reconciled task state.

- [ ] **Step 1: Run objective validation**
  - `pnpm exec vitest run tests/unit/typing-*.test.ts`
  - `pnpm build`
  - `pnpm exec playwright test tests/e2e/typing.spec.ts`
  - Verify Axe serious/critical, native input/composition, Tab escape, F2 guardrail, profile isolation, pause timing, and compact widths.

- [ ] **Step 2: Run separate domain and adversarial review passes**
  - Domain pass: lifecycle correctness, profile ownership, data migration, destructive-action clarity, mobile/keyboard usability.
  - Adversarial pass: attempt to corrupt scores through pause gaps, profile switches, config changes, imports, stopped results, stale PBs, repeated migration, and rapid reset/start transitions.
  - Compare against the accepted repository contract, Typing.com's current score/progress/reset patterns where comparable, MDN timer semantics, and WCAG 2.2 interaction expectations.

- [ ] **Step 3: Fix the highest-value material finding**
  - Add a regression first where the finding is externally observable.
  - Apply only the targeted repair.
  - Re-run affected focused checks plus Typing regression suite.

- [ ] **Step 4: Update the authoritative ledger and task records**
  - Expand the parent ledger to F1–F47 without rewriting historical evidence.
  - Record exact commit/run evidence.
  - Do not close the workstream until the focused Typing workflow is green on the integrated `main` revision and the product is deployed if Pages is triggered.

- [ ] **Step 5: Final continuity guard**
  - Re-read current `origin/main` before every write that follows asynchronous CI.
  - If unrelated commits land, preserve them and compare Typing-scoped paths before updating refs or task records.

## Unresolved product decisions

None. The approved design fixes lifecycle semantics, profile scope, migration ownership, stop/reset behavior, and non-goals sufficiently for implementation.

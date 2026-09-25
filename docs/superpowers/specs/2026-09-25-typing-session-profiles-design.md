# Typing Workstation Session Controls & Local Typist Profiles Design

**Date:** 2026-09-25  
**Parent workstream:** `docs/superpowers/plans/2026-09-15-typing-workstation.md`  
**Status:** Complete — accepted on `main` at `7222854833f507ebfbcf00ab0c156b58ee90f335`  
**Capability ledger:** existing 38 + F39–F47 = 47 total

## Goal

Extend the existing local-first Typing Workstation with the traditional session lifecycle and individual-score behavior users expect from a typing workstation, while preserving the already-shipped native input/composition path, analytics, exports, and browser-local privacy model.

## Domain boundary

This expansion models **local typists and local typing sessions inside one browser profile**. It deliberately does not introduce accounts, authentication, cloud sync, a server database, classroom administration, remote leaderboards, or cross-device identity.

A typist profile is a stable local identity used to partition saved test history, personal bests, rolling averages, daily activity, and history exports. It is not an account.

## Selected architecture

Use the smallest domain-correct extension of the existing React + Dexie implementation:

1. Add an explicit session lifecycle around the current engine: `ready → running ↔ paused → finished`.
2. Keep `performance.now()` as the timing clock, but convert real timestamps to an **effective session clock** that subtracts paused intervals so pause time cannot contaminate WPM, CPM, consistency, per-second charts, or raw event timing.
3. Extend the existing IndexedDB schema with stable local typist records and a `typistId` dimension on saved tests.
4. Keep legacy saved tests valid; on first profile initialization, assign tests without a `typistId` to the default local typist instead of dropping or duplicating them.
5. Keep the existing text-input/composition path and physical-key metadata behavior unchanged except where the session lifecycle must gate input.

This avoids both a brittle component-only patch and an unnecessary generalized workflow/state-machine dependency.

## New capability ledger

### F39 — Explicit Start

- A visible **Start** control exists in Ready state.
- Start begins the session clock immediately, before the first character.
- Typing into a Ready canvas remains a supported convenience and implicitly starts the session so the prior workflow does not regress.
- Start places focus in the typing surface.
- Start is unavailable while Running or Paused.

### F40 — Pause

- A visible **Pause** control is available only while Running.
- Pause freezes elapsed/remaining time and blocks text mutation.
- Pause time is excluded from all scored timing.
- Pausing does not discard typed text, errors, cursor position, raw events, target, or current analytics.

### F41 — Resume

- A visible **Resume** control is available only while Paused.
- Resume continues from the exact cursor/state that existed at Pause.
- Resume restores focus to the typing surface.
- The effective session clock remains continuous across any number of pause/resume cycles.

### F42 — Stop with partial score

- A visible **Stop** control is available while Running or Paused.
- Stop ends the attempt intentionally with `finishReason: "stopped"`.
- The current partial score is shown in the existing result workflow and may be saved/exported.
- A stopped attempt is not certificate-eligible and is not eligible to become a personal-best ghost.
- Existing `Escape` keeps the distinct meaning **Abort/discard current attempt**.

### F43 — Reset current attempt

- A visible **Reset attempt** control resets typed characters, score, events, timer, pause state, and finish state while preserving the current target/configuration/profile.
- Reset returns to Ready and refocuses the typing surface.
- Reset does not write history or change the selected profile.
- Reset never silently loads a different target.

### F44 — Persistent local typist profiles

- Users can create and select persistent browser-local typist profiles.
- Each profile has a stable ID and display name.
- A default local typist exists so legacy single-user behavior continues without setup friction.
- Profile selection is unavailable while a session is Running or Paused.
- Profile selection persists locally across reloads.
- No profile data leaves the browser.

### F45 — Profile-scoped scores, history, PBs, and analytics

- Every newly saved test is assigned to the active typist.
- History table, rolling 10/50/all-time averages, daily activity, history chart, personal best, and ghost pacer operate only on the active typist's records.
- History export exports the active typist's visible history set.
- Imported tests are assigned to the currently active typist; external/local profile IDs do not create profiles implicitly.
- Legacy records without a profile ID are migrated once to the default local typist.

### F46 — Reset selected typist scores

- A destructive **Reset [typist] scores…** action deletes only that profile's saved tests.
- Confirmation copy states exactly which typist will be affected.
- The profile itself, preferences, dictionaries, drills, and other typists' records remain intact.
- The selected profile's personal best and analytics refresh immediately after reset.
- Existing browser-wide storage clearing is not exposed through an ambiguously labeled profile-history control.

### F47 — Session guardrails and state clarity

- The UI visibly communicates Ready, Running, Paused, and Finished.
- Target/configuration/profile-changing controls cannot silently reset an active or paused session.
- F2/New text is blocked during Running/Paused with a status message instructing the user to Stop or Reset first.
- Configuration mutations are rejected at the action boundary during Running/Paused, not merely visually disabled.
- Session controls remain keyboard-operable with visible focus; status changes use the existing polite live region.
- Compact layouts must not introduce page-level horizontal overflow or clipped controls.
- Result/profile/reset dialogs retain keyboard escape/focus-trap behavior already expected by the tool.

## Persisted-data model

### Local typist

```ts
interface StoredTypist {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
}
```

### Stored test delta

```ts
interface StoredTest {
  // existing fields...
  typistId?: string;
  finishReason: 'completed' | 'failed' | 'aborted' | 'stopped';
}
```

`typistId` remains optional at the normalization boundary only for backward compatibility. All new saves and migrated local rows receive an ID.

### Default profile

Use one stable application-owned ID for the default local typist. Initialization ensures that profile exists and migrates legacy rows lacking `typistId` to it without changing test metrics or timestamps.

## Session timing invariants

- Effective session timestamps are monotonic.
- `effectiveNow = performance.now() - accumulatedPausedMs - currentPauseSpanMs`.
- Engine `startedAt`, keystroke event timestamps, stop/finish timestamps, and timer calculations use the same effective clock.
- While Paused, `effectiveNow` remains frozen.
- Reset clears all pause accounting.
- New target/configuration changes can occur only outside Running/Paused.
- Browser tab visibility does not silently auto-resume or manufacture input; explicit pause remains user-controlled.

## UX structure

Add a compact session bar near the top of the workstation:

- Active typist selector and **Add typist**
- State badge: Ready / Running / Paused / Finished
- Primary lifecycle control: Start or Resume
- Pause
- Stop
- Reset attempt

Configuration stays in the existing configuration toolbar but is disabled while Running/Paused. The history heading identifies the active typist and the destructive history action becomes profile-specific.

## Backward compatibility

- Existing v1 IndexedDB records remain readable.
- Existing saved tests are preserved and assigned to the default typist during profile initialization.
- Existing JSON import schema remains accepted.
- Existing exports remain valid; profile assignment is additive and does not make older export bundles unreadable.
- Existing implicit-start typing remains supported.
- Existing `Escape` abort, F2 fresh-text when idle, native software-keyboard/IME input, and physical `KeyboardEvent.code` capture remain intact.

## Acceptance criteria

1. Start before typing counts intentional pre-typing elapsed time.
2. Implicit first-character start still works.
3. Pause freezes remaining/elapsed time and input; Resume continues without counting paused duration.
4. Stop opens a score result with `finishReason: "stopped"`; stopped results can save/export but cannot issue a certificate or PB ghost.
5. Reset attempt returns the same target to zero score without changing profile/configuration.
6. Two local typists can save different scores; each sees only their own history, averages, PB, chart, activity, and export set.
7. Legacy unassigned records survive migration into the default profile exactly once.
8. Resetting one typist's scores does not remove another typist's scores.
9. Config/profile/New text cannot silently reset a Running or Paused session.
10. Keyboard, mobile input/composition, focus, Axe serious/critical, and 320/360/390/430/768px reflow regressions remain green.

## Benchmarks and standards

- Existing repository Typing architecture and its accepted 38-capability contract are the primary compatibility benchmark.
- Typing.com's current official documentation is used only as a real-world feature benchmark for per-student progress/history/reset expectations; this implementation remains local-first and intentionally excludes account/classroom infrastructure.
- WCAG 2.2 keyboard access, focus visibility/non-obscuring behavior, status messages, and target-size expectations remain the accessibility benchmark.
- MDN Performance API guidance supports continuing to use the monotonic `performance.now()` clock for session timing.

## Completion validation

The approved F39–F47 design is implemented on `main`. Focused Typing workflow run `36188765930` / job `108248550068` passed **76/76 focused unit tests across eight files**, the production build, Chromium setup, and **18/18 desktop/mobile browser checks**. Pages run `36188765977` built and deployed the same `722285…` product revision successfully.

The final Gauntlet pass additionally challenged history/profile state during active tests. JSON history import, saved-row deletion, and selected-profile score reset are now unavailable while Running/Paused so PB/ghost/history context cannot change underneath a live attempt. The intentionally focusable New text guard also has a visible unavailable state while preserving its explanatory status behavior.

## Non-goals

- Authentication or passwords
- Cloud or cross-device profile sync
- Teacher/class rosters or permissions
- Remote/global leaderboards
- Billing
- Server-side persistence
- New third-party dependencies

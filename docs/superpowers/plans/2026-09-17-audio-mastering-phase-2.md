# Audio Mastering Workstation Phase 2 Implementation Plan

**Goal:** Add precision utility editing and timeline navigation without introducing a second DSP architecture.

**Architecture:** Extend the existing immutable `AudioEdit` replay stack with small pure PCM transforms. Keep browser acceptance consolidated in the existing Mastering workflow; use unit tests for sample/channel math and do not duplicate MediaBunny/Web Audio internals.

**Tech Stack:** React 19.2.8, TypeScript 7.0.2, Web Audio API, MediaBunny 1.58.0, Vitest 4.1.11, Playwright 1.63.0.

**Spec:** `docs/superpowers/specs/2026-09-16-audio-mastering-workstation-design.md`

## Constraints

- Stay on `feature/audio-mastering-workstation`; do not merge into `main`.
- Preserve Phase 1 behavior and the complete Harmony/MIDI surface.
- Test public math/state seams, not each button and not dependency internals.
- Every destructive-looking operation remains replayable from immutable source PCM.

### Task 1 — Utility DSP primitives
- [x] Add DC measurement/removal, polarity inversion, range reverse, and silence insertion.
- [x] Add stereo swap, mono fold-down, single-channel extraction, and dual-mono utilities.
- [x] Prove the focused unit tests red before implementation, then green.

### Task 2 — Reversible edit integration
- [x] Extend `AudioEdit` replay for the new transforms.
- [x] Add edit redo alongside existing undo and clear redo on divergent edits.
- [x] Keep selection/playhead bounded when duration/channel count changes.

### Task 3 — Regions and keyboard transport
- [x] Add editable marker naming and selection-derived named regions with jump/remove actions.
- [x] Add non-conflicting global transport shortcuts outside editable/interactive controls: Space play/pause, Left/Right seek, Escape stop, L loop.
- [x] Expose shortcut help inline rather than relying on hidden behavior.

### Task 4 — UI utility rack
- [x] Add DC readout/removal, polarity, reverse-selection/whole, silence-duration insertion, and channel operations.
- [x] Show the working channel count separately from immutable source metadata.
- [x] Keep the narrow layout stacked and every precision action available without drag.

### Task 5 — Lean acceptance and tracking
- [x] Extend the existing focused Mastering browser workflow rather than creating one test per utility.
- [x] Run Mastering/Music units, production type/build gate, and desktop/mobile Mastering browser acceptance.
- [ ] Update the 81-function completion count only for fully satisfied ledger items, then commit/push the dedicated branch.

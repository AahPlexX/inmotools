# Audio Mastering Workstation Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Ship the production foundation of the local audio mastering workstation without removing the existing Harmony Lab.

**Architecture:** `MusicWorkspace` becomes a two-surface shell. The Mastering surface owns a serializable project model and keeps decoded `AudioBuffer` data in an ephemeral buffer registry; MediaBunny handles container/codec inspection/decoding, Web Audio owns audition lifecycle, and pure helpers own edit/peak math.

**Tech Stack:** React 19.2.8, TypeScript 7.0.2, Web Audio API, MediaBunny 1.57.0, Vitest 4.1.11, Playwright 1.63.0.

**Spec:** `docs/superpowers/specs/2026-09-16-audio-mastering-workstation-design.md`

## Global constraints

- Work only on `feature/audio-mastering-workstation` until final verified integration.
- No native plugin hosting, backend rendering, secret/API dependency, or unbounded channel counts.
- Pin every added dependency exactly; use existing/native capability before adding one.
- Preserve current MIDI Harmony behavior as a secondary surface.
- Test owned behavior, not dependency internals; add regression breadth only when a defect justifies it.
- WCAG 2.2 AA keyboard/focus/drag-alternative/target-size behavior is a release gate.

---

### Task 1: Foundation state and edit math
**Files:** Create `src/tools/music/mastering-engine.ts`; Test `tests/unit/mastering-engine.test.ts`.
**Produces:** project/track/clip/marker types; `createProject`, `clampSelection`, `findZeroCrossing`, `buildPeakEnvelope`, `applyGain`, `normalizePeak`.
- [x] Write one focused unit file covering zero crossing, peak envelope, gain, normalization, and immutable state creation.
- [x] Run it red before implementation.
- [x] Implement only the pure functions required by those assertions.
- [x] Run the focused unit file green.

### Task 2: MediaBunny import boundary
**Files:** Create `src/tools/music/mastering-media.ts`; Test in `tests/unit/mastering-engine.test.ts` only for pure concatenation helpers.
**Produces:** `inspectAudioFile(file)` and `decodeAudioFile(file)` returning technical metadata, descriptive tags, and one contiguous `AudioBuffer` for the primary audio track.
- [x] Use `Input`, `BlobSource`, `ALL_FORMATS`, and `AudioBufferSink` from MediaBunny 1.57.0.
- [x] Reject files without a decodable audio track with a user-readable error.
- [x] Keep MediaBunny codec behavior un-retested; cover only our buffer concatenation and validation seam.

### Task 3: Preserve Harmony and mount Mastering
**Files:** Create `src/tools/music/HarmonyWorkspace.tsx`, `src/tools/music/MasteringWorkspace.tsx`, `src/tools/music/MasteringWaveform.tsx`; Modify `src/tools/music/MusicWorkspace.tsx`.
**Produces:** Mastering-first workspace switcher with the existing Harmony UI unchanged behind a secondary tab.
- [x] Move the existing component body to `HarmonyWorkspace.tsx` without changing its public behavior.
- [x] Add semantic tab controls with Mastering selected by default and keyboard-visible focus.
- [x] Add local file open/drop, source inspector, waveform, playhead, selection, and marker UI.
- [x] Pair waveform pointer interactions with numeric selection fields and marker buttons so dragging is never the only path.

### Task 4: Audition and first edit operations
**Files:** Modify `MasteringWorkspace.tsx`; use `mastering-engine.ts` helpers.
**Produces:** one owned AudioContext/source graph; play/pause/stop/seek/loop; crop-to-selection; zero-cross snap; gain and peak-normalize operations.
- [x] Snapshot playback state at play time and release every node/context on stop, reload, tab switch, and unmount.
- [x] Apply crop/gain/normalize into a new AudioBuffer while retaining an undoable project revision.
- [x] Rebuild peaks after source revision changes and keep selection bounded to the new duration.

### Task 5: Browser acceptance without test bloat
**Files:** Modify `tests/e2e/music.spec.ts` and `tests/unit/music.test.ts` only where the Harmony tab changes the route surface; add `tests/e2e/mastering.spec.ts`.
**Produces:** one focused Mastering browser workflow and preserved Harmony regression coverage.
- [x] Use one deterministic in-test WAV fixture to exercise import, selection, marker, playback lifecycle, edit, undo, and inspector state.
- [x] Run the same focused browser workflow on desktop and mobile Chromium.
- [x] Keep the existing Harmony tests; update only navigation needed to reach the secondary surface.

### Task 6: Tracking and verification
**Files:** Modify `.tasks/IN_PROGRESS.md`; retain this plan/spec/research note; package/lock/workspace files already pin MediaBunny 1.57.0.
- [x] Record the 81-function completion contract and current Phase 1 milestone in `IN_PROGRESS.md`.
- [x] Run focused Mastering + Harmony units, production build, and focused desktop/mobile browser specs.
- [x] Because MediaBunny is shared with the video slicer, run its focused unit/browser coverage or build-level integration check before committing the dependency bump.
- [ ] Review the final diff for unrelated changes and commit/push only the dedicated branch.

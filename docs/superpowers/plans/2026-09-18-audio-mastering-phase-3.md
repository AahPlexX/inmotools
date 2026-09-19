# Audio Mastering Workstation Phase 3 Implementation Plan

**Status:** Next sequential milestone after verified Phase 2.
**Branch:** `feature/audio-mastering-workstation` only; do not merge to `main`.
**Goal:** Replace the current single-buffer/edit-stack state with an atomic project/timeline revision model, then build precise clip and multi-track editing without regressing the verified Phase 1–2 workflow.
**Dependency baseline (2026-09-18):** MediaBunny 1.58.0 exact, React 19.2.8, TypeScript 7.0.2, Vitest 4.1.11, Playwright 1.63.0.

## Research decisions resolved 2026-09-19
- Durable project storage: `docs/research/audio-mastering-storage-policy-2026-09-19.md`. Use IndexedDB for versioned project/recovery state; reference/relink source media by default; optional explicit OPFS media copies; portable backups remain independent of browser-managed storage.
- Heavy processing: `docs/research/audio-mastering-worker-dsp-architecture-2026-09-19.md`. Main thread owns UI/orchestration only; one dedicated DSP worker is the default heavy-compute lane; AudioWorklet is for bounded realtime custom processing; OfflineAudioContext is for graph-native offline bounce; SharedArrayBuffer is optional only.
- Export matrix: `docs/research/audio-mastering-export-codec-matrix-2026-09-19.md`. WAV uses built-in PCM; MP3/FLAC/AAC use native capability plus official Mediabunny extension fallback when needed; M4A uses AAC in ISOBMFF; all output capability is checked at runtime.
- Ogg fallback: `docs/research/audio-mastering-ogg-encoder-fallback-2026-09-19.md`. Prefer native Opus; when unavailable, lazy-load an exact-pinned, then-current `@audio/encode-opus` and adapt its documented raw packet core through Mediabunny `CustomAudioEncoder`. Do not add that dependency until the export implementation reaches it, and revalidate official source + npm immediately before pinning.
- Spectral edit model: `docs/research/audio-mastering-spectral-edit-model-2026-09-19.md`. Persist semantic clip-local operations in seconds/Hz; keep STFTs, spectrogram tiles, and render blocks derived/worker-owned; require invertible deterministic processing profiles.
- Loudness/true peak: `docs/research/audio-mastering-loudness-true-peak-2026-09-19.md`. Target the in-force ITU-R BS.1770-5 and current EBU R128/Tech 3341/3342 definitions; official EBU/ITU reference vectors are mandatory acceptance evidence.
- Project/preset migration contract: `docs/research/audio-mastering-project-schema-migrations-2026-09-19.md`. Keep IndexedDB layout version, project document schema version, and processor preset/algorithm versions independent; restore through pure sequential migrations + current-schema validation; autosave persists present state only; reuse existing JSZip for later self-contained backups.
- These are architecture decisions only. They do **not** advance the 13/81 implementation count or close any Phase 3 implementation checkbox.

## Resume point — read before editing
- Phase 2 is green: 29/29 focused Mastering/Music units, 7/7 MediaBunny-sharing video units, production build, and 2/2 desktop/mobile Mastering browser cases.
- The deterministic completion ledger is 13/81. Functions 5, 11, and 17 are explicitly partial.
- Audio edit undo/redo currently tracks only `AudioEdit[]`; marker/region shifts caused by crop or silence insertion are separate React state mutations.
- Therefore **Task 1 is mandatory before any broader timeline feature**. Do not add more timeline mutations to the split history model.
- Preserve the existing Harmony/MIDI secondary workspace and the Phase 1–2 Mastering browser workflow.

## Task 1 — Atomic project revision history (ledger 17)
- [ ] Define one serializable Mastering document/revision state containing source references, edit stack, selection, markers, regions, track/clip state, and metadata edits.
- [ ] Add pure revision reducer/helpers with bounded undo/redo; divergent edits clear redo.
- [ ] Move crop and silence annotation shifts into the same atomic revision as their audio edit.
- [ ] Prove undo/redo restores audio edits, markers, regions, selection, and playhead together.
- [ ] Migrate `MasteringWorkspace` from split history state without changing visible Phase 2 behavior.
## Task 2 — Precise clip editing (ledger 11 and 13)
- [ ] Add sample-accurate split, trim start/end, range delete, and crop using zero-crossing-aware optional boundaries.
- [ ] Introduce clip move, duplicate, and numeric/keyboard nudge without copying immutable source PCM.
- [ ] Keep markers/regions deterministic when clip/range time changes.
- [ ] Unit-test boundary math and history transitions; extend the existing browser workflow instead of one test per command.

## Task 3 — Bounded multi-track document (ledger 4, 10, 16)
- [ ] Support up to eight mono/stereo tracks with explicit rejection beyond the bound.
- [ ] Add multi-file import/drop queue, track rename, reorder, mute, solo, gain, and pan.
- [ ] Add per-clip gain while keeping source buffers immutable and referenced by source IDs.
- [ ] Preserve local-only processing and release all playback graphs on source/project replacement.

## Task 4 — Fades and crossfades (ledger 14–15)
- [ ] Add linear, equal-power, exponential, logarithmic, and S-curve clip fades.
- [ ] Add overlap crossfade with editable duration/curve and deterministic boundary validation.
- [ ] Pair spatial handles with numeric/keyboard controls so dragging is never required.

## Task 5 — Durable local project state (ledger 18; foundation for 81)
- [ ] Add versioned project serialization with schema validation and migration hook.
- [ ] Add bounded crash-safe autosave/recovery using local structured storage; never persist raw source audio without an explicit product decision.
- [ ] Add manual project backup/restore round-trip and recovery-state UI.
## Task 6 — Waveform navigation completion (ledger 5)
- [ ] Replace the single fixed 1200-bucket waveform with a revision-keyed peak pyramid.
- [ ] Add horizontal zoom/pan and keep playhead, selection, markers, and regions synchronized.
- [ ] Guard stale async peak results by source/revision ID.

## Task 7 — Lean acceptance and milestone reconciliation
- [ ] Keep unit tests concentrated on reducer/history, clip-time math, fades, and peak-cache seams.
- [ ] Extend one desktop/mobile Mastering browser workflow for project history, multi-track, and zoom; add separate browser coverage only for materially different failure modes.
- [ ] Run focused Mastering/Music units, shared MediaBunny regression only if its integration changes, production build, desktop/mobile acceptance, and accessibility/keyboard checks.
- [ ] Update `.tasks/IN_PROGRESS.md`, this plan, research/dependency evidence, and the 81-function count immediately after verification.
- [ ] Commit/push only `feature/audio-mastering-workstation`; no merge to `main` until all 81 completion gates are satisfied.

## Definition of Phase 3 done
Phase 3 closes only when ledger 17 is truly atomic across audio + annotations, all implemented timeline/track controls are browser-reachable, project recovery round-trips are verified, responsive keyboard alternatives remain intact, all focused gates are green, and tracking identifies the exact next unimplemented ledger items with no inferred state required.

# Audio Mastering Workstation Phase 3 Implementation Plan

**Status:** Active after verified Phase 2; Task 1 (ledger 17) is complete; Task 2 (ledgers 11 and 13) is partially implemented and remains active as of 2026-09-24.
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
- These are architecture decisions only. They did not advance the ledger; verified implementation evidence currently sets progress at 14/81.

## Resume point — read before editing
- Phase 2 is green: 29/29 focused Mastering/Music units, 7/7 MediaBunny-sharing video units, production build, and 2/2 desktop/mobile Mastering browser cases.
- The deterministic completion ledger remains 14/81. Functions 5 and 11 remain partial; function 17 is complete. Task 2 is active and does not yet meet its ledger acceptance gate.
- The 2026-09-24 migration consolidates source reference, audio edits, selection, markers, regions, track/clip placeholders, metadata edits, and playhead into serializable `MasteringDocument` state with bounded undo/redo.
- Crop and silence insertion now commit their audio edit and timeline annotations together. Ordinary seek/selection/ticker updates replace view state without adding undo entries; marker/region create, rename-on-blur, and remove are project revisions.
- Task 1 acceptance: reducer unit suite 6/6; production build/typecheck passes; Mastering desktop/mobile Chromium workflow passes 2/2, including crop undo/redo restoring annotations and selection.
- Task 2 partial evidence (2026-09-24): engine/project units pass 29/29; `tsc --noEmit -p tsconfig.app.json` and production Vite build pass after sample-rate-aware clip initialization and frame-aligned revisions. The existing Mastering desktop/mobile Playwright workflow passes 2/2 against the rebuilt app on preview port 4175. Browser coverage includes the current import, transport, range edit, and history workflow; clip arrangement controls and playback rendering remain untested because they are not yet connected.
- Implemented so far: pure `splitPcmAt`, `trimPcmStart`, `trimPcmEnd`, and `deletePcmRange`; a reversible `deleteRange` operation; crop/trim-before/trim-after/delete selection controls; deterministic annotation remapping for range deletion; and an initial source-backed track/clip plus pure split/move/duplicate/nudge document revisions. The source sample rate is retained and clip timeline positions are quantized to its sample frames. UI edit endpoints are normalized to sample-frame timestamps before audio and annotation revisions; optional zero-crossing snapping adjusts those boundaries first. Clip state helpers do not copy or render PCM and are not yet connected to playback or visible controls.
- Still required before Task 2 can close: render clip arrangements in playback/waveform, define and test gaps and overlaps, expose split/move/duplicate/numeric-and-keyboard nudge controls with accessible alternatives, and verify clip-level undo/redo and marker/region behavior. Do not count ledger 11 or 13 complete until these requirements and the remaining task criteria are met.
- Preserve the existing Harmony/MIDI secondary workspace and the Phase 1–2 Mastering browser workflow.

## Task 1 — Atomic project revision history (ledger 17)
- [x] Define one serializable Mastering document/revision state containing source references, edit stack, selection, markers, regions, track/clip state, and metadata edits.
- [x] Add pure revision reducer/helpers with bounded undo/redo; divergent edits clear redo.
- [x] Move crop and silence annotation shifts into the same atomic revision as their audio edit.
- [x] Prove undo/redo restores audio edits, markers, regions, selection, and playhead together.
- [x] Migrate `MasteringWorkspace` from split history state without changing visible Phase 2 behavior.
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

# Audio Mastering Workstation — Production Audit and Competitive-Parity Backlog

**Audit date:** 2026-09-27  
**Route:** `#/tools/audio-mastering`  
**Audit branch:** `audit/audio-mastering-20260927-reconciled`  
**Integration:** squash-merged into `origin/main` from `feature/audio-mastering-production-audit` on 2026-10-01. PR #82 and PR #85 carried earlier versions of this work and were closed unmerged, so neither is the integration record.  
**Historical feature ledger:** `docs/superpowers/plans/2026-09-27-audio-mastering-completion.md` — remains the authoritative record for the original 81/81 feature build. This file does not replace or rewrite that history.

## Purpose

This document is the durable handoff for the post-merge production audit and the next competitive-parity phase. It has two separate jobs:

1. record verified defects, real-world UX/accessibility failures, dependency/runtime issues, misleading copy, and their fixes;
2. keep new feature/parity ideas separate from defect remediation so future agents do not silently expand scope or partially implement a large subsystem.

The workstation remains constrained to the repository's static, backend-free, local-first GitHub Pages architecture. New work must preserve local processing, no required account/database/server, device-agnostic interaction, keyboard access, WCAG 2.2 AA behavior, exact dependency pins, and the current non-destructive document/history model.

## Evidence baseline

- Original workstation: 81/81 functions complete and integrated through PR #81.
- Post-merge audit started from exact merged `main` revision `4685013b261f83408145bed98851d09b0bca752e`.
- Exact pre-audit `main` Pages deployment was green.
- The strongest green audit checkpoint before the final hardening additions passed 2104/2104 repository unit tests, production build, and the repository browser matrix with 982 passing checks including desktop/mobile mastering coverage.
- The final audit head must still pass the normal repository validation plus exact-main Pages deployment after integration before this workstream is closed.

## Current-date competitor benchmark

Primary/first-party sources reviewed on 2026-09-27:

- AudioMass production repository and first-party About page:
  - https://github.com/pkalogiros/AudioMass
  - https://github.com/pkalogiros/AudioMass/blob/production/src/about.html
- Audacity official feature/manual documentation:
  - https://www.audacityteam.org/features/
  - https://manual.audacityteam.org/man/spectral_selection.html
  - https://manual.audacityteam.org/man/spectral_selection_toolbar.html
  - https://manual.audacityteam.org/man/macros.html
  - https://manual.audacityteam.org/man/recording.html
- Adobe Audition official documentation:
  - https://helpx.adobe.com/audition/desktop/editing-audio-files/match-loudness.html
  - https://helpx.adobe.com/audition/desktop/saving-and-exporting/saving-exporting-files1.html
  - https://helpx.adobe.com/audition/desktop/mixing-multitrack-sessions/multitrack-editor-overview.html
- BandLab official mastering documentation:
  - https://help.bandlab.com/hc/en-us/articles/55678885417113-BandLab-Mastering-FAQ
  - https://help.bandlab.com/hc/en-us/articles/360001374513-Using-BandLab-Mastering-on-your-songs
- Platform/accessibility references used by the audit:
  - https://developer.mozilla.org/en-US/docs/Web/API/AudioWorkletNode/processorerror_event
  - https://developer.mozilla.org/en-US/docs/Web/CSS/overflow
  - https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/input/number
  - https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Global_attributes/inputmode
  - https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
  - https://www.w3.org/WAI/standards-guidelines/act/rules/0ssw9k/

## Production findings and dispositions

### Fixed in this audit branch

1. **Realtime AudioWorklet processor failure could leave playback apparently active while the processor had gone permanently silent.**
   - Added explicit `processorerror` handling, graph teardown, playhead preservation, paused state, and actionable recovery copy.
   - Added red-first desktop/mobile browser regression coverage.

2. **Fatal DSP Web Worker failure was not a first-class workspace state.**
   - The client now surfaces worker `error` and `messageerror` once, rejects pending work, and cleans a synchronous `postMessage` failure.
   - Worker construction/startup failures are caught by the workspace instead of escaping the React effect; an empty tool now explains the failure and disables audio import until reload.
   - The workspace fails closed for DSP-dependent edits/import/restore, explains that local processing stopped, and keeps project-backup export available so work can be rescued.
   - Opening a backup is disabled after fatal DSP failure because that operation also needs the failed worker.
   - Browser regressions cover both a worker that crashes after audio loads and a browser context where Worker construction is blocked.

3. **Project/import replacement was not fully transactional.**
   - Superseded restore/import paths now release worker sources they introduced.
   - Reopening a backup whose source ids matched the live project could overwrite live worker PCM before all backup sources had decoded, then report that the current project was unchanged if a later source failed.
   - Restored sources are now staged under fresh worker ids, the restored document is remapped to those ids, and old live sources are released only after every staged source succeeds. A failed restore releases only staged sources.
   - Browser coverage creates a two-source backup, corrupts the second source, and proves the first restore source uses a fresh id and is released on failure.
   - Drag/drop and project-level file operations are serialized so incompatible operations do not race.

4. **Reference replacement had a last-operation-wins race.**
   - Removing the current reference is disabled while a replacement is decoding.

5. **Project validation allowed ambiguous identity after normalization.**
   - Clip IDs are checked after the same 120-character normalization used for storage.
   - Duplicate track, marker, and region IDs are rejected.
   - `activeClipId` is normalized before lookup.
   - Red-first unit coverage records the previously accepted collisions.

6. **Compressed export capability probing was too generic.**
   - Encoder support is now checked against the exact channel count, sample rate, and quality used for export.
   - First-party MediaBunny WASM fallback registration is also tested against the exact requested configuration.
   - Ogg explicitly checks Opus, then Vorbis, and reports a real unsupported configuration instead of assuming Vorbis will work.

7. **MediaBunny family was pinned at 1.58.0 while current 1.59+/1.60 fixes included an audio-resampling flush correction relevant to conversion/export.**
   - Core plus AAC/FLAC/MP3 encoder packages were regenerated through pnpm and exactly pinned together at 1.60.0.
   - `pnpm-lock.yaml` was generated by pnpm; it was not hand-edited.
   - The temporary lockfile-refresh workflow removed itself after use.

8. **Several workstation-authored controls fell below the tool's own 44px target baseline.**
   - Buttons, check labels, shortcut summary, number controls, clip chips, timeline scroll control, and range sliders now meet the authored 44px baseline.
   - Browser coverage audits every visible tab rather than only the default surface.
   - WCAG 2.2 AA itself requires 24px minimum or sufficient spacing; this tool intentionally keeps the stricter 44px product rule.

9. **Spectrogram paint mode conflicted with touch scrolling.**
   - Time-selection mode keeps `touch-action: pan-y` so vertical page scrolling remains natural.
   - Paint mode switches to `touch-action: none` because painting requires both horizontal and vertical pointer movement.
   - Browser assertions cover both modes.

10. **Responsive report tables were inconsistent.**
    - The six-column peak/RMS/crest table and rendered before/after master report are now horizontally contained instead of forcing page-level overflow.
    - Export, diagnostics, peak, and before/after report scroll containers are named focusable regions so keyboard users can reach and scroll them consistently across browsers.
    - Focus-visible styling was added.

11. **Listen-choice and spectrogram-mode controls used incomplete ARIA radio semantics on buttons.**
    - They now use normal buttons with `aria-pressed`, avoiding custom radio-keyboard expectations the implementation did not provide.

12. **Reference availability depended on a native `title` tooltip.**
    - The unreliable pointer-hover/native-title explanation was replaced by persistent inline transport guidance: the user is told to load a reference on the Meters tab.
    - The detailed reference instructions remain in Meters.

13. **Export guidance contained absolute compatibility claims and ambiguous telemetry language.**
    - WAV/FLAC/MP3/AAC/Ogg descriptions now state concrete tradeoffs instead of “universally supported,” “plays everywhere,” or “best quality.”
    - The Last Export report now explicitly says its loudness/peak data is measured on rendered PCM before lossy encoding, not post-codec compliance telemetry.

14. **Autosave/recovery wording promised more than browser storage guarantees.**
    - Copy now describes recovery as conditional on browser storage remaining available.
    - Persistent-storage success is described as reducing automatic eviction risk, not guaranteeing retention.
    - Backup portability says “compatible browser,” not “any browser.”

15. **Task documentation still described the already-merged workstation as awaiting PR #81 integration.**
    - `.tasks/IN_PROGRESS.md` now tracks this post-merge audit against the exact merged baseline.
    - The historical completion plan has an additive status notice marking PR #81 as integrated history and points to this audit; its original evidence remains intact.
    - Final branch/main validation evidence will be appended at closure rather than rewriting prior records.

16. **Free-form numeric controls mixed browser constraint validation with application state and produced brittle typing.**
    - HTML `min`/`max` marks manually entered out-of-range numbers invalid, but does not prevent such text from being entered; processing state now enforces bounds at the shared field seam instead of assuming attributes are business logic.
    - Edit gain/normalization/silence, exact selection times, Time & Pitch parameters, all Repair parameters, Meters peak threshold, Sample Pen index/value, and spectrogram attenuation now use one draft-safe field behavior.
    - Complete in-range numbers update local previews immediately; empty/intermediate or out-of-range drafts do not become processing state; Enter/blur commits a bounded value and Escape restores the committed value.
    - Direct range/select controls remain native because they already emit constrained values.
    - Signed ranges request a standard text keyboard instead of a decimal keypad because current platform guidance explicitly notes that decimal/numeric virtual keyboards may omit the minus key; nonnegative ranges keep the decimal keypad hint.
    - Browser coverage physically types negative decimal values, checks signed/nonnegative `inputmode` hints, and verifies an out-of-range clamp instead of relying only on programmatic `fill()`.

17. **The smallest authored informational text was unnecessarily dense for compact devices.**
    - Timeline lane labels, clip labels, and report headers were the only 11px mastering text found in the branch-wide CSS scan; they are now 12px with slightly more line height.
    - Browser coverage guards a 12px authored informational-text floor for those surfaces. This is a product legibility rule, not a claim that WCAG defines a 12px minimum.

18. **Mastering/loudness guidance still contained technically overconfident delivery language.**
    - Limiter help now explains that the true-peak ceiling applies before later sample-rate conversion/lossy encoding and that decoded peaks can move slightly.
    - “Render and measure” now states that it measures project-rate rendered PCM, not the final resampled/lossy file.
    - Loudness presets are explicitly comparison references rather than universal streaming/delivery requirements.

### Verified clean / no repair warranted

- No `TODO`, `FIXME`, `HACK`, or `XXX` implementation markers were found under `src/tools/music/`.
- No `as any`, `: any`, `@ts-ignore`, or `@ts-expect-error` escape was found in the music tool.
- No XHR/WebSocket/hidden upload path was found. The only search hit for “fetch” in the mastering UI is a comment about fetching local sample data from the DSP worker.
- Realtime and offline mastering share the same `MasterChain` implementation, reducing audition/export divergence.
- Existing keyboard/numeric alternatives cover the canvas interactions that require precision editing.
- The 81-function implementation is not truncated; production TypeScript/build validation has remained green at audit checkpoints.

## Competitive parity matrix

| Capability | Current workstation | Competitive signal | Audit disposition |
| --- | --- | --- | --- |
| Local browser processing | Yes | AudioMass is local/browser based | Parity/exceeds through richer backup + mastering telemetry |
| Multitrack arrangement | Yes, capped at 8 tracks | AudioMass multitrack; Audition effectively resource-limited | Parity in core behavior, capacity strategy needs review |
| Direct clip dragging | No; numeric start, nudge, track move controls instead | AudioMass/Audacity expose direct clip dragging | **Gap — high-value, achievable** |
| Clip-edge trim/fade handles | No; precise numeric trim/fade controls exist | AudioMass exposes direct trim/fade handles | **Gap — high-value, achievable** |
| Cut/copy/paste editing | Delete/crop/duplicate exist; no project clipboard workflow | AudioMass exposes cut/copy/paste | **Gap — high-value, achievable** |
| Recording / overdub | No | AudioMass and Audacity record locally | **Gap — achievable with browser permissions; separate subsystem** |
| Beat detection/grid/metronome/snap | No; BPM conversion exists only in Time & Pitch | AudioMass documents beat detection, beat bars, and snap | **Gap — achievable** |
| Seamless-loop preparation | Loop audition exists; no dedicated loop assistant | AudioMass documents crossfade/silence-trim/zero-cross loop preparation | **Gap — achievable** |
| Effect preview before committing destructive edits | Master chain is realtime; destructive repair/edit effects are undoable but generally commit-first | AudioMass documents effect preview | **Gap — high-value** |
| Precise spectral selection toolbar | Painted spectral regions + repair numeric path; no shared editable low/high/center/width selection model | Audacity exposes precise keyboard spectral selection controls | **Gap — achievable** |
| Macro / reusable processing chain | Master presets only | Audacity macros automate effect sequences and batch files | **Gap — medium/high value** |
| Batch loudness matching | Loudness analysis/reporting and per-export master chain; no multi-file target-matching queue | Audition has Match Loudness across multiple files | **Gap — achievable within local worker model** |
| Rich export formats/metadata | WAV/BWF, FLAC, MP3, AAC/M4A, Ogg; tags, artwork, stems/regions, ZIP reports | AudioMass/Audition both export common formats | **Current workstation is unusually strong here** |
| Mastering chain + metering | EQ, dynamics, multiband, saturation, stereo, clipper, true-peak limiter, BS.1770 loudness, spectrum/image telemetry | BandLab emphasizes mastering presets; Audition provides loudness workflows | **Current workstation exceeds lightweight browser-editor parity** |
| Portable project + source bundle | Versioned ZIP with original sources plus autosave recovery | AudioMass has local session files; Audition can archive sessions | **Strong parity** |
| Plug-in ecosystems / VST | No | Audacity/Audition desktop products support plug-ins | **Not a GitHub-Pages parity target** |
| Cloud collaboration/accounts | No by repository rule | BandLab/Soundtrap class products rely on cloud identity/storage | **Explicitly out of scope** |
| Server/AI mastering | No | BandLab offers hosted mastering | **Out of scope unless a future client-only model is proven practical** |

## Feature brainstorm — proposed phases, not yet implementation scope

These are intentionally not folded into the 81-function completion ledger. Each needs a design/acceptance contract before code is added.

### Phase A — editor ergonomics and direct manipulation (recommended first)

Goal: remove the biggest real-world friction without changing the DSP architecture.

1. direct clip drag within/between tracks with frame-grid snapping;
2. clip left/right trim handles and fade handles with numeric fields staying authoritative and synchronized;
3. project clipboard: copy/cut/paste selection or clip, with deterministic source references and undo;
4. marker previous/next navigation and “selection between markers” QoL;
5. effect-preview transaction for destructive Edit/Repair operations, with A/B before commit;
6. compact interaction hints that work for pointer, keyboard, and touch without hover-only tooltips.

Why first: these are the areas where AudioMass/Audacity feel faster despite this workstation already having deeper DSP/mastering capability.

### Phase B — capture, timing, and looping

1. local microphone/line recording through `getUserMedia` with explicit permission/error states;
2. record to new track / selected track and optional overdub playback;
3. coarse beat/tempo analysis, beat ruler, metronome audition, and snap-to-beat;
4. seamless-loop assistant: trim edge silence, zero-cross snap, adjustable crossfade, repeated audition, apply or create new clip;
5. recording/input level meter and clipping warning.

Guardrail: do not imply low-latency hardware monitoring the browser cannot guarantee. Recording must remain useful without promising DAW-interface latency.

### Phase C — power workflows

1. reusable local macro chain built from existing deterministic edit/master operations;
2. batch queue for local files with bounded concurrency/memory;
3. batch loudness scan/match with target, tolerance, and true-peak ceiling;
4. precise spectral selection model with low/high and center/width entry plus frequency-peak navigation;
5. optional track/clip gain and pan automation envelopes if the timeline interaction model remains maintainable.

### Capacity review

The fixed 8-track ceiling is a real competitive limitation for larger music/podcast work. Do **not** simply change the constant. Benchmark memory, worker transfer cost, render latency, phone behavior, and backup size first. A future design should choose either:

- a higher tested fixed ceiling (for example 16), or
- a resource-aware soft ceiling with explicit device warnings.

## UX / typography findings that need a design pass rather than isolated CSS churn

- Secondary copy is frequently 11–12px. It is not by itself a WCAG failure, but it is dense for phone use and should be reviewed as one typography system rather than enlarged piecemeal.
- Eight workbench tabs are functionally keyboard-accessible and horizontally scrollable, but compact devices could benefit from a clearer tab-overflow affordance or alternate compact navigation.
- Timeline clip selection is keyboard-accessible, but direct manipulation is missing; adding tooltips alone would not solve the core discoverability/efficiency gap.
- Native-title tooltips should not be introduced as a general solution. Prefer visible contextual help, labels, status feedback, or a shared accessible tooltip/popover primitive only where supplemental explanation is genuinely needed.

## Acceptance contract for any parity phase

Every accepted parity feature must:

- keep source audio local and avoid required network calls;
- work with mouse, keyboard, touch, and narrow/large layouts without losing core function;
- provide a non-gesture precision path for operations whose result can be expressed numerically;
- use the existing project/history model so one logical action is one undo step;
- remain deterministic where randomness is involved;
- bound memory/concurrency and explain failures instead of silently degrading;
- add unit tests at pure seams and desktop/mobile browser regressions for the real interaction;
- pass Axe with disclosures/states populated, not only on the empty tool;
- preserve portable backup compatibility or explicitly version a schema change;
- update this document and the historical completion/handoff records without deleting prior history.

## Next decision

The current production-defect remediation should be integrated only after its final head is green and exact-main Pages deployment succeeds.

For new parity development, **Phase A is the recommended first design** because direct clip manipulation, clipboard editing, and preview-before-commit close the most visible usability gap with AudioMass/Audacity while reusing the workstation's existing rendering, history, and precision-control architecture. Recording/beat/loop work should follow as a separately tested subsystem rather than being mixed into the same change.

# Photo Studio — Authoritative Completion Tracker

> This file is the single source of truth for Photo Studio completion state while `feat/photo-studio` is active. Update it whenever a Photo Studio commit changes a gate, remaining task, verification result, integration state, or deployment state. Do not claim completion from the implementation plan alone.

## Deterministic completion goal

Photo Studio is **COMPLETE** only when every gate below is checked on the same final integrated `origin/main` SHA and there are no unresolved Photo Studio release blockers.

- [ ] **Feature contract** — at least 30 genuinely functional, non-destructive editing capabilities are exposed in the production UI and each maps to recipe state plus real preview/export behavior; no inert controls.
- [ ] **Direct editing contract** — local masks and retouch operations can be placed directly on the rendered photo with image-space coordinates that remain correct across supported zoom levels; gestures commit as coherent undo steps.
- [ ] **Geometry/detail contract** — crop/rotation/flip/straighten, lens distortion, horizontal/vertical perspective, texture/clarity/sharpening, luminance/chroma denoise, chromatic-aberration correction, and tone curve are usable and export through the same renderer as preview.
- [ ] **Export contract** — JPEG/PNG/WebP capability probing prevents MIME mislabeling; safe canvas limits are enforced; filename, quality, resize, background, output sharpening, and metadata policy are user-controllable.
- [ ] **Metadata contract** — reviewed metadata can be serialized to XMP; JPEG/PNG/WebP exports attempt standards-compatible embedded XMP where supported; metadata packaging failure never destroys the rendered pixel export; XMP sidecar remains available.
- [ ] **Batch/project contract** — batch processing is sequential and failure-isolated, does not retain all full-resolution outputs in memory, uses the same export policy as single-file export, and recipe JSON import/export round-trips through normalization/version validation.
- [ ] **History/persistence contract** — undo/redo, snapshots/presets/recipe state used by the UI remain deterministic and reversible; stale asynchronous render results cannot replace newer revisions.
- [ ] **Responsive/accessibility contract** — production UI has no page-level horizontal overflow at 320 CSS px, remains keyboard operable for core editing/export flows, exposes meaningful labels/status, and respects reduced-motion behavior.
- [ ] **Focused verification contract** — fresh Photo Studio unit tests, production build, and the complete focused Photo Studio browser matrix pass against the exact final merge state.
- [ ] **Integration contract** — branch is reconciled non-destructively with the then-current `origin/main`; changed-file review confirms no unrelated tool regressions or private/internal prompt leakage; PR merge state is green.
- [ ] **Deployment contract** — the exact integrated `origin/main` SHA is published by GitHub Pages and an uncached live check confirms `/#/tools/photo-studio` loads the intended production workspace.
- [ ] **Tracking closure contract** — this file records the final SHA/evidence, Photo Studio is moved out of `.tasks/IN_PROGRESS.md`, closure is recorded in `.tasks/DONE.md`/`.tasks/WORK_LOG.md`, and any intentionally deferred decoder enhancement is explicitly recorded rather than silently omitted.

If any box above is unchecked, Photo Studio is not complete.

## Current state

- Status: **IN PROGRESS**
- Working branch: `feat/photo-studio`
- Pull request: `#29`
- Current material Photo head before this tracker-only commit: `5d43c20e811145d2c2b05ba7fc79ac3d62b890f6`
- Current phase: **Capability expansion Phase 1 / Task 1.5 — capability-gated RAW adapter**
- Current verification state: material Photo head `5d43c20e811145d2c2b05ba7fc79ac3d62b890f6` has fresh local evidence for 141 Photo unit/selector tests across 15 files (8.33 seconds), the production/PWA build, and all 86 focused Photo browser cases across desktop/mobile Chromium with one browser worker (4.3 minutes), with no failures or skips. RAW joins acquisition, comparison, preview, export/batch, and durable recovery through the shared lazy raster path. Eight added browser cases verify actual Bayer DNG decoding, original persisted bytes, literal before/export pixels, malformed-input preservation and retry, stale RAW rejection, on-demand assets, and cached offline recovery. No parallel review agents were used for this batch.
- Latest inspected PR workflow context: run `34976219622` at tracker head `cc43ef68fb830fb98a8e20ba210ba017e3b617bd` recorded 833 passing repository tests and three failing `vector-engine-path-motion` assertions; those failures are outside Photo Studio scope and predate TIFF. Build/browser validation was skipped. The earlier missing Crystal module is no longer a failure in this inspected run. Post-RAW remote checks remain unverified; local Photo GREEN is not an integrated-release claim. Latest inspected `origin/main`: `19f001f7325dc5f539b453e12683014a03af10ef`; main advanced independently and was not merged, rewritten, or pushed by this batch.
- Test-count correction: the earlier recorded 110-case Photo unit/selector total was not the exact Photo namespace count. PR run `34974201415` establishes 93 before TIFF; TIFF adds 28, yielding 121; RAW adds 18 decoder/acquisition cases and two parameterized worker cases, yielding 141. No tests were removed. Use `pnpm exec vitest run tests/unit/photo tests/unit/e2e-spec-selection.test.mjs --exclude '**/.claude/**' --maxWorkers=1` for reproducible scoped counts. An unrelated nested `.claude` worktree appeared during this batch; the explicit exclusion prevents duplicate tests from that checkout and leaves its files untouched.
- Prior PR workflow context: run `34726437963` passed all 722 repository unit tests and the production build at earlier Photo head `93a3535252c843cc27146030373e377b9e35f12a`, then failed the expanded 502-case repository browser suite. Its two Photo-specific failures were test-contract defects (an unscoped page-level status locator and mouse-only range dragging under touch emulation), both corrected at `5612412d8e0416f62f14bd82d351d4c76ac77966`; unrelated tool failures remain outside Photo Studio scope.
- Current verified merge-state evidence: PR workflow run `34706122558` completed successfully for earlier Photo head `5394c88b560af6ab5933968771334502da9c207e`; the repository unit suite, production build, and the complete focused Photo Studio browser matrix all passed on that PR merge state.
- Most recent intentional RED evidence: workflow run `34706499377` for head `8682b9a5b241c6d9ec9899f722a0b31de3ab7ed6` passed repository unit tests and the production build, then failed browser validation at the new copy/paste contract because the production `Copy edits` / `Paste edits` behavior did not yet exist.
- Task 1.1 local RED evidence: the import unit/selector contract first failed because `photo-import.ts` and focused spec selection did not exist; browser contracts then failed for the missing drop target and clipboard controls. Independent review regressions additionally reproduced stale clipboard replacement, outside-root paste loss, premature URL revocation, inaccessible hidden-input focus, misleading extension fallback, and preview-status races before their fixes.
- Historical exact-head CI evidence: workflow run `34662031647` completed successfully for `735f9f915cf8427c95444d3296ce065e688a2ea0`; all 661 repository unit tests, production build, and all 24 focused Photo Studio browser tests succeeded on that earlier PR merge state.

## Verified progress

- [x] Core typed `PhotoRecipe`, normalization, history, histogram, metadata serialization, and non-destructive renderer architecture exist.
- [x] Revision-aware preview/export rendering and stale-result rejection exist.
- [x] Direct on-image radial/local and retouch placement is implemented; pointer coordinates are normalized to the visually rendered image bounds.
- [x] Zoom interaction regression coverage includes above-100% zoom placement.
- [x] Lens distortion and horizontal/vertical perspective transforms are implemented in the shared geometry path.
- [x] Texture, clarity, sharpening, luminance/chroma denoise, and chromatic-aberration correction exist in the pixel engine.
- [x] Tone-curve editing is wired into normal recipe history and preview/export behavior with accessible graph + numeric editing.
- [x] Embedded-XMP container writer has focused unit coverage for JPEG APP1, PNG XMP `iTXt`, and WebP `XMP ` / VP8X behavior.
- [x] Single-photo export uses unified export orchestration with safe editable filename, resize policy, output sharpening, metadata policy, standards-compatible XMP embedding attempt, and pixel-export-preserving fallback.
- [x] Batch export is exposed in the production dialog, processes sequentially with per-file status, shares format/resize/sharpening/metadata policy, and does not retain completed full-resolution blobs in the batch summary.
- [x] Recipe JSON export/import, editable presets, history, and snapshot restore paths remain wired.
- [x] Every exposed scalar adjustment has an individual reset that restores its actual neutral/default value without resetting neighboring controls.
- [x] Snapshots accept user-provided names and restore the captured normalized recipe through ordinary history.
- [x] Validated custom crop-ratio inputs apply a centered exact-ratio crop through the same normalized recipe path as built-in presets.
- [x] RGB + luminance histogram is presented in the live preview toolbar with four distinct channels.
- [x] Highlight/shadow clipping warnings render as a zoom-synchronized non-destructive overlay computed from the actual rendered preview pixels.
- [x] Color sampler reads the rendered preview in intrinsic image coordinates and reports hexadecimal, RGB, HSL, and alpha when relevant.
- [x] Long-edge and short-edge export sizing preserve the edited aspect ratio for landscape and portrait frames.
- [x] The export dialog exposes planned dimensions before render and blocks known-oversized single exports until the user explicitly selects the offered verified-safe dimensions.
- [x] Safe export planning honors both edge and area ceilings and preserves aspect ratio.
- [x] Before/after comparison now supports an explicit split mode with a pointer-draggable, keyboard-operable split slider plus a side-by-side mode; both surfaces share synchronized zoom and preserve image-space registration for overlays and direct editing.
- [x] Photo source changes select the full focused Photo browser matrix (`photo.spec.ts`, `photo-controls.spec.ts`, `photo-compare.spec.ts`, `photo-copy-paste.spec.ts`, `photo-import.spec.ts`, and `photo-project.spec.ts`) rather than silently omitting specialized Photo specs.
- [x] Browser coverage verifies tone-curve undo semantics, direct mask/retouch placement, reviewed XMP sidecar, actual embedded XMP in PNG, safe custom filename, output sharpening, production batch queue completion, RGB histogram, clipping overlay, color sampler, individual resets, named snapshots, exact custom crop ratio, long-/short-edge sizing, explicit safe-size selection, keyboard history, synchronized split/side-by-side comparison, and 320 CSS px editor/export-dialog reflow.
- [x] Exact Photo head `5394c88b560af6ab5933968771334502da9c207e` passed repository unit tests, production build, and the full focused Photo browser matrix through PR validation run `34706122558`.
- [x] In-session copy/paste implementation exists at `93a3535252c843cc27146030373e377b9e35f12a`: Copy stores an independent normalized recipe snapshot, source changes preserve the in-session clipboard, and Paste routes through one normal history commit. Its focused desktop/mobile browser contract is GREEN at `5612412d8e0416f62f14bd82d351d4c76ac77966`.
- [x] Unsupported encoders are rejected deterministically: capability probing accepts a format only when the produced `Blob.type` exactly matches the requested MIME, unsupported format options are disabled in the export UI, and render-time MIME mismatch throws for export rather than mislabelling fallback bytes.
- [x] Stale renders are rejected deterministically: every preview request carries a monotonically increasing revision, result and error handlers compare it with the active revision before mutating preview/status state, and `tests/unit/photo.test.ts` proves older revisions fail `isRenderResultCurrent` while the active revision passes.
- [x] Drag/drop, direct clipboard read, body-level image paste, mobile camera capture, and ordinary file input route through one local import contract at `77d00cf5ea7b78a397fbe24c94453137456e8678`; unsupported/denied clipboard paths remain truthful and preserve the active document.
- [x] Import operations are revision-gated from operation start, source URL replacement is transactional, stale clipboard work cannot decode over a newer source, older preview success/failure cannot replace newer import guidance, and source swaps clear prior preview observation state before the new render is ready.
- [x] Concurrent preview/export worker requests use internal unique correlation IDs independent of caller revision counters, with deterministic reverse-order fake-worker proof at `f057e8e`.
- [x] Durable local projects and recovery are implemented at `448f46e695cef35abfeb46ab6a4c5095d6c1be6e`: versioned/migrated IndexedDB metadata, OPFS source storage with IndexedDB fallback, 800 ms autosave, explicit save/load/delete, startup recovery, quota/capability/durability reporting, conservative orphan cleanup, unique replacement keys, browser-wide mutation coordination, and stale-action/save-state guards. Final evidence is 76 Photo unit/selector tests, the production/PWA build, and 66 desktop/mobile browser cases.
- [x] Virtual copies and local user presets are implemented at `0621d34d3a8dd3513ab799ee960666bed6e1254a`: copies share one immutable persisted source while retaining independent normalized histories/snapshots; deletion and replacement preserve referenced bytes; presets are durable, named, editable, normalized, versioned for import/export, and removable. Historical evidence includes unit/build verification, 70 desktop/mobile browser cases, and a clean Astral closure review after both identified P1 races were repaired; the unit-count correction above supersedes the previously recorded 110-case scoped total.
- [x] Capability-gated TIFF acquisition is implemented at `fc89cb5f414ce1a2955188a19252ae19f3b58dba` with exact `tiff@7.1.3`, bounded first-page raster normalization, unsigned 8/16-bit sample intermediates, immutable original source storage, sequential deadline-limited decoder workers, shared preview/export semantics, and shipped dependency license notices. Unsupported variants and the 8-bit editing/export boundary are explicit rather than silently misdecoded.

## Original spec inventory blockers discovered during audit

These remain release blockers because they are promised by the design specification but are not yet fully represented in the production UI/behavior or final evidence:

- [x] RGB histogram presentation.
- [x] Clipping-warning overlay/toggle for highlight/shadow clipping.
- [x] Color sampler with RGB, HSL, and hexadecimal readout.
- [x] Individual-control reset affordances rather than reset-all only.
- [x] Named snapshots.
- [x] Explicit long-edge and short-edge export resize modes.
- [x] Explicit safe-size export choice/warning before an oversized render.
- [x] True validated custom crop ratio.
- [x] Draggable and side-by-side before/after comparison.
- [x] In-session copy/paste recipe semantics across sources as one undo step — implementation at `93a3535252c843cc27146030373e377b9e35f12a`; exact focused local GREEN evidence at `5612412d8e0416f62f14bd82d351d4c76ac77966`.
- [x] Explicit unsupported-encoder and stale-render accounting — exact MIME verification at capability-probe and export boundaries plus revision-gated preview state and focused unit evidence; no weaker timing-sensitive browser race was added.

## Capability expansion execution

- [x] Phase 0 / Task 0.1 — individual scalar resets.
- [x] Phase 0 / Task 0.2 — validated custom crop ratio, implemented at `b3fb5239dbd8910fd0edbb3071d9cf482bc9fa7f` with exact 5:4-on-4:3 desktop/mobile browser evidence.
- [x] Phase 0 / Task 0.3 — draggable and side-by-side comparison, implemented at `5394c88b560af6ab5933968771334502da9c207e` with strict RED evidence in run `34705869311` and GREEN merge-state evidence in run `34706122558`.
- [x] Phase 0 / Task 0.4 — in-session copy/paste edits; implementation committed at `93a3535252c843cc27146030373e377b9e35f12a`, with all 42 focused Photo browser cases GREEN at `5612412d8e0416f62f14bd82d351d4c76ac77966`.
- [x] Phase 0 / Task 0.5 — final base-contract evidence and explicit unsupported-encoder/stale-render accounting recorded from deterministic runtime and unit evidence at `5612412d8e0416f62f14bd82d351d4c76ac77966`.
- [x] Phase 1 / Task 1.1 — failure-safe drag/drop, clipboard, camera, and native raster acquisition, implemented at `77d00cf5ea7b78a397fbe24c94453137456e8678` with 20 desktop/mobile import browser cases plus focused unit coverage.
- [x] Phase 1 / Task 1.2 — durable projects/recovery, implemented at `448f46e695cef35abfeb46ab6a4c5095d6c1be6e` with final unit/build/browser evidence and clean Astral closure review.
- [x] Phase 1 / Task 1.3 — virtual copies and user presets, implemented at `0621d34d3a8dd3513ab799ee960666bed6e1254a` with final unit/build/browser evidence and clean Astral closure review.
- [x] Phase 1 / Task 1.4 — capability-gated TIFF adapter, implemented at `fc89cb5f414ce1a2955188a19252ae19f3b58dba` with 24 TIFF unit cases, shared-import regressions, production/PWA evidence, and the complete 78-case Photo browser gate.
- [ ] Phase 1 / Task 1.5 — RAW acquisition implemented at `5d43c20e811145d2c2b05ba7fc79ac3d62b890f6`; finish capability-gated sensor-level controls, source/camera inspection, and embedded previews before closing this task.
- [ ] Phases 2–7 — composition/scopes/tone/color; selection/masking/brushes; layers/compositing/detail; multi-image processing; workflow/export depth; final capability ledger, integration, and deployment.

## Remaining release work

1. Finish Phase 1 / Task 1.5: connect supported decoder-level exposure/white-balance/highlight/demosaic settings and source/camera inspection to normalized, durable, reversible recipe state and shared preview/export; add embedded previews with a truthful full-decode fallback. Preserve the RAW boundary below and reverify dependencies before any package change.
2. Preserve the documented TIFF support boundary below; any additional variant must gain bounded decode and fixture evidence before being advertised as supported.
3. Continue Phases 2–7 in the ordered, Photo-only batches defined by `docs/superpowers/plans/2026-09-12-photo-studio-capability-expansion.md`; maintain the 164-item capability ledger without silent omissions.
4. Reconcile `feat/photo-studio` with the latest moving `main` only when the planned integration gate is reached; do not rewrite parallel-agent branches.
5. Review the exact changed-file set, run exact merge-state validation, verify the Pages deployment, and close shared task records only after every completion gate is evidenced.

## Expanded capability ledger checkpoint

- Conservative full-wiring checkpoint: **27 of 164 capabilities verified; 137 remain incomplete**, including partially implemented items. This carries forward the previous 26-item checkpoint and promotes only capability 6 (lazy worker/WASM RAW import); it is not a new full-inventory audit. Capabilities 7 and 8 remain incomplete rather than being credited to ordinary post-raster adjustments.
- Full-wiring IDs: **1, 2, 3, 4, 5, 6, 11, 13, 14, 15, 16, 17, 18, 19, 21, 26, 27, 28, 30, 32, 43, 88, 89, 96, 138, 139, 153** in `docs/superpowers/specs/2026-09-12-photo-studio-capability-expansion.md`.
- The expanded ledger is separate from the original base inventory and test totals. Phase 7 must still account for every remaining ID and revalidate full-wiring claims before release.

## TIFF adapter support boundary

- Supported: classic little-/big-endian TIFF, first page only, uniform unsigned 8-/16-bit samples, grayscale/RGB, optional unassociated alpha except WhiteIsZero-plus-alpha, interleaved strips, uncompressed/Deflate compression (8/32946), and no/horizontal prediction. Top-left orientation and standard fill order are required.
- Safety limits: 64 MiB input, 4096-pixel edge / 16-megapixel raster ceiling, exact strip output-size validation, one decoder worker at a time, 20-second decode deadline, sanitized raster-only directory input to the dependency, cache reuse for preview/export, and per-item raster-cache release during batch export.
- Precision/color boundary: original TIFF bytes are retained in local project storage, 16-bit samples remain exact through decode, then the existing editing/export pipeline uses an explicitly disclosed 8-bit PNG raster. ICC transforms are not applied; source color-profile and color-management capabilities remain scheduled rather than being claimed by TIFF import.
- Browser prerequisites: Worker and OffscreenCanvas; Deflate additionally requires DecompressionStream. Missing capabilities and unsupported data preserve the current document and provide conversion guidance.
- Explicitly deferred decoder enhancements: BigTIFF, floating-point samples, further pages, non-top-left orientations, tiled/separate-plane samples, associated alpha, WhiteIsZero-plus-alpha, and LZW/PackBits/JPEG/CCITT compression. The selected dependency's unrestricted decompression paths are not enabled for untrusted input. These boundaries do not represent implemented variants or silently excluded capabilities; future expansion requires bounded adapters and representative fixtures.

## RAW acquisition milestone and support boundary

- Implemented at `5d43c20e811145d2c2b05ba7fc79ac3d62b890f6` with exact `@colorhythm/libraw-wasm@1.1.1` and a package-scoped exact `typed-cstruct@0.11.0` override. LibRaw reports 0.22.1 and 1,274 camera entries; that backend list is not independent Photo fixture evidence for every proprietary camera/variant.
- Acquisition recognizes `.dng`, `.cr2`, `.cr3`, `.nef`, `.arw`, `.raf`, `.orf`, `.rw2`, `.pef`, and `.srw` with empty/generic binary MIME, plus supported RAW MIME names. Explicit text is excluded; misleading extensions do not override native JPEG/PNG MIME. Bounded first-directory DNGVersion scanning and the CR2 marker route TIFF-family RAW before generic TIFF without recursively following metadata pointers.
- Actual pixel/browser evidence uses an original uncompressed 32x32 Bayer DNG. Other extension cases verify selection/routing, not proprietary pixel decoding. Unsupported cameras, missing optional codecs, damaged data, and unsupported output layouts fail with conversion guidance while preserving the current document.
- Bounds: 64 MiB source; 4096 edge / 16 megapixels for stored/active/output geometry; pre-unpack pixel-aspect expansion checks; one shared RAW/TIFF decoder queue; 30-second RAW worker deadline. Workers terminate on success, failure, or timeout; rejected cached tasks can be retried and batch intermediates are released per item. These adapter bounds are not a configurable hard WASM heap ceiling; the selected wrapper does not expose LibRaw's raw-memory-limit setter.
- Processing explicitly selects 16-bit RGB, sRGB primaries/transfer parameters, camera white balance when available, and disables automatic brightness normalization. Original RAW bytes remain immutable in storage; the owned 16-bit developed intermediate becomes an explicitly disclosed 8-bit raster for the existing editing/export path. Custom source ICC/profile transforms are not claimed.
- Browser prerequisites: Worker, OffscreenCanvas, WebAssembly. Production emits a 76.81 kB RAW worker and 853.08 kB WASM asset. Both are on-demand, excluded from universal precaching, and use bounded CacheFirst runtime caching. Offline recovery is verified after loading under an active service worker; first-time offline decoding still needs cached decoder assets.
- Redistribution notices, LibRaw copyright/CDDL/LGPL alternatives, MIT wrapper/runtime licenses, third-party notices, and immutable source/build locations ship in `public/photo-studio/raw-LICENSE.txt`. The npm WASM binary is not modified.
- Open: embedded previews (7), decoder-level exposure baseline/white balance/highlight/demosaic controls plus source/camera inspection (8), and broader representative legal proprietary RAW fixtures. Keep Task 1.5 open until promised controls reach durable recipes/history and shared rendering; do not silently reduce the original goal.

## Risk-based verification cadence

Effective 2026-09-15, development feedback is batched by risk; the feature inventory and final completion gates above are unchanged.

- Use one primary implementer by default. Delegate only a substantial independent task with clear file ownership and an expected payoff greater than coordination/review cost; do not create parallel implementer/reviewer loops for small changes.
- For new behavior or bug fixes, add a meaningful failing contract test before implementation. Related contracts may share one RED run; every changed behavior still needs appropriate coverage, not an arbitrary test quota per capability.
- For at most two related low-risk edits within an already-tested contract, run the affected checks after the pair, or sooner at the subsystem boundary. A single remaining edit must be checked before handoff. This defers a repeated run, not coverage of either edit.
- Check high-risk changes immediately: codecs/untrusted imports, source retention/deletion, persistence/migrations, history isolation, async revision/cancellation, shared preview/export rendering, output limits, or metadata packaging. Uncertain impact, cross-module effects, failures, or flaky results escalate to broader checks; never sample past ambiguity.
- Run development check commands sequentially, without overlapping build/unit/browser jobs. Browser spot checks use explicit affected specs/tests with `--workers=1`; exercise desktop first unless the change is touch/mobile-specific, then check the affected mobile contract. Keep production build freshness explicit because Playwright serves `dist`.
- Prefer shared literal input/expected-output tables with Vitest `test.each` and uniquely named Playwright parameterized cases for genuinely equivalent behavior. Keep unique pixel effects, data-loss paths, ordering/races, and accessibility interactions independently asserted; do not derive expected results from the implementation being tested.
- Read executed counts, failures, skips, and exit status from runner output/reporters. Test totals are evidence, not capability-completion counts; sampled results must be labeled with their exact scope.
- Before closing a material implementation batch, perform one consolidated changed-file review, run all Photo unit/selector tests, rebuild production/PWA, and run every selected Photo browser spec across both configured projects. Rerun affected checks after review fixes; repeat the broader gate whenever the fix can invalidate it. Exact merge-state repository validation and deployment proof remain mandatory at release.
- For documentation-only cadence changes, validate the diff and referenced entrypoints; do not rerun the full browser matrix or imply fresh feature/build verification. The existing preset-transfer table was checked sequentially on 2026-09-15: 12 tests passed in one file; no new runtime, test configuration, dependency, or CI changes accompany this policy.
- Reassess cadence using completed capabilities, affected-run/full-gate duration, escaped defects, and coordination cost. If batching weakens failure attribution or defect detection, return the affected subsystem to immediate checks rather than weakening assertions or completion criteria.

## Anti-staleness rule

- This tracker must be reviewed before and after each material Photo Studio implementation batch.
- When a gate changes from open to satisfied, update this file in the same branch before moving to a different release subsystem.
- CI evidence older than the current material implementation head is historical evidence only, not final completion evidence.
- A green PR branch is not equivalent to deployed completion; final evidence must come from the exact integrated `main` SHA.
- Parallel-agent branches are never deleted, force-moved, or rewritten as part of Photo Studio completion.

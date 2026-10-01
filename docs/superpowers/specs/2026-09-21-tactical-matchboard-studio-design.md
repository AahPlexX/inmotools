# Tactical Matchboard Studio Design

**Date:** 2026-09-21
**Workstream:** Tactical Matchboard Studio
**Branch:** `feature/tactical-matchboard-studio`
**Branch base:** `4dcc856bc97027862342513cdea7eb769c0ffbc1`

## Goal

Add an isolated, local-first Tactical Matchboard Studio that scales from first-time and grassroots coaching through professional tactical authoring. The workstation combines multi-format pitch/rules profiles, formation and restart authoring, deterministic keyframe animation, spatial geometry, 2D/3D presentation, local video telestration, session planning, portable project storage, and capability-negotiated export without a backend, account, telemetry, remote processing, or secret-bearing client feature.

The deterministic product denominator is the 60-feature ledger in `src/tools/tactics/FEATURE_MATRIX.md`. A feature is not verified because a control exists; verification requires its implementation and relevant unit/build/browser/accessibility/persistence/export evidence.

## Product boundary

- Browser-only and local-first. Tactical projects, rosters, media, notes, metadata, analysis, and generated artifacts stay on the device unless the user explicitly downloads an artifact.
- No authentication, server database, telemetry, analytics, cloud synchronization, remote tactical processing, or server-side conversion.
- Local persistence uses repository-compatible browser storage, including IndexedDB/Dexie and downloadable project bundles.
- Local media is processed by browser APIs and already-pinned libraries. No proprietary tracking feed or automated remote optical tracking is required.
- No client-side API key or secret is introduced.
- No AI product surface or copy.

## Standards and football-rule contract

Ruleset data is versioned and provenance-bearing. Youth, grassroots, futsal, indoor, and specialty presets may only make governing-body claims that the cited source actually supports. A jurisdiction-specific recommendation is never presented as universal law.

Implementation-time research on 2026-09-21 established the following design constraints:

- IFAB permits national associations to modify youth/grassroots organizational aspects including field size and number of players, so youth presets require jurisdiction/version provenance.
- U.S. Soccer currently presents 4v4, 7v7, 9v9, and 11v11 development formations as examples/recommendations rather than exclusive formations.
- Formats with a goalkeeper use explicit internal goalkeeper counts and human-readable notation that makes total team size unambiguous.
- WCAG 2.2 AA-relevant interaction requirements include an equivalent single-pointer alternative for dragging, visible/reachable controls, reflow resilience, and target-size considerations.
- Pointer Events are the input baseline. Mouse-only interactions are not accepted.
- WebCodecs video encoder/output combinations are capability-tested at export time instead of assumed.

No preset is added as sourced/official until its primary governing source has been checked for the exact dimensions, player count, special lines, restart concepts, and source version/date encoded.

## Canonical project model

One schema-versioned `TacticalProject` is the source of truth. It models project metadata; ruleset/profile; pitch; teams and rosters; player tokens; officials; equipment; scenes and layers; tactical objects; formation states; ball state; annotations; timeline tracks and integer-time keyframes; interpolation; camera states; analysis settings; coaching/session notes; local media descriptors; import provenance; and export preferences.

Canonical pitch positions use normalized coordinates where `x` and `y` are both in `[0, 1]`. Physical pitch dimensions are stored separately and drive meter/yard conversion and geometric distance. Viewport pixels never become canonical tactical coordinates.

Animation time uses non-negative integer milliseconds initially. Frame rate is a playback/export sampling choice, not the project clock.

Every portable project carries a schema version. Import must validate before mutation, and supported historical versions must migrate deterministically.

## Layered rendering architecture

2D authoring uses standards-native SVG for pitch geometry, vectors, player tokens, labels, selection geometry, handles, and vector-first export. Canvas/OffscreenCanvas is reserved for high-cost transient raster work such as heat maps, video/timeline rendering, and frame export when it is materially beneficial.

3D presentation reuses the repository's exact-pinned Three.js. The 3D view mirrors the canonical project state rather than owning a separate model. Rendering is on-demand when static and continuous only while actual playback/interaction requires it; geometries, materials, textures, and renderer resources are disposed when no longer used.

Workers are introduced only for computations or frame/media generation that would otherwise block interaction. Trivial synchronous geometry remains pure synchronous code.

## Editor state and history

Pure deterministic engines own transformations and validation. React owns accessible interaction state. History is bounded and immutable at the project-operation level. Undo/redo, autosave snapshots, import validation, and explicit project opening remain separate so an invalid import cannot overwrite a good local project.

Selections, groups, layer order, locks, visibility, snapping, formation operations, scene/timeline operations, and spatial analytics are project operations against the canonical model.

## Formation contract

A formation template stores:

- selected team size;
- explicit goalkeeper count;
- outfield line counts;
- canonical notation and whether it explicitly includes the goalkeeper;
- editable placement positions;
- optional governing/recommendation provenance.

Validation enforces `goalkeepers + outfield players = selected team size`, non-negative integer counts, unique roster assignment where relevant, and source labels that do not overstate authority.

## Spatial-analysis honesty

- Voronoi means nearest-player Euclidean partitioning unless a separately named time-to-reach model is later justified.
- Passing-lane clearance is geometry against configurable defender radii/positions, not a success probability.
- Orientation/vision sectors are authored visualization unless imported data explicitly provides orientation.
- Speed and distance are calculations from authored/imported trajectories and pitch dimensions/timestamps, not GPS verification.

## Local video model

Supported local files are opened via browser media capabilities and object URLs that are revoked when no longer needed. Review supports precise time-based control to the limit of the platform. Telestration and manual overlay tracking store time ranges/anchors and interpolate authored screen-space motion. Multi-angle synchronization is manually anchored. No automatic CV tracking claim is made.

## Persistence and import security

Dexie/IndexedDB stores local project records, recoverable autosaves, snapshots, and permitted Blob assets. Portable JSON/ZIP uses deterministic manifests and schema versions.

Imported JSON, CSV, ZIP, images, media, and any future SVG are untrusted. Validate schema, field ranges, sizes, path names, MIME/decode assumptions, and ZIP paths before committing state. Imported HTML/JavaScript is never executed. Any future SVG import must remove scripts, event handlers, external executable references, and other active content.

## Export architecture

A central `ExportMetadata` model covers title, description, creator/coach, club/team, age group, session/drill type, tactical theme, tags, rights, license, language, dates, and custom notes.

Metadata is only embedded where the verified output format supports it. Otherwise the export supplies a sidecar/manifest rather than claiming embedded metadata.

Video export negotiates actual browser/device capability. When WebCodecs is available, `VideoEncoder.isConfigSupported()` is used before exposing codec/dimension/frame-rate combinations. Existing Mediabunny may be used where its pinned API is compatible. A high-resolution frame-sequence ZIP and project JSON/ZIP remain portable fallbacks.

PDF/contact sheets remain vector-first for pitch/annotation geometry where practical. Still export includes SVG and browser-supported raster formats. Standalone playback export must remain local/portable and may not execute imported user HTML/JavaScript.

## Responsive and accessible interaction

Wide layouts may expose tool rail, pitch, inspector/layers, and timeline together. Narrow layouts switch to a pitch-first workspace with bottom sheets/drawers, tabbed inspectors, and a collapsible timeline rather than shrinking desktop UI.

All essential pointer drag operations have keyboard/button/numeric alternatives. Right-click actions have explicit touch/keyboard paths. Tooltips supplement visible labels/help and are never the only discovery path. Temporary surfaces support Escape and focus management. Reduced-motion preferences affect presentation motion without disabling authoring.

Target validation includes phone portrait/landscape, tablet portrait/landscape, 1024px laptop, desktop/large desktop, zoom, and enlarged text without accidental page-level horizontal scrolling.

## Performance

Use memoized derived state, requestAnimationFrame only when needed, lazy loading, bounded history, efficient scene diffs, object-URL cleanup, and Three.js disposal. Pause/reduce work while playback is stopped, the tab is hidden, or 3D is not visible. Timeline virtualization is added only when observed track counts justify it.

## Integration surface

The tool remains isolated under `src/tools/tactics/`. Product registration is additive in `src/catalog.ts` and `src/tools/workspaces.tsx` only after a usable vertical slice exists. Tactical browser coverage is added to `scripts/select-e2e-specs.mjs` with `tests/e2e/tactical-matchboard-studio.spec.ts`.

Tool-scoped unit tests live under `tests/unit/`. Workstream documentation lives in this spec, the corresponding implementation plan, `src/tools/tactics/FEATURE_MATRIX.md`, `src/tools/tactics/HANDOFF.md`, and synchronized `.tasks` state.

## Validation and completion gates

Branch-complete requires all 60 accepted features implemented/verified (or explicitly user-approved rejected/deferred), no knowingly inert controls, focused units green, production build green, focused browser/accessibility/responsive checks green, persistence/import/export paths verified, no untracked tool defect, and current feature/handoff/task state.

Only after branch-complete is the branch reconciled non-destructively with the then-current `origin/main`, revalidated, merged by repository-supported PR integration, and validated again on the exact integrated main revision. Successful Pages deployment/live routing and task reconciliation are required before integrated-complete is claimed.

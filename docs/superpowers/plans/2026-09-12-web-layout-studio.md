# Web Layout Studio — implementation and completion contract

As of 2026-09-12. Status: active; initial visual layout-to-export slice implemented, browser verification pending. This document records accepted scope and does not claim the full workstation is complete.

## Scope and authority

Tool route: `#/tools/web-layout-studio`. Implementation owner: `src/tools/web-layout/`. This is an additional workstation; the existing typography, contrast and SVG tools remain intact. Reuse their pure helpers only after verifying contracts. No remote database, account, server shell, remote Git operations, or browser automation grid belongs in the product. Shared catalog and loader edits are additive integration only. Do not modify other agents' tools or delete their branches.

## Deterministic finish line

All 60 feature IDs below must be implemented through reachable UI, validated against their listed behavior, and recorded with fresh focused evidence. Partial is not complete. Export/persistence round trips, malicious import rejection, script isolation, resource cleanup, portrait/landscape reflow and keyboard access must pass. Production build and exact-main browser checks must pass; Pages deployment must be verified. Update this contract and the tool's IN_PROGRESS entry in every implementation cycle. Scope additions require an explicit ledger entry; never silently drop an accepted feature.

## Feature ledger

Implemented means code is reachable; verified means its applicable focused and browser gates passed. No item is yet promoted to whole-workstream complete.

| ID | Feature | Acceptance behavior | Current state |
|---|---|---|---|
| WL-01 | Visual Grid builder | Track sizing, fr/minmax/repeat, auto-fit/auto-fill, named areas and accessible track resizing. | partial |
| WL-02 | Visual Flexbox builder | Direction, wrapping, distribution, alignment, gap and per-item sizing. | partial |
| WL-03 | Semantic DOM tree | Nested elements, tag selection, drag-and-drop and equivalent keyboard reordering with nesting validation. | partial |
| WL-04 | Starter page patterns | Usable learning, portfolio, landing-page and dashboard starters. | planned |
| WL-05 | Content and block editing | Add, edit, duplicate, remove and reorder blocks without changing reading order accidentally. | implemented |
| WL-06 | Box-model workshop | Per-side margin, padding, borders, outlines, logical properties and px/rem readouts. | partial |
| WL-07 | Fluid typography | Editable clamp ranges with viewport curves, modular scales and readable line lengths. | partial |
| WL-08 | Breakpoint cascade editor | Mobile-first overrides, inheritance visibility and reset-to-inherited values. | partial |
| WL-09 | Container-query lab | Resize a component parent independently and author named size queries. | planned |
| WL-10 | Multi-viewport preview | 320–1920px presets, custom sizes, portrait/landscape, fitted and actual-size views. | partial |
| WL-11 | Synchronized preview interaction | Opt-in scroll, click and form-state synchronization with event-loop prevention. | planned |
| WL-12 | Theme manager | Light, dark and high-contrast token sets with explicit per-theme overrides. | partial |
| WL-13 | Typed design-token manager | DTCG 2025.10 types, groups, descriptions, aliases, cycle detection and import validation. | partial |
| WL-14 | Modern color authoring | OKLCH, color-mix, relative colors, Display-P3 and gamut/fallback diagnostics. | planned |
| WL-15 | Gradient workshop | Linear, radial and conic gradients, stops, interpolation and layered compositions. | planned |
| WL-16 | Elevation workshop | Multiple box/text shadows and editable blur, spread and offsets. | planned |
| WL-17 | Backdrop workshop | Blur, saturation, brightness and transparent border styling with fallback preview. | planned |
| WL-18 | Motion timeline | Keyframes, transitions, cubic-bezier editing and reduced-motion alternatives. | planned |
| WL-19 | Form-control styling | Visible labels, inputs, checkboxes, radios, switches, ranges and local drop-zone patterns. | partial |
| WL-20 | Accessible component scaffolds | Cards, native disclosure, notices, navigation, dialogs and form patterns with keyboard behavior. | partial |
| WL-21 | Web Component sandbox | Custom elements, Shadow DOM and portable component export in isolated execution. | planned |
| WL-22 | Interaction-state lab | Hover/focus/active/disabled/checked/target approximations and real keyboard-state checks. | planned |
| WL-23 | Inline SVG workshop | Safe markup optimization, fill/stroke, viewBox inspection and data-URI export. | planned |
| WL-24 | Local asset library | Images, SVG and fonts with size limits, previews, dependency tracking and removal checks. | planned |
| WL-25 | HTML/CSS/JS editor | Monaco on supported desktop environments plus a full touch-friendly editing fallback. | planned |
| WL-26 | Abbreviation expansion | Documented HTML/CSS Emmet expansion, completion and reversible insertion. | planned |
| WL-27 | Code formatting | Prettier browser parsers with visible errors and undoable formatting. | planned |
| WL-28 | CSS production compiler | Verified lightningcss-wasm, explicit browser targets, prefixing, lowering and minification. | planned |
| WL-29 | JavaScript minification | Terser in a cancellable worker with diagnostics and preserved unminified source. | planned |
| WL-30 | HTML minification | Browser-compatible structural minification with conservative whitespace defaults. | planned |
| WL-31 | Automated accessibility audit | axe-core findings with rule help, affected elements and incomplete/manual checks. | planned |
| WL-32 | WCAG contrast checks | Alpha compositing, AA/AAA text thresholds and actionable foreground/background pairs. | planned |
| WL-33 | APCA legibility guidance | Separate perceptual scores and size/weight guidance without WCAG-certification claims. | planned |
| WL-34 | Color-vision simulation | Protanopia, deuteranopia, tritanopia and achromatopsia preview lenses. | planned |
| WL-35 | Media-condition preview | Reduced motion, light/dark and forced-color approximations with clear native-emulation limits. | planned |
| WL-36 | Computed-style inspector | Select generated elements and inspect resolved properties and box geometry. | planned |
| WL-37 | Cascade and specificity inspector | Selector weights, layers, importance and source order with limits clearly reported. | planned |
| WL-38 | Unused-selector report | Potentially unmatched selectors with state/viewport caveats; no automatic destructive deletion. | planned |
| WL-39 | HTML conformance diagnostics | Parser diagnostics, duplicate IDs, invalid nesting, void elements and attribute checks; not full certification. | planned |
| WL-40 | Overflow and collision checks | Find clipped/overflowing content and overlapping text across selected viewports. | planned |
| WL-41 | Content stress testing | Long labels, empty content, enlarged text and localization fixtures without overwriting source. | planned |
| WL-42 | Reset and baseline CSS | Selectable responsive reset, focus styles, reduced-motion rules and print baseline. | implemented |
| WL-43 | Export metadata editor | Title, description, author, language, canonical, robots, tags and editable custom meta fields. | partial |
| WL-44 | Social and icon metadata | OpenGraph/Twitter fields, image and favicon assets, plus illustrative social-card previews. | partial |
| WL-45 | Portable single HTML export | Inline all approved local assets and code, check external references and permit offline delivery. | partial |
| WL-46 | Deterministic ZIP export | Stable file order/timestamps, HTML/CSS/JS/assets, local links and metadata integrity. | planned |
| WL-47 | Code and component exports | HTML/CSS/JS files, selected snippets and portable component packages. | partial |
| WL-48 | Token exports | DTCG JSON, CSS variables and optional Sass/Tailwind mappings with documented type handling. | partial |
| WL-49 | Project backups | Versioned validated JSON import/export with lossless round trips and rejected malformed input. | implemented |
| WL-50 | Local persistence | Opt-in local drafts, storage-error reporting, IndexedDB assets and recoverable snapshots. | partial |
| WL-51 | Undo and redo | Bounded history for edits, imports, formatting and visual operations. | partial |
| WL-52 | Reusable user library | Save component variants and page templates locally and export/import the library. | planned |
| WL-53 | Print and PDF workflow | Print styles, paged preview and browser print-to-PDF without claiming native PDF generation. | planned |
| WL-54 | Export manifest | Asset references, dependency/license notices, warnings and generated-file inventory. | planned |
| WL-55 | Runtime diagnostics | Sandbox console/errors, cancellable execution, restart and bounded message traffic. | planned |
| WL-56 | Manual accessibility guide | Keyboard, reading order, focus, zoom and screen-reader review alongside automated findings. | planned |
| WL-57 | Direction and writing-mode preview | RTL, logical spacing and vertical-writing checks with explicit source controls. | planned |
| WL-58 | Keyboard-first editing | Keyboard tree operations, focus restoration, shortcuts and discoverable alternatives to drag. | partial |
| WL-59 | Version comparison | Named snapshots and readable source/token differences with restore and undo. | planned |
| WL-60 | Safe preview controls | Script execution opt-in, opaque-origin isolation, network policy and restart without draft loss. | partial |

## Integration Ledger

| Module | Live consumer | Current responsibility |
|---|---|---|
| layout-engine.ts | WebLayoutWorkspace.tsx | Validate project before render/import; build preview, HTML, CSS and token files. |
| WebLayoutWorkspace.tsx | src/tools/workspaces.tsx | Catalog route mounts the editor, controls and previews. |
| web-layout.css | WebLayoutWorkspace.tsx | Tool-scoped responsive editor styles. |
| Tool catalog entry | src/App.tsx through src/catalog.ts | Discoverable landing-page link and common ToolLayout guidance. |

## Execution phases

1. Visual layout-to-export: validated structured model; semantic block controls; Grid/Flexbox; CSS-width previews; theme/typography; metadata; HTML/CSS/token/project downloads; undo and local recovery. Browser tests close the initial slice. Advanced portions of these features remain partial.
2. Nested visual construction: tree/track interaction, per-side styles, breakpoint inheritance, container queries, asset library and full component templates. Preserve keyboard alternatives.
3. Token/style authoring: alias-safe token system, modern color and fallback handling, gradients/shadows/backdrop, motion and state controls.
4. Isolated code workflow: verified editor dependencies, mobile fallback, formatting, parsers/compilers, worker cancellation, script execution and diagnostic bridge. Do not combine allow-scripts and allow-same-origin on user-authored previews.
5. Diagnostics: axe, contrast/APCA, CVD, media approximations, computed/cascade inspection, potential unused selectors, HTML checks and content stress fixtures. Never present heuristic checks as certification or true browser emulation.
6. Delivery/library: portable asset packaging, deterministic ZIP, metadata/social/icon completeness, print/PDF, token mappings, snapshots and library exchange. Reopen exported files and verify their actual contents.

## Dependencies

No new dependency installed in the first slice. Preserve shared pins. For new installations, verify official release and npm registry agreement immediately before installing exact versions. NPM Sentinel checked 2026-09-12: Monaco 0.56.0; Prettier 3.9.6; lightningcss-wasm 1.33.0; axe-core 4.13.0; Terser 5.51.2; html-minifier-terser 7.2.0; JSZip 3.10.2. Official releases corroborate Monaco, Prettier, Lightning CSS, axe and html-minifier-terser; Terser's v5.51.2 package manifest and JSZip's official changelog corroborate their versions. npmjs.com HTML pages returned 403; registry metadata was obtained through NPM Sentinel. Browser bundling checks remain required before installation. Monaco is not officially supported on mobile: a fully functional alternative editor is required there. Do not upgrade shared JSZip merely to add this tool; choose an isolated alias or coordinate a separately authorized shared update.

## Limits and exclusions

DTCG is a Community Group specification, not a W3C Recommendation. axe cannot certify conformance. Same-engine iframe views are CSS viewport comparisons, not emulated Safari/Chrome devices. Parent scripts cannot force native CSS media features on arbitrary iframes: transformed preview styles must be labeled as approximations. Client-side JavaScript has no hard portable memory quota or guaranteed execution preemption inside an iframe; scripted previews need explicit run controls and recovery. Offline export must reject unresolved external assets rather than falsely promise zero network. HTML minifier browser compatibility requires proof; if Node-only dependencies prevent bundling, use an equivalent verified browser implementation and record the substitution. No further product feature is rejected on this pass.

## Verification and negative controls

Initial focused unit gate: `pnpm exec vitest run tests/unit/web-layout.test.ts`. Eight tests exercise real starter patterns, escaped hostile content, invalid CSS/URLs/schema/IDs, size limits, CSS/preview consistency, CSP separation, typed tokens and metadata. Browser gate: `pnpm exec playwright test tests/e2e/web-layout.spec.ts` covers layout-to-download, local recovery/invalid import, and four panels at 320 portrait, 844 landscape and 1920 desktop widths. Existing catalog and accessibility sweeps must include the new route. A missing loader or exporter must fail the route/download checks; do not count build success as interaction proof. No fabricated negative-control evidence.

Current evidence: focused unit tests 8/8 passed; TypeScript and Vite production bundling passed. Initial branch CI run 34718169412 passed frozen-lockfile installation, unit tests, production build and 4/6 browser cases (recovery/reflow on desktop/mobile); export cases exposed an ambiguous theme-select label, now made explicit. Follow-up also adds auto-fitting minimum-width tracks and an extreme-spacing browser regression. Fresh CI is required for both fixes. Full feature scope remains active.

# Digital Logic Workstation — Implementation Plan

**As of:** 2026-09-16
**Design:** `docs/superpowers/specs/2026-09-16-digital-logic-workstation-design.md`
**Branch:** `claude/digital-logic-workstation-gcq2m8` (single active development branch for this workstream; do not fork additional branches for this scope)

This plan sequences the 34-capability ledger from the design document into phases. Each phase has a completion gate. A phase is not marked done in `.tasks/IN_PROGRESS.md` until its gate has fresh evidence (unit tests, production build, and — where the phase changes interaction/accessibility — a focused Playwright run).

## Repository placement

- Engine/model/export logic (framework-independent): `src/tools/logic/*.ts`
- Presentation: `src/tools/logic/*.tsx` + `src/tools/logic/LogicCanvas.css`
- Unit tests: `tests/unit/logic-*.test.ts`
- E2E: `tests/e2e/logic.spec.ts`
- Catalog entry: `digital-logic-workstation` in `src/catalog.ts`; loader entry in `src/tools/workspaces.tsx`

## Phase 1 — Core engine, schematic capture, and combinational analysis (this session)

Delivers ledger items 1, 2, 5, 6, 7 (D/JK/T/SR only), 8, 11, 14, 19, 20, 22, 25, 26, 27 (default bindings + reference panel), 28, 31 (SVG only), 33 (fields + JSON only), 34.

Tasks:

1. `logic-types.ts` — `LogicDocument`, component/port/wire/subcircuit types, `LogicLevel`, `SimulationFrame`, metadata fields.
2. `sim-engine.ts` — pure event-driven evaluator: topological/event-queue propagation, ideal and nanosecond-delay modes, oscillation/hazard detection, single-step and continuous clock tick.
3. `component-library.ts` — gate/flip-flop/I-O component definitions (pin layout, default params, `evaluate`/`nextState`).
4. `circuit-model.ts` — add/remove/move/rotate/mirror component, wire connect/disconnect, undo/redo history (past/present/future), selection.
5. `analysis-engine.ts` — truth-table walk over a selected combinational subcircuit, SOP/POS extraction, ERC auditor (floating input, output contention, undriven net, unbuffered loop).
6. `export-engine.ts` — SVG schematic export, `.circuit.json` project bundle export/import, truth-table CSV export.
7. `render-engine.ts` — Canvas2D grid/component/wire/probe rendering, hit-testing, viewport transform.
8. `LogicCanvas.tsx` — pointer/touch pan & pinch-zoom, orthogonal wire drawing with commit/cancel, drag placement, selection, right-click context menu, long-press radial menu on touch, tooltip layer, keyboard shortcuts.
9. `LogicInspector.tsx` — contextual parameter editing (input count, delay, polarity, label) and metadata-studio fields.
10. `LogicWorkspace.tsx` — toolbar, palette, canvas, inspector, and a truth-table/ERC signal dock; responsive bottom-sheet behavior on narrow viewports; theme switcher (high-contrast / dark / light / color-vision-safe).
11. Catalog + loader registration.
12. Unit tests for every engine module above.
13. One Playwright smoke spec: open the tool, place two switches and an AND gate, wire them to an LED, toggle inputs, confirm the LED state and the generated truth table.
14. `.tasks/IN_PROGRESS.md` entry for this workstream.

**Phase 1 completion gate:** `pnpm test:unit` passes for all `logic-*` unit files; `pnpm build` (includes `tsc --noEmit`) succeeds; the new Playwright spec passes on Chromium; the workspace is reachable at `#/tools/digital-logic-workstation` from the catalog with no route special-case; every Phase 1 ledger item above is operable through the shipped UI, not only through the engine API.

## Phase 2 — Sequential depth, combinational blocks, and the signal dock

Delivers ledger items 9 (deferred to Phase 3 — memory needs the bus work first), 10, 12, 15, 17, 18.

- Register banks and synchronous/asynchronous up/down counters as component-library entries reusing the Phase 1 sequential evaluator contract.
- 7-segment (single + multiplexed) and 16-segment display components, with an optional BCD-to-7-segment decoder component.
- MUX/DEMUX (2:1/4:1/8:1/16:1) and priority-encoder/decoder components.
- Multi-channel logic analyzer/oscilloscope dock: rolling sample buffer keyed to sim ticks, up to 16 probes, edge markers, cursor delta measurement; full-screen toggle on narrow viewports.
- Phase 1 UX follow-ups identified during PR review, confirmed real and deferred rather than fixed in Phase 1: touch two-finger pan and pinch-zoom on the schematic canvas (touch currently supports drag-to-place/select/wire but not panning or zooming the viewport by touch; desktop mouse-drag pan and wheel zoom are unaffected), and clamping the hover tooltip layer to the canvas viewport bounds (a tooltip near the right or bottom edge can currently be clipped).

**Gate:** same shape as Phase 1 (unit + build + a focused Playwright interaction/accessibility spec for the analyzer dock and new components), plus regression confirmation that Phase 1 capabilities are unaffected.

## Phase 3 — Buses, subcircuits, memory, arithmetic, K-map, and educational modes

Delivers ledger items 3, 4, 9, 13, 16, 21, 23, 24, and the remaining part of 27 (full keyboard remapping UI).

- Multi-bit bus wire type, bus splitter/tap components, per-bit and aggregate value readouts.
- Subcircuit packaging: selection → named subcircuit with port map and custom icon; breadcrumb navigation; nested `LogicDocument` persistence.
- RAM/ROM component with hex/ASCII editor and binary import (depends on the bus work landing first, since address/data buses are its interface).
- RGB LED pixel-matrix component.
- Configurable ALU component (4/8/16-bit).
- K-map solver and Quine–McCluskey minimizer (2–5 variables), including one-click minimized-schematic regeneration from the existing SOP/POS extractor.
- Gamified puzzle engine with a small built-in level set verified against target truth tables.
- Junior Explorer elementary theme.
- Full keyboard-shortcut remapping UI on top of the Phase 1 default bindings.

**Gate:** same shape as prior phases; subcircuit and bus changes require additional unit coverage for nested-document persistence and bus-width mismatch handling.

## Phase 4 — Professional export & metadata studio completion

Delivers ledger items 29, 30, 31 (PDF/title-block), 32, 33 (OpenGraph card generation).

- Verilog and VHDL structural exporters driven by the same component/net graph used for simulation.
- SPICE `.cir`, EDIF, and KiCad schematic-netlist exporters.
- PDF schematic export with title block, border grid, and reference designators (reuse an existing repository PDF dependency already pinned for another tool if it fits without new scope; otherwise propose and verify a new dependency here, not earlier).
- BOM CSV/JSON exporter mapping gate types to classic 74-series IC equivalents.
- OpenGraph social-card generation for the metadata studio.

**Gate:** same shape as prior phases; export-format unit tests assert on generated text/structure (module headers, port lists, subckt syntax) rather than only "did not throw."

## Dependency ledger

No new dependency is introduced in Phase 1. Later phases that plausibly need one (PDF export in Phase 4) must re-verify the exact current stable version against its official source and npmjs.com at the time that phase starts, and record the finding here before pinning it in `package.json`. As of this writing no dependency has been added for this workstream.

## Task-state synchronization

This plan is tracked in `.tasks/IN_PROGRESS.md` under "Digital Logic Workstation." Phase completion, blockers, and any accepted scope exclusion are updated there in the same execution cycle they occur, per `GOVERNANCE.md`. Deferred ledger items are never removed from the design document's ledger — only marked with the phase that will deliver them.

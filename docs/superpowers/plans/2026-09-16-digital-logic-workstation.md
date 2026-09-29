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

- **Delivered (Phase 2B):** parallel-load registers and synchronous/asynchronous (ripple) up/down counters with terminal-count flag, optional enable and synchronous load, in `src/tools/logic/register-engine.ts` (ledger items 7 and 10). Multi-bit parts keep their bits in `ComponentRuntimeState.registerBits`; a ripple's transient states come from `rippleStage`.
- **Delivered (Phase 2C):** 7-segment (single and multiplexed 4-digit) and 16-segment display components plus a BCD-to-7-segment decoder block (ledger item 12), in `display-engine.ts`, `segment-shapes.ts` and `block-engine.ts`. A multiplexed digit holds the pattern it last captured while selected. Canvas hit-testing now uses the drawn body (`findComponentAt` in `gate-shapes.ts`).
- **Delivered (Phase 2A):** MUX/DEMUX (2:1/4:1/8:1/16:1) and binary-decoder/priority-encoder components (ledger items 17 and 18) in `src/tools/logic/block-engine.ts`, each with an optional EN pin (MUX/DEMUX/decoder), decoder output polarity, and 4-valued X/Z propagation; the simulator's combinational pass is multi-output, and Canvas2D and SVG both derive the body from `blockBodyRect(ports)`. Covered by `tests/unit/logic-block-engine.test.ts` and a 2:1-mux case in `tests/e2e/logic.spec.ts`.
- Multi-channel logic analyzer/oscilloscope dock: rolling sample buffer keyed to sim ticks, up to 16 probes, edge markers, cursor delta measurement; full-screen toggle on narrow viewports.
- **Delivered (Phase 2D):** touch two-finger pan and pinch-zoom on the canvas. The gesture math is pure (`src/tools/logic/touch-gestures.ts`: `zoomViewportAt`, `beginPinch`, `updatePinch`, shared with the wheel zoom); `LogicCanvas.tsx` tracks every finger by pointer id, and a second finger abandons whatever the first had started (a previewed drag is put back, a held push button is released, a touch component drop is only committed if the finger lifts without a pinch). Covered by `tests/unit/logic-touch-gestures.test.ts` and a two-touch e2e case.
- **Delivered (Phase 2E):** the multi-channel logic analyzer dock (ledger item 15): `analyzer-engine.ts`, `analyzer-render.ts`, `LogicAnalyzerDock.tsx`. Up to 16 channels (probes and LEDs by default, or any output pin), a 2048-sample ring recorded on every step, edge markers, two-cursor tick/ns measurement, follow-live, zoom, scroll, and a full-screen layout that is automatic on narrow viewports. **Phase 2 is complete.**
- The Phase 1 UX follow-up for touch pan and pinch-zoom is closed by 2D above.
- Two items originally deferred here were instead fixed on the Phase 1 branch during a later documentation/bug audit (2026-09-19), before Phase 2 work started: hover-tooltip clamping to the canvas viewport bounds (`clampTooltipPosition` in `LogicCanvas.tsx`), and single-input gate (NOT/BUFFER/TRI-STATE BUFFER) pin/body centering — the root cause turned out to be shared by *every* gate family, not just single-input ones: `variadicGatePorts`' output offset used `(count - 1) / 2` while the renderer always draws the tip at `Math.max(2, count) / 2`, so a 2-input AND/OR/etc.'s own output pin was already off by half a grid row before a single input was involved. Both renderers derive every port offset from that same `Math.max(2, inputCount) / 2` body-center formula now, in one file (`component-library.ts`), so the two renderers cannot drift apart. Also fixed in that pass, both real bugs independent of the geometry issue: a right-click (or middle-click) while placing a component from the palette silently placed one anyway instead of no-opping (`LogicCanvas.tsx`'s `handlePointerDown`), and ledger item 27's Phase 1 commitment to a visible keyboard-shortcuts reference panel — the bindings were functional but no panel existed — is now delivered as a `Keyboard shortcuts` toolbar toggle/dock in `LogicWorkspace.tsx`. See `.tasks/IN_PROGRESS.md` for the full list and evidence.

**Gate:** same shape as Phase 1 (unit + build + a focused Playwright interaction/accessibility spec for the analyzer dock and new components), plus regression confirmation that Phase 1 capabilities are unaffected.

## Phase 3 — Buses, subcircuits, memory, arithmetic, K-map, and educational modes

Delivers ledger items 3, 4, 9, 13, 16, 21, 23, 24, and the remaining part of 27 (full keyboard remapping UI).

- ~~Multi-bit bus wire type, bus splitter/tap components, per-bit and aggregate value readouts.~~ Delivered in 3E (below).
- ~~Subcircuit packaging~~ Delivered in 3H (below).
- ~~RAM/ROM component with hex/ASCII editor and binary import~~ Delivered in 3F (below).
- ~~RGB LED pixel-matrix component.~~ Delivered in 3G (below).
- ~~Configurable ALU component (4/8/16-bit).~~ Delivered in 3F (below).
- **Delivered (Phase 3A):** K-map solver and Quine–McCluskey minimizer (2–5 variables) with exact essential/Petrick cover selection, SOP and POS, don't-cares, visual grouping loops, and one-click minimized-circuit generation (`minimize-engine.ts`, `synthesis-engine.ts`, `LogicMinimizerDock.tsx`).
- **Delivered (Phase 3B):** gamified puzzle engine with an 11-level built-in set verified against target truth tables through the simulator (`puzzle-engine.ts`, `LogicPuzzleDock.tsx`).
- **Delivered (Phase 3C):** the Junior Explorer elementary theme: large-format, family-color-coded, animated signal flow, one-click swap in and out (`render-engine.ts` palette extensions, `LogicWorkspace`/`.css`).
- **Delivered (Phase 3D):** full keyboard-shortcut remapping on top of the Phase 1 default bindings, with conflict and reserved-key checks and local persistence (`shortcut-engine.ts`, `LogicShortcutsDock.tsx`).
- **Delivered (Phase 3E):** multi-bit buses (`bus-engine.ts`, `BUS_SPLITTER`, bus pins on REGISTER/COUNTER via the "Bus pins" inspector option). The simulator stays scalar: a bus port is a handle over per-bit pins, `buildNetIndex` unions bus bit groups pairwise, and splitter tap pins are aliases of the bus bits. Bus-to-single and width-mismatched wires are refused with a spoken reason (`wireProblem`, notice in the workspace); resizing a bus drops wires that no longer fit; imported files that join mismatched ends are rejected. Bus wires draw thick with a slash-and-count mark on the canvas and in the SVG export; hover (or touch hold) on a bus pin reads it as `Q[3:0] = 0101 (0x5, 5)`. Later phases build on it: the ALU and memory in 3F use bus ports for their operands, address, and data.
- **Delivered (Phase 3F):** the ALU and the RAM/ROM parts with their editor. `alu-engine.ts`: 4/8/16-bit combinational ALU built from four-valued gates (ripple adder, bitwise gates, barrel shifter): ADD, SUB, AND, OR, XOR, SHL, SHR, SAR with carry in, carry/borrow out and the Z, N, V flags; EQ/LT/GT always compare A and B (unsigned). `memory-engine.ts`: RAM and ROM with a 4-32 bit address space and 4/8/16/32-bit words, stored sparsely (only words that differ from a fill value), asynchronous reads with an optional output enable that releases the data bus, clocked RAM writes that are skipped and reported (hazard `memory_write_skipped`) when the address, data or write enable is unknown, live writes kept as an overlay on the stored contents, strict import validation, and raw binary import/export (little-endian). `LogicMemoryDock.tsx`: paged hex/ASCII cell editor with go-to-address, fill, clear, text write, binary import/export, live-value markers and the currently addressed word highlighted. Bus width cap raised to 32 for the address buses.
- **Delivered (Phase 3G):** the RGB LED pixel matrix (`matrix-engine.ts`, drawn by the canvas and SVG exporter from one shared layout). 8x8 or 16x16 with one input per row (left), one per column (right) and R/G/B color inputs; a pixel lights where an asserted column crosses the selected row in the color the R, G and B pins show, and holds that state until its row is selected again (persistence of vision, as on the multiplexed display), so scanning demos read as a steady picture. Row/column polarity is selectable; a floating or unknown column or color line leaves a pixel unlit.
- **Delivered (Phase 3H):** subcircuits and truth-table scoping (`subcircuit-engine.ts`, `subcircuit-ports.ts`). A selection becomes one part ("Group into subcircuit"): every wire crossing its edge becomes an input or output port marker (`PORT_IN`/`PORT_OUT`, single signal or bus) wired inside and to the new part outside. The circuit is stored by value in the part (`params.subcircuit`: name, icon, components, wires, last view), so a project file and a copy are self-contained, and subcircuits nest to 8 levels. The simulator, rule check, truth table and analyzer see the flattened circuit (`flattenDocument`: parts renamed `<part>/<inner>`, markers become passive `NET_TIE` junctions), so a subcircuit behaves exactly like the parts it was made from; the analyzer offers signals from inside them. Double-click (or the context menu / inspector) opens a subcircuit; every edit is applied at the open path (`applyAtPath`) and written back through each level; a breadcrumb trail and "Up one level" return; the live simulation is shown from inside. Inside, port markers act as switches and LEDs, so the subcircuit's own truth table is over its ports. The truth table can also be scoped to selected switches and LEDs. Imported files are validated recursively (depth, total expanded size, resolvable wires and bus widths).

**Gate:** same shape as prior phases; subcircuit and bus changes require additional unit coverage for nested-document persistence and bus-width mismatch handling.

## Phase 4 — Professional export & metadata studio completion

Delivers ledger items 29, 30, 31 (PDF/title-block), 32, 33 (OpenGraph card generation).

- ~~Verilog and VHDL structural exporters driven by the same component/net graph used for simulation.~~ Delivered in 4a.
- ~~SPICE `.cir`, EDIF, and KiCad schematic-netlist exporters.~~ Delivered in 4b.
- ~~BOM CSV/JSON exporter mapping gate types to classic 74-series IC equivalents.~~ Delivered in 4c.
- ~~PDF schematic export with title block, border grid, and reference designators.~~ Delivered in 4d with the already-pinned pdf-lib 1.17.1 (no new dependency).
- ~~OpenGraph social-card generation for the metadata studio.~~ Delivered in 4e.
- **Delivered (Phase 4a):** `netlist-engine.ts` (`buildNetlist`) is the one netlist every exporter reads: the flattened circuit as parts with reference designators, pins, nets named from labels, ports and bus bits. `hdl-verilog.ts` writes gate primitives (optionally with per-gate delays) plus behavioral cells; `hdl-vhdl.ts` writes an entity and architecture. Both are proven by co-simulating exported circuits in Icarus Verilog and GHDL against the workstation simulator (`logic-hdl-toolchain.test.ts`, skipped where the tools are absent). The co-simulation exposed and fixed a simulator bug (a sink behind combinational logic following a clocked part showed the pre-edge level for a tick).
- **Delivered (Phase 4b):** `spice-export.ts` (behavioral B-source subcircuits; run through ngspice in `logic-spice-toolchain.test.ts`), `kicad-export.ts` (s-expression netlist), `edif-export.ts` (EDIF 2 0 0).
- **Delivered (Phase 4c):** `bom-engine.ts` and `ic-catalog.ts`: 74-series packages with pin tables read from datasheets on 2026-09-29 (7400, 7402, 7404, 7408, 7410, 7411, 7420, 7421, 7427, 7430, 7432, 7474, 7486, 74125), decomposition of gates that have no single package, spare-gate tie-off list, block parts matched to a part number without a pin table (pinouts not verified), CSV/JSON/pin-allocation CSV.
- **Delivered (Phase 4d):** `svg-subset.ts` reads the schematic SVG back into draw items and `pdf-export.ts` draws them as a one-page vector PDF (sheet border with lettered columns and numbered rows, title block, designators, net labels, A4/A3/Letter, document properties from the metadata). `renderSchematicSvg` gained the options `designators`, `netLabels`, `sheet` and `titleBlock`; the default output is unchanged.
- **Delivered (Phase 4e):** `og-card.ts` (1200 x 630 card and the `og:`/`twitter:` meta tags, fields editable at export time, addresses restricted to http(s) or relative), `svg-raster.ts` (browser PNG), `export-formats.ts` (every export in one list) and `LogicExportDock.tsx` (toolbar "Export...").

**Gate:** same shape as prior phases; export-format unit tests assert on generated text/structure (module headers, port lists, subckt syntax) rather than only "did not throw."

## Dependency ledger

No new dependency is introduced in Phase 1. Phase 4's PDF export uses `pdf-lib` 1.17.1, which the repository already pins for other tools; npmjs.com listed 1.17.1 as the current release on 2026-09-29 (Phase 4d start), so no dependency was added or changed for this workstream.

## Task-state synchronization

This plan is tracked in `.tasks/IN_PROGRESS.md` under "Digital Logic Workstation." Phase completion, blockers, and any accepted scope exclusion are updated there in the same execution cycle they occur, per `GOVERNANCE.md`. Deferred ledger items are never removed from the design document's ledger — only marked with the phase that will deliver them.

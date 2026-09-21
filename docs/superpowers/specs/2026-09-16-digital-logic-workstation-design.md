# Digital Logic Workstation — Design

**As of:** 2026-09-16

## Purpose

Digital Logic Workstation is a local-first digital logic circuit simulator, schematic capture surface, and electronic-prototyping workstation for InMo Tools. It must be immediately usable by a first-time student ("light the bulb") while remaining genuinely useful to hobbyists, computer-architecture instructors, hardware architects, and embedded-systems developers who need believable gate-level and register-level behavior, inspectable timing, and interchange-ready export.

The tool is browser-native and backend-free. Circuits, subcircuits, memory contents, test vectors, and saved projects are processed and stored locally. The public interface must not expose internal implementation language, development rationale, or private project discussion. The word "AI" and any AI-branding must not appear in the tool's copy, UI labels, or feature names.

## Product identity

- **Tool name:** Digital Logic Workstation
- **Route:** `#/tools/digital-logic-workstation`
- **Catalog title:** Digital Logic Workstation — Circuit Simulator, Schematic Capture & Prototyping Bench
- **Primary workspace:** an infinite pannable/zoomable schematic canvas with a component palette, a contextual property inspector, and a collapsible signal-inspection dock (truth table / timing / logic analyzer).
- **Audience:** kids and first-time learners · hobbyists · computer-science students · professional electrical engineers · hardware architects · embedded-systems developers

## Scope policy

The completion scope is intentionally broad, matching the other 30+-capability workbenches already shipped in this repository (Vector Studio, Photo Studio, PlanCraft Studio). A traditional digital-logic, schematic-capture, or electronics-prototyping capability may be excluded only when it is:

1. infeasible in the repository's static browser/GitHub Pages environment (e.g., kernel-level USB device flashing, a server-side SPICE cluster);
2. unrelated to digital logic, schematic capture, or logic-level electronic prototyping;
3. superseded by a stronger integrated capability already planned or shipped; or
4. excluded for another explicitly documented reason recorded here as "Other."

Nothing may be silently dropped. A deferred capability is recorded in the plan's phase ledger, never deleted from scope.

### Explicit exclusions

- **Server-side multi-core SPICE matrix clusters** — excluded (infeasible). All propagation, tick scheduling, and nodal evaluation run in the browser via plain TypeScript and, where profiling shows a need, a Web Worker. No continuous analog/nonlinear SPICE transient solver is in scope; digital logic levels (`0`, `1`, `Z`, contention) are the simulated domain.
- **Kernel-level JTAG/SWD/USB hardware programmers** — excluded (Other: browser sandbox restriction). The workstation instead exports standard artifacts (Verilog, VHDL, Intel HEX / raw binary ROM images, SPICE subcircuits) for use with an external programmer or simulator.
- **Cloud multi-tenant accounts, auth, or a remote database** — excluded (infeasible under the repository's zero-backend privacy model). Projects persist as local IndexedDB/localStorage state and as portable `.circuit.json` export/import bundles.
- **Closed-source multi-layer PCB autorouting** — excluded (Other: proprietary/server-licensed). PCB layout itself is out of scope; the tool produces clean schematic capture, netlists (SPICE `.cir`, EDIF, KiCad schematic netlist), and BOM/export artifacts that a dedicated PCB tool can consume.
- **Continuous analog waveform / op-amp / filter simulation (Falstad/LTspice-class transient analysis)** — excluded (unrelated to the digital-logic domain boundary of this tool; superseded for this workstream by the digital timing/logic-analyzer capability, which is the analogous inspection tool for discrete logic levels). A future analog-simulation tool is a separate catalog entry, not scope creep here.

## Repository fit

The tool follows the existing InMo Tools architecture:

- React + TypeScript + Vite, isolated under `src/tools/logic/`;
- one catalog entry (`src/catalog.ts`) and one lazy-loader entry (`src/tools/workspaces.tsx`); no route-specific special case;
- plain framework-independent engine modules (`*-engine.ts`, `*-types.ts`) that own all simulation, model, and export logic, matching the PlanCraft/Floorplan split of engine vs. presentation;
- React owns presentation and interaction only; it never owns simulation state directly — it dispatches through the engine and re-renders from the returned document;
- Canvas2D rendering for the schematic surface (consistent performance across desktop and mobile without a heavyweight scene-graph dependency);
- a Web Worker for the truth-table/K-map exhaustive-permutation walk once input counts make main-thread evaluation register as blocking, following the existing `logs/log-runner.ts`-style deadline/cancellation pattern;
- exact dependency versions only, re-verified immediately before any new dependency is added;
- local persistence only (localStorage autosave + explicit `.circuit.json` project bundle export/import);
- focused Vitest engine tests plus focused Playwright interaction/accessibility coverage, matching every other suite in this repository.

## Dependency policy

No new runtime dependency is required for the phase described in the accompanying plan. The simulation engine, canvas rendering, wire routing, truth-table/K-map/SOP-POS derivation, ERC auditor, and SVG/JSON/CSV export are implemented with the existing repository toolchain (React, TypeScript, Vite, Tailwind). If a later phase's HDL/netlist text generation or hex/BOM spreadsheet export is better served by an existing repository dependency already used elsewhere for the same file family (for example the existing `papaparse`/`svgo`/`jszip` already pinned in `package.json`), that reuse is preferred over adding a new package. Any genuinely new dependency must be re-verified against its current stable release and pinned exactly at the time it is introduced, and recorded in the plan's dependency ledger with its verification date — it is not pre-approved here.

## Source-of-truth data model

A single framework-independent `LogicDocument` is the simulation and schematic source of truth; React renders from it and never mutates it directly.

`LogicDocument` contains:

- schema version, project id, title, author, description, version string, license, tags — the metadata studio fields;
- a component map keyed by stable id: type, position, rotation, mirrored flag, per-instance parameters (input count, bit width, propagation delay in nanoseconds, active-high/low, edge polarity, clock frequency, memory contents where applicable), and a label;
- a net/wire list: each wire is an ordered polyline of orthogonal waypoints between two port references, carrying a bit width;
- a subcircuit registry for packaged/nested designs (id, exposed port map, custom icon, and its own nested `LogicDocument`);
- global simulation settings: delay mode (`ideal` | `realistic`), clock rate, single-step counter, and the active theme/palette;
- viewport state (pan, zoom) and selection state;
- undo/redo history as an immutable past/future snapshot stack, matching the `ProjectHistory` pattern already used by PlanCraft Studio.

The simulation engine consumes only the component/net graph (never React state) and produces a `SimulationFrame`: per-port logic levels (`0 | 1 | 'Z' | 'X'`), per-component internal state (flip-flop stored bit, counter value, memory contents), a monotonic tick counter, and any detected hazards (oscillation, contention, floating-input drive).

## Functional capability ledger

Every item below is a required, functional (non-decorative) capability. Each is tagged with the phase in the accompanying plan that delivers it; nothing here is dropped, only sequenced. "Traditional" tool comparisons (Logisim-evolution, CircuitVerse, Digital, KiCad, LTspice, EasyEDA, Tinkercad, Proteus) are the baseline this ledger is required to meet or exceed for the digital-logic domain; the word "AI" never appears in shipped copy.

### Core canvas & schematic capture
1. Fluid multi-resolution infinite schematic canvas — pan (drag/two-finger touch), pinch/scroll zoom, crisp text and pins at every zoom level. *(Phase 1)*
2. Deterministic orthogonal wire routing with automatic T-junction joint dots; left-click commits a waypoint, right-click/Escape cancels the in-progress wire, and a floating "Cancel route" chip appears near the touch point on touch devices. *(Phase 1)*
3. Multi-bit bus architecture: bus wires, a bus-splitter component with configurable width, and per-bit tap connections, with hover/tap-and-hold value readouts in binary/hex/decimal. *(Phase 3)*
4. Custom subcircuit encapsulation: group a selection into a named subcircuit with assigned ports and a custom icon; double-click to descend, breadcrumb trail to return. *(Phase 3)*
5. Universal logic-gate primitive suite: AND, OR, NOT, NAND, NOR, XOR, XNOR, buffer, tri-state buffer, each configurable from 2–8 inputs from the inspector without losing existing wiring. *(Phase 1)*
6. Configurable propagation delay / real-world gate physics: an ideal zero-delay mode and a realistic per-gate nanosecond-delay mode that exposes glitch/hazard/race behavior. *(Phase 1)*

### Sequential logic, clocks & memory
7. Flip-flop/latch bank: D, T, JK, SR, with active-high/low async set/reset and positive/negative edge triggering. *(Phase 1: D/JK/T/SR; Phase 2: register banks)*
8. Interactive multi-frequency clock generator (0.5 Hz–10 kHz presets) plus a manual single-step tick control. *(Phase 1)*
9. RAM/ROM memory editor matrix (4-bit–32-bit address space) with a hex/ASCII cell editor and raw binary import. *(Phase 3)*
10. Synchronous/asynchronous up/down counters with terminal-count flags and synchronous load. *(Phase 2)*

### Interactive I/O & virtual instruments
11. Interactive switches, push buttons, and a mechanical-bounce emulation toggle for debounce-circuit training. *(Phase 1)*
12. Multi-segment/alphanumeric display drivers: 7-segment (single and multiplexed 4-digit) and 16-segment, wired directly or through a BCD decoder. *(Phase 2)*
13. RGB LED pixel-matrix canvas (8×8 / 16×16) with row/column drive for scanning demos. *(Phase 3)*
14. Integrated logic probe / voltage-level indicator: High/Low/High-Z/Contention shown by both color and shape/pattern. *(Phase 1)*
15. Virtual multi-channel logic analyzer / oscilloscope dock: up to 16 probes, synchronized scrolling timing diagram, edge markers, time-delta cursor measurements; the dock collapses to a full-screen mode on narrow viewports. *(Phase 2)*

### Combinational & arithmetic blocks
16. Configurable 4/8/16-bit ALU (add, subtract, AND, OR, XOR, compare, barrel shift). *(Phase 3)*
17. Multiplexer/demultiplexer arrays (2:1, 4:1, 8:1, 16:1) with address and enable lines. *(Phase 2)*
18. Priority encoders and binary decoders with valid-output flags. *(Phase 2)*

### Automated analysis
19. Automated truth-table generator (walks every input permutation), sortable and interactive. *(Phase 1: every switch/push-button in the document is an input and every LED/probe is an output, which requires the circuit to be purely combinational; scoping the walk to a user-selected subcircuit — so unrelated components on the same canvas don't participate — is Phase 3 work, delivered together with subcircuit encapsulation, ledger item 4.)*
20. Boolean expression extractor: canonical SOP and POS from the drawn circuit or its truth table. *(Phase 1)*
21. Karnaugh-map solver and Quine–McCluskey minimizer for 2–5 variables with visual grouping loops and one-click minimized-schematic generation. *(Phase 3)*
22. Electrical rule check (ERC): floating/undriven input nets, output-to-output contention, unbuffered combinational loops — one click, itemized results naming the affected components. *(Phase 1: an undriven net is reported as a floating-input finding on whichever input pins it feeds, rather than as its own separate category.)*

### Educational & accessible modes
23. Gamified logic-puzzle challenge engine ("light the bulb," "build XOR from NAND only," "build a full adder") with automatic pass/fail verification against the target truth table. *(Phase 3)*
24. Junior Explorer color-coded elementary mode: one-click swap to large, bright, animated blocks for first-time/young learners. *(Phase 3)*

### Ergonomics, input model & accessibility
25. Contextual right-click menu on desktop (rotate 90°, flip horizontal/vertical, duplicate, change bit width, delete, inspect net) and an accessible long-press radial menu on touch. *(Phase 1)*
26. Non-intrusive, viewport-edge-aware tooltip engine on every tool/pin, suppressed on touch to avoid obstruction (replaced there by tap-and-hold detail). *(Phase 1)*
27. Keyboard shortcut matrix (wire, rotate, palette focus, play/pause, delete, undo/redo) with a visible reference panel. *(Phase 1: functional default bindings + reference panel; Phase 3: full user remapping UI)*
28. Accessible high-contrast / OLED-dark / paper-light / deuteranopia-and-protanopia-safe palettes where logic High/Low/Z/contention are distinguished by shape and pattern as well as hue. *(Phase 1)*

### Export, netlists, HDL & metadata
29. HDL exporter: synthesis-formatted structural Verilog (`.v`) and VHDL (`.vhd`) with standard module headers and port declarations. *(Phase 4)*
30. Industry-standard netlist exporter: SPICE `.cir` subcircuits, KiCad schematic netlist text, and EDIF. *(Phase 4)*
31. Vector SVG and print-ready PDF schematic exporter with title block, border grid, reference designators, and net labels. *(Phase 1: SVG; Phase 4: PDF/title-block)*
32. Bill-of-materials exporter: CSV/JSON itemizing components, gate counts, and classic IC package equivalents (e.g., 7400 quad NAND, 7404 hex inverter) with pin allocations. *(Phase 4)*
33. Granular project metadata / OpenGraph tag studio: title, author, description, version, license (MIT / CERN-OHL / Creative Commons), and generated OpenGraph social-card preview fields, editable at export time. *(Phase 1: metadata fields + JSON export; Phase 4: OpenGraph card generation)*
34. Offline single-file portable `.circuit.json` project bundle (layouts, embedded subcircuits, memory contents), reloadable with zero network connectivity. *(Phase 1)*

Truth-table CSV export, referenced by capability 19, ships in Phase 1 alongside the generator itself.

## Domain boundary

In scope: combinational and sequential digital logic, schematic capture for that logic, bus/interconnect modeling, digital timing inspection, and export to text/vector/interchange artifacts consumable by external HDL/EDA/PCB tools.

Out of scope for this tool (may be separately proposed elsewhere): continuous analog/SPICE transient simulation of arbitrary op-amp/filter/power circuits, PCB copper layout and autorouting, 3D mechanical CAD, and any cloud/account-based collaboration.

## Experience architecture

- **Toolbar:** new/open/save project, undo/redo, delay-mode toggle, run/pause/step, theme switcher, export menu.
- **Palette:** categorized, searchable component drawer (gates, I/O, sequential, combinational/arithmetic once phased in).
- **Canvas:** the schematic surface described above.
- **Inspector:** contextual parameters for the current selection (input count, bit width, delay, labels, metadata studio fields when nothing is selected).
- **Signal dock:** truth table / timing-diagram / ERC results, collapsible, becomes a full-screen sheet on narrow viewports.

On narrow screens the palette and inspector become slide-over bottom sheets (as Web Layout Studio already does), never permanently hidden capability. The canvas remains the primary surface at every viewport size, matching the CAD/PlanCraft precedent already in this repository.

## Definition of done for this workstream

A phase is complete only when every capability it claims is reachable through the shipped UI (not a decorative control), covered by focused Vitest engine tests and, where interaction/accessibility matters, a focused Playwright spec; the production build succeeds; and `.tasks/IN_PROGRESS.md` reflects the true state. The workstream itself is complete only when every numbered capability above is implemented or has a recorded, reviewed exclusion under the Scope policy — matching the standard already applied to Crystal Lattice Studio and Vector Studio in this repository.

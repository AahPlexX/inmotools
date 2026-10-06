---
tool: digital-logic-workstation
folder: src/tools/logic
doc: spec
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-digital-logic-workstation-design.md
tracker: src/tools/logic/TRACKER.md
updated: 2026-10-05
---

# Digital Logic Workstation — spec

As built at `origin/main` `5fb22493`. Requirement prefix: `DLW`. Status of each requirement: [TRACKER.md](../../../src/tools/logic/TRACKER.md). History: [2026-09-16-digital-logic-workstation-design.md](2026-09-16-digital-logic-workstation-design.md) (capability ledger 1–34, scope policy, exclusions), plan [2026-09-16-digital-logic-workstation.md](../plans/2026-09-16-digital-logic-workstation.md). Former ledger numbers are given as "(formerly N)".

## Purpose

Draw, simulate and analyse digital logic circuits in the browser — gates, flip-flops, counters, buses, memory, an ALU and nested subcircuits — inspect their behaviour with truth tables, Boolean expressions, Karnaugh maps, a rule check and a logic analyzer, and export schematics, HDL, netlists and a parts list, for first-time learners, students, hobbyists, instructors and hardware engineers.

## Scope

In scope:
- Schematic capture on an infinite canvas, combinational and sequential digital logic, buses, memory and subcircuits.
- Event-driven simulation with four logic levels (`0`, `1`, `Z`, `X`), ideal or per-gate nanosecond delay.
- Truth tables, SOP/POS, K-map/Quine–McCluskey minimization, electrical rule check, logic analyzer, puzzles and Junior Explorer.
- Exports: project JSON, SVG/PDF schematics, Verilog, VHDL, SPICE, KiCad, EDIF, bill of materials, social card.

Out of scope:
- Continuous analog/transient SPICE simulation, PCB layout and autorouting, hardware programmers (2026-09-16 design, "Explicit exclusions" and "Domain boundary").

## Constraints

- Platform rules: no accounts or authentication; no server or server-side database (static files on GitHub Pages); everything runs in the browser and circuits stay in this browser (localStorage); network use only for the site's own files ([DOCUMENTATION_STANDARD.md](../../DOCUMENTATION_STANDARD.md#platform-rules-apply-to-every-tool-and-every-spec)).
- No large language models; other ML only on the device under the ML ruleset. The word "AI" does not appear in the tool's copy.
- Libraries as in `package.json` (`pdf-lib` for the PDF export). The `.circuit.json` format (schema version 1) and the localStorage keys (`inmotools_logic_workstation_autosave`, the shortcut and puzzle-progress keys) are not changed.

## Architecture and engine

- Engines and libraries: `pdf-lib@1.17.1` builds the PDF export; the simulation, synthesis, minimizer, analyzer, netlist, HDL (Verilog and VHDL), KiCad, EDIF and SPICE engines are first-party TypeScript in `src/tools/logic/`.
- Storage: localStorage key `inmotools_logic_workstation_autosave` holds the autosaved project; key `inmotools_logic_shortcuts` holds the keyboard shortcuts; key `inmotools_logic_puzzle_progress` holds puzzle progress.
- Browser APIs: Canvas 2D draws the circuit canvas and the logic analyzer, and rasterizes SVG to PNG through `Image` and `canvas.toBlob` (`svg-raster.ts`); exports and memory images download through `src/lib/download`.

## Requirements

### Canvas and schematic capture

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| DLW-R01 | The schematic canvas pans by drag or two fingers and zooms by wheel or pinch about the pointer, with text and pins drawn crisply at every zoom (formerly 1) | Two fingers pan and pinch without moving or creating a part; the point under the fingers stays fixed |
| DLW-R02 | A click selects the component whose drawn body is under the pointer, the topmost one where bodies overlap, following rotation and mirroring | Of two switches two rows apart, clicking the lower one selects it |
| DLW-R03 | Wires route orthogonally through clicked waypoints with joint dots; right-click or Escape cancels an unfinished wire, and on touch a floating "Cancel route" chip appears near the finger (formerly 2) | Escape cancels a wire in progress; the next click does not complete it |
| DLW-R04 | A wire between two inputs or to a pin the part does not have is refused; two outputs may share a net for tri-state buses | Input-to-input wiring is refused; output-to-output is accepted |
| DLW-R05 | Parts are placed from the palette by clicking the canvas; Escape stops placing and a right-click while placing cancels the drop | Right-click while placing adds no part |
| DLW-R06 | The palette is grouped by category and can be searched by name | Typing "flip" in the palette search leaves only the flip-flops |
| DLW-R07 | Components rotate in 90° steps, mirror, duplicate and delete with their wires | Rotate cycles 0/90/180/270/0; deleting a part removes its wires |
| DLW-R08 | Every edit can be undone and redone; a new edit after an undo clears the redo history | Place a part, Undo removes it, Redo restores it |
| DLW-R09 | The inspector edits the selected part's label and parameters (input count, delay, polarity, edge, width, options) and the pins follow the settings | Changing a counter's options from the inspector adds or removes its pins |
| DLW-R10 | Multi-bit buses: bus wires, a bus splitter of configurable width with per-bit taps, a refusal that names both widths for mismatched buses, and pin readouts in binary, hex and decimal on hover or touch hold (formerly 3) | A 4-bit bus will not wire to an 8-bit bus and says why; a matching pair wires and exports as a bus |
| DLW-R11 | Registers and counters offer bus pins for their data and outputs ("Bus pins" option) | In bus mode D and Q are bus ports and the part still simulates |
| DLW-R12 | A selection is grouped into a named subcircuit with ports for every crossing wire and a custom icon; double-click opens it, a breadcrumb trail and "Up one level" return; nesting up to 8 levels (formerly 4) | Group two parts, open by double-click, toggle inside, return by the breadcrumb |
| DLW-R13 | Input and output port markers can be placed and set to a single signal or a bus | An input port marker set to a bus shows a bus pin |
| DLW-R14 | Edits made inside a subcircuit are written back through every level, and the running simulation is shown from inside | An edit two levels down appears in the saved project; levels show inside the open subcircuit |

### Gates and simulation

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| DLW-R15 | AND, OR, NOT, NAND, NOR, XOR, XNOR, buffer and tri-state buffer, each with 2–8 inputs set from the inspector; shrinking the count drops only the wires to removed pins (formerly 5) | Every gate matches its truth table; 9 inputs is clamped to 8 |
| DLW-R16 | An ideal zero-delay mode and a realistic mode with per-gate nanosecond delay that shows glitches, hazards and ripple transients (formerly 6) | In realistic mode an output changes only after its configured delay |
| DLW-R17 | Nets carry four levels: `0`, `1`, floating `Z` and unknown `X`; disagreeing drivers are reported as contention | An unconnected input reads `Z`; two disagreeing outputs on a net report contention |
| DLW-R18 | A combinational loop that cannot settle in ideal mode resolves to `X` and is reported as an oscillation hazard instead of hanging | A NOT gate fed by its own output settles to `X` with a hazard message |
| DLW-R19 | Step advances one manual tick, including half a period of every clock | Step advances a 1 Hz clock by exactly one half-period |
| DLW-R20 | Run and Pause start and stop continuous simulation from the toolbar and the Space key | Run makes a clocked LED blink; Pause stops it |

### Sequential logic, clocks and memory

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| DLW-R21 | D, T and JK flip-flops and an SR latch, with active-high or active-low asynchronous set and reset and rising or falling edge triggering (formerly 7) | D latches on the rising edge; S=R=1 shows `X`; an active-low reset clears on 0 |
| DLW-R22 | Parallel registers of 2–8 bits capture their data on the clock edge, with enable and reset (formerly 7) | The register holds the captured value between edges |
| DLW-R23 | A clock generator with presets from 0.5 Hz to 10 kHz plus manual single-step (formerly 8) | A clock crossing several half-periods in one step loses no cycles |
| DLW-R24 | Synchronous and ripple up/down counters of 2–8 bits with terminal-count flag, enable, synchronous load and asynchronous reset (formerly 10) | A ripple counter rolling 0111 to 1000 shows the transient states in realistic mode |
| DLW-R25 | RAM and ROM with a 4–32-bit address space and 4/8/16/32-bit words, optional output enable, clocked RAM writes, and a hazard when a write is skipped for an unknown address or data (formerly 9) | A ROM read through an address bus shows every stored word in the truth table |
| DLW-R26 | A memory editor shows paged hex and ASCII cells with go-to-address, fill, clear, text write, and raw binary import and export (formerly 9) | Edit a word in hex, jump to an address, import a binary file and export it back byte for byte |

### Interactive I/O and instruments

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| DLW-R27 | Toggle switches and push buttons, with a mechanical-bounce option for debounce training (formerly 11) | A bouncing button chatters for a few ticks before settling; the truth table reads the settled level |
| DLW-R28 | 7-segment (single and multiplexed 4-digit) and 16-segment displays with polarity controls, driven directly or through a BCD-to-7-segment decoder (formerly 12) | Each decimal digit shows through the BCD decoder; an unselected multiplexed digit keeps its last pattern |
| DLW-R29 | An 8×8 or 16×16 RGB LED matrix with row, column and colour inputs that keeps each row's picture until it is selected again (formerly 13) | A pixel lights where the selected row meets an asserted column, in the driven colour |
| DLW-R30 | Probes and LEDs show High, Low, High-Z and contention by colour and by line weight or dash pattern (formerly 14) | Each level is distinguishable in grayscale |
| DLW-R31 | A logic analyzer dock records up to 16 channels on every step, marks edges, measures between two cursors in ticks and nanoseconds, follows live, zooms, scrolls and goes full screen (automatic on narrow viewports) (formerly 15) | Record steps, place two cursors, read the delta; full screen opens |

### Combinational and arithmetic blocks

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| DLW-R32 | A 4/8/16-bit ALU with ADD, SUB, AND, OR, XOR, shifts (SHL, SHR, SAR), carry in, carry/borrow out, Z, N, V flags and EQ/LT/GT compare (formerly 16) | Results match integer arithmetic for every 4-bit operand pair |
| DLW-R33 | Multiplexers and demultiplexers 2:1, 4:1, 8:1 and 16:1 with select and optional enable lines (formerly 17) | A 2:1 multiplexer's truth table follows the select line |
| DLW-R34 | Binary decoders (active high or low) and priority encoders with a valid flag (formerly 18) | The highest asserted request is encoded and valid is set |

### Analysis

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| DLW-R35 | A truth table walks every input permutation of a combinational circuit, scoped to an open subcircuit's ports or to selected switches and LEDs, refuses sequential circuits with the reason, and can be sorted by any column (formerly 19) | A two-switch AND circuit gives four rows; a circuit with a flip-flop is refused |
| DLW-R36 | The truth table exports as CSV with a header row and quoted labels | A label with a comma stays in one CSV cell |
| DLW-R37 | Canonical SOP and POS expressions are shown for every output; a floating or contended output is marked unresolved (formerly 20) | The AND circuit shows `A·B` as SOP |
| DLW-R38 | A Karnaugh-map solver and Quine–McCluskey minimizer for 2–5 variables with don't-cares, essential primes, Petrick's method and visual grouping loops, giving SOP and POS (formerly 21) | Every 2- and 3-variable function is minimized exactly and minimally |
| DLW-R39 | One click adds the minimized circuit to the canvas, clear of existing parts and with gates no wider than 8 inputs (formerly 21) | The minimizer adds a working minimized circuit beside the original |
| DLW-R40 | An electrical rule check lists floating inputs (one finding per undriven net, naming its pins), output contention and unbuffered combinational loops, naming the parts (formerly 22) | An unwired gate input is reported with its part and pin |

### Learning modes

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| DLW-R41 | A puzzle set ("light the bulb", "XOR from NAND only", "full adder" and others) starts each level from its own circuit and checks the answer against the target truth table, naming wrong rows and part rules (formerly 23) | A wrong answer names the wrong rows; a right one passes |
| DLW-R42 | Puzzle progress and the best result per level are kept in this browser; malformed saved entries are dropped | After a reload the solved level is still marked |
| DLW-R43 | Junior Explorer swaps in a large, family-colour-coded, animated look with one click and restores the previous theme and zoom with another (formerly 24) | One click enters, one click leaves with the old theme and zoom |

### Input model and ergonomics

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| DLW-R44 | A right-click menu on desktop and a long-press radial menu on touch offer rotate 90°, flip horizontal and vertical, duplicate, change bit width, delete and inspect net (formerly 25) | Right-click a gate; each listed action is offered and works |
| DLW-R45 | Tooltips on parts and pins stay inside the canvas edges and are replaced by tap-and-hold detail on touch (formerly 26) | A tooltip near the right edge is shifted inside the canvas |
| DLW-R46 | Default shortcuts for wire, rotate, flip, duplicate, delete, palette focus, play/pause, step, undo, redo and cancel, with a reference panel (formerly 27) | The Keyboard shortcuts panel lists every default binding |
| DLW-R47 | Shortcuts can be remapped; conflicting and reserved keys are refused with the action named; the map survives a reload and can be reset (formerly 27) | Remap rotate, refuse a taken key, reload, reset |
| DLW-R48 | Light, dark, high-contrast (black background), colour-vision-safe and Junior Explorer canvas themes in which High, Low, Z and contention differ by shape or pattern as well as hue (formerly 28) | Signal colours keep 3:1 against the page in every theme |

### Export and project files

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| DLW-R49 | Structural Verilog with module header and ports, gate primitives, behavioural cells, optional per-gate delays, subcircuits flattened and memories as modules (formerly 29) | The exported module simulates in Icarus Verilog like the workstation |
| DLW-R50 | VHDL with an entity of `std_logic` ports, bus ports as vectors and an instance per part (formerly 29) | The exported entity analyses and simulates in GHDL |
| DLW-R51 | A SPICE `.cir` netlist of behavioural subcircuits and sources, warning about parts it leaves out (formerly 30) | The netlist runs in ngspice |
| DLW-R52 | A KiCad s-expression netlist with components, library parts and nets (formerly 30) | The file lists every part and net |
| DLW-R53 | An EDIF 2 0 0 netlist with a cell per kind of part, the circuit and the design (formerly 30) | Every part pin appears on exactly one net |
| DLW-R54 | The schematic exports as a vector SVG with a title block (formerly 31) | Export SVG downloads a valid `.svg` |
| DLW-R55 | A drawing-sheet SVG and a one-page vector PDF (A4, A3 or Letter) with border grid, title block, reference designators, net labels and document properties (formerly 31) | The PDF page matches the chosen paper and carries the title, designators and net names as text |
| DLW-R56 | A bill of materials as CSV and JSON maps parts to classic 74-series packages with pin tables, spare gates and counts, plus a pin-allocation CSV (formerly 32) | Five 2-input NANDs use two 7400 packages |
| DLW-R57 | Project metadata — title, author, description, version, licence (MIT, CERN-OHL-P-2.0, CC-BY-4.0, CC-BY-SA-4.0, Unlicensed) and tags — is edited in the inspector and carried into every export (formerly 33) | The Verilog header and PDF properties carry the project details |
| DLW-R58 | A 1200×630 social card (PNG and SVG) and Open Graph / X meta tags whose fields can be edited at export time; only http(s) or relative addresses are accepted (formerly 33) | The card shows the title and a schematic thumbnail; a `javascript:` address is refused |
| DLW-R59 | The project saves and opens as a single `.circuit.json` file with subcircuits and memory contents; malformed or hostile files are refused (formerly 34) | A saved project reopens identically; a wire to a missing part is refused |
| DLW-R60 | The circuit is autosaved in this browser and restored on reload; New asks for confirmation before replacing it | Reload keeps the circuit; New shows a confirmation |
| DLW-R61 | The Export dock lists every format with a description, gives each a distinct file name and shows exporter warnings | Exporting every format gives distinct file names |
| DLW-R62 | The workstation works offline after the first visit (formerly 34) | With the network off a saved project opens and simulates |

## Non-functional requirements

| ID | Requirement | Acceptance test |
| --- | --- | --- |
| DLW-R63 | No horizontal overflow from 320 px to 2560 px; on narrow viewports the palette and inspector are slide-over sheets | Page scroll width equals client width at 320, 375, 768, 1024, 1440, 1920 and 2560 px; sheets open and close at 390 px |
| DLW-R64 | No serious or critical axe violations in the workspace | Axe sweep of the route |
| DLW-R65 | Workspace follows the site-wide theme chosen in the site header (light, dark, system) and passes the colour-contrast check in dark | `E2E_THEME=dark` accessibility run passes for this route |

## Definition of done

The tool is complete when every requirement is `verified` or `prohibited`, and the completion gates in `.tasks/PROJECT_COMPLETION.md` are met.

## Technique decisions

None: no function was compared between an ML and a non-ML method.

## Intent not recorded

- DLW-R48 and DLW-R65: the canvas has its own themes beside the site-wide theme; how the two combine is not recorded.

## Change log

- 2026-10-05 — Created per `docs/DOCUMENTATION_STANDARD.md`.

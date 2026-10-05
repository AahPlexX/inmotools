---
tool: digital-logic-workstation
folder: src/tools/logic
doc: tracker
basis: as-built
status: active
spec: docs/superpowers/specs/2026-10-05-digital-logic-workstation-design.md
tracker: src/tools/logic/TRACKER.md
updated: 2026-10-05
---

# Digital Logic Workstation — tracker

## Resume here

65 requirements: 53 verified, 5 implemented, 7 partial, 0 missing, 0 prohibited. Next action: DLW-R35 truth-table sorting and DLW-R06 palette search, then the other rows in Open work. Owner question open on DLW-R48/DLW-R65 (spec, Intent not recorded).

## Documents

- Spec: [2026-10-05-digital-logic-workstation-design.md](../../../docs/superpowers/specs/2026-10-05-digital-logic-workstation-design.md)
- Older design and plan (history): [2026-09-16-digital-logic-workstation-design.md](../../../docs/superpowers/specs/2026-09-16-digital-logic-workstation-design.md), [2026-09-16-digital-logic-workstation.md](../../../docs/superpowers/plans/2026-09-16-digital-logic-workstation.md)
- Dark-theme contrast task: [T-repository-dark-contrast-20261004-b7d2](../../../.tasks/items/T-repository-dark-contrast-20261004-b7d2.md)
- Index row: [TOOL_INDEX.md](../../../docs/TOOL_INDEX.md)
- Unit tests: `tests/unit/logic-*.test.ts`; browser tests: `tests/e2e/logic.spec.ts`

## Requirement status

`unit` = `tests/unit/logic-*.test.ts`; `e2e` = `tests/e2e/logic.spec.ts` unless named.

| ID | Status | Evidence | Notes |
| --- | --- | --- | --- |
| DLW-R01 | verified | e2e "two fingers pan and pinch-zoom the canvas without moving or creating anything"; unit "keeps the drawing under the anchor fixed for every viewport and factor", "zooms by the ratio of finger distances about the midpoint" | |
| DLW-R02 | verified | e2e "a click on the lower of two closely spaced switches selects that switch, not its neighbor"; unit "prefers the component drawn on top where two bodies overlap", "follows a rotated block to where it is actually drawn" | |
| DLW-R03 | partial | e2e "Escape cancels an in-progress wire instead of silently completing it on the next click" | Dots are drawn at every waypoint (`render-engine.ts`), not only where wires join; no "Cancel route" chip on touch |
| DLW-R04 | verified | unit "rejects a wire between two input ports, which could never have a driver", "rejects a wire referencing a port that does not exist on the component", "still allows two outputs wired together for tri-state bus sharing" | |
| DLW-R05 | verified | e2e "a right-click while placing a component cancels the drop instead of also placing one", "builds a two-switch AND circuit and verifies it through the truth table and electrical rule check" | |
| DLW-R06 | partial | unit "is recognized by the type guard and appears in the palette" | Palette is grouped by category (`COMPONENT_CATEGORIES`); no search field |
| DLW-R07 | verified | unit "cycles rotation through 0/90/180/270/0", "mirrors and duplicates a component", "adds and removes a component along with its wires" | |
| DLW-R08 | verified | e2e "undo removes the last placed component"; unit "undoes and redoes a committed change", "clears future history on a new commit after an undo" | |
| DLW-R09 | verified | e2e "places a counter, configures it from the inspector, and its pins follow the settings" | |
| DLW-R10 | verified | e2e "a bus of one width cannot be wired to a bus of another, says why, and a matching pair wires and exports as a bus"; unit "refuses widths that differ, and says both widths", "formats a known value in all three radices", "shows one bus port and one tap per bit, with the bus bits hidden but simulated" | |
| DLW-R11 | verified | unit "exposes D and Q as bus ports in bus mode, hides the per-bit pins, and keeps simulating them", "captures a bus: switches -> splitter -> register D bus -> clock -> Q bus -> splitter -> LEDs" | |
| DLW-R12 | verified | e2e "groups two parts into a subcircuit, opens it by double-click, tries it on its own, and comes back out"; unit "turns the selection into one part with an input port per fed pin and an output port per driving pin", "renames, sets an icon and relabels a port", "rejects nesting deeper than the limit" | |
| DLW-R13 | verified | e2e "places an input port marker and sets it to a bus from the inspector" | |
| DLW-R14 | verified | unit "reads and writes the circuit at a path and keeps the parent intact", "works through two levels", "shows the running circuit from inside: levels under the path, markers answering to Y and A" | |
| DLW-R15 | verified | unit "evaluates AND correctly for all input combinations", "evaluates OR, NAND, NOR, XOR, XNOR correctly", "clamps variadic gate input count to the 2-8 range", "prunes wires that reference a port removed by shrinking input count", "a tri-state buffer drives when enabled" | |
| DLW-R16 | verified | unit "delays a realistic-mode gate output until its configured delay has elapsed in ticks", "shows the transient ripple states across ticks in realistic delay mode" | |
| DLW-R17 | verified | unit "reads a floating input as Z on an unconnected gate input", "detects output contention when two drivers disagree on one net" | |
| DLW-R18 | verified | unit "settles a self-feedback NOT loop to an indeterminate X in ideal mode instead of hanging" | |
| DLW-R19 | verified | unit "advances exactly one half-period on a manual forced clock step regardless of configured frequency" | |
| DLW-R20 | implemented | Run/Pause toolbar button and `togglePlay` binding in `LogicWorkspace.tsx` | No test runs continuous simulation |
| DLW-R21 | verified | unit "latches D on the rising clock edge and holds otherwise", "toggles a T flip-flop on every rising edge while T is held high", "resolves an SR latch and reports the invalid S=1,R=1 state as X", "honors an active-low asynchronous reset instead of always treating logic 1 as asserted", "flip flops" | |
| DLW-R22 | verified | unit "captures the data pins on the rising edge and holds them between edges", "only captures while enabled and clears on reset" | |
| DLW-R23 | verified | unit "crosses multiple half-periods in one step without losing cycles or drifting", "advances exactly one half-period on a manual forced clock step regardless of configured frequency" | |
| DLW-R24 | verified | unit "counts up on each rising edge and wraps to zero after the last state", "counts down and wraps from zero to the top state", "raises the terminal-count flag at the last state of the counting direction", "loads the data pins on the clock edge instead of counting, then resumes counting", "passes through the classic transient states when 0111 rolls over to 1000" | |
| DLW-R25 | verified | e2e "a ROM read through an address bus shows every stored word in the truth table"; unit "drives the addressed word onto the data pins", "writes on the rising edge while write enable is high, and not before", "reports a skipped write as a hazard until a later edge succeeds" | |
| DLW-R26 | verified | e2e "the memory editor edits words in hex, jumps to an address, imports a binary file, and exports it back byte for byte"; unit "changes only the characters that differ and keeps unprintable bytes behind a dot" | |
| DLW-R27 | verified | unit "reads the stable requested level for a bouncing push button instead of its transient first-tick bounce"; e2e "builds a two-switch AND circuit and verifies it through the truth table and electrical rule check" | |
| DLW-R28 | verified | e2e "places a multiplexed 4-digit display and exposes its polarity controls"; unit "shows each decimal digit end to end through a BCD decoder", "follows every pin on the 16-segment digit", "keeps an unselected digit showing what it last captured (persistence of vision)" | |
| DLW-R29 | verified | e2e "an RGB matrix lights the pixel where the selected row meets an asserted column, in the driven color, and keeps it", "places an RGB matrix, switches it to 16 x 16 from the inspector, and its unwired pins are named" | |
| DLW-R30 | implemented | `setLevelLineStyle` in `render-engine.ts` (weight per level, dashes for `X` and `Z`) | No test checks the line patterns |
| DLW-R31 | verified | e2e "the logic analyzer records steps, measures between two cursors, and goes full screen"; unit "reports rising and falling edges at the tick the new level first appears", "caps the defaults at the channel limit", "measures a gate delay between the input edge and the output edge in ticks and nanoseconds" | |
| DLW-R32 | verified | e2e "places an ALU, widens it from the inspector, and its unwired pins are named by the rule check"; unit "matches integer arithmetic for every 4-bit operand pair, operation, and carry in", "shifts by the low bits of B and copies the sign for an arithmetic shift" | |
| DLW-R33 | verified | e2e "builds a 2:1 multiplexer circuit and its generated truth table selects the addressed input"; unit "selects the addressed data line for every 4:1 combination", "routes D to exactly the addressed output and holds the rest at 0" | |
| DLW-R34 | verified | unit "reports the highest asserted request and a valid flag", "decodes an address to one active-high line", "inverts every line for an active-low decoder, including when disabled" | |
| DLW-R35 | partial | unit "walks every input permutation and matches the AND truth table", "refuses to generate a truth table when a sequential element is present", "makes a truth table for a subcircuit on its own: its ports are the inputs and outputs", "walks only the selected switches and LEDs when scoped, holding the rest" | The table cannot be sorted |
| DLW-R36 | verified | unit "exports the truth table as CSV with a header row", "quotes a signal label containing a comma so the exported CSV stays well-formed" | |
| DLW-R37 | verified | unit "extracts an SOP/POS expression consistent with a two-input AND gate", "marks an output unresolved rather than presenting a floating/contended value as a constant Boolean expression" | |
| DLW-R38 | verified | unit "is exactly correct and minimal for every 2- and 3-variable function", "breaks a cyclic (no-essential-prime) cover with Petrick", "splits a loop that wraps the map edge into pieces that together cover exactly its cells" | |
| DLW-R39 | verified | e2e "the K-map minimizer reduces an unminimized circuit and adds the minimized circuit to the canvas"; unit "places generated circuitry clear of everything already on the canvas", "combines more than eight terms through a tree of gates no wider than the workstation allows" | |
| DLW-R40 | verified | unit "reports one finding per unwired pin and names the component and pin", "groups wired-together undriven pins into one finding that lists them all", "flags two outputs wired to the same net as contention", "flags an unbuffered combinational loop" | |
| DLW-R41 | verified | e2e "a puzzle level starts from its own circuit, checks a wrong and a right answer, and remembers progress"; unit "reports which rows are wrong, with what the circuit showed", "accepts a different correct design than the reference" | |
| DLW-R42 | verified | unit "records a solve and keeps the best result across attempts", "drops malformed, unknown, and out-of-range saved entries instead of trusting them" | |
| DLW-R43 | verified | e2e "Junior Explorer swaps the workstation into a large, color-coded mode with one click and back with another" | |
| DLW-R44 | partial | e2e "a right-click while placing a component cancels the drop instead of also placing one" | Menu offers open subcircuit, rotate 90°, flip horizontal, duplicate and delete (`buildContextActions`); no flip vertical, change bit width or inspect net; no test opens the menu |
| DLW-R45 | implemented | `clampTooltipPosition` and touch hold readout in `LogicCanvas.tsx` | No test |
| DLW-R46 | partial | e2e "opens a keyboard shortcuts reference panel listing the functional default bindings"; unit "gives every action at least one binding and a description" | No binding starts a wire (`DEFAULT_SHORTCUTS`) |
| DLW-R47 | verified | e2e "a shortcut can be remapped, a conflicting key is refused, the choice survives a reload, and it can be reset"; unit "refuses keys that must keep their platform meaning" | |
| DLW-R48 | verified | unit "keeps signal colors distinguishable from the page (3:1 for graphics) in every theme", "keeps high and low distinguishable from each other by more than a shade", "keeps label text readable (WCAG AA, 4.5:1) on the page and on every family color" | |
| DLW-R49 | verified | e2e "exports the circuit as HDL, a PDF drawing, a social card and its meta tags from the Export dock"; unit "writes a module whose ports are the switches and LEDs, with gates as primitives", "puts propagation delays on primitives only when asked", "flattens a subcircuit and names its parts after it", "half adder" | |
| DLW-R50 | verified | unit "writes an entity with std_logic ports and an instance per part", "writes bus ports as vectors and hands a cell output vector on bit by bit" | |
| DLW-R51 | verified | unit "writes each gate as a subcircuit, the inputs as sources, and the circuit as instances", "warns about the arithmetic unit and memories", "gates of two to four inputs, an inverter and a buffer" | |
| DLW-R52 | verified | unit "writes the s-expression export with components, library parts, and nets" | |
| DLW-R53 | verified | unit "writes an EDIF 2 0 0 file: a cell per kind of part, the circuit, and the design", "joins an output port to the net it shows, and every part pin appears on exactly one net" | |
| DLW-R54 | verified | unit "renders a valid SVG document containing the title block and components"; e2e "builds a two-switch AND circuit and verifies it through the truth table and electrical rule check" | |
| DLW-R55 | verified | unit "adds a border with lettered columns and numbered rows and grows by the sheet padding", "writes one page whose size matches the chosen paper and orientation", "draws the title, the designators and the net names as text"; e2e "exports the circuit as HDL, a PDF drawing, a social card and its meta tags from the Export dock" | |
| DLW-R56 | verified | unit "puts four 2-input NANDs in one 7400 and a fifth in a second package", "writes the pin allocation as one row per signal", "writes the whole list as JSON that reads back the same" | |
| DLW-R57 | verified | unit "carries the project details into the header", "carries the author and description and strips quotes from strings" | |
| DLW-R58 | verified | unit "is 1200 x 630 and describes itself for screen readers", "write the Open Graph and X card tags, escaped", "refuses anything that could do more than point at a page"; e2e "exports the circuit as HDL, a PDF drawing, a social card and its meta tags from the Export dock" | |
| DLW-R59 | verified | unit "round-trips a document through serialize/parse", "rejects a document whose wire references a component or port that does not exist", "saves and reloads a subcircuit with its circuit, name and icon, and it still simulates", "saves and loads contents, fill and sizes with the project" | |
| DLW-R60 | implemented | `AUTOSAVE_KEY` and `handleNewProject` confirmation in `LogicWorkspace.tsx` | No test reloads to check the restore or the New confirmation |
| DLW-R61 | verified | unit "has one entry per format id, each in a known group, with words for a label and description", "gives each format its own file name, so saving several never overwrites one with another", "passes on the warnings an exporter raised" | |
| DLW-R62 | implemented | Site PWA (`vite.config.ts`) | No offline test for this route |
| DLW-R63 | partial | e2e "collapses the palette and inspector into slide-over sheets on a narrow viewport" | Sheets tested at 390 px; overflow is not measured at any width |
| DLW-R64 | verified | e2e (`tests/e2e/accessibility.spec.ts`) "has no serious or critical axe violations at <route>" | |
| DLW-R65 | partial | `.tasks/items/T-repository-dark-contrast-20261004-b7d2.md` | Site theme selector exists; the workspace fails `color-contrast` in dark |

## Open work

1. DLW-R35 sortable truth table; DLW-R06 palette search.
2. DLW-R44 flip vertical, change bit width and inspect net in the context and radial menus; DLW-R46 wire shortcut.
3. DLW-R03 joint dots only at junctions and the touch "Cancel route" chip.
4. DLW-R65 dark-theme contrast; DLW-R63 overflow checks from 320 to 2560 px.
5. Tests for DLW-R20, DLW-R30, DLW-R45, DLW-R60 and DLW-R62.

## Known limitations

- Digital levels only; no analog or transient simulation.
- 74-series parts without a pin table are matched by part number only (pinouts not verified).
- The HDL, SPICE toolchain tests are skipped where Icarus Verilog, GHDL or ngspice are not installed.

## Verification evidence

- 2026-10-05, `expand/digital-logic-workstation` from `main` @ `5fb22493`: `pnpm tool:check digital-logic-workstation --base origin/main` 53/65, no errors; `pnpm docs:sync` and `pnpm docs:check` passed; `pnpm exec vitest run tests/unit/cad-progress.test.ts tests/unit/sheets-wave-b.test.ts tests/unit/deployment-config.test.ts` 23 passed.

## Change log

- 2026-10-05 — Created per `docs/DOCUMENTATION_STANDARD.md`.

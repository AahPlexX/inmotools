import type { ToolMeta } from '../../tool-meta';

export default {
  slug: "digital-logic-workstation",
  category: "engineering",
  shortTitle: "Digital Logic Workstation",
  title: "Digital Logic Workstation — Circuit Simulator, Schematic Capture & Prototyping Bench",
  audience: "Kids and learners · hobbyists · computer-science students · electrical engineers · hardware architects · embedded-systems developers",
  summary: "Draft digital logic schematics on an infinite canvas, wire gates, flip-flops, switches, clocks, and probes, run an event-driven simulator with ideal or realistic propagation delay, build with buses, an ALU, RAM and ROM, and reusable subcircuits, and generate truth tables, Boolean expressions, Karnaugh-map minimizations, and electrical-rule-check results.",
  privacy: "Circuits, simulation state, and saved projects stay in this browser. Nothing is uploaded, and exports are generated on this device.",
  accepts: "Placed components and wires, or a local .circuit.json project bundle",
  outputs: "Interactive simulation, sortable truth tables, SOP/POS Boolean expressions, SVG and PDF schematics, Verilog, VHDL, SPICE, KiCad and EDIF netlists, a 74-series bill of materials, a social preview card, and a portable .circuit.json project bundle",
  steps: [
    "Drag gates, switches, clocks, and LEDs onto the canvas and wire them with orthogonal routing.",
    "Run the simulator, single-step the clock, and probe any node for its logic level.",
    "Generate a truth table and Boolean expression for a subcircuit, then open Export to write the schematic, netlists, or parts list.",
  ],
  hint: "Right-click (or long-press on touch) any component for rotate, flip, duplicate, and delete. Ideal delay mode is easiest to learn on; switch to realistic propagation delay to see glitches and race conditions.",
  load: () => import('./LogicWorkspace'),
} satisfies ToolMeta;

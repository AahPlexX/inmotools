/**
 * Classic 74-series logic ICs that stand in for the workstation's gates and
 * flip-flops, with the pin each gate input and output lands on.
 *
 * Every pin table here was read from the manufacturer's datasheet on
 * 2026-09-29 (the source is named on each entry). Two entries differ from the
 * common "quad 2-input" layout on purpose, because their datasheets do: the
 * 7400 puts gate 3's inputs on pins 10 and 9 and gate 4's on 13 and 12, and
 * the 7427 swaps inputs B and C of gate 3.
 *
 * Only parts whose pinout was verified are listed with pins. Blocks such as
 * multiplexers and counters are matched to a part number in `bom-engine.ts`
 * without a pin table.
 */

export type GateFunction = 'AND' | 'OR' | 'NAND' | 'NOR' | 'XOR' | 'NOT' | 'BUFFER';

export interface IcUnit {
  /** The pin of each input, in the order of the workstation's pins (A, B, C...); a buffer's enable is last. */
  readonly inputs: readonly number[];
  readonly output: number;
}

export interface GateIc {
  readonly part: string;
  readonly description: string;
  readonly function: GateFunction;
  /** How many inputs each gate has. */
  readonly inputs: number;
  readonly pins: 14;
  readonly vcc: 14;
  readonly gnd: 7;
  readonly units: readonly IcUnit[];
  /** Pins with no connection inside. */
  readonly noConnect: readonly number[];
  readonly source: string;
  readonly notes: readonly string[];
}

const QUAD_2_INPUT = (part: string, description: string, gate: GateFunction, source: string): GateIc => ({
  part,
  description,
  function: gate,
  inputs: 2,
  pins: 14,
  vcc: 14,
  gnd: 7,
  units: [
    { inputs: [1, 2], output: 3 },
    { inputs: [4, 5], output: 6 },
    { inputs: [9, 10], output: 8 },
    { inputs: [12, 13], output: 11 },
  ],
  noConnect: [],
  source,
  notes: [],
});

export const GATE_ICS: readonly GateIc[] = [
  {
    part: '7400',
    description: 'Quad 2-input NAND',
    function: 'NAND',
    inputs: 2,
    pins: 14,
    vcc: 14,
    gnd: 7,
    units: [{ inputs: [1, 2], output: 3 }, { inputs: [4, 5], output: 6 }, { inputs: [10, 9], output: 8 }, { inputs: [13, 12], output: 11 }],
    noConnect: [],
    source: 'TI SN7400 / SN74LS00 datasheet SDLS025D, pin configuration',
    notes: [],
  },
  {
    part: '7402',
    description: 'Quad 2-input NOR',
    function: 'NOR',
    inputs: 2,
    pins: 14,
    vcc: 14,
    gnd: 7,
    // Outputs come first on this part: 1Y is pin 1, then 1A and 1B.
    units: [{ inputs: [2, 3], output: 1 }, { inputs: [5, 6], output: 4 }, { inputs: [8, 9], output: 10 }, { inputs: [11, 12], output: 13 }],
    noConnect: [],
    source: 'TI SN7402 / SN74LS02 datasheet, pin configuration',
    notes: [],
  },
  {
    part: '7404',
    description: 'Hex inverter',
    function: 'NOT',
    inputs: 1,
    pins: 14,
    vcc: 14,
    gnd: 7,
    units: [{ inputs: [1], output: 2 }, { inputs: [3], output: 4 }, { inputs: [5], output: 6 }, { inputs: [9], output: 8 }, { inputs: [11], output: 10 }, { inputs: [13], output: 12 }],
    noConnect: [],
    source: 'TI SN7404 / SN74LS04 datasheet, pin configuration',
    notes: [],
  },
  QUAD_2_INPUT('7408', 'Quad 2-input AND', 'AND', 'TI SN74HC08 datasheet and Nexperia 74HC08 datasheet, pin description'),
  QUAD_2_INPUT('7432', 'Quad 2-input OR', 'OR', 'Nexperia 74HC32 datasheet, pin description'),
  QUAD_2_INPUT('7486', 'Quad 2-input exclusive-OR', 'XOR', 'TI SN74HC86 datasheet, pin functions'),
  {
    part: '7410',
    description: 'Triple 3-input NAND',
    function: 'NAND',
    inputs: 3,
    pins: 14,
    vcc: 14,
    gnd: 7,
    units: [{ inputs: [1, 2, 13], output: 12 }, { inputs: [3, 4, 5], output: 6 }, { inputs: [9, 10, 11], output: 8 }],
    noConnect: [],
    source: 'TI SN74HC10 datasheet, pin functions',
    notes: [],
  },
  {
    part: '7411',
    description: 'Triple 3-input AND',
    function: 'AND',
    inputs: 3,
    pins: 14,
    vcc: 14,
    gnd: 7,
    units: [{ inputs: [1, 2, 13], output: 12 }, { inputs: [3, 4, 5], output: 6 }, { inputs: [9, 10, 11], output: 8 }],
    noConnect: [],
    source: 'TI SN74HC11 datasheet, pin functions',
    notes: [],
  },
  {
    part: '7427',
    description: 'Triple 3-input NOR',
    function: 'NOR',
    inputs: 3,
    pins: 14,
    vcc: 14,
    gnd: 7,
    units: [{ inputs: [1, 2, 13], output: 12 }, { inputs: [3, 4, 5], output: 6 }, { inputs: [9, 11, 10], output: 8 }],
    noConnect: [],
    source: 'TI SN74LS27 datasheet, pin configuration',
    notes: [],
  },
  {
    part: '7420',
    description: 'Dual 4-input NAND',
    function: 'NAND',
    inputs: 4,
    pins: 14,
    vcc: 14,
    gnd: 7,
    units: [{ inputs: [1, 2, 4, 5], output: 6 }, { inputs: [9, 10, 12, 13], output: 8 }],
    noConnect: [3, 11],
    source: 'TI SN74HC20 datasheet, pin functions',
    notes: [],
  },
  {
    part: '7421',
    description: 'Dual 4-input AND',
    function: 'AND',
    inputs: 4,
    pins: 14,
    vcc: 14,
    gnd: 7,
    units: [{ inputs: [1, 2, 4, 5], output: 6 }, { inputs: [9, 10, 12, 13], output: 8 }],
    noConnect: [3, 11],
    source: 'TI SN74LS21 datasheet, pin configuration',
    notes: [],
  },
  {
    part: '7430',
    description: '8-input NAND',
    function: 'NAND',
    inputs: 8,
    pins: 14,
    vcc: 14,
    gnd: 7,
    units: [{ inputs: [1, 2, 3, 4, 5, 6, 11, 12], output: 8 }],
    noConnect: [9, 10, 13],
    source: 'TI SN74LS30 datasheet, pin configuration',
    notes: [],
  },
  {
    part: '74125',
    description: 'Quad bus buffer with active-low output enable',
    function: 'BUFFER',
    inputs: 1,
    pins: 14,
    vcc: 14,
    gnd: 7,
    // The last input is the output enable, which is active low (a buffer that always drives ties it to ground).
    units: [{ inputs: [2, 1], output: 3 }, { inputs: [5, 4], output: 6 }, { inputs: [9, 10], output: 8 }, { inputs: [12, 13], output: 11 }],
    noConnect: [],
    source: 'TI SN74HC125 datasheet, pin functions',
    notes: ['Output enable (pins 1, 4, 10, 13) is active low: tie it to ground for an always-driving buffer.'],
  },
];

export interface FlipFlopIc {
  readonly part: string;
  readonly description: string;
  readonly pins: 14;
  readonly vcc: 14;
  readonly gnd: 7;
  readonly units: readonly {
    readonly d: number;
    readonly clock: number;
    /** Asynchronous preset (sets Q), active low. */
    readonly preset: number;
    /** Asynchronous clear (resets Q), active low. */
    readonly clear: number;
    readonly q: number;
    readonly qn: number;
  }[];
  readonly source: string;
  readonly notes: readonly string[];
}

export const D_FLIP_FLOP_IC: FlipFlopIc = {
  part: '7474',
  description: 'Dual D-type positive-edge-triggered flip-flop with preset and clear',
  pins: 14,
  vcc: 14,
  gnd: 7,
  units: [
    { d: 2, clock: 3, preset: 4, clear: 1, q: 5, qn: 6 },
    { d: 12, clock: 11, preset: 10, clear: 13, q: 9, qn: 8 },
  ],
  source: 'TI SN74HC74 datasheet, pin functions',
  notes: ['Preset and clear are active low and the clock is rising-edge triggered. The workstation\'s SET and RST are active high by default and its edge can be either: add an inverter where they differ.'],
};

export const findGateIc = (gate: GateFunction, inputs: number): GateIc | undefined => GATE_ICS.find((ic) => ic.function === gate && ic.inputs === inputs);

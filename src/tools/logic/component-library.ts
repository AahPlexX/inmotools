import { blockPorts, defaultSelectBits, isBlockType, type BlockType } from './block-engine';
import { busLabel, clampBusWidth } from './bus-engine';
import { displayPorts, type DisplayType } from './display-engine';
import { isRegisterType, registerPorts, type RegisterType } from './register-engine';
import type { ComponentParams, ComponentType, PortDefinition } from './logic-types';

export type ComponentCategory = 'gate' | 'io' | 'sequential' | 'combinational' | 'register' | 'display' | 'bus';

export interface ComponentDefinition {
  readonly type: ComponentType;
  readonly label: string;
  readonly category: ComponentCategory;
  readonly defaultParams: ComponentParams;
  readonly minInputs?: number;
  readonly maxInputs?: number;
  readonly ports: (params: ComponentParams) => readonly PortDefinition[];
}

const inputLetter = (index: number): string => String.fromCharCode(65 + index);

/**
 * The renderer (Canvas2D and SVG alike) draws every gate body `Math.max(2,
 * inputCount)` grid rows tall and always places the shape's single output
 * tip at the vertical center of that body (`height / 2`), regardless of
 * family. Output/single-input port y-offsets below are derived from that
 * same `bodyRows / 2` center so the clickable/wired port position always
 * lands exactly on the drawn tip instead of drifting off it.
 */
const gateBodyRows = (inputCount: number): number => Math.max(2, inputCount);

const variadicGatePorts = (params: ComponentParams): PortDefinition[] => {
  const count = clampInputCount(params.inputCount);
  const inputs: PortDefinition[] = Array.from({ length: count }, (_, index) => ({
    id: inputLetter(index),
    direction: 'input',
    label: inputLetter(index),
    x: 0,
    y: index,
  }));
  return [...inputs, { id: 'Y', direction: 'output', label: 'Y', x: 2, y: gateBodyRows(count) / 2 }];
};

export const clampInputCount = (value: unknown): number => {
  // An imported project can carry any JSON value here; a non-finite number
  // must fall back to the default instead of collapsing the pin count to 0.
  const raw = typeof value === 'number' && Number.isFinite(value) ? value : 2;
  return Math.min(8, Math.max(2, Math.round(raw)));
};

const singleInputGatePorts = (): PortDefinition[] => {
  const center = gateBodyRows(1) / 2;
  return [
    { id: 'A', direction: 'input', label: 'A', x: 0, y: center },
    { id: 'Y', direction: 'output', label: 'Y', x: 2, y: center },
  ];
};

const triBufferPorts = (): PortDefinition[] => [
  { id: 'A', direction: 'input', label: 'A', x: 0, y: 0 },
  { id: 'EN', direction: 'input', label: 'EN', x: 1, y: 1 },
  { id: 'Y', direction: 'output', label: 'Y', x: 2, y: gateBodyRows(2) / 2 },
];

const sourcePorts = (): PortDefinition[] => [{ id: 'Y', direction: 'output', label: 'Y', x: 1, y: 0 }];

const sinkPorts = (): PortDefinition[] => [{ id: 'A', direction: 'input', label: 'A', x: 0, y: 0 }];

const flipFlopPorts = (clockLabel: string, dataInputs: string[]): PortDefinition[] => [
  ...dataInputs.map((id, index) => ({ id, direction: 'input' as const, label: id, x: 0, y: index })),
  { id: clockLabel, direction: 'input', label: 'CLK', x: 0, y: dataInputs.length },
  { id: 'SET', direction: 'input', label: 'SET', x: 0, y: dataInputs.length + 1 },
  { id: 'RST', direction: 'input', label: 'RST', x: 0, y: dataInputs.length + 2 },
  { id: 'Q', direction: 'output', label: 'Q', x: 2, y: 0 },
  { id: 'QN', direction: 'output', label: 'QN', x: 2, y: 1 },
];

/**
 * A bus splitter joins one bus to its single bits: bit `i` of the bus port `B` and the tap `Si` are the same
 * net. Every pin is passive, so the part works in either direction: drive the taps to gather a bus, or drive
 * the bus to fan it out. The bus's own bits are hidden pins the netlist ties to the taps.
 */
const splitterPorts = (params: ComponentParams): PortDefinition[] => {
  const width = clampBusWidth(params.busWidth);
  const busBits = Array.from({ length: width }, (_, index) => `B${index}`);
  const busY = Math.floor((width - 1) / 2);
  return [
    { id: 'B', direction: 'passive', label: busLabel('B', width), x: 0, y: busY, bus: { bits: busBits } },
    ...Array.from({ length: width }, (_, index): PortDefinition => ({ id: `S${index}`, direction: 'passive', label: `S${index}`, x: 3, y: index })),
    ...busBits.map((id, index): PortDefinition => ({ id, direction: 'passive', label: id, x: 0, y: busY, hidden: true, alias: `S${index}` })),
  ];
};

const blockDefinition = (type: BlockType, label: string, extra: ComponentParams = {}): ComponentDefinition => ({
  type,
  label,
  category: 'combinational',
  defaultParams: { selectBits: defaultSelectBits(type), delayNs: 10, ...extra },
  ports: (params) => blockPorts(type, params),
});

const registerDefinition = (type: RegisterType, label: string, extra: ComponentParams = {}): ComponentDefinition => ({
  type,
  label,
  category: 'register',
  defaultParams: { bitWidth: 4, edge: 'rising', activeHigh: true, ...extra },
  ports: (params) => registerPorts(type, params),
});

const displayDefinition = (type: DisplayType, label: string): ComponentDefinition => ({
  type,
  label,
  category: 'display',
  defaultParams: { activeHigh: true, ...(type === 'SEVEN_SEGMENT_4' ? { digitActiveHigh: true } : {}) },
  ports: () => displayPorts(type),
});

export const COMPONENT_LIBRARY: Readonly<Record<ComponentType, ComponentDefinition>> = {
  AND: { type: 'AND', label: 'AND', category: 'gate', defaultParams: { inputCount: 2, delayNs: 5 }, minInputs: 2, maxInputs: 8, ports: variadicGatePorts },
  OR: { type: 'OR', label: 'OR', category: 'gate', defaultParams: { inputCount: 2, delayNs: 5 }, minInputs: 2, maxInputs: 8, ports: variadicGatePorts },
  NAND: { type: 'NAND', label: 'NAND', category: 'gate', defaultParams: { inputCount: 2, delayNs: 5 }, minInputs: 2, maxInputs: 8, ports: variadicGatePorts },
  NOR: { type: 'NOR', label: 'NOR', category: 'gate', defaultParams: { inputCount: 2, delayNs: 5 }, minInputs: 2, maxInputs: 8, ports: variadicGatePorts },
  XOR: { type: 'XOR', label: 'XOR', category: 'gate', defaultParams: { inputCount: 2, delayNs: 5 }, minInputs: 2, maxInputs: 8, ports: variadicGatePorts },
  XNOR: { type: 'XNOR', label: 'XNOR', category: 'gate', defaultParams: { inputCount: 2, delayNs: 5 }, minInputs: 2, maxInputs: 8, ports: variadicGatePorts },
  NOT: { type: 'NOT', label: 'NOT', category: 'gate', defaultParams: { delayNs: 3 }, ports: singleInputGatePorts },
  BUFFER: { type: 'BUFFER', label: 'BUFFER', category: 'gate', defaultParams: { delayNs: 2 }, ports: singleInputGatePorts },
  TRI_BUFFER: { type: 'TRI_BUFFER', label: 'TRI-STATE BUFFER', category: 'gate', defaultParams: { delayNs: 2 }, ports: triBufferPorts },
  SWITCH: { type: 'SWITCH', label: 'Toggle switch', category: 'io', defaultParams: { initialLevel: 0 }, ports: sourcePorts },
  PUSH_BUTTON: { type: 'PUSH_BUTTON', label: 'Push button', category: 'io', defaultParams: { initialLevel: 0, bounce: false }, ports: sourcePorts },
  CLOCK: { type: 'CLOCK', label: 'Clock source', category: 'io', defaultParams: { frequencyHz: 1 }, ports: sourcePorts },
  LED: { type: 'LED', label: 'LED', category: 'io', defaultParams: {}, ports: sinkPorts },
  PROBE: { type: 'PROBE', label: 'Logic probe', category: 'io', defaultParams: {}, ports: sinkPorts },
  D_FLIP_FLOP: { type: 'D_FLIP_FLOP', label: 'D flip-flop', category: 'sequential', defaultParams: { edge: 'rising', activeHigh: true }, ports: () => flipFlopPorts('CLK', ['D']) },
  JK_FLIP_FLOP: { type: 'JK_FLIP_FLOP', label: 'JK flip-flop', category: 'sequential', defaultParams: { edge: 'rising', activeHigh: true }, ports: () => flipFlopPorts('CLK', ['J', 'K']) },
  T_FLIP_FLOP: { type: 'T_FLIP_FLOP', label: 'T flip-flop', category: 'sequential', defaultParams: { edge: 'rising', activeHigh: true }, ports: () => flipFlopPorts('CLK', ['T']) },
  SR_LATCH: {
    type: 'SR_LATCH',
    label: 'SR latch',
    category: 'sequential',
    defaultParams: { activeHigh: true },
    ports: () => [
      { id: 'S', direction: 'input', label: 'S', x: 0, y: 0 },
      { id: 'R', direction: 'input', label: 'R', x: 0, y: 1 },
      { id: 'Q', direction: 'output', label: 'Q', x: 2, y: 0 },
      { id: 'QN', direction: 'output', label: 'QN', x: 2, y: 1 },
    ],
  },
  MUX: blockDefinition('MUX', 'Multiplexer'),
  DEMUX: blockDefinition('DEMUX', 'Demultiplexer'),
  DECODER: blockDefinition('DECODER', 'Binary decoder', { activeHigh: true }),
  PRIORITY_ENCODER: blockDefinition('PRIORITY_ENCODER', 'Priority encoder'),
  BCD_7SEG: blockDefinition('BCD_7SEG', 'BCD to 7-segment decoder', { activeHigh: true }),
  COUNTER: registerDefinition('COUNTER', 'Binary counter'),
  REGISTER: registerDefinition('REGISTER', 'Register'),
  SEVEN_SEGMENT: displayDefinition('SEVEN_SEGMENT', '7-segment display'),
  SEVEN_SEGMENT_4: displayDefinition('SEVEN_SEGMENT_4', 'Multiplexed 4-digit display'),
  SIXTEEN_SEGMENT: displayDefinition('SIXTEEN_SEGMENT', '16-segment display'),
  BUS_SPLITTER: { type: 'BUS_SPLITTER', label: 'Bus splitter', category: 'bus', defaultParams: { busWidth: 4 }, ports: splitterPorts },
};

/**
 * The pins a person can see and wire: every pin that is not hidden, plus bus ports. This is what the renderers,
 * hit-testing, and the wiring rules work with.
 */
export const getComponentPorts = (type: ComponentType, params: ComponentParams): readonly PortDefinition[] =>
  COMPONENT_LIBRARY[type].ports(params).filter((port) => port.hidden !== true);

/**
 * The single pins the simulator drives and reads: every pin except bus ports, which are only handles that stand
 * for a group of these. Hidden pins are included.
 */
export const getSimulationPorts = (type: ComponentType, params: ComponentParams): readonly PortDefinition[] =>
  COMPONENT_LIBRARY[type].ports(params).filter((port) => port.bus === undefined);

export const isVariadicGate = (type: ComponentType): boolean =>
  type === 'AND' || type === 'OR' || type === 'NAND' || type === 'NOR' || type === 'XOR' || type === 'XNOR';

export const isSequential = (type: ComponentType): boolean =>
  type === 'D_FLIP_FLOP' || type === 'JK_FLIP_FLOP' || type === 'T_FLIP_FLOP' || type === 'SR_LATCH';

/** Every part that holds state between clock edges: flip-flops, latches, counters, and registers. */
export const isStatefulPart = (type: ComponentType): boolean => isSequential(type) || isRegisterType(type);

/** Gates and multi-pin blocks: every part whose outputs are a pure function of its current inputs. */
export const isCombinationalLogic = (type: ComponentType): boolean =>
  isVariadicGate(type) || type === 'NOT' || type === 'BUFFER' || type === 'TRI_BUFFER' || isBlockType(type);

export const COMPONENT_CATEGORIES: readonly { readonly category: ComponentCategory; readonly label: string; readonly types: readonly ComponentType[] }[] = [
  { category: 'gate', label: 'Logic gates', types: ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR', 'BUFFER', 'TRI_BUFFER'] },
  { category: 'combinational', label: 'Multiplexers & decoders', types: ['MUX', 'DEMUX', 'DECODER', 'PRIORITY_ENCODER', 'BCD_7SEG'] },
  { category: 'sequential', label: 'Flip-flops & latches', types: ['D_FLIP_FLOP', 'JK_FLIP_FLOP', 'T_FLIP_FLOP', 'SR_LATCH'] },
  { category: 'register', label: 'Counters & registers', types: ['COUNTER', 'REGISTER'] },
  { category: 'bus', label: 'Buses', types: ['BUS_SPLITTER'] },
  { category: 'display', label: 'Segment displays', types: ['SEVEN_SEGMENT', 'SEVEN_SEGMENT_4', 'SIXTEEN_SEGMENT'] },
  { category: 'io', label: 'Input, output & probes', types: ['SWITCH', 'PUSH_BUTTON', 'CLOCK', 'LED', 'PROBE'] },
];

const PALETTE_LABELS: Readonly<Partial<Record<ComponentType, string>>> = {
  BCD_7SEG: 'BCD TO 7-SEG',
  SEVEN_SEGMENT: '7-SEGMENT',
  SEVEN_SEGMENT_4: '4-DIGIT 7-SEG',
  SIXTEEN_SEGMENT: '16-SEGMENT',
  BUS_SPLITTER: 'BUS SPLITTER',
};

/** The name shown on a palette button, in the inspector heading, and in placement hints. */
export const paletteLabel = (type: ComponentType): string => PALETTE_LABELS[type] ?? type.replace(/_/g, ' ');

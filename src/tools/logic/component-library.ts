import type { ComponentParams, ComponentType, PortDefinition } from './logic-types';

export type ComponentCategory = 'gate' | 'io' | 'sequential';

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

const variadicGatePorts = (params: ComponentParams): PortDefinition[] => {
  const count = clampInputCount(params.inputCount);
  const inputs: PortDefinition[] = Array.from({ length: count }, (_, index) => ({
    id: inputLetter(index),
    direction: 'input',
    label: inputLetter(index),
    x: 0,
    y: index,
  }));
  return [...inputs, { id: 'Y', direction: 'output', label: 'Y', x: 2, y: (count - 1) / 2 }];
};

export const clampInputCount = (value: number | undefined): number => {
  const raw = value ?? 2;
  return Math.min(8, Math.max(2, Math.round(raw)));
};

const singleInputGatePorts = (): PortDefinition[] => [
  { id: 'A', direction: 'input', label: 'A', x: 0, y: 0 },
  { id: 'Y', direction: 'output', label: 'Y', x: 2, y: 0 },
];

const triBufferPorts = (): PortDefinition[] => [
  { id: 'A', direction: 'input', label: 'A', x: 0, y: 0 },
  { id: 'EN', direction: 'input', label: 'EN', x: 1, y: 1 },
  { id: 'Y', direction: 'output', label: 'Y', x: 2, y: 0 },
];

const sourcePorts = (): PortDefinition[] => [{ id: 'Y', direction: 'output', label: 'Y', x: 1, y: 0 }];

const sinkPorts = (): PortDefinition[] => [{ id: 'A', direction: 'input', label: 'A', x: 0, y: 0 }];

const flipFlopPorts = (clockLabel: string, dataInputs: string[]): PortDefinition[] => [
  ...dataInputs.map((id, index) => ({ id, direction: 'input' as const, label: id, x: 0, y: index })),
  { id: clockLabel, direction: 'input', label: 'CLK', x: 0, y: dataInputs.length },
  { id: 'SET', direction: 'input', label: 'SET', x: 0, y: dataInputs.length + 1 },
  { id: 'RST', direction: 'input', label: 'RST', x: 0, y: dataInputs.length + 2 },
  { id: 'Q', direction: 'output', label: 'Q', x: 2, y: 0 },
  { id: 'QN', direction: 'output', label: 'Q̄', x: 2, y: 1 },
];

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
      { id: 'QN', direction: 'output', label: 'Q̄', x: 2, y: 1 },
    ],
  },
};

export const getComponentPorts = (type: ComponentType, params: ComponentParams): readonly PortDefinition[] =>
  COMPONENT_LIBRARY[type].ports(params);

export const isVariadicGate = (type: ComponentType): boolean =>
  type === 'AND' || type === 'OR' || type === 'NAND' || type === 'NOR' || type === 'XOR' || type === 'XNOR';

export const isSequential = (type: ComponentType): boolean =>
  type === 'D_FLIP_FLOP' || type === 'JK_FLIP_FLOP' || type === 'T_FLIP_FLOP' || type === 'SR_LATCH';

export const isCombinationalGate = (type: ComponentType): boolean =>
  isVariadicGate(type) || type === 'NOT' || type === 'BUFFER' || type === 'TRI_BUFFER';

export const COMPONENT_CATEGORIES: readonly { readonly category: ComponentCategory; readonly label: string; readonly types: readonly ComponentType[] }[] = [
  { category: 'gate', label: 'Logic gates', types: ['AND', 'OR', 'NOT', 'NAND', 'NOR', 'XOR', 'XNOR', 'BUFFER', 'TRI_BUFFER'] },
  { category: 'sequential', label: 'Flip-flops & latches', types: ['D_FLIP_FLOP', 'JK_FLIP_FLOP', 'T_FLIP_FLOP', 'SR_LATCH'] },
  { category: 'io', label: 'Input, output & probes', types: ['SWITCH', 'PUSH_BUTTON', 'CLOCK', 'LED', 'PROBE'] },
];

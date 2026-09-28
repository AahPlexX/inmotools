import { GRID_SIZE } from './geometry';
import type { ComponentType } from './logic-types';

/** Shared shape constants so the Canvas2D renderer and the SVG exporter draw identical gate bodies. */
export const GATE_WIDTH = GRID_SIZE * 2;
export const BUBBLE_RADIUS = 4;

export const gateBodyHeight = (inputCount: number): number => Math.max(2, inputCount) * GRID_SIZE;

export type GateFamily = 'and' | 'or' | 'xor' | 'triangle' | 'tri-state';

export const gateFamilyOf = (type: ComponentType): GateFamily => {
  if (type === 'AND' || type === 'NAND') return 'and';
  if (type === 'OR' || type === 'NOR') return 'or';
  if (type === 'XOR' || type === 'XNOR') return 'xor';
  if (type === 'TRI_BUFFER') return 'tri-state';
  return 'triangle';
};

export const hasOutputBubble = (type: ComponentType): boolean =>
  type === 'NAND' || type === 'NOR' || type === 'XNOR' || type === 'NOT';

export const GATE_ABBREVIATION: Readonly<Record<ComponentType, string>> = {
  AND: 'AND', OR: 'OR', NOT: '1', NAND: 'NAND', NOR: 'NOR', XOR: 'XOR', XNOR: 'XNOR',
  BUFFER: '1', TRI_BUFFER: '1', SWITCH: 'SW', PUSH_BUTTON: 'PB', CLOCK: 'CLK', LED: 'LED',
  PROBE: 'PRB', D_FLIP_FLOP: 'D', JK_FLIP_FLOP: 'JK', T_FLIP_FLOP: 'T', SR_LATCH: 'SR',
};

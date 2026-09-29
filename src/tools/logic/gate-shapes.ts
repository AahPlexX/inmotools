import { BLOCK_WIDTH_COLS, blockTitle, isBlockType } from './block-engine';
import { isSequential } from './component-library';
import { GRID_SIZE, componentOriginPixels, rotatePoint, type Point } from './geometry';
import type { ComponentInstance, ComponentType, PortDefinition } from './logic-types';

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
  MUX: 'MUX', DEMUX: 'DEMUX', DECODER: 'DEC', PRIORITY_ENCODER: 'ENC',
};

/** A rectangle in a component's local (pre-rotation, pre-mirror) pixel space. */
export interface BodyRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * The drawn box of a multi-pin block. Its height comes from the pin layout
 * (the lowest pin row plus one) rather than a separate constant, so the box
 * always encloses every pin in both the Canvas2D and SVG renderers.
 */
export const blockBodyRect = (ports: readonly PortDefinition[]): BodyRect => {
  const rows = ports.reduce((max, port) => Math.max(max, port.y + 1), 1);
  return { x: 0, y: -GRID_SIZE * 0.5, width: BLOCK_WIDTH_COLS * GRID_SIZE, height: rows * GRID_SIZE };
};

/** The centered caption drawn inside a block body, such as `MUX 4:1`. */
export const blockCaption = (component: ComponentInstance): string =>
  isBlockType(component.type) ? blockTitle(component.type, component.params) : GATE_ABBREVIATION[component.type];

/**
 * Where a component's body is drawn, in local pixels. Used to size the
 * selection outline so it hugs the drawn shape for every component family
 * (gate bodies hang below their origin row, I/O parts are centered on it).
 */
export const componentBodyRect = (component: ComponentInstance, ports: readonly PortDefinition[]): BodyRect => {
  if (isBlockType(component.type)) return blockBodyRect(ports);
  const inputCount = ports.filter((port) => port.direction === 'input').length;
  const height = gateBodyHeight(inputCount);
  if (isSequential(component.type)) return { x: 0, y: -GRID_SIZE * 0.5, width: GATE_WIDTH, height: height + GRID_SIZE };
  const isIo = component.type === 'SWITCH' || component.type === 'PUSH_BUTTON' || component.type === 'CLOCK' || component.type === 'LED' || component.type === 'PROBE';
  if (isIo) return { x: -GRID_SIZE * 0.2, y: -GRID_SIZE * 0.7, width: GRID_SIZE * 1.6, height: GRID_SIZE * 1.4 };
  return { x: 0, y: 0, width: GATE_WIDTH + BUBBLE_RADIUS * 2, height };
};

/**
 * Where a component's instance label is centered, in world pixels: just below
 * the lowest edge of the body as it actually appears on screen. The local body
 * corners go through the same mirror-then-rotate transform the renderers apply,
 * so a rotated or mirrored part keeps its label beside the drawn body instead
 * of under the pre-rotation rectangle.
 */
export const componentLabelAnchor = (component: ComponentInstance, ports: readonly PortDefinition[]): Point => {
  const body = componentBodyRect(component, ports);
  const origin = componentOriginPixels(component);
  const corners: Point[] = [
    { x: body.x, y: body.y },
    { x: body.x + body.width, y: body.y },
    { x: body.x, y: body.y + body.height },
    { x: body.x + body.width, y: body.y + body.height },
  ].map((corner) => rotatePoint(component.mirrored ? { x: -corner.x, y: corner.y } : corner, component.rotation));
  const xs = corners.map((corner) => corner.x);
  const maxY = Math.max(...corners.map((corner) => corner.y));
  return { x: origin.x + (Math.min(...xs) + Math.max(...xs)) / 2, y: origin.y + maxY + 14 };
};

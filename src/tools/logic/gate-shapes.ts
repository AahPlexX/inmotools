import { ALU_WIDTH_COLS, aluTitle } from './alu-engine';
import { BLOCK_WIDTH_COLS, blockTitle, isBlockType } from './block-engine';
import { getComponentPorts, isSequential } from './component-library';
import { clampBusWidth } from './bus-engine';
import { displayTitle, displayWidthCols, isDisplayType } from './display-engine';
import { isMatrixType, matrixTitle, matrixSizeOf, matrixWidthCols } from './matrix-engine';
import { isMemoryType, MEMORY_WIDTH_COLS, memoryTitle } from './memory-engine';
import { isRegisterType, registerTitle } from './register-engine';
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
  MUX: 'MUX', DEMUX: 'DEMUX', DECODER: 'DEC', PRIORITY_ENCODER: 'ENC', BCD_7SEG: 'BCD', COUNTER: 'CTR', REGISTER: 'REG',
  SEVEN_SEGMENT: '7SEG', SEVEN_SEGMENT_4: '4x7', SIXTEEN_SEGMENT: '16SEG', BUS_SPLITTER: 'BUS', ALU: 'ALU', RAM: 'RAM', ROM: 'ROM', RGB_MATRIX: 'RGB',
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
export const blockBodyRect = (ports: readonly PortDefinition[], widthCols: number = BLOCK_WIDTH_COLS): BodyRect => {
  const rows = ports.reduce((max, port) => Math.max(max, port.y + 1), 1);
  return { x: 0, y: -GRID_SIZE * 0.5, width: widthCols * GRID_SIZE, height: rows * GRID_SIZE };
};

/** The centered caption drawn inside a block body, such as `MUX 4:1`. */
export const blockCaption = (component: ComponentInstance): string => {
  if (isBlockType(component.type)) return blockTitle(component.type, component.params);
  if (isRegisterType(component.type)) return registerTitle(component.type, component.params);
  if (isDisplayType(component.type)) return displayTitle(component.type);
  if (component.type === 'ALU') return aluTitle(component.params);
  if (isMatrixType(component.type)) return matrixTitle(component.params);
  if (isMemoryType(component.type)) return memoryTitle(component.type, component.params);
  if (component.type === 'BUS_SPLITTER') return `SPLIT ${clampBusWidth(component.params.busWidth)}b`;
  return GATE_ABBREVIATION[component.type];
};

/** Multi-pin parts (blocks, counters, registers, displays) share one body: a box sized by its pin layout with a caption above it. */
export const usesBlockBody = (type: ComponentType): boolean => isBlockType(type) || isRegisterType(type) || isDisplayType(type) || type === 'BUS_SPLITTER' || type === 'ALU' || isMemoryType(type) || isMatrixType(type);

/**
 * Where a component's body is drawn, in local pixels. Used to size the
 * selection outline so it hugs the drawn shape for every component family
 * (gate bodies hang below their origin row, I/O parts are centered on it).
 */
export const componentBodyRect = (component: ComponentInstance, ports: readonly PortDefinition[]): BodyRect => {
  if (isDisplayType(component.type)) return blockBodyRect(ports, displayWidthCols(component.type));
  if (component.type === 'ALU') return blockBodyRect(ports, ALU_WIDTH_COLS);
  if (isMatrixType(component.type)) return blockBodyRect(ports, matrixWidthCols(matrixSizeOf(component.params)));
  if (isMemoryType(component.type)) return blockBodyRect(ports, MEMORY_WIDTH_COLS);
  if (usesBlockBody(component.type)) return blockBodyRect(ports);
  const inputCount = ports.filter((port) => port.direction === 'input').length;
  const height = gateBodyHeight(inputCount);
  if (isSequential(component.type)) return { x: 0, y: -GRID_SIZE * 0.5, width: GATE_WIDTH, height: height + GRID_SIZE };
  const isIo = component.type === 'SWITCH' || component.type === 'PUSH_BUTTON' || component.type === 'CLOCK' || component.type === 'LED' || component.type === 'PROBE';
  if (isIo) return { x: -GRID_SIZE * 0.2, y: -GRID_SIZE * 0.7, width: GRID_SIZE * 1.6, height: GRID_SIZE * 1.4 };
  return { x: 0, y: 0, width: GATE_WIDTH + BUBBLE_RADIUS * 2, height };
};

/**
 * The four corners of a component's drawn body in world pixels, after the same
 * mirror-then-rotate transform the renderers apply.
 */
const worldBodyCorners = (component: ComponentInstance, ports: readonly PortDefinition[]): Point[] => {
  const body = componentBodyRect(component, ports);
  const origin = componentOriginPixels(component);
  return [
    { x: body.x, y: body.y },
    { x: body.x + body.width, y: body.y },
    { x: body.x, y: body.y + body.height },
    { x: body.x + body.width, y: body.y + body.height },
  ].map((corner) => {
    const rotated = rotatePoint(component.mirrored ? { x: -corner.x, y: corner.y } : corner, component.rotation);
    return { x: origin.x + rotated.x, y: origin.y + rotated.y };
  });
};

/**
 * Where a component's instance label is centered, in world pixels: just below
 * the lowest edge of the body as it actually appears on screen, so a rotated
 * or mirrored part keeps its label beside the drawn body instead of under the
 * pre-rotation rectangle.
 */
export const componentLabelAnchor = (component: ComponentInstance, ports: readonly PortDefinition[]): Point => {
  const corners = worldBodyCorners(component, ports);
  const xs = corners.map((corner) => corner.x);
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: Math.max(...corners.map((corner) => corner.y)) + 14 };
};

/** Slack around a body, in pixels, so a click just off the outline still grabs the part. */
const HIT_PADDING = 6;

/**
 * The component under a world-pixel point, judged against the drawn body
 * rather than a fixed box around the origin. Parts on adjacent grid rows have
 * overlapping fixed boxes, so hit-testing the body is what lets a click on
 * the lower part reach it. Later components are drawn on top, so they win.
 */
export const findComponentAt = (components: readonly ComponentInstance[], point: Point): ComponentInstance | undefined => {
  for (let index = components.length - 1; index >= 0; index -= 1) {
    const component = components[index]!;
    const corners = worldBodyCorners(component, getComponentPorts(component.type, component.params));
    const xs = corners.map((corner) => corner.x);
    const ys = corners.map((corner) => corner.y);
    if (
      point.x >= Math.min(...xs) - HIT_PADDING &&
      point.x <= Math.max(...xs) + HIT_PADDING &&
      point.y >= Math.min(...ys) - HIT_PADDING &&
      point.y <= Math.max(...ys) + HIT_PADDING
    ) {
      return component;
    }
  }
  return undefined;
};

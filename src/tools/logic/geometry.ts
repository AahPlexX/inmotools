import { getComponentPorts } from './component-library';
import type { ComponentInstance, PortDefinition, Rotation } from './logic-types';

/** Pixels per grid unit, shared by canvas rendering and SVG export so both agree on layout. */
export const GRID_SIZE = 24;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export const rotatePoint = (point: Point, rotation: Rotation): Point => {
  if (rotation === 90) return { x: -point.y, y: point.x };
  if (rotation === 180) return { x: -point.x, y: -point.y };
  if (rotation === 270) return { x: point.y, y: -point.x };
  return point;
};

/** A port's local offset transformed by the component's mirror/rotation, in grid units. */
export const portLocalOffset = (component: ComponentInstance, port: PortDefinition): Point => {
  const mirrored: Point = component.mirrored ? { x: -port.x, y: port.y } : { x: port.x, y: port.y };
  return rotatePoint(mirrored, component.rotation);
};

/** A port's absolute canvas position, in pixels. */
export const portAbsolutePosition = (component: ComponentInstance, port: PortDefinition): Point => {
  const offset = portLocalOffset(component, port);
  return { x: (component.x + offset.x) * GRID_SIZE, y: (component.y + offset.y) * GRID_SIZE };
};

export const componentOriginPixels = (component: ComponentInstance): Point => ({
  x: component.x * GRID_SIZE,
  y: component.y * GRID_SIZE,
});

export interface BoundingBox {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export const componentBoundingBox = (component: ComponentInstance): BoundingBox => {
  const ports = getComponentPorts(component.type, component.params);
  const positions = ports.map((port) => portAbsolutePosition(component, port));
  const origin = componentOriginPixels(component);
  const xs = [origin.x - GRID_SIZE, origin.x + GRID_SIZE * 2, ...positions.map((point) => point.x)];
  const ys = [origin.y - GRID_SIZE, origin.y + GRID_SIZE * 2, ...positions.map((point) => point.y)];
  return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
};

export const documentBoundingBox = (components: readonly ComponentInstance[]): BoundingBox => {
  if (components.length === 0) return { minX: 0, minY: 0, maxX: GRID_SIZE * 10, maxY: GRID_SIZE * 10 };
  const boxes = components.map(componentBoundingBox);
  return {
    minX: Math.min(...boxes.map((box) => box.minX)),
    minY: Math.min(...boxes.map((box) => box.minY)),
    maxX: Math.max(...boxes.map((box) => box.maxX)),
    maxY: Math.max(...boxes.map((box) => box.maxY)),
  };
};

export const findPortAt = (
  component: ComponentInstance,
  worldPoint: Point,
  tolerancePixels = GRID_SIZE * 0.4,
): PortDefinition | undefined => {
  const ports = getComponentPorts(component.type, component.params);
  return ports.find((port) => {
    const position = portAbsolutePosition(component, port);
    const dx = position.x - worldPoint.x;
    const dy = position.y - worldPoint.y;
    return Math.sqrt(dx * dx + dy * dy) <= tolerancePixels;
  });
};

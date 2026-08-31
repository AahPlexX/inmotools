import type { Point2D } from './floorplan-types';

export type SnapKind = 'vertex' | 'midpoint' | 'component' | 'grid';
export interface SnapTarget {
  readonly id: string;
  readonly point: Point2D;
  readonly kind: SnapKind;
}
export interface SnapMatch extends SnapTarget {
  readonly distance: number;
}

interface KdNode {
  readonly target: SnapTarget;
  readonly axis: 0 | 1;
  readonly left?: KdNode;
  readonly right?: KdNode;
}

const coordinate = (target: SnapTarget, axis: 0 | 1) => axis === 0 ? target.point.x : target.point.y;
const pointCoordinate = (point: Point2D, axis: 0 | 1) => axis === 0 ? point.x : point.y;

const build = (targets: readonly SnapTarget[], depth = 0): KdNode | undefined => {
  if (targets.length === 0) return undefined;
  const axis = (depth % 2) as 0 | 1;
  const sorted = [...targets].sort((a, b) => coordinate(a, axis) - coordinate(b, axis) || a.id.localeCompare(b.id));
  const middle = Math.floor(sorted.length / 2);
  return {
    target: sorted[middle]!,
    axis,
    left: build(sorted.slice(0, middle), depth + 1),
    right: build(sorted.slice(middle + 1), depth + 1),
  };
};

const collectWithin = (node: KdNode | undefined, point: Point2D, radius: number, matches: SnapMatch[]) => {
  if (!node) return;
  const dx = node.target.point.x - point.x;
  const dy = node.target.point.y - point.y;
  const distance = Math.hypot(dx, dy);
  if (distance <= radius) matches.push({ ...node.target, distance });
  const delta = pointCoordinate(point, node.axis) - coordinate(node.target, node.axis);
  const near = delta <= 0 ? node.left : node.right;
  const far = delta <= 0 ? node.right : node.left;
  collectWithin(near, point, radius, matches);
  if (Math.abs(delta) <= radius) collectWithin(far, point, radius, matches);
};

export const createSnapIndex = (targets: readonly SnapTarget[]) => {
  const root = build(targets);
  const withinRadius = (point: Point2D, radius: number) => {
    const matches: SnapMatch[] = [];
    collectWithin(root, point, Math.max(0, radius), matches);
    return matches.sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
  };
  const nearest = (point: Point2D, radius: number) => withinRadius(point, radius)[0];
  return { withinRadius, nearest };
};

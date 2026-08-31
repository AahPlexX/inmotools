import type { LatticeLayoutModel, LatticeLayoutNode, LatticePoint } from './layout-engine';

export interface LatticeViewport {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface LatticeScreenSize {
  readonly width: number;
  readonly height: number;
}

const safeScale = (scale: number): number => Number.isFinite(scale) && scale > 0 ? scale : 1;

export const worldToScreen = (point: LatticePoint, viewport: LatticeViewport): LatticePoint => ({
  x: point.x * safeScale(viewport.scale) + viewport.x,
  y: point.y * safeScale(viewport.scale) + viewport.y,
});

export const screenToWorld = (point: LatticePoint, viewport: LatticeViewport): LatticePoint => {
  const scale = safeScale(viewport.scale);
  return {
    x: (point.x - viewport.x) / scale,
    y: (point.y - viewport.y) / scale,
  };
};

export const fitViewport = (
  bounds: { readonly width: number; readonly height: number },
  screen: LatticeScreenSize,
  padding = 32,
): LatticeViewport => {
  const safePadding = Math.max(0, Number.isFinite(padding) ? padding : 0);
  const availableWidth = Math.max(1, screen.width - safePadding * 2);
  const availableHeight = Math.max(1, screen.height - safePadding * 2);
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const scale = Math.min(5, Math.max(0.05, Math.min(availableWidth / width, availableHeight / height)));
  return {
    x: (screen.width - width * scale) / 2,
    y: (screen.height - height * scale) / 2,
    scale,
  };
};

const intersects = (
  node: LatticeLayoutNode,
  rect: { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number },
): boolean => node.x + node.width >= rect.left
  && node.x <= rect.right
  && node.y + node.height >= rect.top
  && node.y <= rect.bottom;

export const visibleLayoutNodes = (
  layout: LatticeLayoutModel,
  options: {
    readonly viewport: LatticeViewport;
    readonly screen: LatticeScreenSize;
    readonly overscan?: number;
    readonly activeId?: string;
  },
): LatticeLayoutNode[] => {
  const scale = safeScale(options.viewport.scale);
  const overscanWorld = Math.max(0, options.overscan ?? 120) / scale;
  const topLeft = screenToWorld({ x: 0, y: 0 }, options.viewport);
  const bottomRight = screenToWorld({ x: options.screen.width, y: options.screen.height }, options.viewport);
  const rect = {
    left: Math.min(topLeft.x, bottomRight.x) - overscanWorld,
    top: Math.min(topLeft.y, bottomRight.y) - overscanWorld,
    right: Math.max(topLeft.x, bottomRight.x) + overscanWorld,
    bottom: Math.max(topLeft.y, bottomRight.y) + overscanWorld,
  };

  const visible: LatticeLayoutNode[] = [];
  for (const node of layout.nodes.values()) {
    if (intersects(node, rect) || node.id === options.activeId) visible.push(node);
  }
  return visible;
};

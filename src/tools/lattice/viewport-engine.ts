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
  maxScale = 3,
): LatticeViewport => {
  const safePadding = Math.max(0, Number.isFinite(padding) ? padding : 0);
  const availableWidth = Math.max(1, screen.width - safePadding * 2);
  const availableHeight = Math.max(1, screen.height - safePadding * 2);
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const cap = Number.isFinite(maxScale) && maxScale > 0 ? maxScale : 3;
  const scale = Math.min(cap, Math.max(0.05, Math.min(availableWidth / width, availableHeight / height)));
  return {
    x: (screen.width - width * scale) / 2,
    y: (screen.height - height * scale) / 2,
    scale,
  };
};

export const centerViewportOnNode = (
  node: Pick<LatticeLayoutNode, 'x' | 'y' | 'width' | 'height'>,
  screen: LatticeScreenSize,
  scale: number,
): LatticeViewport => {
  const safe = safeScale(scale);
  return {
    scale: safe,
    x: screen.width / 2 - (node.x + node.width / 2) * safe,
    y: screen.height / 2 - (node.y + node.height / 2) * safe,
  };
};

/** Convert a wheel delta into a zoom factor. Line/page modes and pinch (ctrl) are normalized so a mouse wheel and a trackpad do not jump differently. */
export const wheelZoomFactor = (deltaY: number, deltaMode = 0, pinch = false): number => {
  if (!Number.isFinite(deltaY) || deltaY === 0) return 1;
  const pixels = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * screenPage() : deltaY;
  const gain = pinch ? 0.01 : 0.0016;
  const factor = Math.exp(-pixels * gain);
  return Number.isFinite(factor) ? Math.min(1.8, Math.max(0.55, factor)) : 1;
};

const screenPage = (): number => (typeof window !== 'undefined' && Number.isFinite(window.innerHeight) ? window.innerHeight : 800);

export const viewportWorldRect = (
  viewport: LatticeViewport,
  screen: LatticeScreenSize,
): { readonly x: number; readonly y: number; readonly width: number; readonly height: number } => {
  const origin = screenToWorld({ x: 0, y: 0 }, viewport);
  const extent = screenToWorld({ x: screen.width, y: screen.height }, viewport);
  const x = Math.min(origin.x, extent.x);
  const y = Math.min(origin.y, extent.y);
  return { x, y, width: Math.abs(extent.x - origin.x), height: Math.abs(extent.y - origin.y) };
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

import { describe, expect, it } from 'vitest';
import type { LatticeLayoutModel } from '../../src/tools/lattice/layout-engine';
import { centerViewportOnNode, fitViewport, screenToWorld, viewportWorldRect, visibleLayoutNodes, wheelZoomFactor, worldToScreen } from '../../src/tools/lattice/viewport-engine';

const layout: LatticeLayoutModel = {
  bounds: { width: 1200, height: 800 },
  nodes: new Map([
    ['/left', { id: '/left', x: 40, y: 40, width: 180, height: 80 }],
    ['/middle', { id: '/middle', x: 500, y: 300, width: 180, height: 80 }],
    ['/right', { id: '/right', x: 980, y: 620, width: 180, height: 80 }],
  ]),
  edges: [],
};

describe('JSON Lattice viewport engine', () => {
  it('round-trips world and screen coordinates without drift', () => {
    const viewport = { x: 80, y: -25, scale: 1.75 };
    const screen = worldToScreen({ x: 420, y: 180 }, viewport);
    expect(screenToWorld(screen, viewport)).toEqual({ x: 420, y: 180 });
  });

  it('fits graph bounds into the available viewport with padding', () => {
    const fitted = fitViewport(layout.bounds, { width: 800, height: 600 }, 40);
    expect(fitted.scale).toBeGreaterThan(0);
    const topLeft = worldToScreen({ x: 0, y: 0 }, fitted);
    const bottomRight = worldToScreen({ x: layout.bounds.width, y: layout.bounds.height }, fitted);
    expect(topLeft.x).toBeGreaterThanOrEqual(39);
    expect(topLeft.y).toBeGreaterThanOrEqual(39);
    expect(bottomRight.x).toBeLessThanOrEqual(761);
    expect(bottomRight.y).toBeLessThanOrEqual(561);
  });

  it('virtualizes layout nodes to the visible world rectangle while preserving an active node', () => {
    const visible = visibleLayoutNodes(layout, {
      viewport: { x: 0, y: 0, scale: 1 },
      screen: { width: 760, height: 520 },
      overscan: 20,
      activeId: '/right',
    });
    expect(visible.map((node) => node.id)).toEqual(['/left', '/middle', '/right']);

    const withoutActive = visibleLayoutNodes(layout, {
      viewport: { x: 0, y: 0, scale: 1 },
      screen: { width: 760, height: 520 },
      overscan: 20,
    });
    expect(withoutActive.map((node) => node.id)).toEqual(['/left', '/middle']);
  });

  it('centers a node without changing the current zoom', () => {
    const centered = centerViewportOnNode({ x: 500, y: 300, width: 180, height: 80 }, { width: 800, height: 600 }, 2);
    expect(centered.scale).toBe(2);
    expect(centered.x).toBe(800 / 2 - (500 + 90) * 2);
    expect(centered.y).toBe(600 / 2 - (300 + 40) * 2);
  });

  it('normalizes mouse-wheel and trackpad deltas, and pinches faster', () => {
    expect(wheelZoomFactor(0)).toBe(1);
    expect(wheelZoomFactor(100, 0)).toBeLessThan(1);
    expect(wheelZoomFactor(-100, 0)).toBeGreaterThan(1);
    expect(wheelZoomFactor(3, 1)).toBeLessThan(wheelZoomFactor(3, 0));
    expect(wheelZoomFactor(40, 0, true)).toBeLessThan(wheelZoomFactor(40, 0, false));
  });

  it('reports the world rectangle currently on screen', () => {
    const rect = viewportWorldRect({ x: 40, y: 20, scale: 2 }, { width: 400, height: 200 });
    expect(rect).toEqual({ x: -20, y: -10, width: 200, height: 100 });
  });

  it('does not fit past the interactive zoom cap', () => {
    expect(fitViewport({ width: 40, height: 40 }, { width: 800, height: 600 }, 16, 3).scale).toBe(3);
  });
});

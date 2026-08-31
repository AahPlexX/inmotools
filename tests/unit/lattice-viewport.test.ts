import { describe, expect, it } from 'vitest';
import type { LatticeLayoutModel } from '../../src/tools/lattice/layout-engine';
import { fitViewport, screenToWorld, visibleLayoutNodes, worldToScreen } from '../../src/tools/lattice/viewport-engine';

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
});

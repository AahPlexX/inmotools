import { describe, expect, it } from 'vitest';
import { buildElkGraph, layoutDirectionOption, normalizeElkLayout } from '../../src/tools/lattice/layout-engine';
import { buildGraphModel } from '../../src/tools/lattice/graph-engine';

describe('JSON Lattice layout engine', () => {
  it('maps all four public directions to ELK layered directions', () => {
    expect(layoutDirectionOption('LR')).toBe('RIGHT');
    expect(layoutDirectionOption('TB')).toBe('DOWN');
    expect(layoutDirectionOption('RL')).toBe('LEFT');
    expect(layoutDirectionOption('BT')).toBe('UP');
  });

  it('builds an ELK layered request without losing stable graph paths', () => {
    const graph = buildGraphModel({ order: { id: 7, status: 'paid' } });
    const request = buildElkGraph(graph, 'TB');
    expect(request.layoutOptions).toMatchObject({ 'elk.algorithm': 'layered', 'elk.direction': 'DOWN' });
    expect(request.children?.map((node) => node.id)).toContain('/order/status');
    expect(request.edges?.some((edge) => edge.sources?.includes('/order') && edge.targets?.includes('/order/status'))).toBe(true);
  });

  it('normalizes worker layout geometry into a viewport-friendly model', () => {
    const layout = normalizeElkLayout({
      id: 'root', width: 500, height: 300,
      children: [{ id: '', x: 10, y: 20, width: 120, height: 60 }, { id: '/a', x: 220, y: 20, width: 120, height: 60 }],
      edges: [{ id: 'edge:root>a', sections: [{ startPoint: { x: 130, y: 50 }, endPoint: { x: 220, y: 50 }, bendPoints: [{ x: 170, y: 50 }] }] }],
    });
    expect(layout.bounds).toEqual({ width: 500, height: 300 });
    expect(layout.nodes.get('/a')).toMatchObject({ x: 220, y: 20, width: 120, height: 60 });
    expect(layout.edges[0].points).toEqual([{ x: 130, y: 50 }, { x: 170, y: 50 }, { x: 220, y: 50 }]);
  });
});

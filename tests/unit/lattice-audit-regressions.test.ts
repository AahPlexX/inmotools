import { describe, expect, it } from 'vitest';
import { buildLatticeSvg, rasterizeLatticeSvg } from '../../src/tools/lattice/export-engine';
import { parseStructuredText } from '../../src/tools/lattice/format-engine';
import { buildGraphModel } from '../../src/tools/lattice/graph-engine';
import { buildElkGraph, type LatticeLayoutModel } from '../../src/tools/lattice/layout-engine';

describe('JSON Lattice audit regressions', () => {
  it('preserves lossless textual identifiers from CSV and XML imports', () => {
    expect(parseStructuredText('id,qty\n00123,42\n', 'csv')).toEqual([{ id: '00123', qty: '42' }]);
    expect(parseStructuredText('<root><id>00123</id><qty>42</qty></root>', 'xml')).toEqual({ root: { id: '00123', qty: '42' } });
  });

  it('sizes graph nodes for long labels instead of using a fixed 220px box', () => {
    const longValue = 'customer-identifier-'.repeat(20);
    const graph = buildGraphModel({ id: longValue });
    const request = buildElkGraph(graph, 'LR');
    const idNode = request.children?.find((node) => node.id === '/id');
    expect(idNode?.width).toBeGreaterThan(220);
  });

  it('keeps full node labels in SVG metadata instead of silently truncating them', () => {
    const longValue = '0123456789'.repeat(12);
    const graph = buildGraphModel({ identifier: longValue });
    const layout: LatticeLayoutModel = {
      bounds: { width: 900, height: 300 },
      nodes: new Map([
        ['', { id: '', x: 20, y: 20, width: 220, height: 84 }],
        ['/identifier', { id: '/identifier', x: 300, y: 20, width: 560, height: 72 }],
      ]),
      edges: [],
    };
    const svg = buildLatticeSvg(graph, layout);
    expect(svg).toContain(`data-full-value="${longValue}"`);
    expect(svg).toContain(longValue);
  });

  it('rejects unsafe raster dimensions before creating a browser canvas', async () => {
    const hugeSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100000 100000"></svg>';
    await expect(rasterizeLatticeSvg(hugeSvg, { scale: 4 })).rejects.toThrow(/raster.*limit|too large|safe/i);
  });
});

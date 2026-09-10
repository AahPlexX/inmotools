import { describe, expect, it, vi } from 'vitest';
import { buildLatticeSvg, rasterizeLatticeSvg } from '../../src/tools/lattice/export-engine';
import { parseStructuredText } from '../../src/tools/lattice/format-engine';
import { buildGraphModel } from '../../src/tools/lattice/graph-engine';
import { buildElkGraph, type LatticeLayoutModel } from '../../src/tools/lattice/layout-engine';

describe('JSON Lattice audit regressions', () => {
  it('preserves lexically significant identifiers while retaining lossless scalar inference', () => {
    expect(parseStructuredText('id,qty\n00123,42\n', 'csv')).toEqual([{ id: '00123', qty: 42 }]);
    expect(parseStructuredText('<root><id>00123</id><qty>42</qty></root>', 'xml')).toEqual({ root: { id: '00123', qty: 42 } });
  });

  it('rejects malformed XML instead of normalizing mismatched element tags', () => {
    expect(() => parseStructuredText('<a>one</b>', 'xml')).toThrow(/XML.*(?:invalid|well-formed|parse)|mismatched|closing/i);
  });

  it('rejects JSON numbers that JavaScript cannot preserve exactly', () => {
    expect(() => parseStructuredText('{"id":9007199254740993}', 'json')).toThrow(/precision|safe integer|exact/i);
    expect(() => parseStructuredText('{"value":1e400}', 'json')).toThrow(/precision|range|finite|exact/i);
    expect(parseStructuredText('{"id":9007199254740991}', 'json')).toEqual({ id: 9007199254740991 });
  });

  it('sizes graph nodes from label length instead of swapping one fixed box for another', () => {
    const shortRequest = buildElkGraph(buildGraphModel({ id: 'short' }), 'LR');
    const longRequest = buildElkGraph(buildGraphModel({ id: 'customer-identifier-'.repeat(20) }), 'LR');
    const shortNode = shortRequest.children?.find((node) => node.id === '/id');
    const longNode = longRequest.children?.find((node) => node.id === '/id');
    expect(shortNode?.width).toBe(220);
    expect(longNode?.width).toBeGreaterThan(shortNode?.width ?? 0);
    expect(longNode?.height).toBeGreaterThan(shortNode?.height ?? 0);
  });

  it('reserves wrapped height for long keys after node width reaches its cap', () => {
    const longKey = 'very-long-property-key-'.repeat(40);
    const request = buildElkGraph(buildGraphModel({ [longKey]: 'value' }), 'LR');
    const node = request.children?.find((candidate) => candidate.id !== '$');
    expect(node?.width).toBe(640);
    expect(node?.height).toBeGreaterThan(72);
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

  it('wraps long SVG keys while retaining the complete key in metadata', () => {
    const longKey = 'field-'.repeat(80);
    const graph = buildGraphModel({ [longKey]: 'value' });
    const path = `/${longKey}`;
    const layout: LatticeLayoutModel = {
      bounds: { width: 700, height: 260 },
      nodes: new Map([
        ['', { id: '', x: 10, y: 10, width: 220, height: 84 }],
        [path, { id: path, x: 20, y: 110, width: 640, height: 150 }],
      ]),
      edges: [],
    };
    const svg = buildLatticeSvg(graph, layout);
    expect(svg).toContain(`data-full-key="${longKey}"`);
    expect(svg.match(/<tspan x="12" y="(?:24|42|60|78|96|114|132|150|168|186|204|222|240)">/gu)?.length ?? 0).toBeGreaterThan(1);
  });

  it('rejects unsafe raster dimensions before creating a browser canvas', async () => {
    const previousDocument = globalThis.document;
    const createElement = vi.fn();
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { createElement } });
    try {
      const hugeSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100000 100000"></svg>';
      await expect(rasterizeLatticeSvg(hugeSvg, { scale: 4 })).rejects.toThrow(/raster.*limit|too large|safe/i);
      expect(createElement).not.toHaveBeenCalled();
    } finally {
      if (previousDocument === undefined) delete (globalThis as { document?: Document }).document;
      else Object.defineProperty(globalThis, 'document', { configurable: true, value: previousDocument });
    }
  });
});

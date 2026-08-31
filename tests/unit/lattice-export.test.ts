import { describe, expect, it } from 'vitest';
import { buildFlatCsv, buildLatticeSvg } from '../../src/tools/lattice/export-engine';
import { buildGraphModel } from '../../src/tools/lattice/graph-engine';

describe('JSON Lattice export engine', () => {
  const source = { order: { id: 7, status: 'paid' } };
  const graph = buildGraphModel(source);
  const layout = {
    bounds: { width: 480, height: 240 },
    nodes: new Map([
      ['', { id: '', x: 20, y: 20, width: 140, height: 70 }],
      ['/order', { id: '/order', x: 190, y: 20, width: 140, height: 70 }],
      ['/order/status', { id: '/order/status', x: 190, y: 130, width: 140, height: 70 }],
    ]),
    edges: [{ id: 'e1', points: [{ x: 90, y: 90 }, { x: 260, y: 130 }] }],
  };

  it('exports a self-contained semantic SVG without script content', () => {
    const svg = buildLatticeSvg(graph, layout, { title: 'Order Graph' });
    expect(svg).toContain('viewBox="0 0 480 240"');
    expect(svg).toContain('<g id="structural-edges">');
    expect(svg).toContain('<g id="nodes">');
    expect(svg).toContain('Order Graph');
    expect(svg).not.toMatch(/<script/i);
  });

  it('exports deterministic relational CSV rows for the canonical document', () => {
    const csv = buildFlatCsv(source);
    expect(csv.split('\n')[0]).toBe('path,parent_path,key,type,value_text,value_json,depth');
    expect(csv).toContain('/order/status,/order,status,string,paid');
  });
});

import { describe, expect, it } from 'vitest';
import { parseStructuredText, serializeStructuredData } from '../../src/tools/lattice/format-engine';

describe('JSON Lattice structured format engine', () => {
  it('normalizes JSON, YAML, TOML, XML, and CSV into JSON-compatible values', () => {
    expect(parseStructuredText('{"order":{"id":7,"active":true}}', 'json')).toEqual({ order: { id: 7, active: true } });
    expect(parseStructuredText('order:\n  id: 7\n  active: true\n', 'yaml')).toEqual({ order: { id: 7, active: true } });
    expect(parseStructuredText('title = "demo"\n[owner]\nid = 7\n', 'toml')).toEqual({ title: 'demo', owner: { id: 7 } });
    expect(parseStructuredText('<order id="7"><status>paid</status></order>', 'xml')).toEqual({ order: { '@id': 7, status: 'paid' } });
    expect(parseStructuredText('name,qty\nA,2\nB,5\n', 'csv')).toEqual([{ name: 'A', qty: 2 }, { name: 'B', qty: 5 }]);
  });

  it('serializes canonical data without mutating it', () => {
    const source = { title: 'demo', rows: [{ id: 1, ok: true }, { id: 2, ok: false }] };
    const snapshot = structuredClone(source);
    expect(JSON.parse(serializeStructuredData(source, 'json'))).toEqual(source);
    expect(parseStructuredText(serializeStructuredData(source, 'yaml'), 'yaml')).toEqual(source);
    expect(parseStructuredText(serializeStructuredData(source, 'toml'), 'toml')).toEqual(source);
    expect(parseStructuredText(serializeStructuredData(source.rows, 'csv'), 'csv')).toEqual(source.rows);
    expect(source).toEqual(snapshot);
  });
});

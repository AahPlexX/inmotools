import { describe, expect, it } from 'vitest';
import { generateSchemaTargets } from '../../src/tools/lattice/schema-engine';

describe('JSON Lattice schema generation', () => {
  const sample = {
    orderId: 8921,
    status: 'paid',
    items: [
      { sku: 'A1', qty: 2 },
      { sku: 'B4' },
    ],
  };

  it('generates TypeScript, Zod, Go, and Rust targets from one inferred shape', () => {
    const result = generateSchemaTargets(sample, 'OrderPayload');
    expect(result.typescript).toContain('export interface OrderPayload');
    expect(result.typescript).toMatch(/qty\?: number/);
    expect(result.zod).toContain('z.number().optional()');
    expect(result.go).toMatch(/Qty\s+\*float64/);
    expect(result.rust).toContain('pub qty: Option<f64>');
  });

  it('generates Draft-07 and 2020-12 schemas with sample-derived required fields', () => {
    const result = generateSchemaTargets(sample, 'OrderPayload');
    const draft07 = JSON.parse(result.jsonSchemaDraft07);
    const draft202012 = JSON.parse(result.jsonSchema202012);
    expect(draft07.$schema).toBe('http://json-schema.org/draft-07/schema#');
    expect(draft202012.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(draft07.required).toEqual(['items', 'orderId', 'status']);
    expect(draft07.properties.items.items.required).toEqual(['sku']);
  });
});

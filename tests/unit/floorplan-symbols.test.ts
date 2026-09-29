import { describe, expect, it } from 'vitest';
import { COMPONENT_LIBRARY, getSymbolDefinition } from '../../src/tools/floorplan/symbol-library';

describe('PlanCraft parametric symbol library', () => {
  it('covers every requested component discipline including MEP', () => {
    const categories = new Set(COMPONENT_LIBRARY.map((symbol) => symbol.category));
    expect([...categories].sort()).toEqual(['bedroom', 'dining', 'kitchen_bath', 'living', 'mep', 'office']);
    expect(getSymbolDefinition('sofa-3-seat')?.width).toBe(2200);
    expect(getSymbolDefinition('round-table-1200')?.clearance.shape).toBe('circle');
    // 2010 ADA Standards 604.3.1: 60" (1525 mm) × 56" (1420 mm) water-closet clearance.
    expect(getSymbolDefinition('toilet')?.clearance).toMatchObject({ adaRuleKey: 'ada_fixture_clearance', dimensions: { x: 1525, y: 1420 } });
    expect(getSymbolDefinition('gfi')?.tag).toBe('GFCI');
    expect(getSymbolDefinition('duplex-120v')?.category).toBe('mep');
  });
});

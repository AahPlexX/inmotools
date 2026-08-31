import { describe, expect, it } from 'vitest';
import { COMPONENT_LIBRARY, getSymbolDefinition } from '../../src/tools/floorplan/symbol-library';

describe('PlanCraft parametric symbol library', () => {
  it('covers every requested component discipline including MEP', () => {
    const categories = new Set(COMPONENT_LIBRARY.map((symbol) => symbol.category));
    expect([...categories].sort()).toEqual(['bedroom', 'dining', 'kitchen_bath', 'living', 'mep', 'office']);
    expect(getSymbolDefinition('sofa-3-seat')?.width).toBe(2200);
    expect(getSymbolDefinition('task-chair')?.clearance.shape).toBe('circle');
    expect(getSymbolDefinition('duplex-120v')?.category).toBe('mep');
  });
});

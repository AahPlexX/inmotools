import { describe, expect, it } from 'vitest';
import {
  evaluateParameterDefinitions,
  evaluateParameterExpression,
  type CadParameterDefinition,
} from '../../src/tools/cad/parameter-engine';

describe('CAD parameter expressions', () => {
  it('evaluates unit literals into canonical millimeters and radians', () => {
    const length = evaluateParameterExpression('1 in + 12.7 mm', {});
    expect(length.dimension).toBe('length');
    expect(length.value).toBeCloseTo(38.1, 12);
    expect(evaluateParameterExpression('90 deg', {})).toMatchObject({ dimension: 'angle' });
    expect(evaluateParameterExpression('90 deg', {}).value).toBeCloseTo(Math.PI / 2, 12);
  });

  it('resolves named dependencies without changing their dimensional meaning', () => {
    const values = evaluateParameterDefinitions([
      { id: 'width', name: 'width', expression: '40 mm', dimension: 'length' },
      { id: 'clearance', name: 'clearance', expression: '2 mm', dimension: 'length' },
      { id: 'outer', name: 'outer', expression: 'width + clearance * 2', dimension: 'length' },
    ]);
    expect(values.get('outer')).toMatchObject({ dimension: 'length', value: 44 });
  });

  it('allows same-dimension division to produce a scalar', () => {
    const result = evaluateParameterExpression('20 mm / 5 mm', {});
    expect(result).toEqual({ dimension: 'scalar', value: 4 });
  });

  it('rejects dimensionally invalid addition instead of coercing units silently', () => {
    expect(() => evaluateParameterExpression('20 mm + 45 deg', {})).toThrow(/dimension/i);
  });

  it('rejects unsupported squared dimensions rather than inventing hidden semantics', () => {
    expect(() => evaluateParameterExpression('20 mm * 5 mm', {})).toThrow(/dimension/i);
  });

  it('detects parameter dependency cycles with the involved names', () => {
    const definitions: CadParameterDefinition[] = [
      { id: 'a', name: 'a', expression: 'b + 1 mm', dimension: 'length' },
      { id: 'b', name: 'b', expression: 'a + 1 mm', dimension: 'length' },
    ];
    expect(() => evaluateParameterDefinitions(definitions)).toThrow(/a.*b|b.*a/i);
  });

  it('rejects a declared dimension that does not match the evaluated expression', () => {
    const definitions: CadParameterDefinition[] = [
      { id: 'angle', name: 'angle', expression: '25 mm', dimension: 'angle' },
    ];
    expect(() => evaluateParameterDefinitions(definitions)).toThrow(/declared.*angle|angle.*length/i);
  });

  it('rejects unknown identifiers', () => {
    expect(() => evaluateParameterExpression('missing + 1 mm', {})).toThrow(/missing/i);
  });
});

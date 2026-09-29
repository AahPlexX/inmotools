import { describe, expect, it } from 'vitest';
import { formatArea, formatLength, parseLength } from '../../src/tools/floorplan/units';

describe('PlanCraft display units', () => {
  it('formats metric lengths in whole millimeters', () => {
    expect(formatLength(4200, 'metric')).toBe('4200 mm');
    expect(formatLength(914.6, 'metric')).toBe('915 mm');
  });

  it('formats imperial lengths as feet and inches to the nearest eighth', () => {
    expect(formatLength(3810, 'imperial')).toBe("12'-6\"");
    expect(formatLength(914.4, 'imperial')).toBe("3'-0\"");
    expect(formatLength(12.7, 'imperial')).toBe('1/2"');
    expect(formatLength(3822.7, 'imperial')).toBe("12'-6 1/2\"");
    expect(formatLength(3.175, 'imperial')).toBe('1/8"');
    // 11.95" rounds up to a whole foot instead of printing 12".
    expect(formatLength(303.5, 'imperial')).toBe("1'-0\"");
    expect(formatLength(303.2, 'imperial')).toBe('11 7/8"');
  });

  it('formats areas in the unit system people quote rooms in', () => {
    expect(formatArea(12.3456, 'metric')).toBe('12.3 m²');
    expect(formatArea(12.3456, 'imperial')).toBe('133 ft²');
  });

  it('parses metric input as millimeters', () => {
    expect(parseLength('150', 'metric')).toBe(150);
    expect(parseLength(' 2,700 mm ', 'metric')).toBe(2700);
    expect(parseLength('', 'metric')).toBeUndefined();
    expect(parseLength('abc', 'metric')).toBeUndefined();
  });

  it('parses the imperial forms people actually type', () => {
    expect(parseLength('36', 'imperial')).toBeCloseTo(914.4, 6);
    expect(parseLength('36"', 'imperial')).toBeCloseTo(914.4, 6);
    expect(parseLength("3'", 'imperial')).toBeCloseTo(914.4, 6);
    expect(parseLength("12'6\"", 'imperial')).toBeCloseTo(3810, 6);
    expect(parseLength("12' 6 1/2\"", 'imperial')).toBeCloseTo(3822.7, 6);
    expect(parseLength("12'-6\"", 'imperial')).toBeCloseTo(3810, 6);
    expect(parseLength('5 1/2', 'imperial')).toBeCloseTo(139.7, 6);
    expect(parseLength('1/0', 'imperial')).toBeUndefined();
    expect(parseLength('feet', 'imperial')).toBeUndefined();
  });
});

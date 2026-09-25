export type LengthUnit = 'mm' | 'cm' | 'm' | 'in' | 'ft';
export type AngleUnit = 'rad' | 'deg';

const MILLIMETERS_PER_UNIT: Record<LengthUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
};

function finite(value: number): number {
  if (!Number.isFinite(value)) throw new Error('CAD unit values must be finite numbers.');
  return value;
}

export function toMillimeters(value: number, unit: LengthUnit): number {
  return finite(value) * MILLIMETERS_PER_UNIT[unit];
}

export function fromMillimeters(value: number, unit: LengthUnit): number {
  return finite(value) / MILLIMETERS_PER_UNIT[unit];
}

export function toRadians(value: number, unit: AngleUnit): number {
  const input = finite(value);
  return unit === 'rad' ? input : input * Math.PI / 180;
}

export function fromRadians(value: number, unit: AngleUnit): number {
  const input = finite(value);
  return unit === 'rad' ? input : input * 180 / Math.PI;
}

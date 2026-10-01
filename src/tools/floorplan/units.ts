/**
 * Display-unit formatting and parsing for PlanCraft.
 *
 * Geometry is always stored in millimeters. These helpers only change how
 * lengths and areas are shown and how typed values are read back.
 */
export type DisplayUnits = 'metric' | 'imperial';

const MM_PER_INCH = 25.4;
const SQ_FEET_PER_SQ_METER = 10.76391041671;
const EIGHTHS = 8;

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

const inchesText = (wholeInches: number, eighths: number) => {
  if (eighths === 0) return `${wholeInches}"`;
  const divisor = gcd(eighths, EIGHTHS);
  const fraction = `${eighths / divisor}/${EIGHTHS / divisor}`;
  return wholeInches === 0 ? `${fraction}"` : `${wholeInches} ${fraction}"`;
};

/** Formats a millimeter length as "4200 mm" or feet-inches to the nearest 1/8", e.g. `12'-6 1/2"`. */
export const formatLength = (mm: number, units: DisplayUnits): string => {
  if (!Number.isFinite(mm)) return '—';
  if (units === 'metric') return `${Math.round(mm)} mm`;
  const sign = mm < 0 ? '-' : '';
  // Round once, in eighths, so 11 15/16" carries into the next foot.
  const totalEighths = Math.round((Math.abs(mm) / MM_PER_INCH) * EIGHTHS);
  const feet = Math.floor(totalEighths / (12 * EIGHTHS));
  const remainder = totalEighths - feet * 12 * EIGHTHS;
  const inches = inchesText(Math.floor(remainder / EIGHTHS), remainder % EIGHTHS);
  return feet === 0 ? `${sign}${inches}` : `${sign}${feet}'-${inches}`;
};

/** Formats square meters as "12.3 m²" or whole square feet. */
export const formatArea = (squareMeters: number, units: DisplayUnits): string => (units === 'metric'
  ? `${squareMeters.toFixed(1)} m²`
  : `${Math.round(squareMeters * SQ_FEET_PER_SQ_METER)} ft²`);

const parseNumberWithFraction = (text: string): number | undefined => {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 2) return undefined;
  let total = 0;
  for (const part of parts) {
    const fraction = /^(\d+)\/(\d+)$/.exec(part);
    if (fraction) {
      const denominator = Number(fraction[2]);
      if (denominator === 0) return undefined;
      total += Number(fraction[1]) / denominator;
    } else if (/^\d*\.?\d+$/.test(part)) total += Number(part);
    else return undefined;
  }
  return total;
};

/**
 * Reads a typed length back to millimeters. Metric accepts plain numbers
 * (optionally "mm", thousands commas). Imperial accepts `36`, `36"`, `3'`,
 * `12'6"`, `12'-6 1/2"`, and `5 1/2` (bare numbers are inches).
 * Returns undefined for anything it cannot read, so callers keep the old value.
 */
export const parseLength = (input: string, units: DisplayUnits): number | undefined => {
  const text = input.trim().replaceAll(',', '');
  if (!text) return undefined;
  if (units === 'metric') {
    const match = /^(-?\d*\.?\d+)\s*(mm)?$/i.exec(text);
    return match ? Number(match[1]) : undefined;
  }
  const imperial = /^(?:(\d*\.?\d+)\s*')?\s*-?\s*(?:([\d\s/.]+)\s*"?)?$/.exec(text);
  if (!imperial || (imperial[1] === undefined && imperial[2] === undefined)) return undefined;
  const feet = imperial[1] === undefined ? 0 : Number(imperial[1]);
  const inches = imperial[2] === undefined ? 0 : parseNumberWithFraction(imperial[2]);
  if (inches === undefined || !Number.isFinite(feet)) return undefined;
  return (feet * 12 + inches) * MM_PER_INCH;
};

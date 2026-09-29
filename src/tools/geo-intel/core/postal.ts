// Postal-code rules for the keyless postal adapters.

/** Countries covered by Zippopotam.us (its coverage table, checked 2026-09-29). */
export const ZIPPOPOTAM_COUNTRIES = [
  'AD', 'AR', 'AS', 'AT', 'AU', 'BD', 'BE', 'BG', 'BR', 'CA', 'CH', 'CZ', 'DE', 'DK', 'DO', 'ES', 'FI', 'FO', 'FR', 'GB',
  'GF', 'GG', 'GL', 'GP', 'GT', 'GU', 'GY', 'HR', 'HU', 'IM', 'IN', 'IS', 'IT', 'JE', 'JP', 'LI', 'LK', 'LT', 'LU', 'MC',
  'MD', 'MH', 'MK', 'MP', 'MQ', 'MX', 'MY', 'NL', 'NO', 'NZ', 'PH', 'PK', 'PL', 'PM', 'PR', 'PT', 'RE', 'RU', 'SE', 'SI',
  'SJ', 'SK', 'SM', 'TH', 'TR', 'US', 'VA', 'VI', 'YT', 'ZA',
] as const;

const SUPPORTED = new Set<string>(ZIPPOPOTAM_COUNTRIES);
export const isPostalCountry = (code: string) => SUPPORTED.has(code.toUpperCase());

/** Full UK postcode (incl. GIR 0AA), case-insensitive, optional space. */
export const UK_FULL = /^(GIR ?0AA|[A-PR-UWYZ][0-9]{1,2} ?[0-9][ABD-HJLNP-UW-Z]{2}|[A-PR-UWYZ][A-HK-Y][0-9]{1,2} ?[0-9][ABD-HJLNP-UW-Z]{2}|[A-PR-UWYZ][0-9][A-HJKPSTUW] ?[0-9][ABD-HJLNP-UW-Z]{2}|[A-PR-UWYZ][A-HK-Y][0-9][ABEHMNPRVWXY] ?[0-9][ABD-HJLNP-UW-Z]{2})$/i;
export const UK_OUTWARD = /^([A-PR-UWYZ][0-9]{1,2}|[A-PR-UWYZ][A-HK-Y][0-9]{1,2}|[A-PR-UWYZ][0-9][A-HJKPSTUW]|[A-PR-UWYZ][A-HK-Y][0-9][ABEHMNPRVWXY])$/i;
export const CA_POSTAL = /^([ABCEGHJ-NPRSTVXY][0-9][ABCEGHJ-NPRSTV-Z]) ?([0-9][ABCEGHJ-NPRSTV-Z][0-9])?$/i;

export interface PostalRequest {
  country: string;
  /** Code as sent to the adapter. */
  code: string;
  /** Code as the user typed it (trimmed, upper-cased). */
  display: string;
  /** Geography the adapter will actually resolve (may be coarser than the input). */
  resolves: 'full_code' | 'outward_code' | 'forward_sortation_area' | 'numeric_district';
}

export function normalizePostal(countryInput: string, codeInput: string): PostalRequest {
  const country = countryInput.trim().toUpperCase();
  const display = codeInput.trim().toUpperCase().replace(/\s+/g, ' ');
  if (!isPostalCountry(country)) throw new Error(`Postal lookups are not available for ${country}`);
  if (!display) throw new Error('Enter a postal code');
  switch (country) {
    case 'GB': {
      const compact = display.replace(/\s/g, '');
      if (UK_FULL.test(compact)) return { country, code: compact, display, resolves: 'full_code' };
      if (UK_OUTWARD.test(compact)) return { country, code: compact, display, resolves: 'outward_code' };
      throw new Error(`"${display}" is not a UK postcode`);
    }
    case 'CA': {
      const match = CA_POSTAL.exec(display);
      if (!match) throw new Error(`"${display}" is not a Canadian postal code`);
      // Zippopotam publishes Canada at forward sortation area (first three characters) level.
      return { country, code: match[1].toUpperCase(), display, resolves: 'forward_sortation_area' };
    }
    case 'NL': {
      const match = /^(\d{4})\s?[A-Z]{0,2}$/.exec(display);
      if (!match) throw new Error(`"${display}" is not a Dutch postal code`);
      return { country, code: match[1], display, resolves: display.length > 4 ? 'numeric_district' : 'full_code' };
    }
    case 'LU':
      return { country, code: /^\d{4}$/.test(display) ? `L-${display}` : display, display, resolves: 'full_code' };
    case 'MD':
      return { country, code: /^\d{4}$/.test(display) ? `MD-${display}` : display, display, resolves: 'full_code' };
    default:
      return { country, code: display, display, resolves: 'full_code' };
  }
}

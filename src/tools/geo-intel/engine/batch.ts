// Batch postal lookup: CSV in → enriched CSV out. Rows are resolved one at a
// time through the throttled postal chain only (no Nominatim, no reverse
// geocoding), with offline country/timezone enrichment.

import Papa from 'papaparse';
import { postcodesLookup, zippopotamLookup } from '../adapters/postal';
import type { AdapterResult } from '../adapters/common';
import { normalizePostal } from '../core/postal';
import { neutralizeFormula } from '../export/formats';
import { formatOffset, offsetMinutes } from '../core/timezone';
import { NotFoundError, type HttpClient } from '../net/http';
import { countryAt, timezoneAt } from '../offline/static-data';

export const BATCH_ROW_LIMIT = 1_000;

export interface BatchInput {
  headers: string[];
  rows: Record<string, string>[];
  postalColumn: string;
  countryColumn: string | null;
}

const POSTAL_HEADERS = /^(post(al)?[\s_-]?code|postcode|zip([\s_-]?code)?|plz|cep|code)$/i;
const COUNTRY_HEADERS = /^(country([\s_-]?code)?|iso2?|cc|nation)$/i;

export function parseBatchCsv(text: string): BatchInput {
  const parsed = Papa.parse<Record<string, string>>(text.replace(/^\uFEFF/, ''), { header: true, skipEmptyLines: 'greedy', transformHeader: (header) => header.trim() });
  const headers = (parsed.meta.fields ?? []).filter(Boolean);
  const quoteError = parsed.errors.find((error) => error.type === 'Quotes');
  if (quoteError) throw new Error(`The CSV has an unclosed quote near row ${(quoteError.row ?? 0) + 2}; fix it and try again.`);
  if (!headers.length) throw new Error('The CSV needs a header row, e.g. “postcode,country”.');
  const postalColumn = headers.find((header) => POSTAL_HEADERS.test(header)) ?? headers[0];
  const countryColumn = headers.find((header) => COUNTRY_HEADERS.test(header)) ?? null;
  return { headers, rows: parsed.data, postalColumn, countryColumn };
}

export const OUTPUT_COLUMNS = ['gi_status', 'gi_postcode', 'gi_place', 'gi_admin1', 'gi_admin1_code', 'gi_latitude', 'gi_longitude', 'gi_confidence', 'gi_country', 'gi_timezone', 'gi_utc_offset', 'gi_source', 'gi_license', 'gi_retrieved_at', 'gi_note'] as const;
export type OutputRow = Record<string, string>;

export interface BatchProgress { done: number; total: number; ok: number; failed: number; current: string }

export interface BatchOptions {
  client: HttpClient;
  defaultCountry: string;
  signal?: AbortSignal;
  onProgress?: (progress: BatchProgress) => void;
  now?: () => Date;
}

const value = (result: AdapterResult, key: string) => {
  const item = result.fields.find((entry) => entry.key === key);
  return item?.value === null || item?.value === undefined ? '' : String(item.value);
};

export async function runBatch(input: BatchInput, options: BatchOptions): Promise<{ rows: OutputRow[]; cancelled: boolean; truncated: boolean }> {
  const rows = input.rows.slice(0, BATCH_ROW_LIMIT);
  const out: OutputRow[] = [];
  const progress: BatchProgress = { done: 0, total: rows.length, ok: 0, failed: 0, current: '' };
  const memo = new Map<string, OutputRow>();
  for (const row of rows) {
    if (options.signal?.aborted) return { rows: out, cancelled: true, truncated: input.rows.length > BATCH_ROW_LIMIT };
    const code = (row[input.postalColumn] ?? '').trim();
    const country = ((input.countryColumn ? row[input.countryColumn] ?? '' : '').trim() || options.defaultCountry).trim().toUpperCase();
    progress.current = `${country} ${code}`;
    options.onProgress?.({ ...progress });
    const key = `${country}|${code.toUpperCase()}`;
    let enriched = memo.get(key);
    if (!enriched) {
      enriched = Object.fromEntries(OUTPUT_COLUMNS.map((column) => [column, ''])) as OutputRow;
      try {
        const request = normalizePostal(country, code);
        let result: AdapterResult | null = null;
        if (country === 'GB') {
          try { result = await postcodesLookup(options.client, request, options.signal); } catch (error) { if (options.signal?.aborted) throw error; }
        }
        if (!result?.point) result = await zippopotamLookup(options.client, request, options.signal);
        if (!result.point) throw new Error(result.warnings[0] ?? 'No coordinates published');
        const [countryHit, tz] = await Promise.all([countryAt(result.point), timezoneAt(result.point)]);
        Object.assign(enriched, {
          gi_status: 'ok', gi_postcode: value(result, 'address.postcode'), gi_place: value(result, 'address.place') || value(result, 'admin.district'),
          gi_admin1: value(result, 'admin.state') || value(result, 'admin.ukNation'), gi_admin1_code: value(result, 'admin.stateCode'),
          gi_latitude: result.point.lat.toFixed(6), gi_longitude: result.point.lon.toFixed(6), gi_confidence: result.confidence,
          gi_country: countryHit?.country?.a2 ?? result.countryCode ?? country, gi_timezone: tz.zone, gi_utc_offset: formatOffset(offsetMinutes(tz.zone, options.now?.() ?? new Date())),
          gi_source: result.source, gi_license: result.fields[0]?.license ?? '', gi_retrieved_at: result.retrievedAt, gi_note: result.warnings.join(' '),
        });
        progress.ok += 1;
      } catch (error) {
        if (options.signal?.aborted) return { rows: out, cancelled: true, truncated: input.rows.length > BATCH_ROW_LIMIT };
        enriched.gi_status = error instanceof NotFoundError ? 'not_found' : 'error';
        enriched.gi_note = error instanceof NotFoundError ? 'Postal code not found at the source.' : (error as Error).message;
        progress.failed += 1;
      }
      memo.set(key, enriched);
    } else if (enriched.gi_status === 'ok') progress.ok += 1; else progress.failed += 1;
    out.push({ ...row, ...enriched });
    progress.done += 1;
    options.onProgress?.({ ...progress });
  }
  return { rows: out, cancelled: false, truncated: input.rows.length > BATCH_ROW_LIMIT };
}

export function batchToCsv(input: BatchInput, rows: OutputRow[]): string {
  return Papa.unparse({ fields: [...input.headers, ...OUTPUT_COLUMNS], data: rows.map((row) => [...input.headers, ...OUTPUT_COLUMNS].map((column) => neutralizeFormula(row[column] ?? ''))) });
}

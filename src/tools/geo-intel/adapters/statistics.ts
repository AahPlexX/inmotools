// Statistical adapters: World Bank Indicators API v2 and Eurostat (with the
// GISCO ID service to find the NUTS region containing a point).

import { field } from '../core/sources';
import type { ProfileField } from '../core/types';
import { NotFoundError, TTL, type HttpClient } from '../net/http';
import { enc, num } from './common';

export interface IndicatorDef {
  id: string;
  label: string;
  unit: string;
  group: 'population' | 'indicators';
  digits: number;
}

export const WB_INDICATORS: IndicatorDef[] = [
  { id: 'SP.POP.TOTL', label: 'Population (country)', unit: 'people', group: 'population', digits: 0 },
  { id: 'EN.POP.DNST', label: 'Population density (country)', unit: 'people per km² of land', group: 'population', digits: 1 },
  { id: 'SP.URB.TOTL.IN.ZS', label: 'Urban population', unit: '% of total', group: 'population', digits: 1 },
  { id: 'NY.GDP.PCAP.CD', label: 'GDP per capita', unit: 'current US$', group: 'indicators', digits: 0 },
  { id: 'SP.DYN.LE00.IN', label: 'Life expectancy at birth', unit: 'years', group: 'indicators', digits: 1 },
  { id: 'AG.LND.TOTL.K2', label: 'Land area', unit: 'km²', group: 'indicators', digits: 0 },
];

interface WbRow {
  indicator: { id: string; value: string };
  country: { id: string; value: string };
  countryiso3code: string;
  date: string;
  value: number | null;
}
type WbResponse = [{ page: number; pages: number; total: number; lastupdated?: string; message?: unknown }, WbRow[] | null];

const WB_NOTE = 'Most recent non-empty annual value published by the World Bank (World Development Indicators).';

export async function worldBankCountry(client: HttpClient, iso3: string, signal?: AbortSignal): Promise<ProfileField[]> {
  const ids = WB_INDICATORS.map((item) => item.id).join(';');
  const url = `https://api.worldbank.org/v2/country/${enc(iso3)}/indicator/${ids}?format=json&mrnev=1&source=2&per_page=50`;
  const response = await client.get<WbResponse>(url, { source: 'world-bank', ttlMs: TTL.week, signal });
  const rows = Array.isArray(response.data) ? response.data[1] ?? [] : [];
  return rows.flatMap((row) => {
    const def = WB_INDICATORS.find((item) => item.id === row.indicator.id);
    const value = num(row.value);
    if (!def || value === null) return [];
    return [field(`wb.${def.id}`, def.label, def.group, value, {
      source: 'world-bank', geography: 'country', confidence: 'admin_centroid', retrievedAt: response.retrievedAt,
      unit: def.unit, year: Number(row.date) || null, recordId: `${row.countryiso3code}/${row.indicator.id}/${row.date}`, geometryId: row.countryiso3code, note: WB_NOTE,
    })];
  });
}

export interface ChoroplethData {
  indicator: IndicatorDef;
  values: Map<string, { value: number; year: number }>;
  retrievedAt: string;
  stale: boolean;
}

export async function worldBankAllCountries(client: HttpClient, indicatorId: string, signal?: AbortSignal): Promise<ChoroplethData> {
  const indicator = WB_INDICATORS.find((item) => item.id === indicatorId);
  if (!indicator) throw new Error(`Unknown indicator ${indicatorId}`);
  const url = `https://api.worldbank.org/v2/country/all/indicator/${enc(indicatorId)}?format=json&mrnev=1&per_page=400`;
  const response = await client.get<WbResponse>(url, { source: 'world-bank', ttlMs: TTL.week, signal });
  const values = new Map<string, { value: number; year: number }>();
  for (const row of (Array.isArray(response.data) ? response.data[1] : null) ?? []) {
    const value = num(row.value);
    if (value !== null && /^[A-Z]{3}$/.test(row.countryiso3code)) values.set(row.countryiso3code, { value, year: Number(row.date) });
  }
  return { indicator, values, retrievedAt: response.retrievedAt, stale: response.stale };
}

// ---------------- Eurostat ----------------

interface JsonStat {
  value: Record<string, number | null>;
  id: string[];
  size: number[];
  label?: string;
  updated?: string;
  dimension: Record<string, { label: string; category: { index: Record<string, number>; label: Record<string, string> } }>;
}

export interface JsonStatPoint { geo: string; geoLabel: string; time: string; value: number }

/** Flattens a JSON-stat 2.0 dataset into (geo, time, value) points; other dimensions must be single-valued. */
export function parseJsonStat(data: JsonStat): JsonStatPoint[] {
  const geoIndex = data.id.indexOf('geo');
  const timeIndex = data.id.indexOf('time');
  if (geoIndex < 0 || timeIndex < 0) return [];
  const strides = data.size.map((_, i) => data.size.slice(i + 1).reduce((a, b) => a * b, 1));
  const geoCats = Object.entries(data.dimension.geo.category.index);
  const timeCats = Object.entries(data.dimension.time.category.index);
  const points: JsonStatPoint[] = [];
  for (const [geo, g] of geoCats) {
    for (const [time, t] of timeCats) {
      const flat = g * strides[geoIndex] + t * strides[timeIndex];
      const value = data.value[String(flat)];
      if (typeof value === 'number') points.push({ geo, geoLabel: data.dimension.geo.category.label[geo] ?? geo, time, value });
    }
  }
  return points;
}

export const latestByGeo = (points: JsonStatPoint[]) => {
  const out = new Map<string, JsonStatPoint>();
  for (const point of points) {
    const current = out.get(point.geo);
    if (!current || point.time > current.time) out.set(point.geo, point);
  }
  return out;
};

export async function nutsForPoint(client: HttpClient, lat: number, lon: number, signal?: AbortSignal): Promise<{ nuts3: string | null; retrievedAt: string }> {
  const url = `https://gisco-services.ec.europa.eu/id/nuts?x=${lon.toFixed(5)}&y=${lat.toFixed(5)}&year=2024&proj=4326&geometry=N`;
  const response = await client.get<{ features: Array<{ properties: { nuts_id: string; stat_levl_code: number } }> | null }>(url, { source: 'gisco-id', ttlMs: TTL.month, signal });
  const nuts3 = (response.data.features ?? []).map((item) => item.properties).find((item) => Number(item.stat_levl_code) === 3)?.nuts_id ?? null;
  return { nuts3, retrievedAt: response.retrievedAt };
}

/** NUTS codes are hierarchical: DE300 ⊂ DE30 ⊂ DE3 ⊂ DE. */
export const nutsChain = (nuts3: string) => [nuts3.slice(0, 2), nuts3.slice(0, 3), nuts3.slice(0, 4), nuts3];

const ES = 'https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data';

async function eurostat(client: HttpClient, dataset: string, params: Record<string, string | string[]>, signal?: AbortSignal) {
  const query = new URLSearchParams({ format: 'JSON', lang: 'EN' });
  for (const [key, value] of Object.entries(params)) for (const item of [value].flat()) query.append(key, item);
  const url = `${ES}/${dataset}?${query}`;
  try {
    const response = await client.get<JsonStat>(url, { source: 'eurostat', ttlMs: TTL.week, signal });
    return { points: parseJsonStat(response.data), retrievedAt: response.retrievedAt, label: response.data.label ?? dataset };
  } catch (error) {
    if (error instanceof NotFoundError) return { points: [], retrievedAt: new Date().toISOString(), label: dataset };
    throw error;
  }
}

export async function eurostatRegion(client: HttpClient, nuts3: string, signal?: AbortSignal): Promise<ProfileField[]> {
  const chain = nutsChain(nuts3);
  const [population, density, gdp, employment] = await Promise.all([
    eurostat(client, 'demo_r_pjanaggr3', { geo: chain, sex: 'T', age: 'TOTAL', lastTimePeriod: '1' }, signal),
    eurostat(client, 'demo_r_d3dens', { geo: nuts3, lastTimePeriod: '1' }, signal),
    eurostat(client, 'nama_10r_3gdp', { geo: nuts3, unit: 'EUR_HAB', lastTimePeriod: '3' }, signal),
    eurostat(client, 'lfst_r_lfe2emprt', { geo: chain[2], sex: 'T', age: 'Y20-64', lastTimePeriod: '1' }, signal),
  ]);
  const fields: ProfileField[] = [];
  const base = (retrievedAt: string, geography: 'nuts1' | 'nuts2' | 'nuts3' | 'country', recordId: string, dataset: string, unit: string | null, year: number | null) => ({
    source: 'eurostat' as const, geography, confidence: 'admin_centroid' as const, retrievedAt, recordId, geometryId: recordId, unit, year,
    note: `Eurostat dataset ${dataset}; value for the whole NUTS region, not the point.`,
  });
  const levels = ['country', 'nuts1', 'nuts2', 'nuts3'] as const;
  const popLatest = latestByGeo(population.points);
  chain.forEach((code, level) => {
    const point = popLatest.get(code);
    const geography = levels[level];
    const name = point?.geoLabel ?? null;
    if (level > 0) fields.push(field(`eu.nuts${level}`, `NUTS ${level}`, 'eu', name ? `${code} · ${name}` : code, { ...base(population.retrievedAt, geography, code, 'demo_r_pjanaggr3', null, null), note: 'NUTS 2024 classification (Eurostat GISCO).' }));
    if (point && level > 0) fields.push(field(`eu.population.nuts${level}`, `Population (NUTS ${level})`, 'eu', point.value, base(population.retrievedAt, geography, code, 'demo_r_pjanaggr3', 'people (1 January)', Number(point.time))));
  });
  const dens = latestByGeo(density.points).get(nuts3);
  if (dens) fields.push(field('eu.density.nuts3', 'Population density (NUTS 3)', 'eu', dens.value, base(density.retrievedAt, 'nuts3', nuts3, 'demo_r_d3dens', 'people per km²', Number(dens.time))));
  const gdpPoint = latestByGeo(gdp.points).get(nuts3);
  if (gdpPoint) fields.push(field('eu.gdpPerInhabitant.nuts3', 'GDP per inhabitant (NUTS 3)', 'eu', gdpPoint.value, base(gdp.retrievedAt, 'nuts3', nuts3, 'nama_10r_3gdp', 'EUR per inhabitant (current prices)', Number(gdpPoint.time))));
  const emp = latestByGeo(employment.points).get(chain[2]);
  if (emp) fields.push(field('eu.employmentRate.nuts2', 'Employment rate, age 20–64 (NUTS 2)', 'eu', emp.value, base(employment.retrievedAt, 'nuts2', chain[2], 'lfst_r_lfe2emprt', '% of population aged 20–64', Number(emp.time))));
  return fields;
}

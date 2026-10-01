// Offline data layer: lazily loaded bundled datasets and the lookups built on
// them. Every loader is code-split (`?raw` + JSON.parse) and memoised.

import { distanceKm } from '../core/geodesy';
import { nauticalZone } from '../core/timezone';
import type { LatLon } from '../core/types';

// ---------------- TopoJSON decoding ----------------

interface Topology {
  type: 'Topology';
  transform?: { scale: [number, number]; translate: [number, number] };
  arcs: number[][][];
  objects: Record<string, { type: 'GeometryCollection'; geometries: TopoGeometry[] }>;
}
type TopoGeometry =
  | { type: 'Polygon'; arcs: number[][]; id?: string; properties?: Record<string, unknown> }
  | { type: 'MultiPolygon'; arcs: number[][][]; id?: string; properties?: Record<string, unknown> }
  | { type: null; id?: string; properties?: Record<string, unknown> };

export type Ring = number[][];
export interface PolygonFeature<P> {
  id: string;
  properties: P;
  /** Polygons → rings (first ring outer, rest holes) in [lon, lat]. */
  polygons: Ring[][];
  bbox: [number, number, number, number];
}

export function decodeTopology<P>(topology: Topology, objectName: string): PolygonFeature<P>[] {
  const t = topology.transform;
  const arcs = topology.arcs.map((arc) => {
    let x = 0; let y = 0;
    return arc.map(([dx, dy]) => {
      if (!t) return [dx, dy];
      x += dx; y += dy;
      return [x * t.scale[0] + t.translate[0], y * t.scale[1] + t.translate[1]];
    });
  });
  const ring = (indexes: number[]): Ring => {
    const out: Ring = [];
    indexes.forEach((index, i) => {
      const arc = index < 0 ? [...arcs[~index]].reverse() : arcs[index];
      out.push(...(i > 0 ? arc.slice(1) : arc));
    });
    return out;
  };
  const features: PolygonFeature<P>[] = [];
  for (const geometry of topology.objects[objectName].geometries) {
    if (geometry.type === null) continue;
    const polygons = geometry.type === 'Polygon' ? [geometry.arcs.map(ring)] : geometry.arcs.map((polygon) => polygon.map(ring));
    let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
    for (const polygon of polygons) for (const [x, y] of polygon[0]) {
      if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
    }
    features.push({ id: String(geometry.id ?? ''), properties: (geometry.properties ?? {}) as P, polygons, bbox: [minX, minY, maxX, maxY] });
  }
  return features;
}

function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0]; const yi = ring[i][1]; const xj = ring[j][0]; const yj = ring[j][1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function featureContains(feature: PolygonFeature<unknown>, lon: number, lat: number): boolean {
  const [a, b, c, d] = feature.bbox;
  if (lon < a || lon > c || lat < b || lat > d) return false;
  return feature.polygons.some((rings) => inRing(lon, lat, rings[0]) && !rings.slice(1).some((hole) => inRing(lon, lat, hole)));
}

// ---------------- Loaders ----------------

export interface CountryRecord {
  a2: string; a3: string; n3: string | null; fips: string | null; name: string; official: string | null; withdrawn: boolean;
  capital: string | null; areaKm2: number | null; geonamesPopulation: number | null; continent: string; continentName: string;
  region: string | null; subregion: string | null; tld: string | null; currencyCode: string | null; currencyName: string | null;
  callingCode: string[]; postalFormat: string | null; postalRegex: string | null; languages: string[]; geonameId: number;
  neighbours: string[]; drivingSide: 'left' | 'right' | null; label: [number, number] | null; wikidata: string | null;
}
export interface CountryShapeProps { a2: string | null; a3: string; name: string }
export interface TimezoneProps { tz: string }

const memo = <T>(load: () => Promise<T>) => {
  let promise: Promise<T> | null = null;
  return () => (promise ??= load().catch((error) => { promise = null; throw error; }));
};

export const loadCountryTable = memo(async () => {
  const rows = JSON.parse((await import('../data/country-table.json?raw')).default) as CountryRecord[];
  return { rows, byA2: new Map(rows.map((row) => [row.a2, row])), byA3: new Map(rows.map((row) => [row.a3, row])) };
});

export const loadCountryShapes = memo(async () =>
  decodeTopology<CountryShapeProps>(JSON.parse((await import('../data/countries.topo.json?raw')).default) as Topology, 'countries'));

export const loadTimezones = memo(async () =>
  decodeTopology<TimezoneProps>(JSON.parse((await import('../data/timezones.topo.json?raw')).default) as Topology, 'tz'));

export interface PlaceRecord { name: string; a2: string | null; adm1: string | null; lat: number; lon: number; popMax: number; kind: 'capital' | 'regional_capital' | 'admin1_capital' | 'place' | 'station' | 'historic' }
const PLACE_KIND: Record<string, PlaceRecord['kind']> = { C: 'capital', R: 'regional_capital', A: 'admin1_capital', P: 'place', S: 'station', H: 'historic' };

export const loadPlaces = memo(async () => {
  const data = JSON.parse((await import('../data/places.json?raw')).default) as { rows: Array<[string, string | null, string | null, number, number, number, string]> };
  return data.rows.map(([name, a2, adm1, lat, lon, popMax, kind]): PlaceRecord => ({ name, a2, adm1, lat, lon, popMax, kind: PLACE_KIND[kind] ?? 'place' }));
});

export const loadAdmin1 = memo(async () => JSON.parse((await import('../data/admin1.json?raw')).default) as Record<string, [string, number]>);

export interface DataManifest {
  datasets: Record<string, { source: string; version?: string; url: string; license: string; attribution: string; retrievedAt: string; bytes: number; accuracy?: { agreement: number; landAgreement: number; samples: number } }>;
}
export const loadManifest = memo(async () => JSON.parse((await import('../data/manifest.json?raw')).default) as DataManifest);

// ---------------- Lookups ----------------

export interface CountryHit {
  country: CountryRecord | null;
  shape: CountryShapeProps;
  /** 'inside' when a polygon contains the point; 'nearest' when snapped from ≤ maxKm away (coasts, simplified borders). */
  match: 'inside' | 'nearest';
  distanceKm: number;
}

function nearestVertexKm(feature: PolygonFeature<unknown>, point: LatLon): number {
  let best = Infinity;
  for (const polygon of feature.polygons) for (const [lon, lat] of polygon[0]) {
    if (Math.abs(lat - point.lat) > 2) continue;
    const d = distanceKm(point, { lat, lon });
    if (d < best) best = d;
  }
  return best;
}

export async function countryAt(point: LatLon, maxKm = 40): Promise<CountryHit | null> {
  const [shapes, table] = await Promise.all([loadCountryShapes(), loadCountryTable()]);
  const inside = shapes.find((shape) => featureContains(shape, point.lon, point.lat));
  const resolve = (props: CountryShapeProps) => (props.a2 ? table.byA2.get(props.a2) ?? null : table.byA3.get(props.a3) ?? null);
  if (inside) return { country: resolve(inside.properties), shape: inside.properties, match: 'inside', distanceKm: 0 };
  let best: { shape: PolygonFeature<CountryShapeProps>; km: number } | null = null;
  const pad = 1;
  for (const shape of shapes) {
    const [a, b, c, d] = shape.bbox;
    if (point.lon < a - pad || point.lon > c + pad || point.lat < b - pad || point.lat > d + pad) continue;
    const km = nearestVertexKm(shape, point);
    if (km <= maxKm && (!best || km < best.km)) best = { shape, km };
  }
  return best ? { country: resolve(best.shape.properties), shape: best.shape.properties, match: 'nearest', distanceKm: best.km } : null;
}

export interface TimezoneHit { zone: string; match: 'polygon' | 'nautical' }

export async function timezoneAt(point: LatLon): Promise<TimezoneHit> {
  const zones = await loadTimezones();
  // Zones are sorted by name; where simplified polygons overlap, prefer the smallest (most specific) one.
  let hit: PolygonFeature<TimezoneProps> | null = null;
  let hitArea = Infinity;
  for (const zone of zones) {
    if (!featureContains(zone, point.lon, point.lat)) continue;
    const area = (zone.bbox[2] - zone.bbox[0]) * (zone.bbox[3] - zone.bbox[1]);
    if (area < hitArea) { hit = zone; hitArea = area; }
  }
  return hit ? { zone: hit.properties.tz, match: 'polygon' } : { zone: nauticalZone(point.lon), match: 'nautical' };
}

export interface NearbyPlace extends PlaceRecord { distanceKm: number }

export async function placesNear(point: LatLon, radiusKm: number, limit = 100): Promise<NearbyPlace[]> {
  const places = await loadPlaces();
  const latPad = radiusKm / 110.574;
  const cos = Math.cos((point.lat * Math.PI) / 180);
  const lonPad = cos > 1e-6 ? radiusKm / (111.32 * cos) : 360;
  const out: NearbyPlace[] = [];
  for (const place of places) {
    if (Math.abs(place.lat - point.lat) > latPad) continue;
    const dLon = Math.abs(place.lon - point.lon);
    if (Math.min(dLon, 360 - dLon) > lonPad) continue;
    const d = distanceKm(point, place);
    if (d <= radiusKm) out.push({ ...place, distanceKm: d });
  }
  return out.sort((a, b) => a.distanceKm - b.distanceKm).slice(0, limit);
}

export const normalizeName = (name: string) => name
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/\b(state|province|region|oblast|prefecture|county|department|land|voivodeship|governorate|of|the|de|du|la|le)\b/g, ' ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export async function admin1Match(countryCode: string, name: string): Promise<{ code: string; name: string; geonameId: number } | null> {
  const table = await loadAdmin1();
  const prefix = `${countryCode.toUpperCase()}.`;
  const target = normalizeName(name);
  if (!target) return null;
  let partial: { code: string; name: string; geonameId: number } | null = null;
  for (const [code, [entryName, geonameId]] of Object.entries(table)) {
    if (!code.startsWith(prefix)) continue;
    const normalized = normalizeName(entryName);
    if (normalized === target || code === `${prefix}${name.toUpperCase()}`) return { code, name: entryName, geonameId };
    if (!partial && normalized && (normalized.includes(target) || target.includes(normalized))) partial = { code, name: entryName, geonameId };
  }
  return partial;
}

export const flagEmoji = (a2: string | null | undefined) => (a2 && /^[A-Z]{2}$/.test(a2)
  ? String.fromCodePoint(...[...a2].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
  : '');

export function currencySymbol(code: string | null): string | null {
  if (!code) return null;
  try {
    return new Intl.NumberFormat('en', { style: 'currency', currency: code, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((part) => part.type === 'currency')?.value ?? null;
  } catch { return null; }
}

export function languageNames(tags: string[]): string[] {
  let display: Intl.DisplayNames | null = null;
  try { display = new Intl.DisplayNames(['en'], { type: 'language' }); } catch { display = null; }
  return tags.map((tag) => { try { return display?.of(tag) ?? tag; } catch { return tag; } });
}

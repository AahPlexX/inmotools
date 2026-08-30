import { feature } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, quantile, simplify } from 'topojson-simplify';

export type GeoSimplifyOptions = { decimals: number; retain: number; output: 'geojson' | 'topojson' };
type JsonObject = Record<string, any>;

function roundNumber(value: number, decimals: number) {
  const factor = 10 ** Math.max(0, Math.min(12, Math.trunc(decimals)));
  return Math.round((value + Number.EPSILON) * factor) / factor;
}
function roundCoordinates(value: unknown, decimals: number): unknown {
  if (!Array.isArray(value)) return value;
  if (value.length > 0 && value.every((item) => typeof item === 'number')) return value.map((item) => roundNumber(item as number, decimals));
  return value.map((item) => roundCoordinates(item, decimals));
}
function roundGeometry(geometry: JsonObject | null, decimals: number): JsonObject | null {
  if (!geometry) return geometry;
  if (geometry.type === 'GeometryCollection') return { ...geometry, geometries: (geometry.geometries ?? []).map((item: JsonObject) => roundGeometry(item, decimals)) };
  return { ...geometry, coordinates: roundCoordinates(geometry.coordinates, decimals) };
}

export function roundGeoCoordinates<T extends JsonObject>(input: T, decimals: number): T {
  if (input.type === 'FeatureCollection') return { ...input, features: (input.features ?? []).map((item: JsonObject) => ({ ...item, geometry: roundGeometry(item.geometry, decimals) })) } as T;
  if (input.type === 'Feature') return { ...input, geometry: roundGeometry(input.geometry, decimals) } as T;
  return roundGeometry(input, decimals) as T;
}

function countCoordinateArray(value: unknown): number {
  if (!Array.isArray(value)) return 0;
  if (value.length > 0 && value.every((item) => typeof item === 'number')) return 1;
  return value.reduce((total, item) => total + countCoordinateArray(item), 0);
}
export function countCoordinates(input: JsonObject | null): number {
  if (!input) return 0;
  if (input.type === 'FeatureCollection') return (input.features ?? []).reduce((sum: number, item: JsonObject) => sum + countCoordinates(item), 0);
  if (input.type === 'Feature') return countCoordinates(input.geometry);
  if (input.type === 'GeometryCollection') return (input.geometries ?? []).reduce((sum: number, item: JsonObject) => sum + countCoordinates(item), 0);
  return countCoordinateArray(input.coordinates);
}

export function simplifyTopology<T extends JsonObject>(input: T, options: GeoSimplifyOptions) {
  const rounded = roundGeoCoordinates(input, options.decimals);
  const originalCoordinateCount = countCoordinates(rounded);
  const generated = topology({ data: rounded });
  const retain = Math.max(0, Math.min(1, options.retain));
  let simplified = generated;
  if (retain < 1 && generated.arcs?.length) {
    const prepared = presimplify(generated);
    const threshold = quantile(prepared, Math.max(0, Math.min(1, 1 - retain)));
    simplified = simplify(prepared, threshold);
  }
  const geojson = feature(simplified, simplified.objects.data) as unknown as T;
  return {
    originalCoordinateCount,
    outputCoordinateCount: countCoordinates(geojson),
    geojson: options.output === 'geojson' ? geojson : undefined,
    topojson: options.output === 'topojson' ? simplified : undefined,
  };
}

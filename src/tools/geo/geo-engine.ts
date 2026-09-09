import { feature } from 'topojson-client';
import { topology } from 'topojson-server';
import { presimplify, quantile, simplify } from 'topojson-simplify';

export type GeoSimplifyOptions = { decimals: number; retain: number; output: 'geojson' | 'topojson' };
type JsonObject = Record<string, any>;
export type GeoBounds = { minX: number; minY: number; maxX: number; maxY: number };
export type GeoValidation = { valid: boolean; errors: string[]; warnings: string[]; featureCount: number; coordinateCount: number; bounds: GeoBounds | null };
const GEOMETRY_TYPES = new Set(['Point','MultiPoint','LineString','MultiLineString','Polygon','MultiPolygon','GeometryCollection']);
const GEO_TYPES = new Set([...GEOMETRY_TYPES,'Feature','FeatureCollection']);

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

function visitPositions(value: unknown, visitor: (position: number[]) => void): void {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && value.every((item) => typeof item === 'number')) { visitor(value as number[]); return; }
  for (const child of value) visitPositions(child, visitor);
}

function visitGeometry(geometry: any, visitor: (position: number[]) => void): void {
  if (!geometry) return;
  if (geometry.type === 'GeometryCollection') { for (const child of geometry.geometries ?? []) visitGeometry(child, visitor); return; }
  visitPositions(geometry.coordinates, visitor);
}

function visitGeo(input: any, visitor: (position: number[]) => void): void {
  if (!input) return;
  if (input.type === 'FeatureCollection') { for (const item of input.features ?? []) visitGeo(item, visitor); return; }
  if (input.type === 'Feature') { visitGeometry(input.geometry, visitor); return; }
  visitGeometry(input, visitor);
}

export function countCoordinates(input: JsonObject | null): number {
  let count = 0;
  visitGeo(input, () => { count += 1; });
  return count;
}

export function computeGeoBounds(input: JsonObject | null): GeoBounds | null {
  let bounds: GeoBounds | null = null;
  visitGeo(input, (position) => {
    const x = position[0];
    const y = position[1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    if (!bounds) bounds = { minX: x, minY: y, maxX: x, maxY: y };
    else {
      if (x < bounds.minX) bounds.minX = x;
      if (x > bounds.maxX) bounds.maxX = x;
      if (y < bounds.minY) bounds.minY = y;
      if (y > bounds.maxY) bounds.maxY = y;
    }
  });
  return bounds;
}

function positionsEqual(first: number[], last: number[]): boolean {
  return first.length === last.length && first.every((value, index) => value === last[index]);
}

export function validateGeoJson(input: unknown): GeoValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  let featureCount = 0;
  let coordinateCount = 0;
  let bounds: GeoBounds | null = null;

  const inspectPosition = (position: unknown, path: string): position is number[] => {
    if (!Array.isArray(position) || position.length < 2) {
      errors.push(`${path} must be a position with at least two numeric elements.`);
      return false;
    }
    if (!position.every((value) => typeof value === 'number' && Number.isFinite(value))) {
      errors.push(`${path} contains a non-finite coordinate.`);
      return false;
    }
    coordinateCount += 1;
    const [x, y] = position as number[];
    if (!bounds) bounds = { minX: x, minY: y, maxX: x, maxY: y };
    else {
      bounds.minX = Math.min(bounds.minX, x);
      bounds.maxX = Math.max(bounds.maxX, x);
      bounds.minY = Math.min(bounds.minY, y);
      bounds.maxY = Math.max(bounds.maxY, y);
    }
    if (position.length > 3) warnings.push(`${path} has ${position.length} elements; RFC 7946 recommends no more than three.`);
    if (y < -90 || y > 90) warnings.push(`${path} latitude ${y} is outside the WGS84 latitude range.`);
    return true;
  };

  const requireArray = (value: unknown, path: string): value is unknown[] => {
    if (!Array.isArray(value)) {
      errors.push(`${path} must be an array.`);
      return false;
    }
    return true;
  };

  const inspectLine = (value: unknown, path: string) => {
    if (!requireArray(value, path)) return;
    if (value.length < 2) errors.push(`${path} for a LineString must contain at least two positions.`);
    value.forEach((position, index) => inspectPosition(position, `${path}[${index}]`));
  };

  const inspectRing = (value: unknown, path: string) => {
    if (!requireArray(value, path)) return;
    if (value.length < 4) errors.push(`${path} linear ring must contain at least four positions.`);
    const validPositions = value.map((position, index) => inspectPosition(position, `${path}[${index}]`));
    if (value.length >= 2 && validPositions[0] && validPositions[validPositions.length - 1] && !positionsEqual(value[0] as number[], value[value.length - 1] as number[])) {
      errors.push(`${path} linear ring must be closed with identical first and last positions.`);
    }
  };

  const inspectGeometry = (geometry: any, path: string) => {
    if (geometry === null) return;
    if (!geometry || typeof geometry !== 'object' || Array.isArray(geometry)) {
      errors.push(`${path} must be a geometry object or null.`);
      return;
    }
    if (!GEOMETRY_TYPES.has(geometry.type)) {
      errors.push(`${path}.type is not a supported GeoJSON geometry type.`);
      return;
    }

    switch (geometry.type) {
      case 'Point':
        inspectPosition(geometry.coordinates, `${path}.coordinates`);
        break;
      case 'MultiPoint':
        if (requireArray(geometry.coordinates, `${path}.coordinates`)) geometry.coordinates.forEach((position: unknown, index: number) => inspectPosition(position, `${path}.coordinates[${index}]`));
        break;
      case 'LineString':
        inspectLine(geometry.coordinates, `${path}.coordinates`);
        break;
      case 'MultiLineString':
        if (requireArray(geometry.coordinates, `${path}.coordinates`)) geometry.coordinates.forEach((line: unknown, index: number) => inspectLine(line, `${path}.coordinates[${index}]`));
        break;
      case 'Polygon':
        if (requireArray(geometry.coordinates, `${path}.coordinates`)) geometry.coordinates.forEach((ring: unknown, index: number) => inspectRing(ring, `${path}.coordinates[${index}]`));
        break;
      case 'MultiPolygon':
        if (requireArray(geometry.coordinates, `${path}.coordinates`)) geometry.coordinates.forEach((polygon: unknown, polygonIndex: number) => {
          if (!requireArray(polygon, `${path}.coordinates[${polygonIndex}]`)) return;
          polygon.forEach((ring: unknown, ringIndex: number) => inspectRing(ring, `${path}.coordinates[${polygonIndex}][${ringIndex}]`));
        });
        break;
      case 'GeometryCollection':
        if (!Array.isArray(geometry.geometries)) errors.push(`${path}.geometries must be an array.`);
        else geometry.geometries.forEach((child: any, index: number) => inspectGeometry(child, `${path}.geometries[${index}]`));
        break;
    }
  };

  const inspect = (value: any, path = 'root') => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      errors.push(`${path} must be a GeoJSON object.`);
      return;
    }
    if (!GEO_TYPES.has(value.type)) {
      errors.push(`${path}.type must be a GeoJSON type.`);
      return;
    }
    if (value.type === 'FeatureCollection') {
      if (!Array.isArray(value.features)) {
        errors.push(`${path}.features must be an array.`);
        return;
      }
      value.features.forEach((child: any, index: number) => {
        if (child?.type !== 'Feature') errors.push(`${path}.features[${index}] must be a Feature.`);
        else inspect(child, `${path}.features[${index}]`);
      });
      return;
    }
    if (value.type === 'Feature') {
      featureCount += 1;
      if (!('properties' in value) || (value.properties !== null && (typeof value.properties !== 'object' || Array.isArray(value.properties)))) errors.push(`${path}.properties must be an object or null.`);
      inspectGeometry(value.geometry, `${path}.geometry`);
      return;
    }
    inspectGeometry(value, path);
  };

  inspect(input);
  return { valid: errors.length === 0, errors, warnings: [...new Set(warnings)], featureCount, coordinateCount, bounds };
}

type ExtraDimensionIndex = { byXY: Map<string, number[]>; conflict: boolean };

function coordinateKey(position: number[]): string {
  return JSON.stringify([position[0], position[1]]);
}

function collectExtraDimensions(input: JsonObject): ExtraDimensionIndex {
  const byXY = new Map<string, number[]>();
  let conflict = false;
  visitGeo(input, (position) => {
    const key = coordinateKey(position);
    const extras = position.slice(2);
    const prior = byXY.get(key);
    if (!prior) byXY.set(key, extras);
    else if (prior.length !== extras.length || prior.some((value, index) => value !== extras[index])) conflict = true;
  });
  return { byXY, conflict };
}

function restoreArcDimensions(topologyObject: any, extras: ExtraDimensionIndex): any {
  if (!topologyObject?.arcs?.length) return topologyObject;
  const arcs = topologyObject.arcs.map((arc: number[][]) => arc.map((position: number[]) => {
    const additional = extras.byXY.get(coordinateKey(position)) ?? [];
    return additional.length ? [position[0], position[1], ...additional] : [position[0], position[1]];
  }));
  return { ...topologyObject, arcs };
}

function preserveRootShape(input: JsonObject, converted: any): JsonObject {
  if (GEOMETRY_TYPES.has(input.type) && converted?.type === 'Feature') return converted.geometry as JsonObject;
  return converted as JsonObject;
}

function featureGeometries(input: JsonObject): Array<JsonObject | null> {
  if (input.type === 'FeatureCollection') return (input.features ?? []).map((item: JsonObject) => item.geometry ?? null);
  if (input.type === 'Feature') return [input.geometry ?? null];
  return [];
}

function countCollapsedFeatures(input: JsonObject, output: JsonObject): number {
  const before = featureGeometries(input);
  const after = featureGeometries(output);
  return before.reduce((count, geometry, index) => {
    const hadGeometry = geometry !== null && countCoordinates(geometry) > 0;
    const next = after[index] ?? null;
    const lostGeometry = next === null || countCoordinates(next) === 0;
    return count + (hadGeometry && lostGeometry ? 1 : 0);
  }, 0);
}

export function simplifyTopology<T extends JsonObject>(input: T, options: GeoSimplifyOptions) {
  const validation = validateGeoJson(input);
  if (!validation.valid) throw new Error(`Invalid GeoJSON: ${validation.errors[0]}`);

  const decimals = Math.max(0, Math.min(12, Math.trunc(options.decimals)));
  const retain = Math.max(0, Math.min(1, options.retain));
  const rounded = roundGeoCoordinates(input, decimals);
  const originalCoordinateCount = countCoordinates(rounded);
  const extras = collectExtraDimensions(rounded);
  const topologyRequired = options.output === 'topojson' || retain < 1;

  if (extras.conflict && topologyRequired) {
    throw new Error('This GeoJSON contains the same horizontal position with conflicting altitude or additional dimensions. Topology-based simplification compares positions by X/Y, so processing it would be lossy; normalize those 3D positions first or export unsimplified GeoJSON.');
  }

  let geojson: T;
  let topojson: any | undefined;

  if (!topologyRequired) {
    geojson = rounded;
  } else {
    const generated = topology({ data: rounded });
    let processed: any = generated;
    if (retain < 1 && generated.arcs?.length) {
      const prepared = presimplify(generated);
      const threshold = quantile(prepared, Math.max(0, Math.min(1, 1 - retain)));
      processed = simplify(prepared, threshold);
      processed = restoreArcDimensions(processed, extras);
    }
    const converted = feature(processed, processed.objects.data) as unknown as JsonObject;
    geojson = preserveRootShape(input, converted) as T;
    if (options.output === 'topojson') topojson = processed;
  }

  const outputValidation = validateGeoJson(geojson);
  if (!outputValidation.valid) throw new Error(`Simplification produced invalid GeoJSON: ${outputValidation.errors[0]}`);

  const collapsedFeatureCount = countCollapsedFeatures(rounded, geojson);
  return {
    originalCoordinateCount,
    outputCoordinateCount: countCoordinates(geojson),
    geojson,
    topojson,
    bounds: computeGeoBounds(geojson),
    outputValidation,
    collapsedFeatureCount,
    rootShape: `${input.type} → ${geojson.type}`,
  };
}

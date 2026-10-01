// geoBoundaries (gbOpen) administrative boundaries, fetched only on request.

import { TTL, type HttpClient } from '../net/http';
import { enc } from './common';

export type AdmLevel = 'ADM0' | 'ADM1' | 'ADM2';

export interface BoundaryMeta {
  boundaryID: string;
  boundaryName: string;
  boundaryISO: string;
  boundaryType: string;
  boundaryYearRepresented: string;
  boundarySource: string;
  boundaryLicense: string;
  licenseSource: string;
  admUnitCount?: string;
  simplifiedGeometryGeoJSON: string;
  gjDownloadURL: string;
}

export interface BoundaryFeature {
  type: 'Feature';
  properties: { shapeName?: string; shapeISO?: string; shapeID?: string; shapeGroup?: string; shapeType?: string };
  geometry: { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] };
}

export interface BoundaryLayer {
  meta: BoundaryMeta;
  features: BoundaryFeature[];
  retrievedAt: string;
  stale: boolean;
}

/**
 * geoBoundaries links point at github.com/…/raw/…, which answers with a
 * redirect that carries an empty Access-Control-Allow-Origin header, so browsers
 * refuse it. The redirect target on media.githubusercontent.com is CORS-enabled.
 */
export function corsSafeGithubUrl(url: string): string {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/raw\/([^/]+)\/(.+)$/.exec(url);
  return match ? `https://media.githubusercontent.com/media/${match[1]}/${match[2]}/${match[3]}/${match[4]}` : url;
}

export async function boundaryMeta(client: HttpClient, iso3: string, level: AdmLevel, signal?: AbortSignal): Promise<BoundaryMeta> {
  const url = `https://www.geoboundaries.org/api/current/gbOpen/${enc(iso3)}/${level}/`;
  return (await client.get<BoundaryMeta>(url, { source: 'geoboundaries', ttlMs: TTL.month, signal })).data;
}

export async function boundaryLayer(client: HttpClient, iso3: string, level: AdmLevel, signal?: AbortSignal): Promise<BoundaryLayer> {
  const meta = await boundaryMeta(client, iso3, level, signal);
  const url = corsSafeGithubUrl(meta.simplifiedGeometryGeoJSON || meta.gjDownloadURL);
  const response = await client.get<{ features: BoundaryFeature[] }>(url, { source: 'geoboundaries', ttlMs: TTL.month, signal });
  const features = (response.data.features ?? []).filter((item) => item.geometry && (item.geometry.type === 'Polygon' || item.geometry.type === 'MultiPolygon'));
  return { meta, features, retrievedAt: response.retrievedAt, stale: response.stale };
}

function rayCast(lon: number, lat: number, ring: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]; const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Rings that cross the ±180° seam (e.g. Fiji) are unwrapped into continuous longitudes
 * (e.g. 179.5 → 180.5), and the point is then tested at λ and λ ± 360°.
 */
function inRing(lon: number, lat: number, ring: number[][]): boolean {
  const crosses = ring.some((point, i) => i > 0 && Math.abs(point[0] - ring[i - 1][0]) > 180);
  if (!crosses) return rayCast(lon, lat, ring);
  let offset = 0;
  const unwrapped = ring.map((point, i) => {
    if (i > 0) {
      const step = point[0] - ring[i - 1][0];
      if (step > 180) offset -= 360; else if (step < -180) offset += 360;
    }
    return [point[0] + offset, point[1]];
  });
  return [lon, lon + 360, lon - 360].some((candidate) => rayCast(candidate, lat, unwrapped));
}

export function polygonContains(geometry: BoundaryFeature['geometry'], lon: number, lat: number): boolean {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((rings) => inRing(lon, lat, rings[0]) && !rings.slice(1).some((hole) => inRing(lon, lat, hole)));
}

export function featureAt(layer: BoundaryLayer, lon: number, lat: number): BoundaryFeature | null {
  return layer.features.find((item) => polygonContains(item.geometry, lon, lat)) ?? null;
}

export function boundaryAttribution(meta: BoundaryMeta): string {
  return `${meta.boundaryType} boundaries for ${meta.boundaryName} (${meta.boundaryYearRepresented}) from geoBoundaries; source: ${meta.boundarySource}; license: ${meta.boundaryLicense}`;
}

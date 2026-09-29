// Spherical geodesy on the IUGG mean Earth radius. Accuracy is ~0.5% versus the
// WGS 84 ellipsoid, which the UI states next to every distance/area result.

import type { BBox, LatLon } from './types';

export const EARTH_RADIUS_KM = 6371.0088;
export const KM_PER_MILE = 1.609344;
export const FEET_PER_METRE = 1 / 0.3048;
export const KM2_PER_MI2 = KM_PER_MILE * KM_PER_MILE;

const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function normalizeLon(lon: number): number {
  const wrapped = ((((lon + 180) % 360) + 360) % 360) - 180;
  return wrapped === -180 && lon > 0 ? 180 : wrapped;
}

export function isValidLatLon(point: Partial<LatLon> | null | undefined): point is LatLon {
  return !!point && Number.isFinite(point.lat) && Number.isFinite(point.lon)
    && (point.lat as number) >= -90 && (point.lat as number) <= 90
    && (point.lon as number) >= -180 && (point.lon as number) <= 180;
}

/** Great-circle distance (haversine), kilometres. */
export function distanceKm(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial great-circle bearing from a to b, degrees clockwise from true north in [0, 360). */
export function initialBearing(a: LatLon, b: LatLon): number {
  const φ1 = toRad(a.lat); const φ2 = toRad(b.lat); const Δλ = toRad(b.lon - a.lon);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Bearing on arrival at b, degrees in [0, 360). */
export function finalBearing(a: LatLon, b: LatLon): number {
  return (initialBearing(b, a) + 180) % 360;
}

export function midpoint(a: LatLon, b: LatLon): LatLon {
  const φ1 = toRad(a.lat); const λ1 = toRad(a.lon); const φ2 = toRad(b.lat); const Δλ = toRad(b.lon - a.lon);
  const bx = Math.cos(φ2) * Math.cos(Δλ);
  const by = Math.cos(φ2) * Math.sin(Δλ);
  const φ3 = Math.atan2(Math.sin(φ1) + Math.sin(φ2), Math.sqrt((Math.cos(φ1) + bx) ** 2 + by ** 2));
  const λ3 = λ1 + Math.atan2(by, Math.cos(φ1) + bx);
  return { lat: toDeg(φ3), lon: normalizeLon(toDeg(λ3)) };
}

/** Point reached travelling distanceKm from start on the given initial bearing. */
export function destination(start: LatLon, bearingDeg: number, distance: number): LatLon {
  const δ = distance / EARTH_RADIUS_KM; const θ = toRad(bearingDeg);
  const φ1 = toRad(start.lat); const λ1 = toRad(start.lon);
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 = λ1 + Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return { lat: toDeg(φ2), lon: normalizeLon(toDeg(λ2)) };
}

/** Points along the great circle a→b (inclusive), for drawing arcs. */
export function greatCirclePoints(a: LatLon, b: LatLon, segments = 64): LatLon[] {
  const φ1 = toRad(a.lat); const λ1 = toRad(a.lon); const φ2 = toRad(b.lat); const λ2 = toRad(b.lon);
  const d = distanceKm(a, b) / EARTH_RADIUS_KM;
  if (d === 0) return [a, b];
  const points: LatLon[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const f = i / segments;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
    const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
    const z = A * Math.sin(φ1) + B * Math.sin(φ2);
    points.push({ lat: toDeg(Math.atan2(z, Math.sqrt(x * x + y * y))), lon: toDeg(Math.atan2(y, x)) });
  }
  return points;
}

const COMPASS = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
export function compassPoint(bearingDeg: number): string {
  return COMPASS[Math.round((((bearingDeg % 360) + 360) % 360) / 22.5) % 16];
}

/** Width of a bbox in degrees of longitude, handling antimeridian crossing (west > east). */
export function bboxLonSpan(box: BBox): number {
  return box.east >= box.west ? box.east - box.west : box.east + 360 - box.west;
}

/** Exact area of a latitude/longitude rectangle on the sphere, km². */
export function bboxAreaKm2(box: BBox): number {
  const span = toRad(bboxLonSpan(box));
  return EARTH_RADIUS_KM ** 2 * span * Math.abs(Math.sin(toRad(box.north)) - Math.sin(toRad(box.south)));
}

export function normalizeBBox(a: LatLon, b: LatLon): BBox {
  return {
    south: Math.min(a.lat, b.lat), north: Math.max(a.lat, b.lat),
    west: Math.min(a.lon, b.lon), east: Math.max(a.lon, b.lon),
  };
}

export function bboxContains(box: BBox, point: LatLon): boolean {
  if (point.lat < box.south || point.lat > box.north) return false;
  return box.east >= box.west ? point.lon >= box.west && point.lon <= box.east : point.lon >= box.west || point.lon <= box.east;
}

/**
 * Area of a simple polygon ring on the sphere, km² (spherical excess via the
 * trapezoid formula used by d3-geo/turf). Ring may be open or closed.
 */
export function ringAreaKm2(ring: LatLon[]): number {
  if (ring.length < 3) return 0;
  let total = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const p1 = ring[i]; const p2 = ring[(i + 1) % ring.length];
    total += toRad(p2.lon - p1.lon) * (2 + Math.sin(toRad(p1.lat)) + Math.sin(toRad(p2.lat)));
  }
  return Math.abs((total * EARTH_RADIUS_KM ** 2) / 2);
}

export const kmToMiles = (km: number) => km / KM_PER_MILE;
export const metresToFeet = (m: number) => m * FEET_PER_METRE;
export const km2ToMi2 = (km2: number) => km2 / KM2_PER_MI2;

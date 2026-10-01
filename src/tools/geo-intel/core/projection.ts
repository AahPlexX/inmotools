// Equal Earth projection (Šavrič, Patterson & Jenny, 2018), forward and inverse.
// Output units are "projected radians"; `SCALE` maps them to SVG user units.

const A1 = 1.340264;
const A2 = -0.081106;
const A3 = 0.000893;
const A4 = 0.003796;
const M = Math.sqrt(3) / 2;
const EPSILON = 1e-12;

export const SCALE = 180;

export function projectRaw(lonDeg: number, latDeg: number): [number, number] {
  const λ = (lonDeg * Math.PI) / 180;
  const φ = (latDeg * Math.PI) / 180;
  const l = Math.asin(M * Math.sin(φ));
  const l2 = l * l;
  const l6 = l2 * l2 * l2;
  const x = (λ * Math.cos(l)) / (M * (A1 + 3 * A2 * l2 + l6 * (7 * A3 + 9 * A4 * l2)));
  const y = l * (A1 + A2 * l2 + l6 * (A3 + A4 * l2));
  return [x, y];
}

export function invertRaw(x: number, y: number): [number, number] | null {
  let l = y;
  let l2 = l * l;
  let l6 = l2 * l2 * l2;
  for (let i = 0; i < 12; i += 1) {
    const fy = l * (A1 + A2 * l2 + l6 * (A3 + A4 * l2)) - y;
    const fpy = A1 + 3 * A2 * l2 + l6 * (7 * A3 + 9 * A4 * l2);
    const delta = fy / fpy;
    l -= delta;
    l2 = l * l;
    l6 = l2 * l2 * l2;
    if (Math.abs(delta) < EPSILON) break;
  }
  const sinPhi = Math.sin(l) / M;
  if (Math.abs(sinPhi) > 1) return null;
  const λ = (M * x * (A1 + 3 * A2 * l2 + l6 * (7 * A3 + 9 * A4 * l2))) / Math.cos(l);
  if (Math.abs(λ) > Math.PI + 1e-9) return null;
  return [(λ * 180) / Math.PI, (Math.asin(sinPhi) * 180) / Math.PI];
}

/** SVG coordinates: x grows east, y grows south (screen orientation). */
export function project(lon: number, lat: number): [number, number] {
  const [x, y] = projectRaw(lon, lat);
  return [x * SCALE, -y * SCALE];
}

export function invert(svgX: number, svgY: number): { lat: number; lon: number } | null {
  const result = invertRaw(svgX / SCALE, -svgY / SCALE);
  return result ? { lon: result[0], lat: result[1] } : null;
}

const [MAX_X] = projectRaw(180, 0);
const [, MAX_Y] = projectRaw(0, 90);
/** Full-world extent in SVG units: [minX, minY, width, height]. */
export const WORLD_EXTENT: [number, number, number, number] = [-MAX_X * SCALE, -MAX_Y * SCALE, 2 * MAX_X * SCALE, 2 * MAX_Y * SCALE];

/** SVG path for one ring of [lon, lat] positions. */
export function ringPath(ring: ArrayLike<ArrayLike<number>>): string {
  let d = '';
  for (let i = 0; i < ring.length; i += 1) {
    const [x, y] = project(ring[i][0], ring[i][1]);
    d += `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }
  return `${d}Z`;
}

/** Open polyline path for [lon, lat] positions, split where it jumps across the antimeridian. */
export function linePath(points: Array<{ lat: number; lon: number }>): string {
  let d = '';
  for (let i = 0; i < points.length; i += 1) {
    const [x, y] = project(points[i].lon, points[i].lat);
    const jump = i > 0 && Math.abs(points[i].lon - points[i - 1].lon) > 180;
    d += `${i === 0 || jump ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
  }
  return d;
}

type Geometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }
  | { type: string; coordinates?: unknown };

export function geometryPath(geometry: Geometry | null | undefined): string {
  if (!geometry) return '';
  if (geometry.type === 'Polygon') return (geometry.coordinates as number[][][]).map(ringPath).join('');
  if (geometry.type === 'MultiPolygon') return (geometry.coordinates as number[][][][]).map((polygon) => polygon.map(ringPath).join('')).join('');
  return '';
}

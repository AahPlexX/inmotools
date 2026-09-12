import type { Mat3, UnitCell, Vec3 } from './crystal-types';

const DEG_TO_RAD = Math.PI / 180;
const CELL_EPSILON = 1e-12;

interface CellGeometryTerms {
  readonly cosAlpha: number;
  readonly cosBeta: number;
  readonly cosGamma: number;
  readonly sinGamma: number;
  readonly volumeFactor: number;
}

const dot = (left: Vec3, right: Vec3): number =>
  left[0] * right[0] + left[1] * right[1] + left[2] * right[2];

const cross = (left: Vec3, right: Vec3): Vec3 => [
  left[1] * right[2] - left[2] * right[1],
  left[2] * right[0] - left[0] * right[2],
  left[0] * right[1] - left[1] * right[0],
];

const scale = (vector: Vec3, factor: number): Vec3 => [
  vector[0] * factor,
  vector[1] * factor,
  vector[2] * factor,
];

function geometryTerms(cell: UnitCell): CellGeometryTerms {
  const alpha = cell.alpha * DEG_TO_RAD;
  const beta = cell.beta * DEG_TO_RAD;
  const gamma = cell.gamma * DEG_TO_RAD;
  const cosAlpha = Math.cos(alpha);
  const cosBeta = Math.cos(beta);
  const cosGamma = Math.cos(gamma);
  const sinGamma = Math.sin(gamma);
  const volumeFactor = 1
    + 2 * cosAlpha * cosBeta * cosGamma
    - cosAlpha * cosAlpha
    - cosBeta * cosBeta
    - cosGamma * cosGamma;

  return { cosAlpha, cosBeta, cosGamma, sinGamma, volumeFactor };
}

export function validateCell(cell: UnitCell): { ok: true } | { ok: false; error: string } {
  const lengths = [cell.a, cell.b, cell.c];
  if (!lengths.every(Number.isFinite)) return { ok: false, error: 'Cell lengths must be finite numbers.' };
  if (!lengths.every((value) => value > 0)) return { ok: false, error: 'Cell lengths must be greater than zero.' };

  const angles = [cell.alpha, cell.beta, cell.gamma];
  if (!angles.every(Number.isFinite)) return { ok: false, error: 'Cell angles must be finite numbers.' };
  if (!angles.every((value) => value > 0 && value < 180)) {
    return { ok: false, error: 'Cell angles must be greater than 0° and less than 180°.' };
  }

  const { sinGamma, volumeFactor } = geometryTerms(cell);
  if (Math.abs(sinGamma) <= CELL_EPSILON || volumeFactor <= CELL_EPSILON) {
    return { ok: false, error: 'These lengths and angles do not define a non-singular three-dimensional cell.' };
  }

  return { ok: true };
}

function assertValidCell(cell: UnitCell): void {
  const validation = validateCell(cell);
  if (!validation.ok) throw new RangeError(validation.error);
}

export function cellToMatrix(cell: UnitCell): Mat3 {
  assertValidCell(cell);
  const { cosAlpha, cosBeta, cosGamma, sinGamma, volumeFactor } = geometryTerms(cell);
  const a: Vec3 = [cell.a, 0, 0];
  const b: Vec3 = [cell.b * cosGamma, cell.b * sinGamma, 0];
  const c: Vec3 = [
    cell.c * cosBeta,
    cell.c * (cosAlpha - cosBeta * cosGamma) / sinGamma,
    cell.c * Math.sqrt(volumeFactor) / sinGamma,
  ];
  return [a, b, c];
}

export function cellVolume(cell: UnitCell): number {
  assertValidCell(cell);
  const { volumeFactor } = geometryTerms(cell);
  return cell.a * cell.b * cell.c * Math.sqrt(volumeFactor);
}

export function metricTensor(cell: UnitCell): Mat3 {
  const [a, b, c] = cellToMatrix(cell);
  return [
    [dot(a, a), dot(a, b), dot(a, c)],
    [dot(b, a), dot(b, b), dot(b, c)],
    [dot(c, a), dot(c, b), dot(c, c)],
  ];
}

export function reciprocalMatrix(cell: UnitCell): Mat3 {
  const [a, b, c] = cellToMatrix(cell);
  const volume = dot(a, cross(b, c));
  if (!Number.isFinite(volume) || Math.abs(volume) <= CELL_EPSILON) {
    throw new RangeError('The unit-cell matrix is singular and has no reciprocal basis.');
  }

  return [
    scale(cross(b, c), 1 / volume),
    scale(cross(c, a), 1 / volume),
    scale(cross(a, b), 1 / volume),
  ];
}

export function reciprocalMetricTensor(cell: UnitCell): Mat3 {
  const [aStar, bStar, cStar] = reciprocalMatrix(cell);
  return [
    [dot(aStar, aStar), dot(aStar, bStar), dot(aStar, cStar)],
    [dot(bStar, aStar), dot(bStar, bStar), dot(bStar, cStar)],
    [dot(cStar, aStar), dot(cStar, bStar), dot(cStar, cStar)],
  ];
}

export function fractionalToCartesian(fractional: Vec3, cell: UnitCell): Vec3 {
  if (!fractional.every(Number.isFinite)) throw new RangeError('Fractional coordinates must be finite numbers.');
  const [a, b, c] = cellToMatrix(cell);
  return [
    fractional[0] * a[0] + fractional[1] * b[0] + fractional[2] * c[0],
    fractional[0] * a[1] + fractional[1] * b[1] + fractional[2] * c[1],
    fractional[0] * a[2] + fractional[1] * b[2] + fractional[2] * c[2],
  ];
}

export function cartesianToFractional(cartesian: Vec3, cell: UnitCell): Vec3 {
  if (!cartesian.every(Number.isFinite)) throw new RangeError('Cartesian coordinates must be finite numbers.');
  const reciprocal = reciprocalMatrix(cell);
  return [
    dot(cartesian, reciprocal[0]),
    dot(cartesian, reciprocal[1]),
    dot(cartesian, reciprocal[2]),
  ];
}

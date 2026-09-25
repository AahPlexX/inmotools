export type TopologyKind = 'face' | 'edge' | 'vertex';
export type Vec3 = readonly [number, number, number];

export interface TopologyBounds {
  min: Vec3;
  max: Vec3;
}

export interface CadTopologyRef {
  id: string;
  producerFeatureId: string;
  kind: TopologyKind;
  role: string;
  surfaceType?: string;
  curveType?: string;
  centroid?: Vec3;
  normal?: Vec3;
  axis?: Vec3;
  area?: number;
  length?: number;
  bounds?: TopologyBounds;
  adjacencyRoles?: string[];
  pickPoint?: Vec3;
}

export interface TopologyCandidate {
  id: string;
  producerFeatureId: string;
  kind: TopologyKind;
  surfaceType?: string;
  curveType?: string;
  centroid?: Vec3;
  normal?: Vec3;
  axis?: Vec3;
  area?: number;
  length?: number;
  bounds?: TopologyBounds;
  adjacencyRoles?: string[];
}

export type TopologyResolution =
  | { status: 'resolved'; candidate: TopologyCandidate; score: number }
  | { status: 'ambiguous'; candidates: TopologyCandidate[]; score: number }
  | { status: 'missing' };

function finite(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function distance(left: Vec3, right: Vec3): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function normalizedDirectionSimilarity(left: Vec3, right: Vec3): number {
  const leftLength = Math.hypot(...left);
  const rightLength = Math.hypot(...right);
  if (leftLength === 0 || rightLength === 0) return 0;
  const dot = (left[0] * right[0] + left[1] * right[1] + left[2] * right[2]) / (leftLength * rightLength);
  return Math.max(-1, Math.min(1, dot));
}

function scalarSimilarity(left: number, right: number): number {
  const scale = Math.max(Math.abs(left), Math.abs(right), 1e-9);
  return 1 - Math.min(1, Math.abs(left - right) / scale);
}

function setSimilarity(left: readonly string[], right: readonly string[]): number {
  if (!left.length && !right.length) return 1;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;
  for (const value of leftSet) if (rightSet.has(value)) intersection += 1;
  const union = new Set([...leftSet, ...rightSet]).size;
  return union ? intersection / union : 1;
}

function boundsDiagonal(bounds: TopologyBounds | undefined): number {
  return bounds ? Math.max(distance(bounds.min, bounds.max), 1) : 1;
}

export function scoreTopologyCandidate(reference: CadTopologyRef, candidate: TopologyCandidate): number {
  if (candidate.producerFeatureId !== reference.producerFeatureId || candidate.kind !== reference.kind) {
    return Number.NEGATIVE_INFINITY;
  }

  let score = 100;

  if (reference.surfaceType) score += candidate.surfaceType === reference.surfaceType ? 20 : -40;
  if (reference.curveType) score += candidate.curveType === reference.curveType ? 20 : -40;

  if (reference.centroid && candidate.centroid) {
    const scale = Math.max(boundsDiagonal(reference.bounds), boundsDiagonal(candidate.bounds));
    score += 20 * Math.max(0, 1 - distance(reference.centroid, candidate.centroid) / scale);
  }

  if (reference.normal && candidate.normal) score += 15 * normalizedDirectionSimilarity(reference.normal, candidate.normal);
  if (reference.axis && candidate.axis) score += 15 * Math.abs(normalizedDirectionSimilarity(reference.axis, candidate.axis));
  if (finite(reference.area) && finite(candidate.area)) score += 15 * scalarSimilarity(reference.area, candidate.area);
  if (finite(reference.length) && finite(candidate.length)) score += 15 * scalarSimilarity(reference.length, candidate.length);

  if (reference.bounds && candidate.bounds) {
    const scale = Math.max(boundsDiagonal(reference.bounds), boundsDiagonal(candidate.bounds));
    const error = distance(reference.bounds.min, candidate.bounds.min) + distance(reference.bounds.max, candidate.bounds.max);
    score += 15 * Math.max(0, 1 - error / (2 * scale));
  }

  if (reference.adjacencyRoles && candidate.adjacencyRoles) {
    score += 20 * setSimilarity(reference.adjacencyRoles, candidate.adjacencyRoles);
  }

  if (reference.pickPoint && candidate.centroid) {
    const scale = Math.max(boundsDiagonal(reference.bounds), boundsDiagonal(candidate.bounds));
    score += 5 * Math.max(0, 1 - distance(reference.pickPoint, candidate.centroid) / scale);
  }

  return score;
}

export function resolveTopologyRef(reference: CadTopologyRef, candidates: readonly TopologyCandidate[]): TopologyResolution {
  const scored = candidates
    .map((candidate) => ({ candidate, score: scoreTopologyCandidate(reference, candidate) }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((left, right) => right.score - left.score || left.candidate.id.localeCompare(right.candidate.id));

  const best = scored[0];
  if (!best) return { status: 'missing' };

  const ambiguityEpsilon = 1e-9;
  const equallyPlausible = scored.filter((entry) => Math.abs(entry.score - best.score) <= ambiguityEpsilon);
  if (equallyPlausible.length > 1) {
    return {
      status: 'ambiguous',
      candidates: equallyPlausible.map((entry) => entry.candidate),
      score: best.score,
    };
  }

  return { status: 'resolved', candidate: best.candidate, score: best.score };
}

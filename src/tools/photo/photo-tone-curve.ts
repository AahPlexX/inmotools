import type { TonePoint } from './photo-types';

const MIN_POINT_GAP = 0.005;
const MAX_TONE_POINTS = 16;

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function clone(points: readonly TonePoint[]): TonePoint[] {
  return points.map((point) => ({ x: point.x, y: point.y }));
}

export function canonicalToneCurve(points: readonly TonePoint[]): TonePoint[] {
  const source = points.length >= 2 ? clone(points) : [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  const sorted = source
    .map((point) => ({ x: clamp01(point.x), y: clamp01(point.y) }))
    .sort((a, b) => a.x - b.x)
    .slice(0, MAX_TONE_POINTS);

  sorted[0] = { x: 0, y: sorted[0]?.y ?? 0 };
  sorted[sorted.length - 1] = { x: 1, y: sorted.at(-1)?.y ?? 1 };

  for (let index = 1; index < sorted.length - 1; index += 1) {
    const lower = sorted[index - 1].x + MIN_POINT_GAP;
    const upper = sorted[index + 1]?.x - MIN_POINT_GAP ?? 1 - MIN_POINT_GAP;
    sorted[index].x = Math.min(upper, Math.max(lower, sorted[index].x));
  }

  return sorted;
}

export function addTonePoint(points: readonly TonePoint[], x: number, y: number): TonePoint[] {
  const current = canonicalToneCurve(points);
  if (current.length >= MAX_TONE_POINTS) return current;

  const nextX = clamp01(x);
  const nextY = clamp01(y);
  if (nextX <= MIN_POINT_GAP || nextX >= 1 - MIN_POINT_GAP) return current;
  if (current.some((point) => Math.abs(point.x - nextX) < MIN_POINT_GAP)) return current;

  return canonicalToneCurve([...current, { x: nextX, y: nextY }]);
}

export function updateTonePoint(
  points: readonly TonePoint[],
  index: number,
  patch: Partial<TonePoint>,
): TonePoint[] {
  const current = canonicalToneCurve(points);
  if (index < 0 || index >= current.length) return current;

  const next = clone(current);
  const endpoint = index === 0 || index === next.length - 1;
  next[index] = {
    x: endpoint ? next[index].x : clamp01(patch.x ?? next[index].x),
    y: clamp01(patch.y ?? next[index].y),
  };
  return canonicalToneCurve(next);
}

export function removeTonePoint(points: readonly TonePoint[], index: number): TonePoint[] {
  const current = canonicalToneCurve(points);
  if (index <= 0 || index >= current.length - 1) return current;
  return canonicalToneCurve(current.filter((_, currentIndex) => currentIndex !== index));
}

export function addTonePointInLargestGap(points: readonly TonePoint[]): TonePoint[] {
  const current = canonicalToneCurve(points);
  if (current.length >= MAX_TONE_POINTS) return current;

  let bestIndex = 1;
  let bestGap = -1;
  for (let index = 1; index < current.length; index += 1) {
    const gap = current[index].x - current[index - 1].x;
    if (gap > bestGap) {
      bestGap = gap;
      bestIndex = index;
    }
  }

  const left = current[bestIndex - 1];
  const right = current[bestIndex];
  return addTonePoint(current, (left.x + right.x) / 2, (left.y + right.y) / 2);
}

export function resetToneCurve(): TonePoint[] {
  return [{ x: 0, y: 0 }, { x: 1, y: 1 }];
}

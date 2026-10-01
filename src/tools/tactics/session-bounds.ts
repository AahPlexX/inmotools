export const MAX_TIMELINE_DURATION_MS = 6 * 60 * 60 * 1000;
export const MAX_TIMELINE_TRACKS = 256;
export const MAX_KEYFRAMES_PER_TRACK = 100_000;
export const MAX_TIMELINE_MARKERS = 8_000;
export const MAX_GENERATED_TIME_SAMPLES = 120_000;
export const MAX_NAMED_SNAPSHOTS = 40;
export const MAX_ZIP_ENTRIES = 256;

export function plannedTimeSampleCount(startMs: number, endMs: number, stepMs: number): number {
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !Number.isFinite(stepMs) || stepMs <= 0 || endMs < startMs) {
    return Number.POSITIVE_INFINITY;
  }
  const span = endMs - startMs;
  const steps = Math.floor(span / stepMs);
  if (!Number.isFinite(steps)) return Number.POSITIVE_INFINITY;
  return span % stepMs === 0 ? steps + 1 : steps + 2;
}

export function assertGeneratedSampleBudget(startMs: number, endMs: number, stepMs: number, label: string): void {
  const count = plannedTimeSampleCount(startMs, endMs, stepMs);
  if (count > MAX_GENERATED_TIME_SAMPLES) {
    throw new RangeError(
      `${label} would sample more than ${MAX_GENERATED_TIME_SAMPLES} times. Increase the sample step or shorten the span.`,
    );
  }
}

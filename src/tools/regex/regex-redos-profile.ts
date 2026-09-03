import type { RedosAssessment } from './regex-types';

export interface RedosProfilePoint {
  readonly repetitions: number;
  readonly inputLength: number;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly error: string | null;
}

export interface RedosProfileSummary {
  readonly points: readonly RedosProfilePoint[];
  readonly maxDurationMs: number;
  readonly growthRatio: number | null;
  readonly timeouts: number;
  readonly classification: 'flat' | 'growing' | 'timeout' | 'insufficient';
  readonly note: string;
}

export const buildRedosProbeInput = (probe: RedosAssessment['probe'], repetitions: number, pump = probe.pump, suffix = probe.suffix): string =>
  `${probe.prefix}${(pump || 'a').repeat(Math.max(0, Math.floor(repetitions)))}${suffix}`;

export const summarizeRedosProfile = (points: readonly RedosProfilePoint[]): RedosProfileSummary => {
  const finite = points.filter((point) => !point.timedOut && Number.isFinite(point.durationMs));
  const first = finite[0];
  const last = finite.at(-1);
  const growthRatio = first && last && first.durationMs > 0 ? last.durationMs / first.durationMs : null;
  const timeouts = points.filter((point) => point.timedOut).length;
  const classification: RedosProfileSummary['classification'] = timeouts > 0 ? 'timeout' : finite.length < 2 ? 'insufficient' : growthRatio !== null && growthRatio >= 8 ? 'growing' : 'flat';
  return {
    points,
    maxDurationMs: Math.max(0, ...points.map((point) => point.durationMs)),
    growthRatio,
    timeouts,
    classification,
    note: 'Empirical worker-isolated runtime samples. Timings vary by device and engine; they are not engine step counts and are not proof of asymptotic complexity.',
  };
};

import type { ActivityWindow, HourlyAssessment } from './aethercast-types';

type Recommendation = ActivityWindow['recommendation'];
type LimitingFactor = ActivityWindow['primaryLimitingFactor'];

interface RunningWindow {
  start: HourlyAssessment;
  end: HourlyAssessment;
  recommendation: Recommendation;
  factor: LimitingFactor;
}

const SUITABILITY_SCORE: Record<Recommendation, number> = {
  EXCELLENT: 90,
  FAIR: 65,
  USE_CAUTION: 35,
  AVOID: 10,
};

function scoreHour(assessment: HourlyAssessment): { recommendation: Recommendation; factor: LimitingFactor } {
  const uv = assessment.point.uvIndex ?? 0;
  const aqi = assessment.compositeAqi ?? 0;
  const ozoneUgM3 = assessment.point.ozone ?? 0;

  if (aqi >= 151 || uv >= 8) {
    return { recommendation: 'AVOID', factor: aqi >= 151 ? 'PARTICULATES' : 'UV' };
  }
  if (aqi >= 101 || uv >= 6 || ozoneUgM3 >= 140) {
    return { recommendation: 'USE_CAUTION', factor: uv >= 6 ? 'UV' : ozoneUgM3 >= 140 ? 'OZONE' : 'PARTICULATES' };
  }
  if (aqi >= 51 || uv >= 3) {
    return { recommendation: 'FAIR', factor: uv >= 3 ? 'UV' : 'PARTICULATES' };
  }
  return { recommendation: 'EXCELLENT', factor: 'NONE' };
}

function toWindow(running: RunningWindow): ActivityWindow {
  return {
    startTimestamp: running.start.point.isoTimestamp,
    endTimestamp: running.end.point.isoTimestamp,
    suitabilityScore: SUITABILITY_SCORE[running.recommendation],
    primaryLimitingFactor: running.factor,
    recommendation: running.recommendation,
  };
}

export function buildActivityWindows(assessments: readonly HourlyAssessment[]): ActivityWindow[] {
  const windows: ActivityWindow[] = [];
  let running: RunningWindow | null = null;

  for (const assessment of assessments) {
    const { recommendation, factor } = scoreHour(assessment);
    if (running && running.recommendation === recommendation && running.factor === factor) {
      running.end = assessment;
      continue;
    }
    if (running) windows.push(toWindow(running));
    running = { start: assessment, end: assessment, recommendation, factor };
  }
  if (running) windows.push(toWindow(running));

  return windows;
}

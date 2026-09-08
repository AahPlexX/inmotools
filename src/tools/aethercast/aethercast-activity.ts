import type { ActivityWindow, HourlyAssessment, IndexStandard } from './aethercast-types';

type Recommendation = ActivityWindow['recommendation'];
type LimitingFactor = ActivityWindow['primaryLimitingFactor'];

interface RunningWindow {
  start: HourlyAssessment;
  end: HourlyAssessment;
  score: number | null;
  recommendation: Recommendation;
  factor: LimitingFactor;
}

const HOUR_MS = 3_600_000;

function selectedIndex(assessment: HourlyAssessment, standard: IndexStandard): number | null {
  return standard === 'US_EPA' ? assessment.compositeAqi : assessment.eaqiValue;
}

function describeHour(
  assessment: HourlyAssessment,
  standard: IndexStandard,
): { score: number | null; recommendation: Recommendation; factor: LimitingFactor } {
  const index = selectedIndex(assessment, standard);
  const uv = assessment.point.uvIndex;

  // An outdoor-planning score depends on both air quality and UV. Missing data
  // is unknown — it must never be silently converted to a zero-risk reading.
  if (index === null || uv === null || !Number.isFinite(uv)) {
    return { score: null, recommendation: 'UNKNOWN', factor: 'DATA_GAP' };
  }

  let airPenalty = 0;
  if (standard === 'US_EPA') {
    if (index > 200) airPenalty = 100;
    else if (index > 150) airPenalty = 75;
    else if (index > 100) airPenalty = 50;
    else if (index > 50) airPenalty = 25;
  } else {
    if (index > 80) airPenalty = 100;
    else if (index > 60) airPenalty = 75;
    else if (index > 40) airPenalty = 50;
    else if (index > 20) airPenalty = 25;
  }

  let airFactor: LimitingFactor = airPenalty > 0 ? 'PARTICULATES' : 'NONE';
  if (standard === 'US_EPA') {
    const ozoneIndex = assessment.pollutants.o3.subIndex;
    if (ozoneIndex !== null && airPenalty > 0 && ozoneIndex >= index - 1) airFactor = 'OZONE';
  } else if (airPenalty > 0 && assessment.point.ozone !== null && assessment.point.ozone > 100) {
    // The revised EEA index uses hourly ozone with the Fair/Moderate boundary at 100 µg/m³.
    airFactor = 'OZONE';
  }

  let uvPenalty = 0;
  if (uv >= 11) uvPenalty = 80;
  else if (uv >= 8) uvPenalty = 65;
  else if (uv >= 6) uvPenalty = 45;
  else if (uv >= 3) uvPenalty = 20;

  const score = Math.max(0, 100 - Math.max(airPenalty, uvPenalty));
  const factor: LimitingFactor = uvPenalty > airPenalty ? 'UV' : airFactor;
  const recommendation: Recommendation = score >= 80
    ? 'EXCELLENT'
    : score >= 60
      ? 'FAIR'
      : score >= 35
        ? 'USE_CAUTION'
        : 'AVOID';

  return { score, recommendation, factor };
}

function toActivityWindow(window: RunningWindow): ActivityWindow {
  return {
    startTimestamp: window.start.point.isoTimestamp,
    endTimestamp: window.end.point.isoTimestamp,
    suitabilityScore: window.score,
    primaryLimitingFactor: window.factor,
    recommendation: window.recommendation,
  };
}

export function buildActivityWindows(
  assessments: readonly HourlyAssessment[],
  standard: IndexStandard = 'US_EPA',
): ActivityWindow[] {
  const windows: ActivityWindow[] = [];
  let current: RunningWindow | null = null;

  for (const assessment of assessments) {
    const described = describeHour(assessment, standard);
    const contiguous = current === null
      || Math.abs(assessment.point.epochMs - current.end.point.epochMs - HOUR_MS) <= 1000;
    const sameState = current !== null
      && current.recommendation === described.recommendation
      && current.factor === described.factor;

    if (!current || !contiguous || !sameState) {
      if (current) windows.push(toActivityWindow(current));
      current = {
        start: assessment,
        end: assessment,
        score: described.score,
        recommendation: described.recommendation,
        factor: described.factor,
      };
      continue;
    }

    current.end = assessment;
    if (current.score !== null && described.score !== null) {
      current.score = Math.min(current.score, described.score);
    } else {
      current.score = null;
    }
  }

  if (current) windows.push(toActivityWindow(current));
  return windows;
}

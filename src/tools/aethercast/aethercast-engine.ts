import type {
  AetherCastDataset,
  AetherCastSettings,
  AqiCategory,
  EaqiBand,
  HourlyAssessment,
  HourlyAtmosphericPoint,
  IndexCoverage,
  PollutantScore,
} from './aethercast-types';

type Breakpoint = [cLow: number, cHigh: number, iLow: number, iHigh: number];
type PollutantKey = 'pm25' | 'pm10' | 'o3' | 'no2' | 'so2' | 'co';

const EPA_PM25: Breakpoint[] = [
  [0.0, 9.0, 0, 50], [9.1, 35.4, 51, 100], [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200], [125.5, 225.4, 201, 300], [225.5, 325.4, 301, 500],
];
const EPA_PM10: Breakpoint[] = [
  [0, 54, 0, 50], [55, 154, 51, 100], [155, 254, 101, 150],
  [255, 354, 151, 200], [355, 424, 201, 300], [425, 604, 301, 500],
];
const EPA_O3_8HR_PPM: Breakpoint[] = [
  [0.0, 0.054, 0, 50], [0.055, 0.070, 51, 100], [0.071, 0.085, 101, 150],
  [0.086, 0.105, 151, 200], [0.106, 0.200, 201, 300],
];
const EPA_O3_1HR_PPM: Breakpoint[] = [
  [0.125, 0.164, 101, 150], [0.165, 0.204, 151, 200], [0.205, 0.404, 201, 300],
  [0.405, 0.604, 301, 500],
];
const EPA_NO2_PPB: Breakpoint[] = [
  [0, 53, 0, 50], [54, 100, 51, 100], [101, 360, 101, 150],
  [361, 649, 151, 200], [650, 1249, 201, 300], [1250, 2049, 301, 500],
];
const EPA_SO2_1HR_PPB: Breakpoint[] = [
  [0, 35, 0, 50], [36, 75, 51, 100], [76, 185, 101, 150], [186, 304, 151, 200],
];
const EPA_SO2_24HR_PPB: Breakpoint[] = [
  [305, 604, 201, 300], [605, 1004, 301, 500],
];
const EPA_CO_PPM: Breakpoint[] = [
  [0.0, 4.4, 0, 50], [4.5, 9.4, 51, 100], [9.5, 12.4, 101, 150],
  [12.5, 15.4, 151, 200], [15.5, 30.4, 201, 300], [30.5, 50.4, 301, 500],
];

const NO2_MOLAR_MASS = 46.01;
const SO2_MOLAR_MASS = 64.07;
const O3_MOLAR_MASS = 48.0;
const CO_MOLAR_MASS = 28.01;
const HOUR_MS = 3_600_000;
const CLOCK_TOLERANCE_MS = 1000;

const WHO_GUIDELINES: Record<PollutantKey, { value: number; hours: number; label: string }> = {
  pm25: { value: 15, hours: 24, label: 'WHO 24-hour PM2.5 guideline' },
  pm10: { value: 45, hours: 24, label: 'WHO 24-hour PM10 guideline' },
  o3: { value: 100, hours: 8, label: 'WHO 8-hour ozone guideline' },
  no2: { value: 25, hours: 24, label: 'WHO 24-hour NO2 guideline' },
  so2: { value: 40, hours: 24, label: 'WHO 24-hour SO2 guideline' },
  co: { value: 4000, hours: 24, label: 'WHO 24-hour CO guideline' },
};

const EUROPEAN_BANDS: Record<Exclude<PollutantKey, 'co'>, readonly number[]> = {
  pm25: [5, 15, 50, 90, 140],
  pm10: [15, 45, 120, 195, 270],
  o3: [60, 100, 120, 160, 180],
  no2: [10, 25, 60, 100, 150],
  so2: [20, 40, 125, 190, 275],
};

const SKIN_FACTOR: Record<number, number> = { 1: 1.0, 2: 1.5, 3: 2.0, 4: 3.0, 5: 4.5, 6: 6.0 };

export function ugM3ToPpb(ugM3: number, molarMassGramsPerMole: number): number {
  return (ugM3 * 24.45) / molarMassGramsPerMole;
}

export function ppbToUgM3(ppb: number, molarMassGramsPerMole: number): number {
  return (ppb * molarMassGramsPerMole) / 24.45;
}

export function ugM3ToPpm(ugM3: number, molarMassGramsPerMole = CO_MOLAR_MASS): number {
  return (ugM3 * 24.45) / (molarMassGramsPerMole * 1000);
}

export function ppmToUgM3(ppm: number, molarMassGramsPerMole = CO_MOLAR_MASS): number {
  return (ppm * molarMassGramsPerMole * 1000) / 24.45;
}

export function truncateTo(value: number, decimals: number): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  return Math.floor((value + Number.EPSILON) * factor) / factor;
}

function interpolate(concentration: number, breakpoints: readonly Breakpoint[]): number | null {
  if (!Number.isFinite(concentration) || concentration < 0) return null;
  for (const [cLow, cHigh, iLow, iHigh] of breakpoints) {
    if (concentration >= cLow && concentration <= cHigh) {
      return ((iHigh - iLow) / (cHigh - cLow)) * (concentration - cLow) + iLow;
    }
  }
  const last = breakpoints[breakpoints.length - 1];
  if (last && concentration > last[1]) {
    const [cLow, cHigh, iLow, iHigh] = last;
    return ((iHigh - iLow) / (cHigh - cLow)) * (concentration - cLow) + iLow;
  }
  return null;
}

export function categorizeAqi(aqi: number): AqiCategory {
  const rounded = Math.round(aqi);
  if (rounded > 500) return 'BEYOND_INDEX';
  if (rounded > 300) return 'HAZARDOUS';
  if (rounded > 200) return 'VERY_UNHEALTHY';
  if (rounded > 150) return 'UNHEALTHY';
  if (rounded > 100) return 'UNHEALTHY_SENSITIVE';
  if (rounded > 50) return 'MODERATE';
  return 'GOOD';
}

export function categorizeEaqi(value: number): EaqiBand {
  if (value > 100) return 'EXTREMELY_POOR';
  if (value > 80) return 'VERY_POOR';
  if (value > 60) return 'POOR';
  if (value > 40) return 'MODERATE';
  if (value > 20) return 'FAIR';
  return 'GOOD';
}

export function burnMinutes(uvIndex: number | null, skinType: number): number | null {
  if (uvIndex === null || !Number.isFinite(uvIndex) || uvIndex < 0) return null;
  if (uvIndex < 0.5) return Infinity;
  const factor = SKIN_FACTOR[skinType] ?? 1.5;
  return (200 * factor) / (3 * uvIndex);
}

function fieldValue(point: HourlyAtmosphericPoint, key: PollutantKey): number | null {
  switch (key) {
    case 'pm25': return point.pm25;
    case 'pm10': return point.pm10;
    case 'o3': return point.ozone;
    case 'no2': return point.nitrogenDioxide;
    case 'so2': return point.sulphurDioxide;
    case 'co': return point.carbonMonoxideUgM3;
  }
}

function pointForClockHour(
  points: readonly HourlyAtmosphericPoint[],
  index: number,
  targetEpochMs: number,
  searchHours: number,
): HourlyAtmosphericPoint | null {
  const lower = Math.max(0, index - searchHours - 2);
  for (let cursor = index; cursor >= lower; cursor -= 1) {
    const delta = points[cursor].epochMs - targetEpochMs;
    if (Math.abs(delta) <= CLOCK_TOLERANCE_MS) return points[cursor];
    if (delta < -CLOCK_TOLERANCE_MS) break;
  }
  return null;
}

function rollingAverage(points: readonly HourlyAtmosphericPoint[], index: number, key: PollutantKey, hours: number): number | null {
  const current = points[index];
  if (!current || points[0].epochMs > current.epochMs - (hours - 1) * HOUR_MS + CLOCK_TOLERANCE_MS) return null;
  let sum = 0;
  for (let age = 0; age < hours; age += 1) {
    const target = current.epochMs - age * HOUR_MS;
    const point = pointForClockHour(points, index, target, hours);
    if (!point) return null;
    const value = fieldValue(point, key);
    if (value === null || !Number.isFinite(value) || value < 0) return null;
    sum += value;
  }
  return sum / hours;
}

/** EPA PM NowCast: weighted past-12-hour concentration with the 2-of-last-3 validity rule. */
export function pmNowCast(points: readonly HourlyAtmosphericPoint[], index: number, key: 'pm25' | 'pm10'): number | null {
  const current = points[index];
  if (!current || points[0].epochMs > current.epochMs - 11 * HOUR_MS + CLOCK_TOLERANCE_MS) return null;

  const samples: Array<{ age: number; value: number }> = [];
  let recentValid = 0;
  for (let age = 0; age < 12; age += 1) {
    const point = pointForClockHour(points, index, current.epochMs - age * HOUR_MS, 12);
    const value = point ? fieldValue(point, key) : null;
    if (value !== null && Number.isFinite(value) && value >= 0) {
      samples.push({ age, value });
      if (age < 3) recentValid += 1;
    }
  }
  if (recentValid < 2 || samples.length === 0) return null;

  const values = samples.map((sample) => sample.value);
  const maximum = Math.max(...values);
  const minimum = Math.min(...values);
  const scaledRate = maximum <= 0 ? 0 : (maximum - minimum) / maximum;
  const weight = Math.max(0.5, Math.min(1, 1 - scaledRate));
  let weightedSum = 0;
  let weightSum = 0;
  for (const sample of samples) {
    const factor = weight ** sample.age;
    weightedSum += sample.value * factor;
    weightSum += factor;
  }
  return weightSum > 0 ? weightedSum / weightSum : null;
}

function epaSubIndex(key: PollutantKey, points: readonly HourlyAtmosphericPoint[], index: number): { value: number | null; averaging: string } {
  const point = points[index];
  if (key === 'pm25') {
    const nowCast = pmNowCast(points, index, key);
    return { value: nowCast === null ? null : interpolate(truncateTo(nowCast, 1), EPA_PM25), averaging: 'EPA PM NowCast over the past 12 hours (2 of last 3 required); PM2.5 truncated to 0.1 µg/m³' };
  }
  if (key === 'pm10') {
    const nowCast = pmNowCast(points, index, key);
    return { value: nowCast === null ? null : interpolate(truncateTo(nowCast, 0), EPA_PM10), averaging: 'EPA PM NowCast over the past 12 hours (2 of last 3 required); PM10 truncated to integer µg/m³' };
  }
  if (key === 'co') {
    const mean = rollingAverage(points, index, key, 8);
    const ppm = mean === null ? null : truncateTo(ugM3ToPpm(mean), 1);
    return { value: ppm === null ? null : interpolate(ppm, EPA_CO_PPM), averaging: '8-hour rolling average; CO truncated to 0.1 ppm' };
  }
  if (key === 'no2') {
    const value = point.nitrogenDioxide;
    const ppb = value === null ? null : truncateTo(ugM3ToPpb(value, NO2_MOLAR_MASS), 0);
    return { value: ppb === null ? null : interpolate(ppb, EPA_NO2_PPB), averaging: '1-hour concentration; NO2 truncated to integer ppb' };
  }
  if (key === 'o3') {
    const eightHour = rollingAverage(points, index, key, 8);
    const eightHourPpm = eightHour === null ? null : truncateTo(ugM3ToPpb(eightHour, O3_MOLAR_MASS) / 1000, 3);
    const oneHourPpm = point.ozone === null ? null : truncateTo(ugM3ToPpb(point.ozone, O3_MOLAR_MASS) / 1000, 3);
    const eightIndex = eightHourPpm === null ? null : interpolate(eightHourPpm, EPA_O3_8HR_PPM);
    const oneIndex = oneHourPpm === null || oneHourPpm < 0.125 ? null : interpolate(oneHourPpm, EPA_O3_1HR_PPM);
    const available = [eightIndex, oneIndex].filter((value): value is number => value !== null);
    return { value: available.length ? Math.max(...available) : null, averaging: '8-hour rolling ozone AQI plus the EPA 1-hour high-ozone rule; this is not the operational AirNow ozone NowCast' };
  }

  const oneHourPpb = point.sulphurDioxide === null ? null : truncateTo(ugM3ToPpb(point.sulphurDioxide, SO2_MOLAR_MASS), 0);
  const oneIndex = oneHourPpb === null || oneHourPpb > 304 ? null : interpolate(oneHourPpb, EPA_SO2_1HR_PPB);
  const mean24 = rollingAverage(points, index, key, 24);
  const mean24Ppb = mean24 === null ? null : truncateTo(ugM3ToPpb(mean24, SO2_MOLAR_MASS), 0);
  const dailyIndex = mean24Ppb === null || mean24Ppb < 305 ? null : interpolate(mean24Ppb, EPA_SO2_24HR_PPB);
  const available = [oneIndex, dailyIndex].filter((value): value is number => value !== null);
  return { value: available.length ? Math.max(...available) : null, averaging: 'SO2 1-hour AQI through 200; 24-hour average for higher AQI; integer ppb' };
}

function europeanSubIndex(value: number | null, thresholds: readonly number[]): number | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null;
  let lower = 0;
  for (let band = 0; band < thresholds.length; band += 1) {
    const upper = thresholds[band];
    if (value <= upper) {
      const iLow = band * 20;
      return iLow + ((value - lower) / Math.max(Number.EPSILON, upper - lower)) * 20;
    }
    lower = upper;
  }
  const previous = thresholds[thresholds.length - 2] ?? 0;
  const last = thresholds[thresholds.length - 1] ?? 1;
  return 100 + ((value - last) / Math.max(1, last - previous)) * 20;
}

function calculateEuropean(point: HourlyAtmosphericPoint): { value: number | null; band: EaqiBand | null; coverage: IndexCoverage } {
  const subIndices = [
    europeanSubIndex(point.pm25, EUROPEAN_BANDS.pm25),
    europeanSubIndex(point.pm10, EUROPEAN_BANDS.pm10),
    europeanSubIndex(point.ozone, EUROPEAN_BANDS.o3),
    europeanSubIndex(point.nitrogenDioxide, EUROPEAN_BANDS.no2),
    europeanSubIndex(point.sulphurDioxide, EUROPEAN_BANDS.so2),
  ];
  const available = subIndices.filter((value): value is number => value !== null);
  const required = point.nitrogenDioxide !== null && point.ozone !== null && (point.pm25 !== null || point.pm10 !== null);
  const coverage: IndexCoverage = available.length === 0 ? 'NONE' : required ? 'COMPLETE' : 'PARTIAL';
  if (available.length === 0) return { value: null, band: null, coverage };
  const value = Math.max(...available);
  return { value: Math.round(value), band: categorizeEaqi(value), coverage };
}

function whoComparison(points: readonly HourlyAtmosphericPoint[], index: number, key: PollutantKey): { pass: boolean | null; value: number; label: string } {
  const guideline = WHO_GUIDELINES[key];
  const mean = rollingAverage(points, index, key, guideline.hours);
  return { pass: mean === null ? null : mean <= guideline.value, value: guideline.value, label: guideline.label };
}

function scorePollutant(key: PollutantKey, points: readonly HourlyAtmosphericPoint[], index: number): PollutantScore {
  const epa = epaSubIndex(key, points, index);
  const who = whoComparison(points, index, key);
  return {
    subIndex: epa.value,
    category: epa.value === null ? null : categorizeAqi(Math.round(epa.value)),
    whoDailyPass: who.pass,
    whoAnnualBenchmark: who.value,
    whoGuidelinePass: who.pass,
    whoGuidelineValue: who.value,
    whoAveragingLabel: who.label,
    epaAveragingLabel: epa.averaging,
  };
}

function assessAt(points: readonly HourlyAtmosphericPoint[], index: number, settings: AetherCastSettings): HourlyAssessment {
  const point = points[index];
  const pollutants = {
    pm25: scorePollutant('pm25', points, index),
    pm10: scorePollutant('pm10', points, index),
    o3: scorePollutant('o3', points, index),
    no2: scorePollutant('no2', points, index),
    so2: scorePollutant('so2', points, index),
    co: scorePollutant('co', points, index),
  };
  const subIndices = Object.values(pollutants).map((score) => score.subIndex).filter((value): value is number => value !== null);
  const rounded = subIndices.length ? Math.round(Math.max(...subIndices)) : null;
  const usCoverage: IndexCoverage = subIndices.length === 0 ? 'NONE' : subIndices.length === 6 ? 'COMPLETE' : 'PARTIAL';
  const european = calculateEuropean(point);

  // The user-selected lens is presentation context only. It must not rewrite regulatory or WHO thresholds.
  void settings.vulnerabilityLens;

  return {
    point,
    compositeAqi: rounded,
    aqiCategory: rounded === null ? null : categorizeAqi(rounded),
    usAqiCoverage: usCoverage,
    eaqiValue: european.value,
    eaqiBand: european.band,
    europeanAqiCoverage: european.coverage,
    burnMinutes: burnMinutes(point.uvIndex, settings.skinType),
    pollutants,
  };
}

export function assessHour(point: HourlyAtmosphericPoint, settings: AetherCastSettings): HourlyAssessment {
  return assessAt([point], 0, settings);
}

export function assessDataset(dataset: AetherCastDataset, settings: AetherCastSettings): HourlyAssessment[] {
  return dataset.points.map((_point, index) => assessAt(dataset.points, index, settings));
}

import type {
  AetherCastDataset,
  AetherCastSettings,
  AqiCategory,
  EaqiBand,
  HourlyAssessment,
  HourlyAtmosphericPoint,
  PollutantScore,
  VulnerabilityLens,
} from './aethercast-types';

type Breakpoint = [cLow: number, cHigh: number, iLow: number, iHigh: number];

const EPA_PM25: Breakpoint[] = [
  [0.0, 9.0, 0, 50],
  [9.1, 35.4, 51, 100],
  [35.5, 55.4, 101, 150],
  [55.5, 125.4, 151, 200],
  [125.5, 225.4, 201, 300],
  [225.5, 325.4, 301, 500],
];
const EPA_PM10: Breakpoint[] = [
  [0, 54, 0, 50],
  [55, 154, 51, 100],
  [155, 254, 101, 150],
  [255, 354, 151, 200],
  [355, 424, 201, 300],
  [425, 604, 301, 500],
];
const EPA_O3_8HR_PPM: Breakpoint[] = [
  [0.0, 0.054, 0, 50],
  [0.055, 0.07, 51, 100],
  [0.071, 0.085, 101, 150],
  [0.086, 0.105, 151, 200],
  [0.106, 0.2, 201, 300],
];
const EPA_NO2_PPB: Breakpoint[] = [
  [0, 53, 0, 50],
  [54, 100, 51, 100],
  [101, 360, 101, 150],
  [361, 649, 151, 200],
  [650, 1249, 201, 300],
  [1250, 2049, 301, 500],
];
const EPA_SO2_PPB: Breakpoint[] = [
  [0, 35, 0, 50],
  [36, 75, 51, 100],
  [76, 185, 101, 150],
  [186, 304, 151, 200],
  [305, 604, 201, 300],
  [605, 1004, 301, 500],
];
const EPA_CO_PPM: Breakpoint[] = [
  [0.0, 4.4, 0, 50],
  [4.5, 9.4, 51, 100],
  [9.5, 12.4, 101, 150],
  [12.5, 15.4, 151, 200],
  [15.5, 30.4, 201, 300],
  [30.5, 50.4, 301, 500],
];

const NO2_MOLAR_MASS = 46.01;
const SO2_MOLAR_MASS = 64.07;
const O3_MOLAR_MASS = 48.0;
const CO_MOLAR_MASS = 28.01;

const WHO_DAILY_UGM3 = { pm25: 15, pm10: 45, o3: 100, no2: 25, so2: 40, co: 4000 } as const;

type WhoKey = keyof typeof WHO_DAILY_UGM3;

const LENS_MULTIPLIER: Record<VulnerabilityLens, Partial<Record<WhoKey, number>>> = {
  NONE: {},
  ASTHMA: { pm25: 12 / 15, o3: 70 / 100 },
  CARDIOVASCULAR: { pm25: 10 / 15, co: 3000 / 4000 },
  PEDIATRIC: { o3: 80 / 100, pm10: 35 / 45 },
  PHOTOSENSITIVE: {},
};

const SKIN_FACTOR: Record<number, number> = { 1: 1.0, 2: 1.5, 3: 2.0, 4: 3.0, 5: 4.5, 6: 6.0 };

export function ugM3ToPpb(ugM3: number, molarMassGramsPerMole: number): number {
  return (ugM3 * 24.45) / molarMassGramsPerMole;
}

export function ugM3ToPpm(ugM3: number, molarMassGramsPerMole = CO_MOLAR_MASS): number {
  return (ugM3 * 24.45) / (molarMassGramsPerMole * 1000);
}

function interpolate(concentration: number, breakpoints: Breakpoint[]): number | null {
  if (!Number.isFinite(concentration) || concentration < 0) return null;
  for (const [cLow, cHigh, iLow, iHigh] of breakpoints) {
    if (concentration >= cLow && concentration <= cHigh) {
      return ((iHigh - iLow) / (cHigh - cLow)) * (concentration - cLow) + iLow;
    }
  }
  const last = breakpoints[breakpoints.length - 1];
  if (concentration > last[1]) {
    const [cLow, cHigh, iLow, iHigh] = last;
    return ((iHigh - iLow) / (cHigh - cLow)) * (concentration - cLow) + iLow;
  }
  return null;
}

export function categorizeAqi(aqi: number): AqiCategory {
  if (aqi > 500) return 'BEYOND_INDEX';
  if (aqi > 300) return 'HAZARDOUS';
  if (aqi > 200) return 'VERY_UNHEALTHY';
  if (aqi > 150) return 'UNHEALTHY';
  if (aqi > 100) return 'UNHEALTHY_SENSITIVE';
  if (aqi > 50) return 'MODERATE';
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
  if (uvIndex === null) return null;
  if (uvIndex < 0.5) return Infinity;
  const factor = SKIN_FACTOR[skinType] ?? 1.5;
  return (200 * factor) / (3 * uvIndex);
}

function scorePollutant(
  key: WhoKey,
  ugM3: number | null,
  breakpoints: Breakpoint[] | null,
  convertForEpa: (value: number) => number,
  lens: VulnerabilityLens,
): PollutantScore {
  if (ugM3 === null) {
    return { subIndex: null, category: null, whoDailyPass: null, whoAnnualBenchmark: null };
  }
  const subIndex = breakpoints ? interpolate(convertForEpa(ugM3), breakpoints) : null;
  const multiplier = LENS_MULTIPLIER[lens][key] ?? 1;
  const threshold = WHO_DAILY_UGM3[key] * multiplier;
  return {
    subIndex,
    category: subIndex === null ? null : categorizeAqi(subIndex),
    whoDailyPass: ugM3 <= threshold,
    whoAnnualBenchmark: WHO_DAILY_UGM3[key],
  };
}

export function assessHour(point: HourlyAtmosphericPoint, settings: AetherCastSettings): HourlyAssessment {
  const lens = settings.vulnerabilityLens;

  const pm25 = scorePollutant('pm25', point.pm25, EPA_PM25, (value) => value, lens);
  const pm10 = scorePollutant('pm10', point.pm10, EPA_PM10, (value) => value, lens);
  const o3 = scorePollutant('o3', point.ozone, EPA_O3_8HR_PPM, (value) => ugM3ToPpb(value, O3_MOLAR_MASS) / 1000, lens);
  const no2 = scorePollutant('no2', point.nitrogenDioxide, EPA_NO2_PPB, (value) => ugM3ToPpb(value, NO2_MOLAR_MASS), lens);
  const so2 = scorePollutant('so2', point.sulphurDioxide, EPA_SO2_PPB, (value) => ugM3ToPpb(value, SO2_MOLAR_MASS), lens);
  const co = scorePollutant('co', point.carbonMonoxideUgM3, EPA_CO_PPM, (value) => ugM3ToPpm(value, CO_MOLAR_MASS), lens);

  const subIndices = [pm25.subIndex, pm10.subIndex, o3.subIndex, no2.subIndex, so2.subIndex, co.subIndex].filter(
    (value): value is number => value !== null,
  );
  const composite = point.providedUsAqi ?? (subIndices.length > 0 ? Math.max(...subIndices) : null);
  const eaqiValue = point.providedEuropeanAqi;

  return {
    point,
    compositeAqi: composite === null ? null : Math.round(composite),
    aqiCategory: composite === null ? null : categorizeAqi(composite),
    eaqiValue,
    eaqiBand: eaqiValue === null ? null : categorizeEaqi(eaqiValue),
    burnMinutes: burnMinutes(point.uvIndex, settings.skinType),
    pollutants: { pm25, pm10, o3, no2, so2, co },
  };
}

export function assessDataset(dataset: AetherCastDataset, settings: AetherCastSettings): HourlyAssessment[] {
  return dataset.points.map((point) => assessHour(point, settings));
}

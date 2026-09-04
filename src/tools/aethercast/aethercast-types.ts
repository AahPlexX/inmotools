export type AqiCategory = 'GOOD' | 'MODERATE' | 'UNHEALTHY_SENSITIVE' | 'UNHEALTHY' | 'VERY_UNHEALTHY' | 'HAZARDOUS' | 'BEYOND_INDEX';
export type EaqiBand = 'GOOD' | 'FAIR' | 'MODERATE' | 'POOR' | 'VERY_POOR' | 'EXTREMELY_POOR';
export type FitzpatrickType = 1 | 2 | 3 | 4 | 5 | 6;
export type ImportSource = 'open-meteo-json' | 'csv-mapped' | 'aethercast-export';
export type VulnerabilityLens = 'NONE' | 'ASTHMA' | 'CARDIOVASCULAR' | 'PEDIATRIC' | 'PHOTOSENSITIVE';
export type IndexStandard = 'US_EPA' | 'EUROPEAN_EAQI';
export type UnitSystem = 'METRIC' | 'US';

export interface HourlyAtmosphericPoint {
  isoTimestamp: string;
  epochMs: number;
  pm25: number | null;
  pm10: number | null;
  carbonMonoxideUgM3: number | null;
  nitrogenDioxide: number | null;
  sulphurDioxide: number | null;
  ozone: number | null;
  uvIndex: number | null;
  uvIndexClearSky: number | null;
  windSpeedMs: number | null;
  providedUsAqi: number | null;
  providedEuropeanAqi: number | null;
}

export interface AetherCastDataset {
  importSource: ImportSource;
  latitude: number | null;
  longitude: number | null;
  elevationMeters: number | null;
  timezone: string | null;
  points: HourlyAtmosphericPoint[];
  truncatedRows: number;
}

export interface PollutantScore {
  subIndex: number | null;
  category: AqiCategory | null;
  whoDailyPass: boolean | null;
  whoAnnualBenchmark: number | null;
}

export interface HourlyAssessment {
  point: HourlyAtmosphericPoint;
  compositeAqi: number | null;
  aqiCategory: AqiCategory | null;
  eaqiValue: number | null;
  eaqiBand: EaqiBand | null;
  burnMinutes: number | null;
  pollutants: Record<'pm25' | 'pm10' | 'o3' | 'no2' | 'so2' | 'co', PollutantScore>;
}

export interface AnomalyEvent {
  type: 'WILDFIRE_SCREEN' | 'THERMAL_INVERSION';
  startTimestamp: string;
  peakTimestamp: string;
  confirmed: boolean;
  advisoryMessage: string;
}

export interface ActivityWindow {
  startTimestamp: string;
  endTimestamp: string;
  suitabilityScore: number;
  primaryLimitingFactor: 'UV' | 'OZONE' | 'PARTICULATES' | 'NONE';
  recommendation: 'EXCELLENT' | 'FAIR' | 'USE_CAUTION' | 'AVOID';
}

export interface AetherCastSettings {
  activeStandard: IndexStandard;
  skinType: FitzpatrickType;
  vulnerabilityLens: VulnerabilityLens;
  unitSystem: UnitSystem;
}

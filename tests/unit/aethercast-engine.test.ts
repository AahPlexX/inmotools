import { describe, expect, it } from 'vitest';
import { assessHour, burnMinutes, categorizeAqi, categorizeEaqi, ugM3ToPpm } from '../../src/tools/aethercast/aethercast-engine';
import type { AetherCastSettings, HourlyAtmosphericPoint } from '../../src/tools/aethercast/aethercast-types';

const baseSettings: AetherCastSettings = {
  activeStandard: 'US_EPA',
  skinType: 2,
  vulnerabilityLens: 'NONE',
  unitSystem: 'US',
};

function point(overrides: Partial<HourlyAtmosphericPoint> = {}): HourlyAtmosphericPoint {
  return {
    isoTimestamp: '2026-06-01T12:00:00',
    epochMs: Date.parse('2026-06-01T12:00:00'),
    pm25: null,
    pm10: null,
    carbonMonoxideUgM3: null,
    nitrogenDioxide: null,
    sulphurDioxide: null,
    ozone: null,
    uvIndex: null,
    uvIndexClearSky: null,
    windSpeedMs: null,
    providedUsAqi: null,
    providedEuropeanAqi: null,
    ...overrides,
  };
}

describe('categorizeAqi', () => {
  it('categorizes AQI boundary values per the post-2024 EPA table', () => {
    expect(categorizeAqi(50)).toBe('GOOD');
    expect(categorizeAqi(51)).toBe('MODERATE');
    expect(categorizeAqi(300)).toBe('VERY_UNHEALTHY');
    expect(categorizeAqi(301)).toBe('HAZARDOUS');
    expect(categorizeAqi(501)).toBe('BEYOND_INDEX');
  });
});

describe('categorizeEaqi', () => {
  it('categorizes the continuous european_aqi bands', () => {
    expect(categorizeEaqi(10)).toBe('GOOD');
    expect(categorizeEaqi(41)).toBe('MODERATE');
    expect(categorizeEaqi(101)).toBe('EXTREMELY_POOR');
  });
});

describe('ugM3ToPpm', () => {
  it('converts carbon monoxide micrograms per cubic meter to ppm at EPA reference conditions', () => {
    expect(ugM3ToPpm(1000, 28.01)).toBeCloseTo(0.873, 2);
  });
});

describe('burnMinutes', () => {
  it('returns Infinity when UVI is below the 0.5 safety floor', () => {
    expect(burnMinutes(0.2, 2)).toBe(Infinity);
  });

  it('scales inversely with UV index for a fixed skin type', () => {
    const short = burnMinutes(10, 2);
    const long = burnMinutes(2, 2);
    expect(short).not.toBeNull();
    expect(long).not.toBeNull();
    expect(short as number).toBeLessThan(long as number);
  });

  it('returns null when no UV reading is available', () => {
    expect(burnMinutes(null, 2)).toBeNull();
  });
});

describe('assessHour', () => {
  it('computes a composite AQI as the maximum of available pollutant sub-indices', () => {
    const assessment = assessHour(point({ pm25: 20, ozone: 20 }), baseSettings);
    expect(assessment.compositeAqi).not.toBeNull();
    expect(assessment.aqiCategory).toBe('MODERATE');
  });

  it('prefers a provided us_aqi value over local re-derivation when present', () => {
    const assessment = assessHour(point({ pm25: 5, providedUsAqi: 42 }), baseSettings);
    expect(assessment.compositeAqi).toBe(42);
  });

  it('handles a fully empty hour without throwing', () => {
    const assessment = assessHour(point(), baseSettings);
    expect(assessment.compositeAqi).toBeNull();
    expect(assessment.pollutants.pm25.whoDailyPass).toBeNull();
  });

  it('marks a WHO 24-hour PM2.5 exceedance correctly', () => {
    const assessment = assessHour(point({ pm25: 20 }), baseSettings);
    expect(assessment.pollutants.pm25.whoDailyPass).toBe(false);
  });

  it('tightens the WHO PM2.5 comparison under the asthma vulnerability lens', () => {
    const settings: AetherCastSettings = { ...baseSettings, vulnerabilityLens: 'ASTHMA' };
    const assessment = assessHour(point({ pm25: 13 }), settings);
    expect(assessment.pollutants.pm25.whoDailyPass).toBe(false);
  });
});

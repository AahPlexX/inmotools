import { afterEach, describe, expect, it } from 'vitest';
import {
  assessDataset,
  assessHour,
  burnMinutes,
  categorizeAqi,
  categorizeEaqi,
  pmNowCast,
  ugM3ToPpm,
} from '../../src/tools/aethercast/aethercast-engine';
import { buildActivityWindows } from '../../src/tools/aethercast/aethercast-activity';
import { datasetLocalHour, detectAnomalies } from '../../src/tools/aethercast/aethercast-anomaly';
import { parseCsvWithMapping, parseTimestampInZone } from '../../src/tools/aethercast/aethercast-import';
import type { AetherCastDataset, AetherCastSettings, HourlyAtmosphericPoint } from '../../src/tools/aethercast/aethercast-types';

const baseSettings: AetherCastSettings = {
  activeStandard: 'US_EPA',
  skinType: 2,
  vulnerabilityLens: 'NONE',
  unitSystem: 'US',
};

function point(overrides: Partial<HourlyAtmosphericPoint> = {}): HourlyAtmosphericPoint {
  return {
    isoTimestamp: '2026-06-01T12:00:00Z',
    epochMs: Date.parse('2026-06-01T12:00:00Z'),
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

function hourlySeries(count: number, overrides: Partial<HourlyAtmosphericPoint>): HourlyAtmosphericPoint[] {
  const start = Date.parse('2026-06-01T00:00:00Z');
  return Array.from({ length: count }, (_, index) => {
    const epochMs = start + index * 3_600_000;
    return point({
      ...overrides,
      epochMs,
      isoTimestamp: new Date(epochMs).toISOString(),
    });
  });
}

function dataset(points: HourlyAtmosphericPoint[]): AetherCastDataset {
  return {
    importSource: 'open-meteo-json',
    latitude: null,
    longitude: null,
    elevationMeters: null,
    timezone: 'UTC',
    points,
    truncatedRows: 0,
  };
}

describe('AQI category boundaries', () => {
  it('categorizes the final rounded AQI rather than the pre-rounded interpolation value', () => {
    expect(categorizeAqi(50.49)).toBe('GOOD');
    expect(categorizeAqi(50.5)).toBe('MODERATE');
    expect(categorizeAqi(300)).toBe('VERY_UNHEALTHY');
    expect(categorizeAqi(301)).toBe('HAZARDOUS');
    expect(categorizeAqi(501)).toBe('BEYOND_INDEX');
  });

  it('categorizes the continuous European index bands', () => {
    expect(categorizeEaqi(10)).toBe('GOOD');
    expect(categorizeEaqi(41)).toBe('MODERATE');
    expect(categorizeEaqi(101)).toBe('EXTREMELY_POOR');
  });
});

describe('unit conversion and UV helper', () => {
  it('converts carbon monoxide micrograms per cubic meter to ppm at the configured reference conditions', () => {
    expect(ugM3ToPpm(1000, 28.01)).toBeCloseTo(0.873, 2);
  });

  it('uses Infinity only as an internal sentinel when the timing heuristic is not estimated at very low UVI', () => {
    expect(burnMinutes(0.2, 2)).toBe(Infinity);
  });

  it('scales the timing heuristic inversely with UV index for a fixed skin type', () => {
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

describe('US EPA time-series assessment', () => {
  it('uses the EPA PM NowCast and truncates concentration before interpolation', () => {
    const points = hourlySeries(12, { pm25: 9.09 });
    const assessments = assessDataset(dataset(points), baseSettings);
    const latest = assessments.at(-1);
    expect(assessments[10].pollutants.pm25.subIndex).toBeNull();
    expect(latest?.compositeAqi).toBe(50);
    expect(latest?.aqiCategory).toBe('GOOD');
    expect(latest?.pollutants.pm25.epaAveragingLabel).toContain('NowCast');
  });

  it('weights recent PM hours more strongly when concentrations change rapidly', () => {
    const points = hourlySeries(12, { pm25: 10 });
    points[11] = { ...points[11], pm25: 100 };
    const nowCast = pmNowCast(points, 11, 'pm25');
    const simpleMean = points.reduce((sum, sample) => sum + (sample.pm25 ?? 0), 0) / points.length;
    expect(nowCast).not.toBeNull();
    expect(nowCast as number).toBeGreaterThan(simpleMean);
  });

  it('requires at least two valid PM measurements in the last three hours', () => {
    const points = hourlySeries(12, { pm25: 10 });
    points[10] = { ...points[10], pm25: null };
    points[11] = { ...points[11], pm25: null };
    expect(pmNowCast(points, 11, 'pm25')).toBeNull();
  });

  it('recalculates from raw concentrations instead of trusting supplied index fields', () => {
    const assessments = assessDataset(dataset(hourlySeries(12, { pm25: 5, providedUsAqi: 499 })), baseSettings);
    expect(assessments.at(-1)?.compositeAqi).not.toBe(499);
    expect(assessments.at(-1)?.compositeAqi).toBeLessThanOrEqual(50);
  });

  it('requires the correct WHO rolling window before producing a guideline comparison', () => {
    const assessments = assessDataset(dataset(hourlySeries(24, { pm25: 20 })), baseSettings);
    expect(assessments[22].pollutants.pm25.whoGuidelinePass).toBeNull();
    expect(assessments[23].pollutants.pm25.whoGuidelinePass).toBe(false);
    expect(assessments[23].pollutants.pm25.whoAveragingLabel).toContain('24-hour');
  });

  it('does not alter scientific thresholds when a vulnerability display lens is selected', () => {
    const ordinary = assessDataset(dataset(hourlySeries(24, { pm25: 13 })), baseSettings).at(-1);
    const respiratory = assessDataset(
      dataset(hourlySeries(24, { pm25: 13 })),
      { ...baseSettings, vulnerabilityLens: 'ASTHMA' },
    ).at(-1);
    expect(respiratory?.pollutants.pm25.whoGuidelinePass).toBe(ordinary?.pollutants.pm25.whoGuidelinePass);
    expect(respiratory?.compositeAqi).toBe(ordinary?.compositeAqi);
  });
});

describe('European index assessment', () => {
  it('recalculates the revised hourly European index from raw concentrations', () => {
    const assessment = assessHour(point({
      pm25: 50,
      nitrogenDioxide: 20,
      ozone: 80,
      providedEuropeanAqi: 0,
    }), { ...baseSettings, activeStandard: 'EUROPEAN_EAQI' });
    expect(assessment.eaqiValue).toBe(60);
    expect(assessment.eaqiBand).toBe('MODERATE');
    expect(assessment.europeanAqiCoverage).toBe('COMPLETE');
  });

  it('marks an index as partial when the required EEA station pollutants are not all present', () => {
    const assessment = assessHour(point({ pm25: 10 }), { ...baseSettings, activeStandard: 'EUROPEAN_EAQI' });
    expect(assessment.europeanAqiCoverage).toBe('PARTIAL');
    expect(assessment.eaqiValue).not.toBeNull();
  });
});

describe('activity windows', () => {
  it('keeps missing AQI or UV as unknown instead of treating either as zero', () => {
    const assessment = assessHour(point(), baseSettings);
    const windows = buildActivityWindows([assessment], 'US_EPA');
    expect(windows).toHaveLength(1);
    expect(windows[0]).toMatchObject({ recommendation: 'UNKNOWN', primaryLimitingFactor: 'DATA_GAP', suitabilityScore: null });
  });

  it('does not merge otherwise-identical windows across a missing time interval', () => {
    const first = assessHour(point({ nitrogenDioxide: 10, uvIndex: 1 }), baseSettings);
    const second = assessHour(point({
      isoTimestamp: '2026-06-01T14:00:00Z',
      epochMs: Date.parse('2026-06-01T14:00:00Z'),
      nitrogenDioxide: 10,
      uvIndex: 1,
    }), baseSettings);
    expect(buildActivityWindows([first, second], 'US_EPA')).toHaveLength(2);
  });

  it('uses the selected standard instead of always scoring the US index', () => {
    const assessment = assessHour(point({ pm25: 50, nitrogenDioxide: 20, ozone: 80, uvIndex: 1 }), baseSettings);
    expect(buildActivityWindows([assessment], 'EUROPEAN_EAQI')[0].recommendation).not.toBe('UNKNOWN');
  });
});

describe('CSV and timezone import', () => {
  it('interprets timezone-less wall-clock timestamps in the supplied IANA timezone', () => {
    expect(parseTimestampInZone('2026-06-01T12:00:00', 'America/New_York'))
      .toBe(Date.parse('2026-06-01T16:00:00Z'));
  });

  it('maps CSV columns and converts declared source units into internal units', () => {
    const raw = 'time,o3,co,uv\n2026-06-01T12:00:00,50,1.2,4\n';
    const result = parseCsvWithMapping(raw, {
      timestamp: 'time',
      ozone: 'o3',
      carbonMonoxideUgM3: 'co',
      uvIndex: 'uv',
    }, {
      timezone: 'America/New_York',
      units: { ozone: 'PPB', carbonMonoxide: 'PPM' },
    });
    expect(result.errors).toEqual([]);
    expect(result.dataset?.importSource).toBe('csv-mapped');
    expect(result.dataset?.points[0].epochMs).toBe(Date.parse('2026-06-01T16:00:00Z'));
    expect(result.dataset?.points[0].ozone).toBeCloseTo(98.16, 1);
    expect(result.dataset?.points[0].carbonMonoxideUgM3).toBeCloseTo(1374.7, 0);
    expect(result.dataset?.points[0].uvIndex).toBe(4);
  });
});

describe('screening anomalies', () => {
  const localHourSeries = (startHour: number, values: Array<Partial<HourlyAtmosphericPoint>>): HourlyAtmosphericPoint[] => values.map((overrides, index) => {
    const wall = new Date(Date.UTC(2026, 5, 1, startHour + index, 0, 0));
    return point({ ...overrides, epochMs: wall.getTime(), isoTimestamp: wall.toISOString().slice(0, 19) });
  });

  it('AEC-R14 lists wildfire and thermal-inversion screens and ignores steady air', () => {
    const corroborated = detectAnomalies(localHourSeries(12, [
      { pm25: 10, carbonMonoxideUgM3: 200 },
      { pm25: 60, carbonMonoxideUgM3: 200 },
    ]));
    expect(corroborated).toHaveLength(1);
    expect(corroborated[0]).toMatchObject({ type: 'WILDFIRE_SCREEN', confirmed: true });

    const uncorroborated = detectAnomalies(localHourSeries(12, [{ pm25: 10 }, { pm25: 60 }]));
    expect(uncorroborated).toHaveLength(1);
    expect(uncorroborated[0]).toMatchObject({ type: 'WILDFIRE_SCREEN', confirmed: false });

    const inversion = detectAnomalies(localHourSeries(21, [
      { pm25: 10, nitrogenDioxide: 20, windSpeedMs: 0.5 },
      { pm25: 12, nitrogenDioxide: 24, windSpeedMs: 0.6 },
      { pm25: 14, nitrogenDioxide: 28, windSpeedMs: 0.4 },
    ]));
    expect(inversion).toHaveLength(1);
    expect(inversion[0]).toMatchObject({ type: 'THERMAL_INVERSION', confirmed: true });

    const daytime = detectAnomalies(localHourSeries(10, [
      { pm25: 10, nitrogenDioxide: 20, windSpeedMs: 0.5 },
      { pm25: 12, nitrogenDioxide: 24, windSpeedMs: 0.6 },
      { pm25: 14, nitrogenDioxide: 28, windSpeedMs: 0.4 },
    ]));
    expect(daytime).toEqual([]);

    expect(detectAnomalies(hourlySeries(24, { pm25: 8, nitrogenDioxide: 15, windSpeedMs: 2 }))).toEqual([]);
  });
});

describe('inversion night hours in the dataset timezone', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
  });

  const calmRising = [
    { pm25: 10, nitrogenDioxide: 20, windSpeedMs: 0.5 },
    { pm25: 12, nitrogenDioxide: 24, windSpeedMs: 0.6 },
    { pm25: 14, nitrogenDioxide: 28, windSpeedMs: 0.4 },
  ];
  const offsetSeries = (isoTimestamps: string[]): HourlyAtmosphericPoint[] => isoTimestamps.map((iso, index) => point({
    ...calmRising[index], isoTimestamp: iso, epochMs: Date.parse(iso),
  }));

  for (const viewerZone of ['UTC', 'America/Los_Angeles', 'Asia/Tokyo', 'Pacific/Kiritimati']) {
    it(`AEC-R23 judges explicit-offset timestamps by their own offset in a ${viewerZone} browser`, () => {
      process.env.TZ = viewerZone;
      const daytime = offsetSeries(['2026-06-01T12:00:00+09:00', '2026-06-01T13:00:00+09:00', '2026-06-01T14:00:00+09:00']);
      expect(detectAnomalies(daytime, 'UTC')).toEqual([]);
      expect(detectAnomalies(daytime, null)).toEqual([]);

      const overnight = offsetSeries(['2026-06-01T21:00:00+09:00', '2026-06-01T22:00:00+09:00', '2026-06-01T23:00:00+09:00']);
      expect(detectAnomalies(overnight, 'UTC')).toEqual([expect.objectContaining({ type: 'THERMAL_INVERSION', peakTimestamp: '2026-06-01T23:00:00+09:00' })]);
    });

    it(`AEC-R23 judges UTC (Z) timestamps in the dataset's IANA timezone in a ${viewerZone} browser`, () => {
      process.env.TZ = viewerZone;
      // 06:00–08:00Z is 02:00–04:00 in New York (EDT, UTC-4), 15:00–17:00 in Tokyo and daytime in UTC.
      const series = offsetSeries(['2026-06-01T06:00:00Z', '2026-06-01T07:00:00Z', '2026-06-01T08:00:00Z']);
      expect(detectAnomalies(series, 'America/New_York')).toHaveLength(1);
      expect(detectAnomalies(series, 'Asia/Tokyo')).toEqual([]);
      expect(detectAnomalies(series, null)).toEqual([]);
      expect(detectAnomalies(series, 'Not/AZone')).toEqual([]);
    });
  }

  it('AEC-R23 reads the local hour of wall-clock, offset and Z timestamps without the viewer timezone', () => {
    process.env.TZ = 'Asia/Kolkata';
    expect(datasetLocalHour({ isoTimestamp: '2026-06-01T05:00', epochMs: Date.parse('2026-06-01T10:00:00Z') }, 'America/Chicago')).toBe(5);
    expect(datasetLocalHour({ isoTimestamp: '2026-06-01 14:30:00 -0500', epochMs: Date.parse('2026-06-01T19:30:00Z') }, null)).toBe(14);
    expect(datasetLocalHour({ isoTimestamp: '2026-06-01T14:00:00.000Z', epochMs: Date.parse('2026-06-01T14:00:00Z') }, 'America/Chicago')).toBe(9);
    expect(datasetLocalHour({ isoTimestamp: '2026-06-01T14:00:00Z', epochMs: Date.parse('2026-06-01T14:00:00Z') }, null)).toBe(14);
  });
});

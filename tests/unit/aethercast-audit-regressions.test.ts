import { describe, expect, it } from 'vitest';
import { assessDataset, ppbToUgM3 } from '../../src/tools/aethercast/aethercast-engine';
import { parseCsvWithMapping, parseTimestampInZone } from '../../src/tools/aethercast/aethercast-import';
import type { AetherCastDataset, AetherCastSettings, HourlyAtmosphericPoint } from '../../src/tools/aethercast/aethercast-types';

const settings: AetherCastSettings = {
  activeStandard: 'US_EPA',
  skinType: 2,
  vulnerabilityLens: 'NONE',
  unitSystem: 'US',
};

function so2Series(ppbValues: readonly number[]): AetherCastDataset {
  const start = Date.parse('2026-06-01T00:00:00Z');
  const points: HourlyAtmosphericPoint[] = ppbValues.map((ppb, index) => {
    const epochMs = start + index * 3_600_000;
    return {
      isoTimestamp: new Date(epochMs).toISOString(),
      epochMs,
      pm25: null,
      pm10: null,
      carbonMonoxideUgM3: null,
      nitrogenDioxide: null,
      sulphurDioxide: ppbToUgM3(ppb, 64.07),
      ozone: null,
      uvIndex: null,
      uvIndexClearSky: null,
      windSpeedMs: null,
      providedUsAqi: null,
      providedEuropeanAqi: null,
    };
  });
  return {
    importSource: 'csv-mapped',
    latitude: null,
    longitude: null,
    elevationMeters: null,
    timezone: 'UTC',
    points,
    truncatedRows: 0,
  };
}

describe('AetherCast September 2026 audit regressions', () => {
  it('uses the EPA fixed AQI 200 SO2 rule when the hourly peak is at least 305 ppb but the 24-hour average is below 305 ppb', () => {
    const values = Array<number>(24).fill(10);
    values[23] = 400;
    const latest = assessDataset(so2Series(values), settings).at(-1);

    expect(latest?.pollutants.so2.subIndex).toBe(200);
    expect(latest?.compositeAqi).toBe(200);
    expect(latest?.pollutants.so2.epaAveragingLabel).toContain('fixed at 200');
  });

  it('rejects impossible Gregorian calendar dates instead of normalizing them', () => {
    expect(Number.isNaN(parseTimestampInZone('2026-02-30T12:00:00', 'UTC'))).toBe(true);
    expect(Number.isNaN(parseTimestampInZone('2026-02-30T12:00:00Z', null))).toBe(true);
  });

  it('rejects a nonexistent DST wall time instead of silently shifting it forward', () => {
    expect(Number.isNaN(parseTimestampInZone('2026-03-08T02:30:00', 'America/New_York'))).toBe(true);
  });

  it('rejects an ambiguous DST wall time so imports require an explicit offset', () => {
    expect(Number.isNaN(parseTimestampInZone('2026-11-01T01:30:00', 'America/New_York'))).toBe(true);
    expect(parseTimestampInZone('2026-11-01T01:30:00-04:00', 'America/New_York'))
      .toBe(Date.parse('2026-11-01T05:30:00Z'));
  });

  it('records accepted, rejected, explicit-offset, and wall-clock timestamp reconciliation counts', () => {
    const raw = [
      'time,pm25',
      '2026-11-01T01:30:00-04:00,8',
      '2026-11-01T01:30:00,9',
    ].join('\n');
    const result = parseCsvWithMapping(raw, { timestamp: 'time', pm25: 'pm25' }, {
      timezone: 'America/New_York',
      units: { pm25: 'UG_M3' },
    });

    expect(result.dataset?.points).toHaveLength(1);
    expect(result.dataset?.timestampReconciliation).toEqual({
      consideredRows: 2,
      acceptedRows: 1,
      rejectedRows: 1,
      explicitOffsetRows: 1,
      wallClockRows: 1,
      timezone: 'America/New_York',
      disambiguationPolicy: 'REJECT_AMBIGUOUS_OR_NONEXISTENT',
    });
  });
});

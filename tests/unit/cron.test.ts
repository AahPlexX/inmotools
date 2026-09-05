import { describe, expect, it } from 'vitest';
import {
  getCronRuns,
  isValidTimeZone,
  partitionTimeZones,
  projectRunToZones,
  runHourInZone,
} from '../../src/tools/cron/cron-engine';

describe('cron schedule projection', () => {
  it('returns ordered upcoming runs in the source timezone', () => {
    const runs = getCronRuns('0 9 * * 1-5', {
      count: 3,
      startDate: new Date('2026-08-31T00:00:00.000Z'),
      timeZone: 'UTC',
    });
    expect(runs.map((run) => run.toISOString())).toEqual([
      '2026-08-31T09:00:00.000Z',
      '2026-09-01T09:00:00.000Z',
      '2026-09-02T09:00:00.000Z',
    ]);
  });

  it('projects one instant into multiple named zones', () => {
    const projected = projectRunToZones(new Date('2026-08-31T15:00:00.000Z'), ['UTC', 'America/Chicago']);
    expect(projected.UTC).toContain('15:00');
    expect(projected['America/Chicago']).toContain('10:00');
  });
});


describe('timezone validation', () => {
  it('accepts a recognized IANA zone', () => {
    expect(isValidTimeZone('Europe/London')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
  });

  it('rejects an unrecognized zone instead of throwing', () => {
    expect(() => isValidTimeZone('Not/AZone')).not.toThrow();
    expect(isValidTimeZone('Not/AZone')).toBe(false);
  });

  it('rejects blank input', () => {
    expect(isValidTimeZone('')).toBe(false);
    expect(isValidTimeZone('   ')).toBe(false);
  });

  it('partitions a mixed list into usable and unusable zones', () => {
    const { valid, invalid } = partitionTimeZones(['UTC', 'Mars/Olympus', 'Asia/Tokyo']);
    expect(valid).toEqual(['UTC', 'Asia/Tokyo']);
    expect(invalid).toEqual(['Mars/Olympus']);
  });
});

describe('projection resilience', () => {
  const run = new Date('2026-09-04T12:00:00Z');

  it('projects a valid zone normally', () => {
    const projected = projectRunToZones(run, ['UTC']);
    expect(projected.UTC).toContain('2026');
  });

  it('reports an unusable zone rather than throwing mid-render', () => {
    expect(() => projectRunToZones(run, ['Mars/Olympus'])).not.toThrow();
    expect(projectRunToZones(run, ['Mars/Olympus'])['Mars/Olympus']).toBe('Unavailable');
  });

  it('still projects the valid zones alongside an invalid one', () => {
    const projected = projectRunToZones(run, ['UTC', 'Mars/Olympus']);
    expect(projected.UTC).toContain('2026');
    expect(projected['Mars/Olympus']).toBe('Unavailable');
  });

  it('returns the run hour for a valid zone', () => {
    expect(runHourInZone(run, 'UTC')).toBe(12);
  });

  it('returns null for an invalid zone rather than throwing', () => {
    expect(() => runHourInZone(run, 'Mars/Olympus')).not.toThrow();
    expect(runHourInZone(run, 'Mars/Olympus')).toBeNull();
  });
});

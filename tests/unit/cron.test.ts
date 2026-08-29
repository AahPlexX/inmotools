import { describe, expect, it } from 'vitest';
import { getCronRuns, projectRunToZones } from '../../src/tools/cron/cron-engine';

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

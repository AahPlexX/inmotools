import { describe, expect, it } from 'vitest';
import {
  buildCronCalendar,
  findTimeZoneOffsetTransitions,
  foldIcalLine,
  formatOffsetMinutes,
  formatRunInZone,
  getCronRuns,
  isRunInWorkingHours,
  isValidTimeZone,
  parseReferenceInstant,
  partitionTimeZones,
  projectRunToZones,
  runHourInZone,
  searchTimeZones,
  timeZoneOffsetMinutes,
} from '../../src/tools/cron/cron-engine';

describe('cron schedule projection', () => {
  it('returns ordered upcoming runs in the source timezone', () => {
    const runs = getCronRuns('0 9 * * 1-5', { count: 3, startDate: new Date('2026-08-31T00:00:00.000Z'), timeZone: 'UTC' });
    expect(runs.map((run) => run.toISOString())).toEqual(['2026-08-31T09:00:00.000Z', '2026-09-01T09:00:00.000Z', '2026-09-02T09:00:00.000Z']);
  });

  it('preserves seconds from six-field cron expressions', () => {
    const [run] = getCronRuns('17 * * * * *', { count: 1, startDate: new Date('2026-08-31T00:00:00.000Z'), timeZone: 'UTC' });
    expect(run.toISOString()).toBe('2026-08-31T00:00:17.000Z');
    expect(formatRunInZone(run, 'UTC')).toContain('00:00:17');
  });

  it('projects one instant into multiple named zones with offsets', () => {
    const projected = projectRunToZones(new Date('2026-08-31T15:00:00.000Z'), ['UTC', 'America/Chicago']);
    expect(projected.UTC).toContain('15:00:00');
    expect(projected['America/Chicago']).toContain('10:00:00');
    expect(projected.UTC).toMatch(/GMT|UTC/);
  });

  it('bounds the requested run count', () => {
    expect(() => getCronRuns('* * * * *', { count: 201 })).toThrow(/between 1 and 200/);
  });

  it('requires an unambiguous editable reference instant', () => {
    expect(parseReferenceInstant('2026-09-09T12:00:00Z').toISOString()).toBe('2026-09-09T12:00:00.000Z');
    expect(parseReferenceInstant('2026-09-09T07:00:00-05:00').toISOString()).toBe('2026-09-09T12:00:00.000Z');
    expect(() => parseReferenceInstant('2026-09-09T12:00:00')).toThrow(/explicit UTC offset/i);
  });
});

describe('timezone validation and discovery', () => {
  it('accepts recognized zones and rejects unknown ones safely', () => {
    expect(isValidTimeZone('Europe/London')).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });

  it('partitions valid, duplicate, invalid, and over-limit zones', () => {
    const result = partitionTimeZones(['UTC', 'UTC', 'Mars/Olympus', 'Asia/Tokyo', 'Europe/London'], 2);
    expect(result.valid).toEqual(['UTC', 'Asia/Tokyo']);
    expect(result.duplicates).toEqual(['UTC']);
    expect(result.invalid).toEqual(['Mars/Olympus']);
    expect(result.truncated).toEqual(['Europe/London']);
  });

  it('searches supported identifiers with starts-with matches first', () => {
    expect(searchTimeZones('to', ['Europe/London', 'America/Toronto', 'Tokyo/Example', 'Asia/Tokyo'])).toEqual(['Tokyo/Example', 'America/Toronto', 'Asia/Tokyo']);
  });
});

describe('working hours and offset changes', () => {
  it('returns run hours safely', () => {
    const run = new Date('2026-09-04T12:00:00Z');
    expect(runHourInZone(run, 'UTC')).toBe(12);
    expect(runHourInZone(run, 'Mars/Olympus')).toBeNull();
  });

  it('supports normal and overnight working-hour windows', () => {
    expect(isRunInWorkingHours(new Date('2026-09-04T12:00:00Z'), 'UTC', 9, 17)).toBe(true);
    expect(isRunInWorkingHours(new Date('2026-09-04T23:00:00Z'), 'UTC', 9, 17)).toBe(false);
    expect(isRunInWorkingHours(new Date('2026-09-04T23:00:00Z'), 'UTC', 22, 6)).toBe(true);
  });

  it('reports concrete New York UTC-offset changes', () => {
    expect(timeZoneOffsetMinutes(new Date('2026-01-15T12:00:00Z'), 'America/New_York')).toBe(-300);
    const transitions = findTimeZoneOffsetTransitions('America/New_York', new Date('2026-01-01T00:00:00Z'), 2, 370);
    expect(transitions).toHaveLength(2);
    expect(transitions.map(({ fromMinutes, toMinutes }) => [fromMinutes, toMinutes])).toEqual([[-300, -240], [-240, -300]]);
    expect(formatOffsetMinutes(-300)).toBe('UTC−05:00');
  });
});

describe('finite iCalendar export', () => {
  it('exports only the calculated occurrences, never an open-ended recurrence', () => {
    const calendar = buildCronCalendar([new Date('2026-09-09T12:00:17Z'), new Date('2026-09-09T12:01:17Z')], {
      expression: '17 * * * * *',
      sourceZone: 'UTC',
      generatedAt: new Date('2026-09-09T12:00:00Z'),
    });
    expect(calendar.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    expect(calendar).toContain('DTSTART:20260909T120017Z');
    expect(calendar).not.toContain('RRULE');
    expect(calendar.endsWith('\r\n')).toBe(true);
  });

  it('folds content lines to the RFC 5545 75-octet limit', () => {
    const folded = foldIcalLine(`DESCRIPTION:${'é'.repeat(100)}`);
    const lengths = folded.split('\r\n').map((line) => new TextEncoder().encode(line).length);
    expect(Math.max(...lengths)).toBeLessThanOrEqual(75);
    expect(folded.split('\r\n').slice(1).every((line) => line.startsWith(' '))).toBe(true);
  });
});

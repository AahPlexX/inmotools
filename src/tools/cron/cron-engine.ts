import { CronExpressionParser } from 'cron-parser';

export interface CronRunOptions {
  count?: number;
  startDate?: Date;
  timeZone?: string;
}

export function getCronRuns(expression: string, options: CronRunOptions = {}): Date[] {
  const interval = CronExpressionParser.parse(expression, {
    currentDate: options.startDate ?? new Date(),
    tz: options.timeZone ?? 'UTC',
  });
  return interval.take(options.count ?? 30).map((value) => value.toDate());
}

// Both projection helpers below take timezone strings straight from free-text
// user input. `Intl.DateTimeFormat` throws a RangeError for an unrecognized
// IANA zone, and these functions are called during render, so an unguarded
// throw takes the whole workspace down rather than reporting a bad zone. Every
// zone is therefore validated before use and reported, never thrown on.

export function isValidTimeZone(zone: string): boolean {
  if (!zone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

// Partitions a caller-supplied zone list into the zones that can actually be
// formatted and the ones that cannot, so the interface can render the valid
// columns and name the invalid entries instead of failing wholesale.
export function partitionTimeZones(zones: string[]): { valid: string[]; invalid: string[] } {
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const zone of zones) (isValidTimeZone(zone) ? valid : invalid).push(zone);
  return { valid, invalid };
}

const UNAVAILABLE = 'Unavailable';

export function projectRunToZones(run: Date, zones: string[]): Record<string, string> {
  return Object.fromEntries(zones.map((zone) => {
    try {
      return [zone, new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
        hour12: false,
      }).format(run)];
    } catch {
      return [zone, UNAVAILABLE];
    }
  }));
}

// The hour a run falls on in a given zone, or null when the zone cannot be
// resolved. Returning null keeps the 24-hour distribution renderable when the
// source zone is mid-edit and temporarily invalid.
export function runHourInZone(run: Date, zone: string): number | null {
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hour: '2-digit', hourCycle: 'h23',
    }).format(run);
    const hour = Number(formatted);
    return Number.isFinite(hour) ? hour : null;
  } catch {
    return null;
  }
}

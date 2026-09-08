import { CronExpressionParser } from 'cron-parser';

export interface CronRunOptions {
  count?: number;
  startDate?: Date;
  timeZone?: string;
}

export const MAX_COMPARISON_ZONES = 24;

export function getCronRuns(expression: string, options: CronRunOptions = {}): Date[] {
  const count = options.count ?? 30;
  if (!Number.isInteger(count) || count < 1 || count > 200) throw new Error('Run count must be between 1 and 200.');
  const interval = CronExpressionParser.parse(expression, {
    currentDate: options.startDate ?? new Date(),
    tz: options.timeZone ?? 'UTC',
  });
  return interval.take(count).map((value) => value.toDate());
}

export function isValidTimeZone(zone: string): boolean {
  if (!zone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export interface PartitionedTimeZones {
  valid: string[];
  invalid: string[];
  duplicates: string[];
  truncated: string[];
}

export function partitionTimeZones(zones: string[], limit = MAX_COMPARISON_ZONES): PartitionedTimeZones {
  const valid: string[] = [];
  const invalid: string[] = [];
  const duplicates: string[] = [];
  const truncated: string[] = [];
  const seen = new Set<string>();
  for (const raw of zones) {
    const zone = raw.trim();
    if (!zone) continue;
    if (seen.has(zone)) {
      if (!duplicates.includes(zone)) duplicates.push(zone);
      continue;
    }
    seen.add(zone);
    if (!isValidTimeZone(zone)) {
      invalid.push(zone);
      continue;
    }
    if (valid.length >= limit) {
      truncated.push(zone);
      continue;
    }
    valid.push(zone);
  }
  return { valid, invalid, duplicates, truncated };
}

const UNAVAILABLE = 'Unavailable';

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): string {
  return parts.find((item) => item.type === type)?.value ?? '';
}

export function formatRunInZone(run: Date, zone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
      timeZoneName: 'shortOffset',
    }).formatToParts(run);
    return `${part(parts, 'year')}-${part(parts, 'month')}-${part(parts, 'day')} ${part(parts, 'hour')}:${part(parts, 'minute')}:${part(parts, 'second')} ${part(parts, 'timeZoneName')}`.trim();
  } catch {
    return UNAVAILABLE;
  }
}

export function projectRunToZones(run: Date, zones: string[]): Record<string, string> {
  return Object.fromEntries(zones.map((zone) => [zone, formatRunInZone(run, zone)]));
}

export function runHourInZone(run: Date, zone: string): number | null {
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(run);
    const hour = Number(formatted);
    return Number.isFinite(hour) ? hour : null;
  } catch {
    return null;
  }
}

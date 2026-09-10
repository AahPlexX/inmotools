import { CronExpressionParser } from 'cron-parser';

export interface CronRunOptions {
  count?: number;
  startDate?: Date;
  timeZone?: string;
}

export interface TimeZoneOffsetTransition {
  instant: Date;
  fromMinutes: number;
  toMinutes: number;
}

export interface CronCalendarOptions {
  expression: string;
  sourceZone: string;
  generatedAt?: Date;
  durationMinutes?: number;
}

export const MAX_COMPARISON_ZONES = 24;
const UNAVAILABLE = 'Unavailable';
const REFERENCE_WITH_OFFSET = /(?:Z|[+-]\d{2}:\d{2})$/i;
const REFERENCE_DATE_PARTS = /^([+-]?\d{4,6})-(\d{2})-(\d{2})T/i;
const utf8 = new TextEncoder();

function hasValidReferenceCalendarDate(value: string): boolean {
  const match = REFERENCE_DATE_PARTS.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!Number.isInteger(year) || month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

export function getCronRuns(expression: string, options: CronRunOptions = {}): Date[] {
  const count = options.count ?? 30;
  if (!Number.isInteger(count) || count < 1 || count > 200) throw new Error('Run count must be between 1 and 200.');
  const interval = CronExpressionParser.parse(expression, {
    currentDate: options.startDate ?? new Date(),
    tz: options.timeZone ?? 'UTC',
  });
  return interval.take(count).map((value) => value.toDate());
}

export function parseReferenceInstant(value: string): Date {
  const text = value.trim();
  if (!REFERENCE_WITH_OFFSET.test(text)) throw new Error('Reference instant must include Z or an explicit UTC offset such as +05:30.');
  if (!hasValidReferenceCalendarDate(text)) throw new Error('Reference instant is not a valid ISO 8601 date and time.');
  const date = new Date(text);
  if (!Number.isFinite(date.getTime())) throw new Error('Reference instant is not a valid ISO 8601 date and time.');
  return date;
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

export function getSupportedTimeZones(): string[] {
  const intl = Intl as typeof Intl & { supportedValuesOf?: (key: 'timeZone') => string[] };
  const supported = typeof intl.supportedValuesOf === 'function' ? intl.supportedValuesOf('timeZone') : [];
  return [...new Set(['UTC', ...supported])];
}

export function searchTimeZones(query: string, zones = getSupportedTimeZones(), limit = 12): string[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const matches = zones.filter((zone) => zone.toLocaleLowerCase().includes(needle));
  matches.sort((a, b) => {
    const aLower = a.toLocaleLowerCase();
    const bLower = b.toLocaleLowerCase();
    const aPrefix = aLower.startsWith(needle) ? 0 : 1;
    const bPrefix = bLower.startsWith(needle) ? 0 : 1;
    return aPrefix - bPrefix || a.localeCompare(b);
  });
  return matches.slice(0, Math.max(1, limit));
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

export function runMinutesInZone(run: Date, zone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(run);
    const hour = Number(part(parts, 'hour'));
    const minute = Number(part(parts, 'minute'));
    return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
  } catch {
    return null;
  }
}

export function isRunInWorkingHours(run: Date, zone: string, startHour = 9, endHour = 17): boolean {
  if (!Number.isInteger(startHour) || !Number.isInteger(endHour) || startHour < 0 || startHour > 23 || endHour < 1 || endHour > 24 || startHour === endHour) return false;
  const minutes = runMinutesInZone(run, zone);
  if (minutes === null) return false;
  const start = startHour * 60;
  const end = endHour * 60;
  return start < end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
}

export function timeZoneOffsetMinutes(run: Date, zone: string): number | null {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      hour: '2-digit',
      timeZoneName: 'longOffset',
    }).formatToParts(run);
    const label = part(parts, 'timeZoneName');
    if (/^(?:GMT|UTC)$/i.test(label)) return 0;
    const match = /^(?:GMT|UTC)([+-])(\d{1,2})(?::(\d{2}))?$/i.exec(label);
    if (!match) return null;
    const minutes = Number(match[2]) * 60 + Number(match[3] || 0);
    return match[1] === '-' ? -minutes : minutes;
  } catch {
    return null;
  }
}

export function formatOffsetMinutes(minutes: number): string {
  const sign = minutes < 0 ? '−' : '+';
  const absolute = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

export function findTimeZoneOffsetTransitions(zone: string, start: Date, limit = 2, horizonDays = 370): TimeZoneOffsetTransition[] {
  if (!isValidTimeZone(zone) || !Number.isFinite(start.getTime()) || !Number.isInteger(limit) || limit < 1 || !Number.isFinite(horizonDays) || horizonDays < 1) return [];
  const transitions: TimeZoneOffsetTransition[] = [];
  let previousInstant = new Date(start);
  let previousOffset = timeZoneOffsetMinutes(previousInstant, zone);
  if (previousOffset === null) return transitions;
  const end = start.getTime() + horizonDays * 86_400_000;

  for (let time = start.getTime() + 12 * 3_600_000; time <= end && transitions.length < limit; time += 12 * 3_600_000) {
    const probe = new Date(time);
    const probeOffset = timeZoneOffsetMinutes(probe, zone);
    if (probeOffset === null) break;
    if (probeOffset !== previousOffset) {
      let low = previousInstant.getTime();
      let high = probe.getTime();
      while (high - low > 60_000) {
        const mid = Math.floor((low + high) / 2);
        const midOffset = timeZoneOffsetMinutes(new Date(mid), zone);
        if (midOffset === previousOffset) low = mid;
        else high = mid;
      }
      transitions.push({
        instant: new Date(Math.ceil(high / 60_000) * 60_000),
        fromMinutes: previousOffset,
        toMinutes: probeOffset,
      });
      previousOffset = probeOffset;
    }
    previousInstant = probe;
  }
  return transitions;
}

function escapeIcalText(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replace(/\r?\n/g, '\\n');
}

function formatUtcIcal(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function foldIcalLine(line: string): string {
  const lines: string[] = [];
  let current = '';
  let currentBytes = 0;
  for (const char of line) {
    const bytes = utf8.encode(char).length;
    if (current && currentBytes + bytes > 75) {
      lines.push(current);
      current = ` ${char}`;
      currentBytes = 1 + bytes;
    } else {
      current += char;
      currentBytes += bytes;
    }
  }
  lines.push(current);
  return lines.join('\r\n');
}

export function buildCronCalendar(runs: readonly Date[], options: CronCalendarOptions): string {
  const generatedAt = options.generatedAt ?? new Date();
  const durationMinutes = options.durationMinutes ?? 1;
  if (!Number.isFinite(generatedAt.getTime())) throw new Error('Calendar generation time is invalid.');
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || durationMinutes > 1440) throw new Error('Calendar event duration must be between 1 minute and 24 hours.');

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//InMo Tools//Cron Team Matrix//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:Cron Team Matrix',
  ];

  runs.forEach((run, index) => {
    if (!Number.isFinite(run.getTime())) throw new Error('Calendar contains an invalid run instant.');
    lines.push(
      'BEGIN:VEVENT',
      `UID:cron-${run.getTime()}-${index}@inmotools.local`,
      `DTSTAMP:${formatUtcIcal(generatedAt)}`,
      `DTSTART:${formatUtcIcal(run)}`,
      `DTEND:${formatUtcIcal(new Date(run.getTime() + durationMinutes * 60_000))}`,
      `SUMMARY:${escapeIcalText(`Cron run — ${options.expression}`)}`,
      `DESCRIPTION:${escapeIcalText(`Finite exported occurrence from ${options.sourceZone}. Generated locally by Cron Team Matrix.`)}`,
      'END:VEVENT',
    );
  });
  lines.push('END:VCALENDAR');
  return `${lines.map(foldIcalLine).join('\r\n')}\r\n`;
}

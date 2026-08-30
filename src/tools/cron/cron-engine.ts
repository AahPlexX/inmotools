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

export function projectRunToZones(run: Date, zones: string[]): Record<string, string> {
  return Object.fromEntries(zones.map((zone) => [zone, new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit',
    hour12: false,
  }).format(run)]));
}

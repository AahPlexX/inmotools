import type { AnomalyEvent, HourlyAtmosphericPoint } from './aethercast-types';
import { ugM3ToPpm } from './aethercast-engine';

const WILDFIRE_RATE_THRESHOLD_UGM3_PER_HOUR = 25;
const WILDFIRE_PM25_CO_RATIO_THRESHOLD = 30;
const INVERSION_WIND_THRESHOLD_MS = 1.5;
const NIGHT_START_HOUR = 20;
const NIGHT_END_HOUR = 6;

const TIMESTAMP_HOUR = /^\d{4}-\d{2}-\d{2}[T ](\d{2}):\d{2}(?::\d{2}(?:\.\d+)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i;

const hourInZone = (epochMs: number, timeZone: string): number | null => {
  try {
    const hour = new Intl.DateTimeFormat('en-US', { timeZone, hour: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(epochMs))
      .find((part) => part.type === 'hour')?.value;
    return hour === undefined ? null : Number(hour) % 24;
  } catch {
    return null;
  }
};

/**
 * Hour of day at the dataset's location, independent of the viewer's timezone.
 * Wall-clock timestamps and timestamps with a numeric UTC offset carry the location's hour as written;
 * `Z` timestamps use the dataset's IANA timezone when one is valid, otherwise UTC.
 */
export function datasetLocalHour(point: Pick<HourlyAtmosphericPoint, 'isoTimestamp' | 'epochMs'>, timeZone: string | null = null): number {
  const match = TIMESTAMP_HOUR.exec(point.isoTimestamp.trim());
  const zone = match?.[2];
  if (match && (!zone || zone.toUpperCase() !== 'Z')) return Number(match[1]);
  const zoned = timeZone ? hourInZone(point.epochMs, timeZone) : null;
  return zoned ?? new Date(point.epochMs).getUTCHours();
}

export function detectAnomalies(points: readonly HourlyAtmosphericPoint[], timeZone: string | null = null): AnomalyEvent[] {
  const events: AnomalyEvent[] = [];

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous.pm25 === null || current.pm25 === null) continue;

    const hours = (current.epochMs - previous.epochMs) / 3_600_000;
    if (hours <= 0) continue;

    const rate = (current.pm25 - previous.pm25) / hours;
    if (rate < WILDFIRE_RATE_THRESHOLD_UGM3_PER_HOUR) continue;

    let confirmed = false;
    if (current.carbonMonoxideUgM3 !== null && current.carbonMonoxideUgM3 > 0) {
      const coPpm = ugM3ToPpm(current.carbonMonoxideUgM3);
      const ratio = coPpm > 0 ? current.pm25 / coPpm : 0;
      confirmed = ratio >= WILDFIRE_PM25_CO_RATIO_THRESHOLD;
    }

    events.push({
      type: 'WILDFIRE_SCREEN',
      startTimestamp: previous.isoTimestamp,
      peakTimestamp: current.isoTimestamp,
      confirmed,
      advisoryMessage: confirmed
        ? 'Rapid PM2.5 rise corroborated by an elevated PM2.5/CO ratio, consistent with a nearby wildfire smoke plume. Screening heuristic, not a certified detection.'
        : 'Rapid PM2.5 rise detected; carbon monoxide was not available to corroborate a wildfire source. Screening heuristic only, verify with a local air-quality authority.',
    });
  }

  for (let index = 2; index < points.length; index += 1) {
    const window = [points[index - 2], points[index - 1], points[index]];
    if (window.some((point) => point.pm25 === null || point.nitrogenDioxide === null || point.windSpeedMs === null)) {
      continue;
    }

    const localHour = datasetLocalHour(window[2], timeZone);
    const isNight = localHour >= NIGHT_START_HOUR || localHour < NIGHT_END_HOUR;
    const calmThroughout = window.every((point) => (point.windSpeedMs as number) < INVERSION_WIND_THRESHOLD_MS);
    const pm25Rising = (window[0].pm25 as number) < (window[1].pm25 as number) && (window[1].pm25 as number) < (window[2].pm25 as number);
    const no2Rising =
      (window[0].nitrogenDioxide as number) < (window[1].nitrogenDioxide as number) &&
      (window[1].nitrogenDioxide as number) < (window[2].nitrogenDioxide as number);

    if (isNight && calmThroughout && pm25Rising && no2Rising) {
      events.push({
        type: 'THERMAL_INVERSION',
        startTimestamp: window[0].isoTimestamp,
        peakTimestamp: window[2].isoTimestamp,
        confirmed: true,
        advisoryMessage: 'Calm winds with rising PM2.5 and NO2 over three consecutive overnight hours are consistent with a low-level thermal inversion trapping pollutants near the surface. Screening heuristic only.',
      });
    }
  }

  return events;
}

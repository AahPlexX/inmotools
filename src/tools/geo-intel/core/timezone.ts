// IANA time-zone math on top of the browser's Intl data (no network).

export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const offsetFormatters = new Map<string, Intl.DateTimeFormat>();

/** UTC offset in minutes for `zone` at `instant` (east positive). */
export function offsetMinutes(zone: string, instant: Date): number {
  let formatter = offsetFormatters.get(zone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset', year: 'numeric' });
    offsetFormatters.set(zone, formatter);
  }
  const name = formatter.formatToParts(instant).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /GMT([+-])(\d{1,2})(?::?(\d{2}))?/.exec(name);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === '-' ? -minutes : minutes;
}

export function formatOffset(minutes: number): string {
  const sign = minutes < 0 ? '−' : '+';
  const abs = Math.abs(minutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** Standard offset = smaller of the January/July offsets of that year. */
/** Offsets sampled twice a month, so changes outside January/July (e.g. Morocco's Ramadan shift) are seen. */
function yearOffsets(zone: string, year: number): number[] {
  return Array.from({ length: 24 }, (_, i) => offsetMinutes(zone, new Date(Date.UTC(year, Math.floor(i / 2), i % 2 ? 16 : 1))));
}

export function standardOffsetMinutes(zone: string, year: number): number {
  return Math.min(...yearOffsets(zone, year));
}

export function observesDst(zone: string, year: number): boolean {
  return new Set(yearOffsets(zone, year)).size > 1;
}

export function isDst(zone: string, instant: Date): boolean {
  return offsetMinutes(zone, instant) > standardOffsetMinutes(zone, instant.getUTCFullYear());
}

export interface Transition {
  at: Date;
  fromMinutes: number;
  toMinutes: number;
}

/** Next offset change after `from`, searched up to `horizonDays` ahead, resolved to the minute. */
export function nextTransition(zone: string, from: Date, horizonDays = 400): Transition | null {
  const start = from.getTime();
  const base = offsetMinutes(zone, from);
  const stepMs = 6 * 3_600_000;
  for (let t = start + stepMs; t <= start + horizonDays * 86_400_000; t += stepMs) {
    const offset = offsetMinutes(zone, new Date(t));
    if (offset !== base) {
      let lo = t - stepMs; let hi = t;
      while (hi - lo > 60_000) {
        const mid = Math.floor((lo + hi) / 2 / 60_000) * 60_000;
        if (mid <= lo || mid >= hi) break;
        if (offsetMinutes(zone, new Date(mid)) === base) lo = mid; else hi = mid;
      }
      return { at: new Date(hi), fromMinutes: base, toMinutes: offset };
    }
  }
  return null;
}

export function abbreviation(zone: string, instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'short' }).formatToParts(instant);
  return parts.find((part) => part.type === 'timeZoneName')?.value ?? '';
}

export function formatInZone(zone: string, instant: Date, options: Intl.DateTimeFormatOptions = {}): string {
  return new Intl.DateTimeFormat(undefined, { timeZone: zone, dateStyle: 'medium', timeStyle: 'medium', ...options }).format(instant);
}

/** Calendar date (YYYY-MM-DD) of `instant` in `zone`. */
export function localDate(zone: string, instant: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Offset-based fallback zone for points no polygon covers (open ocean). */
export function nauticalZone(lon: number): string {
  const hours = Math.round(lon / 15);
  if (hours === 0) return 'Etc/GMT';
  // POSIX-style names invert the sign: Etc/GMT+5 is UTC−05:00.
  return hours > 0 ? `Etc/GMT-${hours}` : `Etc/GMT+${-hours}`;
}

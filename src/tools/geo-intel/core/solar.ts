// Offline solar model (NOAA Solar Calculator equations, after Meeus). Used when
// both sun-time APIs are unreachable, and to derive windows the APIs omit.
// Expected agreement with the NOAA calculator is about ±1 minute below ±65°
// latitude; refraction is the standard 34′ plus the 16′ solar semi-diameter.

import type { SolarTimes } from './types';

const rad = (deg: number) => (deg * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

function julianCentury(ms: number): number {
  return (ms / 86_400_000 + 2440587.5 - 2451545) / 36525;
}

export interface SunPosition {
  declination: number;
  equationOfTimeMinutes: number;
}

export function sunPosition(ms: number): SunPosition {
  const T = julianCentury(ms);
  const L0 = (280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const C = Math.sin(rad(M)) * (1.914602 - T * (0.004817 + 0.000014 * T))
    + Math.sin(rad(2 * M)) * (0.019993 - 0.000101 * T)
    + Math.sin(rad(3 * M)) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(rad(omega));
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(rad(omega));
  const declination = deg(Math.asin(Math.sin(rad(eps)) * Math.sin(rad(lambda))));
  const y = Math.tan(rad(eps / 2)) ** 2;
  const eot = y * Math.sin(2 * rad(L0)) - 2 * e * Math.sin(rad(M)) + 4 * e * y * Math.sin(rad(M)) * Math.cos(2 * rad(L0))
    - 0.5 * y * y * Math.sin(4 * rad(L0)) - 1.25 * e * e * Math.sin(2 * rad(M));
  return { declination, equationOfTimeMinutes: 4 * deg(eot) };
}

/** Solar noon for the calendar date `ymd` at longitude `lon` (UTC ms). */
export function solarNoon(ymd: string, lon: number): number {
  const [y, m, d] = ymd.split('-').map(Number);
  const midnight = Date.UTC(y, m - 1, d);
  let noon = midnight + (720 - 4 * lon) * 60_000;
  for (let i = 0; i < 2; i += 1) noon = midnight + (720 - 4 * lon - sunPosition(noon).equationOfTimeMinutes) * 60_000;
  return noon;
}

/**
 * Time the sun's centre crosses `altitude` degrees (negative = below horizon)
 * on `ymd`, rising or setting. Returns null when it never crosses that day.
 */
export function altitudeCrossing(ymd: string, lat: number, lon: number, altitude: number, rising: boolean): number | null {
  const noon = solarNoon(ymd, lon);
  let t = noon;
  // Re-evaluate declination at the event time; three passes converge to seconds.
  for (let i = 0; i < 3; i += 1) {
    const { declination } = sunPosition(t);
    const cosH = (Math.sin(rad(altitude)) - Math.sin(rad(lat)) * Math.sin(rad(declination))) / (Math.cos(rad(lat)) * Math.cos(rad(declination)));
    if (cosH < -1 || cosH > 1) return null;
    t = noon + (rising ? -1 : 1) * deg(Math.acos(cosH)) * 4 * 60_000;
  }
  return t;
}

export const HORIZON = -0.833;
export const CIVIL = -6;
export const NAUTICAL = -12;
export const ASTRONOMICAL = -18;
export const GOLDEN_UPPER = 6;
export const BLUE_UPPER = -4;

const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());
const pair = (a: number | null, b: number | null): [string, string] | null => (a === null || b === null ? null : [new Date(a).toISOString(), new Date(b).toISOString()]);

export function computeSolarTimes(ymd: string, lat: number, lon: number, provenance: SolarTimes['provenance']): SolarTimes {
  const rise = altitudeCrossing(ymd, lat, lon, HORIZON, true);
  const set = altitudeCrossing(ymd, lat, lon, HORIZON, false);
  const noon = solarNoon(ymd, lon);
  const { declination } = sunPosition(noon);
  const noonAltitude = 90 - Math.abs(lat - declination);
  const status: SolarTimes['status'] = rise !== null ? 'normal' : noonAltitude > 0 ? 'polar_day' : 'polar_night';
  const at = (alt: number, rising: boolean) => altitudeCrossing(ymd, lat, lon, alt, rising);
  return {
    sunrise: iso(rise),
    sunset: iso(set),
    solarNoon: iso(noon),
    dayLengthSeconds: rise !== null && set !== null ? Math.round((set - rise) / 1000) : status === 'polar_day' ? 86_400 : 0,
    civilDawn: iso(at(CIVIL, true)),
    civilDusk: iso(at(CIVIL, false)),
    nauticalDawn: iso(at(NAUTICAL, true)),
    nauticalDusk: iso(at(NAUTICAL, false)),
    astronomicalDawn: iso(at(ASTRONOMICAL, true)),
    astronomicalDusk: iso(at(ASTRONOMICAL, false)),
    goldenMorning: pair(at(BLUE_UPPER, true), at(GOLDEN_UPPER, true)),
    goldenEvening: pair(at(GOLDEN_UPPER, false), at(BLUE_UPPER, false)),
    blueMorning: pair(at(CIVIL, true), at(BLUE_UPPER, true)),
    blueEvening: pair(at(BLUE_UPPER, false), at(CIVIL, false)),
    status,
    provenance,
  };
}

/** Rule-of-thumb windows (sunrise→+1 h, sunset−1 h→sunset) for providers that omit golden hour. */
export function ruleOfThumbGolden(sunrise: string | null, sunset: string | null): { morning: [string, string] | null; evening: [string, string] | null } {
  const shift = (value: string, ms: number) => new Date(new Date(value).getTime() + ms).toISOString();
  return {
    morning: sunrise ? [sunrise, shift(sunrise, 3_600_000)] : null,
    evening: sunset ? [shift(sunset, -3_600_000), sunset] : null,
  };
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h} h ${String(m).padStart(2, '0')} min`;
}

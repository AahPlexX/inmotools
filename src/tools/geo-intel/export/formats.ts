// Text exports: JSON (full provenance), flat CSV, iCalendar, metadata helpers.

import Papa from 'papaparse';
import { SOURCES } from '../core/sources';
import type { ExportMetadata, FieldGroup, LocationProfile, SourceId } from '../core/types';
import { FIELD_GROUP_LABELS } from '../core/types';

export const GENERATOR = 'InMo Tools · Geo Intelligence Hub';

export interface ResolvedMetadata extends ExportMetadata {
  title: string;
  date: string;
  licenseText: string;
}

export function resolveMetadata(meta: ExportMetadata, profiles: LocationProfile[], now = new Date()): ResolvedMetadata {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(meta.dateOverride) ? meta.dateOverride : now.toISOString().slice(0, 10);
  const fallbackTitle = profiles.length === 1 ? profiles[0].label : `${profiles.length} locations`;
  return {
    ...meta,
    title: meta.title.trim() || fallbackTitle,
    author: meta.author.trim(),
    tags: meta.tags.map((tag) => tag.trim()).filter(Boolean),
    date,
    licenseText: meta.license === 'custom' ? meta.customLicense.trim() || 'All rights reserved' : meta.license,
  };
}

export function fileSlug(text: string, fallback = 'location'): string {
  const slug = text.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60);
  return slug || fallback;
}

export function sourcesFor(profiles: LocationProfile[]): Array<{ id: SourceId; name: string; license: string; attribution: string; homepage: string }> {
  const ids = new Set<SourceId>();
  for (const profile of profiles) {
    for (const id of profile.sourcesUsed) ids.add(id);
    for (const item of profile.fields) ids.add(item.source);
  }
  return [...ids].filter((id) => !['computed', 'user', 'device'].includes(id)).map((id) => ({ id, name: SOURCES[id].name, license: SOURCES[id].license, attribution: SOURCES[id].attribution, homepage: SOURCES[id].homepage }));
}

export function attributionLines(profiles: LocationProfile[]): string[] {
  return sourcesFor(profiles).map((source) => `${source.attribution}${source.homepage ? ` — ${source.homepage}` : ''}`);
}

// ---------------- JSON ----------------

export function buildJson(profiles: LocationProfile[], meta: ResolvedMetadata): string {
  return `${JSON.stringify({
    schema: 'geo-intel-export/1',
    generator: GENERATOR,
    metadata: { title: meta.title, author: meta.author, description: meta.description, tags: meta.tags, date: meta.date, license: meta.licenseText, notes: meta.notes },
    sources: sourcesFor(profiles),
    profiles,
  }, null, 2)}\n`;
}

// ---------------- CSV ----------------

export interface CsvOptions { groups: FieldGroup[]; provenance: boolean }

export function csvColumns(profiles: LocationProfile[], options: CsvOptions): string[] {
  const keys: string[] = [];
  for (const group of options.groups) for (const profile of profiles) for (const item of profile.fields) {
    if (item.group === group && !keys.includes(item.key)) keys.push(item.key);
  }
  return keys;
}

export function buildCsv(profiles: LocationProfile[], meta: ResolvedMetadata, options: CsvOptions): string {
  const keys = csvColumns(profiles, options);
  const provenanceColumns = options.provenance ? ['source', 'unit', 'reference_year', 'retrieved_at', 'confidence_class', 'license'] as const : [];
  const header = ['profile_id', 'label', 'latitude', 'longitude', ...keys.flatMap((key) => [key, ...provenanceColumns.map((column) => `${key}__${column}`)]), 'meta_title', 'meta_author', 'meta_tags', 'meta_date', 'meta_license', 'meta_notes'];
  const rows = profiles.map((profile) => {
    const byKey = new Map(profile.fields.map((item) => [item.key, item]));
    return [profile.id, profile.label, profile.lat.toFixed(6), profile.lon.toFixed(6), ...keys.flatMap((key) => {
      const item = byKey.get(key);
      return [item?.value ?? '', ...provenanceColumns.map((column) => item?.[column] ?? '')];
    }), meta.title, meta.author, meta.tags.join('; '), meta.date, meta.licenseText, meta.notes];
  });
  // Neutralise spreadsheet formula injection in text cells (OWASP CSV injection guidance).
  const safe = (value: unknown) => (typeof value === 'string' && /^[=+\-@\t\r]/.test(value) && !/^-?\d/.test(value) ? `'${value}` : value);
  return `${Papa.unparse({ fields: header, data: rows.map((row) => row.map(safe)) })}\r\n`;
}

export const GROUP_OPTIONS = (Object.keys(FIELD_GROUP_LABELS) as FieldGroup[]).map((group) => ({ group, label: FIELD_GROUP_LABELS[group] }));

// ---------------- iCalendar (RFC 5545) ----------------

export function icsEscape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Folds content lines to ≤75 octets (RFC 5545 §3.1), never splitting a UTF-8 sequence. */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (size + bytes > limit) { parts.push(current); current = ''; size = 0; }
    current += char; size += bytes;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

const compactDate = (iso: string) => iso.replace(/-/g, '');
const nextDay = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

export function buildIcs(profile: LocationProfile, meta: ResolvedMetadata, calendarName: string, now = new Date()): string {
  const calendar = profile.holidays;
  if (!calendar) throw new Error('This location has no holiday calendar');
  const name = calendarName.trim() || `Public holidays ${calendar.countryCode} ${calendar.year}`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//InMo Tools//Geo Intelligence Hub//EN`, 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:${icsEscape(name)}`,
    `X-WR-CALDESC:${icsEscape(`${meta.description || `Public holidays for ${calendar.countryCode} in ${calendar.year}`}. Source: Nager.Date (date.nager.at). Compiled by ${meta.author || 'InMo Tools'}; license ${meta.licenseText}.`)}`,
  ];
  for (const holiday of calendar.items) {
    const regional = holiday.global ? '' : ` Regional: ${(holiday.counties ?? []).join(', ')}.`;
    lines.push(
      'BEGIN:VEVENT',
      `UID:${compactDate(holiday.date)}-${calendar.countryCode}-${fileSlug(holiday.name)}@geo-intelligence-hub.inmotools`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${compactDate(holiday.date)}`,
      `DTEND;VALUE=DATE:${compactDate(nextDay(holiday.date))}`,
      `SUMMARY:${icsEscape(holiday.localName && holiday.localName !== holiday.name ? `${holiday.name} (${holiday.localName})` : holiday.name)}`,
      `DESCRIPTION:${icsEscape(`${holiday.types.join(', ')} holiday in ${calendar.countryCode}.${regional} Source: Nager.Date.`)}`,
      `CATEGORIES:${[...holiday.types, ...meta.tags].map(icsEscape).join(',')}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}

export function buildHolidayCsv(profile: LocationProfile): string {
  const calendar = profile.holidays;
  if (!calendar) return '';
  return `${Papa.unparse({ fields: ['date', 'name', 'local_name', 'nationwide', 'regions', 'types'], data: calendar.items.map((h) => [h.date, h.name, h.localName, h.global ? 'yes' : 'no', (h.counties ?? []).join('; '), h.types.join('; ')]) })}\r\n`;
}

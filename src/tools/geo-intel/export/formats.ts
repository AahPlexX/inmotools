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

// ---------------- GeoJSON (RFC 7946) and KML 2.2 ----------------

const scalar = (profile: LocationProfile) => Object.fromEntries(profile.fields.map((item) => [item.key, item.value]));

export function buildGeoJson(profiles: LocationProfile[], meta: ResolvedMetadata): string {
  return `${JSON.stringify({
    type: 'FeatureCollection',
    // Foreign members are allowed by RFC 7946 §6.1.
    metadata: { title: meta.title, author: meta.author, description: meta.description, tags: meta.tags, date: meta.date, license: meta.licenseText, notes: meta.notes, generator: GENERATOR },
    attribution: attributionLines(profiles),
    features: profiles.map((profile) => ({
      type: 'Feature',
      id: profile.id,
      geometry: { type: 'Point', coordinates: [Number(profile.lon.toFixed(7)), Number(profile.lat.toFixed(7))] },
      properties: {
        label: profile.label, query: profile.query, country: profile.countryCode, timezone: profile.timezone, ...scalar(profile),
        provenance: Object.fromEntries(profile.fields.map((item) => [item.key, { source: item.source, license: item.license, reference_year: item.reference_year, retrieved_at: item.retrieved_at, confidence_class: item.confidence_class }])),
      },
    })),
  }, null, 2)}\n`;
}

const xml = (text: unknown) => String(text ?? '').replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c] as string));

export function buildKml(profiles: LocationProfile[], meta: ResolvedMetadata): string {
  const placemarks = profiles.map((profile) => `    <Placemark id="${xml(profile.id)}">
      <name>${xml(profile.label)}</name>
      <description>${xml(`${profile.query} · ${profile.timezone ?? ''}`)}</description>
      <ExtendedData>
${profile.fields.filter((item) => item.value !== null).map((item) => `        <Data name="${xml(item.key)}"><displayName>${xml(item.label)}</displayName><value>${xml(item.value)}</value></Data>`).join('\n')}
      </ExtendedData>
      <Point><coordinates>${profile.lon.toFixed(7)},${profile.lat.toFixed(7)},0</coordinates></Point>
    </Placemark>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:atom="http://www.w3.org/2005/Atom">
  <Document>
    <name>${xml(meta.title)}</name>
    ${meta.author ? `<atom:author><atom:name>${xml(meta.author)}</atom:name></atom:author>` : ''}
    <description>${xml([meta.description, meta.tags.length ? `Tags: ${meta.tags.join(', ')}` : '', `License: ${meta.licenseText}`, meta.notes, `Sources: ${attributionLines(profiles).join(' | ')}`].filter(Boolean).join('\n'))}</description>
${placemarks}
  </Document>
</kml>
`;
}

// ---------------- Import (restore saved locations) ----------------

const CONFIDENCE = new Set(['rooftop', 'street', 'postal_centroid', 'locality_centroid', 'admin_centroid', 'modeled_grid']);

function isProfile(value: unknown): value is LocationProfile {
  const p = value as Partial<LocationProfile> | null;
  return !!p && p.schema === 'geo-intel-profile/1' && typeof p.id === 'string' && typeof p.label === 'string'
    && Number.isFinite(p.lat) && Number.isFinite(p.lon) && Math.abs(p.lat as number) <= 90 && Math.abs(p.lon as number) <= 180
    && Array.isArray(p.fields) && p.fields.every((item) => item && typeof item.key === 'string' && typeof item.source === 'string' && CONFIDENCE.has(item.confidence_class));
}

/** Accepts this tool's JSON export, a bare profile, or an array of profiles. Invalid entries are counted, not imported. */
export function parseProfileImport(text: string): { profiles: LocationProfile[]; rejected: number; metadata: Partial<ExportMetadata> | null } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new Error('This file is not valid JSON.'); }
  const root = data as { schema?: string; profiles?: unknown[]; metadata?: Partial<ExportMetadata> };
  const list = Array.isArray(data) ? data : root?.schema === 'geo-intel-export/1' && Array.isArray(root.profiles) ? root.profiles : [data];
  const profiles = list.filter(isProfile).map((p) => ({ ...p, adminChain: Array.isArray(p.adminChain) ? p.adminChain : [], warnings: Array.isArray(p.warnings) ? p.warnings : [], sourcesUsed: Array.isArray(p.sourcesUsed) ? p.sourcesUsed : [] }));
  if (!profiles.length) throw new Error('No Geo Intelligence Hub locations were found in this file.');
  const metadata = root?.schema === 'geo-intel-export/1' && root.metadata ? { ...root.metadata, tags: Array.isArray(root.metadata.tags) ? root.metadata.tags : [] } : null;
  return { profiles, rejected: list.length - profiles.length, metadata };
}

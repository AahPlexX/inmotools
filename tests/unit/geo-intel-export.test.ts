import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';
import { field, provenance } from '../../src/tools/geo-intel/core/sources';
import { EMPTY_METADATA, type LocationProfile } from '../../src/tools/geo-intel/core/types';
import { buildCsv, buildHolidayCsv, buildIcs, buildJson, fileSlug, foldLine, icsEscape, resolveMetadata } from '../../src/tools/geo-intel/export/formats';
import { buildPdf, buildZip, bundleReadme, cardModel, crc32, injectPngText, pdfSafe, pngTextEntries, readPngText } from '../../src/tools/geo-intel/export/binary';
import { choropleth, classify, countryPaths, emptyScene, exportSvg, quantileBreaks } from '../../src/tools/geo-intel/render/scene';
import { loadCountryShapes } from '../../src/tools/geo-intel/offline/static-data';

const at = '2026-09-29T12:00:00.000Z';
const meta = { source: 'world-bank' as const, geography: 'country' as const, confidence: 'admin_centroid' as const, retrievedAt: at };

const profile: LocationProfile = {
  id: '52.51739,13.39513', schema: 'geo-intel-profile/1', createdAt: at, updatedAt: at, query: 'Berlin', queryKind: 'place', label: 'Berlin, Germany',
  lat: 52.5173885, lon: 13.3951309, countryCode: 'DE', timezone: 'Europe/Berlin',
  fields: [
    field('location.lat', 'Latitude', 'location', 52.517389, { ...meta, source: 'photon', geography: 'locality', confidence: 'locality_centroid' }),
    field('country.name', 'Country', 'country', '🇩🇪 Germany', { ...meta, source: 'natural-earth' }),
    field('wb.SP.POP.TOTL', 'Population (country)', 'population', 83491249, { ...meta, year: 2025, unit: 'people' }),
    field('address.name', 'Place', 'address', '=HYPERLINK("x")', { ...meta, source: 'photon' }),
    field('tz.offset', 'Current UTC offset', 'timezone', 'UTC+02:00', { ...meta, source: 'computed' }),
  ],
  adminChain: [{ level: 0, name: 'Germany', code: 'DE', source: 'geonames' }],
  holidays: {
    year: 2026, countryCode: 'DE', provenance: provenance({ source: 'nager-date', geography: 'country', confidence: 'admin_centroid', retrievedAt: at }),
    items: [
      { date: '2026-10-03', localName: 'Tag der Deutschen Einheit', name: 'German Unity Day', global: true, counties: null, types: ['Public'] },
      { date: '2026-10-31', localName: 'Reformationstag', name: 'Reformation Day', global: false, counties: ['DE-BB', 'DE-MV'], types: ['Public'] },
    ],
  },
  solar: null, bbox: null, warnings: ['Example caveat'], sourcesUsed: ['photon', 'world-bank', 'nager-date', 'natural-earth', 'computed'],
};

const metadata = resolveMetadata({ ...EMPTY_METADATA, title: 'Berlin brief', author: 'Ada', tags: ['trip', 'eu'], description: 'Test export', notes: 'n' }, [profile], new Date(at));

describe('metadata', () => {
  it('fills defaults and honours overrides', () => {
    expect(resolveMetadata(EMPTY_METADATA, [profile], new Date(at))).toMatchObject({ title: 'Berlin, Germany', date: '2026-09-29', licenseText: 'CC-BY-4.0' });
    expect(resolveMetadata({ ...EMPTY_METADATA, dateOverride: '2025-01-02', license: 'custom', customLicense: '' }, [profile]).licenseText).toBe('All rights reserved');
    expect(resolveMetadata({ ...EMPTY_METADATA, dateOverride: '2025-01-02' }, [profile]).date).toBe('2025-01-02');
    expect(fileSlug('Zürich — Café #1')).toBe('zurich-cafe-1');
  });
});

describe('JSON and CSV', () => {
  it('exports JSON with every field’s provenance and a source list', () => {
    const parsed = JSON.parse(buildJson([profile], metadata));
    expect(parsed.schema).toBe('geo-intel-export/1');
    expect(parsed.metadata).toMatchObject({ title: 'Berlin brief', author: 'Ada', tags: ['trip', 'eu'], license: 'CC-BY-4.0' });
    expect(parsed.profiles[0].fields[2]).toMatchObject({ source: 'world-bank', reference_year: 2025, license: 'CC BY 4.0', confidence_class: 'admin_centroid', retrieved_at: at });
    expect(parsed.sources.map((s: { id: string }) => s.id)).toEqual(expect.arrayContaining(['photon', 'world-bank', 'nager-date']));
    expect(parsed.sources.map((s: { id: string }) => s.id)).not.toContain('computed');
  });

  it('exports selected groups as one flat row, with optional provenance columns and formula neutralising', () => {
    const csv = buildCsv([profile], metadata, { groups: ['population', 'address'], provenance: true });
    const [header, row] = Papa.parse<string[]>(csv.trim()).data;
    expect(header.slice(0, 4)).toEqual(['profile_id', 'label', 'latitude', 'longitude']);
    expect(header).toContain('wb.SP.POP.TOTL__reference_year');
    expect(header).not.toContain('country.name');
    expect(row[header.indexOf('wb.SP.POP.TOTL')]).toBe('83491249');
    expect(row[header.indexOf('address.name')]).toBe(`'=HYPERLINK("x")`);
    expect(row[header.indexOf('meta_tags')]).toBe('trip; eu');
  });
});

describe('iCalendar', () => {
  it('writes an RFC 5545 calendar with all-day events, escaping and folding', () => {
    const ics = buildIcs(profile, metadata, '', new Date(at));
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART;VALUE=DATE:20261003\r\nDTEND;VALUE=DATE:20261004');
    expect(ics).toContain('DTSTAMP:20260929T120000Z');
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(2);
    for (const line of ics.split('\r\n')) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    expect(icsEscape('a,b;c\\d\ne')).toBe('a\\,b\\;c\\\\d\\ne');
    expect(foldLine('x'.repeat(80)).split('\r\n ')).toHaveLength(2);
    expect(foldLine('é'.repeat(50)).split('\r\n ').every((part) => new TextEncoder().encode(part).length <= 75)).toBe(true);
    expect(buildHolidayCsv(profile)).toContain('2026-10-31,Reformation Day,Reformationstag,no,DE-BB; DE-MV,Public');
  });
});

describe('SVG scene and choropleth', () => {
  it('renders a standalone SVG with Dublin Core metadata, legend and attribution', async () => {
    const countries = countryPaths(await loadCountryShapes());
    const values = new Map([['DEU', { value: 238, year: 2023 }], ['FRA', { value: 123, year: 2023 }], ['USA', { value: 37, year: 2022 }]]);
    const { fills, legend } = choropleth(values, 'Population density', 'people/km²');
    const scene = { ...emptyScene(countries), fills, legend, highlight: 'DEU', pins: [{ id: 'p', lat: profile.lat, lon: profile.lon, label: 'Berlin & co', active: true }] };
    const svg = exportSvg(scene, { metadata, title: metadata.title, date: metadata.date, attribution: ['Made with Natural Earth'] });
    expect(svg).toMatch(/^<\?xml/);
    expect(svg).toContain('dc:creator="Ada"');
    expect(svg).toContain('dc:subject="trip, eu"');
    expect(svg).toContain('Berlin &amp; co');
    expect(svg).toContain('data-a3="DEU"');
    expect(svg).toContain('Population density (people/km²)');
    expect(svg.match(/<path class="gi-country/g)?.length).toBe(242);
    expect(legend.note).toMatch(/2022–2023/);
  });

  it('computes quantile classes', () => {
    const breaks = quantileBreaks([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14], 7);
    expect(breaks).toHaveLength(6);
    expect(classify(0, breaks)).toBe(0);
    expect(classify(100, breaks)).toBe(6);
  });
});

describe('binary exports', () => {
  it('computes CRC-32 and round-trips PNG tEXt metadata', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    const png = new Uint8Array(readFileSync(new URL('../fixtures/geo-intel/responses/terrarium-12-2137-1448.png', import.meta.url)));
    const tagged = injectPngText(png, pngTextEntries(metadata, { Source: 'Terrain Tiles' }));
    const text = readPngText(tagged);
    expect(text).toMatchObject({ Title: 'Berlin brief', Author: 'Ada', Keywords: 'trip, eu', Copyright: 'CC-BY-4.0', Source: 'Terrain Tiles' });
    expect(tagged.length).toBeGreaterThan(png.length);
  });

  it('builds a PDF with document properties', async () => {
    const blob = await buildPdf(profile, metadata, (iso) => iso ?? '-');
    const text = new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toContain('/Title (Berlin brief)');
    expect(text).toContain('/Author (Ada)');
    expect(pdfSafe('🇩🇪 Germany – Zürich ≈ 東京')).toBe('Germany - Zürich ~');
  });

  it('bundles files into a ZIP with a README listing attribution', async () => {
    const readme = bundleReadme([profile], metadata, ['a.json']);
    expect(readme).toContain('Nager.Date');
    const blob = await buildZip([{ name: 'a.json', data: '{}' }], readme);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(['README.txt', 'a.json']);
  });

  it('builds the social card model', () => {
    const model = cardModel(profile, metadata, '14:00');
    expect(model).toMatchObject({ title: 'Berlin brief', flag: '🇩🇪', tags: ['trip', 'eu'] });
    expect(model.subtitle).toBe('Berlin, Germany · Germany');
    expect(model.stats.find(([label]) => label === 'Country population')?.[1]).toBe('83.5M');
  });
});

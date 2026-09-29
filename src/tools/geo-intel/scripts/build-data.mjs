#!/usr/bin/env node
// Builds the offline data layer for Geo Intelligence Hub.
//
// Usage (from the repository root):
//   node --max-old-space-size=8192 src/tools/geo-intel/scripts/build-data.mjs <cache-dir>
//
// Source files are downloaded into <cache-dir> when missing, then reduced into
// size-budgeted JSON under src/tools/geo-intel/data/. The generated files are
// committed so `pnpm build` never needs network access. Re-running with the same
// cached inputs produces byte-identical data files; only manifest.json's
// retrievedAt dates change.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync, strFromU8 } from 'fflate';
import { topology } from 'topojson-server';
import { presimplify, simplify } from 'topojson-simplify';
import { quantize, feature } from 'topojson-client';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, '../data');
const CACHE = resolve(process.argv[2] ?? join(process.cwd(), '.gi-src'));

const NE_VERSION = 'v5.1.2';
const TZ_RELEASE = '2026d';
const NE_BASE = `https://raw.githubusercontent.com/nvkelso/natural-earth-vector/${NE_VERSION}/geojson`;

const SOURCES = {
  countriesGeo: { file: 'ne_50m_admin_0_countries.geojson', url: `${NE_BASE}/ne_50m_admin_0_countries.geojson` },
  places: { file: 'ne_10m_populated_places_simple.geojson', url: `${NE_BASE}/ne_10m_populated_places_simple.geojson` },
  countryInfo: { file: 'countryInfo.txt', url: 'https://download.geonames.org/export/dump/countryInfo.txt' },
  admin1: { file: 'admin1CodesASCII.txt', url: 'https://download.geonames.org/export/dump/admin1CodesASCII.txt' },
  timezones: { file: 'tz.zip', url: `https://github.com/evansiroky/timezone-boundary-builder/releases/download/${TZ_RELEASE}/timezones-with-oceans.geojson.zip` },
  driving: { file: 'driving.json', url: 'https://query.wikidata.org/sparql' },
};

const DRIVING_QUERY = 'SELECT ?iso (GROUP_CONCAT(DISTINCT ?sideLabel;separator="|") AS ?sides) WHERE { ?c wdt:P297 ?iso . ?c p:P1622 ?st . ?st ps:P1622 ?side . FILTER NOT EXISTS { ?st pq:P582 ?end } ?side rdfs:label ?sideLabel FILTER(LANG(?sideLabel)="en") } GROUP BY ?iso ORDER BY ?iso';

async function ensure(key) {
  const { file, url } = SOURCES[key];
  const path = join(CACHE, file);
  if (existsSync(path)) return path;
  mkdirSync(CACHE, { recursive: true });
  const headers = { 'User-Agent': 'inmotools-geo-intel-databuild/1.0 (https://github.com/AahPlexX/inmotools)' };
  const target = key === 'driving'
    ? `${url}?${new URLSearchParams({ query: DRIVING_QUERY })}`
    : url;
  if (key === 'driving') headers.Accept = 'application/sparql-results+json';
  const response = await fetch(target, { headers });
  if (!response.ok) throw new Error(`Download failed ${response.status} ${target}`);
  writeFileSync(path, new Uint8Array(await response.arrayBuffer()));
  return path;
}

const round = (value, digits) => Number(value.toFixed(digits));
const bytes = (text) => Buffer.byteLength(text, 'utf8');
const stable = (value) => JSON.stringify(value);

function simplifyTopology(topo, minWeight, quantization) {
  const pre = presimplify(topo);
  const simple = simplify(pre, minWeight);
  simple.arcs = simple.arcs.map((arc) => arc.map((point) => [point[0], point[1]]));
  return quantize(simple, quantization);
}

// Ray casting on [lon, lat] rings; polygons are arrays of rings (outer + holes).
function inRing(lon, lat, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function inGeometry(lon, lat, geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
  return polygons.some((rings) => inRing(lon, lat, rings[0]) && !rings.slice(1).some((hole) => inRing(lon, lat, hole)));
}
function bboxOf(geometry) {
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  for (const rings of polygons) for (const [x, y] of rings[0]) {
    if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}
function locator(features, key) {
  const indexed = features.map((item) => ({ id: item.properties[key], geometry: item.geometry, bbox: bboxOf(item.geometry) }));
  return (lon, lat) => {
    for (const item of indexed) {
      const [a, b, c, d] = item.bbox;
      if (lon < a || lon > c || lat < b || lat > d) continue;
      if (inGeometry(lon, lat, item.geometry)) return item.id;
    }
    return null;
  };
}
// Deterministic PRNG (mulberry32) so accuracy figures are reproducible.
function prng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function parseTsv(text) {
  return text.split(/\r?\n/).filter((line) => line && !line.startsWith('#')).map((line) => line.split('\t'));
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const retrievedAt = new Date().toISOString().slice(0, 10);
  const manifest = { generatedBy: 'src/tools/geo-intel/scripts/build-data.mjs', datasets: {} };

  // ---- Countries geometry (Natural Earth 1:50m) ----
  const ne = JSON.parse(readFileSync(await ensure('countriesGeo'), 'utf8'));
  const neByA2 = new Map();
  const countryFeatures = ne.features.map((item) => {
    const p = item.properties;
    const a2 = p.ISO_A2_EH && p.ISO_A2_EH !== '-99' ? p.ISO_A2_EH : null;
    const a3 = p.ISO_A3_EH && p.ISO_A3_EH !== '-99' ? p.ISO_A3_EH : p.ADM0_A3;
    if (a2 && !neByA2.has(a2)) neByA2.set(a2, p);
    return { type: 'Feature', id: a3, properties: { a2, a3, name: p.NAME }, geometry: item.geometry };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const countriesTopo = simplifyTopology(topology({ countries: { type: 'FeatureCollection', features: countryFeatures } }, 1e6), 2e-3, 1e5);
  const countriesText = stable(countriesTopo);
  writeFileSync(join(OUT, 'countries.topo.json'), countriesText);
  manifest.datasets.countries = {
    source: 'Natural Earth 1:50m Admin 0 – Countries', version: NE_VERSION, url: SOURCES.countriesGeo.url,
    license: 'Public domain', attribution: 'Made with Natural Earth', retrievedAt, bytes: bytes(countriesText), features: countryFeatures.length,
  };

  // ---- Country table (GeoNames countryInfo + Natural Earth + Wikidata) ----
  const driving = new Map(JSON.parse(readFileSync(await ensure('driving'), 'utf8')).results.bindings
    .map((row) => [row.iso.value, row.sides.value])
    .filter(([, sides]) => sides === 'left' || sides === 'right'));
  const continentNames = { AF: 'Africa', AS: 'Asia', EU: 'Europe', NA: 'North America', OC: 'Oceania', SA: 'South America', AN: 'Antarctica' };
  const countries = parseTsv(readFileSync(await ensure('countryInfo'), 'utf8')).map((c) => {
    const [a2, a3, n3, fips, name, capital, area, population, continent, tld, currencyCode, currencyName, phone, postalFormat, postalRegex, languages, geonameId, neighbours] = c;
    const nep = neByA2.get(a2);
    const numeric = n3 && Number(n3) > 0 ? n3.padStart(3, '0') : null;
    return {
      a2, a3, n3: numeric, fips: fips || null, name,
      // AN (Netherlands Antilles) and CS (Serbia and Montenegro) remain in the
      // GeoNames dump but were withdrawn from ISO 3166-1 (now ISO 3166-3).
      withdrawn: a2 === 'AN' || a2 === 'CS',
      official: nep?.FORMAL_EN || null,
      capital: capital || null,
      areaKm2: area ? Number(area) : null,
      geonamesPopulation: population ? Number(population) : null,
      continent, continentName: continentNames[continent] ?? continent,
      region: nep?.REGION_UN ?? null, subregion: nep?.SUBREGION ?? null,
      tld: tld || null, currencyCode: currencyCode || null, currencyName: currencyName || null,
      callingCode: phone ? phone.split(/\s*and\s*|,\s*/).map((code) => `+${code.replace(/^\+/, '')}`) : [],
      postalFormat: postalFormat || null, postalRegex: postalRegex || null,
      languages: languages ? languages.split(',').filter(Boolean) : [],
      geonameId: Number(geonameId), neighbours: neighbours ? neighbours.split(',').filter(Boolean) : [],
      drivingSide: driving.get(a2) ?? null,
      label: nep ? [round(nep.LABEL_X, 4), round(nep.LABEL_Y, 4)] : null,
      wikidata: nep?.WIKIDATAID ?? null,
    };
  }).sort((a, b) => a.a2.localeCompare(b.a2));
  const countriesTableText = stable(countries);
  writeFileSync(join(OUT, 'country-table.json'), countriesTableText);
  manifest.datasets.countryTable = {
    source: 'GeoNames countryInfo.txt + Natural Earth attributes + Wikidata P1622 (driving side)',
    url: SOURCES.countryInfo.url, license: 'CC BY 4.0 (GeoNames); public domain (Natural Earth); CC0 (Wikidata)',
    attribution: 'GeoNames (geonames.org), Natural Earth, Wikidata', retrievedAt, bytes: bytes(countriesTableText), records: countries.length,
    drivingSideRecords: countries.filter((c) => c.drivingSide).length,
  };

  // ---- Admin-1 names (GeoNames) ----
  const admin1 = {};
  for (const [code, name, , geonameId] of parseTsv(readFileSync(await ensure('admin1'), 'utf8'))) admin1[code] = [name, Number(geonameId)];
  const admin1Sorted = Object.fromEntries(Object.entries(admin1).sort(([a], [b]) => a.localeCompare(b)));
  const admin1Text = stable(admin1Sorted);
  writeFileSync(join(OUT, 'admin1.json'), admin1Text);
  manifest.datasets.admin1 = {
    source: 'GeoNames admin1CodesASCII.txt', url: SOURCES.admin1.url, license: 'CC BY 4.0', attribution: 'GeoNames (geonames.org)',
    retrievedAt, bytes: bytes(admin1Text), records: Object.keys(admin1Sorted).length,
  };

  // ---- Populated places (Natural Earth 1:10m simple) ----
  const placesGeo = JSON.parse(readFileSync(await ensure('places'), 'utf8'));
  const featureClass = { 'Admin-0 capital': 'C', 'Admin-0 capital alt': 'C', 'Admin-0 region capital': 'R', 'Admin-1 capital': 'A', 'Admin-1 region capital': 'A', 'Populated place': 'P', 'Scientific station': 'S', 'Historic place': 'H', 'Meteorological Station': 'S' };
  const places = placesGeo.features.map(({ properties: p }) => [
    p.name, p.iso_a2 && p.iso_a2 !== '-99' ? p.iso_a2 : null, p.adm1name || null,
    round(p.latitude, 4), round(p.longitude, 4), p.pop_max ?? 0, featureClass[p.featurecla] ?? 'P',
  ]).sort((a, b) => b[5] - a[5] || a[0].localeCompare(b[0]));
  const placesText = stable({ columns: ['name', 'a2', 'adm1', 'lat', 'lon', 'popMax', 'class'], rows: places });
  writeFileSync(join(OUT, 'places.json'), placesText);
  manifest.datasets.places = {
    source: 'Natural Earth 1:10m Populated Places (simple)', version: NE_VERSION, url: SOURCES.places.url,
    license: 'Public domain', attribution: 'Made with Natural Earth', retrievedAt, bytes: bytes(placesText), records: places.length,
    note: 'popMax is Natural Earth pop_max (urban agglomeration estimate), not an administrative census count.',
  };

  // ---- IANA timezone polygons (timezone-boundary-builder, with oceans) ----
  const zipped = unzipSync(new Uint8Array(readFileSync(await ensure('timezones'))));
  const inner = Object.keys(zipped).find((name) => name.endsWith('.json'));
  const tzFull = JSON.parse(strFromU8(zipped[inner]));
  tzFull.features.sort((a, b) => a.properties.tzid.localeCompare(b.properties.tzid));
  const tzFeatures = tzFull.features.map((item) => ({ type: 'Feature', id: item.properties.tzid, properties: { tz: item.properties.tzid }, geometry: item.geometry }));
  const tzTopo = simplifyTopology(topology({ tz: { type: 'FeatureCollection', features: tzFeatures } }), 2e-4, 1e5);
  const tzText = stable(tzTopo);
  writeFileSync(join(OUT, 'timezones.topo.json'), tzText);

  // Accuracy: compare simplified vs full-resolution lookup on seeded random points.
  const fullLookup = locator(tzFeatures.map((item) => ({ properties: { tz: item.properties.tz }, geometry: item.geometry })), 'tz');
  const simpleLookup = locator(feature(tzTopo, tzTopo.objects.tz).features, 'tz');
  const random = prng(20260929);
  let agree = 0; let samples = 0; let landAgree = 0; let landSamples = 0;
  for (let i = 0; i < 4000; i += 1) {
    const lon = random() * 360 - 180;
    const lat = Math.asin(random() * 2 - 1) * (180 / Math.PI);
    const expected = fullLookup(lon, lat);
    if (!expected) continue;
    const actual = simpleLookup(lon, lat);
    samples += 1; if (actual === expected) agree += 1;
    if (!expected.startsWith('Etc/')) { landSamples += 1; if (actual === expected) landAgree += 1; }
  }
  manifest.datasets.timezones = {
    source: 'timezone-boundary-builder timezones-with-oceans', version: TZ_RELEASE, url: SOURCES.timezones.url,
    license: 'ODbL 1.0', attribution: 'Timezone boundaries © OpenStreetMap contributors via timezone-boundary-builder (ODbL)',
    retrievedAt, bytes: bytes(tzText), zones: tzFeatures.length,
    accuracy: { method: 'area-uniform seeded random points, simplified vs full resolution', samples, agreement: round(agree / samples, 4), landSamples, landAgreement: round(landAgree / landSamples, 4) },
  };

  const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
  writeFileSync(join(OUT, 'manifest.json'), manifestText);
  process.stdout.write(manifestText);
}

main().catch((error) => { console.error(error); process.exit(1); });

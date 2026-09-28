// Geospatial & coordinate transcoding (F31-F33).
// Pure GeoJSON <-> KML/KMZ/GPX/WKT/CSV/SVG transforms built on
// fast-xml-parser so they run identically in unit tests and the browser.

import { XMLParser } from 'fast-xml-parser';

export interface GeoFeature {
  type: 'Feature';
  geometry: GeoGeometry | null;
  properties: Record<string, unknown>;
}

export interface GeoFeatureCollection {
  type: 'FeatureCollection';
  features: GeoFeature[];
}

export type GeoGeometry =
  | { type: 'Point'; coordinates: number[] }
  | { type: 'LineString'; coordinates: number[][] }
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPoint'; coordinates: number[][] }
  | { type: 'MultiLineString'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }
  | { type: 'GeometryCollection'; geometries: GeoGeometry[] };

const PARSER = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_', parseTagValue: true });

const asArray = <T>(value: T | T[] | undefined): T[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

const textOf = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if ('#text' in record) return String(record['#text'] ?? '');
    return '';
  }
  return String(value);
};

// ---------------------------------------------------------------------------
// GeoJSON normalization helpers
// ---------------------------------------------------------------------------

export function normalizeFeatureCollection(input: unknown): GeoFeatureCollection {
  const value = input as { type?: string; features?: unknown[]; geometry?: unknown; coordinates?: unknown; properties?: Record<string, unknown> };
  if (value?.type === 'FeatureCollection' && Array.isArray(value.features)) {
    return {
      type: 'FeatureCollection',
      features: value.features.map((feature) => ({
        type: 'Feature',
        geometry: (feature as { geometry?: GeoGeometry | null }).geometry ?? null,
        properties: ((feature as { properties?: Record<string, unknown> }).properties ?? {}) as Record<string, unknown>,
      })),
    };
  }
  if (value?.type === 'Feature') {
    return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: (value.geometry as GeoGeometry) ?? null, properties: (value.properties as Record<string, unknown>) ?? {} }] };
  }
  if (value?.type && 'coordinates' in value) {
    return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: value as unknown as GeoGeometry, properties: {} }] };
  }
  if (value?.type === 'GeometryCollection') {
    return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: value as unknown as GeoGeometry, properties: {} }] };
  }
  throw new Error('Input is not a GeoJSON Feature, FeatureCollection, or geometry.');
}

// ---------------------------------------------------------------------------
// GeoJSON -> KML / KMZ (F31)
// ---------------------------------------------------------------------------

const coordinatesFor = (geometry: GeoGeometry): string[] => {
  const ring = (positions: number[][]) => positions.map((position) => position.join(',')).join(' ');
  switch (geometry.type) {
    case 'Point':
      return [geometry.coordinates.join(',')];
    case 'LineString':
    case 'MultiPoint':
      return [ring(geometry.coordinates)];
    case 'Polygon':
    case 'MultiLineString':
      return geometry.coordinates.map(ring);
    case 'MultiPolygon':
      return geometry.coordinates.flatMap((polygon) => polygon.map(ring));
    case 'GeometryCollection':
      return geometry.geometries.flatMap(coordinatesFor);
    default:
      return [];
  }
};

function geometryKml(geometry: GeoGeometry): string {
  switch (geometry.type) {
    case 'Point':
      return `<Point><coordinates>${geometry.coordinates.join(',')}</coordinates></Point>`;
    case 'LineString':
      return `<LineString><coordinates>${coordinatesFor(geometry)[0]}</coordinates></LineString>`;
    case 'Polygon': {
      const [outer, ...inner] = geometry.coordinates;
      const outerRing = `<outerBoundaryIs><LinearRing><coordinates>${outer.map((position) => position.join(',')).join(' ')}</coordinates></LinearRing></outerBoundaryIs>`;
      const innerRings = inner.map((ring) => `<innerBoundaryIs><LinearRing><coordinates>${ring.map((position) => position.join(',')).join(' ')}</coordinates></LinearRing></innerBoundaryIs>`).join('');
      return `<Polygon>${outerRing}${innerRings}</Polygon>`;
    }
    case 'MultiPoint':
    case 'MultiLineString':
    case 'MultiPolygon':
      return `<MultiGeometry>${geometry.coordinates.flatMap((part) => {
        if (geometry.type === 'MultiPoint') return [`<Point><coordinates>${(part as number[]).join(',')}</coordinates></Point>`];
        if (geometry.type === 'MultiLineString') return [`<LineString><coordinates>${(part as number[][]).map((position) => position.join(',')).join(' ')}</coordinates></LineString>`];
        return [geometryKml({ type: 'Polygon', coordinates: part as number[][][] })];
      }).join('')}</MultiGeometry>`;
    case 'GeometryCollection':
      return `<MultiGeometry>${geometry.geometries.map(geometryKml).join('')}</MultiGeometry>`;
    default:
      return '';
  }
}

const xmlEscape = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function geojsonToKml(collection: GeoFeatureCollection, documentName = 'Converted features'): string {
  const placemarks = collection.features.map((feature) => {
    if (!feature.geometry) return '';
    const name = feature.properties.name ?? feature.properties.title ?? '';
    const description = feature.properties.description ?? feature.properties.desc ?? '';
    const nameTag = name ? `<name>${xmlEscape(String(name))}</name>` : '';
    const descriptionTag = description ? `<description>${xmlEscape(String(description))}</description>` : '';
    return `<Placemark>${nameTag}${descriptionTag}${geometryKml(feature.geometry)}</Placemark>`;
  }).filter((placemark) => placemark.length > 0);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    `<Document><name>${xmlEscape(documentName)}</name>`,
    ...placemarks,
    '</Document>',
    '</kml>',
    '',
  ].join('\n');
}

export async function geojsonToKmz(collection: GeoFeatureCollection, documentName = 'Converted features'): Promise<Uint8Array> {
  const { zipSync } = await import('fflate');
  const kml = geojsonToKml(collection, documentName);
  return new Uint8Array(zipSync({ 'doc.kml': new TextEncoder().encode(kml) }, { level: 6 }));
}

// ---------------------------------------------------------------------------
// KML / KMZ -> GeoJSON (F31)
// ---------------------------------------------------------------------------

function parseCoordinates(raw: string): number[][] {
  return raw.trim().split(/\s+/).filter(Boolean).map((tuple) => {
    const parts = tuple.split(',').map(Number);
    while (parts.length < 2) parts.push(0);
    return parts;
  });
}

function kmlGeometryFromNode(node: unknown): GeoGeometry | null {
  if (node === null || typeof node !== 'object') return null;
  const record = node as Record<string, unknown>;
  if ('Point' in record) {
    const coordinates = parseCoordinates(textOf((record.Point as Record<string, unknown>)?.coordinates));
    return coordinates.length > 0 ? { type: 'Point', coordinates: coordinates[0] } : null;
  }
  if ('LineString' in record) {
    return { type: 'LineString', coordinates: parseCoordinates(textOf((record.LineString as Record<string, unknown>)?.coordinates)) };
  }
  if ('Polygon' in record) {
    const polygon = record.Polygon as Record<string, unknown>;
    const outer = parseCoordinates(textOf((((polygon.outerBoundaryIs as Record<string, unknown>)?.LinearRing) as Record<string, unknown>)?.coordinates));
    const inner = asArray(polygon.innerBoundaryIs as unknown).map((boundary) =>
      parseCoordinates(textOf((((boundary as Record<string, unknown>)?.LinearRing) as Record<string, unknown>)?.coordinates)));
    return { type: 'Polygon', coordinates: [outer, ...inner] };
  }
  if ('MultiGeometry' in record) {
    const multi = record.MultiGeometry as Record<string, unknown>;
    const geometries: GeoGeometry[] = [];
    for (const key of ['Point', 'LineString', 'Polygon'] as const) {
      for (const child of asArray(multi[key] as unknown)) {
        const geometry = kmlGeometryFromNode({ [key]: child });
        if (geometry) geometries.push(geometry);
      }
    }
    if (geometries.length === 0) return null;
    if (geometries.every((geometry) => geometry.type === 'Point')) {
      return { type: 'MultiPoint', coordinates: geometries.map((geometry) => (geometry as { coordinates: number[] }).coordinates) };
    }
    if (geometries.every((geometry) => geometry.type === 'LineString')) {
      return { type: 'MultiLineString', coordinates: geometries.map((geometry) => (geometry as { coordinates: number[][] }).coordinates) };
    }
    if (geometries.every((geometry) => geometry.type === 'Polygon')) {
      return { type: 'MultiPolygon', coordinates: geometries.map((geometry) => (geometry as { coordinates: number[][][] }).coordinates) };
    }
    return { type: 'GeometryCollection', geometries };
  }
  return null;
}

export function kmlToGeojson(kmlText: string): GeoFeatureCollection {
  const parsed = PARSER.parse(kmlText) as Record<string, unknown>;
  const kml = parsed.kml as Record<string, unknown> | undefined;
  if (!kml) throw new Error('No <kml> root element found.');
  const document = kml.Document as Record<string, unknown> | undefined;
  const scope = document ?? kml;
  const features: GeoFeature[] = [];
  for (const placemark of asArray(scope.Placemark as unknown)) {
    const mark = placemark as Record<string, unknown>;
    const geometry = kmlGeometryFromNode(mark);
    const properties: Record<string, unknown> = {};
    if (mark.name) properties.name = textOf(mark.name);
    if (mark.description) properties.description = textOf(mark.description);
    if (mark.ExtendedData) properties.extendedData = mark.ExtendedData;
    features.push({ type: 'Feature', geometry, properties });
  }
  if (features.length === 0) throw new Error('No placemarks found in the KML document.');
  return { type: 'FeatureCollection', features };
}

export async function kmzToKml(bytes: Uint8Array): Promise<string> {
  const { unzipSync } = await import('fflate');
  const entries = unzipSync(bytes);
  const kmlName = Object.keys(entries).find((name) => name === 'doc.kml') ?? Object.keys(entries).find((name) => name.toLowerCase().endsWith('.kml'));
  if (!kmlName) throw new Error('The KMZ archive contains no KML document.');
  return new TextDecoder().decode(entries[kmlName]);
}

// ---------------------------------------------------------------------------
// GPX (F32)
// ---------------------------------------------------------------------------

export function gpxToGeojson(gpxText: string): GeoFeatureCollection {
  const parsed = PARSER.parse(gpxText) as Record<string, unknown>;
  const gpx = parsed.gpx as Record<string, unknown> | undefined;
  if (!gpx) throw new Error('No <gpx> root element found.');
  const features: GeoFeature[] = [];

  for (const waypoint of asArray(gpx.wpt as unknown)) {
    const wpt = waypoint as Record<string, unknown>;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(wpt['@_lon']), Number(wpt['@_lat']), wpt.ele !== undefined ? Number(wpt.ele) : 0].slice(0, wpt.ele !== undefined ? 3 : 2) },
      properties: { kind: 'waypoint', name: wpt.name ? textOf(wpt.name) : undefined, description: wpt.desc ? textOf(wpt.desc) : undefined },
    });
  }

  for (const track of asArray(gpx.trk as unknown)) {
    const trk = track as Record<string, unknown>;
    const segments = asArray(trk.trkseg as unknown);
    const lines: number[][][] = [];
    for (const segment of segments) {
      const points = asArray((segment as Record<string, unknown>).trkpt as unknown).map((point) => {
        const pt = point as Record<string, unknown>;
        const coords = [Number(pt['@_lon']), Number(pt['@_lat'])];
        if (pt.ele !== undefined) coords.push(Number(pt.ele));
        return coords;
      });
      if (points.length > 0) lines.push(points);
    }
    if (lines.length === 0) continue;
    const geometry: GeoGeometry = lines.length === 1
      ? { type: 'LineString', coordinates: lines[0] }
      : { type: 'MultiLineString', coordinates: lines };
    features.push({
      type: 'Feature',
      geometry,
      properties: { kind: 'track', name: trk.name ? textOf(trk.name) : undefined, description: trk.desc ? textOf(trk.desc) : undefined },
    });
  }

  for (const route of asArray(gpx.rte as unknown)) {
    const rte = route as Record<string, unknown>;
    const points = asArray(rte.rtept as unknown).map((point) => {
      const pt = point as Record<string, unknown>;
      return [Number(pt['@_lon']), Number(pt['@_lat'])];
    });
    if (points.length === 0) continue;
    features.push({ type: 'Feature', geometry: { type: 'LineString', coordinates: points }, properties: { kind: 'route', name: rte.name ? textOf(rte.name) : undefined } });
  }

  if (features.length === 0) throw new Error('No waypoints, tracks, or routes found in the GPX file.');
  return { type: 'FeatureCollection', features };
}

export function geojsonToGpx(collection: GeoFeatureCollection): string {
  const points: string[] = [];
  const tracks: string[] = [];
  for (const feature of collection.features) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    const name = feature.properties.name ? `<name>${xmlEscape(String(feature.properties.name))}</name>` : '';
    if (geometry.type === 'Point') {
      const [lon, lat, ele] = geometry.coordinates;
      points.push(`<wpt lat="${lat}" lon="${lon}">${ele !== undefined ? `<ele>${ele}</ele>` : ''}${name}</wpt>`);
    } else if (geometry.type === 'LineString') {
      tracks.push(`<trk>${name}<trkseg>${geometry.coordinates.map(([lon, lat, ele]) => `<trkpt lat="${lat}" lon="${lon}">${ele !== undefined ? `<ele>${ele}</ele>` : ''}</trkpt>`).join('')}</trkseg></trk>`);
    } else if (geometry.type === 'MultiLineString') {
      tracks.push(`<trk>${name}${geometry.coordinates.map((line) => `<trkseg>${line.map(([lon, lat, ele]) => `<trkpt lat="${lat}" lon="${lon}">${ele !== undefined ? `<ele>${ele}</ele>` : ''}</trkpt>`).join('')}</trkseg>`).join('')}</trk>`);
    } else if (geometry.type === 'MultiPoint') {
      for (const [lon, lat, ele] of geometry.coordinates) {
        points.push(`<wpt lat="${lat}" lon="${lon}">${ele !== undefined ? `<ele>${ele}</ele>` : ''}</wpt>`);
      }
    }
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="InMo Tools Transcode Workstation" xmlns="http://www.topografix.com/GPX/1/1">',
    ...points,
    ...tracks,
    '</gpx>',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// WKT (F33)
// ---------------------------------------------------------------------------

export function parseWkt(text: string): GeoGeometry {
  let position = 0;
  const source = text.trim();

  const skipWhitespace = () => { while (position < source.length && /\s/.test(source[position])) position += 1; };
  const expect = (char: string) => {
    skipWhitespace();
    if (source[position] !== char) throw new Error(`WKT parse error: expected "${char}" at position ${position}.`);
    position += 1;
  };

  const readNumber = (): number => {
    skipWhitespace();
    const match = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?/.exec(source.slice(position));
    if (!match) throw new Error(`WKT parse error: expected a number at position ${position}.`);
    position += match[0].length;
    return Number(match[0]);
  };

  const readCoordinate = (): number[] => {
    const values = [readNumber()];
    for (;;) {
      skipWhitespace();
      if (position >= source.length || !/[-+\d.]/.test(source[position])) break;
      values.push(readNumber());
    }
    return values;
  };

  const readCoordinateList = (): number[][] => {
    expect('(');
    const coordinates: number[][] = [readCoordinate()];
    skipWhitespace();
    while (source[position] === ',') { position += 1; coordinates.push(readCoordinate()); skipWhitespace(); }
    expect(')');
    return coordinates;
  };

  const readRingList = (): number[][][] => {
    expect('(');
    const rings: number[][][] = [readCoordinateList()];
    skipWhitespace();
    while (source[position] === ',') { position += 1; rings.push(readCoordinateList()); skipWhitespace(); }
    expect(')');
    return rings;
  };

  const readGeometry = (): GeoGeometry => {
    skipWhitespace();
    const match = /^[A-Za-z]+/.exec(source.slice(position));
    if (!match) throw new Error('WKT parse error: expected a geometry type.');
    const type = match[0].toUpperCase();
    position += match[0].length;
    skipWhitespace();
    // Skip optional dimension suffixes: POINT Z (...), LINESTRING M (...) etc.
    const dimension = /^(ZM|Z|M)\s*\(/.exec(source.slice(position));
    if (dimension) position += dimension[1].length;
    skipWhitespace();
    if (source.slice(position, position + 5).toUpperCase() === 'EMPTY') {
      position += 5;
      switch (type) {
        case 'POINT': return { type: 'Point', coordinates: [] };
        case 'LINESTRING': return { type: 'LineString', coordinates: [] };
        case 'POLYGON': return { type: 'Polygon', coordinates: [] };
        default: throw new Error(`Unsupported WKT geometry: ${type}`);
      }
    }
    switch (type) {
      case 'POINT': {
        expect('(');
        const coordinate = readCoordinate();
        expect(')');
        return { type: 'Point', coordinates: coordinate };
      }
      case 'LINESTRING':
        return { type: 'LineString', coordinates: readCoordinateList() };
      case 'POLYGON':
        return { type: 'Polygon', coordinates: readRingList() };
      case 'MULTIPOINT': {
        expect('(');
        const coordinates: number[][] = [];
        do {
          skipWhitespace();
          if (source[position] === '(') coordinates.push(readCoordinateList()[0]);
          else coordinates.push(readCoordinate());
          skipWhitespace();
        } while (source[position] === ',' && (position += 1));
        expect(')');
        return { type: 'MultiPoint', coordinates };
      }
      case 'MULTILINESTRING': {
        expect('(');
        const lines: number[][][] = [readCoordinateList()];
        skipWhitespace();
        while (source[position] === ',') { position += 1; lines.push(readCoordinateList()); skipWhitespace(); }
        expect(')');
        return { type: 'MultiLineString', coordinates: lines };
      }
      case 'MULTIPOLYGON': {
        expect('(');
        const polygons: number[][][][] = [readRingList()];
        skipWhitespace();
        while (source[position] === ',') { position += 1; polygons.push(readRingList()); skipWhitespace(); }
        expect(')');
        return { type: 'MultiPolygon', coordinates: polygons };
      }
      case 'GEOMETRYCOLLECTION': {
        expect('(');
        const geometries: GeoGeometry[] = [readGeometry()];
        skipWhitespace();
        while (source[position] === ',') { position += 1; geometries.push(readGeometry()); skipWhitespace(); }
        expect(')');
        return { type: 'GeometryCollection', geometries };
      }
      default:
        throw new Error(`Unsupported WKT geometry type: ${type}`);
    }
  };

  const geometry = readGeometry();
  skipWhitespace();
  return geometry;
}

export function geoGeometryToWkt(geometry: GeoGeometry): string {
  const coordinate = (value: number[]) => value.join(' ');
  const ring = (value: number[][]) => value.map(coordinate).join(', ');
  switch (geometry.type) {
    case 'Point': return `POINT (${coordinate(geometry.coordinates)})`;
    case 'LineString': return `LINESTRING (${ring(geometry.coordinates)})`;
    case 'Polygon': return `POLYGON (${geometry.coordinates.map((part) => `(${ring(part)})`).join(', ')})`;
    case 'MultiPoint': return `MULTIPOINT (${geometry.coordinates.map(coordinate).join(', ')})`;
    case 'MultiLineString': return `MULTILINESTRING (${geometry.coordinates.map((part) => `(${ring(part)})`).join(', ')})`;
    case 'MultiPolygon': return `MULTIPOLYGON (${geometry.coordinates.map((polygon) => `(${polygon.map((part) => `(${ring(part)})`).join(', ')})`).join(', ')})`;
    case 'GeometryCollection': return `GEOMETRYCOLLECTION (${geometry.geometries.map(geoGeometryToWkt).join(', ')})`;
    default: return '';
  }
}

// ---------------------------------------------------------------------------
// CSV & SVG outputs
// ---------------------------------------------------------------------------

export function geojsonToCsv(collection: GeoFeatureCollection): string {
  const propertyKeys = new Set<string>();
  for (const feature of collection.features) {
    for (const key of Object.keys(feature.properties)) propertyKeys.add(key);
  }
  const keys = [...propertyKeys];
  const header = ['feature_index', 'geometry_type', 'longitude', 'latitude', 'wkt', ...keys];
  const esc = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
  const lines = [header.join(',')];
  collection.features.forEach((feature, index) => {
    const geometry = feature.geometry;
    const type = geometry?.type ?? 'none';
    const isPoint = geometry?.type === 'Point';
    const [lon, lat] = isPoint ? (geometry as { coordinates: number[] }).coordinates : [NaN, NaN];
    const cells = [
      String(index + 1),
      type,
      isPoint ? String(lon) : '',
      isPoint ? String(lat) : '',
      geometry ? esc(geoGeometryToWkt(geometry)) : '',
      ...keys.map((key) => {
        const value = feature.properties[key];
        if (value === null || value === undefined) return '';
        return esc(typeof value === 'object' ? JSON.stringify(value) : String(value));
      }),
    ];
    lines.push(cells.join(','));
  });
  return `${lines.join('\n')}\n`;
}

export function geojsonToSvgMap(collection: GeoFeatureCollection, size = 800): string {
  let minLon = Infinity; let maxLon = -Infinity; let minLat = Infinity; let maxLat = -Infinity;
  const eachCoordinate = (geometry: GeoGeometry | null, visit: (lon: number, lat: number) => void) => {
    if (!geometry) return;
    switch (geometry.type) {
      case 'Point': visit(geometry.coordinates[0], geometry.coordinates[1]); break;
      case 'LineString':
      case 'MultiPoint': geometry.coordinates.forEach((coordinate) => visit(coordinate[0], coordinate[1])); break;
      case 'Polygon':
      case 'MultiLineString': geometry.coordinates.forEach((ringCoords) => ringCoords.forEach((coordinate) => visit(coordinate[0], coordinate[1]))); break;
      case 'MultiPolygon': geometry.coordinates.forEach((polygon) => polygon.forEach((ringCoords) => ringCoords.forEach((coordinate) => visit(coordinate[0], coordinate[1])))); break;
      case 'GeometryCollection': geometry.geometries.forEach((child) => eachCoordinate(child, visit)); break;
      default: break;
    }
  };
  for (const feature of collection.features) {
    eachCoordinate(feature.geometry, (lon, lat) => {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    });
  }
  if (!Number.isFinite(minLon)) { minLon = -180; maxLon = 180; minLat = -85; maxLat = 85; }
  const spanLon = Math.max(maxLon - minLon, 1e-9);
  const spanLat = Math.max(maxLat - minLat, 1e-9);
  const aspect = spanLat / spanLon;
  const width = size;
  const height = Math.max(60, Math.round(size * Math.min(2, aspect)));
  const project = (lon: number, lat: number): [number, number] => [
    ((lon - minLon) / spanLon) * (width - 20) + 10,
    height - (((lat - minLat) / spanLat) * (height - 20) + 10),
  ];

  const parts: string[] = [];
  for (const feature of collection.features) {
    const geometry = feature.geometry;
    if (!geometry) continue;
    const drawGeometry = (geo: GeoGeometry) => {
      switch (geo.type) {
        case 'Point': {
          const [x, y] = project(geo.coordinates[0], geo.coordinates[1]);
          parts.push(`<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4" fill="#dc2626" stroke="#7f1d1d" stroke-width="1"/>`);
          break;
        }
        case 'LineString': {
          const points = geo.coordinates.map(([lon, lat]) => project(lon, lat).map((value) => value.toFixed(2)).join(',')).join(' ');
          parts.push(`<polyline points="${points}" fill="none" stroke="#2563eb" stroke-width="2"/>`);
          break;
        }
        case 'Polygon': {
          const path = geo.coordinates.map((ringCoords) => `M${ringCoords.map(([lon, lat]) => project(lon, lat).map((value) => value.toFixed(2)).join(',')).join(' L')} Z`).join(' ');
          parts.push(`<path d="${path}" fill="#22c55e33" stroke="#15803d" stroke-width="1.5" fill-rule="evenodd"/>`);
          break;
        }
        case 'MultiPoint': geo.coordinates.forEach((coordinate) => drawGeometry({ type: 'Point', coordinates: coordinate })); break;
        case 'MultiLineString': geo.coordinates.forEach((line) => drawGeometry({ type: 'LineString', coordinates: line })); break;
        case 'MultiPolygon': geo.coordinates.forEach((polygon) => drawGeometry({ type: 'Polygon', coordinates: polygon })); break;
        case 'GeometryCollection': geo.geometries.forEach(drawGeometry); break;
        default: break;
      }
    };
    drawGeometry(geometry);
  }

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#f8fafc"/>`,
    `<text x="10" y="16" font-family="monospace" font-size="11" fill="#64748b">lon ${minLon.toFixed(3)}..${maxLon.toFixed(3)} · lat ${minLat.toFixed(3)}..${maxLat.toFixed(3)}</text>`,
    ...parts,
    '</svg>',
    '',
  ].join('\n');
}

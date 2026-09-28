import { describe, expect, it } from 'vitest';
import {
  geoGeometryToWkt, geojsonToCsv, geojsonToGpx, geojsonToKml, geojsonToKmz, geojsonToSvgMap,
  gpxToGeojson, kmlToGeojson, kmzToKml, normalizeFeatureCollection, parseWkt,
} from '../../src/tools/transcode/geo-engine';
import { registerGeoConverters } from '../../src/tools/transcode/geo-converters';
import { runConversion } from '../../src/tools/transcode/transcode-engine';

registerGeoConverters();

const pointCollection = {
  type: 'FeatureCollection' as const,
  features: [
    { type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [-90.1, 29.95] }, properties: { name: 'Covington', population: 10000 } },
    { type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: [[-90.1, 29.95], [-90.07, 30.0]] }, properties: { name: 'Route' } },
  ],
};

describe('WKT codec (F33)', () => {
  it('parses all geometry types', () => {
    expect(parseWkt('POINT (30 10)')).toEqual({ type: 'Point', coordinates: [30, 10] });
    expect(parseWkt('LINESTRING (30 10, 10 30, 40 40)')).toEqual({
      type: 'LineString', coordinates: [[30, 10], [10, 30], [40, 40]],
    });
    expect(parseWkt('POLYGON ((0 0, 4 0, 4 4, 0 4, 0 0), (1 1, 2 1, 2 2, 1 2, 1 1))').type).toBe('Polygon');
    expect(parseWkt('MULTIPOINT ((10 40), (40 30))').type).toBe('MultiPoint');
    expect(parseWkt('MULTILINESTRING ((10 10, 20 20), (15 15, 30 15))').type).toBe('MultiLineString');
    expect(parseWkt('MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)), ((2 2, 3 2, 3 3, 2 2)))').type).toBe('MultiPolygon');
    expect(parseWkt('GEOMETRYCOLLECTION (POINT (4 6), LINESTRING (4 6, 7 10))').type).toBe('GeometryCollection');
  });

  it('parses 3D coordinates and EMPTY geometries', () => {
    expect(parseWkt('POINT Z(1 2 3)')).toEqual({ type: 'Point', coordinates: [1, 2, 3] });
    expect(parseWkt('POINT EMPTY')).toEqual({ type: 'Point', coordinates: [] });
  });

  it('round-trips WKT through GeoJSON', () => {
    const original = 'POLYGON ((0 0, 4 0, 4 4, 0 4, 0 0))';
    expect(geoGeometryToWkt(parseWkt(original))).toBe(original);
  });

  it('rejects malformed input with position hints', () => {
    expect(() => parseWkt('POINT (30')).toThrow(/expected/i);
    expect(() => parseWkt('BLOB (1 2)')).toThrow(/unsupported/i);
  });
});

describe('GeoJSON -> KML/KMZ (F31)', () => {
  it('emits placemarks with names and coordinates', () => {
    const kml = geojsonToKml(pointCollection);
    expect(kml).toContain('<kml xmlns="http://www.opengis.net/kml/2.2">');
    expect(kml).toContain('<name>Covington</name>');
    expect(kml).toContain('<Point><coordinates>-90.1,29.95</coordinates></Point>');
    expect(kml).toContain('<LineString>');
  });

  it('round-trips KML back to GeoJSON', () => {
    const collection = kmlToGeojson(geojsonToKml(pointCollection));
    expect(collection.features).toHaveLength(2);
    expect(collection.features[0].geometry).toEqual({ type: 'Point', coordinates: [-90.1, 29.95] });
    expect(collection.features[0].properties.name).toBe('Covington');
  });

  it('packages and unpacks KMZ', async () => {
    const kmz = await geojsonToKmz(pointCollection);
    expect(Array.from(kmz.slice(0, 2))).toEqual([0x50, 0x4b]); // ZIP magic
    const kml = await kmzToKml(kmz);
    expect(kml).toContain('<Placemark>');
    expect(kmlToGeojson(kml).features[0].geometry?.type).toBe('Point');
  });
});

describe('GPX codec (F32)', () => {
  it('converts points and lines to waypoints and tracks', () => {
    const gpx = geojsonToGpx(pointCollection);
    expect(gpx).toContain('<gpx version="1.1"');
    expect(gpx).toContain('<wpt lat="29.95" lon="-90.1">');
    expect(gpx).toContain('<trk><name>Route</name>');
    expect(gpx).toContain('<trkpt lat="30" lon="-90.07">');
  });

  it('parses GPX tracks with elevation and waypoints', () => {
    const gpx = `<?xml version="1.0"?><gpx version="1.1" creator="t">
      <wpt lat="29.95" lon="-90.1"><ele>5</ele><name>Start</name></wpt>
      <trk><name>Hike</name><trkseg>
        <trkpt lat="29.95" lon="-90.1"><ele>5</ele></trkpt>
        <trkpt lat="30.0" lon="-90.07"><ele>9</ele></trkpt>
      </trkseg></trk></gpx>`;
    const collection = gpxToGeojson(gpx);
    expect(collection.features).toHaveLength(2);
    const waypoint = collection.features[0];
    expect(waypoint.geometry).toEqual({ type: 'Point', coordinates: [-90.1, 29.95, 5] });
    expect(waypoint.properties.name).toBe('Start');
    const track = collection.features[1];
    expect(track.geometry).toEqual({
      type: 'LineString',
      coordinates: [[-90.1, 29.95, 5], [-90.07, 30, 9]],
    });
  });

  it('parses multi-segment tracks as MultiLineString', () => {
    const gpx = '<gpx><trk><trkseg><trkpt lat="1" lon="2"/></trkseg><trkseg><trkpt lat="3" lon="4"/></trkseg></trk></gpx>';
    const collection = gpxToGeojson(gpx);
    expect(collection.features[0].geometry?.type).toBe('MultiLineString');
  });
});

describe('GeoJSON outputs', () => {
  it('flattens features to CSV with point columns and WKT fallback', () => {
    const csv = geojsonToCsv(pointCollection);
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('feature_index,geometry_type,longitude,latitude,wkt,name,population');
    expect(lines[1]).toContain('-90.1');
    expect(lines[1]).toContain('Covington');
    expect(lines[1]).toContain('10000');
    expect(lines[2]).toContain('LINESTRING');
    expect(lines[2]).toContain(',,,'); // non-point rows leave lon/lat empty
  });

  it('renders an SVG map with projected geometry', () => {
    const svg = geojsonToSvgMap(pointCollection);
    expect(svg).toContain('<svg xmlns=');
    expect(svg).toContain('<circle');
    expect(svg).toContain('<polyline');
    expect(svg).toContain('viewBox');
  });
});

describe('registry wiring', () => {
  it('runs geojson -> kml through the converter registry', async () => {
    const json = JSON.stringify(pointCollection);
    const artifacts = await runConversion('geojson', 'kml', {
      sourceId: 'geojson',
      fileName: 'sites.geojson',
      bytes: new TextEncoder().encode(json),
      text: () => json,
    }, {});
    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].name).toBe('sites.kml');
    expect(new TextDecoder().decode(artifacts[0].bytes)).toContain('<Placemark>');
  });

  it('runs wkt -> geojson with multiple geometry lines', async () => {
    const wkt = 'POINT (1 2)\n# comment\nLINESTRING (0 0, 1 1)\n';
    const artifacts = await runConversion('wkt', 'geojson', {
      sourceId: 'wkt',
      fileName: 'shapes.wkt',
      bytes: new TextEncoder().encode(wkt),
      text: () => wkt,
    }, {});
    const collection = JSON.parse(new TextDecoder().decode(artifacts[0].bytes));
    expect(collection.features).toHaveLength(2);
  });

  it('runs kmz -> gpx and kmz -> csv through the registry', async () => {
    const kmz = await geojsonToKmz(pointCollection);
    const gpxArtifacts = await runConversion('kmz', 'gpx', {
      sourceId: 'kmz',
      fileName: 'sites.kmz',
      bytes: kmz,
      text: () => '',
    }, {});
    expect(gpxArtifacts[0].name).toBe('sites.gpx');
    expect(new TextDecoder().decode(gpxArtifacts[0].bytes)).toContain('<wpt');

    const csvArtifacts = await runConversion('kmz', 'csv', {
      sourceId: 'kmz',
      fileName: 'sites.kmz',
      bytes: kmz,
      text: () => '',
    }, {});
    expect(csvArtifacts[0].name).toBe('sites.csv');
    expect(new TextDecoder().decode(csvArtifacts[0].bytes)).toContain('Covington');
  });

  it('normalizes bare geometries into FeatureCollections', () => {
    const collection = normalizeFeatureCollection({ type: 'Point', coordinates: [1, 2] });
    expect(collection.features[0].geometry).toEqual({ type: 'Point', coordinates: [1, 2] });
  });
});

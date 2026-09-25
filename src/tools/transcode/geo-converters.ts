// Registry wiring for geospatial & coordinate formats (F31-F33).

import {
  geoGeometryToWkt, geojsonToCsv, geojsonToGpx, geojsonToKml, geojsonToKmz, geojsonToSvgMap,
  gpxToGeojson, kmlToGeojson, kmzToKml, normalizeFeatureCollection, parseWkt,
} from './geo-engine';
import { registerConverter, swapExtension, textArtifact, bytesArtifact, baseName } from './transcode-engine';

const KML_MIME = 'application/vnd.google-earth.kml+xml';
const KMZ_MIME = 'application/vnd.google-earth.kmz';
const GEOJSON_MIME = 'application/geo+json';

function parseGeoJson(text: string) {
  try {
    return normalizeFeatureCollection(JSON.parse(text));
  } catch {
    throw new Error('Input is not valid GeoJSON (expected a FeatureCollection, Feature, or geometry object).');
  }
}

export function registerGeoConverters(): void {
  // --- GeoJSON source (F31) ---------------------------------------------------
  registerConverter('geojson', 'kml', 'Convert GeoJSON to KML placemarks', async (input) => {
    const collection = parseGeoJson(input.text());
    return [textArtifact(swapExtension(input.fileName, 'kml'), geojsonToKml(collection, baseName(input.fileName)), KML_MIME)];
  });
  registerConverter('geojson', 'kmz', 'Convert GeoJSON to a compressed KMZ package', async (input) => {
    const collection = parseGeoJson(input.text());
    return [bytesArtifact(swapExtension(input.fileName, 'kmz'), await geojsonToKmz(collection, baseName(input.fileName)), KMZ_MIME)];
  });
  registerConverter('geojson', 'gpx', 'Convert GeoJSON points and tracks to GPX', async (input) => {
    const collection = parseGeoJson(input.text());
    return [textArtifact(swapExtension(input.fileName, 'gpx'), geojsonToGpx(collection), 'application/gpx+xml')];
  });
  registerConverter('geojson', 'csv', 'Flatten GeoJSON features to CSV (points + WKT column)', async (input) => {
    const collection = parseGeoJson(input.text());
    return [textArtifact(swapExtension(input.fileName, 'csv'), geojsonToCsv(collection), 'text/csv;charset=utf-8')];
  });
  registerConverter('geojson', 'wkt', 'Export every feature as WKT geometry lines', async (input) => {
    const collection = parseGeoJson(input.text());
    const lines = collection.features
      .map((feature) => (feature.geometry ? geoGeometryToWkt(feature.geometry) : null))
      .filter((line): line is string => Boolean(line));
    if (lines.length === 0) throw new Error('No geometries found to export.');
    return [textArtifact(swapExtension(input.fileName, 'wkt.txt'), `${lines.join('\n')}\n`, 'text/plain;charset=utf-8')];
  });
  registerConverter('geojson', 'svg', 'Render GeoJSON to an SVG map', async (input) => {
    const collection = parseGeoJson(input.text());
    return [textArtifact(swapExtension(input.fileName, 'svg'), geojsonToSvgMap(collection), 'image/svg+xml')];
  });

  // --- KML / KMZ sources -------------------------------------------------------
  registerConverter('kml', 'geojson', 'Convert KML placemarks to GeoJSON', async (input) => {
    const collection = kmlToGeojson(input.text());
    return [textArtifact(swapExtension(input.fileName, 'geojson'), `${JSON.stringify(collection, null, 2)}\n`, GEOJSON_MIME)];
  });
  registerConverter('kml', 'gpx', 'Convert KML placemarks to GPX', async (input) => {
    const collection = kmlToGeojson(input.text());
    return [textArtifact(swapExtension(input.fileName, 'gpx'), geojsonToGpx(collection), 'application/gpx+xml')];
  });
  registerConverter('kml', 'csv', 'Flatten KML placemarks to CSV', async (input) => {
    const collection = kmlToGeojson(input.text());
    return [textArtifact(swapExtension(input.fileName, 'csv'), geojsonToCsv(collection), 'text/csv;charset=utf-8')];
  });
  registerConverter('kml', 'svg', 'Render KML placemarks to an SVG map', async (input) => {
    const collection = kmlToGeojson(input.text());
    return [textArtifact(swapExtension(input.fileName, 'svg'), geojsonToSvgMap(collection), 'image/svg+xml')];
  });

  registerConverter('kmz', 'kml', 'Unpack the KML document from a KMZ archive', async (input) => {
    const kml = await kmzToKml(input.bytes);
    return [textArtifact(swapExtension(input.fileName, 'kml'), kml, KML_MIME)];
  });
  registerConverter('kmz', 'geojson', 'Unpack KMZ and convert to GeoJSON', async (input) => {
    const kml = await kmzToKml(input.bytes);
    const collection = kmlToGeojson(kml);
    return [textArtifact(swapExtension(input.fileName, 'geojson'), `${JSON.stringify(collection, null, 2)}\n`, GEOJSON_MIME)];
  });
  registerConverter('kmz', 'gpx', 'Unpack KMZ and convert to GPX', async (input) => {
    const kml = await kmzToKml(input.bytes);
    const collection = kmlToGeojson(kml);
    return [textArtifact(swapExtension(input.fileName, 'gpx'), geojsonToGpx(collection), 'application/gpx+xml')];
  });
  registerConverter('kmz', 'csv', 'Unpack KMZ and flatten placemarks to CSV', async (input) => {
    const kml = await kmzToKml(input.bytes);
    const collection = kmlToGeojson(kml);
    return [textArtifact(swapExtension(input.fileName, 'csv'), geojsonToCsv(collection), 'text/csv;charset=utf-8')];
  });

  // --- GPX source (F32) ---------------------------------------------------------
  registerConverter('gpx', 'geojson', 'Convert GPX waypoints, tracks, and routes to GeoJSON', async (input) => {
    const collection = gpxToGeojson(input.text());
    return [textArtifact(swapExtension(input.fileName, 'geojson'), `${JSON.stringify(collection, null, 2)}\n`, GEOJSON_MIME)];
  });
  registerConverter('gpx', 'kml', 'Convert GPX tracks and waypoints to KML', async (input) => {
    const collection = gpxToGeojson(input.text());
    return [textArtifact(swapExtension(input.fileName, 'kml'), geojsonToKml(collection, baseName(input.fileName)), KML_MIME)];
  });
  registerConverter('gpx', 'csv', 'Export GPX track points to CSV', async (input) => {
    const collection = gpxToGeojson(input.text());
    return [textArtifact(swapExtension(input.fileName, 'csv'), geojsonToCsv(collection), 'text/csv;charset=utf-8')];
  });

  // --- WKT source (F33) -----------------------------------------------------------
  registerConverter('wkt', 'geojson', 'Parse WKT geometry text into GeoJSON', async (input) => {
    const lines = input.text().split('\n').map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith('#'));
    if (lines.length === 0) throw new Error('No WKT geometry lines found.');
    const geometries = lines.map((line) => parseWkt(line));
    const collection = geometries.length === 1
      ? { type: 'FeatureCollection' as const, features: [{ type: 'Feature' as const, geometry: geometries[0], properties: {} }] }
      : { type: 'FeatureCollection' as const, features: geometries.map((geometry) => ({ type: 'Feature' as const, geometry, properties: {} })) };
    return [textArtifact(swapExtension(input.fileName, 'geojson'), `${JSON.stringify(collection, null, 2)}\n`, GEOJSON_MIME)];
  });
  registerConverter('wkt', 'svg', 'Render WKT geometries to an SVG map', async (input) => {
    const lines = input.text().split('\n').map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith('#'));
    const collection = {
      type: 'FeatureCollection' as const,
      features: lines.map((line) => ({ type: 'Feature' as const, geometry: parseWkt(line), properties: {} })),
    };
    return [textArtifact(swapExtension(input.fileName, 'svg'), geojsonToSvgMap(collection), 'image/svg+xml')];
  });
}

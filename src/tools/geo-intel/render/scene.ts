// One SVG scene renderer shared by the on-screen map, SVG export and PNG export.

import { destination, greatCirclePoints } from '../core/geodesy';
import { geometryPath, linePath, project, ringPath, WORLD_EXTENT } from '../core/projection';
import type { BBox, ExportMetadata, LatLon } from '../core/types';
import type { CountryShapeProps, PolygonFeature } from '../offline/static-data';

export interface CountryPath { a3: string; a2: string | null; name: string; d: string }
export interface Pin { id: string; lat: number; lon: number; label: string; active: boolean; index?: number }
export interface Arc { from: LatLon; to: LatLon; label: string }
export interface LegendStop { color: string; label: string }
export interface Legend { title: string; stops: LegendStop[]; note: string }
export interface BoundaryPath { d: string; name: string; id: string }

export interface MapScene {
  countries: CountryPath[];
  fills: Map<string, string> | null;
  highlight: string | null;
  boundaries: BoundaryPath[];
  pins: Pin[];
  arcs: Arc[];
  boxes: BBox[];
  radius: { center: LatLon; km: number } | null;
  legend: Legend | null;
}

export const escapeXml = (text: string) => text.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c] as string));

export function countryPaths(features: PolygonFeature<CountryShapeProps>[]): CountryPath[] {
  return features.map((feature) => ({
    a3: feature.properties.a3, a2: feature.properties.a2, name: feature.properties.name,
    d: feature.polygons.map((polygon) => polygon.map(ringPath).join('')).join(''),
  }));
}

export function boundaryPaths(features: Array<{ properties: { shapeName?: string; shapeID?: string }; geometry: Parameters<typeof geometryPath>[0] }>): BoundaryPath[] {
  return features.map((feature, index) => ({ d: geometryPath(feature.geometry), name: feature.properties.shapeName ?? `Unit ${index + 1}`, id: feature.properties.shapeID ?? String(index) }));
}

function graticule(): string {
  let d = '';
  for (let lon = -180; lon <= 180; lon += 30) d += linePath(Array.from({ length: 37 }, (_, i) => ({ lat: -90 + i * 5, lon })));
  for (let lat = -60; lat <= 60; lat += 30) d += linePath(Array.from({ length: 73 }, (_, i) => ({ lat, lon: -180 + i * 5 })));
  return d;
}
const GRATICULE = graticule();
const OUTLINE = linePath([...Array.from({ length: 37 }, (_, i) => ({ lat: -90 + i * 5, lon: -180 })), ...Array.from({ length: 37 }, (_, i) => ({ lat: 90 - i * 5, lon: 180 }))]) + 'Z';

export function baseLayerSvg(scene: Pick<MapScene, 'countries' | 'fills' | 'highlight'>): string {
  const paths = scene.countries.map((country) => {
    const fill = scene.fills?.get(country.a3);
    const cls = `gi-country${country.a3 === scene.highlight ? ' is-active' : ''}${fill ? ' has-fill' : ''}`;
    return `<path class="${cls}" data-a3="${escapeXml(country.a3)}" data-name="${escapeXml(country.name)}"${fill ? ` style="fill:${fill}"` : ''} d="${country.d}"/>`;
  }).join('');
  return `<path class="gi-sphere" d="${OUTLINE}"/><path class="gi-graticule" d="${GRATICULE}"/><g class="gi-countries">${paths}</g>`;
}

function boxPath(box: BBox): string {
  const east = box.east >= box.west ? box.east : box.east + 360;
  const steps = 24;
  const pts: LatLon[] = [];
  for (let i = 0; i <= steps; i += 1) pts.push({ lat: box.south, lon: box.west + ((east - box.west) * i) / steps });
  for (let i = 0; i <= steps; i += 1) pts.push({ lat: box.north, lon: east - ((east - box.west) * i) / steps });
  return linePath(pts.map((p) => ({ lat: p.lat, lon: p.lon > 180 ? p.lon - 360 : p.lon }))) + 'Z';
}

function circlePath(center: LatLon, km: number): string {
  const pts = Array.from({ length: 73 }, (_, i) => destination(center, i * 5, km));
  return linePath(pts) + 'Z';
}

/** Overlays; `unitsPerPx` keeps pins and labels a constant on-screen size at any zoom. */
export function overlayLayerSvg(scene: MapScene, unitsPerPx: number): string {
  const u = unitsPerPx;
  const boundaries = scene.boundaries.map((b) => `<path class="gi-boundary" data-boundary="${escapeXml(b.id)}" data-name="${escapeXml(b.name)}" d="${b.d}"/>`).join('');
  const boxes = scene.boxes.map((box) => `<path class="gi-box" d="${boxPath(box)}"/>`).join('');
  const radius = scene.radius ? `<path class="gi-radius" d="${circlePath(scene.radius.center, scene.radius.km)}"/>` : '';
  const arcs = scene.arcs.map((arc) => `<path class="gi-arc" d="${linePath(greatCirclePoints(arc.from, arc.to, 96))}"><title>${escapeXml(arc.label)}</title></path>`).join('');
  const pins = scene.pins.map((pin) => {
    const [x, y] = project(pin.lon, pin.lat);
    const r = (pin.active ? 7 : 5.5) * u;
    const label = pin.index !== undefined ? `<text class="gi-pin-index" x="${x.toFixed(2)}" y="${(y + 3.2 * u).toFixed(2)}" style="font-size:${(9 * u).toFixed(3)}px">${pin.index}</text>` : '';
    return `<g class="gi-pin${pin.active ? ' is-active' : ''}" data-pin="${escapeXml(pin.id)}" tabindex="-1"><circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r.toFixed(3)}" style="stroke-width:${(2 * u).toFixed(3)}px"/>${label}<title>${escapeXml(pin.label)}</title></g>`;
  }).join('');
  return `<g class="gi-boundaries">${boundaries}</g>${radius}${boxes}${arcs}<g class="gi-pins">${pins}</g>`;
}

export const SCENE_STYLE = `
.gi-sphere{fill:#dfeaf3}.gi-graticule{fill:none;stroke:#b9cad8;stroke-width:.4px;vector-effect:non-scaling-stroke}
.gi-country{fill:#f4f1ea;stroke:#8a8f98;stroke-width:.5px;vector-effect:non-scaling-stroke}.gi-country.is-active{fill:#ffd166;stroke:#5c4400}
.gi-boundary{fill:rgba(46,106,176,.08);stroke:#2e6ab0;stroke-width:1px;vector-effect:non-scaling-stroke}
.gi-box{fill:rgba(200,60,40,.12);stroke:#c83c28;stroke-width:1.5px;stroke-dasharray:6 3;vector-effect:non-scaling-stroke}
.gi-radius{fill:rgba(15,122,90,.1);stroke:#0f7a5a;stroke-width:1.5px;vector-effect:non-scaling-stroke}
.gi-arc{fill:none;stroke:#6b2fb3;stroke-width:2px;vector-effect:non-scaling-stroke}
.gi-pin circle{fill:#d7263d;stroke:#fff}.gi-pin.is-active circle{fill:#0b1220}.gi-pin-index{fill:#fff;text-anchor:middle;font-family:system-ui,sans-serif;font-weight:700}
`;

export interface ExportSvgOptions {
  metadata: ExportMetadata;
  title: string;
  date: string;
  attribution: string[];
  viewBox?: [number, number, number, number];
  width?: number;
}

/** Standalone SVG document with embedded styles, Dublin Core metadata, legend and attribution. */
export function exportSvg(scene: MapScene, options: ExportSvgOptions): string {
  const vb = options.viewBox ?? WORLD_EXTENT;
  const width = options.width ?? 1600;
  const mapHeight = Math.round((width * vb[3]) / vb[2]);
  const footer = 28 + options.attribution.length * 14 + (scene.legend ? 24 : 0);
  const height = mapHeight + footer + 40;
  const unitsPerPx = vb[2] / width;
  const m = options.metadata;
  const license = m.license === 'custom' ? m.customLicense : m.license;
  const legend = scene.legend
    ? `<g transform="translate(16 ${mapHeight + 48})" font-family="system-ui,sans-serif" font-size="12"><text y="0" font-weight="700">${escapeXml(scene.legend.title)}</text>${scene.legend.stops.map((stop, i) => `<rect x="${i * 130}" y="6" width="18" height="12" fill="${stop.color}" stroke="#666" stroke-width=".5"/><text x="${i * 130 + 24}" y="16">${escapeXml(stop.label)}</text>`).join('')}</g>`
    : '';
  const attributionY = mapHeight + 48 + (scene.legend ? 40 : 0);
  const attribution = options.attribution.map((line, i) => `<text x="16" y="${attributionY + i * 14}">${escapeXml(line)}</text>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns:dc="http://purl.org/dc/elements/1.1/" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="gi-title gi-desc">
<title id="gi-title">${escapeXml(options.title)}</title>
<desc id="gi-desc">${escapeXml(m.description || options.title)}</desc>
<metadata><rdf:RDF><rdf:Description dc:title="${escapeXml(options.title)}" dc:creator="${escapeXml(m.author)}" dc:date="${escapeXml(options.date)}" dc:rights="${escapeXml(license)}" dc:subject="${escapeXml(m.tags.join(', '))}" dc:description="${escapeXml(m.description)}"/></rdf:RDF></metadata>
<style>${SCENE_STYLE}</style>
<rect width="100%" height="100%" fill="#ffffff"/>
<text x="16" y="28" font-family="system-ui,sans-serif" font-size="20" font-weight="700" fill="#0b1220">${escapeXml(options.title)}</text>
<svg x="0" y="40" width="${width}" height="${mapHeight}" viewBox="${vb.join(' ')}">${baseLayerSvg(scene)}${overlayLayerSvg(scene, unitsPerPx)}</svg>
${legend}
<g font-family="system-ui,sans-serif" font-size="11" fill="#333">${attribution}</g>
</svg>`;
}

// ---------------- Choropleth ----------------

/** ColorBrewer GnBu, 7 classes (sequential, colour-blind safe). */
export const CHOROPLETH_PALETTE = ['#f0f9e8', '#ccebc5', '#a8ddb5', '#7bccc4', '#4eb3d3', '#2b8cbe', '#08589e'];

export function quantileBreaks(values: number[], classes = CHOROPLETH_PALETTE.length): number[] {
  const sorted = [...values].filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return [];
  return Array.from({ length: classes - 1 }, (_, i) => sorted[Math.min(sorted.length - 1, Math.floor(((i + 1) * sorted.length) / classes))]);
}

export function classify(value: number, breaks: number[]): number {
  let index = 0;
  while (index < breaks.length && value >= breaks[index]) index += 1;
  return index;
}

const compact = (value: number) => new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

export function choropleth(values: Map<string, { value: number; year: number }>, title: string, unit: string): { fills: Map<string, string>; legend: Legend } {
  const breaks = quantileBreaks([...values.values()].map((item) => item.value));
  const fills = new Map<string, string>();
  for (const [iso3, { value }] of values) fills.set(iso3, CHOROPLETH_PALETTE[classify(value, breaks)]);
  const edges = [Math.min(...[...values.values()].map((v) => v.value)), ...breaks];
  const stops = CHOROPLETH_PALETTE.map((color, i) => ({ color, label: i < breaks.length ? `${compact(edges[i])}–${compact(breaks[i])}` : `≥ ${compact(edges[i])}` }));
  const years = [...values.values()].map((item) => item.year);
  const yearText = years.length ? (Math.min(...years) === Math.max(...years) ? `${Math.min(...years)}` : `${Math.min(...years)}–${Math.max(...years)}`) : 'n/a';
  return { fills, legend: { title: `${title} (${unit})`, stops, note: `Quantile classes; latest year per country (${yearText}). Grey = no data.` } };
}

export const emptyScene = (countries: CountryPath[] = []): MapScene => ({ countries, fills: null, highlight: null, boundaries: [], pins: [], arcs: [], boxes: [], radius: null, legend: null });

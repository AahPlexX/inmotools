import type { JsonValue } from './format-engine';
import type { LatticeGraphModel, LatticeGraphNode } from './graph-engine';
import type { LatticeLayoutModel, LatticePoint } from './layout-engine';
import { buildJsonTreeRows } from './query-engine';

const escapeXml = (value: string): string => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&apos;');

const csvCell = (value: string | number | null): string => {
  const text = value === null ? '' : String(value);
  return /[",\n\r]/u.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

const primitiveLabel = (node: LatticeGraphNode): string => {
  if (node.value === undefined) return node.type === 'array' ? `Array (${node.childCount})` : node.type === 'object' ? `Object (${node.childCount})` : node.type;
  if (node.value === null) return 'null';
  if (typeof node.value === 'string') return node.value;
  return String(node.value);
};

const pathData = (points: readonly LatticePoint[]): string => points.map((point, index) => `${index ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ');

const nodeCenter = (layout: LatticeLayoutModel, id: string): LatticePoint | null => {
  const node = layout.nodes.get(id);
  return node ? { x: node.x + node.width / 2, y: node.y + node.height / 2 } : null;
};

export const buildLatticeSvg = (
  graph: LatticeGraphModel,
  layout: LatticeLayoutModel,
  options: { readonly title?: string } = {},
): string => {
  const title = escapeXml(options.title?.trim() || 'JSON Lattice Graph');
  const structuralEdges = layout.edges.map((edge) => `<path d="${pathData(edge.points)}" />`).join('');
  const crossLinks = graph.crossLinks.map((link) => {
    const source = nodeCenter(layout, link.source);
    const target = nodeCenter(layout, link.target);
    return source && target ? `<path d="M ${source.x} ${source.y} L ${target.x} ${target.y}" data-value="${escapeXml(link.value)}" />` : '';
  }).join('');
  const nodes = graph.nodes.map((node) => {
    const box = layout.nodes.get(node.path);
    if (!box) return '';
    const key = node.path ? node.key : '$';
    const value = primitiveLabel(node);
    return `<g class="node" data-path="${escapeXml(node.path)}" transform="translate(${box.x} ${box.y})"><rect width="${box.width}" height="${box.height}" rx="10"/><text class="key" x="12" y="24">${escapeXml(key)}</text><text class="value" x="12" y="48">${escapeXml(value.slice(0, 80))}</text><text class="type" x="12" y="${Math.max(62, box.height - 10)}">${escapeXml(node.type)}</text></g>`;
  }).join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="lattice-title" viewBox="0 0 ${layout.bounds.width} ${layout.bounds.height}"><title id="lattice-title">${title}</title><style>.bg{fill:#0b1120}#structural-edges path{fill:none;stroke:#475569;stroke-width:2}#foreign-key-links path{fill:none;stroke:#38bdf8;stroke-width:1.5;stroke-dasharray:7 5}.node rect{fill:#1e293b;stroke:#475569;stroke-width:1.5}.node text{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.key{fill:#e2e8f0;font-size:14px;font-weight:700}.value{fill:#cbd5e1;font-size:12px}.type{fill:#38bdf8;font-size:10px}</style><rect class="bg" width="100%" height="100%"/><g id="structural-edges">${structuralEdges}</g><g id="foreign-key-links">${crossLinks}</g><g id="nodes">${nodes}</g></svg>`;
};

export const buildFlatCsv = (value: JsonValue): string => {
  const header = 'path,parent_path,key,type,value_text,value_json,depth';
  const rows = buildJsonTreeRows(value).map((row) => [
    row.path,
    row.parent_path,
    row.key,
    row.type,
    row.value_text,
    row.value_json,
    row.depth,
  ].map(csvCell).join(','));
  return [header, ...rows].join('\n');
};

const svgBounds = (svg: string): { width: number; height: number } => {
  const match = svg.match(/viewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/iu);
  if (!match) throw new Error('SVG export is missing a valid viewBox.');
  const width = Number(match[1]);
  const height = Number(match[2]);
  if (!(width > 0 && height > 0)) throw new Error('SVG export has invalid dimensions.');
  return { width, height };
};

export const rasterizeLatticeSvg = async (
  svg: string,
  options: { readonly format?: 'png' | 'jpeg'; readonly scale?: number; readonly background?: string } = {},
): Promise<Blob> => {
  const { width, height } = svgBounds(svg);
  const scale = Math.min(4, Math.max(1, options.scale ?? 2));
  const format = options.format ?? 'png';
  const source = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(source);
  try {
    const image = new Image();
    image.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Unable to rasterize the graph SVG.'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(width * scale));
    canvas.height = Math.max(1, Math.ceil(height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas 2D is unavailable.');
    context.scale(scale, scale);
    if (options.background || format === 'jpeg') {
      context.fillStyle = options.background ?? '#0b1120';
      context.fillRect(0, 0, width, height);
    }
    context.drawImage(image, 0, 0, width, height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Raster export failed.')), `image/${format}`, 0.92);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
};

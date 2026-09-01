import type { RegexExplanationNode } from './regex-types';

export interface RailroadSegment {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly source: string;
  readonly start: number;
  readonly end: number;
  readonly x: number;
  readonly width: number;
}

export interface RailroadProjection {
  readonly width: number;
  readonly height: number;
  readonly baselineY: number;
  readonly segments: readonly RailroadSegment[];
}

const LEFT_PAD = 46;
const RIGHT_PAD = 46;
const GAP = 24;
const HEIGHT = 116;
const BASELINE_Y = 58;

const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const escapeXml = (value: string) => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&apos;');

const segmentWidth = (node: RegexExplanationNode) => {
  const visible = Math.max(node.source.length, Math.min(node.label.length, 28));
  return clamp(72 + visible * 7, 96, 236);
};

export const buildRailroadProjection = (explanation: RegexExplanationNode): RailroadProjection => {
  let cursor = LEFT_PAD;
  const segments = explanation.children.map((node) => {
    const width = segmentWidth(node);
    const segment: RailroadSegment = {
      id: node.id,
      kind: node.kind,
      label: node.label,
      source: node.source,
      start: node.start,
      end: node.end,
      x: cursor,
      width,
    };
    cursor += width + GAP;
    return segment;
  });
  const width = Math.max(320, segments.length ? cursor - GAP + RIGHT_PAD : LEFT_PAD + RIGHT_PAD + 228);
  return { width, height: HEIGHT, baselineY: BASELINE_Y, segments };
};

export const renderRailroadSvg = (projection: RailroadProjection) => {
  const { width, height, baselineY, segments } = projection;
  const startX = 18;
  const endX = width - 18;
  const connectors = segments.length
    ? [
        `<line x1="${startX}" y1="${baselineY}" x2="${segments[0]!.x}" y2="${baselineY}"/>`,
        ...segments.slice(0, -1).map((segment, index) => `<line x1="${segment.x + segment.width}" y1="${baselineY}" x2="${segments[index + 1]!.x}" y2="${baselineY}"/>`),
        `<line x1="${segments.at(-1)!.x + segments.at(-1)!.width}" y1="${baselineY}" x2="${endX}" y2="${baselineY}"/>`,
      ].join('')
    : `<line x1="${startX}" y1="${baselineY}" x2="${endX}" y2="${baselineY}"/>`;
  const nodes = segments.map((segment) => {
    const source = segment.source || '∅';
    const primary = source.length > 24 ? `${source.slice(0, 21)}…` : source;
    const secondary = segment.label.length > 30 ? `${segment.label.slice(0, 27)}…` : segment.label;
    return `<g data-node-id="${escapeXml(segment.id)}" data-kind="${escapeXml(segment.kind)}" data-start="${segment.start}" data-end="${segment.end}" transform="translate(${segment.x} ${baselineY - 28})"><rect width="${segment.width}" height="56" rx="9"/><text class="railroad-source" x="${segment.width / 2}" y="22" text-anchor="middle">${escapeXml(primary)}</text><text class="railroad-label" x="${segment.width / 2}" y="41" text-anchor="middle">${escapeXml(secondary)}</text></g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="regex-railroad-title regex-railroad-desc"><title id="regex-railroad-title">Regex railroad projection</title><desc id="regex-railroad-desc">A left-to-right structural projection of the regular expression tokens and their source ranges.</desc><style>svg{background:#0b1120;color:#e8f2ff}line{stroke:#47627f;stroke-width:2}circle{fill:#38bdf8}rect{fill:#13243a;stroke:#47627f;stroke-width:1.5}.railroad-source{fill:#e8f2ff;font:600 12px ui-monospace,SFMono-Regular,Menlo,monospace}.railroad-label{fill:#9fb2c8;font:10px system-ui,sans-serif}</style><circle cx="${startX}" cy="${baselineY}" r="5"/>${connectors}${nodes}<circle cx="${endX}" cy="${baselineY}" r="5"/></svg>`;
};

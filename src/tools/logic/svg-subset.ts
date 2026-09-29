/**
 * A small reader for the SVG the schematic exporter writes, so the same
 * drawing can be turned into vector PDF without a second description of it.
 *
 * It understands exactly what `renderSchematicSvg` produces: nested `<g>`
 * elements with `transform`, and `rect`, `circle`, `line`, `polyline`,
 * `polygon`, `path` and `text` shapes with fill, stroke and text styling. It is
 * not a general SVG parser; anything else is ignored. Everything here is pure:
 * geometry in, geometry out.
 */

// --- SECTION: a tiny XML tree ---

export interface SvgNode {
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly children: readonly SvgNode[];
  /** The text inside the element (only `<text>` has any that matters). */
  readonly text: string;
}

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export const unescapeXml = (value: string): string =>
  value.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (whole, name: string) => {
    if (name.startsWith('#x')) return String.fromCodePoint(Number.parseInt(name.slice(2), 16));
    if (name.startsWith('#')) return String.fromCodePoint(Number.parseInt(name.slice(1), 10));
    return ENTITIES[name] ?? whole;
  });

const TOKEN = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<\/([A-Za-z][\w:-]*)\s*>|<([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"]*")*)\s*(\/?)>|([^<]+)/g;
const ATTRIBUTE = /([\w:-]+)="([^"]*)"/g;

interface MutableNode {
  tag: string;
  attrs: Record<string, string>;
  children: MutableNode[];
  text: string;
}

/** Parses SVG text into a tree. Malformed input yields whatever tree could be built; it never throws. */
export const parseSvg = (source: string): SvgNode => {
  const root: MutableNode = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack: MutableNode[] = [root];
  for (const match of source.matchAll(TOKEN)) {
    const [, closing, opening, attributes, selfClosing, text] = match;
    const top = stack[stack.length - 1]!;
    if (closing !== undefined) {
      if (stack.length > 1) stack.pop();
    } else if (opening !== undefined) {
      const attrs: Record<string, string> = {};
      for (const attribute of (attributes ?? '').matchAll(ATTRIBUTE)) attrs[attribute[1]!] = unescapeXml(attribute[2]!);
      const node: MutableNode = { tag: opening, attrs, children: [], text: '' };
      top.children.push(node);
      if (selfClosing !== '/') stack.push(node);
    } else if (text !== undefined) {
      top.text += unescapeXml(text);
    }
  }
  return root.children.find((child) => child.tag === 'svg') ?? root;
};

// --- SECTION: affine transforms ---

/** `[a, b, c, d, e, f]`: x' = a x + c y + e, y' = b x + d y + f, as in SVG. */
export type Matrix = readonly [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** The transform that applies `inner` first, then `outer`. */
export const multiply = (outer: Matrix, inner: Matrix): Matrix => [
  outer[0] * inner[0] + outer[2] * inner[1],
  outer[1] * inner[0] + outer[3] * inner[1],
  outer[0] * inner[2] + outer[2] * inner[3],
  outer[1] * inner[2] + outer[3] * inner[3],
  outer[0] * inner[4] + outer[2] * inner[5] + outer[4],
  outer[1] * inner[4] + outer[3] * inner[5] + outer[5],
];

export const applyToPoint = (matrix: Matrix, x: number, y: number): [number, number] => [matrix[0] * x + matrix[2] * y + matrix[4], matrix[1] * x + matrix[3] * y + matrix[5]];

/** How much the transform stretches lengths, for scaling line widths and text sizes. */
export const scaleOf = (matrix: Matrix): number => Math.sqrt(Math.abs(matrix[0] * matrix[3] - matrix[1] * matrix[2]));

const numbers = (text: string): number[] => (text.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number);

/** Reads a `transform` attribute: any run of translate, rotate (degrees), scale and matrix, applied left to right as SVG does. */
export const parseTransform = (value: string | undefined): Matrix => {
  if (!value) return IDENTITY;
  let result: Matrix = IDENTITY;
  for (const match of value.matchAll(/(translate|rotate|scale|matrix)\(([^)]*)\)/g)) {
    const args = numbers(match[2]!);
    let step: Matrix = IDENTITY;
    if (match[1] === 'translate') step = [1, 0, 0, 1, args[0] ?? 0, args[1] ?? 0];
    else if (match[1] === 'scale') step = [args[0] ?? 1, 0, 0, args[1] ?? args[0] ?? 1, 0, 0];
    else if (match[1] === 'matrix' && args.length === 6) step = args as unknown as Matrix;
    else if (match[1] === 'rotate') {
      const radians = ((args[0] ?? 0) * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      const rotation: Matrix = [cos, sin, -sin, cos, 0, 0];
      const cx = args[1] ?? 0;
      const cy = args[2] ?? 0;
      step = multiply(multiply([1, 0, 0, 1, cx, cy], rotation), [1, 0, 0, 1, -cx, -cy]);
    }
    result = multiply(result, step);
  }
  return result;
};

// --- SECTION: paths ---

export type PathSegment =
  | { readonly kind: 'M'; readonly x: number; readonly y: number }
  | { readonly kind: 'L'; readonly x: number; readonly y: number }
  | { readonly kind: 'C'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number; readonly x: number; readonly y: number }
  | { readonly kind: 'Z' };

/**
 * An SVG elliptical arc as cubic Béziers (the endpoint-to-center conversion of the SVG specification, then at
 * most a quarter turn per curve, which a cubic follows closely).
 */
export const arcToCubics = (x0: number, y0: number, rxIn: number, ryIn: number, rotationDegrees: number, largeArc: boolean, sweep: boolean, x: number, y: number): PathSegment[] => {
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if ((x0 === x && y0 === y) || rx === 0 || ry === 0) return [{ kind: 'L', x, y }];
  const phi = (rotationDegrees * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const dx = (x0 - x) / 2;
  const dy = (y0 - y) / 2;
  const x1p = cosPhi * dx + sinPhi * dy;
  const y1p = -sinPhi * dx + cosPhi * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const scale = Math.sqrt(lambda);
    rx *= scale;
    ry *= scale;
  }
  const numerator = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denominator = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const factor = (largeArc === sweep ? -1 : 1) * Math.sqrt(Math.max(0, numerator / denominator));
  const cxp = (factor * rx * y1p) / ry;
  const cyp = (-factor * ry * x1p) / rx;
  const cx = cosPhi * cxp - sinPhi * cyp + (x0 + x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (y0 + y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number): number => {
    const sign = ux * vy - uy * vx < 0 ? -1 : 1;
    const dot = (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy));
    return sign * Math.acos(Math.max(-1, Math.min(1, dot)));
  };
  const theta = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  else if (sweep && delta < 0) delta += 2 * Math.PI;

  const count = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / count;
  const handle = (4 / 3) * Math.tan(step / 4);
  const segments: PathSegment[] = [];
  const point = (t: number): [number, number] => [cx + rx * Math.cos(t) * cosPhi - ry * Math.sin(t) * sinPhi, cy + rx * Math.cos(t) * sinPhi + ry * Math.sin(t) * cosPhi];
  const derivative = (t: number): [number, number] => [-rx * Math.sin(t) * cosPhi - ry * Math.cos(t) * sinPhi, -rx * Math.sin(t) * sinPhi + ry * Math.cos(t) * cosPhi];
  let t = theta;
  for (let index = 0; index < count; index += 1) {
    const next = t + step;
    const [px, py] = point(t);
    const [qx, qy] = point(next);
    const [dpx, dpy] = derivative(t);
    const [dqx, dqy] = derivative(next);
    segments.push({ kind: 'C', x1: px + handle * dpx, y1: py + handle * dpy, x2: qx - handle * dqx, y2: qy - handle * dqy, x: index === count - 1 ? x : qx, y: index === count - 1 ? y : qy });
    t = next;
  }
  return segments;
};

/** Reads a path's `d` (absolute commands M L H V Q C A Z, the ones the exporter writes) into moves, lines and cubics. */
export const parsePath = (d: string): PathSegment[] => {
  const tokens = d.match(/[MLHVQCAZmlhvqcaz]|-?\d*\.?\d+(?:e[-+]?\d+)?/g) ?? [];
  const segments: PathSegment[] = [];
  let index = 0;
  let command = '';
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  const next = (): number => Number(tokens[index++]);
  const isNumber = (): boolean => index < tokens.length && !/^[A-Za-z]$/.test(tokens[index]!);
  while (index < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[index]!)) command = tokens[index++]!;
    else if (command === 'M') command = 'L';
    const upper = command.toUpperCase();
    const relative = command !== upper;
    if (upper === 'Z') {
      segments.push({ kind: 'Z' });
      x = startX;
      y = startY;
      continue;
    }
    if (!isNumber()) break;
    const bx = relative ? x : 0;
    const by = relative ? y : 0;
    if (upper === 'M') {
      x = bx + next();
      y = by + next();
      startX = x;
      startY = y;
      segments.push({ kind: 'M', x, y });
    } else if (upper === 'L') {
      x = bx + next();
      y = by + next();
      segments.push({ kind: 'L', x, y });
    } else if (upper === 'H') {
      x = bx + next();
      segments.push({ kind: 'L', x, y });
    } else if (upper === 'V') {
      y = by + next();
      segments.push({ kind: 'L', x, y });
    } else if (upper === 'C') {
      const [x1, y1, x2, y2, ex, ey] = [bx + next(), by + next(), bx + next(), by + next(), bx + next(), by + next()];
      segments.push({ kind: 'C', x1, y1, x2, y2, x: ex, y: ey });
      x = ex;
      y = ey;
    } else if (upper === 'Q') {
      // A quadratic curve as the equivalent cubic.
      const [qx, qy, ex, ey] = [bx + next(), by + next(), bx + next(), by + next()];
      segments.push({ kind: 'C', x1: x + (2 / 3) * (qx - x), y1: y + (2 / 3) * (qy - y), x2: ex + (2 / 3) * (qx - ex), y2: ey + (2 / 3) * (qy - ey), x: ex, y: ey });
      x = ex;
      y = ey;
    } else if (upper === 'A') {
      const [rx, ry, rotation, large, sweep, ex, ey] = [next(), next(), next(), next(), next(), bx + next(), by + next()];
      segments.push(...arcToCubics(x, y, rx, ry, rotation, large !== 0, sweep !== 0, ex, ey));
      x = ex;
      y = ey;
    } else {
      break;
    }
  }
  return segments;
};

const KAPPA = 0.5522847498307936;

/** A rectangle, with rounded corners when `rx` is given, as path segments. */
export const rectSegments = (x: number, y: number, width: number, height: number, rxIn: number, ryIn: number): PathSegment[] => {
  const rx = Math.min(Math.max(rxIn, 0), width / 2);
  const ry = Math.min(Math.max(ryIn, 0), height / 2);
  if (rx === 0 || ry === 0) {
    return [{ kind: 'M', x, y }, { kind: 'L', x: x + width, y }, { kind: 'L', x: x + width, y: y + height }, { kind: 'L', x, y: y + height }, { kind: 'Z' }];
  }
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  const r = x + width;
  const b = y + height;
  return [
    { kind: 'M', x: x + rx, y },
    { kind: 'L', x: r - rx, y },
    { kind: 'C', x1: r - rx + kx, y1: y, x2: r, y2: y + ry - ky, x: r, y: y + ry },
    { kind: 'L', x: r, y: b - ry },
    { kind: 'C', x1: r, y1: b - ry + ky, x2: r - rx + kx, y2: b, x: r - rx, y: b },
    { kind: 'L', x: x + rx, y: b },
    { kind: 'C', x1: x + rx - kx, y1: b, x2: x, y2: b - ry + ky, x, y: b - ry },
    { kind: 'L', x, y: y + ry },
    { kind: 'C', x1: x, y1: y + ry - ky, x2: x + rx - kx, y2: y, x: x + rx, y },
    { kind: 'Z' },
  ];
};

export const circleSegments = (cx: number, cy: number, r: number): PathSegment[] => {
  const k = r * KAPPA;
  return [
    { kind: 'M', x: cx + r, y: cy },
    { kind: 'C', x1: cx + r, y1: cy + k, x2: cx + k, y2: cy + r, x: cx, y: cy + r },
    { kind: 'C', x1: cx - k, y1: cy + r, x2: cx - r, y2: cy + k, x: cx - r, y: cy },
    { kind: 'C', x1: cx - r, y1: cy - k, x2: cx - k, y2: cy - r, x: cx, y: cy - r },
    { kind: 'C', x1: cx + k, y1: cy - r, x2: cx + r, y2: cy - k, x: cx + r, y: cy },
    { kind: 'Z' },
  ];
};

export const polylineSegments = (points: string, close: boolean): PathSegment[] => {
  const values = numbers(points);
  const segments: PathSegment[] = [];
  for (let index = 0; index + 1 < values.length; index += 2) segments.push({ kind: index === 0 ? 'M' : 'L', x: values[index]!, y: values[index + 1]! });
  if (close && segments.length > 0) segments.push({ kind: 'Z' });
  return segments;
};

// --- SECTION: styles ---

export interface Style {
  readonly fill: string | undefined;
  readonly stroke: string | undefined;
  readonly strokeWidth: number;
  readonly fontSize: number;
  readonly bold: boolean;
  readonly anchor: 'start' | 'middle' | 'end';
}

export const DEFAULT_STYLE: Style = { fill: '#000000', stroke: undefined, strokeWidth: 1, fontSize: 16, bold: false, anchor: 'start' };

/** The style an element sets on top of the one it inherits; `none` clears a fill or stroke. */
export const applyStyle = (parent: Style, attrs: Readonly<Record<string, string>>): Style => ({
  fill: attrs.fill === undefined ? parent.fill : attrs.fill === 'none' ? undefined : attrs.fill,
  stroke: attrs.stroke === undefined ? parent.stroke : attrs.stroke === 'none' ? undefined : attrs.stroke,
  strokeWidth: attrs['stroke-width'] === undefined ? parent.strokeWidth : Number(attrs['stroke-width']) || parent.strokeWidth,
  fontSize: attrs['font-size'] === undefined ? parent.fontSize : Number(attrs['font-size']) || parent.fontSize,
  bold: attrs['font-weight'] === undefined ? parent.bold : attrs['font-weight'] === 'bold' || Number(attrs['font-weight']) >= 600,
  anchor: attrs['text-anchor'] === 'middle' || attrs['text-anchor'] === 'end' ? attrs['text-anchor'] : attrs['text-anchor'] === 'start' ? 'start' : parent.anchor,
});

/** `#rgb` or `#rrggbb` as 0-1 components, or undefined for anything else (a named color, `none`, a bad value). */
export const parseColor = (value: string | undefined): [number, number, number] | undefined => {
  if (!value) return undefined;
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(value.trim());
  if (!hex) return undefined;
  const full = hex[1]!.length === 3 ? hex[1]!.split('').map((digit) => digit + digit).join('') : hex[1]!;
  return [Number.parseInt(full.slice(0, 2), 16) / 255, Number.parseInt(full.slice(2, 4), 16) / 255, Number.parseInt(full.slice(4, 6), 16) / 255];
};

// --- SECTION: drawing ---

export interface DrawShape {
  readonly segments: readonly PathSegment[];
  readonly style: Style;
  readonly matrix: Matrix;
  /** An open line (a `line` or `polyline`) has no fill even when a fill is inherited. */
  readonly open: boolean;
}

export interface DrawText {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly style: Style;
  readonly matrix: Matrix;
}

export type DrawItem = { readonly kind: 'shape'; readonly shape: DrawShape } | { readonly kind: 'text'; readonly text: DrawText };

/** Walks the tree and lists what to draw, in paint order, with the transform and style in effect for each. */
export const collectDrawItems = (root: SvgNode): DrawItem[] => {
  const items: DrawItem[] = [];
  const visit = (node: SvgNode, matrix: Matrix, parent: Style): void => {
    const own = multiply(matrix, parseTransform(node.attrs.transform));
    const style = applyStyle(parent, node.attrs);
    const number = (name: string, fallback = 0): number => (node.attrs[name] === undefined ? fallback : Number(node.attrs[name]) || fallback);
    switch (node.tag) {
      case 'rect':
        items.push({ kind: 'shape', shape: { segments: rectSegments(number('x'), number('y'), number('width'), number('height'), number('rx', number('ry')), number('ry', number('rx'))), style, matrix: own, open: false } });
        return;
      case 'circle':
        items.push({ kind: 'shape', shape: { segments: circleSegments(number('cx'), number('cy'), number('r')), style, matrix: own, open: false } });
        return;
      case 'line':
        items.push({ kind: 'shape', shape: { segments: [{ kind: 'M', x: number('x1'), y: number('y1') }, { kind: 'L', x: number('x2'), y: number('y2') }], style, matrix: own, open: true } });
        return;
      case 'polyline':
        items.push({ kind: 'shape', shape: { segments: polylineSegments(node.attrs.points ?? '', false), style, matrix: own, open: true } });
        return;
      case 'polygon':
        items.push({ kind: 'shape', shape: { segments: polylineSegments(node.attrs.points ?? '', true), style, matrix: own, open: false } });
        return;
      case 'path':
        items.push({ kind: 'shape', shape: { segments: parsePath(node.attrs.d ?? ''), style, matrix: own, open: false } });
        return;
      case 'text':
        if (node.text.trim() !== '') items.push({ kind: 'text', text: { text: node.text, x: number('x'), y: number('y'), style, matrix: own } });
        return;
      default:
        for (const child of node.children) visit(child, own, style);
    }
  };
  visit(root, IDENTITY, DEFAULT_STYLE);
  return items;
};

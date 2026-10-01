import { describe, expect, it } from 'vitest';
import {
  applyToPoint,
  arcToCubics,
  collectDrawItems,
  multiply,
  parseColor,
  parsePath,
  parseSvg,
  parseTransform,
  scaleOf,
  unescapeXml,
  type DrawItem,
  type DrawShape,
} from '../../src/tools/logic/svg-subset';

const shapes = (items: readonly DrawItem[]): DrawShape[] => items.flatMap((item) => (item.kind === 'shape' ? [item.shape] : []));

describe('SVG reader: XML', () => {
  it('reads elements, attributes, text and nesting', () => {
    const root = parseSvg('<?xml version="1.0"?><!-- a comment --><svg width="10" height="20"><g id="a"><rect x="1" y="2" width="3" height="4"/><text x="5">Hi &amp; bye</text></g></svg>');
    expect(root.tag).toBe('svg');
    expect(root.attrs.width).toBe('10');
    const group = root.children[0]!;
    expect(group.tag).toBe('g');
    expect(group.children.map((child) => child.tag)).toEqual(['rect', 'text']);
    expect(group.children[1]!.text).toBe('Hi & bye');
  });

  it('decodes character references and leaves unknown entities alone', () => {
    expect(unescapeXml('&lt;a&gt; &quot;b&quot; &#65;&#x42; &bogus;')).toBe('<a> "b" AB &bogus;');
  });

  it('never throws on malformed input', () => {
    expect(() => parseSvg('<svg><g><rect')).not.toThrow();
    expect(() => parseSvg('</g></g></svg>')).not.toThrow();
    expect(parseSvg('').tag).toBe('#root');
  });
});

describe('SVG reader: transforms', () => {
  it('composes translate, rotate and scale left to right like SVG', () => {
    const matrix = parseTransform('translate(10,20) rotate(90) scale(2,1)');
    // scale first (1,0)->(2,0), then rotate 90 -> (0,2), then translate -> (10,22).
    const [x, y] = applyToPoint(matrix, 1, 0);
    expect(x).toBeCloseTo(10, 9);
    expect(y).toBeCloseTo(22, 9);
  });

  it('rotates about a center point', () => {
    const [x, y] = applyToPoint(parseTransform('rotate(180,5,5)'), 0, 0);
    expect(x).toBeCloseTo(10, 9);
    expect(y).toBeCloseTo(10, 9);
  });

  it('reads matrix(), tolerates nothing at all, and measures scale', () => {
    expect(parseTransform('matrix(1 0 0 1 3 4)')).toEqual([1, 0, 0, 1, 3, 4]);
    expect(parseTransform(undefined)).toEqual([1, 0, 0, 1, 0, 0]);
    expect(scaleOf(parseTransform('scale(3)'))).toBeCloseTo(3, 9);
    expect(scaleOf(parseTransform('rotate(45) scale(2,2)'))).toBeCloseTo(2, 9);
  });

  it('multiplies with the inner transform applied first', () => {
    const combined = multiply([1, 0, 0, 1, 10, 0], [2, 0, 0, 2, 0, 0]);
    expect(applyToPoint(combined, 1, 1)).toEqual([12, 2]);
  });
});

describe('SVG reader: paths', () => {
  it('reads absolute lines, H and V, and close', () => {
    expect(parsePath('M0,0 H10 V5 L0,5 Z')).toEqual([
      { kind: 'M', x: 0, y: 0 },
      { kind: 'L', x: 10, y: 0 },
      { kind: 'L', x: 10, y: 5 },
      { kind: 'L', x: 0, y: 5 },
      { kind: 'Z' },
    ]);
  });

  it('reads relative commands and repeated coordinate pairs', () => {
    expect(parsePath('m1 1 l2 0 0 3')).toEqual([
      { kind: 'M', x: 1, y: 1 },
      { kind: 'L', x: 3, y: 1 },
      { kind: 'L', x: 3, y: 4 },
    ]);
  });

  it('turns a quadratic curve into the equivalent cubic', () => {
    const [, curve] = parsePath('M0,0 Q6,0 6,6');
    expect(curve).toEqual({ kind: 'C', x1: 4, y1: 0, x2: 6, y2: 2, x: 6, y: 6 });
  });

  it('reads negative numbers written without separators', () => {
    expect(parsePath('M10-5L-3-4')).toEqual([{ kind: 'M', x: 10, y: -5 }, { kind: 'L', x: -3, y: -4 }]);
  });

  it('converts an arc into cubics that end at the target and stay on the circle', () => {
    // The gate body's half circle: from (0,0) to (0,20) with radius 10.
    const segments = arcToCubics(0, 0, 10, 10, 0, false, true, 0, 20);
    expect(segments.length).toBe(2);
    const last = segments[segments.length - 1]!;
    expect(last).toMatchObject({ kind: 'C', x: 0, y: 20 });
    // The midpoint of the arc is where the first cubic ends: the far side of the circle, at (10,10).
    const first = segments[0]! as Extract<(typeof segments)[number], { kind: 'C' }>;
    expect(first.x).toBeCloseTo(10, 6);
    expect(first.y).toBeCloseTo(10, 6);
  });

  it('draws a straight line for a zero-radius or zero-length arc', () => {
    expect(arcToCubics(0, 0, 0, 5, 0, false, true, 4, 4)).toEqual([{ kind: 'L', x: 4, y: 4 }]);
    expect(arcToCubics(3, 3, 5, 5, 0, false, true, 3, 3)).toEqual([{ kind: 'L', x: 3, y: 3 }]);
  });

  it('scales a too-small radius up so the arc still reaches its end', () => {
    const segments = arcToCubics(0, 0, 1, 1, 0, false, true, 20, 0);
    const last = segments[segments.length - 1]!;
    expect(last).toMatchObject({ x: 20, y: 0 });
  });
});

describe('SVG reader: drawing items', () => {
  const svg = `<svg width="100" height="100">
    <rect x="0" y="0" width="100" height="100" fill="#ffffff" />
    <g fill="#1f2933" font-size="12" transform="translate(5,6)">
      <polyline points="0,0 10,0 10,10" fill="none" stroke="#000" stroke-width="2" />
      <circle cx="3" cy="3" r="2" fill="none" stroke="#f00" />
      <text x="1" y="2" text-anchor="middle" font-weight="700">Label</text>
      <text x="0" y="0">   </text>
    </g>
  </svg>`;
  const items = collectDrawItems(parseSvg(svg));

  it('lists shapes and text in paint order with the transform in effect', () => {
    expect(items.map((item) => item.kind)).toEqual(['shape', 'shape', 'shape', 'text']);
    const polyline = shapes(items)[1]!;
    expect(polyline.open).toBe(true);
    expect(applyToPoint(polyline.matrix, 0, 0)).toEqual([5, 6]);
    expect(polyline.style.strokeWidth).toBe(2);
    expect(polyline.style.fill).toBeUndefined();
  });

  it('inherits text style from the enclosing group and skips blank text', () => {
    const text = items.find((item) => item.kind === 'text');
    expect(text?.kind === 'text' && text.text).toMatchObject({ text: 'Label', x: 1, y: 2 });
    if (text?.kind === 'text') {
      expect(text.text.style).toMatchObject({ fontSize: 12, bold: true, anchor: 'middle', fill: '#1f2933' });
    }
  });

  it('gives a circle four curves and a rounded rectangle its corners', () => {
    const circle = shapes(items)[2]!;
    expect(circle.segments.filter((segment) => segment.kind === 'C')).toHaveLength(4);
    const rounded = shapes(collectDrawItems(parseSvg('<svg><rect x="0" y="0" width="20" height="10" rx="4" /></svg>')))[0]!;
    expect(rounded.segments.filter((segment) => segment.kind === 'C')).toHaveLength(4);
  });

  it('ignores elements it does not know', () => {
    expect(collectDrawItems(parseSvg('<svg><foreignObject><rect width="1" height="1"/></foreignObject><image href="x"/></svg>'))).toHaveLength(1);
  });
});

describe('SVG reader: colors', () => {
  it('reads #rgb and #rrggbb', () => {
    expect(parseColor('#fff')).toEqual([1, 1, 1]);
    expect(parseColor('#000000')).toEqual([0, 0, 0]);
    expect(parseColor('#ff8000')![1]).toBeCloseTo(128 / 255, 9);
  });

  it('returns undefined for anything else', () => {
    expect(parseColor('none')).toBeUndefined();
    expect(parseColor('red')).toBeUndefined();
    expect(parseColor('#12')).toBeUndefined();
    expect(parseColor(undefined)).toBeUndefined();
  });
});

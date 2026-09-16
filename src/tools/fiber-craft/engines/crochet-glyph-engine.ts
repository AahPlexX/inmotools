import { getCrochetSymbol } from './symbol-library';

export interface GlyphPoint {
  readonly x: number;
  readonly y: number;
}

export type CrochetGlyphPrimitive =
  | { readonly kind: 'line'; readonly x1: number; readonly y1: number; readonly x2: number; readonly y2: number }
  | { readonly kind: 'ellipse'; readonly cx: number; readonly cy: number; readonly rx: number; readonly ry: number; readonly filled?: boolean }
  | { readonly kind: 'circle'; readonly cx: number; readonly cy: number; readonly r: number; readonly filled?: boolean }
  | { readonly kind: 'polyline'; readonly points: readonly GlyphPoint[]; readonly closed?: boolean }
  | { readonly kind: 'arc'; readonly cx: number; readonly cy: number; readonly r: number; readonly startAngle: number; readonly endAngle: number; readonly anticlockwise?: boolean };

const line = (x1: number, y1: number, x2: number, y2: number): CrochetGlyphPrimitive => ({
  kind: 'line', x1, y1, x2, y2,
});

const tallStitch = (diagonalBars: number): readonly CrochetGlyphPrimitive[] => {
  const primitives: CrochetGlyphPrimitive[] = [
    line(0, 0.82, 0, -0.74),
    line(-0.48, -0.58, 0.48, -0.58),
  ];
  for (let index = 0; index < diagonalBars; index += 1) {
    const y = 0.18 - index * 0.28;
    primitives.push(line(-0.34, y + 0.16, 0.34, y - 0.16));
  }
  return primitives;
};

export function crochetGlyphPrimitives(symbolId: string): readonly CrochetGlyphPrimitive[] {
  const { glyph } = getCrochetSymbol(symbolId);

  switch (glyph) {
    case 'oval':
      return [{ kind: 'ellipse', cx: 0, cy: 0, rx: 0.72, ry: 0.32 }];
    case 'dot':
      return [{ kind: 'circle', cx: 0, cy: 0, r: 0.23, filled: true }];
    case 'cross':
      return [line(-0.58, -0.58, 0.58, 0.58), line(0.58, -0.58, -0.58, 0.58)];
    case 't-bar-1':
      return tallStitch(0);
    case 't-bar-2':
      return tallStitch(1);
    case 't-bar-3':
      return tallStitch(2);
    case 't-bar-4':
      return tallStitch(3);
    case 'post-front':
      return [
        ...tallStitch(1),
        { kind: 'arc', cx: -0.18, cy: 0.36, r: 0.42, startAngle: Math.PI * 0.55, endAngle: Math.PI * 1.45 },
      ];
    case 'post-back':
      return [
        ...tallStitch(1),
        { kind: 'arc', cx: 0.18, cy: 0.36, r: 0.42, startAngle: Math.PI * 1.55, endAngle: Math.PI * 0.45, anticlockwise: true },
      ];
    case 'picot':
      return [
        { kind: 'circle', cx: 0, cy: -0.38, r: 0.34 },
        line(-0.22, -0.1, -0.5, 0.62),
        line(0.22, -0.1, 0.5, 0.62),
      ];
    case 'cluster':
      return [
        line(-0.5, -0.56, 0, 0.72),
        line(0, -0.72, 0, 0.72),
        line(0.5, -0.56, 0, 0.72),
        line(-0.55, -0.56, 0.55, -0.56),
      ];
    case 'puff':
      return [
        { kind: 'ellipse', cx: -0.28, cy: 0, rx: 0.3, ry: 0.72 },
        { kind: 'ellipse', cx: 0, cy: -0.04, rx: 0.34, ry: 0.78 },
        { kind: 'ellipse', cx: 0.28, cy: 0, rx: 0.3, ry: 0.72 },
      ];
    case 'popcorn':
      return [
        { kind: 'circle', cx: 0, cy: -0.04, r: 0.66 },
        line(-0.52, -0.44, 0, 0.72),
        line(-0.26, -0.64, 0, 0.72),
        line(0, -0.7, 0, 0.72),
        line(0.26, -0.64, 0, 0.72),
        line(0.52, -0.44, 0, 0.72),
      ];
    case 'decrease':
      return [
        line(-0.55, 0.7, 0, -0.66),
        line(0.55, 0.7, 0, -0.66),
        line(-0.22, -0.5, 0.22, -0.5),
      ];
    default: {
      const unreachable: never = glyph;
      return unreachable;
    }
  }
}

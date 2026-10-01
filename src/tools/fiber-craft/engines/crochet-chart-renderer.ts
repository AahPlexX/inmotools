import { crochetGlyphPrimitives, type CrochetGlyphModifiers, type CrochetGlyphPrimitive } from './crochet-glyph-engine';
import { polarNodeToCartesian } from './geometry-engine';
import type { ColorSlot, GridChart, PolarChart, PolarStitchNode } from '../fiber-craft-types';

export type CrochetChartTheme = 'light' | 'dark-room' | 'high-contrast';
export type CrochetPngScale = 1 | 2 | 3 | 4;

export const CROCHET_EXPORT_BASE_WIDTH = 960;
export const CROCHET_EXPORT_BASE_HEIGHT = 720;

export interface CrochetChartRenderOptions {
  readonly width: number;
  readonly height: number;
  readonly theme?: CrochetChartTheme;
  readonly activeRound?: number;
  readonly completedSteps?: readonly string[];
  readonly showProgress?: boolean;
  /** Round chart only: the stitch position that has keyboard/pointer focus. */
  readonly selectedNode?: { readonly round: number; readonly angleIndex: number } | null;
}

const THEME_COLORS: Record<CrochetChartTheme, {
  readonly background: string;
  readonly emptyFill: string;
  readonly ring: string;
  readonly active: string;
  readonly complete: string;
  readonly emptyStroke: string;
  readonly gridStroke: string;
  readonly filledFallback: string;
}> = {
  light: {
    background: '#fbfcfd', emptyFill: '#ffffff', ring: '#d7dde3', active: '#205bd6',
    complete: '#087a55', emptyStroke: '#aeb8c2', gridStroke: '#6f7c88', filledFallback: '#205bd6',
  },
  'dark-room': {
    background: '#090e13', emptyFill: '#111820', ring: '#667787', active: '#9fc2ff',
    complete: '#85e6b9', emptyStroke: '#8b9ba9', gridStroke: '#aab7c2', filledFallback: '#9fc2ff',
  },
  'high-contrast': {
    background: '#ffffff', emptyFill: '#ffffff', ring: '#000000', active: '#000000',
    complete: '#000000', emptyStroke: '#000000', gridStroke: '#000000', filledFallback: '#000000',
  },
};

export function crochetPngDimensions(scale: number): { readonly width: number; readonly height: number } {
  if (!Number.isInteger(scale) || scale < 1 || scale > 4) {
    throw new Error('PNG scale must be an integer from 1 to 4.');
  }
  return { width: CROCHET_EXPORT_BASE_WIDTH * scale, height: CROCHET_EXPORT_BASE_HEIGHT * scale };
}

const glyphInkForSwatch = (hex: string | undefined): string => {
  if (!hex) return '#101820';
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return '#101820';
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  return (red * 299 + green * 587 + blue * 114) / 1000 >= 150 ? '#101820' : '#ffffff';
};

const drawGlyphPrimitive = (context: CanvasRenderingContext2D, primitive: CrochetGlyphPrimitive): void => {
  context.beginPath();
  switch (primitive.kind) {
    case 'line':
      context.moveTo(primitive.x1, primitive.y1);
      context.lineTo(primitive.x2, primitive.y2);
      context.stroke();
      return;
    case 'ellipse':
      context.ellipse(primitive.cx, primitive.cy, primitive.rx, primitive.ry, 0, 0, Math.PI * 2);
      primitive.filled ? context.fill() : context.stroke();
      return;
    case 'circle':
      context.arc(primitive.cx, primitive.cy, primitive.r, 0, Math.PI * 2);
      primitive.filled ? context.fill() : context.stroke();
      return;
    case 'arc':
      context.arc(primitive.cx, primitive.cy, primitive.r, primitive.startAngle, primitive.endAngle, primitive.anticlockwise);
      context.stroke();
      return;
    case 'polyline':
      if (primitive.points.length === 0) return;
      context.moveTo(primitive.points[0].x, primitive.points[0].y);
      for (const point of primitive.points.slice(1)) context.lineTo(point.x, point.y);
      if (primitive.closed) context.closePath();
      context.stroke();
      return;
  }
};

const drawCrochetGlyph = (
  context: CanvasRenderingContext2D,
  symbolId: string,
  x: number,
  y: number,
  size: number,
  rotation: number,
  ink: string,
  modifiers: CrochetGlyphModifiers = {},
): void => {
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  context.scale(size, size);
  context.strokeStyle = ink;
  context.fillStyle = ink;
  context.lineWidth = 0.12;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  for (const primitive of crochetGlyphPrimitives(symbolId, modifiers)) drawGlyphPrimitive(context, primitive);
  context.restore();
};

interface PolarLayout {
  readonly centerX: number;
  readonly centerY: number;
  readonly spacing: number;
  readonly nodeRadius: number;
  readonly pixelScale: number;
}

/** One source of truth for round-chart geometry so drawing and pointer hit-testing cannot drift apart. */
const polarLayout = (chart: PolarChart, width: number, height: number): PolarLayout => {
  const pixelScale = Math.min(width / CROCHET_EXPORT_BASE_WIDTH, height / CROCHET_EXPORT_BASE_HEIGHT);
  const padding = 24 * pixelScale;
  const spacing = Math.min(width - padding * 2, height - padding * 2) / (2 * (Math.max(chart.rounds, 1) + 1));
  const nodeRadius = Math.max(10 * pixelScale, Math.min(20 * pixelScale, spacing * 0.3));
  return { centerX: width / 2, centerY: height / 2, spacing, nodeRadius, pixelScale };
};

/**
 * Finds the stitch position under a canvas-space point. Points within a stitch circle (plus a small
 * touch allowance) select it; when circles overlap on a crowded round the nearest centre wins.
 */
export const hitTestPolarNode = (
  chart: PolarChart,
  width: number,
  height: number,
  x: number,
  y: number,
): { readonly round: number; readonly angleIndex: number } | null => {
  const layout = polarLayout(chart, width, height);
  const allowance = layout.nodeRadius + 6 * layout.pixelScale;
  let best: { readonly round: number; readonly angleIndex: number; readonly distance: number } | null = null;
  for (const node of chart.nodes) {
    const point = polarNodeToCartesian(node, layout.spacing);
    const distance = Math.hypot(layout.centerX + point.x - x, layout.centerY + point.y - y);
    if (distance <= allowance && (best === null || distance < best.distance)) {
      best = { round: node.round, angleIndex: node.angleIndex, distance };
    }
  }
  return best ? { round: best.round, angleIndex: best.angleIndex } : null;
};

const glyphModifiers = (node: PolarStitchNode): CrochetGlyphModifiers => ({ loop: node.loop ?? null });

const renderPolarChart = (
  context: CanvasRenderingContext2D,
  chart: PolarChart,
  palette: readonly ColorSlot[],
  options: CrochetChartRenderOptions,
): void => {
  const theme = options.theme ?? 'light';
  const colors = THEME_COLORS[theme];
  const { centerX, centerY, spacing, nodeRadius, pixelScale } = polarLayout(chart, options.width, options.height);
  const completed = new Set(options.completedSteps ?? []);
  const showProgress = options.showProgress ?? false;

  for (let round = 0; round < chart.rounds; round += 1) {
    const isComplete = showProgress && completed.has(`round:${round}`);
    const isActive = showProgress && round === options.activeRound;
    context.beginPath();
    context.arc(centerX, centerY, (round + 1) * spacing, 0, Math.PI * 2);
    context.lineWidth = (isActive ? 5 : isComplete ? 3 : 2) * pixelScale;
    context.strokeStyle = isActive ? colors.active : isComplete ? colors.complete : colors.ring;
    context.setLineDash(isComplete ? [10 * pixelScale, 6 * pixelScale] : []);
    context.stroke();
  }
  context.setLineDash([]);

  // Increase legs: a stitch worked into the same base as the previous position is joined to it so the
  // shared base reads on the chart itself, not only in the written pattern.
  const nodeAt = new Map(chart.nodes.map((node) => [`${node.round}:${node.angleIndex}`, node]));
  for (const node of chart.nodes) {
    if (!node.sharedBase || node.angleIndex === 0) continue;
    const previous = nodeAt.get(`${node.round}:${node.angleIndex - 1}`);
    if (!previous) continue;
    const from = polarNodeToCartesian(previous, spacing);
    const to = polarNodeToCartesian(node, spacing);
    context.beginPath();
    context.moveTo(centerX + from.x, centerY + from.y);
    context.lineTo(centerX + to.x, centerY + to.y);
    context.lineWidth = 4 * pixelScale;
    context.strokeStyle = theme === 'high-contrast' ? '#000000' : colors.active;
    context.stroke();
  }

  for (const node of chart.nodes) {
    const point = polarNodeToCartesian(node, spacing);
    const x = centerX + point.x;
    const y = centerY + point.y;
    const swatch = node.colorId ? palette.find((color) => color.id === node.colorId) : undefined;
    const fill = theme === 'high-contrast' ? colors.emptyFill : swatch?.hex ?? colors.emptyFill;
    const ink = theme === 'high-contrast' ? '#000000' : glyphInkForSwatch(fill);
    context.beginPath();
    context.arc(x, y, nodeRadius, 0, Math.PI * 2);
    context.fillStyle = fill;
    context.fill();
    context.lineWidth = 2 * pixelScale;
    context.strokeStyle = node.symbolId ? ink : colors.emptyStroke;
    context.stroke();
    if (node.symbolId) {
      const angle = (2 * Math.PI * node.angleIndex) / node.stitchesInRound;
      drawCrochetGlyph(context, node.symbolId, x, y, nodeRadius * 0.82, angle + Math.PI / 2, ink, glyphModifiers(node));
    }
  }

  const selected = options.selectedNode;
  const selectedNode = selected ? nodeAt.get(`${selected.round}:${selected.angleIndex}`) : undefined;
  if (selectedNode) {
    const point = polarNodeToCartesian(selectedNode, spacing);
    context.beginPath();
    context.arc(centerX + point.x, centerY + point.y, nodeRadius + 5 * pixelScale, 0, Math.PI * 2);
    context.lineWidth = 3.5 * pixelScale;
    context.strokeStyle = colors.active;
    context.setLineDash([]);
    context.stroke();
  }
};

const renderGridChart = (
  context: CanvasRenderingContext2D,
  chart: GridChart,
  palette: readonly ColorSlot[],
  options: CrochetChartRenderOptions,
): void => {
  const theme = options.theme ?? 'light';
  const colors = THEME_COLORS[theme];
  const pixelScale = Math.min(options.width / CROCHET_EXPORT_BASE_WIDTH, options.height / CROCHET_EXPORT_BASE_HEIGHT);
  const padding = 42 * pixelScale;
  const availableWidth = Math.max(1, options.width - padding * 2);
  const availableHeight = Math.max(1, options.height - padding * 2);
  const cellSize = Math.max(1, Math.min(availableWidth / chart.cols, availableHeight / chart.rows));
  const gridWidth = chart.cols * cellSize;
  const gridHeight = chart.rows * cellSize;
  const originX = (options.width - gridWidth) / 2;
  const originY = (options.height - gridHeight) / 2;
  const paletteById = new Map(palette.map((color) => [color.id, color]));

  for (const cell of chart.cells) {
    const filled = cell.colorId !== null || cell.symbolId !== null;
    const swatch = cell.colorId ? paletteById.get(cell.colorId) : undefined;
    const x = originX + cell.col * cellSize;
    const y = originY + cell.row * cellSize;
    context.beginPath();
    context.rect(x, y, cellSize, cellSize);
    context.fillStyle = filled
      ? theme === 'high-contrast' ? colors.filledFallback : swatch?.hex ?? colors.filledFallback
      : colors.emptyFill;
    context.fill();
    context.lineWidth = Math.max(1, pixelScale);
    context.strokeStyle = colors.gridStroke;
    context.stroke();
  }
};

export function renderCrochetChartCanvas(
  context: CanvasRenderingContext2D,
  chart: GridChart | PolarChart,
  palette: readonly ColorSlot[],
  options: CrochetChartRenderOptions,
): void {
  if (options.width <= 0 || options.height <= 0) throw new Error('Canvas dimensions must be positive.');
  const theme = options.theme ?? 'light';
  const colors = THEME_COLORS[theme];
  context.save();
  context.clearRect(0, 0, options.width, options.height);
  context.fillStyle = colors.background;
  context.fillRect(0, 0, options.width, options.height);
  context.imageSmoothingEnabled = false;
  if (chart.kind === 'polar') renderPolarChart(context, chart, palette, options);
  else renderGridChart(context, chart, palette, options);
  context.restore();
}

import {
  PDFDocument,
  StandardFonts,
  grayscale,
  radians,
  rgb,
  type PDFFont,
  type PDFPage,
  type RGB,
} from 'pdf-lib';
import { compileC2CRows, compileCrochetWrittenPattern, compileFiletRows } from './engines/crochet-pattern-engine';
import { crochetGlyphPrimitives, type CrochetGlyphPrimitive } from './engines/crochet-glyph-engine';
import { polarNodeToCartesian } from './engines/geometry-engine';
import { crochetSymbolLabel, type CrochetDialect } from './engines/symbol-library';
import { fiberCraftFilenameStem } from './project-bundle-engine';
import type { ColorSlot, FiberCraftDocument, GridChart, PolarChart } from './fiber-craft-types';

const LETTER_WIDTH = 612;
const LETTER_HEIGHT = 792;
const PAGE_MARGIN = 48;
const BLACK = grayscale(0);
const MUTED = grayscale(0.35);
const LIGHT_LINE = grayscale(0.78);

export interface CrochetPatternBookModel {
  readonly title: string;
  readonly author: string;
  readonly materials: readonly string[];
  readonly legend: readonly string[];
  readonly instructions: readonly string[];
}

const pdfSafeText = (value: string): string => value
  .replace(/[–—]/g, '-')
  .replace(/[·•]/g, '-')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\x20-\x7e]/g, '?');

const hexToRgb = (hex: string | undefined): RGB => {
  const match = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!match) return rgb(0.13, 0.36, 0.84);
  const value = Number.parseInt(match[1], 16);
  return rgb(((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255);
};

const contrastingInk = (hex: string | undefined) => {
  const match = /^#([0-9a-f]{6})$/i.exec(hex ?? '');
  if (!match) return BLACK;
  const value = Number.parseInt(match[1], 16);
  const red = (value >> 16) & 0xff;
  const green = (value >> 8) & 0xff;
  const blue = value & 0xff;
  return (red * 299 + green * 587 + blue * 114) / 1000 >= 150 ? BLACK : grayscale(1);
};

const wrapText = (font: PDFFont, text: string, size: number, maxWidth: number): readonly string[] => {
  const safe = pdfSafeText(text).trim();
  if (!safe) return [''];
  const words = safe.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !line) {
      line = candidate;
      continue;
    }
    lines.push(line);
    line = word;
  }
  if (line) lines.push(line);
  return lines;
};

const drawWrappedText = (
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  size: number,
  maxWidth: number,
  lineHeight = size * 1.35,
  color = BLACK,
): number => {
  for (const line of wrapText(font, text, size, maxWidth)) {
    page.drawText(line, { x, y, size, font, color });
    y -= lineHeight;
  }
  return y;
};

const usedPaletteIds = (document: FiberCraftDocument): Set<string> => {
  const ids = new Set<string>();
  if (document.chart.kind === 'polar') {
    for (const node of document.chart.nodes) if (node.colorId) ids.add(node.colorId);
  } else if (document.chart.kind === 'grid') {
    for (const cell of document.chart.cells) if (cell.colorId) ids.add(cell.colorId);
  }
  return ids;
};

export function buildCrochetPatternBookModel(
  document: FiberCraftDocument,
  dialect: CrochetDialect,
): CrochetPatternBookModel {
  if (document.metadata.discipline !== 'crochet' || (document.chart.kind !== 'polar' && document.chart.kind !== 'grid')) {
    throw new Error('Crochet pattern export requires a crochet round or grid chart.');
  }

  const materials = [
    `Project level: ${document.metadata.difficulty || 'Not recorded'}`,
    `Yarn / material: ${document.metadata.materialClass || 'Not recorded'}`,
    `Hook: ${document.metadata.toolSize || 'Not recorded'}`,
    document.gauge
      ? `Measured gauge: ${document.gauge.stitchCount} stitches and ${document.gauge.rowCount} rows over ${document.gauge.span} ${document.gauge.unit}`
      : 'Measured gauge: not recorded',
    `Techniques: ${document.metadata.techniqueTags.length > 0 ? document.metadata.techniqueTags.join(', ') : 'None recorded'}`,
  ];

  const paletteIds = usedPaletteIds(document);
  const legend = document.palette
    .filter((color) => paletteIds.size === 0 || paletteIds.has(color.id))
    .map((color) => `Color: ${color.label} (${color.hex.toUpperCase()})`);

  let instructions: readonly string[];
  if (document.chart.kind === 'polar') {
    const symbolIds = new Set(document.chart.nodes.flatMap((node) => node.symbolId ? [node.symbolId] : []));
    for (const symbolId of symbolIds) legend.push(`Stitch: ${crochetSymbolLabel(symbolId, dialect)}`);
    instructions = compileCrochetWrittenPattern(document, dialect).map((round) => round.text);
  } else {
    legend.push('Open mesh / block: unfilled square');
    legend.push('Filled mesh / block: palette-filled square');
    const filet = compileFiletRows(document.chart).map((row) => row.text);
    const c2c = compileC2CRows(document.chart).map((row) =>
      `C2C diagonal ${row.index + 1}: ${row.filledBlocks} filled of ${row.totalBlocks} ${row.totalBlocks === 1 ? 'block' : 'blocks'}.`);
    instructions = [...filet, ...c2c];
  }

  return {
    title: document.metadata.title || 'Untitled pattern',
    author: document.metadata.author,
    materials,
    legend,
    instructions,
  };
}

export const fiberCraftPatternPdfFilename = (title: string): string =>
  `${fiberCraftFilenameStem(title)}-pattern-book.pdf`;

export const fiberCraftPngFilename = (title: string, scale: number): string => {
  if (!Number.isInteger(scale) || scale < 1 || scale > 4) throw new Error('PNG scale must be an integer from 1 to 4.');
  return `${fiberCraftFilenameStem(title)}-${scale}x.png`;
};

interface PdfPoint { readonly x: number; readonly y: number }

const transformGlyphPoint = (
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  size: number,
  rotation: number,
): PdfPoint => {
  const localX = x * size;
  const localY = -y * size;
  const angle = -rotation;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: centerX + localX * cos - localY * sin,
    y: centerY + localX * sin + localY * cos,
  };
};

const drawPolyline = (
  page: PDFPage,
  points: readonly PdfPoint[],
  thickness: number,
  color: ReturnType<typeof grayscale>,
  closed = false,
): void => {
  if (points.length < 2) return;
  for (let index = 1; index < points.length; index += 1) {
    page.drawLine({ start: points[index - 1], end: points[index], thickness, color });
  }
  if (closed) page.drawLine({ start: points.at(-1)!, end: points[0], thickness, color });
};

const drawPdfGlyphPrimitive = (
  page: PDFPage,
  primitive: CrochetGlyphPrimitive,
  centerX: number,
  centerY: number,
  size: number,
  rotation: number,
  ink: ReturnType<typeof grayscale>,
): void => {
  const thickness = Math.max(0.7, size * 0.12);
  switch (primitive.kind) {
    case 'line': {
      page.drawLine({
        start: transformGlyphPoint(primitive.x1, primitive.y1, centerX, centerY, size, rotation),
        end: transformGlyphPoint(primitive.x2, primitive.y2, centerX, centerY, size, rotation),
        thickness,
        color: ink,
      });
      return;
    }
    case 'circle': {
      const center = transformGlyphPoint(primitive.cx, primitive.cy, centerX, centerY, size, rotation);
      page.drawCircle({
        x: center.x,
        y: center.y,
        size: primitive.r * size,
        borderWidth: primitive.filled ? 0 : thickness,
        borderColor: ink,
        color: primitive.filled ? ink : undefined,
      });
      return;
    }
    case 'ellipse': {
      const center = transformGlyphPoint(primitive.cx, primitive.cy, centerX, centerY, size, rotation);
      page.drawEllipse({
        x: center.x,
        y: center.y,
        xScale: primitive.rx * size,
        yScale: primitive.ry * size,
        rotate: radians(-rotation),
        borderWidth: primitive.filled ? 0 : thickness,
        borderColor: ink,
        color: primitive.filled ? ink : undefined,
      });
      return;
    }
    case 'polyline': {
      const points = primitive.points.map((point) => transformGlyphPoint(point.x, point.y, centerX, centerY, size, rotation));
      drawPolyline(page, points, thickness, ink, primitive.closed);
      return;
    }
    case 'arc': {
      let start = primitive.startAngle;
      let end = primitive.endAngle;
      if (primitive.anticlockwise) {
        if (end >= start) end -= Math.PI * 2;
      } else if (end <= start) {
        end += Math.PI * 2;
      }
      const steps = 16;
      const points = Array.from({ length: steps + 1 }, (_, index) => {
        const angle = start + (end - start) * (index / steps);
        return transformGlyphPoint(
          primitive.cx + Math.cos(angle) * primitive.r,
          primitive.cy + Math.sin(angle) * primitive.r,
          centerX,
          centerY,
          size,
          rotation,
        );
      });
      drawPolyline(page, points, thickness, ink);
      return;
    }
  }
};

const drawPolarPdfDiagram = (
  page: PDFPage,
  chart: PolarChart,
  palette: readonly ColorSlot[],
  x: number,
  y: number,
  width: number,
  height: number,
): void => {
  const centerX = x + width / 2;
  const centerY = y + height / 2;
  const spacing = Math.min(width, height) / (2 * (Math.max(chart.rounds, 1) + 1));
  const nodeRadius = Math.max(4, Math.min(10, spacing * 0.3));

  for (let round = 0; round < chart.rounds; round += 1) {
    page.drawCircle({ x: centerX, y: centerY, size: (round + 1) * spacing, borderWidth: 1, borderColor: LIGHT_LINE });
  }
  for (const node of chart.nodes) {
    const point = polarNodeToCartesian(node, spacing);
    const nodeX = centerX + point.x;
    const nodeY = centerY - point.y;
    const swatch = node.colorId ? palette.find((color) => color.id === node.colorId) : undefined;
    const fill = swatch ? hexToRgb(swatch.hex) : rgb(1, 1, 1);
    const ink = contrastingInk(swatch?.hex);
    page.drawCircle({ x: nodeX, y: nodeY, size: nodeRadius, color: fill, borderWidth: 0.8, borderColor: node.symbolId ? ink : grayscale(0.55) });
    if (!node.symbolId) continue;
    const rotation = (2 * Math.PI * node.angleIndex) / node.stitchesInRound + Math.PI / 2;
    for (const primitive of crochetGlyphPrimitives(node.symbolId)) {
      drawPdfGlyphPrimitive(page, primitive, nodeX, nodeY, nodeRadius * 0.82, rotation, ink);
    }
  }
};

const drawGridPdfDiagram = (
  page: PDFPage,
  chart: GridChart,
  palette: readonly ColorSlot[],
  x: number,
  y: number,
  width: number,
  height: number,
): void => {
  const cellSize = Math.min(width / chart.cols, height / chart.rows);
  const gridWidth = chart.cols * cellSize;
  const gridHeight = chart.rows * cellSize;
  const originX = x + (width - gridWidth) / 2;
  const originY = y + (height - gridHeight) / 2;
  const paletteById = new Map(palette.map((color) => [color.id, color]));

  for (const cell of chart.cells) {
    const swatch = cell.colorId ? paletteById.get(cell.colorId) : undefined;
    const filled = cell.colorId !== null || cell.symbolId !== null;
    page.drawRectangle({
      x: originX + cell.col * cellSize,
      y: originY + (chart.rows - cell.row - 1) * cellSize,
      width: cellSize,
      height: cellSize,
      color: filled ? hexToRgb(swatch?.hex) : rgb(1, 1, 1),
      borderWidth: 0.45,
      borderColor: BLACK,
    });
  }
};

const drawPatternDiagram = (
  page: PDFPage,
  document: FiberCraftDocument,
  x: number,
  y: number,
  width: number,
  height: number,
): void => {
  if (document.chart.kind === 'polar') drawPolarPdfDiagram(page, document.chart, document.palette, x, y, width, height);
  else if (document.chart.kind === 'grid') drawGridPdfDiagram(page, document.chart, document.palette, x, y, width, height);
  else throw new Error('Crochet pattern export requires a crochet round or grid chart.');
};

export async function buildCrochetPatternPdf(
  document: FiberCraftDocument,
  dialect: CrochetDialect,
): Promise<Uint8Array> {
  const model = buildCrochetPatternBookModel(document, dialect);
  const pdf = await PDFDocument.create();
  const bodyFont = await pdf.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdf.embedFont(StandardFonts.HelveticaBold);

  pdf.setTitle(document.metadata.title || 'Untitled pattern', { showInWindowTitleBar: true });
  if (document.metadata.author) pdf.setAuthor(document.metadata.author);
  pdf.setSubject('InmoTools Fiber Craft crochet pattern book');
  pdf.setKeywords(['crochet', document.metadata.difficulty, ...document.metadata.techniqueTags].filter(Boolean));
  pdf.setCreator('InmoTools Fiber Craft Workstation');
  pdf.setProducer('InmoTools Fiber Craft Workstation');
  pdf.setLanguage('en-US');

  const cover = pdf.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  cover.drawText('FIBER CRAFT PATTERN BOOK', { x: PAGE_MARGIN, y: 718, size: 12, font: boldFont, color: MUTED });
  let y = drawWrappedText(cover, boldFont, model.title, PAGE_MARGIN, 654, 30, LETTER_WIDTH - PAGE_MARGIN * 2, 36);
  if (model.author) y = drawWrappedText(cover, bodyFont, `by ${model.author}`, PAGE_MARGIN, y - 6, 14, LETTER_WIDTH - PAGE_MARGIN * 2, 20, MUTED);
  y -= 28;
  y = drawWrappedText(cover, bodyFont, `Craft: Crochet`, PAGE_MARGIN, y, 12, LETTER_WIDTH - PAGE_MARGIN * 2, 18);
  y = drawWrappedText(cover, bodyFont, `Project level: ${document.metadata.difficulty || 'Not recorded'}`, PAGE_MARGIN, y, 12, LETTER_WIDTH - PAGE_MARGIN * 2, 18);
  drawWrappedText(cover, bodyFont, `Techniques: ${document.metadata.techniqueTags.join(', ') || 'None recorded'}`, PAGE_MARGIN, y, 12, LETTER_WIDTH - PAGE_MARGIN * 2, 18);

  const reference = pdf.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  reference.drawText('Materials & legend', { x: PAGE_MARGIN, y: 730, size: 22, font: boldFont, color: BLACK });
  let referenceY = 690;
  reference.drawText('Materials', { x: PAGE_MARGIN, y: referenceY, size: 14, font: boldFont, color: BLACK });
  referenceY -= 24;
  for (const line of model.materials) referenceY = drawWrappedText(reference, bodyFont, `• ${line}`, PAGE_MARGIN, referenceY, 11, LETTER_WIDTH - PAGE_MARGIN * 2, 16, MUTED);
  referenceY -= 14;
  reference.drawText('Legend', { x: PAGE_MARGIN, y: referenceY, size: 14, font: boldFont, color: BLACK });
  referenceY -= 24;
  for (const line of model.legend) referenceY = drawWrappedText(reference, bodyFont, `• ${line}`, PAGE_MARGIN, referenceY, 11, LETTER_WIDTH - PAGE_MARGIN * 2, 16, MUTED);

  const diagram = pdf.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  diagram.drawText('Full pattern diagram', { x: PAGE_MARGIN, y: 742, size: 20, font: boldFont, color: BLACK });
  drawPatternDiagram(diagram, document, PAGE_MARGIN, 70, LETTER_WIDTH - PAGE_MARGIN * 2, 640);

  let instructionsPage = pdf.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
  instructionsPage.drawText('Written instructions', { x: PAGE_MARGIN, y: 742, size: 20, font: boldFont, color: BLACK });
  let instructionY = 708;
  for (const instruction of model.instructions) {
    const lines = wrapText(bodyFont, instruction, 10.5, LETTER_WIDTH - PAGE_MARGIN * 2);
    const requiredHeight = lines.length * 15 + 8;
    if (instructionY - requiredHeight < PAGE_MARGIN) {
      instructionsPage = pdf.addPage([LETTER_WIDTH, LETTER_HEIGHT]);
      instructionsPage.drawText('Written instructions (continued)', { x: PAGE_MARGIN, y: 742, size: 18, font: boldFont, color: BLACK });
      instructionY = 708;
    }
    instructionY = drawWrappedText(instructionsPage, bodyFont, instruction, PAGE_MARGIN, instructionY, 10.5, LETTER_WIDTH - PAGE_MARGIN * 2, 15, BLACK) - 8;
  }

  return pdf.save();
}

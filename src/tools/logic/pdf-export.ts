import {
  appendBezierCurve,
  closePath,
  degrees,
  fill,
  fillAndStroke,
  LineCapStyle,
  LineJoinStyle,
  lineTo,
  moveTo,
  PageSizes,
  PDFDocument,
  popGraphicsState,
  pushGraphicsState,
  setFillingRgbColor,
  setLineCap,
  setLineJoin,
  setLineWidth,
  setStrokingRgbColor,
  StandardFonts,
  stroke,
  rgb,
  type PDFFont,
  type PDFPage,
} from 'pdf-lib';
import { renderSchematicSvg } from './export-engine';
import { applyToPoint, collectDrawItems, parseColor, parseSvg, scaleOf, type DrawShape, type DrawText, type Matrix } from './svg-subset';
import type { LogicDocument } from './logic-types';

/**
 * The schematic as a one-page vector PDF: the drawing sheet with its lettered
 * border, the title block, every part with its reference designator, and the
 * name of each named net. It is the same drawing as the SVG export (that SVG is
 * read back through `svg-subset.ts`), so the two can never disagree.
 */

export type PaperSize = 'a4' | 'a3' | 'letter';
export type PaperOrientation = 'auto' | 'portrait' | 'landscape';

export interface PdfExportOptions {
  readonly paper?: PaperSize;
  /** `auto` picks landscape for a wide schematic and portrait for a tall one. */
  readonly orientation?: PaperOrientation;
  /** Written as the PDF's creation and modification date; today when omitted. */
  readonly date?: Date;
}

const PAPER: Readonly<Record<PaperSize, readonly [number, number]>> = { a4: PageSizes.A4, a3: PageSizes.A3, letter: PageSizes.Letter };

/** Space kept blank between the sheet and the paper's edge, in PDF points (1/72 inch). */
const PAGE_MARGIN = 20;

/** A schematic is never enlarged past this, so a two-gate circuit does not become a poster. */
const MAX_SCALE = 2;

/** Stand-ins for characters that the built-in PDF fonts cannot show, so a part's icon still leaves a mark. */
const REPLACEMENTS: Readonly<Record<string, string>> = { '▦': '#', '⊕': '+', '∑': 'S', '≥': '>=', '≤': '<=', '⏱': 'T', '⚡': '*', '▶': '>', '∿': '~', '−': '-', '→': '>', '←': '<' };

/** Text the font can draw: every character it has stays, known symbols become their ASCII stand-in, the rest become `?`. */
export const pdfSafeText = (text: string, supported: ReadonlySet<number>): string => {
  let out = '';
  for (const character of text) {
    const code = character.codePointAt(0)!;
    if (supported.has(code)) out += character;
    else out += REPLACEMENTS[character] ?? '?';
  }
  return out;
};

/** Portrait or landscape page dimensions for the chosen paper and the sheet's own shape. */
export const pageSizeFor = (paper: PaperSize, orientation: PaperOrientation, sheetWidth: number, sheetHeight: number): [number, number] => {
  const [shortSide, longSide] = PAPER[paper];
  const landscape = orientation === 'landscape' || (orientation === 'auto' && sheetWidth >= sheetHeight);
  return landscape ? [longSide, shortSide] : [shortSide, longSide];
};

interface Placement {
  /** Sheet units to points. */
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly pageHeight: number;
}

/** The sheet, scaled to fit inside the margins and centered on the page. */
export const placeSheet = (pageWidth: number, pageHeight: number, sheetWidth: number, sheetHeight: number): Placement => {
  const scale = Math.min((pageWidth - PAGE_MARGIN * 2) / sheetWidth, (pageHeight - PAGE_MARGIN * 2) / sheetHeight, MAX_SCALE);
  return { scale, offsetX: (pageWidth - sheetWidth * scale) / 2, offsetY: (pageHeight - sheetHeight * scale) / 2, pageHeight };
};

const toPage = (placement: Placement, matrix: Matrix, x: number, y: number): [number, number] => {
  const [ux, uy] = applyToPoint(matrix, x, y);
  return [placement.offsetX + ux * placement.scale, placement.pageHeight - (placement.offsetY + uy * placement.scale)];
};

const drawShape = (page: PDFPage, placement: Placement, shape: DrawShape): void => {
  const fillColor = shape.open ? undefined : parseColor(shape.style.fill);
  const strokeColor = parseColor(shape.style.stroke);
  if (!fillColor && !strokeColor) return;
  if (shape.segments.length === 0) return;

  const operators = [pushGraphicsState(), setLineWidth(Math.max(0.1, shape.style.strokeWidth * scaleOf(shape.matrix) * placement.scale)), setLineCap(LineCapStyle.Round), setLineJoin(LineJoinStyle.Round)];
  if (fillColor) operators.push(setFillingRgbColor(...fillColor));
  if (strokeColor) operators.push(setStrokingRgbColor(...strokeColor));
  for (const segment of shape.segments) {
    if (segment.kind === 'M') operators.push(moveTo(...toPage(placement, shape.matrix, segment.x, segment.y)));
    else if (segment.kind === 'L') operators.push(lineTo(...toPage(placement, shape.matrix, segment.x, segment.y)));
    else if (segment.kind === 'C') {
      operators.push(appendBezierCurve(...toPage(placement, shape.matrix, segment.x1, segment.y1), ...toPage(placement, shape.matrix, segment.x2, segment.y2), ...toPage(placement, shape.matrix, segment.x, segment.y)));
    } else operators.push(closePath());
  }
  // A filled open path (a gate outline that was not closed) is closed implicitly by the PDF fill operator; a stroked-only
  // open path must stay open, which is why the operator depends on what the element asks for.
  operators.push(fillColor && strokeColor ? fillAndStroke() : fillColor ? fill() : stroke());
  operators.push(popGraphicsState());
  page.pushOperators(...operators);
};

const drawText = (page: PDFPage, placement: Placement, item: DrawText, regular: PDFFont, bold: PDFFont, supported: ReadonlySet<number>): void => {
  const color = parseColor(item.style.fill);
  if (!color) return;
  const font = item.style.bold ? bold : regular;
  const text = pdfSafeText(item.text.trim(), supported);
  if (text === '') return;
  const size = item.style.fontSize * scaleOf(item.matrix) * placement.scale;
  if (!(size > 0)) return;

  // The direction the text runs. A mirrored transform (the exporter uses scale(-1,1) to keep captions readable on
  // flipped parts) would print backwards, so the direction is turned around instead.
  const [a, b, c, d] = item.matrix;
  const mirrored = a * d - b * c < 0;
  const angle = Math.atan2(mirrored ? -b : b, mirrored ? -a : a);
  const width = font.widthOfTextAtSize(text, size);
  const shift = item.style.anchor === 'middle' ? width / 2 : item.style.anchor === 'end' ? width : 0;

  const [x, y] = toPage(placement, item.matrix, item.x, item.y);
  // On the page the y axis points up, so a clockwise SVG rotation is a negative PDF rotation.
  const pdfAngle = -angle;
  page.drawText(text, {
    x: x - Math.cos(pdfAngle) * shift,
    y: y - Math.sin(pdfAngle) * shift,
    size,
    font,
    color: rgb(color[0], color[1], color[2]),
    rotate: degrees((pdfAngle * 180) / Math.PI),
  });
};

/**
 * Renders the circuit as a single-page PDF.
 *
 * @param document The circuit to draw; its metadata fills the title block and the PDF's document properties.
 * @param options Paper size, orientation and the date written into the file.
 * @returns The PDF file's bytes.
 * @throws {Error} When the drawing has no usable size (a corrupted document).
 * @example
 * const bytes = await exportSchematicPdf(document, { paper: 'a4' });
 */
export const exportSchematicPdf = async (document: LogicDocument, options: PdfExportOptions = {}): Promise<Uint8Array> => {
  const svg = parseSvg(renderSchematicSvg(document, { designators: true, netLabels: true, sheet: true }));
  const sheetWidth = Number(svg.attrs.width);
  const sheetHeight = Number(svg.attrs.height);
  if (!(sheetWidth > 0) || !(sheetHeight > 0)) throw new Error('The schematic has no size to draw.');

  const [pageWidth, pageHeight] = pageSizeFor(options.paper ?? 'a4', options.orientation ?? 'auto', sheetWidth, sheetHeight);
  const placement = placeSheet(pageWidth, pageHeight, sheetWidth, sheetHeight);

  // `updateMetadata: false` keeps pdf-lib from stamping its own producer and today's date over the ones set below.
  const pdf = await PDFDocument.create({ updateMetadata: false });
  const page = pdf.addPage([pageWidth, pageHeight]);
  const regular = await pdf.embedFont(StandardFonts.Courier);
  const bold = await pdf.embedFont(StandardFonts.CourierBold);
  const supported = new Set(regular.getCharacterSet());

  for (const item of collectDrawItems(svg)) {
    if (item.kind === 'shape') drawShape(page, placement, item.shape);
    else drawText(page, placement, item.text, regular, bold, supported);
  }

  const meta = document.metadata;
  const date = options.date ?? new Date();
  pdf.setTitle(meta.title || 'Untitled circuit');
  pdf.setAuthor(meta.author || 'Unknown');
  pdf.setSubject(meta.description || 'Digital logic schematic');
  pdf.setKeywords([...meta.tags]);
  pdf.setCreator('InMo Tools Digital Logic Workstation');
  pdf.setProducer('InMo Tools');
  pdf.setCreationDate(date);
  pdf.setModificationDate(date);
  return pdf.save();
};

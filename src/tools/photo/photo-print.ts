import { PageSizes } from 'pdf-lib';

/** Print planning: paper sizes, print-size ↔ pixel-density arithmetic, and contact-sheet layout.
 * Paper dimensions come from pdf-lib's `PageSizes` (PostScript points, 72 per inch), which encode
 * ISO 216 A-series and North American sizes; photo print sizes are the usual inch formats. */

export const POINTS_PER_INCH = 72;
export const MM_PER_INCH = 25.4;

export interface PhotoPaperSize {
  id: string;
  label: string;
  /** Portrait width and height in points. */
  width: number;
  height: number;
}

export const PHOTO_PAPER_SIZES: PhotoPaperSize[] = [
  { id: '4x6', label: '4 × 6 in photo', width: 4 * POINTS_PER_INCH, height: 6 * POINTS_PER_INCH },
  { id: '5x7', label: '5 × 7 in photo', width: 5 * POINTS_PER_INCH, height: 7 * POINTS_PER_INCH },
  { id: '8x10', label: '8 × 10 in photo', width: 8 * POINTS_PER_INCH, height: 10 * POINTS_PER_INCH },
  { id: 'A5', label: 'A5 · 148 × 210 mm', width: PageSizes.A5[0], height: PageSizes.A5[1] },
  { id: 'A4', label: 'A4 · 210 × 297 mm', width: PageSizes.A4[0], height: PageSizes.A4[1] },
  { id: 'A3', label: 'A3 · 297 × 420 mm', width: PageSizes.A3[0], height: PageSizes.A3[1] },
  { id: 'Letter', label: 'US Letter · 8.5 × 11 in', width: PageSizes.Letter[0], height: PageSizes.Letter[1] },
  { id: 'Legal', label: 'US Legal · 8.5 × 14 in', width: PageSizes.Legal[0], height: PageSizes.Legal[1] },
  { id: 'Tabloid', label: 'Tabloid · 11 × 17 in', width: PageSizes.Tabloid[0], height: PageSizes.Tabloid[1] },
];

export function paperById(id: string): PhotoPaperSize {
  return PHOTO_PAPER_SIZES.find((paper) => paper.id === id) ?? PHOTO_PAPER_SIZES.find((paper) => paper.id === 'A4')!;
}

export type PrintUnit = 'in' | 'cm';

export function toInches(value: number, unit: PrintUnit): number {
  return unit === 'in' ? value : value / 2.54;
}

export function fromInches(value: number, unit: PrintUnit): number {
  return unit === 'in' ? value : value * 2.54;
}

export type PrintQuality = 'excellent' | 'good' | 'fair' | 'low';

/** Guidance bands for viewing a print at arm's length. These are working conventions, not a
 * standard: 300 ppi is the common target for close viewing; larger prints seen from further away
 * look fine at lower densities. */
export function printQuality(ppi: number): { level: PrintQuality; advice: string } {
  if (ppi >= 300) return { level: 'excellent', advice: 'Sharp even when inspected up close.' };
  if (ppi >= 200) return { level: 'good', advice: 'Looks sharp at normal viewing distance.' };
  if (ppi >= 150) return { level: 'fair', advice: 'Fine from a step back; soft if viewed closely.' };
  return { level: 'low', advice: 'Likely to look soft or pixelated. Print smaller or use a larger original.' };
}

export interface PrintFit {
  /** Printed image size in inches when fitted inside the target area without cropping. */
  widthIn: number;
  heightIn: number;
  /** Resulting pixel density. */
  ppi: number;
  rotated: boolean;
}

/** Fits a `pixelWidth × pixelHeight` photo inside a `areaWidthIn × areaHeightIn` print area,
 * turning the photo 90° when that fills the area better, and reports the resulting density. */
export function fitPrint(pixelWidth: number, pixelHeight: number, areaWidthIn: number, areaHeightIn: number): PrintFit {
  if (!(pixelWidth > 0 && pixelHeight > 0 && areaWidthIn > 0 && areaHeightIn > 0)) throw new Error('Print sizes must be positive.');
  const fit = (w: number, h: number) => {
    const scale = Math.min(areaWidthIn / w, areaHeightIn / h);
    return { widthIn: w * scale, heightIn: h * scale, ppi: 1 / scale };
  };
  const upright = fit(pixelWidth, pixelHeight);
  const turned = fit(pixelHeight, pixelWidth);
  // A smaller ppi means a larger print; choose the orientation that uses more of the paper.
  return turned.ppi < upright.ppi - 1e-9 ? { ...turned, rotated: true } : { ...upright, rotated: false };
}

/** Largest print (inches) at a chosen density. */
export function printSizeAt(pixelWidth: number, pixelHeight: number, ppi: number): { widthIn: number; heightIn: number } {
  if (!(ppi > 0)) throw new Error('Pixels per inch must be positive.');
  return { widthIn: pixelWidth / ppi, heightIn: pixelHeight / ppi };
}

/** Pixel dimensions needed to print `widthIn × heightIn` at `ppi` (for choosing an export size). */
export function pixelsForPrint(widthIn: number, heightIn: number, ppi: number): { width: number; height: number } {
  return { width: Math.round(widthIn * ppi), height: Math.round(heightIn * ppi) };
}

// --- Contact sheet layout (capability 147) ---

export interface ContactSheetOptions {
  pageWidth: number;
  pageHeight: number;
  /** All lengths in points. */
  margin: number;
  gap: number;
  columns: number;
  /** Space reserved above the grid for the sheet title (0 for none). */
  header: number;
  /** Height of the caption strip under each thumbnail (0 for none). */
  caption: number;
}

export interface ContactSheetRect { x: number; y: number; width: number; height: number }

export interface ContactSheetCell {
  index: number;
  cell: ContactSheetRect;
  image: ContactSheetRect;
  caption: ContactSheetRect | null;
}

export interface ContactSheetPage { cells: ContactSheetCell[] }

/** Lays `aspects.length` thumbnails (width/height ratios) into pages of square image boxes plus an
 * optional caption strip, left to right and top to bottom. Each image is fitted inside its box
 * without cropping and centred, so every photo is shown whole. */
export function layoutContactSheet(aspects: number[], options: ContactSheetOptions): ContactSheetPage[] {
  const columns = Math.round(Math.min(12, Math.max(1, options.columns)));
  const usableWidth = options.pageWidth - options.margin * 2;
  const usableHeight = options.pageHeight - options.margin * 2 - options.header;
  const cellWidth = (usableWidth - options.gap * (columns - 1)) / columns;
  const cellHeight = cellWidth + options.caption;
  if (!(cellWidth > 4) || !(usableHeight >= cellHeight)) throw new Error('These margins and columns leave no room for thumbnails. Use fewer columns or smaller margins.');
  const rows = Math.max(1, Math.floor((usableHeight + options.gap) / (cellHeight + options.gap)));
  const perPage = rows * columns;
  const pages: ContactSheetPage[] = [];
  aspects.forEach((rawAspect, index) => {
    const aspect = Number.isFinite(rawAspect) && rawAspect > 0 ? rawAspect : 1;
    const pageIndex = Math.floor(index / perPage);
    const slot = index % perPage;
    const row = Math.floor(slot / columns);
    const column = slot % columns;
    pages[pageIndex] ??= { cells: [] };
    const cell = {
      x: options.margin + column * (cellWidth + options.gap),
      y: options.margin + options.header + row * (cellHeight + options.gap),
      width: cellWidth,
      height: cellHeight,
    };
    const imageWidth = aspect >= 1 ? cellWidth : cellWidth * aspect;
    const imageHeight = aspect >= 1 ? cellWidth / aspect : cellWidth;
    pages[pageIndex].cells.push({
      index,
      cell,
      image: { x: cell.x + (cellWidth - imageWidth) / 2, y: cell.y + (cellWidth - imageHeight) / 2, width: imageWidth, height: imageHeight },
      caption: options.caption > 0 ? { x: cell.x, y: cell.y + cellWidth, width: cellWidth, height: options.caption } : null,
    });
  });
  return pages;
}

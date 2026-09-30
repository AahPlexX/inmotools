import { describe, expect, test } from 'vitest';
import {
  MM_PER_INCH,
  POINTS_PER_INCH,
  fitPrint,
  fromInches,
  layoutContactSheet,
  paperById,
  pixelsForPrint,
  printQuality,
  printSizeAt,
  toInches,
} from '../../src/tools/photo/photo-print';

describe('paper sizes', () => {
  test('A4 is 210 × 297 mm and Letter is 8.5 × 11 in', () => {
    const a4 = paperById('A4');
    expect((a4.width / POINTS_PER_INCH) * MM_PER_INCH).toBeCloseTo(210, 1);
    expect((a4.height / POINTS_PER_INCH) * MM_PER_INCH).toBeCloseTo(297, 1);
    const letter = paperById('Letter');
    expect([letter.width / POINTS_PER_INCH, letter.height / POINTS_PER_INCH]).toEqual([8.5, 11]);
    expect(paperById('does-not-exist').id).toBe('A4');
  });

  test('unit conversion', () => {
    expect(toInches(25.4, 'cm')).toBeCloseTo(10, 9);
    expect(fromInches(2, 'cm')).toBeCloseTo(5.08, 9);
  });
});

describe('print arithmetic', () => {
  test('a 6000 × 4000 photo on 8 × 10 in paper turns sideways and prints at 600 ppi', () => {
    // Upright: min(8/6000, 10/4000) in/px → 750 ppi. Turned: min(8/4000, 10/6000) → 600 ppi, the larger print.
    const fit = fitPrint(6000, 4000, 8, 10);
    expect(fit.rotated).toBe(true);
    expect(fit.ppi).toBeCloseTo(600, 6);
    expect(fit.widthIn).toBeCloseTo(4000 / 600, 6);
    expect(fit.heightIn).toBeCloseTo(10, 6);
  });

  test('size at a density and pixels for a print size', () => {
    expect(printSizeAt(3000, 2000, 300)).toEqual({ widthIn: 10, heightIn: 2000 / 300 });
    expect(pixelsForPrint(6, 4, 300)).toEqual({ width: 1800, height: 1200 });
    expect(() => printSizeAt(10, 10, 0)).toThrow(/positive/);
    expect(() => fitPrint(0, 10, 1, 1)).toThrow(/positive/);
  });

  test('quality guidance bands', () => {
    expect(printQuality(320).level).toBe('excellent');
    expect(printQuality(240).level).toBe('good');
    expect(printQuality(160).level).toBe('fair');
    expect(printQuality(90).level).toBe('low');
  });
});

describe('contact sheet layout', () => {
  const options = { pageWidth: 600, pageHeight: 800, margin: 50, gap: 10, columns: 4, header: 40, caption: 20 };

  test('fills rows left to right, paginates, and fits each photo whole inside its square box', () => {
    // Usable 500 × 660; cell 117.5 wide, 137.5 tall → floor(670 / 147.5) = 4 rows → 16 per page.
    const pages = layoutContactSheet(new Array(18).fill(1.5), options);
    expect(pages.map((page) => page.cells.length)).toEqual([16, 2]);
    const first = pages[0].cells[0];
    expect(first.cell).toEqual({ x: 50, y: 90, width: 117.5, height: 137.5 });
    expect(first.image.width).toBeCloseTo(117.5, 9);
    expect(first.image.height).toBeCloseTo(117.5 / 1.5, 9);
    expect(first.image.y).toBeCloseTo(90 + (117.5 - 117.5 / 1.5) / 2, 9);
    expect(first.caption).toEqual({ x: 50, y: 207.5, width: 117.5, height: 20 });
    expect(pages[0].cells[5].cell.x).toBeCloseTo(50 + 127.5, 9); // Second row, second column.
    expect(pages[1].cells[0].index).toBe(16);
  });

  test('portrait photos are fitted by height and impossible layouts are refused', () => {
    const [page] = layoutContactSheet([0.5], { ...options, caption: 0 });
    expect(page.cells[0].image.height).toBeCloseTo(117.5, 9);
    expect(page.cells[0].image.width).toBeCloseTo(58.75, 9);
    expect(page.cells[0].caption).toBeNull();
    expect(() => layoutContactSheet([1], { ...options, margin: 290 })).toThrow(/no room/);
  });
});

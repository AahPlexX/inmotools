import { describe, expect, it } from 'vitest';
import { createStarterKnittingDocument, setKnittingConstruction } from '../../src/tools/fiber-craft/knitting-document-engine';
import { addKnittingYarnColor, analyzeKnittingFloats, paintKnittingColor, setKnittingFloatThreshold } from '../../src/tools/fiber-craft/knitting-float-engine';
import { isRestorableFiberCraftDocument } from '../../src/tools/fiber-craft/persistence-engine';

const paintRow = (colors: readonly (string | null)[]) => colors.reduce(
  (document, colorId, col) => paintKnittingColor(document, 0, col, colorId),
  createStarterKnittingDocument(),
);

describe('FC-46 stranded and intarsia float analysis', () => {
  it('flags only complete color gaps longer than the project threshold', () => {
    const chart = paintRow(['primary', 'accent', 'accent', 'accent', 'accent', 'accent', 'accent', 'primary']);
    const warnings = analyzeKnittingFloats(chart, 5);
    expect(warnings).toMatchObject([{ row: 0, colorId: 'primary', fromCol: 7, toCol: 0, stitchesBetween: 6, direction: 'right-to-left' }]);
    expect(analyzeKnittingFloats(chart, 6)).toEqual([]);
    expect(analyzeKnittingFloats(paintRow(['primary', null, 'accent', 'accent', 'primary']), 2)).toEqual([]);
  });

  it('preserves stitch symbols, validates palette and threshold, and handles flat wrong-side reading', () => {
    let document = createStarterKnittingDocument();
    document = paintKnittingColor(document, 1, 0, 'primary');
    document = paintKnittingColor(document, 1, 1, 'accent');
    document = paintKnittingColor(document, 1, 2, 'accent');
    document = paintKnittingColor(document, 1, 3, 'primary');
    document = setKnittingFloatThreshold(document, 2);
    expect(setKnittingConstruction(document, 'round').settings?.knitting?.floatThreshold).toBe(2);
    expect(analyzeKnittingFloats(document, 1)[0]).toMatchObject({ row: 1, fromCol: 0, toCol: 3, stitchesBetween: 2, direction: 'left-to-right' });
    expect(isRestorableFiberCraftDocument(document)).toBe(true);
    expect(() => paintKnittingColor(document, 0, 0, 'missing')).toThrow();
    expect(() => setKnittingFloatThreshold(document, 0)).toThrow();
    expect(() => setKnittingFloatThreshold(document, 1.5)).toThrow();
  });

  it('adds a unique local yarn color to a one-color project', () => {
    const starter = createStarterKnittingDocument();
    const single = { ...starter, palette: [starter.palette[0]] };
    const added = addKnittingYarnColor(single, ' Berry ', '#ab1234');
    expect(added.palette).toHaveLength(2);
    expect(added.palette[1]).toMatchObject({ id: 'yarn-1', label: 'Berry', hex: '#ab1234' });
    expect(isRestorableFiberCraftDocument(added)).toBe(true);
    expect(() => addKnittingYarnColor(single, '', '#ab1234')).toThrow();
    expect(() => addKnittingYarnColor(single, 'Berry', 'not-a-color')).toThrow();
  });
});

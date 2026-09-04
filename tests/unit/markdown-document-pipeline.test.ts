import { describe, expect, it } from 'vitest';
import { prepareDocument, toFilenameStem } from '../../src/tools/markdown/document-pipeline';

describe('prepareDocument', () => {
  it('evaluates table formulas', () => {
    const source = [
      '| Item | Qty | Price | Total |',
      '| - | - | - | - |',
      '| Widgets | 4 | 2.5 | =B2*C2 |',
    ].join('\n');
    expect(prepareDocument(source)).toContain('| Widgets | 4 | 2.5 | 10 |');
  });

  it('substitutes in-text citations when a formatted map is supplied', () => {
    const result = prepareDocument('See [@smith2024].', new Map([['smith2024', '(Smith, 2024)']]));
    expect(result).toBe('See (Smith, 2024).');
  });

  it('leaves the document untouched when no citations are supplied', () => {
    expect(prepareDocument('See [@smith2024].')).toBe('See [@smith2024].');
  });

  it('applies both transformations together', () => {
    const source = [
      'Per [@smith2024]:',
      '',
      '| A | B |',
      '| - | - |',
      '| 2 | =A2*3 |',
    ].join('\n');
    const result = prepareDocument(source, new Map([['smith2024', '(Smith, 2024)']]));
    expect(result).toContain('Per (Smith, 2024):');
    expect(result).toContain('| 2 | 6 |');
  });
});

describe('toFilenameStem', () => {
  it('slugifies a plain document title', () => {
    expect(toFilenameStem('Quarterly Report')).toBe('Quarterly-Report');
  });

  it('strips characters that are not valid in a filename', () => {
    expect(toFilenameStem('Report: Q1/Q2 <draft>')).toBe('Report-Q1Q2-draft');
  });

  it('falls back to "document" for an empty or punctuation-only name', () => {
    expect(toFilenameStem('')).toBe('document');
    expect(toFilenameStem('   ')).toBe('document');
    expect(toFilenameStem('...')).toBe('document');
  });

  it('never produces a leading dot that would create a hidden file', () => {
    expect(toFilenameStem('.hidden')).toBe('hidden');
  });
});

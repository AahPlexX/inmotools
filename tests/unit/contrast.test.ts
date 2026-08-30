import { describe, expect, it } from 'vitest';
import { buildContrastMatrix, parseTokenLines, wcagContrast } from '../../src/tools/contrast/contrast-engine';

const source = `
--ink: #111111;
accent: rgb(32 91 214);
soft = hsl(220 100% 96%);
perceptual: oklch(62% 0.18 255);
bad: definitely-not-a-color;
`;

describe('APCA / OKLCH contrast engine', () => {
  it('parses CSS color tokens while reporting invalid source lines', () => {
    const result = parseTokenLines(source);
    expect(result.tokens.map((token) => token.name)).toEqual(['--ink', 'accent', 'soft', 'perceptual']);
    expect(result.tokens.every((token) => /^#[0-9a-f]{6}$/i.test(token.hex))).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatchObject({ line: 6 });
    expect(result.errors[0].source).toContain('definitely-not-a-color');
  });

  it('builds a directional N² matrix with APCA guidance and conventional WCAG values', () => {
    const parsed = parseTokenLines('--black: #000;\n--white: #fff;\n--red: #c00;');
    const cells = buildContrastMatrix(parsed.tokens, 'body');
    expect(cells).toHaveLength(9);
    const same = cells.find((cell) => cell.foreground.name === '--black' && cell.background.name === '--black');
    expect(Math.abs(same?.apcaLc ?? 99)).toBeLessThan(0.01);
    expect(same?.guidanceLabel).toMatch(/APCA/i);
    const forward = cells.find((cell) => cell.foreground.name === '--black' && cell.background.name === '--white');
    const reverse = cells.find((cell) => cell.foreground.name === '--white' && cell.background.name === '--black');
    expect(forward?.apcaLc).not.toBe(reverse?.apcaLc);
    expect(forward?.wcag).toBeCloseTo(21, 6);
  });

  it('computes the conventional WCAG 2 contrast ratio independently of APCA', () => {
    expect(wcagContrast('#000000', '#ffffff')).toBeCloseTo(21, 6);
    expect(wcagContrast('#ffffff', '#000000')).toBeCloseTo(21, 6);
    expect(wcagContrast('#777777', '#777777')).toBeCloseTo(1, 6);
  });
});

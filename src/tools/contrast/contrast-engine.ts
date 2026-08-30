import { calcAPCA } from 'apca-w3';
import { converter, formatHex, parse } from 'culori';

export type ContrastRole = 'body' | 'large' | 'ui';

export type ColorToken = {
  name: string;
  source: string;
  hex: string;
};

export type ColorTokenError = {
  line: number;
  source: string;
  message: string;
};

export type ColorTokenParseResult = {
  tokens: ColorToken[];
  errors: ColorTokenError[];
};

export type ContrastCell = {
  foreground: ColorToken;
  background: ColorToken;
  apcaLc: number;
  wcag: number;
  guidanceLabel: string;
};

const APCA_GUIDANCE: Record<ContrastRole, { minimumLc: number; label: string }> = {
  body: { minimumLc: 75, label: 'body text' },
  large: { minimumLc: 60, label: 'large text' },
  ui: { minimumLc: 45, label: 'UI graphics/text' },
};

const toRgb = converter('rgb');

function normalizeHex(value: string): string | null {
  const parsed = parse(value.trim());
  if (!parsed) return null;
  try {
    const hex = formatHex(parsed);
    return /^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : null;
  } catch {
    return null;
  }
}

export function parseTokenLines(text: string): ColorTokenParseResult {
  const tokens: ColorToken[] = [];
  const errors: ColorTokenError[] = [];

  text.split(/\r?\n/).forEach((rawLine, index) => {
    const source = rawLine.trim();
    if (!source || source.startsWith('# ')) return;

    const withoutSemicolon = source.endsWith(';') ? source.slice(0, -1).trim() : source;
    const separator = withoutSemicolon.match(/^(.+?)\s*([:=])\s*(.+)$/);
    if (!separator) {
      errors.push({ line: index + 1, source, message: 'Expected a token name followed by : or = and a CSS color.' });
      return;
    }

    const name = separator[1].trim();
    const colorSource = separator[3].trim();
    const hex = normalizeHex(colorSource);
    if (!name || !hex) {
      errors.push({ line: index + 1, source, message: 'Invalid CSS color token.' });
      return;
    }

    tokens.push({ name, source: colorSource, hex });
  });

  return { tokens, errors };
}

function linearize(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: string): number {
  const parsed = parse(color);
  const rgb = parsed ? toRgb(parsed) : undefined;
  if (!rgb || !Number.isFinite(rgb.r) || !Number.isFinite(rgb.g) || !Number.isFinite(rgb.b)) {
    throw new Error(`Invalid CSS color: ${color}`);
  }
  return 0.2126 * linearize(rgb.r) + 0.7152 * linearize(rgb.g) + 0.0722 * linearize(rgb.b);
}

export function wcagContrast(foreground: string, background: string): number {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return (lighter + 0.05) / (darker + 0.05);
}

function apcaContrast(foreground: string, background: string): number {
  const value = Number(calcAPCA(foreground, background));
  return Number.isFinite(value) ? value : 0;
}

export function buildContrastMatrix(tokens: ColorToken[], role: ContrastRole): ContrastCell[] {
  const guidance = APCA_GUIDANCE[role];
  const cells: ContrastCell[] = [];

  for (const foreground of tokens) {
    for (const background of tokens) {
      const apcaLc = apcaContrast(foreground.hex, background.hex);
      const passesGuidance = Math.abs(apcaLc) >= guidance.minimumLc;
      cells.push({
        foreground,
        background,
        apcaLc,
        wcag: wcagContrast(foreground.hex, background.hex),
        guidanceLabel: passesGuidance
          ? `APCA guidance: meets selected ${guidance.label} target (|Lc| ≥ ${guidance.minimumLc}).`
          : `APCA guidance: below selected ${guidance.label} target (|Lc| < ${guidance.minimumLc}).`,
      });
    }
  }

  return cells;
}

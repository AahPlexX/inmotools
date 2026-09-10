import { optimize } from 'svgo/browser';

export interface SvgSource { name: string; text: string }
export interface SvgCompileOptions { currentColor?: boolean }
export interface SvgCompiledFile {
  name: string;
  id: string;
  symbol: string;
  originalBytes: number;
  optimizedBytes: number;
}
export interface SvgCompileError { name: string; message: string }
export interface SvgCompileWarning { name: string; message: string }
export interface SvgCompileResult {
  sprite: string;
  files: SvgCompiledFile[];
  errors: SvgCompileError[];
  warnings: SvgCompileWarning[];
}

function slugify(name: string): string {
  return name.replace(/\.svg$/i, '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'icon';
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function allocateUniqueId(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) suffix += 1;
  const candidate = `${base}-${suffix}`;
  used.add(candidate);
  return candidate;
}

const PRESERVED_PAINT_KEYWORDS = new Set([
  'none',
  'currentcolor',
  'transparent',
  'context-fill',
  'context-stroke',
  'inherit',
  'initial',
  'revert',
  'revert-layer',
  'unset',
]);

function isNonLiteralPaint(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return PRESERVED_PAINT_KEYWORDS.has(normalized)
    || normalized.startsWith('url(')
    || normalized.startsWith('var(')
    || normalized.startsWith('env(');
}

function normalizeCurrentColor(svg: string): string {
  const withAttributes = svg.replace(/\s(?:fill|stroke)=(['"])([^'"]+)\1/gi, (match, _quote: string, rawValue: string) => {
    if (isNonLiteralPaint(rawValue)) return match;
    return match.replace(/=(['"])[^'"]+\1/, '="currentColor"');
  });

  return withAttributes.replace(/\sstyle=(['"])([^'"]*)\1/gi, (match, quote: string, body: string) => {
    const rewritten = body.replace(
      /(^|;)\s*(fill|stroke)\s*:\s*([^;]+)/gi,
      (declaration, prefix: string, property: string, value: string) => {
        if (isNonLiteralPaint(value)) return declaration;
        return `${prefix}${property}:currentColor`;
      },
    );
    return rewritten === body ? match : ` style=${quote}${rewritten}${quote}`;
  });
}

interface ViewBoxResolution {
  value?: string;
  warning?: string;
}

function deriveViewBox(attributes: string): ViewBoxResolution {
  const explicit = /viewBox=(['"])(.*?)\1/i.exec(attributes)?.[2];
  if (explicit) return { value: explicit };

  const dimension = (name: 'width' | 'height'): number | undefined => {
    const raw = new RegExp(`\\s${name}=(['"])([^'"]+)\\1`, 'i').exec(attributes)?.[2]?.trim();
    if (!raw) return undefined;
    const match = /^(\d*\.?\d+)(px)?$/i.exec(raw);
    if (!match) return undefined;
    const value = Number(match[1]);
    return Number.isFinite(value) && value > 0 ? value : undefined;
  };

  const width = dimension('width');
  const height = dimension('height');
  if (width !== undefined && height !== undefined) return { value: `0 0 ${width} ${height}` };
  return { warning: 'No explicit viewBox was present and width/height could not safely define one. The symbol was compiled without a guessed viewBox; add an explicit numeric viewBox to make scaling predictable.' };
}

const ROOT_ATTRS_TO_PRESERVE = new Set([
  'class', 'style', 'fill', 'stroke', 'color', 'opacity', 'fill-opacity', 'stroke-opacity',
  'fill-rule', 'clip-rule', 'clip-path', 'stroke-width', 'stroke-linecap', 'stroke-linejoin',
  'stroke-miterlimit', 'stroke-dasharray', 'stroke-dashoffset', 'paint-order', 'vector-effect',
  'shape-rendering', 'color-interpolation', 'color-interpolation-filters', 'color-rendering',
  'image-rendering', 'text-rendering', 'transform', 'transform-origin', 'overflow',
]);

function preservedRootAttributes(attributes: string): string {
  const kept: string[] = [];
  const attributePattern = /\s([:\w-]+)=(['"])(.*?)\2/g;
  for (const match of attributes.matchAll(attributePattern)) {
    if (ROOT_ATTRS_TO_PRESERVE.has(match[1].toLowerCase())) kept.push(`${match[1]}=${match[2]}${match[3]}${match[2]}`);
  }
  return kept.length ? ` ${kept.join(' ')}` : '';
}

function buildInternalIdMapping(markup: string, symbolId: string): Map<string, string> {
  const rawIds = Array.from(markup.matchAll(/\sid=(['"])([^'"]+)\1/gi), (match) => match[2]);
  const used = new Set<string>();
  const mapping = new Map<string, string>();
  for (const rawId of rawIds) {
    if (mapping.has(rawId)) continue;
    const base = `${symbolId}--${slugify(rawId)}`;
    mapping.set(rawId, allocateUniqueId(base, used));
  }
  return mapping;
}

function rewriteInternalIdReferences(markup: string, mapping: ReadonlyMap<string, string>): string {
  let rewritten = markup;
  for (const [rawId, nextId] of mapping) {
    const escaped = escapeRegExp(rawId);
    rewritten = rewritten.replace(new RegExp(`(\\sid=(['"]))${escaped}\\2`, 'g'), `$1${nextId}$2`);
    rewritten = rewritten.replace(new RegExp(`url\\(\\s*#${escaped}\\s*\\)`, 'g'), `url(#${nextId})`);
    rewritten = rewritten.replace(new RegExp(`((?:href|xlink:href)=(['"]))#${escaped}\\2`, 'g'), `$1#${nextId}$2`);
    rewritten = rewritten.replace(new RegExp(`((?:begin|end)=(['"])[^'"]*)\\b${escaped}(?=\\.)`, 'g'), `$1${nextId}`);
  }
  return rewritten;
}

export function compileSvgSprite(sources: SvgSource[], options: SvgCompileOptions = {}): SvgCompileResult {
  const symbolIds = new Set<string>();
  const files: SvgCompiledFile[] = [];
  const errors: SvgCompileError[] = [];
  const warnings: SvgCompileWarning[] = [];

  for (const source of sources) {
    try {
      const result = optimize(source.text, {
        multipass: true,
        plugins: ['preset-default', 'removeScripts'],
      });
      const optimized = result.data;
      const normalized = options.currentColor ? normalizeCurrentColor(optimized) : optimized;
      const svgMatch = normalized.match(/<svg\b([^>]*)>([\s\S]*?)<\/svg>/i);
      if (!svgMatch) throw new Error('Not a valid SVG document.');

      const id = allocateUniqueId(slugify(source.name), symbolIds);
      const viewBox = deriveViewBox(svgMatch[1]);
      if (viewBox.warning) warnings.push({ name: source.name, message: viewBox.warning });
      const idMapping = buildInternalIdMapping(svgMatch[2], id);
      const rootAttributes = rewriteInternalIdReferences(preservedRootAttributes(svgMatch[1]), idMapping);
      const content = rewriteInternalIdReferences(svgMatch[2], idMapping);
      const symbol = `<symbol id="${id}"${viewBox.value ? ` viewBox="${viewBox.value}"` : ''}${rootAttributes}>${content}</symbol>`;
      files.push({
        name: source.name,
        id,
        symbol,
        originalBytes: new TextEncoder().encode(source.text).byteLength,
        optimizedBytes: new TextEncoder().encode(optimized).byteLength,
      });
    } catch (error) {
      errors.push({ name: source.name, message: error instanceof Error ? error.message : 'Unknown SVG compile error.' });
    }
  }

  return {
    sprite: `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${files.map((file) => file.symbol).join('')}</svg>`,
    files,
    errors,
    warnings,
  };
}
